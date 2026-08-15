import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pendingDrafts, telegramUpdates } from "@/db/schema";
import { respondToBotMessage, MAIN_MENU } from "@/lib/bot";
import { resolveUser } from "@/lib/user";
import { runMutation } from "@/lib/mutations";
import { appUrl, demoModeEnabled, isProduction, telegramBotToken, telegramWebhookSecret } from "@/lib/env";
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

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const token = telegramBotToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const sec = securityContext(request);
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

      const draftMatch = data.match(/^draft:(\d+):(confirm|cancel)$/);
      if (draftMatch) {
        const draftId = Number(draftMatch[1]);
        const action = draftMatch[2] as "confirm" | "cancel";
        const draftRow = await db
          .select()
          .from(pendingDrafts)
          .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id)))
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
          await db
            .update(pendingDrafts)
            .set({ status: "cancelled", resolvedAt: new Date() })
            .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")));
          ack = "Bekor qilindi";
          await writeAudit({
            userId: user.id,
            actorRole: user.role,
            action: "cancel_draft",
            entity: "transaction",
            outcome: "success",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { draftId },
          });
        }

        await callTelegram("answerCallbackQuery", { callback_query_id: cq.id, text: ack });
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

    if (reply.draft) {
      const [saved] = await db
        .insert(pendingDrafts)
        .values({
          userId: user.id,
          chatId,
          kind: "transaction",
          payload: reply.draft,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .returning();
      const summary = [
        "Quyidagi operatsiyani topdim:",
        "",
        reply.draft.type === "income" ? "➕ Kirim" : reply.draft.type === "transfer" ? "↔️ Transfer" : "➖ Chiqim",
        `Summa: ${formatAmount(reply.draft.amount ?? 0)}${
          reply.draft.estimated && reply.draft.minAmount && reply.draft.maxAmount
            ? ` (${formatAmount(reply.draft.minAmount)}–${formatAmount(reply.draft.maxAmount)})`
            : ""
        }`,
        `Kategoriya: ${reply.draft.categoryName ?? "aniqlanmadi"}`,
        `Sana: ${humanDate(reply.draft.date)}`,
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

    // No parse_mode: user-controlled category/name text is always plain text,
    // eliminating Telegram HTML injection.
    await callTelegram("sendMessage", {
      chat_id: chatId,
      text: reply.text,
      reply_markup: { keyboard: reply.keyboard, resize_keyboard: true, is_persistent: true },
    });

    if (text.startsWith("/start")) {
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
  } catch {
    securityLog("error", "webhook_error", { requestId: sec.requestId, ipKey: sec.ipKey, code: "internal" });
    // Return 200 so Telegram doesn't retry poison messages forever.
    return NextResponse.json({ ok: true });
  }
}
