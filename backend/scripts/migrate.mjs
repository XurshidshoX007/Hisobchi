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
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("drizzle migration journal has no entries");
  }
  let previousWhen = -1;
  const seenTags = new Set();
  return journal.entries.map((entry) => {
    if (!entry || typeof entry.tag !== "string" || !/^\d{4}_[a-zA-Z0-9_]+$/.test(entry.tag)) {
      throw new Error("Invalid migration tag in drizzle journal");
    }
    if (!Number.isSafeInteger(entry.when) || entry.when <= previousWhen) {
      throw new Error(`Migration ${entry.tag} has an invalid/non-increasing timestamp`);
    }
    if (seenTags.has(entry.tag)) throw new Error(`Duplicate migration tag ${entry.tag}`);
    seenTags.add(entry.tag);
    previousWhen = entry.when;
    const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing migration file ${filePath}`);
    }
    const query = fs.readFileSync(filePath, "utf8");
    return {
      tag: entry.tag,
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
    const appliedByTimestamp = new Map(
      applied.rows
        .filter((row) => row.created_at !== null && row.created_at !== undefined)
        .map((row) => [String(row.created_at), row.hash]),
    );
    const migrations = readMigrations();

    for (let index = 0; index < migrations.length; index += 1) {
      const migration = migrations[index];
      if (appliedHashes.has(migration.hash)) continue;

      // An immutable migration keeps the same timestamp and hash forever. If
      // the timestamp is present with another hash, re-running the edited SQL
      // is unsafe (baseline DDL is not idempotent), so fail closed.
      const priorHash = appliedByTimestamp.get(String(migration.folderMillis));
      if (priorHash && priorHash !== migration.hash) {
        throw new Error(`Migration drift detected for ${migration.tag}; applied SQL hash differs`);
      }

      // Never fill a historical gap after a later migration is already active;
      // ordering assumptions may no longer hold. Require an explicit reviewed
      // repair instead of applying DDL out of order.
      const laterApplied = migrations
        .slice(index + 1)
        .some((candidate) => appliedHashes.has(candidate.hash));
      if (laterApplied) {
        throw new Error(`Migration ordering gap detected before ${migration.tag}`);
      }

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
        appliedHashes.add(migration.hash);
        appliedByTimestamp.set(String(migration.folderMillis), migration.hash);
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