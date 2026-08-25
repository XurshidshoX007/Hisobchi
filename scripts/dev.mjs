#!/usr/bin/env node
/**
 * Monorepo dev rejimi: backend (Fastify, :4000) va frontend (Vite, :5173)
 * ni bir vaqtda ishga tushiradi. Vite `/api` ni backendga proksi qiladi.
 *
 * Foydalanish:  npm run dev
 * To'xtatish:   Ctrl+C
 */

import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

const procs = [];

function run(name, args, color) {
  const prefix = `${color}[${name}]\x1b[0m`;
  const child = spawn(npm, args, {
    cwd: new URL(`../${name === "backend" ? "backend" : "frontend"}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  const pipe = (stream, isError) => {
    stream.setEncoding("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const out = isError ? process.stderr : process.stdout;
        out.write(`${prefix} ${line}\n`);
      }
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);
  child.on("exit", (code) => {
    process.stdout.write(`${prefix} chiqdi (kod ${code})\n`);
  });
  procs.push(child);
}

console.log("\nHisobchi dev — backend :4000, frontend :5173 (/api proksi)\n");

run("backend", ["run", "dev"], "\x1b[36m");
run("frontend", ["run", "dev"], "\x1b[35m");

function shutdown() {
  for (const child of procs) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* noop */
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
