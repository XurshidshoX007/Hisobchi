import { extractDate, parseAmountRange } from "./nlp";
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
  const numericRe = /\b(\d{1,2})\s*[-./]\s*(\d{1,2})(?:\s*[-./]\s*(\d{4}))?\b/g;
  const textualRe = new RegExp(`\\b(\\d{1,2})\\s*[-–]?\\s*(${MONTH_ALTS})[a-z']*`, "gi");

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
  if (text.length > 2000) return false;
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
    .map((s) => s.trim().replace(/^[-•–]\s*/, ""))
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
  // If prefix contains newline, take last line before date? Actually prefix is everything before first date, which includes header plus maybe earlier. We want the header line closest to date.
  // If prefix contains colon, prefer text before colon but near date.
  const colonBeforeDate = prefix.lastIndexOf(":");
  if (colonBeforeDate !== -1) {
    // Check if colon is within reasonable header length
    const beforeColon = prefix.slice(0, colonBeforeDate).trim();
    // If beforeColon contains installment label like "5 oyga", skip
    const cand = cleanNameCandidate(beforeColon);
    if (cand) return cand;
    // else try after colon? not needed
  }
  // Remove trailing punctuation
  prefix = prefix.replace(/[:;,\-]+$/g, "").trim();
  // Remove installment numbering at start like "1-to'lov"
  prefix = prefix.replace(INSTALLMENT_LABEL_RE, " ").trim();
  // Remove leading bullet
  prefix = prefix.replace(/^[-•–\d\s]+/, "").trim();
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
  // Remove leading keywords that are not brand? Keep kredit/nasiya as part of name, so not removing
  // Remove isolated numbers
  s = s.replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
  // Remove trailing/leading punctuation
  s = s.replace(/^[,:\-–\s]+|[,:\-–\s]+$/g, "").trim();
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
  // If s is just "Kredit" alone, fallback to more generic? But keep as is, fallback handled elsewhere.
  // If s equals "Kredit" or "Kredit:" etc, we might want fallback? But spec fallback is "Kredit to'lovi" when not found.
  // If s is single word "Kredit" without brand, keep but it's okay, but we prefer fallback? We'll keep if length>3
  if (s.toLowerCase() === "kredit" && raw.toLowerCase().includes("kredit")) {
    // Could be just "Kredit:" header with no brand -> fallback
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
  if (lines > 30) {
    return { ok: false, schedule: null, errors: ["Jadval juda uzun (max 24 ta to'lov)"], confidence: 0, rawInput };
  }

  // Find all date matches in whole text to determine name extraction boundary
  const allDates = findAllDateMatches(text);
  const firstDateIdx = allDates.length ? allDates[0].index : null;

  const name = extractScheduleName(text, firstDateIdx);

  // Split using similar logic to nlp splitOperations but keep schedule-aware
  // We reuse a simple split: newline, semicolon, comma not in decimal, " va " + digit
  const rawSegments = text
    .split(/\n+|;+|,(?!\d)|\s+(?:va|hamda)\s+(?=\d)/i)
    .map((s) => s.trim().replace(/^[-•–]\s*/, ""))
    .filter(Boolean);

  // Further handle "hamda" etc? Already.

  // Build outSegments that merge segments without digits into previous (like nlp)
  const segments: string[] = [];
  for (const p of rawSegments) {
    if (/\d/.test(p) || segments.length === 0) segments.push(p);
    else segments[segments.length - 1] += `, ${p}`;
  }

  const items: ScheduleItem[] = [];
  const errors: string[] = [];

  let globalIndex = 0;

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    if (!seg) continue;

    // Skip header-like segment that is before first date and contains no date but may contain name
    // We'll detect if seg is header: contains schedule keyword and no date+amount pairing
    const segDates = findAllDateMatches(seg);
    if (segDates.length === 0) {
      // Check if seg contains amount without date -> potential error but filter small numbers
      const cleanedForAmtCheck = seg.replace(INSTALLMENT_LABEL_RE, " ").trim();
      // Remove date tokens already none
      const amtCheck = parseAmountRange(cleanedForAmtCheck);
      if (amtCheck.amount !== null && amtCheck.amount >= 1000) {
        // amount without date in a segment that should be paired
        // But if this seg is header like "Kredit Uzum:" amt would be null, so not here
        // For schedule, every segment with amount must have date, so this is error
        // However header with "5 oyga kredit:" would have amt 5 (<1000) so not flagged
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
        // For first subsegment, include from 0 to next date; for others from date i to next
        // This captures amount before date for first date as well
        const sub = seg.slice(start, end).trim();
        // Special handling for first date: if start !==0, we used start=segDates[i].index, but first sub should be from 0
        // Actually for i===0 we already use 0, good.
        // For i>0, we use date index, which excludes preceding amount between dates that belongs to previous installment? But the slice from previous date to next date already includes up to next date, so the gap between dates is fully accounted in first subsegment.
        // For second and beyond, we start at its date, so its preceding amount (if amount is before date) would be incorrectly assigned to previous subsegment's tail.
        // To handle amount before date for subsequent dates, we should ensure subsegment for i>0 starts at previous date's end? Complicated.
        // Simpler: for i>0, start should be segDates[i-1].index + segDates[i-1].length? No.
        // Let's instead define subSegments as slices between dates inclusive of trailing text up to next date.
        // For i===0: slice 0 to segDates[1].index
        // For i>0: slice segDates[i].index to (i+1< len ? segDates[i+1].index : end)
        // This means amount that appears BEFORE second date but AFTER first date's amount would be in first subsegment's tail, not second's head. But amount before second date that belongs to second installment would be between first date's amount and second date, i.e., in the gap. How to know which installment gap belongs to?
        // Typically pattern is "DATE AMOUNT DATE AMOUNT", so amount is immediately after date, not before. So gap between amounts is small. Our slicing from date to next date will give "DATE AMOUNT" correctly because amount follows date. So second subsegment starting at second date will be "DATE AMOUNT" for second.
        // So it's fine.
        if (sub) subSegments.push(sub);
      }
      // Edge: if first subsegment starts at 0 but segDates[0].index >0, it includes header text before first date within same segment (e.g., "Uzum 20 avg 750 ming"). That's okay header text will be ignored after date removal but kept for name? Already name extracted separately.
    } else {
      subSegments = [seg];
    }

    for (const sub of subSegments) {
      if (!sub.trim()) continue;
      // Find next date in sub (should be exactly one)
      const subDates = findAllDateMatches(sub);
      if (subDates.length === 0) {
        // Should not happen because we split by dates, but skip
        continue;
      }
      // We expect one date per sub; if multiple still, take first
      const dm = subDates[0];
      let isoDate: string | null = null;
      if (dm.type === "iso") {
        isoDate = `${dm.year}-${String(dm.month).padStart(2, "0")}-${String(dm.day).padStart(2, "0")}`;
      } else if (dm.type === "numeric") {
        if (dm.year !== undefined) {
          const y = dm.year < 100 ? 2000 + dm.year : dm.year;
          isoDate = `${y}-${String(dm.month).padStart(2, "0")}-${String(dm.day).padStart(2, "0")}`;
        } else {
          isoDate = inferYearForDayMonth(dm.day, dm.month, baseDate);
        }
      } else {
        // textual
        isoDate = inferYearForDayMonth(dm.day, dm.month, baseDate);
      }

      // Validate isoDate is valid
      if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        errors.push(`${dm.raw} sanasi noto'g'ri`);
        continue;
      }
      const parsed = new Date(`${isoDate}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
        errors.push(`${dm.raw} sanasi noto'g'ri`);
        continue;
      }

      // Amount extraction: remove date token from sub
      let cleaned = sub.slice(0, dm.index - (sub === seg ? subDates[0].index - (subSegments.length>1? 0:0):0)) + sub.slice(dm.index + dm.length);
      // But sub is slice of seg from some offset, so dm.index is relative to sub, not seg. For subSegments derived from seg, we already sliced, so dm.index in sub is relative.
      // Simpler: recreate cleaned by removing first occurrence of dm.raw from sub
      cleaned = sub.replace(dm.raw, " ");
      // Also handle normalized short month? dm.raw may be original short form, replacement works.

      // Also remove installment label
      cleaned = cleaned.replace(INSTALLMENT_LABEL_RE, " ").trim();

      // For textual dates where dm.raw is like "20 avg", after normalize the actual text in sub may be "20 avg" as well, replacement works.
      // But for cases where we normalized before matching, raw still matches original.

      const amtRes = parseAmountFromSegment(cleaned);
      if (amtRes.amount === null || amtRes.amount <= 0) {
        // Try alternative: maybe amount is before date and we removed date but amount before date still in cleaned, parseAmountRange should find it.
        // If still null, error
        const idx = items.length + 1;
        errors.push(`${idx}-to'lov uchun summa topilmadi`);
        continue;
      }
      // Validate duplicate amount? Not needed

      // Special case: if cleaned still contains another date (should not), but ignore

      globalIndex += 1;
      items.push({
        index: globalIndex,
        date: isoDate,
        amount: Math.round(amtRes.amount),
        rawSegment: sub,
      });
    }
  }

  // After initial loop, we have provisional items with year inference based on baseDate
  // Now apply monotonic year adjustment (ensure chronological order) and duplicate detection

  // Duplicate detection before monotonic bump
  const seen = new Map<string, number>();
  const duplicateIndices: number[] = [];
  for (const it of items) {
    if (seen.has(it.date)) {
      duplicateIndices.push(it.index);
      // Don't bump duplicate, keep error
      if (!errors.some((e) => e.includes("takroriy") || e.includes("duplicate"))) {
        errors.push(`Takroriy sana aniqlandi: ${it.date}`);
      }
    } else {
      seen.set(it.date, it.index);
    }
  }

  // If duplicates found, we don't auto-bump those duplicates
  // Now monotonic adjustment for non-duplicate items
  // We need to iterate in order of appearance (items already in appearance order)
  // For each i where items[i].date <= items[i-1].date and not duplicate, bump year
  for (let i = 1; i < items.length; i++) {
    // skip if duplicate already flagged (both dates equal)
    if (items[i].date === items[i - 1].date) continue;
    let curr = items[i].date;
    const prev = items[i - 1].date;
    // While curr <= prev, bump
    let guard = 0;
    while (curr <= prev && guard < 10) {
      const [y, m, d] = curr.split("-").map(Number);
      const bumped = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      // validate bumped date
      const pd = new Date(`${bumped}T00:00:00Z`);
      if (Number.isNaN(pd.getTime()) || pd.toISOString().slice(0, 10) !== bumped) break;
      curr = bumped;
      items[i].date = curr;
      guard += 1;
      // need to update seen map? not needed
      // If after bump it becomes duplicate with another, detect again
      if (curr === prev) break;
    }
  }

  // Re-check duplicates after bumping (should not create new duplicates ideally)
  // Validate limits
  if (items.length === 0) {
    // No valid items
    // Check if there were errors due to missing amount etc - already in errors
    // If no errors but no items, treat as not schedule
    return { ok: false, schedule: null, errors: errors.length ? errors : ["Jadval topilmadi"], confidence: 0, rawInput };
  }
  if (items.length > 24) {
    errors.push(` Juda ko'p to'lov (${items.length} ta). Maksimal 24 ta.`);
  }
  if (items.length < 2) {
    // Low confidence single installment
    // We return ok false to trigger clarification
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

  // Check amount missing items already in errors via earlier push

  const total = items.reduce((s, it) => s + it.amount, 0);
  const confidence = errors.length ? 0.4 : items.length >= 2 ? 0.95 : 0.3;

  // Sort items by date? Spec shows they keep input order which is already chronological after year adjustment.
  // But for display, chronological order makes sense. Keep as is (appearance order which after year bump is chronological)

  const schedule: PaymentSchedule = {
    type: "payment-schedule",
    name,
    items: items.map((it, idx) => ({ ...it, index: idx + 1 })),
    totalAmount: total,
    rawInput,
  };

  return {
    ok: errors.length === 0 && items.length >= 2 && items.length <= 24,
    schedule: errors.length === 0 ? schedule : schedule,
    errors,
    confidence,
    rawInput,
  };
}
