import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationsFolder = "./drizzle";
const journalTable = "__drizzle_migrations";
// A fixed, application-specific PostgreSQL advisory-lock key. This serializes
// migrations when Railway briefly overlaps deployments/restarts.
const migrationLockKey = 4_889_042_171;

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
  ssl:
    process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined,
});

function readMigrations() {
  const journalPath = path.join(migrationsFolder, "meta/_journal.json");
  if (!fs.existsSync(journalPath)) {
    throw new Error("Can't find drizzle/meta/_journal.json");
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return journal.entries.map((entry) => {
    const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing migration file ${filePath}`);
    }
    const query = fs.readFileSync(filePath, "utf8");
    return {
      hash: crypto.createHash("sha256").update(query).digest("hex"),
      folderMillis: entry.when,
      statements: query
        .split("--> statement-breakpoint")
        .map((part) => part.trim())
        .filter(Boolean),
    };
  });
}

try {
  const client = await pool.connect();
  let hasMigrationLock = false;
  try {
    // Avoid two deployments applying the same DDL at the same time. The lock
    // belongs to this connection and is always released in finally below.
    await client.query("SET lock_timeout = '60s'");
    await client.query("SET statement_timeout = '120s'");
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockKey]);
    hasMigrationLock = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.${journalTable} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const applied = await client.query(
      `SELECT hash, created_at FROM public.${journalTable} ORDER BY created_at ASC`,
    );
    const appliedHashes = new Set(applied.rows.map((row) => row.hash));
    const migrations = readMigrations();

    for (const migration of migrations) {
      if (appliedHashes.has(migration.hash)) continue;
      await client.query("BEGIN");
      try {
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO public.${journalTable} (hash, created_at) VALUES ($1, $2)`,
          [migration.hash, migration.folderMillis],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("Database migrations applied");
  } finally {
    if (hasMigrationLock) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [migrationLockKey]);
      } catch {
        // The connection release below also releases session advisory locks.
      }
    }
    client.release();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  const code = typeof error === "object" && error && "code" in error ? ` (code: ${String(error.code)})` : "";
  console.error(`Database migration failed${code}: ${message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}