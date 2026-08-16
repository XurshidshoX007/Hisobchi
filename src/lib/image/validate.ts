import { addDays } from "../money";
import type { ExtractedEntity, ExtractionIssue } from "./types";
import { LOW_CONFIDENCE_THRESHOLD } from "./types";

/**
 * Validation layer (§18). Runs BEFORE any draft is created, so an impossible
 * value can never reach the shared finance engine — not even as a draft.
 */

const MAX_AMOUNT = 999_999_999_999;

export type ValidationOutcome = {
  valid: ExtractedEntity[];
  rejected: Array<{ entity: ExtractedEntity; reason: string }>;
};

const VALID_FREQUENCIES = new Set(["once", "weekly", "monthly", "yearly"]);
const VALID_PLAN_TYPES = new Set(["one_time", "recurring", "term"]);

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateExtraction(entities: ExtractedEntity[], today: string): ValidationOutcome {
  const valid: ExtractedEntity[] = [];
  const rejected: ValidationOutcome["rejected"] = [];
  const earliest = addDays(today, -365 * 5);
  const latest = addDays(today, 365 * 5);

  for (const entity of entities) {
    const reason = validateOne(entity, { earliest, latest });
    if (reason) {
      rejected.push({ entity, reason });
      continue;
    }
    valid.push(entity);
  }
  return { valid, rejected };
}

function validateOne(entity: ExtractedEntity, range: { earliest: string; latest: string }): string | null {
  const amount = "amount" in entity ? entity.amount : null;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return "amount_invalid";
  if (amount > MAX_AMOUNT) return "amount_too_large";

  switch (entity.kind) {
    case "expense":
    case "income": {
      if (!isIsoDate(entity.date)) return "date_invalid";
      if (entity.date < range.earliest || entity.date > range.latest) return "date_out_of_range";
      return null;
    }
    case "payment_plan": {
      if (!VALID_FREQUENCIES.has(entity.frequency)) return "frequency_invalid";
      if (!VALID_PLAN_TYPES.has(entity.planType)) return "plan_type_invalid";
      if (entity.dueDay < 1 || entity.dueDay > 31) return "due_day_invalid";
      if (entity.planType === "term" && (!entity.installmentCount || entity.installmentCount < 1 || entity.installmentCount > 600)) {
        return "installment_count_invalid";
      }
      if (entity.startDate && !isIsoDate(entity.startDate)) return "date_invalid";
      return null;
    }
    case "expected_income": {
      if (!isIsoDate(entity.expectedDate)) return "date_invalid";
      if (entity.expectedDate < range.earliest || entity.expectedDate > range.latest) return "date_out_of_range";
      if (!VALID_FREQUENCIES.has(entity.frequency)) return "frequency_invalid";
      if (!VALID_PLAN_TYPES.has(entity.planType)) return "plan_type_invalid";
      if (entity.planType === "term" && (!entity.occurrenceCount || entity.occurrenceCount < 1 || entity.occurrenceCount > 600)) {
        return "occurrence_count_invalid";
      }
      return null;
    }
    case "debt": {
      if (entity.direction !== null && entity.direction !== "i_owe" && entity.direction !== "owed_to_me") return "direction_invalid";
      if (!entity.personName.trim()) return "person_missing";
      if (entity.paidAmount !== null && (entity.paidAmount < 0 || entity.paidAmount > entity.amount)) return "paid_amount_invalid";
      if (entity.remainingAmount !== null && (entity.remainingAmount < 0 || entity.remainingAmount > entity.amount)) {
        return "remaining_amount_invalid";
      }
      if (entity.dueDate && !isIsoDate(entity.dueDate)) return "date_invalid";
      return null;
    }
    default:
      return "unknown_kind";
  }
}

/** Fields the bot must ask about before saving (§17, §30). */
export function clarificationsFor(entity: ExtractedEntity): ExtractionIssue[] {
  const issues = new Set<ExtractionIssue>(entity.issues);
  if ((entity.fields.amount ?? 0) < LOW_CONFIDENCE_THRESHOLD) issues.add("amount_unclear");
  if ((entity.fields.type ?? 1) < LOW_CONFIDENCE_THRESHOLD) issues.add("type_unclear");
  if (entity.kind === "debt" && !entity.direction) issues.add("debt_direction_unknown");
  return [...issues];
}

export function needsUserDecision(entity: ExtractedEntity): boolean {
  return clarificationsFor(entity).length > 0 || entity.confidence < LOW_CONFIDENCE_THRESHOLD;
}
