/**
 * Fastify ilova fabrikasi.
 *
 * Next.js monolitidagi xavfsizlik qatlamlarining to'liq ekvivalenti:
 *
 *  1. `src/proxy.ts` (Next middleware) → bu yerdagi fail-closed marshrut:
 *     - `/api/admin/*` namespace'i 404 bilan bloklanadi.
 *  2. `next.config.ts` sarlavhalari → `onSend` hook:
 *     - X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS.
 *     - CSP endi frontend nginx'da (API javoblari hujjat emas, CSP qo'llanmaydi).
 *  3. CORS — frontend va backend turli servicelarda ishlagani uchun
 *     allowlist bilan (APP_URL + FRONTEND_ORIGINS); same-origin (nginx/vite
 *     proksi orqali) so'rovlar hamisha ruxsat etiladi.
 *
 * CORS'ga qo'shimcha ravishda `isAllowedMutationOrigin` (security.ts)
 * mutatsiyalar uchun server-tomon origin tekshiruvini saqlab turadi.
 */

import Fastify, { type FastifyInstance } from "fastify";
import { registerRawBodyParser } from "@/web-handler";
import { registerRoutes } from "@/routes";
import { appUrl } from "@/lib/env";

const isProd = process.env.NODE_ENV === "production";

/** Foydalanuvchi kiritishi mumkin bo'lgan qo'shimcha frontend originlar. */
function frontendOrigins(): string[] {
  const origins: string[] = [];
  const push = (value: string | undefined | null) => {
    if (!value) return;
    try {
      origins.push(new URL(value).origin);
    } catch {
      // noto'g'ri URL — jimgina e'tiborsiz qoldiriladi
    }
  };
  push(appUrl());
  for (const item of (process.env.FRONTEND_ORIGINS ?? "").split(",")) push(item.trim());
  return [...new Set(origins)];
}

const CORS_ALLOW_HEADERS = "Content-Type, x-telegram-init-data, idempotency-key, x-request-id";

function registerCors(app: FastifyInstance): void {
  const allowed = new Set(frontendOrigins());
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (typeof origin !== "string" || origin === "") return; // webhook / native server chaqiruvlari
    const host = req.headers.host;
    const sameOrigin =
      typeof host === "string" && (origin === `http://${host}` || origin === `https://${host}`);
    const ok = sameOrigin || allowed.has(origin);

    if (req.method === "OPTIONS") {
      if (!ok) {
        reply.header("Vary", "Origin");
        return await reply.status(403).send();
      }
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      reply.header("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
      reply.header("Access-Control-Expose-Headers", "X-Request-Id, Retry-After");
      reply.header("Access-Control-Max-Age", "600");
      reply.header("Vary", "Origin");
      return await reply.status(204).send();
    }

    reply.header("Vary", "Origin");
    if (ok) reply.header("Access-Control-Allow-Origin", origin);
    // Ruxsatsiz origin: ACAO chiqmaydi — brauzer javobni o'zi bloklaydi;
    // POSTlar uchun server-tomon isAllowedMutationOrigin ham ishlaydi.
  });
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 12 * 1024 * 1024,
    trustProxy: true,
  });

  // Barcha content-type'lar xom buffer sifatida — marshrutlar o'z
  // byte-budget validatsiyasini (readJsonBody) bajaradi.
  registerRawBodyParser(app);

  // --- 1. Admin namespace fail-closed (eski src/proxy.ts mantiqi) ---
  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    url: "/api/admin/*",
    handler: async (_req, reply) => {
      reply.status(404);
      reply.header("Cache-Control", "no-store");
      reply.send({ error: "Not found", code: "not_found" });
    },
  });

  // --- 2. CORS allowlist ---
  registerCors(app);

  // --- 3. Xavfsizlik sarlavhalari (eski next.config.ts mantiqi) ---
  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-DNS-Prefetch-Control", "off");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    );
    if (isProd) {
      reply.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    }
  });

  // --- 4. API marshrutlari ---
  registerRoutes(app);

  return app;
}
