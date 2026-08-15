"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatAmount } from "@/lib/money";

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
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-all active:scale-[0.97] touch-manipulation";
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
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}
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
  currency,
  compactSuffix,
}: {
  value: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  tone?: "default" | "positive" | "negative" | "muted";
  signed?: boolean;
  currency?: string;
  compactSuffix?: string;
}) {
  const sizes: Record<string, string> = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-[14.5px] sm:text-[15px]",
    lg: "text-lg sm:text-xl",
    xl: "text-[22px] sm:text-3xl font-semibold",
    hero: "text-[28px] font-bold leading-none tracking-tight sm:text-[40px]",
  };
  const tones: Record<string, string> = {
    default: "text-fg",
    positive: "text-positive-text",
    negative: "text-negative-text",
    muted: "text-muted",
  };
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  return (
    <span className={`num ${sizes[size]} ${tones[tone]} break-words`}>
      {sign}
      {formatAmount(Math.abs(value))}
      {compactSuffix ? <span className="ml-1 text-xs font-normal text-muted">{compactSuffix}</span> : null}
      {currency ? <span className="ml-1 text-[0.62em] font-normal text-muted">{currency}</span> : null}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block w-full">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11.5px] leading-snug text-muted">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-base leading-tight outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface sm:py-2.5 sm:text-[15px]";

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
    <div className="no-scrollbar w-full overflow-x-auto overscroll-x-contain rounded-full" data-segmented-scroll>
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
              className={`flex min-h-11 flex-1 shrink-0 touch-manipulation select-none items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-all sm:min-h-10 ${
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
}: {
  value: number;
  tone?: "auto" | "accent";
  height?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1.4, value)) * 100;
  const color =
    tone === "accent" ? "var(--accent)" : pct >= 100 ? "var(--negative)" : pct >= 80 ? "var(--warning)" : "var(--positive)";
  return (
    <div className="w-full">
      <div className="w-full overflow-hidden rounded-full bg-surface-3" style={{ height }}>
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      {label ? <p className="mt-1 text-[11px] text-muted">{label}</p> : null}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    // Remember the element that opened the sheet so focus can return to it.
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog for keyboard/screen-reader users.
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      opener?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  const sheet = (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-sheet relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-line bg-surface shadow-2xl outline-none sm:max-h-[88vh] sm:max-w-lg sm:rounded-[20px]"
      >
        <div className="shrink-0 px-5 pt-3 sm:hidden">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-3">
          <h3 id={titleId} className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight sm:text-base">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-fg active:scale-[0.96] touch-manipulation"
            aria-label="Yopish"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="space-y-4 pb-2">{children}</div>
        </div>
        {footer ? (
          <div className="safe-b sticky bottom-0 shrink-0 border-t border-line bg-surface px-5 py-4">
            <div className="flex gap-2.5">{footer}</div>
          </div>
        ) : (
          <div className="safe-b shrink-0 pb-[max(env(safe-area-inset-bottom),8px)]" />
        )}
      </div>
    </div>
  );
  return createPortal(sheet, document.body);
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flat-card flex flex-col items-center gap-3 px-5 py-8 text-center sm:px-6 sm:py-10">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-xl">{icon}</div>
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

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-shimmer rounded-xl bg-surface-3 ${className}`} />;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight sm:text-[22px]">{title}</h1>
        {subtitle ? <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
