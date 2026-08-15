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
  try {
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
    client.release();
  }
} catch (error) {
  console.error("Database migration failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await pool.end();
}