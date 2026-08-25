/**
 * API marshrutlari registri — Next.js `src/app/api/*` tuzilmasining aynan
 * o'zi, faqat Fastify orqali ro'yxatdan o'tkaziladi.
 */

import type { FastifyInstance } from "fastify";
import { toFastify } from "@/web-handler";
import * as state from "./state";
import * as mutate from "./mutate";
import * as bot from "./bot";
import * as health from "./health";
import * as healthLive from "./health-live";
import * as telegramWebhook from "./telegram-webhook";
import * as telegramNotifications from "./telegram-notifications";

export function registerRoutes(app: FastifyInstance): void {
  app.get("/api/state", { logLevel: "warn" }, toFastify(state.GET));
  app.post("/api/mutate", { logLevel: "warn" }, toFastify(mutate.POST));
  app.post("/api/bot", { logLevel: "warn" }, toFastify(bot.POST));
  app.get("/api/health", toFastify(health.GET));
  app.get("/api/health/live", toFastify(healthLive.GET));
  app.post("/api/telegram/webhook", { logLevel: "warn" }, toFastify(telegramWebhook.POST));
  app.post("/api/telegram/notifications", { logLevel: "warn" }, toFastify(telegramNotifications.POST));
}
