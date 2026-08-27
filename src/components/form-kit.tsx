"use client";
/* eslint-disable react-hooks/set-state-in-effect -- sheet submit state resets when the sheet (re)opens */

/**
 * ONE add-flow design system.
 *
 * Every create/edit sheet in Hisobchi is composed from the primitives below,
 * so all of them share the same grammar:
 *
 *   HEADER  title + optional subtitle + close
 *   BODY    core fields → optional (collapsed) details → compact preview
 *   FOOTER  exactly ONE primary action
 *
 * The components own UX only. Finance logic, validation rules and mutations
 * stay in the pages/lib that already own them.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ContextualBottomSheet, TextArea, TextInput } from "./ui";
import { useFinance } from "./providers";
import {
  QUICK_AMOUNTS,
  addQuickAmount,
  dateQuickChips,
  formatAmountInput,
  matchesQuery,
  parseAmountInput,
  quickAmountLabel,
  rankCategoryIds,
} from "@/lib/form-kit";
import { compact, formatAmount, humanDate, todayISO } from "@/lib/money";
import { ERRORS, LOADING } from "@/lib/copy";
import { Icon } from "@/components/icon";

/* ============================ Feedback ============================ */

type HapticKind = "success" | "warning" | "error" | "light";

type TelegramHaptics = {
  impactOccurred?: (style: string) => void;
  notificationOccurred?: (type: string) => void;
};

/** §27: a short physical confirmation where the platform supports it. */
export function haptic(kind: HapticKind = "light"): void {
  if (typeof window === "undefined") return;
  try {
    const api = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: TelegramHaptics } } }).Telegram?.WebApp
      ?.HapticFeedback;
    if (!api) return;
    if (kind === "light") api.impactOccurred?.("light");
    else api.notificationOccurred?.(kind);
  } catch {
    /* haptics are a bonus, never a requirement */
  }
}

/* ============================ Form sheet ============================ */

export type SubmitResult = { ok: boolean; message?: string };

/**
 * The single container every add/edit flow uses.
 *
 * - ONE primary action (§25) with a real state machine (§26).
 * - Duplicate submissions are impossible: the button is busy-locked and the
 *   handler is re-entrancy guarded.
 * - Unsaved data is protected (§29) — but ONLY when something meaningful was
 *   actually typed.
 * - A failed mutation shows a compact banner with a retry, never a dead end.
 */
export function FormSheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconTone,
  eyebrow,
  submitLabel,
  submittingLabel = LOADING.saving,
  savedLabel = "Saqlandi ✓",
  canSubmit = true,
  dirty = false,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Passed straight through to the sheet header — see ContextualBottomSheet. */
  icon?: string;
  iconTone?: "positive" | "negative" | "accent" | "gold" | "neutral";
  eyebrow?: string;
  submitLabel: string;
  submittingLabel?: string;
  savedLabel?: string;
  canSubmit?: boolean;
  dirty?: boolean;
  onSubmit: () => Promise<SubmitResult>;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const busyRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setStatus("idle");
      setError(null);
      setConfirmClose(false);
      busyRef.current = false;
    }
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [open]);

  const requestClose = useCallback(() => {
    if (busyRef.current) return; // never abandon an in-flight mutation
    if (dirty && status === "idle") {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose, status]);

  async function submit() {
    if (busyRef.current || !canSubmit) return;
    busyRef.current = true;
    setStatus("saving");
    setError(null);
    try {
      const result = await onSubmit();
      if (result.ok) {
        haptic("success");
        setStatus("saved");
        closeTimerRef.current = window.setTimeout(() => {
          busyRef.current = false;
          onClose();
        }, 420);
        return;
      }
      haptic("error");
      setError(result.message || ERRORS.save);
      setStatus("idle");
      busyRef.current = false;
    } catch {
      setError(ERRORS.connection);
      setStatus("idle");
      busyRef.current = false;
    }
  }

  const busy = status !== "idle";
  const label = status === "saving" ? submittingLabel : status === "saved" ? savedLabel : submitLabel;

  return (
    <ContextualBottomSheet
      open={open}
      onClose={requestClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      iconTone={iconTone}
      eyebrow={eyebrow}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || busy}
          aria-busy={status === "saving"}
          // §15: a long Uzbek CTA ("Kutilayotgan daromadni saqlash") wraps
          // inside the footer instead of widening it past the viewport.
          style={
            canSubmit && !busy
              ? {
                  background: "var(--gold-gradient)",
                  color: "var(--gold-on)",
                  // The glow is what makes the CTA read as the one live control
                  // on a dark sheet; it is dropped the moment the button is
                  // disabled so a dead button never looks pressable.
                  boxShadow: "0 14px 28px -12px rgba(245,181,68,.55)",
                }
              : undefined
          }
          className="inline-flex min-h-[54px] w-full min-w-0 max-w-full flex-1 select-none items-center justify-center gap-2 break-words rounded-[18px] bg-primary px-5 py-2 text-center text-[15px] font-extrabold leading-tight text-primary-fg transition-[filter,transform] duration-200 hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:bg-surface-3 disabled:text-muted disabled:shadow-none touch-manipulation"
        >
          {status === "saved" ? <CheckMark /> : <Icon name="check" size={17} className="shrink-0" />}
          {label}
        </button>
      }
    >
      {error ? (
        <div
          role="alert"
          className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-negative bg-negative-soft px-3.5 py-2.5"
        >
          <p className="min-w-0 break-words text-[12.5px] leading-snug text-negative-text">{error}</p>
          <button
            type="button"
            onClick={submit}
            className="shrink-0 rounded-full px-2 py-1 text-[12px] font-semibold text-negative-text underline-offset-2 hover:underline touch-manipulation"
          >
            Qayta
          </button>
        </div>
      ) : null}

      {children}

      {confirmClose ? (
        <div className="absolute inset-0 z-20 flex items-end overflow-hidden bg-black/35 px-4 pb-4 sm:items-center sm:justify-center">
          <div className="w-full min-w-0 max-w-full rounded-2xl border border-line bg-surface p-4 shadow-xl sm:max-w-xs">
            <p className="text-[14px] font-semibold">Saqlanmagan ma’lumot bor</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted">Chiqsangiz kiritilgan ma’lumot yo‘qoladi.</p>
            <div className="mt-3 flex flex-wrap gap-2 [&>*]:min-w-0">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="min-h-11 flex-1 rounded-full border border-line bg-surface text-[13px] font-semibold text-fg transition-colors hover:bg-surface-2 touch-manipulation"
              >
                Qolish
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmClose(false);
                  onClose();
                }}
                className="min-h-11 flex-1 rounded-full bg-negative text-[13px] font-semibold text-negative-fg transition-opacity hover:opacity-90 touch-manipulation"
              >
                Chiqish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ContextualBottomSheet>
  );
}

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="m5 13 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ============================ Layout primitives ============================ */

/** A labelled group inside a sheet. Sections replace nested cards (§47). */
export function FormGroup({
  label,
  hint,
  children,
  className = "",
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 space-y-2 ${className}`}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 break-words text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {label}
          </span>
          {hint ? <span className="shrink-0 text-[11px] text-muted">{hint}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** §31: one name for the grouping block used by every add sheet. */
export const FormSection = FormGroup;

/**
 * §6/§14/§25: two controls side by side on roomy phones, stacked below 380px.
 * Both tracks are `minmax(0, 1fr)`, so a long label or a wide input can never
 * widen the row past the sheet.
 */
export function FormRow({
  children,
  className = "",
  align = "start",
}: {
  children: ReactNode;
  className?: string;
  /** `end` keeps a button visually aligned with the input next to it. */
  align?: "start" | "end";
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 [&>*]:min-w-0 ${
        align === "end" ? "min-[380px]:items-end" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * §14: a button group that wraps instead of overflowing. Three buttons are
 * never squeezed into one line — they wrap, each keeping a 44px touch target.
 */
export function FormActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex w-full min-w-0 flex-wrap gap-2 [&>*]:min-w-0 ${className}`}>{children}</div>;
}

/* ============================ Choice controls ============================ */

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  /** Optional second line — only for the card size, never for compact rows. */
  description?: string;
  icon?: string;
};

function useRovingChoice() {
  return useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? [],
    );
    const current = items.indexOf(event.currentTarget);
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (forward ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    items[next]?.click();
  }, []);
}

/**
 * §7/§11/§26/§27 — THE selection control of the add flow.
 *
 *   grid-template-columns: repeat(n, minmax(0, 1fr))   → equal, shrinkable
 *   gap: 8px                                            → own visual box each
 *   inset ring for the selected state                   → geometry never moves
 *
 * There is no horizontal scrolling: a choice set is short by definition, and
 * a form control that scrolls sideways inside a sheet is the bug this system
 * exists to prevent (§13). Long Uzbek labels wrap instead of truncating.
 */
export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  label,
  hint,
  columns,
  size = "md",
  error,
  ariaLabel,
}: {
  options: ReadonlyArray<ChoiceOption<T>>;
  value: T;
  onChange: (next: T) => void;
  label?: string;
  hint?: string;
  /** Defaults to 3 for compact triples, otherwise 2 (1 when descriptions). */
  columns?: 1 | 2 | 3;
  size?: "sm" | "md";
  error?: string | null;
  ariaLabel?: string;
}) {
  const onKeyDown = useRovingChoice();
  const hasDescription = options.some((o) => o.description);
  const resolved: 1 | 2 | 3 =
    columns ?? (hasDescription ? 1 : options.length === 3 ? 3 : options.length >= 4 ? 2 : (options.length as 1 | 2));
  const template = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" }[resolved];

  // Roving focus: exactly ONE tab stop per group. When nothing is selected yet
  // the first option owns it, so the group is always reachable by keyboard.
  const focusIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const body = (
    <div role="radiogroup" aria-label={ariaLabel ?? label} className={`grid ${template} gap-2 [&>*]:min-w-0`}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === focusIndex ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => onChange(option.value)}
            className={`flex w-full min-w-0 max-w-full touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-xl border px-2 text-center transition-colors ${
              size === "sm" ? "min-h-11 py-1.5 text-[12.5px]" : "min-h-12 py-2 text-[13px]"
            } ${
              active
                ? "border-transparent bg-accent-soft font-semibold text-accent-text ring-2 ring-inset ring-accent"
                : "border-line bg-surface-2 text-fg-soft hover:border-line-strong hover:text-fg active:bg-surface-3"
            }`}
          >
            <span className="flex w-full min-w-0 items-center justify-center gap-1.5">
              {option.icon ? <Icon name={option.icon} size={15} className="shrink-0" /> : null}
              <span className="min-w-0 break-words leading-tight">{option.label}</span>
            </span>
            {option.description ? (
              <span className="w-full min-w-0 break-words text-[11px] font-normal leading-snug text-muted">
                {option.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  if (!label && !error && !hint) return body;
  return (
    <FormGroup label={label} hint={hint}>
      {body}
      <FieldError>{error}</FieldError>
    </FormGroup>
  );
}

/**
 * §7/§19 — the compact type switch at the top of a form (Xarajat · Daromad ·
 * Transfer). Same grid contract as ChoiceGrid, tuned to look like a segmented
 * control. The scrollable `Segmented` in `ui.tsx` stays what it is: a
 * NAVIGATION control for genuinely long tab sets (Plans tabs, history filter),
 * where horizontal scrolling is the right answer.
 */
export function CompactSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
}: {
  options: ReadonlyArray<ChoiceOption<T>>;
  value: T;
  onChange: (next: T) => void;
  label?: string;
  ariaLabel?: string;
}) {
  const onKeyDown = useRovingChoice();
  // Roving focus: ONE tab stop for the group, so a keyboard user arrows between
  // options instead of tabbing through every one of them.
  const focusIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const body = (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? label}
      className="flex min-w-0 gap-1 rounded-[15px] p-1"
      style={{ background: "var(--surface-sunken)" }}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === focusIndex ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => onChange(option.value)}
            style={active ? { background: "var(--gold-gradient)", color: "var(--gold-on)" } : undefined}
            className={`flex min-h-10 flex-1 min-w-0 touch-manipulation select-none items-center justify-center gap-1.5 rounded-[11px] px-2 text-[12.5px] transition-colors ${
              active ? "font-extrabold" : "font-semibold text-fg-soft hover:text-fg"
            }`}
          >
            {option.icon ? <Icon name={option.icon} size={14} className="shrink-0" /> : null}
            <span className="min-w-0 truncate leading-tight">{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (!label) return body;
  return <FormGroup label={label}>{body}</FormGroup>;
}

/** Collapsed “QO‘SHIMCHA” block (§6/§24). Never open by default. */
export function AdvancedSection({ label = "Qo‘shimcha", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="min-w-0 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-1 text-left text-[13px] font-semibold text-fg-soft transition-colors hover:text-fg touch-manipulation"
      >
        {label}
        <span className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true">
          ⌄
        </span>
      </button>
      {open ? (
        <div id={id} className="sheet-form mt-2 space-y-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Compact “this is what you are about to save” block (§15/§16/§48). */
export function PreviewCard({ label = "Ko‘rinishi", children }: { label?: string; children: ReactNode }) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-surface-2 px-3.5 py-3 [overflow-wrap:anywhere]">
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      {children}
    </div>
  );
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="mt-1.5 text-[11.5px] font-medium leading-snug text-negative-text">{children}</p>;
}

/* ============================ Chips ============================ */

/**
 * A single selectable pill. It owns its own visual box: 8px gap, one 1px
 * border in both states and a same-width inset ring when selected, so
 * choosing an option NEVER changes the layout geometry (§10/§26/§27).
 * Long values (account or category names) shrink and ellipsize instead of
 * pushing the sheet sideways (§8).
 */
export function Chip({
  active,
  onClick,
  children,
  icon,
  ariaLabel,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Leading emoji/glyph — kept outside the truncating label. */
  icon?: ReactNode;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      style={
        active
          ? {
              background: "linear-gradient(160deg, rgba(245,181,68,.22), rgba(245,181,68,.08))",
              borderColor: "rgba(245,181,68,.45)",
              color: "var(--gold-text)",
            }
          : undefined
      }
      // 44px minimum height is a touch-target rule, not a style choice.
      className={`inline-flex min-h-11 min-w-0 max-w-full touch-manipulation items-center gap-1.5 rounded-[var(--radius-chip)] border px-3.5 text-[13px] transition-colors ${
        active
          ? "font-bold"
          : "border-line bg-surface font-medium text-fg-soft hover:border-line-strong hover:text-fg active:bg-surface-3"
      }`}
    >
      {icon ? (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

/**
 * §13: choice rows WRAP, they never scroll sideways. A form sheet has exactly
 * one scroll axis (vertical) — a nested horizontal scroller inside it is what
 * made the add flow feel like it was drifting left and right.
 */
function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex w-full min-w-0 max-w-full flex-wrap gap-2 py-0.5">{children}</div>;
}

/* ============================ Amount ============================ */

/**
 * §8: THE field. Numeric keypad, live `1 200 000` grouping, optional quick
 * ladder, inline error. The parent still owns the raw string state so the
 * stored numeric value is never mutated behind its back.
 *
 * Visual grammar: the box holds ONLY the number (plus a currency badge and a
 * clear affordance) — the quick ladder lives below it, so the hero amount
 * stays calm and uncluttered. The type scales down for very long sums instead
 * of clipping, and a live "≈ 1,2 mln" readout confirms the zeros.
 */
export function AmountField({
  value,
  onChange,
  label = "Summa",
  currency,
  error,
  autoFocus = false,
  quick = true,
  placeholder = "0",
  variant = "field",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  currency?: string;
  error?: string | null;
  autoFocus?: boolean;
  quick?: boolean;
  placeholder?: string;
  /**
   * "slab" is the hero treatment used by the daily add sheet: a centred, raised
   * block where the amount IS the screen. Everywhere else the amount is one
   * field among several, so it stays a normal labelled input.
   */
  variant?: "field" | "slab";
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = parseAmountInput(value);
  const hasValue = value.trim().length > 0;
  // Long sums shrink instead of overflowing — 12 digits is already `999 mlrd`.
  const digits = value.replace(/\D/g, "").length;
  const sizeClass =
    digits > 12
      ? "text-[21px] sm:text-[23px]"
      : digits > 9
        ? "text-[26px] sm:text-[28px]"
        : "text-[31px] sm:text-[33px]";
  const quickLadder = quick ? (
    // §13: the quick ladder wraps below the field — never a second horizontal
    // scroller, never clutter inside the hero box.
    <div className={`flex min-w-0 flex-wrap gap-1.5 ${variant === "slab" ? "mt-3.5 justify-center" : "mt-2"}`}>
      {QUICK_AMOUNTS.map((amount) => (
        <button
          key={amount}
          type="button"
          onClick={() => onChange(addQuickAmount(value, amount))}
          className="num min-h-9 min-w-0 max-w-full touch-manipulation rounded-full border border-line bg-surface-2 px-3.5 text-[12px] font-semibold text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:scale-95"
        >
          {quickAmountLabel(amount)}
        </button>
      ))}
    </div>
  ) : null;

  if (variant === "slab") {
    return (
      <div className="min-w-0">
        <div
          onClick={() => inputRef.current?.focus()}
          className={`min-w-0 cursor-text rounded-3xl border p-5.5 text-center transition-[border-color] duration-150 ${
            error ? "border-negative" : "border-line-strong"
          }`}
          style={{ background: "var(--surface-raised)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.13)" }}
        >
          <label htmlFor={id} className="lb block">
            {label}
          </label>
          {/* The input is sized to the sheet, not to the text, so a long sum
              shrinks in place instead of pushing the slab sideways. */}
          <div className="mt-2.5 flex min-w-0 items-baseline justify-center gap-1.5">
            <input
              ref={inputRef}
              id={id}
              value={value}
              onChange={(e) => onChange(formatAmountInput(e.target.value))}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              placeholder={placeholder}
              autoFocus={autoFocus}
              size={1}
              className={`num min-w-0 max-w-full bg-transparent text-center font-bold leading-[0.9] outline-none placeholder:font-bold placeholder:text-faint ${
                digits > 12 ? "text-[28px]" : digits > 9 ? "text-[36px]" : "text-[46px]"
              }`}
              style={{ width: `${Math.max(1, value.length || 1)}ch` }}
            />
            {currency ? <span className="shrink-0 text-[13px] font-semibold text-faint">{currency}</span> : null}
          </div>
          {/* Live magnitude readout — the cheapest "did I type the right number
              of zeros?" check there is. */}
          <p className="num mt-1.5 h-4 text-[11.5px] font-bold" style={{ color: "var(--gold-text)" }} aria-hidden="true">
            {parsed !== null && parsed >= 1_000 ? `≈ ${compact(parsed)}` : ""}
          </p>
          {quickLadder}
        </div>
        {error ? (
          <p id={errorId} className="mt-1.5 text-center text-[11.5px] font-medium leading-snug text-negative-text">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex min-w-0 items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
        >
          {label}
        </label>
        {quick && parsed !== null && parsed >= 1_000 ? (
          // Live magnitude readout — the cheapest possible "did I type the
          // right number of zeros?" check, in the label row so the box itself
          // never changes height while typing.
          <span aria-hidden="true" className="num shrink-0 text-[11.5px] font-semibold text-accent-text">
            ≈ {compact(parsed)}
          </span>
        ) : null}
      </div>
      <div
        onClick={() => inputRef.current?.focus()}
        className={`min-w-0 cursor-text rounded-2xl border bg-surface-2 px-4 py-3.5 transition-[border-color,box-shadow] duration-150 ${
          error
            ? "border-negative shadow-[0_0_0_3px_var(--negative-soft)]"
            : "border-line focus-within:border-accent focus-within:bg-surface focus-within:shadow-[0_0_0_3px_var(--accent-soft)]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <input
            ref={inputRef}
            id={id}
            value={value}
            onChange={(e) => onChange(formatAmountInput(e.target.value))}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={`num w-full min-w-0 max-w-full bg-transparent font-bold leading-none tracking-[-0.01em] outline-none placeholder:font-semibold placeholder:text-faint ${sizeClass}`}
          />
          {hasValue ? (
            <button
              type="button"
              aria-label="Summani tozalash"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                inputRef.current?.focus();
              }}
              className="grid h-7 w-7 shrink-0 touch-manipulation place-items-center rounded-full bg-surface-3 text-[13px] leading-none text-muted transition-colors hover:text-fg active:scale-95"
            >
              ✕
            </button>
          ) : null}
          {currency ? (
            <span className="shrink-0 rounded-lg bg-surface-3 px-2 py-1 text-[11.5px] font-semibold tracking-[0.02em] text-muted">
              {currency}
            </span>
          ) : null}
        </div>
      </div>
      {quickLadder}
      {error ? (
        <p id={errorId} className="mt-1.5 text-[11.5px] font-medium leading-snug text-negative-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ============================ Category ============================ */

/**
 * §9: recent + frequent first as chips, search and the full list only behind
 * “Barchasi”. A 30-item grid is never the first thing the user sees.
 */
export function CategoryPicker({
  type,
  value,
  onChange,
  label = "Kategoriya",
  error,
}: {
  type: "income" | "expense";
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
}) {
  const { state } = useFinance();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const categories = useMemo(
    () => (state?.flatCategories ?? []).filter((c) => c.type === type && c.isActive),
    [state?.flatCategories, type],
  );

  const usage = useMemo(
    () =>
      (state?.transactions ?? [])
        .filter((t) => t.type === type)
        .slice(0, 120)
        .map((t) => ({ categoryId: t.categoryId, date: t.date })),
    [state?.transactions, type],
  );

  const ranked = useMemo(() => {
    const ids = rankCategoryIds(usage, categories.map((c) => c.id), 5);
    const byId = new Map(categories.map((c) => [c.id, c]));
    const list = ids.map((id) => byId.get(id)).filter(Boolean) as typeof categories;
    // The selected category is always visible without expanding.
    const selected = value ? byId.get(Number(value)) : undefined;
    if (selected && !list.some((c) => c.id === selected.id)) list.unshift(selected);
    return list;
  }, [categories, usage, value]);

  const filtered = useMemo(() => categories.filter((c) => matchesQuery(c.name, query)), [categories, query]);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          data-hit="expanded"
          className="relative shrink-0 text-[12px] font-semibold text-accent-text before:absolute before:-inset-y-2.5 before:-inset-x-2 before:content-[''] touch-manipulation"
        >
          {expanded ? "Yopish" : "Barchasi →"}
        </button>
      </div>

      {!expanded ? (
        <ChipRow>
          {ranked.map((c) => (
            <Chip
              key={c.id}
              icon={<Icon name={c.icon} size={15} />}
              title={c.name}
              active={String(c.id) === value}
              onClick={() => onChange(String(c.id))}
            >
              {c.name}
            </Chip>
          ))}
          {ranked.length === 0 ? <span className="py-2 text-[12.5px] text-muted">Kategoriya yo‘q</span> : null}
        </ChipRow>
      ) : (
        <div className="space-y-2">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Qidirish"
            aria-label="Kategoriya qidirish"
          />
          <div className="max-h-52 min-w-0 space-y-1 overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-line bg-surface-2 p-1.5">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(String(c.id));
                  setExpanded(false);
                  setQuery("");
                }}
                className={`flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-3 text-left text-[13.5px] transition-colors touch-manipulation ${
                  String(c.id) === value
                    ? "bg-accent-soft font-semibold text-accent-text ring-2 ring-inset ring-accent"
                    : "hover:bg-surface-3"
                }`}
              >
                <Icon name={c.icon} size={16} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 ? <p className="px-3 py-3 text-[12.5px] text-muted">Topilmadi</p> : null}
          </div>
        </div>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}

/* ============================ Date ============================ */

/** §10: today by default, two taps back in time, calendar only when needed. */
export function DateField({
  value,
  onChange,
  label = "Sana",
  error,
  chips = true,
  variant = "field",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
  chips?: boolean;
  /**
   * "inline" collapses to a single summary line ("Bugun ›") that expands into
   * the same chip row on tap — the pattern CategoryPicker already uses for
   * "Barchasi →". It exists so the add sheet can put date and account on ONE
   * row instead of two full-width blocks.
   */
  variant?: "field" | "inline";
}) {
  const today = todayISO();
  const quick = useMemo(() => dateQuickChips(today), [today]);
  const isQuick = quick.some((chip) => chip.value === value);
  const [showCalendar, setShowCalendar] = useState(!chips || !isQuick);
  const [expanded, setExpanded] = useState(false);
  const id = useId();

  if (variant === "inline") {
    const summary = quick.find((chip) => chip.value === value)?.label ?? humanDate(value);
    return (
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex min-h-11 w-full min-w-0 items-center justify-end gap-1.5 text-right touch-manipulation"
        >
          <span className="min-w-0 truncate text-[13.5px] font-semibold">{summary}</span>
          <Icon
            name="chevron-down"
            size={13}
            className={`shrink-0 text-faint transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        {expanded ? (
          <div className="mt-2">
            <ChipRow>
              {quick.map((chip) => (
                <Chip
                  key={chip.value}
                  active={value === chip.value && !showCalendar}
                  onClick={() => {
                    onChange(chip.value);
                    setShowCalendar(false);
                    setExpanded(false);
                  }}
                >
                  {chip.label}
                </Chip>
              ))}
              <Chip
                icon={<Icon name="calendar" size={15} />}
                active={showCalendar}
                onClick={() => setShowCalendar(true)}
                ariaLabel="Boshqa sanani tanlash"
              >
                Boshqa
              </Chip>
            </ChipRow>
            {showCalendar ? (
              <div className="mt-2">
                <TextInput
                  id={id}
                  type="date"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  aria-label={label}
                  aria-invalid={error ? true : undefined}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      {chips ? (
        <ChipRow>
          {quick.map((chip) => (
            <Chip
              key={chip.value}
              active={value === chip.value && !showCalendar}
              onClick={() => {
                onChange(chip.value);
                setShowCalendar(false);
              }}
            >
              {chip.label}
            </Chip>
          ))}
          <Chip icon={<Icon name="calendar" size={15} />} active={showCalendar} onClick={() => setShowCalendar(true)} ariaLabel="Boshqa sanani tanlash">
            Boshqa
          </Chip>
        </ChipRow>
      ) : null}
      {showCalendar ? (
        <div className="mt-2">
          <TextInput
            id={id}
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            aria-invalid={error ? true : undefined}
          />
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}

/* ============================ Account ============================ */

export const ACCOUNT_TYPE_ICON: Record<string, string> = {
  cash: "wallet",
  uzcard: "card",
  humo: "card",
  bank: "bank",
  ewallet: "phone",
  other: "dot",
};

/**
 * §11: compact selector, never a giant section. A single account is selected
 * automatically and simply *stated* — the app does not ask pointless questions.
 */
export function AccountPicker({
  value,
  onChange,
  label = "Hisob",
  excludeId,
  error,
  includeArchivedId,
  variant = "field",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  excludeId?: string;
  error?: string | null;
  includeArchivedId?: number | null;
  /** See DateField — collapses to one summary line for the add sheet's meta row. */
  variant?: "field" | "inline";
}) {
  const { state } = useFinance();
  const accounts = useMemo(
    () => (state?.accounts ?? []).filter((a) => a.isActive || a.id === includeArchivedId),
    [state?.accounts, includeArchivedId],
  );
  const options = accounts.filter((a) => String(a.id) !== excludeId);
  const selected = options.find((a) => String(a.id) === value) ?? null;
  const onlyId = options.length === 1 ? String(options[0].id) : null;

  // §11: if there is exactly one possible account, select it. Never ask a
  // question that has a single answer.
  useEffect(() => {
    if (onlyId && value !== onlyId) onChange(onlyId);
  }, [onlyId, value, onChange]);

  if (variant === "inline") {
    return (
      <InlineAccountPicker
        options={options}
        value={value}
        onChange={onChange}
        selected={selected}
        error={error}
      />
    );
  }

  if (options.length === 0) {
    return (
      <div className="min-w-0">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-snug text-muted">
          Boshqa faol hisob yo‘q — Hisoblar bo‘limida yangi hisob qo‘shing.
        </p>
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  if (options.length === 1) {
    const only = options[0];
    return (
      <div className="min-w-0">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <p className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-[13.5px]">
          <Icon name={ACCOUNT_TYPE_ICON[only.type]} size={15} className="shrink-0" />
          <span className="min-w-0 break-words font-medium">{only.name}</span>
        </p>
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        {selected ? <span className="min-w-0 truncate text-[11px] text-muted">{selected.name}</span> : null}
      </div>
      <ChipRow>
        {options.map((a) => (
          <Chip
            key={a.id}
            icon={<Icon name={ACCOUNT_TYPE_ICON[a.type]} size={15} />}
            title={a.name}
            active={String(a.id) === value}
            onClick={() => onChange(String(a.id))}
          >
            {a.name}
          </Chip>
        ))}
      </ChipRow>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/* ============================ Note ============================ */

/** §12: notes are optional and collapsed — never a textarea on quick add. */
/**
 * The collapsed account summary: a miniature of the real card material, the
 * account name and its balance. Tapping expands the same chip row the full
 * picker uses, so there is one selection mechanism, not two.
 */
function InlineAccountPicker({
  options,
  value,
  onChange,
  selected,
  error,
}: {
  options: Array<{ id: number; name: string; type: string; currentBalance: number }>;
  value: string;
  onChange: (next: string) => void;
  selected: { id: number; name: string; type: string; currentBalance: number } | null;
  error?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const account = selected ?? options[0] ?? null;
  if (!account) {
    return <p className="text-[12.5px] leading-snug text-muted">Faol hisob yo‘q</p>;
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        disabled={options.length <= 1}
        className="flex min-h-11 w-full min-w-0 items-center gap-2.5 text-left disabled:cursor-default touch-manipulation"
      >
        {/* A 40×28 stand-in for the card itself — the same metal gradient and
            gold chip used on the Accounts screen, so the two read as one object. */}
        <span
          className="relative grid h-7 w-10 shrink-0 place-items-start overflow-hidden rounded-[5px] p-1"
          style={{ background: "var(--card-metal)" }}
          aria-hidden="true"
        >
          <span className="h-1.5 w-2 rounded-[1.5px]" style={{ background: "var(--chip-gold)" }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold leading-tight">{account.name}</span>
          <span className="num block truncate text-[11px] font-semibold leading-tight text-faint">
            {formatAmount(account.currentBalance)}
          </span>
        </span>
        {options.length > 1 ? (
          <Icon
            name="chevron-down"
            size={13}
            className={`shrink-0 text-faint transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        ) : null}
      </button>
      {expanded ? (
        <div className="mt-2">
          <ChipRow>
            {options.map((a) => (
              <Chip
                key={a.id}
                icon={<Icon name={ACCOUNT_TYPE_ICON[a.type]} size={15} />}
                title={a.name}
                active={String(a.id) === value}
                onClick={() => {
                  onChange(String(a.id));
                  setExpanded(false);
                }}
              >
                {a.name}
              </Chip>
            ))}
          </ChipRow>
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}

/**
 * §11/§13 — account and date on ONE strip instead of two full-width blocks.
 * Both are smart-defaulted (last used account, today), so they are corrections
 * rather than decisions and do not deserve a section each. This is the single
 * biggest height saving in the add sheet.
 */
export function MetaRow({ account, date }: { account: ReactNode; date: ReactNode }) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-[18px] px-3.5 py-1.5"
      style={{ background: "var(--tint-neutral)" }}
    >
      <div className="min-w-0 flex-[3]">{account}</div>
      <div className="h-6 w-px shrink-0" style={{ background: "var(--border)" }} aria-hidden="true" />
      <div className="min-w-0 flex-[2]">{date}</div>
    </div>
  );
}

export function NoteField({
  value,
  onChange,
  label = "Izoh",
  placeholder = "Ixtiyoriy izoh",
  multiline = false,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(value));
  const id = useId();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-[13px] font-semibold text-accent-text transition-colors touch-manipulation"
      >
        + {label}
      </button>
    );
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Izoh
      </label>
      {multiline ? (
        <TextArea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <TextInput id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

/* ============================ Choice rows ============================ */

/**
 * The “what are we adding?” step (§48). Used when a flow genuinely needs a
 * type decision BEFORE it can show the right fields.
 */
export function ChoiceList({
  options,
  onSelect,
}: {
  options: Array<{ id: string; label: string; description?: string; icon?: string }>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          className="flex min-h-12 w-full min-w-0 max-w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-left text-[14px] font-medium transition-colors hover:border-line-strong hover:bg-surface-3 active:bg-surface-3 touch-manipulation"
        >
          {option.icon ? (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted" aria-hidden="true">
              <Icon name={option.icon} size={17} />
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block break-words leading-tight">{option.label}</span>
            {option.description ? (
              <span className="mt-0.5 block break-words text-[11.5px] font-normal leading-snug text-muted">
                {option.description}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-muted" aria-hidden="true">
            ›
          </span>
        </button>
      ))}
    </div>
  );
}
