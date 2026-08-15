import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { inspectEnv } from "@/lib/env";
import { redisHealth } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const [env, redis] = await Promise.all([Promise.resolve(inspectEnv()), redisHealth()]);
    const dependencyOk = redis !== "error";
    const status = env.ok && dependencyOk ? "ok" : "warning";
    return NextResponse.json(
      {
        status,
        service: "personal-financial-os",
        database: "connected",
        redis,
        mode: env.mode,
        demo: env.demo,
        verifiedAuthRequired: env.verifiedAuthRequired,
        bot: env.hasBotToken ? "configured" : "unset",
        warnings: env.warnings,
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
