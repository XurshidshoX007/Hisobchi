export type BotIntent =
  | "start"
  | "report"
  | "forecast"
  | "help"
  | "accounts"
  | "categories"
  | "payments"
  | "income-plans"
  | "budget"
  | "debts"
  | "goals"
  | "alerts"
  | "settings"
  | "add-income"
  | "add-expense"
  | "add-transfer"
  | "more-menu"
  | "main-menu"
  | "natural";

/**
 * Telegram may append a bot username and/or a deep-link payload to commands,
 * e.g. `/start@hisobchi_bot referral`. Routing must not depend on the Mini App
 * console's exact strings.
 */
export function botIntent(message: string): BotIntent {
  const text = message.trim();
  const lower = text.toLocaleLowerCase("uz");
  const firstToken = lower.split(/\s+/, 1)[0] ?? "";
  const command = firstToken.match(/^\/([a-z]+)(?:@[a-z0-9_]+)?$/)?.[1] ?? null;

  if (!text || command === "start" || lower === "start" || lower === "boshlash") return "start";
  if (command === "report" || lower === "📊 hisobot" || lower === "hisobot") return "report";
  if (command === "forecast" || lower === "📅 reja va prognoz" || lower === "reja va prognoz") return "forecast";
  if (command === "help" || lower === "yordam") return "help";

  if (lower === "💰 kirim" || lower === "➕ kirim" || lower === "kirim") return "add-income";
  if (lower === "💸 chiqim" || lower === "➖ chiqim" || lower === "chiqim") return "add-expense";
  if (lower === "🔄 transfer" || lower === "↔️ transfer" || lower === "↔ transfer" || lower === "transfer") return "add-transfer";
  if (lower === "📂 boshqa bo'limlar" || lower === "boshqa bo'limlar" || lower === "boshqa bolimlar") return "more-menu";
  if (lower === "⬅️ asosiy menyu" || lower === "asosiy menyu" || lower === "menyu" || lower === "menu") return "main-menu";
  // Amount-bearing prose is a transaction draft even if it contains words
  // such as “daromad”, “qarz” or “to‘lov”.
  if (/\d/.test(lower)) return "natural";
  if (lower.includes("hisobot")) return "report";
  if (lower.includes("prognoz") || lower.includes("reja")) return "forecast";
  if (lower.includes("hisob") && !lower.includes("hisobot")) return "accounts";
  if (lower === "📁 kategoriyalar" || lower.includes("kategoriya")) return "categories";
  if (lower.includes("majburiy") || lower.includes("to'lov") || lower.includes("tolov")) return "payments";
  if (lower === "💵 kutilayotgan daromadlar" || lower === "💰 kutilayotgan daromadlar" || lower.includes("kutilayotgan daromad") || (lower.includes("daromad") && !lower.includes("hisobot"))) return "income-plans";
  if (lower.includes("budjet")) return "budget";
  if (lower.includes("qarzdorlik") || lower.includes("qarz")) return "debts";
  if (lower.includes("maqsad")) return "goals";
  if (lower.includes("eslatma") || lower.includes("xabar")) return "alerts";
  if (lower.includes("sozlam")) return "settings";
  return "natural";
}

export function isStartCommand(message: string): boolean {
  return botIntent(message) === "start";
}

export function parseDraftCallback(data: string): { draftId: number; action: "confirm" | "cancel" } | null {
  if (data.length > 64) return null;
  const match = data.match(/^draft:(\d+):(confirm|cancel)$/);
  if (!match) return null;
  const draftId = Number(match[1]);
  if (!Number.isSafeInteger(draftId) || draftId <= 0) return null;
  return { draftId, action: match[2] as "confirm" | "cancel" };
}

/** Batch callbacks: `batch:<batchId>:confirm` or `batch:<batchId>:cancel`. */
export function parseBatchCallback(data: string): { batchId: string; action: "confirm" | "cancel" } | null {
  if (data.length > 64) return null;
  const match = data.match(/^batch:([a-zA-Z0-9_-]{4,32}):(confirm|cancel)$/);
  if (!match) return null;
  return { batchId: match[1], action: match[2] as "confirm" | "cancel" };
}
