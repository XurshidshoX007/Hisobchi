/**
 * Local preview orchestrator — boots an embedded Postgres (PGlite) and then the
 * Next.js dev server, with migrations applied in between. No Docker or system
 * Postgres required; intended for development and review environments only.
 *
 * Usage:  node scripts/preview.mjs
 *
 * The PGlite packages are installed on demand (kept out of package.json so the
 * production dependency tree stays untouched). The database is persisted under
 * ~/.hisobchi-pglite so a re-run reuses seeded demo data.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const pgPort = Number(process.env.HISOBCHI_PG_PORT ?? 5432);
const pgHost = "127.0.0.1";
const appPort = Number(process.env.PORT ?? 3000);
const dbDir = process.env.HISOBCHI_PG_DIR ?? path.join(os.homedir(), ".hisobchi-pglite");
const databaseUrl = `postgresql://postgres:postgres@${pgHost}:${pgPort}/hisobchi`;

mkdirSync(dbDir, { recursive: true });

function run(cmd, args, env = process.env, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function portOpen(port, host, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const socket = net.connect({ port, host });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

async function ensurePglite() {
  const bin = path.join(repoRoot, "node_modules", ".bin", "pglite-server");
  if (existsSync(bin)) return;
  console.log("[preview] Installing embedded Postgres (PGlite) …");
  await run("npm", ["install", "--no-save", "--legacy-peer-deps", "@electric-sql/pglite@0.5.5", "@electric-sql/pglite-socket@0.2.8"]);
}

async function main() {
  await ensurePglite();

  const db = spawn(
    path.join(repoRoot, "node_modules", ".bin", "pglite-server"),
    ["--db", dbDir, "--port", String(pgPort), "--host", pgHost, "-m", "4"],
    { stdio: "inherit" },
  );
  let dbExited = false;
  db.on("exit", () => {
    dbExited = true;
  });

  console.log(`[preview] Waiting for embedded Postgres on ${pgHost}:${pgPort} …`);
  await portOpen(pgPort, pgHost);
  if (dbExited) throw new Error("Embedded Postgres exited before becoming ready");

  const appEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DB_POOL_MAX: "1",
    PORT: String(appPort),
  };

  console.log("[preview] Applying migrations …");
  await run("node", ["scripts/migrate.mjs"], appEnv);

  console.log(`[preview] Starting Next.js dev server on http://0.0.0.0:${appPort} …`);
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "0.0.0.0", "-p", String(appPort)], {
    cwd: repoRoot,
    env: appEnv,
    stdio: "inherit",
  });

  const shutdown = () => {
    try {
      app.kill("SIGTERM");
    } catch {
      /* noop */
    }
    try {
      db.kill("SIGTERM");
    } catch {
      /* noop */
    }
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise((resolve) => app.on("exit", resolve));
  shutdown();
}

main().catch((error) => {
  console.error("[preview] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
