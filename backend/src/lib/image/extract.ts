import {
  cleanText,
  extractDueDay,
  extractDuration,
  normalizeAmount,
  normalizeDate,
} from "./normalize";
import { canonicalCategoryFor } from "./categories";
import type {
  DocumentClass,
  ExtractedDebt,
  ExtractedEntity,
  ExtractionIssue,
  ExtractionResult,
  FinancialSemantics,
} from "./types";
import { LOW_CONFIDENCE_THRESHOLD } from "./types";

/**
 * Deterministic structuring layer (§4, §5, §6, §10–§16, §20).
 *
 * The vision provider only has to READ the image (rows of text). Turning those
 * rows into financial meaning happens here, in pure code, so behaviour is
 * reproducible, testable and identical for every provider.
 */

export const MAX_EXTRACTED_ROWS = 40;

type Section =
  | "plan"
  | "expected_payment"
  | "expense"
  | "income"
  | "expected_income"
  | "debt_i_owe"
  | "debt_owed_to_me"
  | "debt_unknown"
  | null;

type AmountRole = "total" | "paid" | "remaining";

type ParsedLine = {
  raw: string;
  residual: string;
  name: string;
  amounts: Array<{ role: AmountRole; value: number; confidence: number }>;
  date: string | null;
  dateConfidence: number;
  dueDay: number | null;
  months: number | null;
  hasDigits: boolean;
};

type Record_ = {
  rowIndex: number;
  lines: string[];
  name: string;
  amounts: Array<{ role: AmountRole; value: number; confidence: number }>;
  date: string | null;
  dateConfidence: number;
  dueDay: number | null;
  months: number | null;
  section: Section;
  sectionTitle: string | null;
};

const HEADER_RULES: Array<[RegExp, Section]> = [
  [/men\s+qarzdor|berishim\s+kerak|men\s+bermoqchi|to'lashim\s+kerak|tolashim\s+kerak/i, "debt_i_owe"],
  [/menga\s+qarzdor|menga\s+berishi|mendan\s+qarz|olishim\s+kerak|qaytarishi\s+kerak/i, "debt_owed_to_me"],
  [/kutilayotgan\s+daromad|expected\s+income/i, "expected_income"],
  [/kutilayotgan\s+to'?lov|expected\s+payment/i, "expected_payment"],
  [/kredit|ipoteka|to'?lov\s+jadval|majburiy\s+to'?lov|payment\s+schedule|rassrochka|nasiya/i, "plan"],
  [/qarzdorlik|qarzlar|qarz\b|debt/i, "debt_unknown"],
  [/daromad|kirim|income|maosh|oylik/i, "income"],
  [/xarajat|chiqim|bozorlik|harid|expense|xarid|ro'?yxat/i, "expense"],
];

const DEBT_I_OWE = /\bmen\b[^.]{0,24}\b(berishim|to'?lashim|qaytarishim|qarzdor)|berishim\s+kerak|qarzdorman/i;
const DEBT_TO_ME = /\bmenga\b[^.]{0,24}\b(qarzdor|berishi|qaytarishi|beradi)|mendan\s+ol|olishim\s+kerak|menga\s+qarz/i;
/** Relationship phrases must never leak into the stored person name. */
const DEBT_PHRASE_WORDS =
  /\b(men|menga|mendan|meni|qarzdor|qarzdorman|qarzdori|berishim|berishi|beradi|olishim|qaytarishi|qaytaradi|kerak|to'?lashim)\b/gi;
const DEBT_WORD = /qarz|debt|nasiya/i;
const PAID_WORDS = /to'?land[iı]|to'?ladim|paid|yopildi|to'?lab\s+berdim|berildi/i;
const EXPECTED_WORDS = /kutilmoqda|kutilayotgan|keladi|kelishi|expected|tushadi|bo'?ladi|va'?da/i;
const UNPAID_WORDS = /to'?lanmagan|unpaid|qoldi\s+to'?lov/i;
const PLAN_WORDS = /kredit|ipoteka|rassrochka|nasiya|muddatli|bo'?lib\s+to'?lash|abonent|obuna|ijara|kommunal/i;
const MANDATORY_WORDS = /majburiy|kredit|ipoteka|soliq|ijara|kommunal/i;
const INCOME_WORDS = /maosh|oylik|ish\s+haqi|zarplata|salary|bonus|mukofot|premiya|avans|daromad|kirim|foyda|dividend|keshbek|cashback/i;

const METADATA_WORDS =
  /\b(jami|umumiy|summa|summasi|total|qarz|qarzi|to'?langan|tolangan|qolgan|qoldi|remaining|sana|sanasi|muddat|oy|oylik|oyga|kun|kuni|so'?m|sum|uzs|dona|ta)\b/gi;

function detectSection(line: string): Section {
  for (const [re, section] of HEADER_RULES) if (re.test(line)) return section;
  return null;
}

function amountRoleFor(prefix: string): AmountRole {
  if (/to'?langan|tolangan|paid/i.test(prefix)) return "paid";
  if (/qolgan|qoldi|remaining|balans/i.test(prefix)) return "remaining";
  return "total";
}

function stripName(text: string): string {
  return cleanText(
    text
      .replace(/^\s*\d+\s*[.)]\s*/, "")
      .replace(METADATA_WORDS, " ")
      .replace(/[:•·|,;=]+/g, " ")
      .replace(/(^|\s)-+($|\s)/g, " ")
      .replace(/\s+-\s*$/, ""),
  ).replace(/\s{2,}/g, " ").trim();
}

/** Structures a single OCR row into its financial tokens. */
export function parseLine(raw: string, today: string): ParsedLine {
  const text = cleanText(raw);
  const hasDigits = /\d/.test(text);
  let residual = text;

  const dueDay = extractDueDay(residual);
  if (dueDay.raw) residual = residual.replace(dueDay.raw, " ");
  const duration = extractDuration(residual);
  if (duration.raw) residual = residual.replace(duration.raw, " ");
  const date = normalizeDate(residual, today);
  if (date.raw) residual = residual.replace(date.raw, " ");

  const amounts: ParsedLine["amounts"] = [];
  const amountRe = /(\d[\d\s.,]*\d|\d)\s*(mlrd|milliard|mln|million|ming|k)?/gi;
  let match: RegExpExecArray | null;
  let scrubbed = residual;
  while ((match = amountRe.exec(residual)) !== null) {
    const normalized = normalizeAmount(match[0]);
    if (normalized.value === null || normalized.confidence <= 0.5) continue;
    const prefix = residual.slice(Math.max(0, match.index - 24), match.index);
    amounts.push({ role: amountRoleFor(prefix), value: normalized.value, confidence: normalized.confidence });
    scrubbed = scrubbed.replace(match[0], " ");
  }

  return {
    raw: text,
    residual: scrubbed,
    name: stripName(scrubbed),
    amounts,
    date: date.date,
    dateConfidence: date.confidence,
    dueDay: dueDay.dueDay,
    months: duration.months,
    hasDigits,
  };
}

function totalOf(record: Record_): { value: number; confidence: number } | null {
  const total = record.amounts.find((a) => a.role === "total");
  if (total) return total;
  const any = record.amounts[0];
  return any ? { value: any.value, confidence: any.confidence } : null;
}

function semanticsOf(text: string, date: string | null, today: string): FinancialSemantics {
  if (PAID_WORDS.test(text)) return "paid";
  if (EXPECTED_WORDS.test(text)) return "expected";
  if (UNPAID_WORDS.test(text)) return "unpaid";
  if (date && date > today) return "planned";
  return "real";
}

function incomeKindOf(text: string): "salary" | "bonus" | "advance" | "other" {
  if (/maosh|oylik|ish\s+haqi|zarplata|salary/i.test(text)) return "salary";
  if (/bonus|mukofot|premiya|keshbek|cashback/i.test(text)) return "bonus";
  if (/avans|advance|oldindan/i.test(text)) return "advance";
  return "other";
}

/**
 * Groups OCR rows into logical records and turns each record into a typed
 * financial entity. Rows are never merged across records and never silently
 * dropped: anything unusable ends up in `unparsedRows`.
 */
export function extractFromLines(
  lines: string[],
  today: string,
  options: { maxRows?: number } = {},
): ExtractionResult {
  const maxRows = options.maxRows ?? MAX_EXTRACTED_ROWS;
  const cleaned = lines.map(cleanText).filter((line) => line.length > 0 && /[a-z0-9\u0400-\u04FF]/i.test(line));

  let section: Section = null;
  let sectionTitle: string | null = null;
  let globalDate: string | null = null;
  let globalDateConfidence = 0;

  const records: Record_[] = [];
  let current: Record_ | null = null;
  const unparsedRows: string[] = [];

  const startRecord = (parsed: ParsedLine): Record_ => ({
    rowIndex: records.length,
    lines: [parsed.raw],
    name: parsed.name,
    amounts: [...parsed.amounts],
    date: parsed.date,
    dateConfidence: parsed.dateConfidence,
    dueDay: parsed.dueDay,
    months: parsed.months,
    section,
    sectionTitle,
  });

  for (const line of cleaned) {
    const parsed = parseLine(line, today);
    const isHeader = parsed.amounts.length === 0 && (detectSection(line) !== null || /:\s*$/.test(line)) && Boolean(parsed.name);

    // A date-only row ("12.08", "20 avgust") is a document-level date (§10).
    if (!parsed.amounts.length && !parsed.name && parsed.date) {
      globalDate = parsed.date;
      globalDateConfidence = parsed.dateConfidence;
      if (current && !current.date) {
        current.date = parsed.date;
        current.dateConfidence = parsed.dateConfidence;
      }
      continue;
    }

    if (isHeader) {
      const detected = detectSection(line);
      if (detected) section = detected;
      sectionTitle = parsed.name || sectionTitle;
      if (current) {
        records.push(current);
        current = null;
      }
      continue;
    }

    if (!parsed.amounts.length && !parsed.name && !parsed.dueDay && !parsed.months) {
      if (parsed.hasDigits) unparsedRows.push(parsed.raw);
      continue;
    }

    const hasTotal = parsed.amounts.some((a) => a.role === "total");
    const currentHasTotal = current ? current.amounts.some((a) => a.role === "total") : false;
    const startsNew =
      !current ||
      (hasTotal && currentHasTotal) ||
      (Boolean(parsed.name) && Boolean(current.name));

    if (startsNew) {
      if (current) records.push(current);
      current = startRecord(parsed);
      continue;
    }

    // Continuation row: fills the gaps of the record in progress.
    current!.lines.push(parsed.raw);
    current!.amounts.push(...parsed.amounts);
    if (!current!.name && parsed.name) current!.name = parsed.name;
    if (!current!.date && parsed.date) {
      current!.date = parsed.date;
      current!.dateConfidence = parsed.dateConfidence;
    }
    if (current!.dueDay === null && parsed.dueDay !== null) current!.dueDay = parsed.dueDay;
    if (current!.months === null && parsed.months !== null) current!.months = parsed.months;
  }
  if (current) records.push(current);

  let truncatedRows = 0;
  const usable = records.filter((record) => totalOf(record) !== null);
  for (const record of records) {
    if (totalOf(record) === null && record.lines.some((l) => /\d/.test(l))) unparsedRows.push(record.lines.join(" "));
  }
  const capped = usable.slice(0, maxRows);
  truncatedRows = usable.length - capped.length;

  const entities: ExtractedEntity[] = [];
  capped.forEach((record, index) => {
    const entity = buildEntity(record, index, today, globalDate, globalDateConfidence);
    if (entity) entities.push(entity);
    else unparsedRows.push(record.lines.join(" "));
  });

  markDuplicates(entities);

  return {
    documentClass: classifyDocument(entities, records),
    entities,
    unparsedRows,
    truncatedRows,
  };
}

function buildEntity(
  record: Record_,
  rowIndex: number,
  today: string,
  globalDate: string | null,
  globalDateConfidence: number,
): ExtractedEntity | null {
  const total = totalOf(record);
  if (!total) return null;
  const text = record.lines.join(" ");
  const name = record.name || record.sectionTitle || "";
  const searchText = `${text} ${record.sectionTitle ?? ""}`;
  // Direction/semantics keywords are matched on the amount-free text so a
  // number between the words ("menga 500 000 qarzdor") cannot hide them.
  const phraseText = searchText.replace(/\d[\d\s.,]*/g, " ").replace(/\s{2,}/g, " ");
  const semantics = semanticsOf(phraseText, record.date, today);
  const issues: ExtractionIssue[] = [];

  const date = record.date ?? globalDate ?? today;
  const dateConfidence = record.date ? record.dateConfidence : globalDate ? globalDateConfidence : 0.6;
  if (total.confidence < LOW_CONFIDENCE_THRESHOLD) issues.push("amount_unclear");

  const isDebtSection = record.section === "debt_i_owe" || record.section === "debt_owed_to_me" || record.section === "debt_unknown";
  const isDebt = isDebtSection || DEBT_WORD.test(phraseText) || DEBT_I_OWE.test(phraseText) || DEBT_TO_ME.test(phraseText);

  if (isDebt) {
    let direction: ExtractedDebt["direction"] = null;
    let personConfidence = 0.9;
    if (DEBT_TO_ME.test(phraseText)) direction = "owed_to_me";
    else if (DEBT_I_OWE.test(phraseText)) direction = "i_owe";
    else if (record.section === "debt_owed_to_me") direction = "owed_to_me";
    else if (record.section === "debt_i_owe") direction = "i_owe";
    if (!direction) {
      issues.push("debt_direction_unknown");
      personConfidence = 0.4;
    }
    const paid = record.amounts.find((a) => a.role === "paid")?.value ?? null;
    const remaining = record.amounts.find((a) => a.role === "remaining")?.value ?? null;
    const personName = stripName(name.replace(DEBT_PHRASE_WORDS, " ")) || name;
    if (!personName) issues.push("type_unclear");
    return {
      kind: "debt",
      personName,
      direction,
      amount: total.value,
      paidAmount: paid,
      remainingAmount: remaining ?? (paid !== null ? Math.max(0, total.value - paid) : null),
      dueDate: record.date && record.date > today ? record.date : null,
      note: text.slice(0, 200),
      semantics,
      confidence: Math.min(total.confidence, direction ? 0.9 : 0.4),
      fields: { amount: total.confidence, person: personConfidence, type: direction ? 0.95 : 0.4, date: dateConfidence },
      issues,
      rowIndex,
    };
  }

  const isIncome = INCOME_WORDS.test(searchText) || record.section === "income" || record.section === "expected_income";
  const planSignals = record.months !== null || record.dueDay !== null || PLAN_WORDS.test(searchText);
  const isPlanSection = record.section === "plan" || record.section === "expected_payment";

  if (isIncome) {
    const incomeKind = incomeKindOf(searchText);
    const expected = semantics === "expected" || semantics === "planned" || record.section === "expected_income" || date > today;
    const category = canonicalCategoryFor(name || searchText, "income");
    if (expected) {
      return {
        kind: "expected_income",
        sourceName: name || (incomeKind === "salary" ? "Maosh" : "Daromad"),
        amount: total.value,
        expectedDate: date,
        frequency: record.months !== null || /har\s+oy|oylik/i.test(searchText) ? "monthly" : "once",
        planType: record.months !== null ? "term" : /har\s+oy|oylik/i.test(searchText) ? "recurring" : "one_time",
        occurrenceCount: record.months,
        categoryName: category?.canonical ?? null,
        note: text.slice(0, 200),
        semantics: "expected",
        confidence: Math.min(total.confidence, 0.92),
        fields: { amount: total.confidence, date: dateConfidence, type: 0.92, category: category ? 0.85 : 0 },
        issues,
        rowIndex,
      };
    }
    return {
      kind: "income",
      date,
      amount: total.value,
      categoryName: category?.canonical ?? null,
      incomeKind,
      note: text.slice(0, 200),
      semantics: semantics === "paid" ? "real" : semantics,
      confidence: Math.min(total.confidence, 0.9),
      fields: { amount: total.confidence, date: dateConfidence, type: 0.9, category: category ? 0.85 : 0 },
      issues,
      rowIndex,
    };
  }

  // A future/planned obligation is a PLAN, never a real transaction (§20, §36).
  const isPlan =
    (isPlanSection || planSignals) && semantics !== "paid" && semantics !== "real"
      ? true
      : (isPlanSection || PLAN_WORDS.test(searchText)) && (record.months !== null || record.dueDay !== null);

  if (isPlan) {
    const dueDay = record.dueDay ?? Number(date.slice(8, 10));
    const planType = record.months !== null ? "term" : record.dueDay !== null ? "recurring" : "one_time";
    const frequency = planType === "one_time" ? "once" : "monthly";
    const category = canonicalCategoryFor(name || searchText, "expense");
    const startDate = record.date ?? null;
    const endDate =
      record.months !== null
        ? addMonthsIso(startDate ?? nextDueIso(dueDay, today), record.months - 1)
        : null;
    if (record.months !== null && (record.months < 1 || record.months > 600)) issues.push("plan_invalid");
    return {
      kind: "payment_plan",
      name: name || "To'lov",
      amount: total.value,
      frequency,
      planType,
      installmentCount: planType === "term" ? record.months : null,
      dueDay: Math.min(28, Math.max(1, dueDay)),
      startDate,
      endDate,
      mandatory: MANDATORY_WORDS.test(searchText) || isPlanSection,
      categoryName: category?.canonical ?? null,
      note: text.slice(0, 200),
      semantics: semantics === "real" ? "planned" : semantics,
      confidence: Math.min(total.confidence, 0.93),
      fields: {
        amount: total.confidence,
        date: record.dueDay !== null ? 0.95 : dateConfidence,
        type: 0.93,
        duration: record.months !== null ? 0.95 : 0.6,
        category: category ? 0.85 : 0,
      },
      issues,
      rowIndex,
    };
  }

  const category = canonicalCategoryFor(name || searchText, "expense");
  return {
    kind: "expense",
    date,
    amount: total.value,
    categoryName: category?.canonical ?? null,
    note: (name || text).slice(0, 200),
    semantics: semantics === "planned" ? "planned" : "real",
    confidence: Math.min(total.confidence, name ? 0.92 : 0.8),
    fields: { amount: total.confidence, date: dateConfidence, type: name ? 0.88 : 0.7, category: category ? 0.85 : 0 },
    issues,
    rowIndex,
  };
}

function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, 1));
  base.setUTCMonth(base.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, lastDay));
  return base.toISOString().slice(0, 10);
}

function nextDueIso(dueDay: number, today: string): string {
  const day = Math.min(28, Math.max(1, dueDay));
  const candidate = `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  if (candidate >= today) return candidate;
  return addMonthsIso(candidate, 1);
}

/** Flags identical rows so the user can decide instead of losing money twice. */
function markDuplicates(entities: ExtractedEntity[]): void {
  const seen = new Map<string, number>();
  for (const entity of entities) {
    const key = JSON.stringify([
      entity.kind,
      "amount" in entity ? entity.amount : null,
      "date" in entity ? entity.date : null,
      "name" in entity ? entity.name : "personName" in entity ? entity.personName : "sourceName" in entity ? entity.sourceName : "",
    ]);
    const count = seen.get(key) ?? 0;
    if (count > 0) entity.issues.push("duplicate_row");
    seen.set(key, count + 1);
  }
}

function classifyDocument(entities: ExtractedEntity[], records: Array<{ section: Section }>): DocumentClass {
  if (!entities.length) return "UNKNOWN";
  const kinds = new Set(entities.map((e) => e.kind));
  if (kinds.size > 1) return "MIXED_FINANCE";
  const [kind] = [...kinds];
  switch (kind) {
    case "payment_plan": {
      const plans = entities.filter((e) => e.kind === "payment_plan");
      const allOneTime = plans.every((p) => p.kind === "payment_plan" && p.planType === "one_time");
      return allOneTime ? "EXPECTED_PAYMENT" : "PAYMENT_SCHEDULE";
    }
    case "expected_income":
      return "EXPECTED_INCOME";
    case "income":
      return "INCOME_LIST";
    case "debt": {
      const debts = entities.filter((e): e is ExtractedDebt => e.kind === "debt");
      if (debts.length && debts.every((d) => d.direction === "owed_to_me")) return "CREDITOR_LIST";
      return "DEBT_LIST";
    }
    case "expense": {
      const foodish = entities.filter((e) => e.kind === "expense" && e.categoryName === "Oziq-ovqat").length;
      const shoppingSection = records.some((r) => r.section === "expense");
      return foodish >= Math.max(2, Math.ceil(entities.length * 0.6)) && !shoppingSection ? "SHOPPING_LIST" : "EXPENSE_LIST";
    }
    default:
      return "UNKNOWN";
  }
}
