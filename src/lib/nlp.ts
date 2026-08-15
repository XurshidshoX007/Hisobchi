import { addDays, todayISO } from "./money";

/**
 * Natural language amount + intent parser for Uzbek input.
 * "150 ming ovqatga ketdi"  ->  expense 150000 / Oziq-ovqat
 * "1,5 mln maosh keldi"     ->  income 1500000 / Ish haqi
 * "2.5 mln ijara to'ladim"  ->  expense 2500000 / Ijara
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
  { name: "Bonus", words: ["bonus", "mukofot", "premiya", "mukofotlar"] },
  { name: "Qo'shimcha daromad", words: ["qo'shimcha", "freelance", "frilans", "qoshimcha", "yordam puli"] },
  { name: "Qarz qaytishi", words: ["qarz qaytdi", "qaytardi", "qarzini qaytardi", "oldim qarzni"] },
];

const INCOME_WORDS = [
  "kirim", "daromad", "keldi", "oldim", "maosh", "oylik", "bonus", "tushdi", "qabul qildim",
  "daromadim", "kirdi", "olindi", "kirim qildim",
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

export function parseDraft(input: string, baseDate = todayISO()): ParsedDraft {
  const text = input.trim();
  const normalized = text.toLowerCase().replace(/[’']/g, "'");
  const range = parseAmountRange(text);

  let type: ParsedDraft["type"] = "expense";
  if (TRANSFER_WORDS.some((w) => normalized.includes(w))) type = "transfer";
  else if (INCOME_WORDS.some((w) => normalized.includes(w))) type = "income";
  else if (EXPENSE_WORDS.some((w) => normalized.includes(w))) type = "expense";

  let date = baseDate;
  if (/kecha/.test(normalized)) date = addDays(baseDate, -1);
  else if (/ertaga|ertaga/.test(normalized)) date = addDays(baseDate, 1);

  const missing: string[] = [];
  if (range.amount === null) missing.push("summa");
  if (!range.estimated && range.amount === null) missing.push("summa");

  const categoryName = type === "income" ? detectCategory(text) : detectCategory(text);

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
