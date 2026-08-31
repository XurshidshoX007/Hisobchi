import { NextResponse } from "next/server";
import { writeSecurityEvent } from "@/lib/audit";
import { buildFinanceXlsx } from "@/lib/xlsx-export";
import { buildAppState } from "@/lib/state";
import { resolveUser, verifyInitData } from "@/lib/user";
import {
  checkRateLimit,
  rateLimitResponse,
  securityContext,
  securityLog,
  withSecurityHeaders,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Exports only the authenticated user's ledger projection. The endpoint never
 * parses uploads and no financial data enters a URL or a third-party service. */
export async function GET(request: Request) {
  const sec = securityContext(request);
  try {
    const ipLimit = await checkRateLimit({ scope: "xlsx-export-ip", identity: sec.ipKey, limit: 15, windowMs: 60 * 60 * 1000 });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfter, sec.requestId);

    const identity = await verifyInitData(request.headers.get("x-telegram-init-data"));
    const user = await resolveUser(identity ?? undefined);
    if (!user) {
      void writeSecurityEvent({ event: "auth_rejected_export", requestId: sec.requestId, ipHash: sec.ipKey });
      return withSecurityHeaders(NextResponse.json({ error: "Autentifikatsiya talab qilinadi", code: "unauthorized" }, { status: 401 }), sec.requestId);
    }

    const userLimit = await checkRateLimit({ scope: "xlsx-export-user", identity: String(user.id), limit: 8, windowMs: 60 * 60 * 1000 });
    if (!userLimit.allowed) {
      void writeSecurityEvent({ userId: user.id, event: "rate_limit_export", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(userLimit.retryAfter, sec.requestId);
    }

    const workbook = buildFinanceXlsx(await buildAppState(user));
    const response = new NextResponse(new Uint8Array(workbook.body), {
      headers: {
        "Content-Type": workbook.contentType,
        "Content-Disposition": `attachment; filename="${workbook.filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
    return withSecurityHeaders(response, sec.requestId);
  } catch {
    securityLog("error", "xlsx_export_error", { requestId: sec.requestId, ipKey: sec.ipKey, code: "internal" });
    return withSecurityHeaders(NextResponse.json({ error: "Excel faylini tayyorlab bo‘lmadi", code: "internal" }, { status: 500 }), sec.requestId);
  }
}
