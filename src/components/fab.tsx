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
 * The FAB knows nothing about finance. It resolves the current route/tab to a
 * typed action and invokes the page-owned sheet handler. Forms remain owned by
 * their pages; AppShell mounts this control exactly once.
 */

type FabHandler = (action: FabActionDef) => void;
type PageFabContext = Partial<Omit<FabContext, "pathname">>;

type FabControllerValue = {
  /** Page reports its route-specific context (tab / filter). */
  setContext: (ctx: PageFabContext) => void;
  /** Reactive snapshot used for visibility and shell clearance. */
  currentContext: PageFabContext;
  /** Page registers handlers for the actions it owns. Returns unregister. */
  register: (handlers: Partial<Record<FabAction, FabHandler>>) => () => void;
  /** Current context snapshot, read lazily when needed. */
  context: () => PageFabContext;
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

function sameContext(a: PageFabContext, b: PageFabContext): boolean {
  return a.tab === b.tab && a.accountsTab === b.accountsTab;
}

/**
 * Page hook: reports the active context and registers this page's action
 * handlers. Only the mounted page contributes, so route logic and forms are
 * never duplicated in the global control.
 */
export function useFabPage(
  pageContext: PageFabContext,
  handlers: Partial<Record<FabAction, FabHandler>>,
): void {
  const { register, setContext } = useFab();

  // Refresh on every render. setContext performs a shallow equality check, so
  // ordinary page renders remain ref-only while tab changes update FAB
  // visibility and AppShell clearance immediately after commit.
  useEffect(() => {
    setContext(pageContext);
  });
  useEffect(() => register(handlers));
}

export function FabProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const handlersRef = useRef<Record<string, FabHandler>>({});
  const contextRef = useRef<PageFabContext>({});
  const pendingRef = useRef<FabActionDef | null>(null);
  const [currentContext, setCurrentContext] = useState<PageFabContext>({});

  const setContext = useCallback((ctx: PageFabContext) => {
    const next = { ...ctx };
    contextRef.current = next;
    setCurrentContext((previous) => (sameContext(previous, next) ? previous : next));
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

  const value = { setContext, currentContext, register, context, invoke, route, consume };
  return <FabContext.Provider value={value}>{children}</FabContext.Provider>;
}

/**
 * The single floating button mounted by AppShell. Contexts with no create
 * action (Analytics and Plans → Cash-flow) render no misleading plus button.
 */
export function GlobalAddFab() {
  const pathname = usePathname();
  const { currentContext, invoke } = useFab();
  const route = normalizePath(pathname);
  const actions = getFabActions({ pathname: route, ...currentContext });

  if (!supportsFab(route) || actions.length === 0) return null;

  // A context change remounts the local controller. This closes an open action
  // sheet on route/tab changes without retaining stale overlays.
  const contextKey = `${route}:${currentContext.tab ?? ""}:${currentContext.accountsTab ?? ""}`;
  return <GlobalFabControl key={contextKey} actions={actions} invoke={invoke} />;
}

function GlobalFabControl({ actions, invoke }: { actions: FabActionDef[]; invoke: (action: FabActionDef) => void }) {
  const [open, setOpen] = useState(false);
  const busyRef = useRef(false);
  const controlsId = "global-fab-actions";

  function press() {
    // One tap opens at most one sheet. Ignore re-entry during the 200ms
    // open/close transition window.
    if (busyRef.current) return;
    busyRef.current = true;
    window.setTimeout(() => {
      busyRef.current = false;
    }, 200);

    if (actions.length === 1) {
      setOpen(false);
      invoke(actions[0]);
      return;
    }
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
        aria-controls={open ? controlsId : undefined}
        className="global-fab grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-95 touch-manipulation"
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
        {/* §9/§12: every action owns its own box (8px gap, no shared edges),
            keeps a 48px touch target and wraps long Uzbek labels. */}
        <div id={controlsId} className="min-w-0 space-y-2">
          {actions.map((action, index) => (
            <button
              key={`${action.id}-${action.type ?? "default"}-${index}`}
              type="button"
              onClick={() => run(action)}
              className="flex min-h-12 w-full min-w-0 max-w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-left text-[14px] font-medium transition-colors hover:border-line-strong hover:bg-surface-3 active:bg-surface-3 touch-manipulation"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-base" aria-hidden="true">
                {action.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words leading-tight">{action.label}</span>
                {action.description ? (
                  <span className="mt-0.5 block break-words text-[11.5px] font-normal leading-snug text-muted">
                    {action.description}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-muted" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
