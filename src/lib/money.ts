export const UZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** The single sign used for negative financial values throughout the product. */
export const FINANCIAL_MINUS = "−";

function numericValue(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function groupInteger(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Canonical exact amount formatter. Currency is deliberately kept separate.
 * Integers do not receive a synthetic `.00`; real fractions keep two digits.
 *
 * 12480000 -> "12 480 000"
 * 1250.5   -> "1 250.50"
 */
export function formatAmount(value: number | null | undefined): string {
  const rounded = roundCurrency(Math.abs(numericValue(value)));
  const [integer, decimals] = rounded.toFixed(2).split(".");
  const sign = numericValue(value) < 0 && rounded !== 0 ? FINANCIAL_MINUS : "";
  return `${sign}${groupInteger(integer)}${decimals === "00" ? "" : `.${decimals}`}`;
}

/** Exact amount plus a caller-selected currency label. */
export function formatMoney(value: number | null | undefined, currency: string): string {
  const label = currency.trim();
  return label ? `${formatAmount(value)} ${label}` : formatAmount(value);
}

/** Exact amount with a leading plus for income and the canonical minus for expense. */
export function formatSigned(value: number): string {
  if (value > 0) return `+${formatAmount(value)}`;
  return formatAmount(value);
}

const COMPACT_UNITS = [
  { value: 1_000_000_000_000, label: "trln" },
  { value: 1_000_000_000, label: "mlrd" },
  { value: 1_000_000, label: "mln" },
  { value: 1_000, label: "ming" },
] as const;

/**
 * Human-readable compact amount for secondary prose and crowded summaries.
 * It decomposes units instead of expressing a larger unit as thousands:
 * 1_200_000 -> "1 mln 200 ming", never "1200 ming".
 *
 * Every integer is represented without rounding loss. Fractional amounts fall
 * back to the exact formatter because dropping sub-unit digits would alter the
 * financial meaning.
 */
export function formatCompactAmount(value: number | null | undefined): string {
  const n = numericValue(value);
  const rounded = roundCurrency(Math.abs(n));
  if (rounded < 1_000 || !Number.isInteger(rounded)) return formatAmount(n);

  let remainder = rounded;
  const parts: string[] = [];
  for (const unit of COMPACT_UNITS) {
    const count = Math.floor(remainder / unit.value);
    if (!count) continue;
    parts.push(`${count} ${unit.label}`);
    remainder %= unit.value;
  }
  if (remainder) parts.push(formatAmount(remainder));

  return `${n < 0 ? FINANCIAL_MINUS : ""}${parts.join(" ")}`;
}

function oneDecimal(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

/**
 * Intentionally rounded, one-decimal formatter for genuinely tiny visuals
 * such as chart axes. Financial records and tooltips must use formatAmount.
 */
export function formatShortAmount(value: number | null | undefined): string {
  const n = numericValue(value);
  const amount = Math.abs(n);
  if (amount < 1_000) return formatAmount(n);

  let unitIndex = COMPACT_UNITS.findIndex((unit) => amount >= unit.value);
  let unit = COMPACT_UNITS[unitIndex];
  let scaled = Math.round(((amount / unit.value) + Number.EPSILON) * 10) / 10;

  // Avoid boundary artifacts such as "1000 ming" after short rounding.
  if (scaled >= 1_000 && unitIndex > 0) {
    unitIndex -= 1;
    unit = COMPACT_UNITS[unitIndex];
    scaled = Math.round(((amount / unit.value) + Number.EPSILON) * 10) / 10;
  }

  return `${n < 0 ? FINANCIAL_MINUS : ""}${oneDecimal(scaled)} ${unit.label}`;
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Project timezone model: every financial "day" is a calendar day in the
 * user's timezone (Uzbekistan by default), never the server's. Railway/CI
 * servers run in UTC, so between 00:00 and 05:00 Tashkent time a naive
 * `new Date()` still reports *yesterday* — which used to push fresh
 * transactions out of "today"/month aggregations. `APP_TIMEZONE` overrides
 * the zone; in the browser the local zone is already the user's zone.
 */
export const DEFAULT_TIMEZONE = "Asia/Tashkent";

function appTimeZone(): string {
  if (typeof process !== "undefined" && process.env?.APP_TIMEZONE) return process.env.APP_TIMEZONE;
  return DEFAULT_TIMEZONE;
}

/**
 * The calendar day of `instant` in a given timezone — the testable core of
 * `todayISO()`. A Telegram message sent at 00:05 Tashkent time must be booked
 * on the new Uzbek day even though the server clock (UTC) still reports
 * yesterday, otherwise the bot's transaction and the balance disagree about
 * which day (and which month) the money moved.
 */
export function todayISOAt(instant: Date, timeZone: string = appTimeZone()): string {
  try {
    // en-CA yields YYYY-MM-DD directly.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return toISO(instant);
  }
}

/** today (in the project timezone) as YYYY-MM-DD */
export function todayISO(): string {
  // In the browser the device clock already reflects the user's zone.
  if (typeof window !== "undefined") return toISO(new Date());
  return todayISOAt(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISO(d);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(iso: string): string {
  return `${monthKey(iso)}-01`;
}

export function monthEnd(iso: string): string {
  const d = parseISO(iso);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toISO(last);
}

export function lastNMonths(n: number, from = todayISO()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(monthKey(addMonths(monthStart(from), -i)));
  return keys;
}

export function dayDiff(from: string, to: string): number {
  const a = parseISO(from).getTime();
  const b = parseISO(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 2026-08-18 -> "18-avg" */
export function shortDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function humanDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${UZ_MONTHS[(m ?? 1) - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

/**
 * Human relative day (§9). Cryptic counters like "17k" are never information:
 * a date is only useful next to a plain-language distance from today.
 *   0 → "Bugun", 1 → "Ertaga", 4 → "4 kundan keyin", -3 → "3 kun kechikdi".
 */
export function relativeDayLabel(daysLeft: number): string {
  if (daysLeft === 0) return "Bugun";
  if (daysLeft === 1) return "Ertaga";
  if (daysLeft === -1) return "Kecha";
  if (daysLeft > 1) return `${daysLeft} kundan keyin`;
  return `${Math.abs(daysLeft)} kun kechikdi`;
}

/** Short, dense variant used inside chips: "Bugun", "3 kun qoldi", "2 kun kech". */
export function relativeDayShort(daysLeft: number): string {
  if (daysLeft === 0) return "Bugun";
  if (daysLeft === 1) return "Ertaga";
  if (daysLeft > 1) return `${daysLeft} kun qoldi`;
  return `${Math.abs(daysLeft)} kun kechikdi`;
}

/** "2026-08-17" → "17 avg" (day + short month, no year noise). */
export function dayMonth(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${UZ_MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
