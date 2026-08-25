"use client";
/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect -- sheet presence/content intentionally outlive the controlling prop through exit */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { formatAmount } from "@/lib/money";

/** One body-level portal keeps every viewport layer out of transformed pages. */
function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/**
 * Small, quiet line icons for the product chrome. User-created category icons
 * stay as user content; navigation and controls never rely on emoji glyphs.
 */
export type AppIconName =
  | "home"
  | "history"
  | "plans"
  | "analytics"
  | "more"
  | "bot"
  | "bell"
  | "sun"
  | "moon"
  | "monitor"
  | "accounts"
  | "budget"
  | "debt"
  | "goal"
  | "settings"
  | "warning"
  | "close"
  | "search"
  | "chevronRight"
  | "wallet"
  | "filter"
  | "transfer"
  | "check"
  | "pause"
  | "play"
  | "edit"
  | "archive"
  | "plus";

export function Icon({ name, size = 18, className = "" }: { name: AppIconName; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  let shape: ReactNode;
  switch (name) {
    case "home":
      shape = <><path d="M3.5 10.5 12 3.8l8.5 6.7V20a1 1 0 0 1-1 1h-5v-5.5h-5V21h-5a1 1 0 0 1-1-1z" /><path d="M9.5 21v-5.5h5V21" /></>;
      break;
    case "history":
      shape = <><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="6" cy="7" r=".6" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r=".6" fill="currentColor" stroke="none" /><circle cx="6" cy="17" r=".6" fill="currentColor" stroke="none" /></>;
      break;
    case "plans":
      shape = <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3.5v3M16 3.5v3M3.5 10h17" /></>;
      break;
    case "analytics":
      shape = <><path d="M4 19.5V5M4 19.5h16" /><path d="M8 16v-4M12.5 16V8M17 16v-6" /></>;
      break;
    case "more":
      shape = <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>;
      break;
    case "bot":
      shape = <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 4v3M8.5 12h.01M15.5 12h.01M8 16h8" /><path d="M2.5 11v4M21.5 11v4" /></>;
      break;
    case "bell":
      shape = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>;
      break;
    case "sun":
      shape = <><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>;
      break;
    case "moon":
      shape = <path d="M19.5 15.3A7.8 7.8 0 0 1 8.7 4.5 8.5 8.5 0 1 0 19.5 15.3Z" />;
      break;
    case "monitor":
      shape = <><rect x="3.5" y="4" width="17" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>;
      break;
    case "accounts":
      shape = <><path d="M4 7.5V6a2 2 0 0 1 2-2h11.5a2 2 0 0 1 2 2v2" /><path d="M4.5 8h14A1.5 1.5 0 0 1 20 9.5v8A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-8A1.5 1.5 0 0 1 5.5 8Z" /><path d="M16 12h4v4h-4a2 2 0 0 1 0-4Z" /></>;
      break;
    case "budget":
      shape = <><path d="M4 19V5h16v14Z" /><path d="M8 16v-3M12 16V8M16 16v-5" /></>;
      break;
    case "debt":
      shape = <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>;
      break;
    case "goal":
      shape = <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>;
      break;
    case "settings":
      shape = <><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" /><circle cx="12" cy="12" r="4.5" /></>;
      break;
    case "warning":
      shape = <><path d="m12 3 9 17H3Z" /><path d="M12 9v5M12 17.5h.01" /></>;
      break;
    case "close":
      shape = <path d="m6 6 12 12M18 6 6 18" />;
      break;
    case "search":
      shape = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>;
      break;
    case "chevronRight":
      shape = <path d="m9 5 7 7-7 7" />;
      break;
    case "wallet":
      shape = <><path d="M4.5 7.5V6.2A2.2 2.2 0 0 1 6.7 4h10.8a2 2 0 0 1 2 2v1.5" /><path d="M4.5 7.5h14.2a1.8 1.8 0 0 1 1.8 1.8v8.2a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 17.5V9.1a1.6 1.6 0 0 1 1.6-1.6" /><path d="M16.4 11.2h4.1v4.6h-4.1a2.3 2.3 0 1 1 0-4.6Z" /></>;
      break;
    case "filter":
      shape = <path d="M4 5h16l-6.4 7.2v5.3l-3.2 1.5v-6.8L4 5Z" />;
      break;
    case "transfer":
      shape = <><path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3" /></>;
      break;
    case "check":
      shape = <path d="m5 12.5 4.2 4.2L19 7" />;
      break;
    case "pause":
      shape = <><path d="M9 5v14M15 5v14" /></>;
      break;
    case "play":
      shape = <path d="m8 5 11 7-11 7Z" />;
      break;
    case "edit":
      shape = <path d="m4 16.8-.8 4 4-.8L19 8.2a2.8 2.8 0 1 0-4-4Z" />;
      break;
    case "archive":
      shape = <><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" /></>;
      break;
    case "plus":
      shape = <path d="M12 5v14M5 12h14" />;
      break;
  }
  return <svg {...common}>{shape}</svg>;
}

export function Card({
  children,
  className = "",
  padded = true,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`card ${padded ? "p-4 sm:p-5" : ""} ${onClick ? "cursor-pointer transition-transform active:scale-[0.99]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-2 sm:mb-3 sm:gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Shared visual and interaction foundation for the global Add and contextual
 * Filter floating actions. Position, safe-area, elevation and modal layering
 * stay centralized in `.global-fab`; callers only provide semantics and icon.
 *
 * A page can request a body portal when one of its ancestors animates with a
 * transform. Without that escape hatch, CSS makes `position: fixed` relative
 * to the transformed page (and the action scrolls away from the viewport).
 */
export function FloatingActionButton({
  children,
  className = "",
  portal = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { portal?: boolean }) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    if (portal) setPortalReady(true);
  }, [portal]);

  const button = (
    <button
      type="button"
      {...props}
      className={`global-fab grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg transition-[background-color,opacity,transform] duration-200 hover:bg-primary-hover active:scale-95 touch-manipulation ${className}`}
    >
      {children}
    </button>
  );

  if (!portal) return button;
  if (!portalReady) return null;
  return <BodyPortal>{button}</BodyPortal>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "positive";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.99] touch-manipulation";
  const sizes: Record<string, string> = {
    sm: "min-h-9 px-3.5 text-[12.5px] sm:min-h-9 sm:text-xs",
    md: "min-h-11 px-4 text-sm",
    lg: "min-h-12 px-5 text-[15px]",
  };
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-fg hover:bg-primary-hover shadow-sm",
    secondary: "border border-line bg-surface text-fg hover:bg-surface-2 hover:border-line-strong",
    ghost: "text-fg-soft hover:bg-surface-2 hover:text-fg",
    danger: "bg-negative text-negative-fg hover:opacity-90",
    positive: "bg-positive text-positive-fg hover:opacity-90",
  };
  const disabledClasses =
    "disabled:pointer-events-none disabled:active:scale-100 disabled:bg-surface-3 disabled:text-muted disabled:border-transparent disabled:shadow-none disabled:hover:bg-surface-3";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabledClasses} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning" | "accent" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-3 text-fg-soft",
    positive: "bg-positive-soft text-positive-text",
    negative: "bg-negative-soft text-negative-text",
    warning: "bg-warning-soft text-warning-text",
    accent: "bg-accent-soft text-accent-text",
    info: "bg-surface-3 text-fg-soft",
  };
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-1 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Money({
  value,
  size = "md",
  tone = "default",
  signed = false,
  whole = false,
  zeroSign,
  currency,
  compactSuffix,
  className = "",
}: {
  value: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  tone?: "default" | "positive" | "negative" | "muted";
  signed?: boolean;
  /** Display-only rounding to the nearest whole currency unit. */
  whole?: boolean;
  /** Optional semantic sign for a zero movement (for example “+0” income). */
  zeroSign?: "+" | "−";
  currency?: string;
  compactSuffix?: string;
  className?: string;
}) {
  const sizes: Record<string, string> = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-[14.5px] sm:text-[15px]",
    lg: "text-[clamp(0.95rem,4.5vw,1.125rem)] sm:text-xl",
    xl: "text-[22px] sm:text-3xl font-semibold",
    hero: "text-[clamp(1.75rem,8.2vw,2.5rem)] font-bold leading-none tracking-tight",
  };
  const tones: Record<string, string> = {
    default: "text-fg",
    positive: "text-positive-text",
    negative: "text-negative-text",
    muted: "text-muted",
  };
  const magnitude = whole ? Math.round(Math.abs(value)) : Math.abs(value);
  const sign = signed ? (magnitude === 0 ? zeroSign ?? "" : value > 0 ? "+" : "−") : "";
  return (
    <span className={`num ${sizes[size]} ${tones[tone]} break-words ${className}`}>
      {sign}
      {formatAmount(magnitude)}
      {compactSuffix ? <span className="ml-1 text-xs font-normal text-muted">{compactSuffix}</span> : null}
      {currency ? <span className="ml-1 text-[0.62em] font-normal text-muted">{currency}</span> : null}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /** Inline, field-specific validation message — never a generic "Xatolik". */
  error?: string | null;
}) {
  return (
    <label className="block w-full">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      <div className={error ? "[&_input]:border-negative [&_select]:border-negative [&_textarea]:border-negative" : undefined}>
        {children}
      </div>
      {error ? (
        <span className="mt-1.5 block text-[11.5px] font-medium leading-snug text-negative-text">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11.5px] leading-snug text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * §8/§16: every control fills its parent and may never contribute a larger
 * intrinsic width than the sheet it lives in (`min-w-0` + `max-w-full`).
 * The 16px base font size is deliberate: it is what stops iOS/Telegram from
 * zooming the page — and a zoom is a horizontal viewport shift (§21).
 */
const inputClass =
  "w-full min-w-0 max-w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-base leading-tight outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface sm:py-2.5 sm:text-[15px]";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} appearance-none pr-10 ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-20 resize-none ${props.className ?? ""}`} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="no-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain rounded-full" data-segmented-scroll>
      {/*
       * The inner row grows equally while labels fit, then becomes horizontally
       * scrollable when their intrinsic widths no longer fit. Labels are never
       * ellipsized: “Hammasi” must remain fully readable at 320px and every
       * longer segmented control keeps the same behaviour globally.
       */}
      <div role="tablist" className="flex w-max min-w-full gap-1 rounded-full border border-line bg-surface-2 p-1">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              type="button"
              onClick={() => onChange(o.value)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=tab]") ?? []);
                const current = tabs.indexOf(event.currentTarget);
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                tabs[next]?.focus();
                tabs[next]?.click();
              }}
              className={`flex min-h-11 flex-1 shrink-0 touch-manipulation select-none items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors sm:min-h-10 ${
                active ? "shadow-sm" : "text-fg-soft hover:bg-surface-3 hover:text-fg active:bg-surface-3"
              }`}
              style={active ? { background: "var(--segmented-active)", color: "var(--segmented-active-fg)" } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Progress({
  value,
  tone = "auto",
  height = 8,
  label,
  ariaLabel,
}: {
  value: number;
  tone?: "auto" | "accent";
  height?: number;
  label?: string;
  /** Names the progressbar for assistive tech — value is never color-only. */
  ariaLabel?: string;
}) {
  const pct = Math.max(0, Math.min(1.4, value)) * 100;
  const color =
    tone === "accent" ? "var(--accent)" : pct >= 100 ? "var(--negative)" : pct >= 80 ? "var(--warning)" : "var(--positive)";
  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-valuenow={Math.round(Math.min(100, pct))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label}
        className="w-full overflow-hidden rounded-full bg-surface-3"
        style={{ height }}
      >
        <div className="h-full rounded-full transition-[width] duration-200 ease-out" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      {label ? <p className="mt-1 text-[11px] text-muted">{label}</p> : null}
    </div>
  );
}

/**
 * Contextual sheet orchestration is deliberately global: overlapping close →
 * open hand-offs must keep the page locked until the final sheet exits, and
 * only the top-most dialog may react to Escape/Tab.
 */
let openSheetCount = 0;
let sheetInstanceSequence = 0;
const sheetStack: number[] = [];

type ScrollLockSnapshot = {
  scrollX: number;
  scrollY: number;
  body: {
    overflow: string;
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    paddingRight: string;
  };
  htmlOverflow: string;
};

let scrollLockSnapshot: ScrollLockSnapshot | null = null;

function lockPageScroll() {
  openSheetCount += 1;
  document.body.dataset.sheetOpen = "1";
  if (openSheetCount !== 1) return;

  const body = document.body;
  const root = document.documentElement;
  const scrollbarGap = Math.max(0, window.innerWidth - root.clientWidth);
  scrollLockSnapshot = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    body: {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    },
    htmlOverflow: root.style.overflow,
  };

  // `overflow: hidden` is sufficient on desktop; fixing the body also prevents
  // the background from rubber-banding in iOS and Telegram WebViews. Scroll
  // coordinates are restored exactly when the last sheet finishes exiting.
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollLockSnapshot.scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  if (scrollbarGap) body.style.paddingRight = `${scrollbarGap}px`;
  root.style.overflow = "hidden";
}

function unlockPageScroll() {
  openSheetCount = Math.max(0, openSheetCount - 1);
  if (openSheetCount > 0) return;

  delete document.body.dataset.sheetOpen;
  const snapshot = scrollLockSnapshot;
  scrollLockSnapshot = null;
  if (!snapshot) return;

  const body = document.body;
  body.style.overflow = snapshot.body.overflow;
  body.style.position = snapshot.body.position;
  body.style.top = snapshot.body.top;
  body.style.left = snapshot.body.left;
  body.style.right = snapshot.body.right;
  body.style.width = snapshot.body.width;
  body.style.paddingRight = snapshot.body.paddingRight;
  document.documentElement.style.overflow = snapshot.htmlOverflow;
  window.scrollTo(snapshot.scrollX, snapshot.scrollY);
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const SHEET_EXIT_FALLBACK_MS = 260;

type ContextualBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Runs once after the visual exit; used for sheet-to-sheet hand-offs. */
  onExitComplete?: () => void;
  title: string;
  /** Optional one-line context under the title — same grammar in every sheet. */
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * The one motion/accessibility primitive for Add Flow, Filter, action menus,
 * confirms and notifications.
 *
 * Presence remains mounted through the CSS exit transition. The content
 * snapshot is also retained while closing, so clearing page-owned selection
 * state cannot make the panel flash empty before it reaches the viewport edge.
 */
export function ContextualBottomSheet({
  open,
  onClose,
  onExitComplete,
  title,
  subtitle,
  children,
  footer,
}: ContextualBottomSheetProps) {
  const [present, setPresent] = useState(open);
  const [motionState, setMotionState] = useState<"open" | "closed">("closed");
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onExitCompleteRef = useRef(onExitComplete);
  const openRef = useRef(open);
  const exitNotifiedRef = useRef(false);
  const contentRef = useRef({ title, subtitle, children, footer });
  const instanceIdRef = useRef(0);
  const titleId = useId();
  const subtitleId = useId();

  if (instanceIdRef.current === 0) instanceIdRef.current = ++sheetInstanceSequence;
  onCloseRef.current = onClose;
  onExitCompleteRef.current = onExitComplete;
  openRef.current = open;
  if (open) {
    exitNotifiedRef.current = false;
    contentRef.current = { title, subtitle, children, footer };
  }

  const completeExit = useCallback(() => {
    if (openRef.current || exitNotifiedRef.current) return;
    exitNotifiedRef.current = true;
    onExitCompleteRef.current?.();
    // Keep the now-transparent old layer locked for one frame. A hand-off can
    // mount its next sheet in that frame, avoiding a body/FAB unlock flash.
    window.requestAnimationFrame(() => {
      if (!openRef.current) setPresent(false);
    });
  }, []);

  // One state machine handles enter, exit and rapid reversal. Two animation
  // frames guarantee the browser paints the closed transform before entering.
  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let exitTimer = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (open) {
      if (!present) {
        setPresent(true);
        return;
      }
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setMotionState("open"));
      });
    } else if (present) {
      setMotionState("closed");
      exitTimer = window.setTimeout(completeExit, reducedMotion ? 0 : SHEET_EXIT_FALLBACK_MS);
    }

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(exitTimer);
    };
  }, [completeExit, open, present]);

  // Scroll lock, focus entry/return, Escape and a minimal focus trap all share
  // the same presence lifecycle, so none are released halfway through exit.
  useEffect(() => {
    if (!present) return;
    const instanceId = instanceIdRef.current;
    const opener = document.activeElement as HTMLElement | null;
    sheetStack.push(instanceId);
    lockPageScroll();

    // Telegram's native BackButton follows the same close path as Escape and
    // the visible X. Stacked sheets keep the button alive until the final
    // presence exits; only the top-most sheet responds.
    const telegramBackButton = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            BackButton?: {
              show: () => void;
              hide: () => void;
              onClick: (callback: () => void) => void;
              offClick: (callback: () => void) => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.BackButton;
    const onTelegramBack = () => {
      if (sheetStack.at(-1) === instanceId && openRef.current) onCloseRef.current();
    };
    telegramBackButton?.onClick(onTelegramBack);
    telegramBackButton?.show();

    const onKeyDown = (event: KeyboardEvent) => {
      if (sheetStack.at(-1) !== instanceId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (openRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.getClientRects().length > 0 && node.getAttribute("aria-hidden") !== "true",
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      const node = dialogRef.current;
      if (!node || node.contains(document.activeElement) || sheetStack.at(-1) !== instanceId) return;
      node.focus({ preventScroll: true });
    }, 40);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      telegramBackButton?.offClick(onTelegramBack);
      const stackIndex = sheetStack.lastIndexOf(instanceId);
      if (stackIndex >= 0) sheetStack.splice(stackIndex, 1);
      if (sheetStack.length === 0) telegramBackButton?.hide();
      unlockPageScroll();
      if (sheetStack.length === 0 && opener?.isConnected) {
        try {
          opener.focus({ preventScroll: true });
        } catch {
          opener.focus();
        }
      }
    };
  }, [present]);

  if (!present || typeof document === "undefined") return null;

  const content = contentRef.current;
  const sheet = (
    <div
      className="sheet-layer fixed inset-0 flex items-end justify-center sm:px-4"
      data-motion-state={motionState}
    >
      <div
        className="sheet-backdrop absolute inset-0"
        onClick={() => {
          if (open) onCloseRef.current();
        }}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={content.subtitle ? subtitleId : undefined}
        tabIndex={-1}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === "transform" && !open) {
            completeExit();
          }
        }}
        className="sheet-dialog relative z-10 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[20px] border border-line bg-surface shadow-[0_-12px_32px_-20px_rgba(16,24,32,0.5)] outline-none sm:max-h-[88dvh] sm:max-w-[520px] sm:rounded-[20px]"
      >
        <div className="shrink-0 px-5 pt-3 sm:hidden">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="truncate text-[15px] font-semibold tracking-tight sm:text-base">
              {content.title}
            </h3>
            {content.subtitle ? (
              <p id={subtitleId} className="mt-0.5 truncate text-[11.5px] leading-snug text-muted">
                {content.subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (open) onCloseRef.current();
            }}
            data-hit="expanded"
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-surface-3 hover:text-fg active:scale-[0.98] touch-manipulation"
            aria-label="Yopish"
          >
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="sheet-body min-h-0 flex-1 px-5 pb-4">
          <div className="sheet-form space-y-4 pb-2">{content.children}</div>
        </div>
        {content.footer ? (
          <div className="sheet-footer-safe sheet-footer sticky bottom-0 shrink-0 border-t border-line bg-surface px-5 pt-4">
            <div className="flex min-w-0 flex-wrap gap-2.5 [&>*]:min-w-0">{content.footer}</div>
          </div>
        ) : (
          <div className="sheet-bottom-safe shrink-0" />
        )}
      </div>
    </div>
  );
  return <BodyPortal>{sheet}</BodyPortal>;
}

/** Backwards-compatible name: every legacy call still resolves to ONE primitive. */
export const Sheet = ContextualBottomSheet;

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flat-card flex flex-col items-center gap-3 px-5 py-8 text-center sm:px-6 sm:py-10">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-3 text-muted">{icon}</div>
      <div className="max-w-[300px]">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="mx-auto mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Divider() {
  return <div className="h-px w-full bg-line" />;
}

/**
 * Frameless grouping block (§24: Page → Section → Row). Use it instead of a
 * Card whenever the border adds no meaning — lists, secondary metrics and
 * references live in Sections; Cards are reserved for PRIMARY financial
 * concepts (hero balance, risk, “Sarflash mumkin”, main chart).
 */
export function Section({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title ? <SectionTitle title={title} hint={hint} action={action} /> : null}
      {children}
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-shimmer rounded-xl bg-surface-3 ${className}`} />;
}

/**
 * Compact page header.
 *
 * Section names are intentionally NOT rendered: when a section opens, its name
 * is not shown in a headline at the top (§38). The header carries only
 * an optional action slot — the page content itself starts at the very top
 * of the viewport. Navigation back is handled by the swipe-back gesture.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  /** Optional for API compatibility; never rendered as a headline. */
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  /**
   * Compact back affordance for internal pages (§11/§22): a small `‹ Menyu`
   * link. Never a second profile/balance header.
   */
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 sm:mb-5">
      {back ? (
        <Link
          href={back.href}
          aria-label={`Orqaga: ${back.label}`}
          className="-ml-1.5 mb-0.5 inline-flex min-h-11 items-center gap-0.5 rounded-full px-1.5 text-[12.5px] font-medium text-muted transition-colors hover:text-fg active:text-fg touch-manipulation"
        >
          <span aria-hidden="true" className="text-[15px] leading-none">‹</span>
          {back.label}
        </Link>
      ) : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
