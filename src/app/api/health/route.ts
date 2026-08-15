import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { inspectEnv } from "@/lib/env";
import { redisHealth } from "@/lib/redis";
import { telegramHealth } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const [env, redis, telegram] = await Promise.all([Promise.resolve(inspectEnv()), redisHealth(), telegramHealth()]);
    const dependencyOk = redis !== "error";
    const botOk = telegram.status === "connected" || (env.mode === "development" && telegram.status === "unset");
    const status = env.ok && dependencyOk && botOk && !telegram.hasLastWebhookError ? "ok" : "warning";
    const warnings = [...env.warnings];
    if (telegram.status === "misconfigured") warnings.push("Telegram webhook URL does not match NEXT_PUBLIC_APP_URL");
    if (telegram.status === "error") warnings.push("Telegram Bot API is unreachable or BOT_TOKEN is invalid");
    if (telegram.hasLastWebhookError) warnings.push("Telegram reports a recent webhook delivery error");
    return NextResponse.json(
      {
        status,
        service: "personal-financial-os",
        database: "connected",
        redis,
        mode: env.mode,
        demo: env.demo,
        verifiedAuthRequired: env.verifiedAuthRequired,
        bot: telegram.status,
        botUsername: telegram.username,
        webhookUrlMatches: telegram.webhookUrlMatches,
        pendingTelegramUpdates: telegram.pendingUpdates,
        warnings,
        time: new Date().toISOString(),
      },
      {
        status: dependencyOk ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "error", redis: "unknown" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
