"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Sheet } from "./ui";
import { getFabActions, normalizePath, supportsFab, type FabAction, type FabActionDef, type FabContext } from "@/lib/fab";

/**
 * Global Context-Aware Floating Action Button.
 *
 * ONE FAB → MANY CONTEXTUAL ACTIONS.
 *
 * Architecture (§23/§25): the FAB knows nothing about finance. It only resolves
 * the current route/tab context to typed actions and then either
 *   • invokes the page-registered handler directly (single-action contexts), or
 *   • opens a compact action sheet (multi-action contexts).
 * Pages OWN their sheets and register handlers that open them — the same
 * QuickAddSheet / RecurringSheet / … that already exist. No form is duplicated.
 *
 * Cross-page creates (Menu → "+ Hisob", Analytics → "+ To'lov rejasi") are
 * delivered via `route(path, action)`: the pending action is stored in the
 * provider (which survives navigation because it lives in the shell) and the
 * target page consumes it once on mount to open its own sheet.
 */

type FabHandler = (action: FabActionDef) => void;

type FabControllerValue = {
  /** Page reports its route-specific context (tab / filter). Read lazily. */
  setContext: (ctx: Partial<Omit<FabContext, "pathname">>) => void;
  /** Page registers handlers for the actions it owns. Returns unregister. */
  register: (handlers: Partial<Record<FabAction, FabHandler>>) => () => void;
  /** Current context snapshot (for the FAB at press time). */
  context: () => Partial<Omit<FabContext, "pathname">>;
  /** Run the handler registered for `action` (if any). */
  invoke: (action: FabActionDef) => void;
  /** Navigate to `path` and deliver `action` to the target page on mount. */
  route: (path: string, action: FabActionDef) => void;
  /** Called once by a page on mount to receive a routed action (if any). */
  consume: () => FabActionDef | null;
};

const FabContext = createContext<FabControllerValue | null>(null);

export function useFab(): FabControllerValue {
  const value = useContext(FabContext);
  if (!value) throw new Error("useFab must be used inside <FabProvider>");
  return value;
}

/**
 * Page hook: reports the active context and registers this page's action
 * handlers. Only the mounted page contributes — there is never a conflict
 * between pages and never duplicated route logic in separate components.
 */
export function useFabPage(
  context: Partial<Omit<FabContext, "pathname">>,
  handlers: Partial<Record<FabAction, FabHandler>>,
): void {
  const { register, setContext } = useFab();
  // No dep array: refresh on every render so tab/filter changes are always
  // reflected at FAB press time. Both writes are ref mutations (no re-render).
  useEffect(() => {
    setContext(context);
  });
  useEffect(() => register(handlers));
}

export function FabProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const handlersRef = useRef<Record<string, FabHandler>>({});
  const contextRef = useRef<Partial<Omit<FabContext, "pathname">>>({});
  const pendingRef = useRef<FabActionDef | null>(null);

  const setContext = useCallback((ctx: Partial<Omit<FabContext, "pathname">>) => {
    contextRef.current = ctx ?? {};
  }, []);

  const register = useCallback((handlers: Partial<Record<FabAction, FabHandler>>) => {
    const keys = Object.keys(handlers) as FabAction[];
    for (const key of keys) {
      const handler = handlers[key];
      if (handler) handlersRef.current[key] = handler;
    }
    return () => {
      for (const key of keys) delete handlersRef.current[key];
    };
  }, []);

  const context = useCallback(() => contextRef.current, []);

  const invoke = useCallback((action: FabActionDef) => {
    handlersRef.current[action.id]?.(action);
  }, []);

  const route = useCallback(
    (path: string, action: FabActionDef) => {
      pendingRef.current = action;
      router.push(path);
    },
    [router],
  );

  const consume = useCallback(() => {
    const action = pendingRef.current;
    pendingRef.current = null;
    return action;
  }, []);

  const value = { setContext, register, context, invoke, route, consume };
  return <FabContext.Provider value={value}>{children}</FabContext.Provider>;
}

/**
 * The single floating button + its action sheet. Rendered once in AppShell —
 * never re-created per route.
 */
export function GlobalAddFab() {
  const pathname = usePathname();
  const { context, invoke } = useFab();
  const [open, setOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const [actions, setActions] = useState<FabActionDef[]>([]);
  const busyRef = useRef(false);

  const route = normalizePath(pathname);
  const visible = supportsFab(route);

  // §31/§32: any navigation closes the sheet and drops stale state. After a
  // refresh the FAB is closed and re-resolves from the current route. Uses the
  // "state from previous render" pattern so no effect + setState is needed.
  const [prevRoute, setPrevRoute] = useState(route);
  if (prevRoute !== route) {
    setPrevRoute(route);
    setOpen(false);
    setExplain(false);
  }

  if (!visible) return null;

  function press() {
    // §29: one tap = one sheet. Ignore re-entry while a transition is running.
    if (busyRef.current) return;
    busyRef.current = true;
    window.setTimeout(() => {
      busyRef.current = false;
    }, 200);

    const list = getFabActions({ pathname: route, ...context() });

    if (list.length === 0) {
      // Cash-flow: no misleading create action — explain instead.
      setOpen(false);
      setExplain(true);
      return;
    }
    if (list.length === 1) {
      // Single unambiguous action: open the target sheet directly.
      setOpen(false);
      setExplain(false);
      invoke(list[0]);
      return;
    }
    setActions(list);
    setExplain(false);
    setOpen(true);
  }

  function run(action: FabActionDef) {
    setOpen(false);
    invoke(action);
  }

  return (
    <>
      <button
        type="button"
        onClick={press}
        aria-label="Qo‘shish"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="global-fab grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg shadow-md shadow-black/25 transition-all duration-200 hover:bg-primary-hover active:scale-95 touch-manipulation"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
          className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`}
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Nima qo‘shamiz?">
        <div className="-mx-1.5 space-y-0.5">
          {actions.map((action, i) => (
            <button
              key={`${action.id}-${action.type ?? "default"}-${i}`}
              type="button"
              onClick={() => run(action)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[14px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-3 touch-manipulation"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-base" aria-hidden="true">
                {action.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{action.label}</span>
                {action.description ? (
                  <span className="block truncate text-[11.5px] font-normal text-muted">{action.description}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-muted" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={explain} onClose={() => setExplain(false)} title="Qo‘shish">
        <p className="text-[14px] leading-relaxed">
          Bu bo‘lim faqat tahlil uchun — bu yerda yangi yozuv qo‘shilmaydi.
        </p>
        <p className="text-[13px] leading-relaxed text-muted">
          Qo‘shish uchun <span className="font-semibold text-fg-soft">Reja → To‘lovlar</span> yoki{" "}
          <span className="font-semibold text-fg-soft">Reja → Daromad</span> bo‘limiga o‘ting.
        </p>
      </Sheet>
    </>
  );
}
