"use client";

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
  mutating: boolean;
  toast: (text: string, tone?: Toast["tone"]) => void;
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
  telegram: boolean;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

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
  const initDataRef = useRef<string | null>(null);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const load = useCallback(async () => {
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
      setError("Ma'lumotlarni yuklab bo'lmadi. Sahifani yangilang.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem("pfos-theme") as ThemeMode | null) ?? "system";
    setThemeState(stored);
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
    void load();
    return () => mq.removeEventListener("change", onChange);
  }, [load]);

  const isDark = theme === "system" ? systemDark : theme === "dark";

  useEffect(() => {
    const root = document.documentElement;
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

  const mutate = useCallback<FinanceContextValue["mutate"]>(
    async (entity, action, data = {}, options = {}) => {
      setMutating(true);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          // One key per deliberate user action. If the browser/network retries
          // this same HTTP request, the server rejects a duplicate mutation.
          "Idempotency-Key": crypto.randomUUID(),
        };
        if (initDataRef.current) headers["x-telegram-init-data"] = initDataRef.current;
        const res = await fetch("/api/mutate", {
          method: "POST",
          headers,
          body: JSON.stringify({ entity, action, data, settings: options.settings }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          message?: string;
          state?: AppState;
        };
        if (json.state) setState(json.state);
        if (!options.silent) toast(json.message ?? (json.ok ? "Saqlandi" : "Xatolik"), json.ok ? "success" : "error");
        return { ok: json.ok, message: json.message ?? "" };
      } catch {
        toast("Ulanish xatosi", "error");
        return { ok: false, message: "Ulanish xatosi" };
      } finally {
        setMutating(false);
      }
    },
    [toast],
  );

  const value = useMemo<FinanceContextValue>(
    () => ({ state, loading, error, refresh: load, mutate, mutating, toast, theme, setTheme, isDark, telegram }),
    [state, loading, error, load, mutate, mutating, toast, theme, setTheme, isDark, telegram],
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
              {t.tone === "success" ? "✅" : t.tone === "error" ? "⛔" : "ℹ️"}
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
        .map((c) => ({ value: String(c.id), label: `${c.icon} ${c.name}` })),
    [state?.flatCategories, type],
  );
}
