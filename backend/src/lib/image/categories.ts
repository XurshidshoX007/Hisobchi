import { CATEGORY_KEYWORDS } from "@hisobchi/shared/lib/nlp";
import { cleanText } from "./normalize";

/**
 * Centralized category classifier (§8, §9, §31).
 *
 * Priority:
 *   1. exact match with an EXISTING user category
 *   2. semantic (keyword) match mapped onto an existing user category
 *   3. semantic match without a user category → suggestion only
 *   4. nothing → ask the user
 *
 * The classifier NEVER creates a category. Vision must not invent taxonomy;
 * a new category is only created after an explicit user decision.
 */

export type UserCategory = {
  id: number;
  name: string;
  type: "income" | "expense";
  isActive: boolean;
};

export type CategoryMatch = {
  categoryId: number | null;
  categoryName: string | null;
  /** Canonical/system name suggested when no user category matched. */
  suggested: string | null;
  confidence: number;
  needsUser: boolean;
};

/** Item → canonical category vocabulary, on top of the shared NLP keywords. */
export const IMAGE_CATEGORY_HINTS: Array<{ canonical: string; type: "income" | "expense"; words: string[] }> = [
  {
    canonical: "Oziq-ovqat",
    type: "expense",
    words: [
      "non", "go'sht", "gosht", "gusht", "sut", "yog'", "yog", "yogh", "guruch", "makaron", "un ", "shakar",
      "tuxum", "sabzavot", "meva", "kartoshka", "piyoz", "sabzi", "choy", "qahva", "kofe", "suvi", "bozorlik",
      "oziq", "ovqat", "produkt", "market", "supermarket", "magazin", "yemak", "tushlik", "nonushta",
    ],
  },
  { canonical: "Transport", type: "expense", words: ["taksi", "taxi", "yandex", "benzin", "avtobus", "metro", "yo'l kira", "yol kira", "yoqilg'i", "moshina"] },
  { canonical: "Sog'liq", type: "expense", words: ["dori", "dorixona", "apteka", "shifokor", "vrach", "tibbiy", "analiz", "klinika", "stomatolog"] },
  { canonical: "Kommunal", type: "expense", words: ["elektr", "svet", "suv puli", "gaz", "issiqlik", "kommunal", "chiqindi"] },
  { canonical: "Telefon / Internet", type: "expense", words: ["internet", "wifi", "telefon", "aloqa", "mobil", "ucell", "beeline", "uzmobile"] },
  { canonical: "Kredit", type: "expense", words: ["kredit", "credit", "ipoteka", "mikroqarz", "muddatli to'lov", "bo'lib to'lash", "rassrochka", "nasiya"] },
  { canonical: "Ijara", type: "expense", words: ["ijara", "arenda", "kvartira puli"] },
  { canonical: "Ta'lim", type: "expense", words: ["maktab", "kurs", "o'quv", "universitet", "kontrakt", "kitob", "repetitor"] },
  { canonical: "Kiyim", type: "expense", words: ["kiyim", "poyabzal", "oyoq kiyim", "kurtka", "ko'ylak", "shim"] },
  { canonical: "Farzandlar", type: "expense", words: ["bola", "farzand", "bog'cha", "bogcha", "o'yinchoq"] },
  { canonical: "Uy / Ta'mirlash", type: "expense", words: ["mebel", "ta'mirlash", "remont", "texnika", "uy jihoz"] },
  { canonical: "Ko'ngilochar", type: "expense", words: ["kino", "sayohat", "restoran", "kafe", "sport zal", "fitnes"] },
  { canonical: "Ish haqi", type: "income", words: ["maosh", "oylik", "ish haqi", "zarplata", "salary"] },
  { canonical: "Bonus", type: "income", words: ["bonus", "mukofot", "premiya", "keshbek", "cashback"] },
  { canonical: "Qo'shimcha daromad", type: "income", words: ["avans", "avans puli", "freelance", "frilans", "qo'shimcha", "shabashka", "halturа"] },
];

function normalizeName(value: string): string {
  return cleanText(value)
    .toLocaleLowerCase("uz")
    .replace(/[^a-z0-9'\u0400-\u04FF ]/gi, "")
    .trim();
}

/** Semantic canonical name for a free-text item, or null. */
export function canonicalCategoryFor(text: string, type: "income" | "expense"): { canonical: string; score: number } | null {
  const normalized = normalizeName(text);
  if (!normalized) return null;
  let best: { canonical: string; score: number } | null = null;

  const consider = (canonical: string, word: string) => {
    const needle = normalizeName(word);
    if (!needle) return;
    const hit = normalized === needle || normalized.includes(needle) || needle.includes(normalized);
    if (!hit) return;
    const score = normalized === needle ? needle.length + 5 : needle.length;
    if (!best || score > best.score) best = { canonical, score };
  };

  for (const hint of IMAGE_CATEGORY_HINTS) {
    if (hint.type !== type) continue;
    for (const word of hint.words) consider(hint.canonical, word);
  }
  // Shared NLP vocabulary as a secondary source (keeps bot text + image
  // classification aligned instead of drifting apart).
  for (const hint of CATEGORY_KEYWORDS) {
    for (const word of hint.words) consider(hint.name, word);
  }
  return best;
}

/**
 * Resolves the category for one extracted row against the user's own
 * categories. Never invents or duplicates a category.
 */
export function classifyCategory(
  text: string,
  type: "income" | "expense",
  userCategories: UserCategory[],
): CategoryMatch {
  const active = userCategories.filter((c) => c.isActive && c.type === type);
  const normalized = normalizeName(text);

  // 1) exact user category name inside the row text
  const exact = active.find((c) => normalizeName(c.name) === normalized);
  if (exact) return { categoryId: exact.id, categoryName: exact.name, suggested: null, confidence: 0.99, needsUser: false };

  const mentioned = active
    .filter((c) => normalized.includes(normalizeName(c.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (mentioned) {
    return { categoryId: mentioned.id, categoryName: mentioned.name, suggested: null, confidence: 0.95, needsUser: false };
  }

  // 2) semantic match mapped onto an existing user category
  const canonical = canonicalCategoryFor(text, type);
  if (canonical) {
    const target = active.find((c) => normalizeName(c.name) === normalizeName(canonical.canonical));
    if (target) {
      return { categoryId: target.id, categoryName: target.name, suggested: null, confidence: 0.92, needsUser: false };
    }
    // 3) no user category for the canonical concept → suggestion, never silent
    return { categoryId: null, categoryName: null, suggested: canonical.canonical, confidence: 0.5, needsUser: true };
  }

  // 4) ask the user
  return { categoryId: null, categoryName: null, suggested: null, confidence: 0, needsUser: true };
}
