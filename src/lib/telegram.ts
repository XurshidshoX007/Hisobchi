import { appUrl, telegramBotToken } from "./env";
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
    telegramApi<{ url?: string; pending_update_count?: number; last_error_date?: number }>("getWebhookInfo", {}, undefined, { timeoutMs: 2_500 }),
  ]);
  if (!me.ok || !webhook.ok) {
    return { status: "error", username: null, webhookUrlMatches: null, pendingUpdates: null, hasLastWebhookError: false };
  }
  const expectedUrl = appUrl()?.replace(/\/$/, "");
  const actualUrl = webhook.result?.url?.replace(/\/$/, "") ?? "";
  const webhookUrlMatches = expectedUrl ? actualUrl === `${expectedUrl}/api/telegram/webhook` : null;
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
