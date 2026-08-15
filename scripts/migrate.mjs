import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// A separate migration role can be supplied for least-privilege production
// deployments. Railway preDeploy uses this value; runtime uses DATABASE_URL.
const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("MIGRATION_DATABASE_URL or DATABASE_URL is required");
  process.exit(1);
}

const migrationsFolder = path.resolve("./drizzle");
const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
const migrationsTable = "__drizzle_migrations";

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

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function readMigrations() {
  if (!fs.existsSync(journalPath)) throw new Error("Can't find drizzle/meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (!Array.isArray(journal.entries)) throw new Error("Invalid Drizzle migration journal");

  return journal.entries.map((entry) => {
    if (!/^\d{4}_[a-z0-9_]+$/i.test(entry.tag) || !Number.isSafeInteger(entry.when)) {
      throw new Error("Invalid Drizzle migration metadata");
    }
    const migrationPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    if (!fs.existsSync(migrationPath)) throw new Error(`Missing migration file: ${entry.tag}.sql`);
    const source = fs.readFileSync(migrationPath, "utf8");
    return {
      when: entry.when,
      hash: crypto.createHash("sha256").update(source).digest("hex"),
      statements: source.split("--> statement-breakpoint").filter((statement) => statement.trim().length > 0),
    };
  });
}

async function migrationJournalSchema(client) {
  // Legacy deployments may already have Drizzle's historical journal. Reuse it
  // without trying CREATE SCHEMA, which would require database-level CREATE.
  const legacy = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS relation");
  if (legacy.rows[0]?.relation) return "drizzle";

  // Railway managed PostgreSQL always provides `public`. It only needs
  // schema-level USAGE + CREATE (not CREATE DATABASE / CREATE SCHEMA).
  return "public";
}

try {
  const client = await pool.connect();
  try {
    const schema = await migrationJournalSchema(client);
    const journalTable = `${quoteIdentifier(schema)}.${quoteIdentifier(migrationsTable)}`;
    const existing = await client.query("SELECT to_regclass($1) AS relation", [`${schema}.${migrationsTable}`]);

    // New Railway installation: CREATE TABLE in existing public schema only.
    // No CREATE SCHEMA statement is ever emitted.
    if (!existing.rows[0]?.relation) {
      await client.query(`
        CREATE TABLE ${journalTable} (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint NOT NULL
        )
      `);
    }

    const applied = await client.query(
      `SELECT hash, created_at FROM ${journalTable} ORDER BY created_at DESC LIMIT 1`,
    );
    const lastAppliedAt = applied.rows[0] ? Number(applied.rows[0].created_at) : -1;
    const migrations = readMigrations();

    await client.query("BEGIN");
    try {
      for (const migration of migrations) {
        if (migration.when <= lastAppliedAt) continue;
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO ${journalTable} (hash, created_at) VALUES ($1, $2)`,
          [migration.hash, migration.when],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log(`Database migrations applied (journal schema: ${schema})`);
  } finally {
    client.release();
  }
} catch (error) {
  // Never include DATABASE_URL or database credentials in deploy logs.
  console.error("Database migration failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await pool.end();
}
