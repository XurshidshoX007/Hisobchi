import { NextResponse } from "next/server";
import { respondToBotMessage } from "@/lib/bot";
import { resolveUser, verifyInitData } from "@/lib/user";
import { writeSecurityEvent } from "@/lib/audit";
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
  try {
    if (!isAllowedMutationOrigin(request)) return originRejected(sec.requestId);
    const limit = await checkRateLimit({ scope: "bot-console", identity: sec.ipKey, limit: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      void writeSecurityEvent({ event: "rate_limit_bot_console", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(limit.retryAfter, sec.requestId);
    }

    const body = (await request.json()) as {
      message?: string;
      confirm?: Record<string, unknown> | null;
      init_data?: string | null;
    };
    if (typeof body.message === "string" && body.message.length > 2_000) {
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
