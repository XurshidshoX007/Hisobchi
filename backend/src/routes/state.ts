import { buildAppState } from "@/lib/state";
import { resolveUser, verifyInitData } from "@/lib/user";
import { writeSecurityEvent } from "@/lib/audit";
import {
  checkRateLimit,
  rateLimitResponse,
  securityContext,
  securityLog,
  withSecurityHeaders,
} from "@/lib/security";

export async function GET(request: Request) {
  const sec = securityContext(request);
  try {
    const ipLimit = await checkRateLimit({ scope: "state-ip", identity: sec.ipKey, limit: 120, windowMs: 60_000 });
    if (!ipLimit.allowed) {
      void writeSecurityEvent({ event: "rate_limit_state", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(ipLimit.retryAfter, sec.requestId);
    }

    // initData is a short-lived bearer credential. Accept it only in a header;
    // query strings are commonly retained in proxy access logs and browser
    // history, which would turn a diagnostic URL into an authentication leak.
    const initData = request.headers.get("x-telegram-init-data");
    const identity = await verifyInitData(initData);
    const user = await resolveUser(identity ?? undefined);
    if (!user) {
      securityLog("warn", "auth_rejected", { requestId: sec.requestId, ipKey: sec.ipKey, code: "unauthorized" });
      void writeSecurityEvent({ event: "auth_rejected", requestId: sec.requestId, ipHash: sec.ipKey });
      return withSecurityHeaders(
        Response.json({ error: "Autentifikatsiya talab qilinadi", code: "unauthorized" }, { status: 401 }),
        sec.requestId,
      );
    }

    const userLimit = await checkRateLimit({ scope: "state-user", identity: String(user.id), limit: 120, windowMs: 60_000 });
    if (!userLimit.allowed) {
      void writeSecurityEvent({ userId: user.id, event: "rate_limit_state_user", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(userLimit.retryAfter, sec.requestId);
    }

    const state = await buildAppState(user);
    return withSecurityHeaders(Response.json(state), sec.requestId);
  } catch (error) {
    securityLog("error", "state_error", { requestId: sec.requestId, ipKey: sec.ipKey, code: "internal" });
    return withSecurityHeaders(
      Response.json({ error: "Ma'lumotlarni yuklashda xatolik", code: "internal" }, { status: 500 }),
      sec.requestId,
    );
  }
}
