import { parseAmountRange } from "./nlp";
import { todayISO } from "./money";

/**
 * Payment schedule (credit installment) text parser.
 * Reuses the existing amount and date engines instead of duplicating them.
 */

export type ScheduleItem = {
  index: number;
  date: string; // YYYY-MM-DD
  amount: number;
  rawSegment: string;
};

export type PaymentSchedule = {
  type: "payment-schedule";
  name: string;
  items: ScheduleItem[];
  totalAmount: number;
  rawInput: string;
};

export type PaymentScheduleParseResult = {
  ok: boolean;
  schedule: PaymentSchedule | null;
  errors: string[];
  confidence: number;
  rawInput: string;
};

export const MIN_SCHEDULE_ITEMS = 2;
export const MAX_SCHEDULE_ITEMS = 60;
export const MAX_SCHEDULE_ERROR = "Kredit jadvali ko‘pi bilan 60 ta to‘lovdan iborat bo‘lishi mumkin.";

const SCHEDULE_KEYWORDS = [
  "kredit",
  "nasiya",
  "nasiye",
  "muddatli",
  "muddat",
  "bo'lib to'lash",
  "bo'lib tolash",
  "bo'lib",
  "oyma-oy",
  "oyma oy",
  "to'lovlar",
  "tolovlar",
  "to'lov jadvali",
  "tolov jadvali",
  "qarz jadvali",
  "installment",
  "qarz",
  "rassrochka",
];

const INSTALLMENT_LABEL_RE = /\b\d+\s*-+\s*to['’`ʻ´]?lov\b/gi;
const LEADING_NUMBER_OR_BULLET_RE = /^\s*(?:\d+[\.\)\:\-–]\s+|\d+\s*-+\s*to['’`ʻ´]?lov\s*|[-•–]\s*)/i;

function normalizeApostrophe(s: string): string {
  return s.toLocaleLowerCase("uz").replace(/[’‘`ʻ´]/g, "'");
}

function hasScheduleKeyword(text: string): boolean {
  const lower = normalizeApostrophe(text);
  return SCHEDULE_KEYWORDS.some((kw) => lower.includes(normalizeApostrophe(kw)));
}

// Uzbek short month -> full mapping for normalization before calling extractDate
function normalizeUzbekMonths(text: string): string {
  let out = text;
  // longer first
  out = out.replace(/\boktyabr\b/gi, "oktabr");
  out = out.replace(/\bsentyabr\b/gi, "sentabr");
  out = out.replace(/\bsentabr\b/gi, "sentabr");
  out = out.replace(/\bsent\b/gi, "sentabr");
  out = out.replace(/\bsen\b/gi, "sentabr");
  out = out.replace(/\bavgust\b/gi, "avgust");
  out = out.replace(/\bavg\b/gi, "avgust");
  out = out.replace(/\boktabr\b/gi, "oktabr");
  out = out.replace(/\bokt\b/gi, "oktabr");
  out = out.replace(/\bnoyabr\b/gi, "noyabr");
  out = out.replace(/\bnoy\b/gi, "noyabr");
  out = out.replace(/\bdekabr\b/gi, "dekabr");
  out = out.replace(/\bdek\b/gi, "dekabr");
  out = out.replace(/\bfevral\b/gi, "fevral");
  out = out.replace(/\bfev\b/gi, "fevral");
  out = out.replace(/\byanvar\b/gi, "yanvar");
  out = out.replace(/\byan\b/gi, "yanvar");
  out = out.replace(/\baprel\b/gi, "aprel");
  out = out.replace(/\bapr\b/gi, "aprel");
  return out;
}

const MONTH_MAP: Record<string, number> = {
  yanvar: 1,
  fevral: 2,
  mart: 3,
  aprel: 4,
  may: 5,
  iyun: 6,
  iyul: 7,
  avgust: 8,
  sentabr: 9,
  oktabr: 10,
  noyabr: 11,
  dekabr: 12,
};

// textual month alternatives for regex
const MONTH_ALTS = "yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|yan|fev|mar|apr|avg|sen|sent|okt|noy|dek";

function inferYearForDayMonth(day: number, month: number, baseDate: string): string {
  const baseYear = Number(baseDate.slice(0, 4));
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  let candidate = `${baseYear}-${mm}-${dd}`;
  if (candidate < baseDate) {
    candidate = `${baseYear + 1}-${mm}-${dd}`;
  }
  // validate day range for month
  const d = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== candidate) {
    // invalid date (e.g., 31 feb) keep as is, validation will flag
  }
  return candidate;
}

type DateMatch = {
  index: number;
  length: number;
  raw: string;
  day: number;
  month: number;
  year?: number;
  iso?: string;
  type: "iso" | "numeric" | "textual";
};

function findAllDateMatches(text: string): DateMatch[] {
  const matches: DateMatch[] = [];
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  const numericRe = /\b(\d{1,2})[-./](\d{1,2})(?:[-./](\d{4}))?\b/g;
  const textualRe = new RegExp(`\\b(\\d{1,2})\\s*[-–]?\\s*(${MONTH_ALTS})[a-z']*(?:\\s+(20\\d{2})\\b)?`, "gi");

  let pos = 0;
  while (pos < text.length) {
    type SearchResult = { index: number; length: number; raw: string; type: DateMatch["type"]; groups: RegExpExecArray };
    const search = (re: RegExp, type: DateMatch["type"]): SearchResult | null => {
      re.lastIndex = pos;
      const m = re.exec(text);
      if (!m || m.index === undefined) return null;
      return { index: m.index, length: m[0].length, raw: m[0], type, groups: m };
    };

    const candList = [search(isoRe, "iso"), search(numericRe, "numeric"), search(textualRe, "textual")].filter((v): v is SearchResult => Boolean(v));
    const cands = candList;
    if (!cands.length) break;
    cands.sort((a, b) => a.index - b.index);
    const winner = cands[0];
    // avoid zero-length progress
    if (winner.index < pos) {
      pos += 1;
      continue;
    }
    let day = 0,
      month = 0,
      year: number | undefined;
    if (winner.type === "iso") {
      year = Number(winner.groups[1]);
      month = Number(winner.groups[2]);
      day = Number(winner.groups[3]);
    } else if (winner.type === "numeric") {
      day = Number(winner.groups[1]);
      month = Number(winner.groups[2]);
      if (winner.groups[3]) year = Number(winner.groups[3]);
      // heuristics: if numeric looks like amount with multiplier? skip? numeric date day 1-31 month 1-12, if month>12 or day>31 skip as not date
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        pos = winner.index + 1;
        continue;
      }
    } else {
      day = Number(winner.groups[1]);
      if (winner.groups[3]) year = Number(winner.groups[3]);
      const mStr = winner.groups[2].toLowerCase().replace(/[’']/g, "");
      // map short to month number
      const norm = normalizeUzbekMonths(mStr).toLowerCase();
      // extract full month token after normalization
      // find which month maps
      let found: number | null = null;
      for (const [k, v] of Object.entries(MONTH_MAP)) {
        if (norm.includes(k)) {
          found = v;
          break;
        }
      }
      if (!found) {
        // fallback short map
        const shortMap: Record<string, number> = {
          yan: 1,
          fev: 2,
          mar: 3,
          apr: 4,
          avg: 8,
          sen: 9,
          sent: 9,
          okt: 10,
          noy: 11,
          dek: 12,
        };
        found = shortMap[mStr.slice(0, 3)] ?? null;
      }
      if (!found) {
        pos = winner.index + winner.length;
        continue;
      }
      month = found;
    }
    matches.push({ index: winner.index, length: winner.length, raw: winner.raw, day, month, year, type: winner.type });
    pos = winner.index + winner.length;
  }
  // sort by index already
  return matches;
}

function countDateTokens(text: string): number {
  return findAllDateMatches(text).length;
}

function countAmountTokens(text: string): number {
  const cleaned = text.replace(INSTALLMENT_LABEL_RE, " ");
  // Avoid \n merging distinct amounts: use space-only inside number
  const re = /(\d[\d .,\u00A0]*)\s*(ming|mln|million|mlrd)?/gi;
  let count = 0;
  let m: RegExpExecArray | null;
  let noDates = cleaned;
  for (const dm of findAllDateMatches(cleaned)) {
    noDates = noDates.replace(dm.raw, " ");
  }
  while ((m = re.exec(noDates)) !== null) {
    const numPart = m[1].replace(/[ \u00A0]/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(numPart)) continue;
    const val = Number(numPart);
    if (!Number.isFinite(val) || val <= 0) continue;
    const unit = (m[2] ?? "").toLowerCase();
    if (!unit && val < 1000) continue;
    count += 1;
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return count;
}

/**
 * Lightweight schedule candidate detection. Must be conservative to avoid
 * stealing normal expense batches.
 */
export function isPaymentScheduleCandidate(
  text: string,
  _baseDate = todayISO(),
): boolean {
  if (!text || text.trim().length < 10) return false;
  if (text.length > 4096) return false;
  const lower = normalizeApostrophe(text);
  // Must contain a number
  if (!/\d/.test(text)) return false;

  const dateCount = countDateTokens(text);
  const amountCount = countAmountTokens(text);

  if (dateCount < 2 || amountCount < 2) return false;

  const hasKeyword = hasScheduleKeyword(text);

  if (hasKeyword) return true;

  // Without keyword, require at least 2 date+amount paired segments and no strong expense category
  // Check segments for pairing
  const segments = splitForDetection(text);
  let paired = 0;
  for (const seg of segments) {
    const d = countDateTokens(seg);
    const a = countAmountTokens(seg);
    if (d >= 1 && a >= 1) paired += 1;
  }
  if (paired >= 2) {
    // Heuristic: if segments contain obvious expense categories like ovqat/taksi, don't treat as schedule
    // Use small blocklist to avoid false positive for "15 avgust 150 ming ovqat"
    const expenseHints = ["ovqat", "taksi", "yandex", "benzin", "kafe", "market", "bozor", "dori"];
    const hitExpense = expenseHints.some((w) => lower.includes(w));
    if (hitExpense) return false;
    return true;
  }
  return false;
}

function splitForDetection(text: string): string[] {
  // simplified split similar to nlp splitOperations but for detection
  const parts = text
    .split(/\n+|;+|,(?!\d)|\s+(?:va|hamda)\s+(?=\d)/i)
    .map((s) => s.trim().replace(LEADING_NUMBER_OR_BULLET_RE, "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/\d/.test(p) || out.length === 0) out.push(p);
    else out[out.length - 1] += `, ${p}`;
  }
  return out;
}

function extractScheduleName(text: string, firstDateIndex: number | null): string {
  const fallback = "Kredit to'lovi";
  if (firstDateIndex === null || firstDateIndex < 0) {
    // try colon header
    const colonIdx = text.indexOf(":");
    if (colonIdx > 0 && colonIdx < 80) {
      const cand = text.slice(0, colonIdx).trim();
      const cleaned = cleanNameCandidate(cand);
      if (cleaned) return cleaned;
    }
    return fallback;
  }
  let prefix = text.slice(0, firstDateIndex).trim();
  // If prefix contains colon, prefer text before colon but near date.
  const colonBeforeDate = prefix.lastIndexOf(":");
  if (colonBeforeDate !== -1) {
    // Check if colon is within reasonable header length
    const beforeColon = prefix.slice(0, colonBeforeDate).trim();
    // If beforeColon contains installment label like "5 oyga", skip
    const cand = cleanNameCandidate(beforeColon);
    if (cand) return cand;
  }
  // Remove trailing list numbering prefix before date, e.g. "1." or "1 -"
  prefix = prefix.replace(/\s*\d+[\.\)\:\-–]?\s*$/, "").trim();
  // Remove trailing punctuation
  prefix = prefix.replace(/[:;,\-]+$/g, "").trim();
  // Remove installment numbering at start like "1-to'lov"
  prefix = prefix.replace(INSTALLMENT_LABEL_RE, " ").trim();
  // Remove leading bullet or numbering
  prefix = prefix.replace(LEADING_NUMBER_OR_BULLET_RE, "").trim();
  const cand = cleanNameCandidate(prefix);
  if (cand) return cand;
  // Fallback try first line before colon regardless of date position
  const colonIdx2 = text.indexOf(":");
  if (colonIdx2 > 0 && colonIdx2 < 80) {
    const cand2 = cleanNameCandidate(text.slice(0, colonIdx2).trim());
    if (cand2) return cand2;
  }
  return fallback;
}

function cleanNameCandidate(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // Remove excessive whitespace
  s = s.replace(/\s+/g, " ").trim();
  // Remove installment labels
  s = s.replace(INSTALLMENT_LABEL_RE, " ").replace(/\b\d+\s*-\s*to['’`ʻ´]?lov\b/gi, " ").trim();
  // Remove patterns like "5 oyga", "5 oy", "5 ta", "5ta to'lov" etc that are not brand
  s = s.replace(/\b\d+\s*(oyga|oy|ta|marta)\b/gi, " ").replace(/\s+/g, " ").trim();
  // Remove leading number or bullet prefixes
  s = s.replace(LEADING_NUMBER_OR_BULLET_RE, "").trim();
  // Remove isolated numbers
  s = s.replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
  // Remove trailing/leading punctuation
  s = s.replace(/^[,:\-–\.\s]+|[,:\-–\.\s]+$/g, "").trim();
  if (!s) return null;
  if (s.length < 2 || s.length > 60) {
    // if too long, maybe truncated header like whole sentence, try to extract brand words (first 3 words)
    if (s.length > 60) {
      const words = s.split(/\s+/).slice(0, 4).join(" ");
      if (words.length >= 2) s = words;
      else return null;
    } else {
      return null;
    }
  }
  // Ensure contains at least one letter
  if (!/[a-zA-Zа-яА-Я]/u.test(s)) return null;
  // Capitalize first letters
  s = s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  // If s is single word "Kredit" without brand, keep but prefer fallback when no brand
  if (s.toLowerCase() === "kredit" && raw.toLowerCase().includes("kredit")) {
    return null;
  }
  return s;
}

function parseAmountFromSegment(cleaned: string): { amount: number | null; raw: string | null } {
  // cleaned already has date removed and installment label removed
  const trimmed = cleaned.replace(INSTALLMENT_LABEL_RE, " ").trim();
  if (!trimmed) return { amount: null, raw: null };
  // Use parseAmountRange on the whole cleaned
  const res = parseAmountRange(trimmed);
  if (res.amount !== null && res.amount > 0) {
    return { amount: res.amount, raw: trimmed };
  }
  // fallback: try to find any number with maybe plain large number
  const m = trimmed.match(/(\d[\d\s.,]*)/);
  if (m) {
    const num = Number(m[1].replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(num) && num > 0) return { amount: num, raw: m[1] };
  }
  return { amount: null, raw: null };
}

export function parsePaymentSchedule(
  input: string,
  baseDate = todayISO(),
): PaymentScheduleParseResult {
  const rawInput = input;
  const text = input.trim();
  if (!text) {
    return { ok: false, schedule: null, errors: ["Bo'sh xabar"], confidence: 0, rawInput };
  }
  if (text.length > 8000) {
    return { ok: false, schedule: null, errors: ["Xabar juda uzun"], confidence: 0, rawInput };
  }

  // Quick limits check for absurd installment count (e.g., 500 lines)
  const lines = text.split(/\n/).length;
  if (lines > 100) {
    return { ok: false, schedule: null, errors: [MAX_SCHEDULE_ERROR], confidence: 0, rawInput };
  }

  // Find all date matches in whole text to determine name extraction boundary
  const allDates = findAllDateMatches(text);
  const firstDateIdx = allDates.length ? allDates[0].index : null;

  const name = extractScheduleName(text, firstDateIdx);

  // Split using similar logic to nlp splitOperations but keep schedule-aware
  // We reuse a simple split: newline, semicolon, comma not in decimal, " va " + digit
  const rawSegments = text
    .split(/\n+|;+|,(?!\d)|\s+(?:va|hamda)\s+(?=\d)/i)
    .map((s) => s.trim().replace(LEADING_NUMBER_OR_BULLET_RE, "").trim())
    .filter(Boolean);

  // Build outSegments that merge segments without digits into previous (like nlp)
  const segments: string[] = [];
  for (const p of rawSegments) {
    if (/\d/.test(p) || segments.length === 0) segments.push(p);
    else segments[segments.length - 1] += `, ${p}`;
  }

  type ProvisionalItem = {
    day: number;
    month: number;
    explicitYear?: number;
    rawDate: string;
    amount: number;
    rawSegment: string;
  };

  const provisionalItems: ProvisionalItem[] = [];
  const errors: string[] = [];

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    if (!seg) continue;

    // Skip header-like segment that is before first date and contains no date but may contain name
    const segDates = findAllDateMatches(seg);
    if (segDates.length === 0) {
      const cleanedForAmtCheck = seg.replace(INSTALLMENT_LABEL_RE, " ").trim();
      const amtCheck = parseAmountRange(cleanedForAmtCheck);
      if (amtCheck.amount !== null && amtCheck.amount >= 1000) {
        errors.push(`"${seg.slice(0, 60)}" uchun sana topilmadi`);
      }
      continue;
    }

    // For seg with dates, handle multiple dates per seg via subSegments
    let subSegments: string[] = [];
    if (segDates.length > 1) {
      for (let i = 0; i < segDates.length; i++) {
        const start = i === 0 ? 0 : segDates[i].index;
        const end = i + 1 < segDates.length ? segDates[i + 1].index : seg.length;
        const sub = seg.slice(start, end).trim();
        if (sub) subSegments.push(sub);
      }
    } else {
      subSegments = [seg];
    }

    for (const sub of subSegments) {
      if (!sub.trim()) continue;
      const subDates = findAllDateMatches(sub);
      if (subDates.length === 0) {
        continue;
      }
      const dm = subDates[0];

      // Amount extraction: remove date token from sub
      const cleaned = sub.replace(dm.raw, " ").replace(INSTALLMENT_LABEL_RE, " ").trim();

      const amtRes = parseAmountFromSegment(cleaned);
      if (amtRes.amount === null || amtRes.amount <= 0) {
        const idx = provisionalItems.length + 1;
        errors.push(`${idx}-to'lov uchun summa topilmadi`);
        continue;
      }

      provisionalItems.push({
        day: dm.day,
        month: dm.month,
        explicitYear: dm.year,
        rawDate: dm.raw,
        amount: Math.round(amtRes.amount),
        rawSegment: sub,
      });
    }
  }

  // Chronological date resolution & duplicate detection
  let lastDate: string | null = null;
  const seenDates = new Set<string>();
  const items: ScheduleItem[] = [];
  let globalIndex = 0;

  for (const it of provisionalItems) {
    let isoDate: string;
    if (it.explicitYear !== undefined) {
      const y = it.explicitYear < 100 ? 2000 + it.explicitYear : it.explicitYear;
      isoDate = `${y}-${String(it.month).padStart(2, "0")}-${String(it.day).padStart(2, "0")}`;
    } else if (!lastDate) {
      isoDate = inferYearForDayMonth(it.day, it.month, baseDate);
    } else {
      let candYear = Number(lastDate.slice(0, 4));
      let candidate = `${candYear}-${String(it.month).padStart(2, "0")}-${String(it.day).padStart(2, "0")}`;
      let guard = 0;
      while (candidate <= lastDate && guard < 10) {
        // If consecutive items have the exact same month & day, it is a duplicate date
        if (candidate.slice(5) === lastDate.slice(5)) {
          break;
        }
        candYear += 1;
        candidate = `${candYear}-${String(it.month).padStart(2, "0")}-${String(it.day).padStart(2, "0")}`;
        guard += 1;
      }
      isoDate = candidate;
    }

    // Validate ISO date is a real calendar date (e.g. not 31 fevral)
    const parsed = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
      errors.push(`${it.rawDate} sanasi noto'g'ri`);
      continue;
    }

    if (seenDates.has(isoDate)) {
      if (!errors.some((e) => e.includes("Takroriy sana") || e.includes("takroriy"))) {
        errors.push(`Takroriy sana aniqlandi: ${isoDate}`);
      }
    }
    seenDates.add(isoDate);
    lastDate = isoDate;

    globalIndex += 1;
    items.push({
      index: globalIndex,
      date: isoDate,
      amount: it.amount,
      rawSegment: it.rawSegment,
    });
  }

  // Validate limits
  if (items.length === 0) {
    return { ok: false, schedule: null, errors: errors.length ? errors : ["Jadval topilmadi"], confidence: 0, rawInput };
  }
  if (items.length > MAX_SCHEDULE_ITEMS) {
    errors.push(MAX_SCHEDULE_ERROR);
  }
  if (items.length < MIN_SCHEDULE_ITEMS) {
    // Low confidence single installment
    return {
      ok: false,
      schedule: {
        type: "payment-schedule",
        name,
        items,
        totalAmount: items.reduce((s, it) => s + it.amount, 0),
        rawInput,
      },
      errors,
      confidence: 0.3,
      rawInput,
    };
  }

  // Validate each item
  for (const it of items) {
    if (!it.date || !/^\d{4}-\d{2}-\d{2}$/.test(it.date)) {
      errors.push(`${it.index}-to'lov uchun sana noto'g'ri`);
    }
    if (!it.amount || it.amount <= 0) {
      errors.push(`${it.index}-to'lov uchun summa noto'g'ri`);
    }
  }

  const total = items.reduce((s, it) => s + it.amount, 0);
  const confidence = errors.length ? 0.4 : items.length >= MIN_SCHEDULE_ITEMS ? 0.95 : 0.3;

  const schedule: PaymentSchedule = {
    type: "payment-schedule",
    name,
    items: items.map((it, idx) => ({ ...it, index: idx + 1 })),
    totalAmount: total,
    rawInput,
  };

  return {
    ok: errors.length === 0 && items.length >= MIN_SCHEDULE_ITEMS && items.length <= MAX_SCHEDULE_ITEMS,
    schedule,
    errors,
    confidence,
    rawInput,
  };
}
