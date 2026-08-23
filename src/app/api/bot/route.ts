import { NextResponse } from "next/server";
import { respondToBotMessage } from "@/lib/bot";
import { resolveUser, verifyInitData } from "@/lib/user";
import { writeSecurityEvent } from "@/lib/audit";
import { isProduction } from "@/lib/env";
import { PayloadTooLargeError, readJsonBody } from "@/lib/request-body";
import {
  checkRateLimit,
  isAllowedMutationOrigin,
  originRejected,
  rateLimitResponse,
  securityContext,
  withSecurityHeaders,
} from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sec = securityContext(request);
  // This route is a local-development simulator, not the Telegram transport.
  // Production updates enter exclusively through /api/telegram/webhook.
  if (isProduction()) {
    return withSecurityHeaders(NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 }), sec.requestId);
  }
  try {
    if (!isAllowedMutationOrigin(request)) return originRejected(sec.requestId);
    const limit = await checkRateLimit({ scope: "bot-console", identity: sec.ipKey, limit: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      void writeSecurityEvent({ event: "rate_limit_bot_console", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(limit.retryAfter, sec.requestId);
    }

    let body: {
      message?: string;
      confirm?: Record<string, unknown> | null;
      init_data?: string | null;
    };
    try {
      body = await readJsonBody(request, 64 * 1024);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return withSecurityHeaders(
          NextResponse.json({ text: "Request juda katta.", keyboard: [], code: "payload_too_large" }, { status: 413 }),
          sec.requestId,
        );
      }
      if (error instanceof SyntaxError || error instanceof TypeError) {
        return withSecurityHeaders(
          NextResponse.json({ text: "Request formati noto'g'ri.", keyboard: [], code: "invalid_json" }, { status: 400 }),
          sec.requestId,
        );
      }
      throw error;
    }
    if (typeof body.message === "string" && body.message.length > 4_096) {
      return withSecurityHeaders(
        NextResponse.json({ text: "Xabar juda uzun.", keyboard: [], code: "invalid_input" }, { status: 400 }),
        sec.requestId,
      );
    }
    const initData = request.headers.get("x-telegram-init-data") ?? body.init_data ?? null;
    const identity = await verifyInitData(initData);
    const user = await resolveUser(identity ?? undefined);
    if (!user) {
      void writeSecurityEvent({ event: "auth_rejected_bot_console", requestId: sec.requestId, ipHash: sec.ipKey });
      return withSecurityHeaders(
        NextResponse.json(
          { text: "Kirish talab qilinadi. Telegram orqali qayta kiring.", keyboard: [], code: "unauthorized" },
          { status: 401 },
        ),
        sec.requestId,
      );
    }
    const reply = await respondToBotMessage(user, body.message ?? "", body.confirm ?? null);
    return withSecurityHeaders(NextResponse.json(reply), sec.requestId);
  } catch {
    return withSecurityHeaders(
      NextResponse.json(
        { text: "Botda xatolik yuz berdi. Keyinroq urinib ko'ring.", keyboard: [], code: "internal" },
        { status: 500 },
      ),
      sec.requestId,
    );
  }
}
