"use client";
/* eslint-disable react-hooks/set-state-in-effect -- external Telegram/theme state is initialized after browser hydration */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState } from "@/lib/types";
import { ERRORS } from "@/lib/copy";
import { Icon } from "@/components/icon";

type ThemeMode = "light" | "dark" | "system";

type Toast = { id: number; text: string; tone: "success" | "error" | "info" };

type FinanceContextValue = {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: (
    entity: string,
    action: string,
    data?: Record<string, unknown>,
    options?: { silent?: boolean; settings?: Record<string, unknown> },
  ) => Promise<{ ok: boolean; message: string }>;
  exportXlsx: () => Promise<{ ok: boolean; message: string }>;
  mutating: boolean;
  toast: (text: string, tone?: Toast["tone"]) => void;
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
  telegram: boolean;
  /** Every amount in the product renders as ***** while this is on. */
  balanceHidden: boolean;
  setBalanceHidden: (hidden: boolean) => void;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

const BALANCE_HIDDEN_STORAGE_KEY = "pfos-balance-hidden";

/**
 * Privacy state for <Money>, read WITHOUT throwing when no provider is present.
 * Money is a leaf primitive used in well over a hundred places, including a few
 * that render before the provider mounts; a hard `useFinance()` there would
 * turn a missing context into a crashed page rather than a visible amount.
 */
export function useBalanceHidden(): boolean {
  return useContext(FinanceContext)?.balanceHidden ?? false;
}

type PendingMutation = { signature: string; key: string; createdAt: number };
const PENDING_MUTATION_STORAGE_KEY = "hisobchi:pending-mutation:v1";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

async function mutationSignature(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readPendingMutation(signature: string): PendingMutation | null {
  try {
    const raw = sessionStorage.getItem(PENDING_MUTATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingMutation>;
    if (
      parsed.signature !== signature ||
      typeof parsed.key !== "string" ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt >= IDEMPOTENCY_TTL_MS
    ) {
      sessionStorage.removeItem(PENDING_MUTATION_STORAGE_KEY);
      return null;
    }
    return { signature, key: parsed.key, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

function persistPendingMutation(pending: PendingMutation | null) {
  try {
    if (pending) sessionStorage.setItem(PENDING_MUTATION_STORAGE_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_MUTATION_STORAGE_KEY);
  } catch {
    // Private-storage restrictions must not disable the in-memory safety guard.
  }
}

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData?: string;
  colorScheme?: string;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: { impactOccurred?: (style: string) => void };
};

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [telegram, setTelegram] = useState(false);
  const [balanceHidden, setBalanceHiddenState] = useState(false);
  const initDataRef = useRef<string | null>(null);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  // One in-flight /api/state request at a time, plus a short burst window:
  // returning from the Telegram chat can fire visibilitychange, focus and
  // pageshow together, and the app must not issue three identical requests.
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const lastLoadRef = useRef(0);

  const load = useCallback(async (options?: { force?: boolean }) => {
    if (loadInFlightRef.current) return loadInFlightRef.current;
    if (!options?.force && Date.now() - lastLoadRef.current < 1200) return;
    const run = (async () => {
      try {
        const headers: Record<string, string> = {};
        if (initDataRef.current) headers["x-telegram-init-data"] = initDataRef.current;
        const res = await fetch("/api/state", { headers, cache: "no-store" });
        if (res.status === 401) {
          setError("auth");
          return;
        }
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as AppState;
        setState(data);
        setError(null);
      } catch {
        setError(ERRORS.load);
      } finally {
        lastLoadRef.current = Date.now();
        loadInFlightRef.current = null;
        setLoading(false);
      }
    })();
    loadInFlightRef.current = run;
    return run;
  }, []);

  const refresh = useCallback(async () => {
    await load({ force: true });
  }, [load]);

  useEffect(() => {
    const stored = (localStorage.getItem("pfos-theme") as ThemeMode | null) ?? "system";
    setThemeState(stored);
    setBalanceHiddenState(localStorage.getItem(BALANCE_HIDDEN_STORAGE_KEY) === "1");
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    if (tg) {
      setTelegram(true);
      try {
        tg.ready();
        tg.expand();
        if (tg.initData) initDataRef.current = tg.initData;
      } catch {
        /* noop */
      }
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    void load({ force: true });
    // Bot ↔ Mini App sync: a transaction confirmed in the Telegram chat must
    // show up — in History AND in the balance — as soon as the user switches
    // back to the Mini App, with no manual reload. Telegram WebViews are not
    // consistent about which signal they emit, so all three are observed and
    // de-duplicated by the loader itself.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const isDark = theme === "system" ? systemDark : theme === "dark";

  useEffect(() => {
    const root = document.documentElement;
    // Dark is the default palette in globals.css, so LIGHT is the opt-in class.
    // `.dark` is kept in sync purely so the `dark:` variant keeps matching.
    root.classList.toggle("light", !isDark);
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    if (tg && bg) {
      tg.setHeaderColor?.(bg);
      tg.setBackgroundColor?.(bg);
    }
  }, [isDark]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem("pfos-theme", mode);
  }, []);

  const setBalanceHidden = useCallback((hidden: boolean) => {
    setBalanceHiddenState(hidden);
    try {
      localStorage.setItem(BALANCE_HIDDEN_STORAGE_KEY, hidden ? "1" : "0");
    } catch {
      // Private-storage restrictions must not break the toggle for this session.
    }
  }, []);

  const inFlightRef = useRef(false);
  // Keep the key for an ambiguous network/5xx result. If the user retries the
  // same operation, reusing this key turns a lost response into a safe replay.
  // Only a SHA-256 body signature + random key enter sessionStorage (never the
  // financial body itself), so a WebView reload preserves retry identity.
  const pendingMutationRef = useRef<PendingMutation | null>(null);
  const mutate = useCallback<FinanceContextValue["mutate"]>(
    async (entity, action, data = {}, options = {}) => {
      if (inFlightRef.current) {
        return { ok: false, message: ERRORS.busy };
      }
      inFlightRef.current = true;
      setMutating(true);
      try {
        const body = JSON.stringify({ entity, action, data, settings: options.settings });
        const signature = await mutationSignature(body);
        const memoryPending = pendingMutationRef.current;
        const previous =
          memoryPending &&
          memoryPending.signature === signature &&
          Date.now() - memoryPending.createdAt < IDEMPOTENCY_TTL_MS
            ? memoryPending
            : readPendingMutation(signature);
        const pending = previous ?? {
          signature,
          key: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        pendingMutationRef.current = pending;
        persistPendingMutation(pending);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.key,
        };
        if (initDataRef.current) headers["x-telegram-init-data"] = initDataRef.current;
        const res = await fetch("/api/mutate", {
          method: "POST",
          headers,
          body,
        });
        const json = (await res.json()) as {
          ok: boolean;
          message?: string;
          state?: AppState;
          code?: string;
        };
        if (json.state) setState(json.state);
        // 5xx and request_in_progress are ambiguous/retriable, so preserve the
        // key. Every definitive success or client/business rejection closes the
        // operation and the next deliberate action receives a fresh key.
        if (res.status < 500 && json.code !== "request_in_progress") {
          pendingMutationRef.current = null;
          persistPendingMutation(null);
        }
        if (!options.silent) toast(json.message ?? (json.ok ? "Saqlandi" : ERRORS.save), json.ok ? "success" : "error");
        return { ok: json.ok, message: json.message ?? "" };
      } catch {
        // Keep pendingMutationRef: the server may have committed before the
        // response was lost. A repeat submit must use the same key.
        toast(ERRORS.connection, "error");
        return { ok: false, message: ERRORS.connection };
      } finally {
        inFlightRef.current = false;
        setMutating(false);
      }
    },
    [toast],
  );

  const exportInFlightRef = useRef(false);
  const exportXlsx = useCallback<FinanceContextValue["exportXlsx"]>(async () => {
    if (exportInFlightRef.current) return { ok: false, message: "Excel fayli tayyorlanmoqda" };
    exportInFlightRef.current = true;
    try {
      const headers: Record<string, string> = {};
      if (initDataRef.current) headers["x-telegram-init-data"] = initDataRef.current;
      const response = await fetch("/api/export/xlsx", { headers, cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = body?.error ?? "Excel faylini tayyorlab bo‘lmadi";
        toast(message, "error");
        return { ok: false, message };
      }
      const blob = await response.blob();
      const filename = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ?? "hisobchi-eksport.xlsx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      const message = "Excel fayli yuklandi";
      toast(message, "success");
      return { ok: true, message };
    } catch {
      toast(ERRORS.connection, "error");
      return { ok: false, message: ERRORS.connection };
    } finally {
      exportInFlightRef.current = false;
    }
  }, [toast]);

  const value = useMemo<FinanceContextValue>(
    () => ({
      state, loading, error, refresh, mutate, exportXlsx, mutating, toast, theme, setTheme, isDark, telegram,
      balanceHidden, setBalanceHidden,
    }),
    [state, loading, error, refresh, mutate, exportXlsx, mutating, toast, theme, setTheme, isDark, telegram, balanceHidden, setBalanceHidden],
  );

  return (
    <FinanceContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[70px] z-[100] flex flex-col items-center gap-2 px-3 sm:top-auto sm:bottom-8 sm:items-end sm:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-pop w-full max-w-sm rounded-2xl border border-line bg-surface px-4 py-2.5 text-[13px] shadow-xl shadow-black/10 sm:text-sm"
            style={{
              borderColor:
                t.tone === "success"
                  ? "var(--positive)"
                  : t.tone === "error"
                    ? "var(--negative)"
                    : "var(--border)",
            }}
          >
            <span className="flex items-center gap-2">
              <Icon name={t.tone === "success" ? "check-circle" : t.tone === "error" ? "ban" : "info"} size={16} />
              {t.text}
            </span>
          </div>
        ))}
      </div>
    </FinanceContext.Provider>
  );
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}

export function useCategoryOptions(type: "income" | "expense") {
  const { state } = useFinance();
  return useMemo(
    () =>
      (state?.flatCategories ?? [])
        .filter((c) => c.type === type && c.isActive)
        // A native <option> cannot hold an SVG, and the icon is now a semantic
        // key rather than a glyph, so the label is the category name alone.
        .map((c) => ({ value: String(c.id), label: c.name })),
    [state?.flatCategories, type],
  );
}
