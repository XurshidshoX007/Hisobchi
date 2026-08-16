/**
 * Environment gates for production behaviour.
 *
 * The demo user + seeded world are meant for local development and preview
 * environments only. Production deploys must never bootstrap a shared demo
 * identity or accept unverified Telegram init-data.
 */

import { visionProviderInfo } from "./image/provider";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function telegramBotToken(): string | null {
  return process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export function telegramWebhookSecret(): string | null {
  const primary = process.env.WEBHOOK_SECRET;
  const legacy = process.env.TELEGRAM_WEBHOOK_SECRET;
  // If both aliases are present they must describe the same Telegram secret.
  // Returning null fail-closes the webhook rather than silently provisioning
  // Telegram with one secret while the endpoint validates another.
  if (primary && legacy && primary !== legacy) return null;
  return primary ?? legacy ?? null;
}

export function telegramWebhookSecretsMatch(): boolean {
  const primary = process.env.WEBHOOK_SECRET;
  const legacy = process.env.TELEGRAM_WEBHOOK_SECRET;
  return !(primary && legacy && primary !== legacy);
}

/** Public URL of the Mini App (used for BotFather / inline keyboard buttons). */
export function appUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL ?? null;
}

/**
 * Demo mode: pre-seeded Sardor user + free access without Telegram signature.
 * Automatically OFF in production even if the flag is missing, unless the
 * operator explicitly opts-in via `ALLOW_DEMO_IN_PRODUCTION=true`.
 */
export function demoModeEnabled(): boolean {
  if (isProduction()) return process.env.ALLOW_DEMO_IN_PRODUCTION === "true";
  return process.env.DISABLE_DEMO !== "true";
}

/** Auth strictness: reject unverified requests when a bot token is set. */
export function requireVerifiedIdentity(): boolean {
  // Production is fail-closed: if demo is OFF, authentication is mandatory
  // even when the token is accidentally missing (which means every auth
  // attempt is rejected instead of accepting a forged identity).
  if (isProduction()) return !demoModeEnabled();
  // Development can explicitly disable demo to test strict auth.
  return Boolean(telegramBotToken()) && !demoModeEnabled();
}

/** Init-data expiration window (seconds). Telegram recommends <= 24h. */
export const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * Feature flag for Telegram image / document finance intelligence (§39).
 *
 * Default OFF. Roll out per Telegram user id first
 * (`IMAGE_INTELLIGENCE_TEST_USERS=11111,22222`), flip
 * `IMAGE_INTELLIGENCE_ENABLED=true` only after QA.
 */
export function imageIntelligenceEnabled(telegramId?: number | null): boolean {
  if (process.env.IMAGE_INTELLIGENCE_ENABLED === "true") return true;
  if (!telegramId) return false;
  return imageIntelligenceTestUsers().includes(telegramId);
}

export function imageIntelligenceTestUsers(): number[] {
  return (process.env.IMAGE_INTELLIGENCE_TEST_USERS ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

/** True when a vision provider is actually configured. */
export function visionProviderConfigured(): boolean {
  return Boolean(process.env.VISION_API_KEY ?? process.env.OPENAI_API_KEY);
}

/**
 * Non-secret health signal for image intelligence (§13).
 *
 * Reports whether the feature is reachable and by whom, plus the provider and
 * model NAMES. It never returns the API key, and never a full endpoint URL
 * that could carry a token in a query string.
 */
export type ImageIntelligenceStatus = {
  /** Flag state for everyone. Test users can still be enabled while false. */
  enabled: boolean;
  /** Number of Telegram ids allowlisted while the global flag is off. */
  testUserCount: number;
  providerConfigured: boolean;
  providerName: string | null;
  model: string | null;
  endpointHost: string | null;
  /** "configured" | "test-users-only" | "provider-missing" | "disabled". */
  state: "configured" | "test-users-only" | "provider-missing" | "disabled";
};

export function imageIntelligenceStatus(): ImageIntelligenceStatus {
  const enabled = process.env.IMAGE_INTELLIGENCE_ENABLED === "true";
  const testUserCount = imageIntelligenceTestUsers().length;
  const info = visionProviderInfo();
  const reachable = enabled || testUserCount > 0;
  const state: ImageIntelligenceStatus["state"] = !reachable
    ? "disabled"
    : !info.configured
      ? "provider-missing"
      : enabled
        ? "configured"
        : "test-users-only";

  return {
    enabled,
    testUserCount,
    providerConfigured: info.configured,
    providerName: info.provider,
    model: info.model,
    endpointHost: info.endpointHost,
    state,
  };
}


export type EnvReport = {
  ok: boolean;
  mode: "production" | "development";
  demo: boolean;
  verifiedAuthRequired: boolean;
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
  hasAppUrl: boolean;
  hasDatabaseUrl: boolean;
  imageIntelligence: ImageIntelligenceStatus;
  warnings: string[];
};

export function inspectEnv(): EnvReport {
  const warnings: string[] = [];
  const hasBotToken = Boolean(telegramBotToken());
  const hasWebhookSecret = Boolean(telegramWebhookSecret());
  const hasAppUrl = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

  if (isProduction()) {
    if (!hasBotToken) warnings.push("TELEGRAM_BOT_TOKEN missing in production");
    if (!hasWebhookSecret) warnings.push("TELEGRAM_WEBHOOK_SECRET missing in production");
    if (!hasAppUrl) warnings.push("NEXT_PUBLIC_APP_URL missing in production");
    if (demoModeEnabled()) warnings.push("Demo mode is enabled in production — user data is shared");
  }
  if (!hasDatabaseUrl) warnings.push("DATABASE_URL missing");
  if (isProduction() && !process.env.REDIS_URL) warnings.push("REDIS_URL missing in production");
  if (isProduction() && !process.env.LOG_HASH_SECRET) warnings.push("LOG_HASH_SECRET missing in production");
  if (isProduction() && !process.env.NOTIFICATION_CRON_SECRET) warnings.push("NOTIFICATION_CRON_SECRET missing in production");
  // A reachable image feature without a provider key produces user-visible
  // failures, so it is a health warning rather than a silent misconfiguration.
  if (imageIntelligenceStatus().state === "provider-missing") {
    warnings.push("Image intelligence is enabled but VISION_API_KEY is missing");
  }

  return {
    ok: warnings.length === 0,
    mode: isProduction() ? "production" : "development",
    demo: demoModeEnabled(),
    verifiedAuthRequired: requireVerifiedIdentity(),
    hasBotToken,
    hasWebhookSecret,
    hasAppUrl,
    hasDatabaseUrl,
    imageIntelligence: imageIntelligenceStatus(),
    warnings,
  };
}
