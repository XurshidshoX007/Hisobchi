/**
 * Shared, PURE building blocks of the global “+” add flow.
 *
 * Everything the create/edit sheets need to agree on — amount formatting,
 * smart defaults, category ranking, date chips, dirty detection and success
 * copy — lives here so it is testable without a DOM and identical in every
 * form. No React, no finance logic, no mutations.
 */

import { addDays, formatAmount, todayISO } from "@hisobchi/shared/lib/money";

/* ============================ Amount input ============================ */

/**
 * Live display formatting for the most important field in the product.
 * `1200000` → `1 200 000`. The *stored* numeric value is never changed:
 * `parseAmountInput` always reverses the grouping.
 */
export function formatAmountInput(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).replace(/[^\d.,]/g, "").replace(/\./g, ",");
  const firstComma = s.indexOf(",");
  if (firstComma >= 0) s = `${s.slice(0, firstComma + 1)}${s.slice(firstComma + 1).replace(/,/g, "")}`;
  const [intRaw = "", decRaw] = s.split(",");
  // Strip leading zeros but keep a single "0" (so "0" and "0,5" still type).
  const int = intRaw.replace(/^0+(?=\d)/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (decRaw === undefined) return grouped;
  return `${grouped || "0"},${decRaw.slice(0, 2)}`;
}

/** Reverse of `formatAmountInput` — the value that reaches the mutation. */
export function parseAmountInput(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/\s/g, "").replace(/,/g, ".").trim();
  if (!cleaned || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * ONE amount validation vocabulary for every sheet (§28): a specific,
 * actionable sentence — never a generic “Xatolik”.
 */
export function amountError(raw: string | number | null | undefined, label = "Summani kiriting"): string | null {
  const value = parseAmountInput(raw);
  if (value === null) return label;
  if (value <= 0) return "Summa 0 dan katta bo‘lishi kerak";
  return null;
}

/** Adds a quick amount to whatever is currently typed, returning display text. */
export function addQuickAmount(current: string, delta: number): string {
  const base = parseAmountInput(current) ?? 0;
  return formatAmountInput(String(Math.round(base + delta)));
}

/** §8: a short, non-cluttering ladder. Bigger ladders are noise, not speed. */
export const QUICK_AMOUNTS = [50_000, 100_000, 500_000, 1_000_000] as const;

export function quickAmountLabel(value: number): string {
  if (value >= 1_000_000) {
    const mln = value / 1_000_000;
    return `+${Number.isInteger(mln) ? mln : mln.toFixed(1).replace(".", ",")} mln`;
  }
  return `+${Math.round(value / 1000)}k`;
}

/* ============================ Category ranking ============================ */

export type CategoryUsage = { categoryId: number | null; date: string };

/**
 * §9: recent first, then frequent, then the rest — so daily entry never means
 * scanning a 30-item grid. `usage` is expected newest-first; the ranking is
 * stable and pure so it can be asserted in tests.
 */
export function rankCategoryIds(usage: CategoryUsage[], available: number[], limit = 6): number[] {
  const allowed = new Set(available);
  const recency: number[] = [];
  const freq = new Map<number, number>();
  for (const item of usage) {
    const id = item.categoryId;
    if (id === null || id === undefined || !allowed.has(id)) continue;
    freq.set(id, (freq.get(id) ?? 0) + 1);
    if (!recency.includes(id)) recency.push(id);
  }
  const scored = [...freq.entries()].map(([id, count]) => ({
    id,
    // Recency dominates (a category used today outranks last month's habit),
    // frequency breaks ties between similarly recent categories.
    score: Math.max(0, 8 - recency.indexOf(id)) * 3 + count,
  }));
  scored.sort((a, b) => b.score - a.score || recency.indexOf(a.id) - recency.indexOf(b.id));
  const ranked = scored.slice(0, limit).map((s) => s.id);
  for (const id of available) {
    if (ranked.length >= limit) break;
    if (!ranked.includes(id)) ranked.push(id);
  }
  return ranked;
}

/** Free-text category search: name match, diacritics-insensitive enough for uz. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q);
}

/* ============================ Date UX ============================ */

export type DateChip = { label: string; value: string };

/** §10: Bugun / Kecha / Oldingi kun — the calendar stays one tap away. */
export function dateQuickChips(today: string = todayISO()): DateChip[] {
  return [
    { label: "Bugun", value: today },
    { label: "Kecha", value: addDays(today, -1) },
    { label: "Oldingi kun", value: addDays(today, -2) },
  ];
}

export function dateChipLabel(value: string, today: string = todayISO()): string | null {
  return dateQuickChips(today).find((chip) => chip.value === value)?.label ?? null;
}

/* ============================ Smart defaults ============================ */

const ACCOUNT_KEY = "pfos-last-account";

export function lastAccountId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const value = Number(window.localStorage.getItem(ACCOUNT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberAccountId(id: number | null | undefined): void {
  if (typeof window === "undefined" || !id) return;
  try {
    window.localStorage.setItem(ACCOUNT_KEY, String(id));
  } catch {
    /* private mode — ignore */
  }
}

/**
 * §37: a smart default must be *correct*, visible and editable. Order:
 * remembered account → single account → first active account.
 */
export function resolveDefaultAccountId(
  accounts: Array<{ id: number; isActive: boolean }>,
  remembered: number | null,
): number | null {
  const active = accounts.filter((a) => a.isActive);
  if (remembered && active.some((a) => a.id === remembered)) return remembered;
  if (active.length === 1) return active[0].id;
  return active[0]?.id ?? accounts[0]?.id ?? null;
}

/* ============================ Draft protection ============================ */

export type DraftValue = string | number | boolean | null | undefined;

/**
 * §29: ask “are you sure” ONLY when meaningful data would be lost. An
 * untouched form (or one that still equals the record being edited) closes
 * silently.
 */
export function isDirtyDraft(current: Record<string, DraftValue>, initial: Record<string, DraftValue>): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(initial)]);
  for (const key of keys) {
    const a = normalizeDraftValue(current[key]);
    const b = normalizeDraftValue(initial[key]);
    if (a !== b) return true;
  }
  return false;
}

function normalizeDraftValue(value: DraftValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).trim();
}

/* ============================ Success copy ============================ */

const SAVED_NOUN: Record<string, string> = {
  income: "daromad",
  expense: "xarajat",
  transfer: "transfer",
};

/**
 * §27: short, specific confirmation — “150 000 so‘mlik xarajat saqlandi” —
 * instead of a generic toast or a full-screen success page.
 */
export function savedMessage(kind: string, amount?: number | null, currency = "so‘m"): string {
  const noun = SAVED_NOUN[kind] ?? kind;
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return `${capitalize(noun)} saqlandi`;
  }
  return `${formatAmount(amount)} ${currency}lik ${noun} saqlandi`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
