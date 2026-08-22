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

/** User-facing currency label shared by every dashboard amount. */
export function currencyLabel(currency: string): string {
  return currency === "UZS" ? "so‘m" : currency;
}

/**
 * Hard upper bound for any single money value accepted at an input boundary.
 *
 * Chosen so precision can NEVER silently degrade: with 2 decimal places the
 * cents-domain integer is amount×100 ≤ 999 999 999 999 999, safely below the
 * IEEE-754 exact-integer limit 2^53 ≈ 9 007 199 254 740 992. Every accepted
 * amount therefore round-trips exactly through numeric(18,2) ⇄ JS number.
 * ~10 trillion UZS per value is far beyond any personal-finance reality.
 */
export const MAX_MONEY = 9_999_999_999_999.99;

/**
 * The canonical numeric boundary for money in this project.
 * PostgreSQL stores numeric(18,2); every JS boundary therefore normalizes to
 * the same two-decimal contract before a value is rendered or aggregated.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

/** 12480000 -> "12 480 000", 7532.96 -> "7 532,96" */
export function formatAmount(value: number | null | undefined): string {
  const rounded = roundMoney(Number(value ?? 0));
  const [integer, fraction = ""] = Math.abs(rounded).toFixed(2).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimals = fraction.replace(/0+$/, "");
  const sign = rounded < 0 ? "-" : "";
  return decimals ? `${sign}${grouped},${decimals}` : `${sign}${grouped}`;
}

export function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatAmount(Math.abs(value))}`;
}

/** 12 480 000 -> "12,5 mln" */
export function compact(value: number | null | undefined): string {
  const n = Math.abs(Number(value ?? 0));
  if (n >= 1_000_000_000) return `${trim(n / 1_000_000_000)} mlrd`;
  if (n >= 1_000_000) return `${trim(n / 1_000_000)} mln`;
  if (n >= 1_000) return `${trim(n / 1_000)} ming`;
  return formatAmount(n);
}

function trim(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
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
  return roundMoney(n);
}
