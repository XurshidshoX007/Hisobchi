import { addDays, todayISO } from "./money";

/**
 * Natural language amount + intent parser for Uzbek input.
 * "150 ming ovqatga ketdi"  ->  expense 150000 / Oziq-ovqat
 * "1,5 mln maosh keldi"     ->  income 1500000 / Ish haqi
 * "2.5 mln ijara to'ladim"  ->  expense 2500000 / Ijara
 *
 * A single message may contain several operations:
 * "150 ming ovqat, 200 ming taksi, 1 mln maosh keldi" -> 3 drafts.
 * `parseDrafts` is the batch entry point; `parseDraft` parses one segment.
 */

const MULTIPLIERS: Array<[RegExp, number]> = [
  [/mlrd|milliard/i, 1_000_000_000],
  [/mln|million|mln\b/i, 1_000_000],
  [/ming|m\b/i, 1_000],
];

export const CATEGORY_KEYWORDS: Array<{ name: string; words: string[] }> = [
  { name: "Oziq-ovqat", words: ["ovqat", "oziq", "non", "yemek", "kafe", "restoran", "produk", "bazarsavdo"] },
  { name: "Transport", words: ["transport", "taksi", "yandex", "benzin", "avtobus", "metro", "yo'l", "yol", "gsm", "gazoline"] },
  { name: "Ijara", words: ["ijara", "kvartira", "uy ijarasi", "arenda"] },
  { name: "Kommunal", words: ["kommunal", "elektr", "suv", "gaz", "issiq", "quvvat"] },
  { name: "Kredit", words: ["kredit", "muddatli", "qariz tolovi", "loan", "ipoteka"] },
  { name: "Telefon / Internet", words: ["telefon", "internet", "wifi", "aloqa", "mobayl", "ussd", "operator"] },
  { name: "Oila", words: ["oila", "bola", "ayol", "ota", "ona", "qarindosh", "sovg'a", "sovga"] },
  { name: "Kiyim", words: ["kiyim", "kish", "oyok kiyim", "kurtka", "train"] },
  { name: "Sog'liq", words: ["sog'liq", "soglik", "dori", "dorixona", "shifokor", "vrach", "tibbiy", "analiz"] },
  { name: "Ta'lim", words: ["ta'lim", "talim", "kurs", "o'quv", "ouvw", "maktab", "university", "kitob"] },
  { name: "Ko'ngilochar", words: ["ko'ngilochar", "kongilochar", "film", "kinoteatr", "sayohat", "gym", "sport", "kafe"] },
  { name: "Uy / Ta'mirlash", words: ["uy", "mebel", "tamin", "ta'mirlash", "remont", "texnika"] },
  { name: "Ish haqi", words: ["maosh", "ish haqi", "oylik", "zarplata", "salary", "ishxona"] },
  { name: "Biznes", words: ["biznes", "savdo", "tadbirkorlik", "do'kon", "dokon", "kassa", "client", "mijoz"] },
  { name: "Bonus", words: ["bonus", "mukofot", "premiya", "mukofotlar", "keshbek", "cashback", "kesh bek"] },
  { name: "Qo'shimcha daromad", words: ["qo'shimcha", "freelance", "frilans", "qoshimcha", "yordam puli"] },
  { name: "Qarz qaytishi", words: ["qarz qaytdi", "qaytardi", "qarzini qaytardi", "oldim qarzni", "qarzdorlik qaytdi"] },
];

/** Categories that imply an income even without an explicit income verb. */
const INCOME_CATEGORIES = new Set(["Ish haqi", "Bonus", "Qo'shimcha daromad", "Qarz qaytishi"]);

const INCOME_WORDS = [
  "kirim", "daromad", "keldi", "oldim", "maosh", "oylik", "bonus", "tushdi", "qabul qildim",
  "daromadim", "kirdi", "olindi", "kirim qildim", "qaytdi", "cashback", "keshbek",
];
const EXPENSE_WORDS = [
  "chiqim", "xarajat", "ketdi", "sarfladim", "sarf", "to'ladim", "toladim", "harid", "sotib oldim",
  "xarajatim", "keddi", "to'lov", "tolov qildim", "berdim", "toldim",
];
const TRANSFER_WORDS = ["transfer", "o'tkazdim", "otkazdim", "utkazdim", "o'tkazma", "otkazma", "perervod"];

export type ParsedDraft = {
  ok: boolean;
  type: "income" | "expense" | "transfer";
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  estimated: boolean;
  categoryName: string | null;
  date: string;
  note: string;
  confidence: number;
  missing: string[];
};

export type ParsedBatch = {
  drafts: ParsedDraft[];
  /** Segments that contained a number but could not be parsed into an operation. */
  failed: string[];
};

function parseNumberToken(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Parses "150 ming", "1.5 mln", "2 500 000", "300-500 ming" */
export function parseAmountRange(text: string): {
  amount: number | null;
  min: number | null;
  max: number | null;
  estimated: boolean;
} {
  const normalized = text.replace(/\u00a0/g, " ").toLowerCase();
  const rangeMatch = normalized.match(
    /(\d[\d\s.,]*)\s*(ming|mln|million|mlrd)?\s*(?:-|–|dan|ga)\s*(\d[\d\s.,]*)\s*(ming|mln|million|mlrd)?/,
  );
  if (rangeMatch) {
    const unit = (rangeMatch[2] ?? rangeMatch[4] ?? "").trim();
    const mult = unitMultiplier(unit);
    const a = parseNumberToken(rangeMatch[1]);
    const b = parseNumberToken(rangeMatch[3]);
    if (a !== null && b !== null) {
      const min = Math.min(a, b) * mult;
      const max = Math.max(a, b) * mult;
      return { amount: (min + max) / 2, min, max, estimated: true };
    }
  }

  const plain = normalized.match(/(\d[\d\s.,]*)\s*(ming|mln|million|mlrd)?/);
  if (plain) {
    const mult = unitMultiplier((plain[2] ?? "").trim());
    const value = parseNumberToken(plain[1]);
    if (value !== null) {
      return { amount: value * mult, min: null, max: null, estimated: false };
    }
  }
  return { amount: null, min: null, max: null, estimated: false };
}

function unitMultiplier(unit: string): number {
  for (const [re, mult] of MULTIPLIERS) {
    if (unit && re.test(unit)) return mult;
  }
  return 1;
}

export function detectCategory(text: string): string | null {
  const normalized = text.toLowerCase().replace(/[’']/g, "'");
  let best: { name: string; score: number } | null = null;
  for (const cat of CATEGORY_KEYWORDS) {
    for (const word of cat.words) {
      if (normalized.includes(word)) {
        const score = word.length;
        if (!best || score > best.score) best = { name: cat.name, score };
      }
    }
  }
  return best?.name ?? null;
}

/* ------------------------------ dates ------------------------------ */

const UZ_MONTH_TOKENS: Array<[RegExp, number]> = [
  [/yanvar/, 1],
  [/fevral/, 2],
  [/mart/, 3],
  [/aprel/, 4],
  [/may/, 5],
  [/iyun/, 6],
  [/iyul/, 7],
  [/avgust/, 8],
  [/sent[iy]?abr/, 9],
  [/okt[iy]?abr/, 10],
  [/noyabr/, 11],
  [/dekabr/, 12],
];

/**
 * Extracts an explicit date phrase from Uzbek text.
 * Supported: "kecha", "bugun", "ertaga", "15-avgust", "15 avgust", "2026-08-15".
 * The matched token is removed from the returned text so it cannot be
 * mistaken for an amount ("15-avgust 500 ming" must parse 500 000, not 15).
 */
export function extractDate(
  input: string,
  baseDate = todayISO(),
): { date: string; cleaned: string; explicit: boolean } {
  const normalized = input.replace(/[’‘]/g, "'");
  const lower = normalized.toLowerCase();

  const relative: Array<[RegExp, number]> = [
    [/\bkechagi\b|\bkecha\b/, -1],
    [/\bbugungi\b|\bbugun\b/, 0],
    [/\bertangi\b|\bertaga\b/, 1],
  ];
  for (const [re, offset] of relative) {
    const m = lower.match(re);
    if (m) {
      const cleaned = (normalized.slice(0, m.index) + normalized.slice((m.index ?? 0) + m[0].length)).trim();
      return { date: addDays(baseDate, offset), cleaned, explicit: true };
    }
  }

  // ISO date: 2026-08-15
  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const cleaned = (normalized.slice(0, iso.index) + normalized.slice((iso.index ?? 0) + iso[0].length)).trim();
    return { date: iso[0], cleaned, explicit: true };
  }

  // "15-avgust", "15 avgustda", "15avgust"
  for (const [re, month] of UZ_MONTH_TOKENS) {
    const m = lower.match(new RegExp(`\\b(\\d{1,2})\\s*[-–]?\\s*(${re.source})[a-z']*`));
    if (m) {
      const day = Number(m[1]);
      if (day >= 1 && day <= 31) {
        const year = Number(baseDate.slice(0, 4));
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const cleaned = (normalized.slice(0, m.index) + normalized.slice((m.index ?? 0) + m[0].length)).trim();
        return { date, cleaned, explicit: true };
      }
    }
  }

  return { date: baseDate, cleaned: normalized, explicit: false };
}

/* ------------------------------ single draft ------------------------------ */

export function parseDraft(input: string, baseDate = todayISO()): ParsedDraft {
  const text = input.trim();
  const { date, cleaned, explicit } = extractDate(text, baseDate);
  const normalized = cleaned.toLowerCase().replace(/[’']/g, "'");
  // Amount is parsed from the date-free text: "15-avgust 500 ming ijara"
  // must yield 500 000, never 15.
  const range = parseAmountRange(cleaned);

  const categoryName = detectCategory(cleaned);

  // Longest keyword wins: "sotib oldim" (expense) must beat "oldim" (income).
  const longestHit = (words: string[]) =>
    words.reduce((best, w) => (normalized.includes(w) && w.length > best ? w.length : best), 0);
  let type: ParsedDraft["type"] = "expense";
  if (TRANSFER_WORDS.some((w) => normalized.includes(w))) {
    type = "transfer";
  } else {
    const incomeScore = longestHit(INCOME_WORDS);
    const expenseScore = longestHit(EXPENSE_WORDS);
    if (incomeScore > expenseScore) type = "income";
    else if (expenseScore > 0) type = "expense";
    else if (categoryName && INCOME_CATEGORIES.has(categoryName)) type = "income";
  }

  const missing: string[] = [];
  if (range.amount === null) missing.push("summa");

  void explicit;
  return {
    ok: range.amount !== null,
    type,
    amount: range.amount,
    minAmount: range.min,
    maxAmount: range.max,
    estimated: range.estimated,
    categoryName: type === "transfer" ? null : categoryName,
    date,
    note: text.length > 60 ? text.slice(0, 60) : text,
    confidence: range.amount !== null ? (categoryName ? 0.9 : 0.65) : 0.2,
    missing,
  };
}

/* ------------------------------ batch ------------------------------ */

/**
 * Splits one Telegram message into operation segments.
 * Boundaries: newlines, semicolons, "," (except decimal commas like "1,5 mln"),
 * and " va "/" hamda " when followed by a number.
 * Segments without any digit are appended to the previous segment as context.
 */
export function splitOperations(input: string): string[] {
  const parts = input
    .split(/\n+|;+|,(?!\d)|\s+(?:va|hamda)\s+(?=\d)/i)
    .map((s) => s.trim().replace(/^[-•–]\s*/, ""))
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/\d/.test(p) || out.length === 0) out.push(p);
    else out[out.length - 1] += `, ${p}`;
  }
  return out;
}

/**
 * Batch entry point: one message -> list of drafts.
 * Partial success: a malformed segment lands in `failed` and never blocks
 * the other operations. A leading date phrase ("kecha ...") applies to all
 * items unless an item carries its own explicit date.
 */
export function parseDrafts(input: string, baseDate = todayISO()): ParsedBatch {
  const text = input.trim();
  if (!text) return { drafts: [], failed: [] };

  const segments = splitOperations(text);
  if (segments.length === 0) return { drafts: [], failed: [] };

  // A date phrase in the first segment sets the default date for the batch.
  // The phrase is consumed so it is not applied twice to the first item.
  const lead = extractDate(segments[0], baseDate);
  const batchBase = lead.explicit ? lead.date : baseDate;
  if (lead.explicit) segments[0] = lead.cleaned;

  const drafts: ParsedDraft[] = [];
  const failed: string[] = [];
  for (const segment of segments) {
    if (!segment.trim()) continue;
    // A per-item explicit date ("bugun", "15-avgust") is resolved against the
    // real base date; items without one inherit the batch date.
    const own = extractDate(segment, baseDate);
    const draft = parseDraft(own.explicit ? segment : segment, own.explicit ? baseDate : batchBase);
    if (draft.ok && draft.amount !== null && draft.amount > 0) drafts.push(draft);
    else if (/\d/.test(segment)) failed.push(segment);
  }
  return { drafts, failed };
}
