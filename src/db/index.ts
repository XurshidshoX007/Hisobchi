import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

const configuredMax = Number(process.env.DB_POOL_MAX ?? 10);
const max = Number.isInteger(configuredMax) && configuredMax > 0 && configuredMax <= 50 ? configuredMax : 10;
const ssl =
  process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require"
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max,
    ssl,
    application_name: "personal-financial-os",
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 20_000,
    query_timeout: 25_000,
    allowExitOnIdle: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
