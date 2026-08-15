const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET ?? process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!token || !secret || !appUrl) {
  console.error("BOT_TOKEN, WEBHOOK_SECRET and NEXT_PUBLIC_APP_URL are required");
  process.exit(1);
}
if (!appUrl.startsWith("https://")) {
  console.error("NEXT_PUBLIC_APP_URL must use HTTPS");
  process.exit(1);
}

const api = async (method, payload) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`${method} failed`);
  return body;
};

try {
  await api("setWebhook", {
    url: `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
    max_connections: 40,
  });
  await api("setMyCommands", {
    commands: [
      { command: "start", description: "Botni boshlash" },
      { command: "report", description: "Tezkor hisobot" },
      { command: "forecast", description: "Reja va prognoz" },
      { command: "help", description: "Yordam" },
    ],
  });
  await api("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Moliyam", web_app: { url: appUrl } },
  });
  console.log(`Telegram configured: ${appUrl.replace(/\/$/, "")}/api/telegram/webhook`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Telegram configuration failed");
  process.exit(1);
}
