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
import { Sheet, TextArea, TextInput } from "./ui";
import { useFinance } from "./providers";
import {
  QUICK_AMOUNTS,
  addQuickAmount,
  dateQuickChips,
  formatAmountInput,
  matchesQuery,
  quickAmountLabel,
  rankCategoryIds,
} from "@/lib/form-kit";
import { todayISO } from "@/lib/money";

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
  submitLabel,
  submittingLabel = "Saqlanmoqda…",
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
      setError(result.message || "Saqlab bo‘lmadi. Qayta urinib ko‘ring.");
      setStatus("idle");
      busyRef.current = false;
    } catch {
      setError("Ulanish uzildi. Qayta urinib ko‘ring.");
      setStatus("idle");
      busyRef.current = false;
    }
  }

  const busy = status !== "idle";
  const label = status === "saving" ? submittingLabel : status === "saved" ? savedLabel : submitLabel;

  return (
    <Sheet
      open={open}
      onClose={requestClose}
      title={title}
      subtitle={subtitle}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || busy}
          aria-busy={status === "saving"}
          className="inline-flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-fg shadow-sm transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:bg-surface-3 disabled:text-muted disabled:shadow-none touch-manipulation"
        >
          {status === "saved" ? <CheckMark /> : null}
          {label}
        </button>
      }
    >
      {error ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-negative bg-negative-soft px-3.5 py-2.5"
        >
          <p className="min-w-0 text-[12.5px] leading-snug text-negative-text">{error}</p>
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
        <div className="absolute inset-0 z-20 flex items-end bg-black/35 px-4 pb-4 sm:items-center sm:justify-center">
          <div className="w-full rounded-2xl border border-line bg-surface p-4 shadow-xl sm:max-w-xs">
            <p className="text-[14px] font-semibold">Saqlanmagan ma’lumot bor</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted">Chiqsangiz kiritilgan ma’lumot yo‘qoladi.</p>
            <div className="mt-3 flex gap-2">
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
    </Sheet>
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
    <section className={`space-y-2 ${className}`}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
          {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Collapsed “QO‘SHIMCHA” block (§6/§24). Never open by default. */
export function AdvancedSection({ label = "Qo‘shimcha", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t border-line pt-3">
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
        <div id={id} className="mt-2 space-y-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Compact “this is what you are about to save” block (§15/§16/§48). */
export function PreviewCard({ label = "Ko‘rinishi", children }: { label?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3.5 py-3">
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

export function Chip({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
        active
          ? "border-transparent bg-primary text-primary-fg"
          : "border-line bg-surface text-fg-soft hover:border-line-strong hover:text-fg active:bg-surface-3"
      }`}
    >
      {children}
    </button>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">{children}</div>;
}

/* ============================ Amount ============================ */

/**
 * §8: THE field. Numeric keypad, live `1 200 000` grouping, optional quick
 * ladder, inline error. The parent still owns the raw string state so the
 * stored numeric value is never mutated behind its back.
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
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  currency?: string;
  error?: string | null;
  autoFocus?: boolean;
  quick?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
      >
        {label}
      </label>
      <div
        className={`rounded-2xl border bg-surface-2 px-4 py-3 transition-colors ${
          error ? "border-negative" : "border-line focus-within:border-accent"
        }`}
      >
        <div className="flex items-baseline gap-2">
          <input
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
            className="num w-full min-w-0 bg-transparent text-[30px] font-bold leading-none outline-none placeholder:text-faint sm:text-[32px]"
          />
          {currency ? <span className="shrink-0 text-sm font-medium text-muted">{currency}</span> : null}
        </div>
        {quick ? (
          <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => onChange(addQuickAmount(value, amount))}
                className="min-h-9 shrink-0 touch-manipulation rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-fg-soft transition-colors hover:border-accent hover:text-accent-text active:scale-95"
              >
                {quickAmountLabel(amount)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
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
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-[12px] font-semibold text-accent-text touch-manipulation"
        >
          {expanded ? "Yopish" : "Barchasi →"}
        </button>
      </div>

      {!expanded ? (
        <ChipRow>
          {ranked.map((c) => (
            <Chip key={c.id} active={String(c.id) === value} onClick={() => onChange(String(c.id))}>
              <span aria-hidden="true">{c.icon}</span>
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
          <div className="max-h-52 space-y-0.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-2 p-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(String(c.id));
                  setExpanded(false);
                  setQuery("");
                }}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13.5px] transition-colors touch-manipulation ${
                  String(c.id) === value ? "bg-accent-soft font-semibold text-accent-text" : "hover:bg-surface-3"
                }`}
              >
                <span aria-hidden="true">{c.icon}</span>
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
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  error?: string | null;
  chips?: boolean;
}) {
  const today = todayISO();
  const quick = useMemo(() => dateQuickChips(today), [today]);
  const isQuick = quick.some((chip) => chip.value === value);
  const [showCalendar, setShowCalendar] = useState(!chips || !isQuick);
  const id = useId();

  return (
    <div>
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
          <Chip active={showCalendar} onClick={() => setShowCalendar(true)} ariaLabel="Boshqa sanani tanlash">
            📅 Boshqa
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
  cash: "💵",
  uzcard: "💳",
  humo: "💳",
  bank: "🏦",
  ewallet: "📱",
  other: "•",
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
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  excludeId?: string;
  error?: string | null;
  includeArchivedId?: number | null;
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

  if (options.length === 0) {
    return (
      <div>
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
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <p className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-[13.5px]">
          <span aria-hidden="true">{ACCOUNT_TYPE_ICON[only.type] ?? "•"}</span>
          <span className="min-w-0 truncate font-medium">{only.name}</span>
        </p>
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        {selected ? <span className="truncate text-[11px] text-muted">{selected.name}</span> : null}
      </div>
      <ChipRow>
        {options.map((a) => (
          <Chip key={a.id} active={String(a.id) === value} onClick={() => onChange(String(a.id))}>
            <span aria-hidden="true">{ACCOUNT_TYPE_ICON[a.type] ?? "•"}</span>
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
export function NoteField({
  value,
  onChange,
  label = "Izoh qo‘shish",
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
    <div>
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
    <div className="-mx-1.5 space-y-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[14px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-3 touch-manipulation"
        >
          {option.icon ? (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-base" aria-hidden="true">
              {option.icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{option.label}</span>
            {option.description ? (
              <span className="block truncate text-[11.5px] font-normal text-muted">{option.description}</span>
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
