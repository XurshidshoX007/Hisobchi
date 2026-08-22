import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Liveness probe — intentionally MINIMAL.
 *
 * Railway's healthcheck and the Docker HEALTHCHECK poll this path every ~30s.
 * The deep diagnostic endpoint (/api/health) calls the Telegram Bot API twice
 * (getMe + getWebhookInfo) on every request; under a 5s probe timeout a slow
 * Telegram response would mark a perfectly healthy container as failing and
 * trigger restarts — which looks exactly like "the app keeps going to sleep".
 *
 * Liveness therefore answers one question only: can this process serve
 * requests and reach its database? Everything else (Redis, Telegram webhook
 * state, env warnings) belongs to /api/health, which is for humans and
 * dashboards, not for restart decisions.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: "ok", time: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
