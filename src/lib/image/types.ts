/**
 * Telegram image / document finance intelligence — typed contracts.
 *
 * Vision output NEVER reaches the database directly. It first becomes one of
 * the typed objects below, then it is normalized, validated, shown to the user
 * for confirmation and only afterwards handed to the SHARED finance mutation
 * engine (`runMutation`). No image-specific financial storage exists.
 */

export type DocumentClass =
  | "PAYMENT_SCHEDULE"
  | "SHOPPING_LIST"
  | "EXPENSE_LIST"
  | "INCOME_LIST"
  | "DEBT_LIST"
  | "CREDITOR_LIST"
  | "EXPECTED_PAYMENT"
  | "EXPECTED_INCOME"
  | "MIXED_FINANCE"
  | "UNKNOWN";

/** Financial semantics carried by the image text (§20). */
export type FinancialSemantics = "real" | "paid" | "planned" | "expected" | "unpaid";

/** Field-level confidence (§17). Missing key = field not extracted. */
export type FieldConfidence = {
  amount?: number;
  date?: number;
  type?: number;
  category?: number;
  person?: number;
  duration?: number;
};

/** Reasons an entity cannot be saved silently and needs a user decision. */
export type ExtractionIssue =
  | "amount_unclear"
  | "date_unclear"
  | "category_unknown"
  | "debt_direction_unknown"
  | "type_unclear"
  | "duplicate_row"
  | "amount_invalid"
  | "date_invalid"
  | "plan_invalid";

type BaseEntity = {
  /** Overall confidence for the row (min of the decisive fields). */
  confidence: number;
  fields: FieldConfidence;
  issues: ExtractionIssue[];
  /** 0-based index of the source row inside the image (never re-ordered). */
  rowIndex: number;
  semantics: FinancialSemantics;
};

export type ExtractedExpense = BaseEntity & {
  kind: "expense";
  date: string;
  amount: number;
  categoryName: string | null;
  note: string;
};

export type ExtractedIncome = BaseEntity & {
  kind: "income";
  date: string;
  amount: number;
  categoryName: string | null;
  /** salary | bonus | advance | other — informational classification (§11). */
  incomeKind: "salary" | "bonus" | "advance" | "other";
  note: string;
};

export type ExtractedPaymentPlan = BaseEntity & {
  kind: "payment_plan";
  name: string;
  amount: number;
  frequency: "once" | "weekly" | "monthly" | "yearly";
  planType: "one_time" | "recurring" | "term";
  installmentCount: number | null;
  dueDay: number;
  startDate: string | null;
  endDate: string | null;
  mandatory: boolean;
  categoryName: string | null;
  note: string;
};

export type ExtractedExpectedIncome = BaseEntity & {
  kind: "expected_income";
  sourceName: string;
  amount: number;
  expectedDate: string;
  frequency: "once" | "weekly" | "monthly" | "yearly";
  planType: "one_time" | "recurring" | "term";
  occurrenceCount: number | null;
  categoryName: string | null;
  note: string;
};

export type ExtractedDebt = BaseEntity & {
  kind: "debt";
  personName: string;
  direction: "i_owe" | "owed_to_me" | null;
  amount: number;
  paidAmount: number | null;
  remainingAmount: number | null;
  dueDate: string | null;
  note: string;
};

export type ExtractedEntity =
  | ExtractedExpense
  | ExtractedIncome
  | ExtractedPaymentPlan
  | ExtractedExpectedIncome
  | ExtractedDebt;

export type ExtractionResult = {
  documentClass: DocumentClass;
  entities: ExtractedEntity[];
  /** Rows that carried a number but could not be structured (§30 partial). */
  unparsedRows: string[];
  /** Rows dropped because the extraction cap was reached (§29). */
  truncatedRows: number;
};

/** Draft kinds persisted in `pending_drafts.kind`. */
export type DraftKind = "transaction" | "payment_plan" | "expected_income" | "debt";

/**
 * A confirmation-ready draft: `data` is already shaped for `runMutation`
 * (shared finance engine), `meta` only drives the Telegram UX.
 */
export type ImageDraft = {
  kind: DraftKind;
  data: Record<string, unknown>;
  meta: {
    source: "image";
    label: string;
    entityKind: ExtractedEntity["kind"];
    confidence: number;
    issues: ExtractionIssue[];
    documentClass: DocumentClass;
    rowIndex: number;
    /** Category the classifier suggested but could NOT map to a user category. */
    suggestedCategory?: string | null;
    semantics: FinancialSemantics;
  };
};

export const LOW_CONFIDENCE_THRESHOLD = 0.7;
