import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories as categoriesTable, idempotencyKeys, pendingDrafts, telegramUpdates } from "@/db/schema";
import { respondToBotMessage, MAIN_MENU } from "@/lib/bot";
import { ACK, batchSummary, BUTTON, draftSummary, MINI_APP_INTRO, SCHEDULE } from "@/lib/bot-copy";
import { createCreditTermPlan } from "@/lib/mutations";
import {
  isStartCommand,
  parseBatchCallback,
  parseCategoryPickCallback,
  parseDraftCallback,
  parseDraftEditCallback,
  parseScheduleCallback,
} from "@/lib/bot-routing";
import { telegramApi } from "@/lib/telegram";
import { resolveUser } from "@/lib/user";
import { applyDraft, editDraftPayload, isImageDraft } from "@/lib/drafts";
import { processImageMessage, renderBatchMessage } from "@/lib/image/pipeline";
import { buildCategoryKeyboard, buildItemMenu, IMAGE_RECEIVED_TEXT } from "@/lib/image/ux";
import { imageAccessDecision } from "@/lib/image/access";
import type { ImageDraft } from "@/lib/image/types";
import { appUrl, demoModeEnabled, isProduction, telegramWebhookSecret } from "@/lib/env";
import { writeAudit, writeSecurityEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitResponse, securityContext, securityLog } from "@/lib/security";
import { shortDate } from "@/lib/money";
import { formatAmount } from "@/lib/money";
import { downloadCreditDocument, extractCreditDocumentText, parseCreditDocumentText } from "@/lib/credit-document";
import { classifyWebhookFailure } from "@/lib/webhook-failure";
import { PayloadTooLargeError, readJsonBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";

function secretMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function writeSampledPreAuthEvent(params: {
  event: string;
  severity: "warning" | "critical";
  requestId: string;
  ipHash: string;
}) {
  // An unauthenticated flood must not turn into one PostgreSQL INSERT per
  // packet. Keep a globally bounded forensic sample per event; process/edge
  // rate-limit metrics carry the aggregate volume.
  const sample = await checkRateLimit({
    scope: "preauth-security-event-sample",
    identity: params.event,
    limit: 30,
    windowMs: 60_000,
  });
  if (sample.allowed) {
    void writeSecurityEvent({
      event: params.event,
      severity: params.severity,
      requestId: params.requestId,
      ipHash: params.ipHash,
    });
  }
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    message_id?: number;
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_unique_id: string; file_size?: number; width?: number; height?: number }>;
    document?: { file_id: string; file_unique_id: string; mime_type?: string; file_size?: number; file_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
  };
};

export async function POST(request: Request) {
  const sec = securityContext(request);
  let resolvedUserId: number | null = null;
  let claimedUpdateId: number | null = null;
  const callTelegram = (method: string, payload: Record<string, unknown>) =>
    telegramApi(method, payload, { requestId: sec.requestId, userId: resolvedUserId });
  try {
    const secret = telegramWebhookSecret();
    // Strict production is fail-closed if webhook secret is missing.
    if (isProduction() && !demoModeEnabled() && !secret) {
      securityLog("error", "webhook_secret_missing", { requestId: sec.requestId, ipKey: sec.ipKey });
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    const globalLimit = await checkRateLimit({ scope: "telegram-webhook", identity: sec.ipKey, limit: 600, windowMs: 60_000 });
    if (!globalLimit.allowed) {
      await writeSampledPreAuthEvent({
        event: "rate_limit_webhook",
        severity: "critical",
        requestId: sec.requestId,
        ipHash: sec.ipKey,
      });
      return rateLimitResponse(globalLimit.retryAfter, sec.requestId);
    }

    if (secret && !secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
      await writeSampledPreAuthEvent({
        event: "webhook_secret_rejected",
        severity: "critical",
        requestId: sec.requestId,
        ipHash: sec.ipKey,
      });
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = await readJsonBody<TelegramUpdate>(request, 128 * 1024);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        void writeSecurityEvent({ event: "oversized_telegram_update", requestId: sec.requestId, ipHash: sec.ipKey });
        // Oversized input is poison, not a transient dependency failure. A 2xx
        // prevents Telegram from retrying it forever.
        return NextResponse.json({ ok: false, code: "payload_too_large" });
      }
      throw error;
    }
    if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) {
      void writeSecurityEvent({ event: "invalid_telegram_update", requestId: sec.requestId, ipHash: sec.ipKey });
      return NextResponse.json({ ok: false, code: "invalid_update" });
    }

    // Atomic idempotency claim: only the first insert receives a row back.
    const claimed = await db
      .insert(telegramUpdates)
      .values({ updateId: update.update_id })
      .onConflictDoNothing()
      .returning({ updateId: telegramUpdates.updateId });
    if (!claimed[0]) return NextResponse.json({ ok: true, idempotent: true });
    claimedUpdateId = update.update_id;

    const from = update.message?.from ?? update.callback_query?.from;
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (!from || !chatId || !Number.isSafeInteger(from.id) || from.id <= 0) {
      return NextResponse.json({ ok: true });
    }

    const perUser = await checkRateLimit({ scope: "telegram-user", identity: String(from.id), limit: 35, windowMs: 60_000 });
    if (!perUser.allowed) {
      void writeSecurityEvent({ event: "rate_limit_telegram_user", requestId: sec.requestId, ipHash: sec.ipKey });
      return NextResponse.json({ ok: true });
    }

    const user = await resolveUser({
      telegramId: from.id,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      username: from.username ?? null,
    });
    if (!user) {
      void writeSecurityEvent({ event: "blocked_or_invalid_bot_user", requestId: sec.requestId, ipHash: sec.ipKey });
      return NextResponse.json({ ok: true });
    }
    resolvedUserId = user.id;
    await db.update(telegramUpdates).set({ userId: user.id }).where(eq(telegramUpdates.updateId, update.update_id));

    /* ---------------- CALLBACK QUERIES ---------------- */
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data ?? "";
      if (data.length > 64) {
        void writeSecurityEvent({ userId: user.id, event: "invalid_callback_length", requestId: sec.requestId, ipHash: sec.ipKey });
        await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: ACK.invalidRequest });
        return NextResponse.json({ ok: true });
      }

      const draftCallback = parseDraftCallback(data);
      if (draftCallback) {
        const { draftId, action } = draftCallback;
        const draftRow = await db
          .select()
          .from(pendingDrafts)
          .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.chatId, chatId)))
          .limit(1);

        let ack: string = ACK.notFound;
        const draft = draftRow[0];
        if (!draft) {
          void writeSecurityEvent({
            userId: user.id,
            event: "foreign_or_missing_draft_callback",
            severity: "warning",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { draftId },
          });
        } else if (draft.status !== "pending") {
          ack = ACK.alreadyDone;
        } else if (draft.expiresAt && draft.expiresAt.getTime() < Date.now()) {
          await db
            .update(pendingDrafts)
            .set({ status: "expired", resolvedAt: new Date() })
            .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id)));
          ack = ACK.expired;
        } else if (action === "confirm") {
          // Atomic claim prevents two concurrent callback updates from both
          // creating a financial transaction for the same draft.
          const claimedDraft = await db
            .update(pendingDrafts)
            .set({ status: "processing" })
            .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
            .returning({ id: pendingDrafts.id });
          if (!claimedDraft[0]) {
            ack = ACK.alreadySaved;
          } else {
            const payload = draft.payload as Record<string, unknown>;
            const result = await applyDraft(user, payload);
            ack = result.ok ? ACK.saved(result.message) : ACK.failed(result.message);
            await db
              .update(pendingDrafts)
              .set({ status: result.ok ? "confirmed" : "pending", resolvedAt: result.ok ? new Date() : null })
              .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
            await writeAudit({
              userId: user.id,
              actorRole: user.role,
              action: isImageDraft(payload) ? "image_confirmation" : "confirm_draft",
              entity: draft.kind ?? "transaction",
              entityId: result.id ?? null,
              outcome: result.ok ? "success" : "denied",
              requestId: sec.requestId,
              ipHash: sec.ipKey,
              metadata: { draftId },
            });
          }
        } else {
          const cancelled = await db
            .update(pendingDrafts)
            .set({ status: "cancelled", resolvedAt: new Date() })
            .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
            .returning({ id: pendingDrafts.id });
          ack = cancelled[0] ? ACK.cancelled : ACK.alreadyDone;
          await writeAudit({
            userId: user.id,
            actorRole: user.role,
            action: "cancel_draft",
            entity: "transaction",
            outcome: cancelled[0] ? "success" : "denied",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { draftId },
          });
        }

        await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: ack });
        if (cq.message) {
          // For a batch member keep the other buttons alive until the whole
          // batch is resolved; a standalone draft clears its keyboard.
          let inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [];
          if (draft?.batchId) {
            const remaining = await db
              .select({ id: pendingDrafts.id })
              .from(pendingDrafts)
              .where(and(eq(pendingDrafts.batchId, draft.batchId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
              .orderBy(asc(pendingDrafts.id));
            if (remaining.length) {
              const siblings = await db
                .select({ id: pendingDrafts.id })
                .from(pendingDrafts)
                .where(and(eq(pendingDrafts.batchId, draft.batchId), eq(pendingDrafts.userId, user.id)))
                .orderBy(asc(pendingDrafts.id));
              const pendingIds = new Set(remaining.map((r) => r.id));
              const itemButtons = siblings
                .map((row, i) => ({ row, i }))
                .filter(({ row }) => pendingIds.has(row.id))
                .map(({ row, i }) => ({ text: `✅ ${i + 1}`, callback_data: `draft:${row.id}:confirm` }));
              const itemRows: Array<Array<{ text: string; callback_data: string }>> = [];
              for (let i = 0; i < itemButtons.length; i += 5) itemRows.push(itemButtons.slice(i, i + 5));
              inlineKeyboard = [
                [
                  { text: BUTTON.confirmAll, callback_data: `batch:${draft.batchId}:confirm` },
                  { text: BUTTON.cancel, callback_data: `batch:${draft.batchId}:cancel` },
                ],
                ...itemRows,
              ];
            }
          }
          await callTelegram("editMessageReplyMarkup", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: inlineKeyboard },
          });
          await callTelegram("sendMessage", {
            chat_id: cq.message.chat.id,
            text: ack,
            reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
          });
        }
        return NextResponse.json({ ok: true });
      }

      const batchCallback = parseBatchCallback(data);
      if (batchCallback) {
        const { batchId, action } = batchCallback;
        const batchRows = await db
          .select()
          .from(pendingDrafts)
          .where(and(eq(pendingDrafts.batchId, batchId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.chatId, chatId)))
          .orderBy(asc(pendingDrafts.id));

        let ack: string = ACK.notFound;
        if (!batchRows.length) {
          void writeSecurityEvent({
            userId: user.id,
            event: "foreign_or_missing_batch_callback",
            severity: "warning",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { batchId },
          });
        } else if (action === "cancel") {
          const cancelled = await db
            .update(pendingDrafts)
            .set({ status: "cancelled", resolvedAt: new Date() })
            .where(and(eq(pendingDrafts.batchId, batchId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
            .returning({ id: pendingDrafts.id });
          ack = cancelled.length ? ACK.cancelledCount(cancelled.length) : ACK.alreadyDone;
          await writeAudit({
            userId: user.id,
            actorRole: user.role,
            action: "cancel_batch",
            entity: "transaction",
            outcome: cancelled.length ? "success" : "denied",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { batchId, count: cancelled.length },
          });
        } else {
          // Confirm each draft with its own atomic pending→processing claim,
          // so a duplicate callback can never double-write a transaction.
          let okCount = 0;
          let failCount = 0;
          let alreadyDone = 0;
          for (const draft of batchRows) {
            if (draft.status !== "pending") {
              alreadyDone += 1;
              continue;
            }
            if (draft.expiresAt && draft.expiresAt.getTime() < Date.now()) {
              await db
                .update(pendingDrafts)
                .set({ status: "expired", resolvedAt: new Date() })
                .where(and(eq(pendingDrafts.id, draft.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")));
              failCount += 1;
              continue;
            }
            const claimedDraft = await db
              .update(pendingDrafts)
              .set({ status: "processing" })
              .where(and(eq(pendingDrafts.id, draft.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
              .returning({ id: pendingDrafts.id });
            if (!claimedDraft[0]) {
              alreadyDone += 1;
              continue;
            }
            const payload = draft.payload as Record<string, unknown>;
            const result = await applyDraft(user, payload);
            if (result.ok) okCount += 1;
            else failCount += 1;
            // A row that could not be saved stays PENDING (never silently
            // dropped, §23): the user can still edit and confirm it.
            await db
              .update(pendingDrafts)
              .set({ status: result.ok ? "confirmed" : "pending", resolvedAt: result.ok ? new Date() : null })
              .where(and(eq(pendingDrafts.id, draft.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
          }
          if (okCount && !failCount) ack = ACK.savedCount(okCount);
          else if (okCount) ack = ACK.savedPartly(okCount, failCount);
          else if (alreadyDone && !failCount) ack = ACK.alreadySaved;
          else ack = ACK.saveFailed;
          await writeAudit({
            userId: user.id,
            actorRole: user.role,
            action: "confirm_batch",
            entity: "transaction",
            outcome: okCount ? "success" : "denied",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { batchId, okCount, failCount },
          });
        }

        await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: ack.slice(0, 190) });
        if (cq.message) {
          // Rows that still need clarification keep their buttons so nothing
          // silently disappears from the batch (§23, §30).
          const remaining = await renderBatchMessage(user.id, batchId);
          await callTelegram("editMessageReplyMarkup", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: remaining?.keyboard ?? [] },
          });
          await callTelegram("sendMessage", {
            chat_id: cq.message.chat.id,
            text: ack,
            reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
          });
        }
        return NextResponse.json({ ok: true });
      }

      const scheduleCallback = parseScheduleCallback(data);
      if (scheduleCallback) {
        const { batchId, action } = scheduleCallback;
        const rows = await db
          .select()
          .from(pendingDrafts)
          .where(and(eq(pendingDrafts.batchId, batchId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.chatId, chatId)))
          .orderBy(asc(pendingDrafts.id));

        let ack: string = ACK.notFound;
        if (!rows.length) {
          void writeSecurityEvent({
            userId: user.id,
            event: "foreign_or_missing_schedule_callback",
            severity: "warning",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { batchId },
          });
        } else {
          const draft = rows[0];
          // Schedule stored as single row per batch
          const scheduleRow = rows.find((r) => r.kind === "payment_schedule") ?? draft;
          if (scheduleRow.status !== "pending") {
            ack = ACK.alreadyDone;
          } else if (scheduleRow.expiresAt && scheduleRow.expiresAt.getTime() < Date.now()) {
            await db
              .update(pendingDrafts)
              .set({ status: "expired", resolvedAt: new Date() })
              .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id)));
            ack = ACK.expired;
          } else if (action === "cancel") {
            const cancelled = await db
              .update(pendingDrafts)
              .set({ status: "cancelled", resolvedAt: new Date() })
              .where(and(eq(pendingDrafts.batchId, batchId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
              .returning({ id: pendingDrafts.id });
            ack = cancelled.length ? ACK.cancelled : ACK.alreadyDone;
            await writeAudit({
              userId: user.id,
              actorRole: user.role,
              action: "cancel_schedule",
              entity: "recurring",
              outcome: cancelled.length ? "success" : "denied",
              requestId: sec.requestId,
              ipHash: sec.ipKey,
              metadata: { batchId },
            });
          } else {
            // confirm - atomic claim + idempotency + transaction
            const claimed = await db
              .update(pendingDrafts)
              .set({ status: "processing" })
              .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
              .returning({ id: pendingDrafts.id });
            if (!claimed[0]) {
              ack = ACK.alreadySaved;
            } else {
              const payload = scheduleRow.payload as unknown as { name: string; items: Array<{ date: string; amount: number; principalAmount?: number; interestAmount?: number; feeAmount?: number }>; totalAmount: number };
              // Idempotency fingerprint
              const fingerprint = createHash("sha256")
                .update(JSON.stringify({ name: payload.name, items: payload.items.map((i) => ({ date: i.date, amount: i.amount })) }))
                .digest("hex");
              const idemKey = `schedule:${fingerprint.slice(0, 32)}`;
              const scope = "payment_schedule";
              // Claim idempotency. A database error is NOT evidence of a
              // duplicate: treating a timeout as "already saved" can confirm a
              // draft whose credit plan was never created.
              let claimedIdem: Array<{ id: number }>;
              try {
                claimedIdem = await db
                  .insert(idempotencyKeys)
                  .values({
                    userId: user.id,
                    key: idemKey,
                    scope,
                    requestHash: fingerprint,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                  })
                  .onConflictDoNothing()
                  .returning({ id: idempotencyKeys.id });
              } catch {
                await db
                  .update(pendingDrafts)
                  .set({ status: "pending", resolvedAt: null })
                  .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")))
                  .catch(() => undefined);
                throw new Error("schedule_idempotency_claim_failed");
              }
              if (!claimedIdem[0]) {
                const existingClaim = await db
                  .select({ status: idempotencyKeys.status })
                  .from(idempotencyKeys)
                  .where(and(eq(idempotencyKeys.userId, user.id), eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, scope)))
                  .limit(1);
                if (existingClaim[0]?.status === "completed") {
                  await db
                    .update(pendingDrafts)
                    .set({ status: "confirmed", resolvedAt: new Date() })
                    .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
                  ack = SCHEDULE.duplicateSaved;
                } else {
                  // An old `processing` claim is ambiguous: it may represent a
                  // transaction whose COMMIT acknowledgement was lost. Keep the
                  // draft retryable and never assert that money was saved.
                  await db
                    .update(pendingDrafts)
                    .set({ status: "pending", resolvedAt: null })
                    .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
                  ack = ACK.failed("Oldingi saqlash holati tekshirilmoqda. Keyinroq qayta urinib ko‘ring.");
                }
              } else {
                // §8/§9/§10: the whole schedule is saved by ONE atomic business
                // operation in the shared mutation layer — one `term` plan plus
                // every installment, all-or-nothing. No per-installment
                // one_time plans are created here anymore.
                // Validation failures return {ok:false}; dependency/COMMIT
                // ambiguity must throw and KEEP the processing idempotency row.
                // Converting every exception to a normal rejection would delete
                // the claim and permit a duplicate credit plan on retry.
                let created: { ok: boolean; message: string; id?: number };
                try {
                  created = await createCreditTermPlan(user, {
                    name: payload.name,
                    installments: payload.items,
                    isMandatory: true,
                    creditMode: payload.items.every((item) => item.principalAmount !== undefined && item.interestAmount !== undefined && item.feeAmount !== undefined),
                  });
                } catch (error) {
                  await db
                    .update(pendingDrafts)
                    .set({ status: "pending", resolvedAt: null })
                    .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")))
                    .catch(() => undefined);
                  throw error;
                }
                if (!created.ok) {
                  await db
                    .update(pendingDrafts)
                    .set({ status: "pending", resolvedAt: null })
                    .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
                  await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.userId, user.id), eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, scope))).catch(() => undefined);
                  ack = ACK.failed(created.message);
                } else {
                  await db
                    .update(idempotencyKeys)
                    .set({ status: "completed", resultId: created.id ?? null })
                    .where(and(eq(idempotencyKeys.userId, user.id), eq(idempotencyKeys.key, idemKey), eq(idempotencyKeys.scope, scope)));
                  await db
                    .update(pendingDrafts)
                    .set({ status: "confirmed", resolvedAt: new Date() })
                    .where(and(eq(pendingDrafts.id, scheduleRow.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
                  const total = payload.totalAmount ?? payload.items.reduce((s, i) => s + i.amount, 0);
                  const nearest = [...payload.items].sort((a, b) => a.date.localeCompare(b.date))[0];
                  ack = SCHEDULE.savedShort;
                  // Send success details as follow-up message (ack is callback answer, details via sendMessage later)
                  // Store details for later send
                  (scheduleRow as unknown as Record<string, unknown>).__successDetails = JSON.stringify({ name: payload.name, count: payload.items.length, total, nearest });
                  await writeAudit({
                    userId: user.id,
                    actorRole: user.role,
                    action: "confirm_schedule",
                    entity: "recurring",
                    outcome: "success",
                    requestId: sec.requestId,
                    ipHash: sec.ipKey,
                    metadata: { batchId, count: payload.items.length, planId: created.id ?? null },
                  });
                }
              }
            }
          }
        }
        await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: ack.slice(0, 190) });
        if (cq.message) {
          await callTelegram("editMessageReplyMarkup", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: [] },
          });
          // If confirmed, send short success summary
          const rowsNow = await db.select().from(pendingDrafts).where(and(eq(pendingDrafts.batchId, batchId), eq(pendingDrafts.userId, user.id))).limit(1);
          const isConfirmed = rowsNow[0]?.status === "confirmed";
          let followText = ack;
          if (isConfirmed && ack.startsWith("✅")) {
            try {
              const payload = rowsNow[0].payload as unknown as { name: string; items: Array<{ date: string; amount: number }>; totalAmount: number };
              const total = payload.totalAmount ?? payload.items.reduce((s, i) => s + i.amount, 0);
              const nearest = [...payload.items].sort((a, b) => a.date.localeCompare(b.date))[0];
              followText = SCHEDULE.saved(payload.name, payload.items.length, total, shortDate(nearest.date), nearest.amount);
            } catch {}
          }
          await callTelegram("sendMessage", {
            chat_id: cq.message.chat.id,
            text: followText,
            reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
          });
        }
        return NextResponse.json({ ok: true });
      }

      /* ------- item-level edit of an image draft (§22) ------- */
      const editCallback = parseDraftEditCallback(data);
      const pickCallback = editCallback ? null : parseCategoryPickCallback(data);
      if (editCallback || pickCallback) {
        const draftId = editCallback?.draftId ?? pickCallback!.draftId;
        const rows = await db
          .select()
          .from(pendingDrafts)
          .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.chatId, chatId)))
          .limit(1);
        const draft = rows[0];
        if (!draft || draft.status !== "pending" || !isImageDraft(draft.payload as Record<string, unknown>)) {
          void writeSecurityEvent({
            userId: user.id,
            event: "foreign_or_missing_draft_callback",
            severity: "warning",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { draftId },
          });
          await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: ACK.notFound });
          return NextResponse.json({ ok: true });
        }
        const payload = draft.payload as unknown as ImageDraft;

        if (editCallback?.action === "menu") {
          const menu = buildItemMenu(draftId, payload);
          await callTelegram("answerCallbackQuery", { callback_query_id: cq.id });
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: menu.text,
            reply_markup: { inline_keyboard: menu.keyboard },
          });
          return NextResponse.json({ ok: true });
        }

        if (editCallback?.action === "cat") {
          const type = (payload.data as { type?: string }).type === "income" || payload.kind === "expected_income" ? "income" : "expense";
          const catRows = await db
            .select({
              id: categoriesTable.id,
              name: categoriesTable.name,
              type: categoriesTable.type,
              isActive: categoriesTable.isActive,
            })
            .from(categoriesTable)
            .where(and(eq(categoriesTable.userId, user.id), eq(categoriesTable.isActive, true)))
            .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));
          const keyboard = buildCategoryKeyboard(
            draftId,
            catRows.map((row) => ({ ...row, type: row.type === "income" ? "income" : "expense" })),
            type,
          );
          await callTelegram("answerCallbackQuery", { callback_query_id: cq.id });
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: "📁 Mavjud kategoriyalaringizdan birini tanlang:",
            reply_markup: { inline_keyboard: keyboard },
          });
          return NextResponse.json({ ok: true });
        }

        if (editCallback?.action === "drop") {
          await db
            .update(pendingDrafts)
            .set({ status: "cancelled", resolvedAt: new Date() })
            .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")));
          await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "Yozuv olib tashlandi" });
          await callTelegram("sendMessage", { chat_id: chatId, text: "🗑 Yozuv ro'yxatdan olib tashlandi." });
          return NextResponse.json({ ok: true });
        }

        let categoryName: string | null = null;
        if (pickCallback) {
          const owned = await db
            .select({ id: categoriesTable.id, name: categoriesTable.name })
            .from(categoriesTable)
            .where(and(eq(categoriesTable.id, pickCallback.categoryId), eq(categoriesTable.userId, user.id), eq(categoriesTable.isActive, true)))
            .limit(1);
          if (!owned[0]) {
            await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "Kategoriya topilmadi" });
            return NextResponse.json({ ok: true });
          }
          categoryName = owned[0].name;
        }

        const edit = pickCallback
          ? editDraftPayload(draft.payload as Record<string, unknown>, "cat", String(pickCallback.categoryId), { categoryName })
          : editDraftPayload(draft.payload as Record<string, unknown>, editCallback!.action as "type" | "date" | "dir", "value" in editCallback! ? editCallback!.value : "");
        if (!edit.ok) {
          await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: edit.ack });
          return NextResponse.json({ ok: true });
        }
        await db
          .update(pendingDrafts)
          .set({ payload: edit.payload })
          .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")));
        await writeAudit({
          userId: user.id,
          actorRole: user.role,
          action: "image_draft_edited",
          entity: draft.kind ?? "transaction",
          outcome: "success",
          requestId: sec.requestId,
          ipHash: sec.ipKey,
          metadata: { draftId, field: pickCallback ? "category" : editCallback!.action },
        });
        const updatedMenu = buildItemMenu(draftId, edit.payload as unknown as ImageDraft);
        await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: edit.ack.slice(0, 190) });
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `${ACK.edited(edit.ack)}\n\n${updatedMenu.text}`,
          reply_markup: { inline_keyboard: updatedMenu.keyboard },
        });
        return NextResponse.json({ ok: true });
      }

      void writeSecurityEvent({ userId: user.id, event: "unknown_callback", requestId: sec.requestId, ipHash: sec.ipKey });
      await callTelegram("answerCallbackQuery", { callback_query_id: cq.id });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- IMAGE / DOCUMENT MESSAGES ---------------- */
    const photo = update.message?.photo;
    const document = update.message?.document;
    const isImageDocument = Boolean(document?.mime_type?.toLowerCase().startsWith("image/"));
    const documentMime = document?.mime_type?.toLowerCase() ?? "";
    const isCreditDocument = Boolean(
      document &&
        !isImageDocument &&
        (documentMime === "application/pdf" || documentMime.startsWith("text/") || documentMime.includes("spreadsheetml") || documentMime.includes("wordprocessingml") || /\.(pdf|csv|xlsx?|docx?|txt)$/i.test(document.file_name ?? "")),
    );
    // A document name or an external signed URL can contain long numbers that
    // look like money. It is never safe to feed those identifiers into the
    // natural-language transaction parser. Files are parsed locally, and only
    // a fully reconciled schedule is allowed to reach the preview step.
    if (isCreditDocument) {
      const raw = await downloadCreditDocument(
        { fileId: document!.file_id, fileName: document!.file_name, mimeType: document!.mime_type },
        { requestId: sec.requestId, userId: user.id },
      );
      const extracted = raw ? await extractCreditDocumentText(raw, document!.file_name, document!.mime_type) : null;
      const schedule = extracted ? parseCreditDocumentText(extracted, document!.file_name ?? "Kredit") : null;
      if (schedule) {
        const batchId = randomBytes(8).toString("hex");
        await db.insert(pendingDrafts).values({
          userId: user.id,
          chatId,
          kind: "payment_schedule",
          batchId,
          payload: schedule as unknown as Record<string, unknown>,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });
        const principal = schedule.items.reduce((sum, item) => sum + (item.principalAmount ?? 0), 0);
        const fees = schedule.items.reduce((sum, item) => sum + (item.interestAmount ?? 0) + (item.feeAmount ?? 0), 0);
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: ["📋 Kredit jadvali topildi", "", schedule.name, `${schedule.items.length} ta to‘lov · jami ${formatAmount(schedule.totalAmount)} so‘m`, `Asosiy qism: ${formatAmount(principal)} so‘m`, `Foiz va komissiya: ${formatAmount(fees)} so‘m`, "", "Saqlashdan oldin hammasini tekshiring."].join("\n"),
          reply_markup: { inline_keyboard: [[{ text: BUTTON.confirmAll, callback_data: `schedule:${batchId}:confirm` }, { text: BUTTON.cancel, callback_data: `schedule:${batchId}:cancel` }]] },
        });
        return NextResponse.json({ ok: true });
      }
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: "📎 Fayl o‘qildi, lekin kredit jadvalidagi sana, jami, asosiy qism va foizlar aniq ajratilmadi. Hech narsa saqlanmadi. Jadval matnli PDF, CSV, Excel (.xlsx) yoki Word (.docx) bo‘lishi va kamida 2 ta to‘lov tarkibi to‘liq ko‘rinishi kerak.",
        reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
      });
      return NextResponse.json({ ok: true });
    }
    if ((photo && photo.length) || isImageDocument) {
      // §12/§33: one gate decides. The flag covers ONLY image handling —
      // text messages below are untouched — and a missing provider is
      // reported as a service problem, never as "feature disabled".
      const access = imageAccessDecision(from.id);
      if (!access.allowed) {
        if (access.reason === "provider_unconfigured") {
          securityLog("error", "image_provider_unconfigured", { requestId: sec.requestId, userId: user.id, ipKey: sec.ipKey });
        }
        void writeAudit({
          userId: user.id,
          actorRole: user.role,
          action: access.event,
          entity: "image",
          outcome: access.outcome,
          requestId: sec.requestId,
          ipHash: sec.ipKey,
          metadata: { reason: access.reason },
        });
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: access.text,
          reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
        });
        return NextResponse.json({ ok: true });
      }

      void writeAudit({
        userId: user.id,
        actorRole: user.role,
        action: "image_received",
        entity: "image",
        outcome: "success",
        requestId: sec.requestId,
        ipHash: sec.ipKey,
        metadata: { kind: photo?.length ? "photo" : "document" },
      });
      await callTelegram("sendMessage", { chat_id: chatId, text: IMAGE_RECEIVED_TEXT });

      const outcome = await processImageMessage({
        user,
        chatId,
        messageId: update.message?.message_id ?? null,
        photo,
        document: isImageDocument ? document : undefined,
        requestId: sec.requestId,
        ipHash: sec.ipKey,
      });

      if (!outcome.ok) {
        void writeAudit({
          userId: user.id,
          actorRole: user.role,
          action: outcome.event,
          entity: "image",
          outcome: "denied",
          requestId: sec.requestId,
          ipHash: sec.ipKey,
        });
        // Never surface a raw AI/provider error to the user (§25).
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: outcome.text,
          reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
        });
        return NextResponse.json({ ok: true });
      }

      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: `✅ ${outcome.count} ta operatsiya topildi.`,
      });
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: outcome.text,
        reply_markup: { inline_keyboard: outcome.keyboard },
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- MESSAGES ---------------- */
    const text = update.message?.text ?? "";
    if (text.length > 4_096) return NextResponse.json({ ok: true });
    if (/^https?:\/\/\S+$/i.test(text.trim())) {
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: "🔗 Havola operatsiya sifatida qabul qilinmadi. Kredit PDF’ini fayl qilib yuboring yoki /kredit formatidagi jadvalni jo‘nating — tasdiqlanmaguncha hech narsa saqlanmaydi.",
        reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
      });
      return NextResponse.json({ ok: true });
    }
    const reply = await respondToBotMessage(user, text);

    // Payment schedule drafts (single batch)
    if (reply.schedule) {
      const schedule = reply.schedule;
      const batchId = randomBytes(8).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.insert(pendingDrafts).values({
        userId: user.id,
        chatId,
        kind: "payment_schedule",
        batchId,
        payload: schedule as unknown as Record<string, unknown>,
        expiresAt,
      });
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: reply.text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: BUTTON.confirmAll, callback_data: `schedule:${batchId}:confirm` },
              { text: BUTTON.cancel, callback_data: `schedule:${batchId}:cancel` },
            ],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    const drafts = reply.drafts ?? (reply.draft ? [reply.draft] : []);
    if (drafts.length === 1) {
      const draft = drafts[0];
      const [saved] = await db
        .insert(pendingDrafts)
        .values({
          userId: user.id,
          chatId,
          kind: "transaction",
          payload: draft,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .returning();
      // One wording for a draft, shared with the Mini App bot console.
      const summary = draftSummary(draft);
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: summary,
        reply_markup: {
          inline_keyboard: [
            [
              { text: BUTTON.confirm, callback_data: `draft:${saved.id}:confirm` },
              { text: BUTTON.cancel, callback_data: `draft:${saved.id}:cancel` },
            ],
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }
    if (drafts.length > 1) {
      // One message → several drafts sharing a batch id. Confirm-all and
      // cancel-all act on the whole group; each draft also gets its own
      // inline button for individual confirmation.
      const batchId = randomBytes(8).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const saved = await db
        .insert(pendingDrafts)
        .values(
          drafts.map((draft) => ({
            userId: user.id,
            chatId,
            kind: "transaction" as const,
            batchId,
            payload: draft,
            expiresAt,
          })),
        )
        .returning();
      const summary = batchSummary(drafts, reply.failedSegments ?? []);
      const itemButtons = saved.map((row, i) => ({
        text: `✅ ${i + 1}`,
        callback_data: `draft:${row.id}:confirm`,
      }));
      const itemRows: Array<Array<{ text: string; callback_data: string }>> = [];
      for (let i = 0; i < itemButtons.length; i += 5) itemRows.push(itemButtons.slice(i, i + 5));
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: summary,
        reply_markup: {
          inline_keyboard: [
            [
              { text: BUTTON.confirmAll, callback_data: `batch:${batchId}:confirm` },
              { text: BUTTON.cancel, callback_data: `batch:${batchId}:cancel` },
            ],
            ...itemRows,
          ],
        },
      });
      return NextResponse.json({ ok: true });
    }

    // No parse_mode: user-controlled category/name text is always plain text,
    // eliminating Telegram HTML injection.
    await callTelegram("sendMessage", {
      chat_id: chatId,
      text: reply.text,
      reply_markup: { keyboard: reply.keyboard, resize_keyboard: true, is_persistent: true },
    });

    if (isStartCommand(text)) {
      const url = appUrl();
      if (url) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: MINI_APP_INTRO,
          reply_markup: { inline_keyboard: [[{ text: BUTTON.miniApp, web_app: { url } }]] },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = classifyWebhookFailure(error);
    // Release the update claim after an internal/database failure so Telegram
    // can retry it. Draft status transitions remain atomic and prevent a retry
    // from creating a second transaction. If Postgres is still unavailable,
    // emit an explicit secondary-failure signal instead of silently swallowing
    // the stuck claim.
    if (claimedUpdateId !== null && failure.code !== "invalid_json") {
      try {
        await db.delete(telegramUpdates).where(eq(telegramUpdates.updateId, claimedUpdateId));
      } catch {
        securityLog("error", "webhook_claim_release_failed", {
          requestId: sec.requestId,
          userId: resolvedUserId,
          ipKey: sec.ipKey,
          code: "database",
        });
      }
    }
    securityLog("error", "webhook_error", {
      requestId: sec.requestId,
      userId: resolvedUserId,
      ipKey: sec.ipKey,
      code: failure.code,
    });
    void writeSecurityEvent({
      userId: resolvedUserId,
      event: "telegram_webhook_error",
      severity: "warning",
      requestId: sec.requestId,
      ipHash: sec.ipKey,
      metadata: { code: failure.code },
    });
    // A malformed body is poison and must not be retried forever. Crucially,
    // claim absence does NOT imply malformed input: Postgres can fail before
    // the INSERT returns. Every non-syntax failure therefore returns 500.
    return NextResponse.json({ ok: failure.code === "invalid_json" }, { status: failure.status });
  }
}
