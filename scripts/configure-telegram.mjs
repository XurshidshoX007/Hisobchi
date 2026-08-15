const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET;
const legacySecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!token || !secret || !configuredAppUrl) {
  console.error("BOT_TOKEN, WEBHOOK_SECRET and NEXT_PUBLIC_APP_URL are required");
  process.exit(1);
}
if (process.env.WEBHOOK_SECRET && legacySecret && process.env.WEBHOOK_SECRET !== legacySecret) {
  console.error("WEBHOOK_SECRET and TELEGRAM_WEBHOOK_SECRET must be identical");
  process.exit(1);
}
let appUrl;
try {
  appUrl = new URL(configuredAppUrl);
  if (appUrl.protocol !== "https:") throw new Error("not https");
} catch {
  console.error("NEXT_PUBLIC_APP_URL must be a valid HTTPS URL");
  process.exit(1);
}
const appBaseUrl = configuredAppUrl.replace(/\/+$/, "");
const expectedWebhook = `${appBaseUrl}/api/telegram/webhook`;

const api = async (method, payload) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`${method} failed (${body.error_code ?? response.status})`);
  return body;
};

const normalize = (url) => (url ?? "").replace(/\/+$/, "");

try {
  // Never discard Telegram's queue: correcting a webhook must preserve updates
  // already waiting for delivery.
  await api("setWebhook", {
    url: expectedWebhook,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
    max_connections: 40,
  });

  // Read back the registration after setWebhook, then verify the canonical URL.
  const webhook = await api("getWebhookInfo", {});
  const actualWebhook = webhook.result?.url ?? "";
  if (normalize(actualWebhook) !== expectedWebhook) {
    throw new Error("Webhook verification failed: registered URL does not match expected URL");
  }

  const me = await api("getMe", {});
  await api("setMyCommands", {
    commands: [
      { command: "start", description: "Botni boshlash" },
      { command: "report", description: "Tezkor hisobot" },
      { command: "forecast", description: "Reja va prognoz" },
      { command: "help", description: "Yordam" },
    ],
  });
  await api("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Moliyam", web_app: { url: appBaseUrl } },
  });
  console.log(`Telegram configured: @${me.result?.username ?? "unknown"}`);
  console.log(`Actual webhook: ${actualWebhook || "(empty)"}`);
  console.log(`Expected webhook: ${expectedWebhook}`);
  console.log("Webhook verified; pending updates were preserved.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Telegram configuration failed");
  process.exit(1);
}
