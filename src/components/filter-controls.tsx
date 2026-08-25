"use client";

import type { ReactNode } from "react";
import { FloatingActionButton } from "./ui";

/**
 * Shared filter trigger used by list screens. Plans and History deliberately
 * use the same size, icon, active treatment and dialog semantics.
 */
export function FilterButton({
  onClick,
  open,
  ariaLabel,
  status,
  controlsId,
  floating = false,
}: {
  onClick: () => void;
  open: boolean;
  ariaLabel: string;
  status?: string | number;
  controlsId?: string;
  floating?: boolean;
}) {
  const active = status !== undefined && status !== "" && status !== 0;

  if (floating) {
    return (
      <FloatingActionButton
        portal
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? controlsId : undefined}
      >
        <FunnelIcon size={22} />
        {active ? (
          <span
            className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-warning animate-badge-pop"
            aria-hidden="true"
          />
        ) : null}
        {active ? <span className="sr-only">{status} ta faol filtr</span> : null}
      </FloatingActionButton>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={controlsId}
      className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-colors touch-manipulation ${
        active
          ? "border-accent bg-accent-soft text-accent-text"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg"
      }`}
    >
      <FunnelIcon />
      <span>{active ? `Filtr · ${status}` : "Filtr"}</span>
    </button>
  );
}

export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</h4>
      {children}
    </section>
  );
}

/** Native radios retain arrow-key and screen-reader behaviour automatically. */
export function FilterRadioGroup<T extends string>({
  id,
  label,
  name,
  value,
  options,
  onChange,
}: {
  id?: string;
  label: string;
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div id={id} role="radiogroup" aria-label={label} className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 text-left text-[14px] font-medium transition-colors touch-manipulation ${
              selected ? "bg-accent-soft text-accent-text" : "bg-surface hover:bg-surface-2 active:bg-surface-3"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onClick={() => {
                if (selected) onChange(option.value);
              }}
              onChange={() => onChange(option.value)}
              className="h-5 w-5 shrink-0 accent-accent"
            />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function FunnelIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 5h16l-6.4 7.2v5.3l-3.2 1.5v-6.8L4 5Z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
