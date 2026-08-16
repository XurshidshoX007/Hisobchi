import { UZ_MONTHS, addDays, parseISO, toISO } from "../money";

/**
 * OCR-tolerant normalization primitives (§19, §20).
 *
 * Everything in this module is pure and synchronous so the financial meaning
 * of an image can be unit-tested without a model, a network call or a DB.
 */

const NBSP = /\u00a0/g;

export function cleanText(input: string): string {
  return input
    .replace(NBSP, " ")
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------ amounts ------------------------------ */

const MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(mlrd|milliard|billion)$/i, 1_000_000_000],
  [/^(mln|million|m)$/i, 1_000_000],
  [/^(ming|k|min)$/i, 1_000],
];

function multiplierOf(unit: string | undefined): number {
  if (!unit) return 1;
  for (const [re, mult] of MULTIPLIERS) if (re.test(unit)) return mult;
  return 1;
}

export type NormalizedAmount = { value: number | null; confidence: number; raw: string };

/**
 * "1 880 000" / "1,880,000" / "1.880.000" / "1880000" → 1880000.
 * "1,5 mln" → 1500000, "150 ming" → 150000.
 *
 * A digit group that is genuinely ambiguous ("1.880" — thousands separator or
 * a decimal?) resolves to the Uzbek reading (1880) but with a reduced
 * confidence so the confirmation layer can ask instead of guessing (§17).
 */
export function normalizeAmount(input: string): NormalizedAmount {
  const text = cleanText(input).toLowerCase().replace(/\bso'?m\b|\bsum\b|\buzs\b|\bsum\.?\b/g, " ");
  const match = text.match(/(\d[\d\s.,]*\d|\d)\s*(mlrd|milliard|billion|mln|million|ming|k)?/i);
  if (!match) return { value: null, confidence: 0, raw: input };

  const digits = match[1].trim();
  const unit = match[2]?.toLowerCase();
  const mult = multiplierOf(unit);

  const separators = digits.match(/[.,\s]/g) ?? [];
  let confidence = 0.99;
  let base: number | null = null;

  if (!separators.length) {
    base = Number(digits);
  } else {
    const lastSep = digits.lastIndexOf(separators[separators.length - 1]);
    const tail = digits.slice(lastSep + 1);
    const uniform = new Set(separators.map((s) => (s === " " ? " " : s))).size === 1;
    const groupsLookLikeThousands = /^\d{1,3}([.,\s]\d{3})+$/.test(digits);

    if (groupsLookLikeThousands && uniform) {
      base = Number(digits.replace(/[.,\s]/g, ""));
      confidence = 0.99;
    } else if (tail.length <= 2 && separators.length === 1 && separators[0] !== " ") {
      // Decimal reading: "1,5 mln" or "12,50".
      base = Number(`${digits.slice(0, lastSep).replace(/[.,\s]/g, "")}.${tail}`);
      confidence = mult > 1 ? 0.97 : 0.9;
    } else {
      base = Number(digits.replace(/[.,\s]/g, ""));
      confidence = 0.75;
    }
  }

  if (base === null || !Number.isFinite(base)) return { value: null, confidence: 0, raw: input };
  const value = Math.round(base * mult * 100) / 100;
  if (value <= 0) return { value: null, confidence: 0, raw: input };
  // A bare small integer ("12", "3") is far more likely a row number or a
  // month count than money: it is reported with low confidence.
  if (value < 100 && mult === 1) confidence = Math.min(confidence, 0.5);
  return { value, confidence, raw: match[0].trim() };
}

/* ------------------------------- dates ------------------------------- */

export type NormalizedDate = { date: string | null; confidence: number; explicit: boolean; raw: string | null };

const MONTH_PATTERNS: Array<[RegExp, number]> = [
  [/yanvar|january|jan\b/, 1],
  [/fevral|february|feb\b/, 2],
  [/mart|march|mar\b/, 3],
  [/aprel|april|apr\b/, 4],
  [/\bmay\b/, 5],
  [/iyun|june|jun\b/, 6],
  [/iyul|july|jul\b/, 7],
  [/avgust|august|aug\b/, 8],
  [/sent[iy]?abr|september|sep\b/, 9],
  [/okt[iy]?abr|october|oct\b/, 10],
  [/noyabr|november|nov\b/, 11],
  [/dekabr|december|dec\b/, 12],
];

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) return null;
  return candidate;
}

/**
 * Extracts a date from an image row. Supports "17-avgust", "20 avgust",
 * "12.08", "12.08.2026", "2026-08-15", "bugun/kecha/ertaga".
 * `dueDay` phrases ("17-sana") are deliberately NOT dates — see `extractDueDay`.
 */
export function normalizeDate(input: string, today: string): NormalizedDate {
  const text = cleanText(input).toLowerCase();
  const year = Number(today.slice(0, 4));

  const relative: Array<[RegExp, number]> = [
    [/\bkechagi\b|\bkecha\b/, -1],
    [/\bbugungi\b|\bbugun\b/, 0],
    [/\bertangi\b|\bertaga\b/, 1],
  ];
  for (const [re, offset] of relative) {
    const m = text.match(re);
    if (m) return { date: addDays(today, offset), confidence: 0.95, explicit: true, raw: m[0] };
  }

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const value = iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (value) return { date: value, confidence: 0.99, explicit: true, raw: isoMatch[0] };
  }

  for (const [re, month] of MONTH_PATTERNS) {
    const m = text.match(new RegExp(`\\b(\\d{1,2})\\s*[-.]?\\s*(?:${re.source})[a-z']*`));
    if (m) {
      const value = iso(year, month, Number(m[1]));
      if (value) return { date: value, confidence: 0.97, explicit: true, raw: m[0] };
    }
  }

  // "12.08" / "12.08.2026" / "12/08" — day-first (Uzbek convention).
  const dotted = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const rawYear = dotted[3] ? Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]) : year;
    const value = iso(rawYear, month, day);
    if (value) return { date: value, confidence: dotted[3] ? 0.95 : 0.88, explicit: true, raw: dotted[0] };
  }

  return { date: null, confidence: 0, explicit: false, raw: null };
}

/** "17-sana", "har oyning 17-kuni", "17 sanada" → 17 (a monthly due day). */
export function extractDueDay(input: string): { dueDay: number | null; raw: string | null } {
  const text = cleanText(input).toLowerCase();
  const m = text.match(/\b(\d{1,2})\s*[-.]?\s*(sana|sanada|kun|kuni|chi kun)\b/);
  if (!m) return { dueDay: null, raw: null };
  const day = Number(m[1]);
  if (day < 1 || day > 31) return { dueDay: null, raw: null };
  return { dueDay: day, raw: m[0] };
}

/** "12 oy", "12 oylik", "24 oyga" → 12 installments. */
export function extractDuration(input: string): { months: number | null; raw: string | null } {
  const text = cleanText(input).toLowerCase();
  const m = text.match(/\b(\d{1,3})\s*(oy|oylik|oyga|oyda|month|months)\b/);
  if (!m) return { months: null, raw: null };
  const months = Number(m[1]);
  if (months < 1 || months > 600) return { months: null, raw: null };
  return { months, raw: m[0] };
}

/** Monthly `dueDay` → the next occurrence on/after `today`. */
export function nextDueDateFor(dueDay: number, today: string): string {
  const day = Math.min(28, Math.max(1, dueDay));
  const base = parseISO(today);
  const candidate = new Date(base.getFullYear(), base.getMonth(), day);
  if (candidate.getTime() >= base.getTime()) return toISO(candidate);
  return toISO(new Date(base.getFullYear(), base.getMonth() + 1, day));
}

export function monthNameOf(isoDate: string): string {
  return UZ_MONTHS[parseISO(isoDate).getMonth()];
}
