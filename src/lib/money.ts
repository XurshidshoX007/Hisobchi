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

/** 12480000 -> "12 480 000" */
export function formatAmount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const rounded = Math.round(n * 100) / 100;
  const [int, dec] = Math.abs(rounded).toString().split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = rounded < 0 ? "-" : "";
  return dec ? `${sign}${grouped}.${dec.slice(0, 2)}` : `${sign}${grouped}`;
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

/** today (server/local) as YYYY-MM-DD */
export function todayISO(): string {
  const d = new Date();
  return toISO(d);
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

export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
