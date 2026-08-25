/**
 * Hisobchi backend kirish nuqtasi.
 *
 * Ishga tushirish: `tsx src/index.ts` (yoki `npm run dev` — watch rejimi).
 * Port: `PORT` muhit o'zgaruvchisi (default 4000).
 */

import "dotenv/config";
import { buildApp } from "./app";
import { pool } from "@/db";
import { closeRedis } from "@/lib/redis";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();

async function shutdown(signal: string) {
  console.info(JSON.stringify({ ts: new Date().toISOString(), event: "shutdown", signal }));
  try {
    await app.close();
    await closeRedis();
    await pool.end();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port, host });
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "server_started",
      host,
      port,
      mode: process.env.NODE_ENV ?? "development",
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "server_start_failed" }), error);
  process.exit(1);
}
