/**
 * Environment gates for production behaviour.
 *
 * The demo user + seeded world are meant for local development and preview
 * environments only. Production deploys must never bootstrap a shared demo
 * identity or accept unverified Telegram init-data.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function telegramBotToken(): string | null {
  return process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? null;
}

export function telegramWebhookSecret(): string | null {
  return process.env.WEBHOOK_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? null;
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

export type EnvReport = {
  ok: boolean;
  mode: "production" | "development";
  demo: boolean;
  verifiedAuthRequired: boolean;
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
  hasAppUrl: boolean;
  hasDatabaseUrl: boolean;
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

  return {
    ok: warnings.length === 0,
    mode: isProduction() ? "production" : "development",
    demo: demoModeEnabled(),
    verifiedAuthRequired: requireVerifiedIdentity(),
    hasBotToken,
    hasWebhookSecret,
    hasAppUrl,
    hasDatabaseUrl,
    warnings,
  };
}
