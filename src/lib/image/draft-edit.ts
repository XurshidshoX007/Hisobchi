import { addDays, todayISO } from "../money";
import type { ExtractionIssue, ImageDraft } from "./types";

/**
 * Pure draft helpers shared by the webhook and the confirmation layer.
 *
 * Dependency-free on purpose (no DB, no Next.js): the rules that decide when a
 * draft may be saved and how an inline edit rewrites it are pure functions and
 * are unit-tested as such.
 */

export type StoredDraftPayload = Record<string, unknown>;

/** Drafts produced by the image pipeline carry `{kind, data, meta}`. */
export function isImageDraft(payload: StoredDraftPayload | null | undefined): payload is ImageDraft & StoredDraftPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<ImageDraft>;
  return (
    typeof candidate.kind === "string" &&
    Boolean(candidate.data) &&
    typeof candidate.data === "object" &&
    Boolean(candidate.meta) &&
    (candidate.meta as { source?: string } | undefined)?.source === "image"
  );
}

/** Issues that must be resolved by the user before anything is saved (§17). */
export const BLOCKING_ISSUES: ExtractionIssue[] = [
  "debt_direction_unknown",
  "amount_unclear",
  "amount_invalid",
  "date_invalid",
  "plan_invalid",
];

export function draftBlockers(payload: StoredDraftPayload): ExtractionIssue[] {
  if (!isImageDraft(payload)) return [];
  return (payload.meta.issues ?? []).filter((issue) => BLOCKING_ISSUES.includes(issue));
}

export function blockerMessage(issues: ExtractionIssue[]): string {
  const labels: Record<string, string> = {
    debt_direction_unknown: "qarz yo'nalishi",
    amount_unclear: "summa",
    amount_invalid: "summa",
    date_invalid: "sana",
    plan_invalid: "reja muddati",
    category_unknown: "kategoriya",
    type_unclear: "operatsiya turi",
    date_unclear: "sana",
    duplicate_row: "takroriy qator",
  };
  const list = issues.map((issue) => labels[issue] ?? issue);
  return `Aniqlashtirish kerak: ${[...new Set(list)].join(", ")}`;
}



export type DraftEditAction = "type" | "date" | "dir" | "cat" | "drop";

/**
 * Applies an inline edit to a stored draft payload (§22) and returns the new
 * payload. Pure: persistence is the caller's job.
 */
export function editDraftPayload(
  payload: StoredDraftPayload,
  action: DraftEditAction,
  value: string,
  context: { today?: string; categoryName?: string | null } = {},
): { ok: boolean; payload: StoredDraftPayload; ack: string } {
  const today = context.today ?? todayISO();
  if (!isImageDraft(payload)) return { ok: false, payload, ack: "Bu operatsiyani tahrirlab bo‘lmaydi" };
  const next: ImageDraft = {
    kind: payload.kind,
    data: { ...(payload.data as Record<string, unknown>) },
    meta: { ...payload.meta, issues: [...(payload.meta.issues ?? [])] },
  };

  switch (action) {
    case "type": {
      if (next.kind !== "transaction" || (value !== "income" && value !== "expense")) {
        return { ok: false, payload, ack: "Bu operatsiya turini o‘zgartirib bo‘lmaydi" };
      }
      next.data.type = value;
      // A type flip invalidates the category mapping (income ≠ expense tree).
      next.data.categoryId = null;
      next.meta.issues = unique([...next.meta.issues, "category_unknown"]);
      return { ok: true, payload: next as unknown as StoredDraftPayload, ack: value === "income" ? "Daromad deb belgilandi" : "Xarajat deb belgilandi" };
    }
    case "date": {
      const date = value === "yesterday" ? addDays(today, -1) : value === "today" ? today : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
      if (!date) return { ok: false, payload, ack: "Sana noto‘g‘ri" };
      if (next.kind === "transaction") next.data.date = date;
      else if (next.kind === "expected_income") next.data.expectedDate = date;
      else if (next.kind === "payment_plan") {
        next.data.nextDueDate = date;
        next.data.startDate = date;
        next.data.dueDay = Math.min(28, Math.max(1, Number(date.slice(8, 10))));
      } else next.data.dueDate = date;
      next.meta.issues = next.meta.issues.filter((i) => i !== "date_unclear" && i !== "date_invalid");
      return { ok: true, payload: next as unknown as StoredDraftPayload, ack: `Sana: ${date}` };
    }
    case "dir": {
      if (next.kind !== "debt" || (value !== "i_owe" && value !== "owed_to_me")) {
        return { ok: false, payload, ack: "Yo‘nalishni o‘zgartirib bo‘lmaydi" };
      }
      next.data.direction = value;
      next.meta.issues = next.meta.issues.filter((i) => i !== "debt_direction_unknown");
      return {
        ok: true,
        payload: next as unknown as StoredDraftPayload,
        ack: value === "i_owe" ? "Men qarzdorman deb belgilandi" : "Menga qarzdor deb belgilandi",
      };
    }
    case "cat": {
      const categoryId = Number(value);
      if (!Number.isSafeInteger(categoryId) || categoryId <= 0) return { ok: false, payload, ack: "Kategoriya noto‘g‘ri" };
      next.data.categoryId = categoryId;
      next.meta.issues = next.meta.issues.filter((i) => i !== "category_unknown");
      next.meta.suggestedCategory = null;
      if (context.categoryName) {
        next.meta.label = next.meta.label.replace(/kategoriya tanlanmagan|·\s*[^·]*$/, `· ${context.categoryName}`);
      }
      return { ok: true, payload: next as unknown as StoredDraftPayload, ack: `Kategoriya: ${context.categoryName ?? "yangilandi"}` };
    }
    case "drop":
      return { ok: true, payload: next as unknown as StoredDraftPayload, ack: "Ro‘yxatdan olib tashlandi" };
    default:
      return { ok: false, payload, ack: "Bu amalni bajarib bo‘lmadi" };
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
