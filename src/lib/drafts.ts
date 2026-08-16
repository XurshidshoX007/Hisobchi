import type { User } from "@/db/schema";
import { runMutation } from "./mutations";
import {
  blockerMessage,
  draftBlockers,
  isImageDraft,
  type StoredDraftPayload,
} from "./image/draft-edit";
import type { DraftKind } from "./image/types";

/**
 * Draft → shared finance engine bridge (§33).
 *
 * Every confirmed draft — typed by the bot's NLP or extracted from an image —
 * goes through `runMutation`. There is deliberately no image-specific database
 * code: an image expense is the exact same `transaction.create` a typed
 * message produces, so the Mini App sees it automatically (§34).
 */

export {
  blockerMessage,
  draftBlockers,
  editDraftPayload,
  isImageDraft,
  type DraftEditAction,
  type StoredDraftPayload,
} from "./image/draft-edit";

const MUTATION_ROUTE: Record<DraftKind, { entity: string; action: string }> = {
  transaction: { entity: "transaction", action: "create" },
  payment_plan: { entity: "recurring", action: "create" },
  expected_income: { entity: "expectedIncome", action: "create" },
  debt: { entity: "debt", action: "create" },
};

/**
 * Applies one confirmed draft. Legacy (NLP) drafts keep their historical
 * behaviour; image drafts route by kind.
 */
export async function applyDraft(
  user: User,
  payload: StoredDraftPayload,
): Promise<{ ok: boolean; message: string; id?: number }> {
  if (!isImageDraft(payload)) {
    return runMutation(user, { entity: "transaction", action: "create", data: { ...payload, source: "bot" } });
  }

  const blockers = draftBlockers(payload);
  if (blockers.length) return { ok: false, message: blockerMessage(blockers) };

  const route = MUTATION_ROUTE[payload.kind];
  if (!route) return { ok: false, message: "Noma'lum yozuv turi" };
  const data = { ...(payload.data as Record<string, unknown>) };
  if (payload.kind === "transaction") data.source = "bot";
  return runMutation(user, { entity: route.entity, action: route.action, data });
}
