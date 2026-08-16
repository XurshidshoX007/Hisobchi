import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories as categoriesTable, imageIntakes, pendingDrafts } from "@/db/schema";
import type { User } from "@/db/schema";
import { todayISO } from "../money";
import { checkRateLimit } from "../security";
import { visionProviderConfigured } from "../env";
import { writeAudit } from "../audit";
import { analyzeFinancialImage } from "../imageIntelligence";
import type { VisionProvider } from "./provider";
import { downloadTelegramImage, type DownloadTelegramImage } from "./telegram-file";
import { imageFingerprint, isSupportedDeclaredMime, pickPhotoSize, type TelegramDocument, type TelegramPhotoSize } from "./file-guards";
import type { UserCategory } from "./categories";
import type { ImageDraft } from "./types";
import {
  IMAGE_DUPLICATE_TEXT,
  IMAGE_FAILURE_TEXT,
  IMAGE_RATE_LIMITED_TEXT,
  IMAGE_SERVICE_UNAVAILABLE_TEXT,
  IMAGE_TOO_LARGE_TEXT,
  IMAGE_UNSUPPORTED_TEXT,
  buildBatchMessage,
  failureEventFor,
  failureTextFor,
  type InlineKeyboard,
} from "./ux";

/**
 * Image intake orchestration (§1).
 *
 * Telegram → file_id → getFile → temp download → preprocessing → vision/OCR →
 * structured extraction → validation → DRAFTS. The money itself is only
 * written after the user confirms, by the shared finance engine.
 */

export const DRAFT_TTL_MS = 30 * 60 * 1000;

export type { TelegramDocument, TelegramPhotoSize } from "./file-guards";

export type ImageIntakeInput = {
  user: User;
  chatId: number;
  messageId: number | null;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  requestId: string;
  ipHash?: string | null;
  /** Injected in tests; production always resolves from the environment. */
  provider?: VisionProvider | null;
  /** Injected in tests; production always downloads from Telegram. */
  download?: DownloadTelegramImage;
};

export type ImageIntakeResult =
  | { ok: true; text: string; keyboard: InlineKeyboard; batchId: string; count: number; event: string }
  | { ok: false; text: string; event: string };

async function userCategories(userId: number): Promise<UserCategory[]> {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      type: categoriesTable.type,
      isActive: categoriesTable.isActive,
    })
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));
  return rows.map((row) => ({ ...row, type: row.type === "income" ? "income" : "expense" }));
}

export async function processImageMessage(input: ImageIntakeInput): Promise<ImageIntakeResult> {
  const { user, chatId, messageId, requestId } = input;

  // §29 cost control: image analysis is far more expensive than text parsing.
  // Checked FIRST, so a rate-limited user never triggers a Telegram download
  // nor a paid vision request.
  const limit = await checkRateLimit({ scope: "telegram-image", identity: String(user.id), limit: 10, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, text: IMAGE_RATE_LIMITED_TEXT, event: "image_rate_limited" };

  // §12: the feature flag is ON but no vision provider is configured. That is
  // an operator misconfiguration — the user must NOT be told "feature
  // disabled", and we must not download the file for nothing.
  if (!input.provider && !visionProviderConfigured()) {
    await writeAudit({
      userId: user.id,
      actorRole: user.role,
      action: "image_provider_unconfigured",
      entity: "image",
      outcome: "failed",
      requestId,
      ipHash: input.ipHash ?? null,
      metadata: { reason: "provider_missing" },
    });
    return { ok: false, text: IMAGE_SERVICE_UNAVAILABLE_TEXT, event: "image_provider_unconfigured" };
  }

  const maxBytes = Number(process.env.IMAGE_MAX_BYTES ?? 5 * 1024 * 1024);
  let fileId: string | null = null;
  let fileUniqueId: string | null = null;

  if (input.document) {
    if (!isSupportedDeclaredMime(input.document.mime_type)) {
      return { ok: false, text: IMAGE_UNSUPPORTED_TEXT, event: "image_rejected" };
    }
    if ((input.document.file_size ?? 0) > maxBytes) {
      return { ok: false, text: IMAGE_TOO_LARGE_TEXT, event: "image_rejected" };
    }
    fileId = input.document.file_id;
    fileUniqueId = input.document.file_unique_id;
  } else if (input.photo?.length) {
    const chosen = pickPhotoSize(input.photo, maxBytes);
    if (!chosen) return { ok: false, text: IMAGE_UNSUPPORTED_TEXT, event: "image_rejected" };
    fileId = chosen.file_id;
    fileUniqueId = chosen.file_unique_id;
  }
  if (!fileId) return { ok: false, text: IMAGE_UNSUPPORTED_TEXT, event: "image_rejected" };

  const download = input.download ?? downloadTelegramImage;
  const downloaded = await download(fileId, { requestId, userId: user.id });
  if (!downloaded.ok) {
    const text =
      downloaded.reason === "too_large"
        ? IMAGE_TOO_LARGE_TEXT
        : downloaded.reason === "unsupported_type"
          ? IMAGE_UNSUPPORTED_TEXT
          : downloaded.reason === "unconfigured"
            ? IMAGE_SERVICE_UNAVAILABLE_TEXT
            : IMAGE_FAILURE_TEXT;
    const event =
      downloaded.reason === "unsupported_type" || downloaded.reason === "too_large"
        ? "image_rejected"
        : downloaded.reason === "unconfigured"
          ? "image_provider_unconfigured"
          : "image_processing_failed";
    return { ok: false, text, event };
  }

  // §24 duplicate protection: the same picture never books money twice.
  const fingerprint = imageFingerprint(fileUniqueId, downloaded.image.contentHash);
  const claimed = await db
    .insert(imageIntakes)
    .values({ userId: user.id, fingerprint, chatId, messageId, status: "processing" })
    .onConflictDoNothing()
    .returning({ id: imageIntakes.id });
  if (!claimed[0]) {
    return { ok: false, text: IMAGE_DUPLICATE_TEXT, event: "image_duplicate" };
  }
  const intakeId = claimed[0].id;

  const today = todayISO();
  const categories = await userCategories(user.id);
  const analysis = await analyzeFinancialImage(downloaded.image, { today, categories, provider: input.provider });

  if (!analysis.ok) {
    // A failed intake is released so a clearer re-send of the same picture is
    // allowed, while a *successful* extraction stays idempotent forever. No
    // orphan `processing` row is ever left behind (§25 lifecycle).
    await db.delete(imageIntakes).where(eq(imageIntakes.id, intakeId)).catch(() => undefined);
    const event = failureEventFor(analysis.reason);
    // Configuration failures are operator problems, not user problems: they
    // are surfaced as a service message and logged WITHOUT any secret (§12).
    await writeAudit({
      userId: user.id,
      actorRole: user.role,
      action: event,
      entity: "image",
      outcome: "failed",
      requestId,
      ipHash: input.ipHash ?? null,
      metadata: { reason: analysis.reason },
    });
    return { ok: false, text: failureTextFor(analysis.reason), event };
  }

  // Safe classification log: what kind of document, not what is inside it.
  await writeAudit({
    userId: user.id,
    actorRole: user.role,
    action: "image_classified",
    entity: "image",
    outcome: "success",
    requestId,
    ipHash: input.ipHash ?? null,
    metadata: { documentClass: analysis.documentClass, rows: analysis.drafts.length },
  });

  const batchId = randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const saved = await db
    .insert(pendingDrafts)
    .values(
      analysis.drafts.map((draft) => ({
        userId: user.id,
        chatId,
        messageId,
        kind: draft.kind,
        batchId,
        payload: draft as unknown as Record<string, unknown>,
        expiresAt,
      })),
    )
    .returning({ id: pendingDrafts.id });

  await db
    .update(imageIntakes)
    .set({
      status: "extracted",
      batchId,
      documentClass: analysis.documentClass,
      entityCount: analysis.drafts.length,
    })
    .where(eq(imageIntakes.id, intakeId));

  const items = saved.map((row, index) => ({ id: row.id, payload: analysis.drafts[index] }));
  const message = buildBatchMessage(items, {
    batchId,
    unparsedRows: analysis.unparsedRows,
    truncatedRows: analysis.truncatedRows,
  });

  // Safe audit log only: counts and classification, never image or OCR text.
  await writeAudit({
    userId: user.id,
    actorRole: user.role,
    action: analysis.unparsedRows.length ? "image_extraction_partial" : "image_extraction_success",
    entity: "image",
    outcome: "success",
    requestId,
    ipHash: input.ipHash ?? null,
    metadata: {
      documentClass: analysis.documentClass,
      rows: analysis.drafts.length,
      unparsed: analysis.unparsedRows.length,
      truncated: analysis.truncatedRows,
      provider: analysis.provider,
    },
  });

  return {
    ok: true,
    text: message.text,
    keyboard: message.keyboard,
    batchId,
    count: analysis.drafts.length,
    event: "image_extraction_success",
  };
}

/** Re-renders the batch message after an item-level edit (§22). */
export async function renderBatchMessage(
  userId: number,
  batchId: string,
): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const rows = await db
    .select({ id: pendingDrafts.id, payload: pendingDrafts.payload, status: pendingDrafts.status })
    .from(pendingDrafts)
    .where(and(eq(pendingDrafts.batchId, batchId), eq(pendingDrafts.userId, userId)))
    .orderBy(asc(pendingDrafts.id));
  const pending = rows.filter((row) => row.status === "pending");
  if (!pending.length) return null;
  return buildBatchMessage(
    pending.map((row) => ({ id: row.id, payload: row.payload as unknown as ImageDraft })),
    { batchId },
  );
}
