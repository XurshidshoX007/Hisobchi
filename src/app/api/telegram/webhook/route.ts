import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pendingDrafts, telegramUpdates } from "@/db/schema";
import { respondToBotMessage, MAIN_MENU } from "@/lib/bot";
import { isStartCommand, parseBatchCallback, parseDraftCallback } from "@/lib/bot-routing";
import { telegramApi } from "@/lib/telegram";
import { resolveUser } from "@/lib/user";
import { runMutation } from "@/lib/mutations";
import { appUrl, demoModeEnabled, isProduction, telegramWebhookSecret } from "@/lib/env";
import { writeAudit, writeSecurityEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitResponse, securityContext, securityLog } from "@/lib/security";
import { formatAmount, humanDate } from "@/lib/money";

export const dynamic = "force-dynamic";

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
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
    if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      void writeSecurityEvent({ event: "webhook_secret_rejected", severity: "critical", requestId: sec.requestId, ipHash: sec.ipKey });
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const globalLimit = await checkRateLimit({ scope: "telegram-webhook", identity: sec.ipKey, limit: 600, windowMs: 60_000 });
    if (!globalLimit.allowed) {
      void writeSecurityEvent({ event: "rate_limit_webhook", severity: "critical", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(globalLimit.retryAfter, sec.requestId);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 128 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
    const update = (await request.json()) as TelegramUpdate;
    if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) {
      void writeSecurityEvent({ event: "invalid_telegram_update", requestId: sec.requestId, ipHash: sec.ipKey });
      return NextResponse.json({ ok: false }, { status: 400 });
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
        await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: "Noto'g'ri so'rov" });
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

        let ack = "So'rov topilmadi";
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
          ack = "Bu so'rov avval yakunlangan";
        } else if (draft.expiresAt && draft.expiresAt.getTime() < Date.now()) {
          await db
            .update(pendingDrafts)
            .set({ status: "expired", resolvedAt: new Date() })
            .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id)));
          ack = "Tasdiqlash muddati tugagan";
        } else if (action === "confirm") {
          // Atomic claim prevents two concurrent callback updates from both
          // creating a financial transaction for the same draft.
          const claimedDraft = await db
            .update(pendingDrafts)
            .set({ status: "processing" })
            .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")))
            .returning({ id: pendingDrafts.id });
          if (!claimedDraft[0]) {
            ack = "Bu so'rov avval qayta ishlangan";
          } else {
            const payload = draft.payload as Record<string, unknown>;
            const result = await runMutation(user, {
              entity: "transaction",
              action: "create",
              data: { ...payload, source: "bot" },
            });
            ack = result.ok ? `✅ ${result.message}` : `⛔ ${result.message}`;
            await db
              .update(pendingDrafts)
              .set({ status: result.ok ? "confirmed" : "pending", resolvedAt: result.ok ? new Date() : null })
              .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
            await writeAudit({
              userId: user.id,
              actorRole: user.role,
              action: "confirm_draft",
              entity: "transaction",
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
          ack = cancelled[0] ? "Bekor qilindi" : "Bu so'rov avval yakunlangan";
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
                  { text: "✅ Barchasini tasdiqlash", callback_data: `batch:${draft.batchId}:confirm` },
                  { text: "❌ Bekor qilish", callback_data: `batch:${draft.batchId}:cancel` },
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

        let ack = "So'rov topilmadi";
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
          ack = cancelled.length ? `❌ ${cancelled.length} ta operatsiya bekor qilindi` : "Bu so'rov avval yakunlangan";
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
            const result = await runMutation(user, {
              entity: "transaction",
              action: "create",
              data: { ...payload, source: "bot" },
            });
            if (result.ok) okCount += 1;
            else failCount += 1;
            await db
              .update(pendingDrafts)
              .set({ status: result.ok ? "confirmed" : "cancelled", resolvedAt: new Date() })
              .where(and(eq(pendingDrafts.id, draft.id), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "processing")));
          }
          if (okCount && !failCount) ack = `✅ ${okCount} ta operatsiya qayd etildi`;
          else if (okCount) ack = `✅ ${okCount} ta qayd etildi, ⛔ ${failCount} ta xato`;
          else if (alreadyDone && !failCount) ack = "Bu so'rov avval qayta ishlangan";
          else ack = "⛔ Operatsiyalarni saqlab bo'lmadi";
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
          await callTelegram("editMessageReplyMarkup", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: [] },
          });
          await callTelegram("sendMessage", {
            chat_id: cq.message.chat.id,
            text: ack,
            reply_markup: { keyboard: MAIN_MENU, resize_keyboard: true, is_persistent: true },
          });
        }
        return NextResponse.json({ ok: true });
      }

      void writeSecurityEvent({ userId: user.id, event: "unknown_callback", requestId: sec.requestId, ipHash: sec.ipKey });
      await callTelegram("answerCallbackQuery", { callback_query_id: cq.id });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- MESSAGES ---------------- */
    const text = update.message?.text ?? "";
    if (text.length > 2_000) return NextResponse.json({ ok: true });
    const reply = await respondToBotMessage(user, text);

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
      const summary = [
        "Quyidagi operatsiyani topdim:",
        "",
        draft.type === "income" ? "➕ Kirim" : draft.type === "transfer" ? "↔️ Transfer" : "➖ Chiqim",
        `Summa: ${formatAmount(draft.amount ?? 0)}${
          draft.estimated && draft.minAmount && draft.maxAmount
            ? ` (${formatAmount(draft.minAmount)}–${formatAmount(draft.maxAmount)})`
            : ""
        }`,
        `Kategoriya: ${draft.categoryName ?? "aniqlanmadi"}`,
        `Sana: ${humanDate(draft.date)}`,
      ].join("\n");
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: summary,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: `draft:${saved.id}:confirm` },
              { text: "❌ Bekor qilish", callback_data: `draft:${saved.id}:cancel` },
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
      const summary = [
        `${drafts.length} ta operatsiya topildi:`,
        "",
        ...drafts.map(
          (d, i) =>
            `${i + 1}. ${d.type === "income" ? "➕" : d.type === "transfer" ? "↔️" : "➖"} ${formatAmount(d.amount ?? 0)} — ${
              d.categoryName ?? (d.type === "income" ? "Kirim" : d.type === "transfer" ? "Transfer" : "Chiqim")
            } · ${humanDate(d.date)}`,
        ),
        ...(reply.failedSegments?.length ? ["", `⚠️ Tushunilmadi: ${reply.failedSegments.slice(0, 3).join("; ")}`] : []),
      ].join("\n");
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
              { text: "✅ Barchasini tasdiqlash", callback_data: `batch:${batchId}:confirm` },
              { text: "❌ Bekor qilish", callback_data: `batch:${batchId}:cancel` },
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
          text: "Mini Appda to'liq dashboard, prognoz va tahlil mavjud.",
          reply_markup: { inline_keyboard: [[{ text: "📱 Mini Appni ochish", web_app: { url } }]] },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof SyntaxError ? "invalid_json" : "internal";
    // Release the update claim after an internal/database failure so Telegram
    // can retry it. Draft status transitions remain atomic and prevent a retry
    // from creating a second transaction.
    if (claimedUpdateId !== null) {
      await db.delete(telegramUpdates).where(eq(telegramUpdates.updateId, claimedUpdateId)).catch(() => undefined);
    }
    securityLog("error", "webhook_error", { requestId: sec.requestId, userId: resolvedUserId, ipKey: sec.ipKey, code });
    void writeSecurityEvent({
      userId: resolvedUserId,
      event: "telegram_webhook_error",
      severity: "warning",
      requestId: sec.requestId,
      ipHash: sec.ipKey,
      metadata: { code },
    });
    // A malformed update is poison and must not be retried forever. A claimed
    // update that hit a database/internal error is retriable and returns 500.
    // Telegram API delivery failures are logged by telegramApi.
    return NextResponse.json({ ok: claimedUpdateId === null }, { status: claimedUpdateId === null ? 200 : 500 });
  }
}
