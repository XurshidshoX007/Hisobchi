import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { buildAppState } from "@/lib/state";
import { getRedis } from "@/lib/redis";
import { telegramApi } from "@/lib/telegram";
import { securityContext, securityLog } from "@/lib/security";

export const dynamic = "force-dynamic";

function validBearer(request: Request): boolean {
  const expected = process.env.NOTIFICATION_CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const sec = securityContext(request);
  if (!validBearer(request)) {
    securityLog("warn", "notification_dispatch_rejected", { requestId: sec.requestId, ipKey: sec.ipKey, code: "unauthorized" });
    return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  }

  const redis = await getRedis();
  if (!redis) {
    securityLog("error", "notification_dispatch_redis_unavailable", { requestId: sec.requestId, code: "redis" });
    return NextResponse.json({ ok: false, code: "redis_unavailable" }, { status: 503 });
  }

  try {
    const recipients = await db
      .select()
      .from(users)
      .where(eq(users.isBlocked, false))
      .limit(1_000);
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of recipients) {
      if (!user.telegramId || user.isDemo) continue;
      const state = await buildAppState(user);
      const alerts = state.alerts.filter((alert) => {
        if (alert.type === "payment") return user.notifyPayments;
        if (alert.type === "income") return user.notifyIncome;
        if (alert.type === "budget") return user.notifyBudget;
        if (alert.type === "risk") return user.notifyRisk;
        return false;
      });
      if (!alerts.length) continue;

      const fingerprint = alerts.map((alert) => alert.id).sort().join(",");
      const day = new Date().toISOString().slice(0, 10);
      const key = `pfos:telegram-notify:${user.id}:${day}:${fingerprint}`;
      const claimed = await redis.set(key, "pending", { NX: true, EX: 48 * 60 * 60 });
      if (claimed !== "OK") {
        skipped += 1;
        continue;
      }

      const lines = alerts.slice(0, 5).flatMap((alert) => [
        `${alert.severity === "critical" ? "🚨" : alert.severity === "warning" ? "⚠️" : "🔔"} ${alert.title}`,
        alert.body,
        "",
      ]);
      const result = await telegramApi(
        "sendMessage",
        {
          chat_id: user.telegramId,
          text: ["Hisobchi eslatmalari", "", ...lines].join("\n").trim(),
        },
        { requestId: sec.requestId, userId: user.id },
      );
      if (result.ok) {
        await redis.set(key, "sent", { EX: 48 * 60 * 60 });
        sent += 1;
      } else {
        await redis.del(key);
        failed += 1;
      }
    }

    securityLog("info", "notification_dispatch_completed", { requestId: sec.requestId, code: `sent:${sent}:failed:${failed}` });
    return NextResponse.json({ ok: failed === 0, sent, skipped, failed, requestId: sec.requestId }, { status: failed ? 207 : 200 });
  } catch {
    securityLog("error", "notification_dispatch_error", { requestId: sec.requestId, code: "internal" });
    return NextResponse.json({ ok: false, code: "internal", requestId: sec.requestId }, { status: 500 });
  }
}
