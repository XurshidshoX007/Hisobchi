import { appUrl, telegramBotToken, telegramWebhookSecret } from "./env";
import { securityLog } from "./security";

type TelegramEnvelope<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
};

export type TelegramCallContext = {
  requestId: string;
  userId?: number | null;
};

/** The one canonical URL used by both health checks and webhook provisioning. */
export function telegramWebhookUrl(): string | null {
  const configured = appUrl();
  if (!configured) return null;
  return `${configured.replace(/\/+$/, "")}/api/telegram/webhook`;
}

function normalizeWebhookUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function telegramApi<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
  context?: TelegramCallContext,
  options: { timeoutMs?: number } = {},
): Promise<TelegramEnvelope<T>> {
  const token = telegramBotToken();
  if (!token) {
    if (context) securityLog("error", "telegram_api_unconfigured", { ...context, code: method });
    return { ok: false, error_code: 503, description: "bot_unconfigured" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
      cache: "no-store",
    });
    const envelope = (await response.json()) as TelegramEnvelope<T>;
    if (!response.ok || !envelope.ok) {
      if (context) {
        securityLog("error", "telegram_api_rejected", {
          ...context,
          code: `${method}:${envelope.error_code ?? response.status}`,
        });
      }
      return { ...envelope, ok: false };
    }
    return envelope;
  } catch (error) {
    if (context) {
      securityLog("error", "telegram_api_error", {
        ...context,
        code: `${method}:${error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network"}`,
      });
    }
    return { ok: false, error_code: 502, description: "telegram_unreachable" };
  }
}

type TelegramWebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};

/**
 * Reconciles Telegram's webhook without ever dropping queued updates.
 * This is explicit (not part of /api/health) so a health probe stays read-only.
 */
export async function ensureTelegramWebhook(): Promise<{
  ok: boolean;
  changed: boolean;
  expectedUrl: string | null;
  actualUrl: string | null;
  reason?: string;
}> {
  const expectedUrl = telegramWebhookUrl();
  const secret = telegramWebhookSecret();
  if (!expectedUrl || !secret) {
    return { ok: false, changed: false, expectedUrl, actualUrl: null, reason: "telegram_webhook_configuration_missing" };
  }
  const before = await telegramApi<TelegramWebhookInfo>("getWebhookInfo", {}, undefined, { timeoutMs: 10_000 });
  if (!before.ok) return { ok: false, changed: false, expectedUrl, actualUrl: null, reason: "get_webhook_info_failed" };
  const actualUrl = before.result?.url ? normalizeWebhookUrl(before.result.url) : "";
  if (actualUrl === expectedUrl) return { ok: true, changed: false, expectedUrl, actualUrl: before.result?.url ?? null };

  const set = await telegramApi("setWebhook", {
    url: expectedUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
    max_connections: 40,
  }, undefined, { timeoutMs: 10_000 });
  if (!set.ok) return { ok: false, changed: false, expectedUrl, actualUrl: before.result?.url ?? null, reason: "set_webhook_failed" };

  const after = await telegramApi<TelegramWebhookInfo>("getWebhookInfo", {}, undefined, { timeoutMs: 10_000 });
  const verifiedUrl = after.result?.url ?? null;
  return {
    ok: after.ok && normalizeWebhookUrl(verifiedUrl ?? "") === expectedUrl,
    changed: true,
    expectedUrl,
    actualUrl: verifiedUrl,
    ...(after.ok ? {} : { reason: "webhook_verification_failed" }),
  };
}

export type TelegramHealth = {
  status: "unset" | "connected" | "misconfigured" | "error";
  username: string | null;
  webhookUrlMatches: boolean | null;
  pendingUpdates: number | null;
  hasLastWebhookError: boolean;
};

/** Checks Bot API identity and the actual webhook registered at Telegram. */
export async function telegramHealth(): Promise<TelegramHealth> {
  if (!telegramBotToken()) {
    return { status: "unset", username: null, webhookUrlMatches: null, pendingUpdates: null, hasLastWebhookError: false };
  }
  const [me, webhook] = await Promise.all([
    telegramApi<{ username?: string }>("getMe", {}, undefined, { timeoutMs: 2_500 }),
    telegramApi<TelegramWebhookInfo>("getWebhookInfo", {}, undefined, { timeoutMs: 2_500 }),
  ]);
  if (!me.ok || !webhook.ok) {
    return { status: "error", username: null, webhookUrlMatches: null, pendingUpdates: null, hasLastWebhookError: false };
  }
  const expectedUrl = telegramWebhookUrl();
  const actualUrl = webhook.result?.url ? normalizeWebhookUrl(webhook.result.url) : "";
  const webhookUrlMatches = expectedUrl ? actualUrl === expectedUrl : null;
  return {
    status: webhookUrlMatches ? "connected" : "misconfigured",
    username: me.result?.username ?? null,
    webhookUrlMatches,
    pendingUpdates: webhook.result?.pending_update_count ?? 0,
    hasLastWebhookError: Boolean(
      webhook.result?.last_error_date && Math.floor(Date.now() / 1000) - webhook.result.last_error_date < 60 * 60,
    ),
  };
}
