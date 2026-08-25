import { formatAmount, humanDate, shortDate, todayISO } from "@hisobchi/shared/lib/money";
import { extractFromLines, MAX_EXTRACTED_ROWS } from "./image/extract";
import { classifyCategory, type UserCategory } from "./image/categories";
import { clarificationsFor, validateExtraction } from "./image/validate";
import { nextDueDateFor } from "./image/normalize";
import {
  resolveVisionProvider,
  type VisionFailureDiagnostics,
  type VisionFailureReason,
  type VisionProvider,
  type VisionResult,
} from "./image/provider";
import type { DownloadedImage } from "./image/telegram-file";
import type { DocumentClass, ExtractedEntity, ImageDraft } from "./image/types";

/**
 * Image intelligence service boundary (§28).
 *
 * Responsibilities (and ONLY these):
 *   classifyImage        — what kind of financial document is this?
 *   extractFinanceData   — image → typed financial entities
 *   normalizeFinanceData — entities → confirmation drafts for the SHARED engine
 *   validateExtraction   — re-exported guard rail (see image/validate.ts)
 *
 * No AI code lives in the webhook router, the mutation service or the database
 * layer, and nothing here writes to the database.
 */

export { validateExtraction } from "./image/validate";
export type { DocumentClass, ExtractedEntity, ImageDraft } from "./image/types";

export type AnalyzeOptions = {
  today?: string;
  categories: UserCategory[];
  provider?: VisionProvider | null;
  maxRows?: number;
};

export type AnalysisFailureReason = VisionFailureReason | "no_content";

export type AnalysisFailure = {
  ok: false;
  reason: AnalysisFailureReason;
  /** Non-secret provider diagnostics for audit / server logs. */
  diagnostics?: VisionFailureDiagnostics;
};

export type AnalysisSuccess = {
  ok: true;
  documentClass: DocumentClass;
  entities: ExtractedEntity[];
  drafts: ImageDraft[];
  rejected: Array<{ entity: ExtractedEntity; reason: string }>;
  unparsedRows: string[];
  truncatedRows: number;
  provider: string;
};

export type AnalysisResult = AnalysisSuccess | AnalysisFailure;

/** Coarse "what is in the picture?" pass (§4). */
export function classifyImage(lines: string[], today = todayISO()): DocumentClass {
  return extractFromLines(lines, today, { maxRows: MAX_EXTRACTED_ROWS }).documentClass;
}

/** Vision rows → typed financial entities (§16). */
export function extractFinanceData(lines: string[], today = todayISO(), maxRows = MAX_EXTRACTED_ROWS) {
  return extractFromLines(lines, today, { maxRows });
}

/**
 * Entities → confirmation drafts whose `data` is already shaped for
 * `runMutation`. Categories are mapped onto the user's EXISTING categories —
 * a missing category becomes a question, never a new taxonomy entry (§8, §9).
 */
export function normalizeFinanceData(
  entities: ExtractedEntity[],
  options: { categories: UserCategory[]; today?: string; documentClass: DocumentClass },
): ImageDraft[] {
  const today = options.today ?? todayISO();
  const drafts: ImageDraft[] = [];

  for (const entity of entities) {
    const issues = clarificationsFor(entity);
    const base = {
      source: "image" as const,
      entityKind: entity.kind,
      confidence: entity.confidence,
      documentClass: options.documentClass,
      rowIndex: entity.rowIndex,
      semantics: entity.semantics,
    };

    if (entity.kind === "expense" || entity.kind === "income") {
      const type = entity.kind;
      const match = classifyCategory(entity.categoryName ?? entity.note, type, options.categories);
      if (match.needsUser) issues.push("category_unknown");
      drafts.push({
        kind: "transaction",
        data: {
          type,
          amount: entity.amount,
          date: entity.date,
          note: entity.note.slice(0, 200),
          categoryId: match.categoryId,
          source: "bot",
        },
        meta: {
          ...base,
          issues: unique(issues),
          suggestedCategory: match.suggested,
          label: `${type === "income" ? "+" : "−"}${formatAmount(entity.amount)} · ${
            match.categoryName ?? match.suggested ?? "kategoriya tanlanmagan"
          } · ${shortDate(entity.date)}`,
        },
      });
      continue;
    }

    if (entity.kind === "payment_plan") {
      const match = classifyCategory(entity.categoryName ?? entity.name, "expense", options.categories);
      drafts.push({
        kind: "payment_plan",
        data: {
          name: entity.name,
          amount: entity.amount,
          certainty: "exact",
          frequency: entity.frequency,
          planType: entity.planType,
          installmentCount: entity.installmentCount,
          dueDay: Math.min(28, Math.max(1, entity.dueDay)),
          nextDueDate: entity.startDate ?? nextDueDateFor(entity.dueDay, today),
          startDate: entity.startDate ?? nextDueDateFor(entity.dueDay, today),
          isMandatory: entity.mandatory,
          categoryId: match.categoryId,
          isActive: true,
        },
        meta: {
          ...base,
          issues: unique(issues),
          suggestedCategory: match.suggested,
          label: `📌 ${entity.name} — ${formatAmount(entity.amount)}${
            entity.planType === "term" ? ` · ${entity.installmentCount} oy` : ""
          } · har oyning ${Math.min(28, Math.max(1, entity.dueDay))}-sanasi`,
        },
      });
      continue;
    }

    if (entity.kind === "expected_income") {
      const match = classifyCategory(entity.categoryName ?? entity.sourceName, "income", options.categories);
      drafts.push({
        kind: "expected_income",
        data: {
          sourceName: entity.sourceName,
          amount: entity.amount,
          certainty: "exact",
          expectedDate: entity.expectedDate,
          frequency: entity.frequency,
          planType: entity.planType,
          occurrenceCount: entity.occurrenceCount,
          categoryId: match.categoryId,
          note: entity.note.slice(0, 200),
          isActive: true,
        },
        meta: {
          ...base,
          issues: unique(issues),
          suggestedCategory: match.suggested,
          label: `💵 ${entity.sourceName} — ${formatAmount(entity.amount)} · ${humanDate(entity.expectedDate)} (kutilmoqda)`,
        },
      });
      continue;
    }

    drafts.push({
      kind: "debt",
      data: {
        personName: entity.personName,
        direction: entity.direction,
        amount: entity.amount,
        remainingAmount: entity.remainingAmount ?? entity.amount,
        dueDate: entity.dueDate,
        note: entity.note.slice(0, 200),
        date: today,
      },
      meta: {
        ...base,
        issues: unique(issues),
        suggestedCategory: null,
        label: `💳 ${entity.personName} — ${formatAmount(entity.amount)} · ${
          entity.direction === "owed_to_me"
            ? "menga qarzdor"
            : entity.direction === "i_owe"
              ? "men qarzdorman"
              : "yo'nalish aniqlanmadi"
        }`,
      },
    });
  }

  return drafts;
}

/** Full pipeline: image bytes → validated, confirmation-ready drafts. */
export async function analyzeFinancialImage(
  image: DownloadedImage,
  options: AnalyzeOptions,
): Promise<AnalysisResult> {
  const today = options.today ?? todayISO();
  const provider = options.provider ?? resolveVisionProvider();
  if (!provider) return { ok: false, reason: "unconfigured" };

  const vision: VisionResult = await provider.readFinancialImage({
    image: image.buffer,
    mimeType: image.mimeType,
    hints: { today, categoryNames: options.categories.map((c) => c.name) },
  });
  if (!vision.ok) {
    return { ok: false, reason: vision.reason, diagnostics: vision.diagnostics };
  }

  const extraction = extractFinanceData(vision.lines, today, options.maxRows ?? MAX_EXTRACTED_ROWS);
  if (!extraction.entities.length) {
    return { ok: false, reason: "no_content", diagnostics: { errorClass: "no_finance_rows" } };
  }

  const { valid, rejected } = validateExtraction(extraction.entities, today);
  if (!valid.length) {
    return { ok: false, reason: "no_content", diagnostics: { errorClass: "all_rows_rejected" } };
  }

  const documentClass = vision.documentHint && extraction.documentClass === "UNKNOWN" ? vision.documentHint : extraction.documentClass;
  const drafts = normalizeFinanceData(valid, { categories: options.categories, today, documentClass });

  return {
    ok: true,
    documentClass,
    entities: valid,
    drafts,
    rejected,
    unparsedRows: extraction.unparsedRows,
    truncatedRows: extraction.truncatedRows,
    provider: vision.provider,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
