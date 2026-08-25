import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Lightweight startup/readiness probe (kept at /health/live for compatibility).
 *
 * Railway calls the configured HTTP healthcheck while activating a new
 * deployment; the Docker image also declares this endpoint as its health
 * signal. It performs no outbound Telegram/Redis work, but it intentionally
 * checks PostgreSQL so a new release is not routed traffic before its source of
 * truth is reachable.
 *
 * This is not proof of continuous production health. Railway's HTTP deployment
 * healthcheck is not a continuous monitor, and a Docker HEALTHCHECK by itself
 * does not establish why a process restarted. Use external uptime/metrics and
 * deployment/runtime events for incident correlation.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { status: "ok", time: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
