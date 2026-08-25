import { formatAmount } from "../money";
import type { ImageDraft } from "./types";
import type { UserCategory } from "./categories";
import type { AnalysisFailureReason } from "../imageIntelligence";

/**
 * Telegram confirmation UX for image intelligence (§21, §22, §23, §25, §30).
 *
 * Nothing is ever saved silently: every extracted row is listed, numbered and
 * individually editable, and the numbering NEVER changes between the summary
 * and the buttons, so no item can quietly disappear.
 */

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = InlineButton[][];

export const IMAGE_RECEIVED_TEXT = "📷 Rasm keldi. O‘qiyapman…";

export const IMAGE_FAILURE_TEXT = [
  "❌ Rasmni to‘liq o‘qib bo‘lmadi.",
  "",
  "Yorug‘roq rasm yuboring yoki summalarni yozib yuboring.",
  "Masalan: „Non 30 ming, go‘sht 120 ming“.",
].join("\n");

export const IMAGE_DISABLED_TEXT =
  "🖼 Rasmdan o‘qish hozircha ishlamaydi. Operatsiyani yozib yuboring — masalan: „150 ming ovqatga ketdi“.";

export const IMAGE_UNSUPPORTED_TEXT =
  "📎 Bu fayl turi mos emas. JPEG, PNG yoki WEBP rasm yuboring.";

export const IMAGE_TOO_LARGE_TEXT = "📦 Rasm juda katta. 5 MB gacha rasm yuboring.";

export const IMAGE_DUPLICATE_TEXT =
  "♻️ Bu rasm avval o‘qilgan — takroriy operatsiya yaratilmadi.";

export const IMAGE_RATE_LIMITED_TEXT = "⏳ Juda ko‘p rasm yuborildi. Bir daqiqadan keyin urinib ko‘ring.";

/**
 * Provider/analysis failure → user message (§12, §14, §25).
 *
 * Two rules:
 *   • a configuration problem is NEVER reported as “feature disabled”
 *   • a raw provider error (status, body, model name, key) is NEVER shown
 */
export const IMAGE_SERVICE_UNAVAILABLE_TEXT = [
  "🛠 Rasm o‘qish xizmati vaqtincha ishlamayapti.",
  "Keyinroq urinib ko‘ring yoki summani yozib yuboring.",
].join("\n");

/**
 * 401 / invalid key — the feature is on, but the operator key is wrong.
 * Distinct from "feature disabled" and from temporary overload.
 */
export const IMAGE_AUTH_ERROR_TEXT = [
  "🔐 Rasm o‘qish xizmati sozlanmagan.",
  "Keyinroq urinib ko‘ring yoki summani yozib yuboring.",
].join("\n");

/** Temporary 429 / upstream throttle — NOT quota, NOT app rate-limit. */
export const IMAGE_PROVIDER_BUSY_TEXT = [
  "⏳ Rasm o‘qish xizmatida yuklama yuqori.",
  "Bir necha daqiqadan keyin urinib ko‘ring yoki summani yozib yuboring.",
].join("\n");

/** Billing / project quota exhausted (also often returned as HTTP 429). */
export const IMAGE_QUOTA_EXHAUSTED_TEXT = [
  "📉 Rasm o‘qish limiti tugadi.",
  "Keyinroq urinib ko‘ring yoki operatsiyani yozib yuboring.",
].join("\n");

/** Model missing / not vision-capable / not available on this account. */
export const IMAGE_MODEL_ERROR_TEXT = [
  "🛠 Rasm o‘qish xizmati noto‘g‘ri sozlangan.",
  "Keyinroq urinib ko‘ring yoki summani yozib yuboring.",
].join("\n");

export const IMAGE_TIMEOUT_TEXT = [
  "⌛️ Rasm o‘qish cho‘zilib ketdi.",
  "Aniqroq rasm yuboring yoki keyinroq urinib ko‘ring.",
].join("\n");

export const IMAGE_UNREADABLE_TEXT = [
  "🔍 Rasmdagi matnni o‘qib bo‘lmadi.",
  "",
  "Yorug‘roq va to‘g‘ri burchakdan olingan rasm yuboring yoki summalarni yozib yuboring.",
  "Masalan: „Non 30 ming, go‘sht 120 ming“.",
].join("\n");

export const IMAGE_NO_FINANCE_TEXT = [
  "🤔 Rasmda summa topilmadi.",
  "",
  "Summalar ko‘rinib turgan rasm yuboring yoki operatsiyani yozib yuboring.",
].join("\n");

const FAILURE_TEXTS: Record<AnalysisFailureReason, string> = {
  unconfigured: IMAGE_SERVICE_UNAVAILABLE_TEXT,
  auth_error: IMAGE_AUTH_ERROR_TEXT,
  provider_error: IMAGE_SERVICE_UNAVAILABLE_TEXT,
  rate_limited: IMAGE_PROVIDER_BUSY_TEXT,
  quota_exhausted: IMAGE_QUOTA_EXHAUSTED_TEXT,
  model_error: IMAGE_MODEL_ERROR_TEXT,
  timeout: IMAGE_TIMEOUT_TEXT,
  unreadable: IMAGE_UNREADABLE_TEXT,
  unsupported_image: IMAGE_UNSUPPORTED_TEXT,
  too_large: IMAGE_TOO_LARGE_TEXT,
  no_content: IMAGE_NO_FINANCE_TEXT,
};

/** Monitoring event name per failure reason (§32). Never carries secrets. */
const FAILURE_EVENTS: Record<AnalysisFailureReason, string> = {
  unconfigured: "image_provider_unconfigured",
  auth_error: "image_provider_auth_error",
  provider_error: "image_processing_failed",
  rate_limited: "image_provider_rate_limited",
  quota_exhausted: "vision_quota_exhausted",
  model_error: "image_provider_model_error",
  timeout: "image_processing_timeout",
  unreadable: "image_extraction_failed",
  unsupported_image: "image_rejected",
  too_large: "image_rejected",
  no_content: "image_extraction_failed",
};

export function failureTextFor(reason: AnalysisFailureReason): string {
  return FAILURE_TEXTS[reason] ?? IMAGE_FAILURE_TEXT;
}

export function failureEventFor(reason: AnalysisFailureReason): string {
  return FAILURE_EVENTS[reason] ?? "image_processing_failed";
}

const KIND_TITLES: Record<string, { icon: string; singular: string }> = {
  expense: { icon: "💸", singular: "xarajat" },
  income: { icon: "💰", singular: "daromad" },
  payment_plan: { icon: "📌", singular: "to‘lov rejasi" },
  expected_income: { icon: "💵", singular: "kutilayotgan daromad" },
  debt: { icon: "💳", singular: "qarzdorlik" },
};

const ISSUE_LABELS: Record<string, string> = {
  category_unknown: "kategoriya",
  debt_direction_unknown: "qarz yo‘nalishi",
  amount_unclear: "summa",
  date_unclear: "sana",
  type_unclear: "turi",
  duplicate_row: "takroriy qator",
  amount_invalid: "summa",
  date_invalid: "sana",
  plan_invalid: "reja muddati",
};

export function summarizeCounts(drafts: ImageDraft[]): string[] {
  const counts = new Map<string, number>();
  for (const draft of drafts) counts.set(draft.meta.entityKind, (counts.get(draft.meta.entityKind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => {
    const title = KIND_TITLES[kind] ?? { icon: "•", singular: "operatsiya" };
    return `${title.icon} ${count} ta ${title.singular}`;
  });
}

function totalOf(drafts: ImageDraft[], kinds: string[]): number {
  return drafts
    .filter((d) => kinds.includes(d.meta.entityKind))
    .reduce((sum, d) => sum + Number((d.data as { amount?: number }).amount ?? 0), 0);
}

/** The batch confirmation message (§21, §23). */
export function buildBatchMessage(
  items: Array<{ id: number; payload: ImageDraft }>,
  options: { batchId: string; unparsedRows?: string[]; truncatedRows?: number } ,
): { text: string; keyboard: InlineKeyboard } {
  const drafts = items.map((item) => item.payload);
  const lines = ["📷 Rasm o‘qildi.", "", "Topildi:", ...summarizeCounts(drafts), ""];

  items.forEach((item, index) => {
    const issues = item.payload.meta.issues ?? [];
    const flag = issues.length ? " ❓" : "";
    lines.push(`${index + 1}. ${item.payload.meta.label}${flag}`);
  });

  const expenseTotal = totalOf(drafts, ["expense"]);
  const incomeTotal = totalOf(drafts, ["income"]);
  if (expenseTotal > 0) lines.push("", `Jami xarajat: ${formatAmount(expenseTotal)}`);
  if (incomeTotal > 0) lines.push(`Jami daromad: ${formatAmount(incomeTotal)}`);

  const clarify = items
    .map((item, index) => ({ index: index + 1, issues: item.payload.meta.issues ?? [] }))
    .filter((entry) => entry.issues.length);
  if (clarify.length) {
    lines.push("", "❓ Aniqlashtirish kerak:");
    for (const entry of clarify.slice(0, 10)) {
      lines.push(`• ${entry.index}-qator: ${entry.issues.map((i) => ISSUE_LABELS[i] ?? i).join(", ")}`);
    }
  }
  if (options.unparsedRows?.length) {
    lines.push("", `⚠️ O‘qilmagan qatorlar: ${options.unparsedRows.slice(0, 3).join(" · ").slice(0, 180)}`);
  }
  if (options.truncatedRows) {
    lines.push("", `ℹ️ Rasmda yana ${options.truncatedRows} ta qator bor. Ularni alohida rasm bilan yuboring.`);
  }

  return { text: lines.join("\n"), keyboard: buildBatchKeyboard(items, options.batchId) };
}

export function buildBatchKeyboard(items: Array<{ id: number }>, batchId: string): InlineKeyboard {
  const keyboard: InlineKeyboard = [
    [
      { text: "✅ Hammasini tasdiqlash", callback_data: `batch:${batchId}:confirm` },
      { text: "❌ Bekor qilish", callback_data: `batch:${batchId}:cancel` },
    ],
  ];
  const confirmButtons = items.slice(0, 20).map((item, index) => ({
    text: `✅ ${index + 1}`,
    callback_data: `draft:${item.id}:confirm`,
  }));
  const editButtons = items.slice(0, 20).map((item, index) => ({
    text: `✏️ ${index + 1}`,
    callback_data: `ed:${item.id}:menu`,
  }));
  for (let i = 0; i < confirmButtons.length; i += 5) keyboard.push(confirmButtons.slice(i, i + 5));
  for (let i = 0; i < editButtons.length; i += 5) keyboard.push(editButtons.slice(i, i + 5));
  return keyboard;
}

/** Per-item edit menu (§22). */
export function buildItemMenu(draftId: number, payload: ImageDraft): { text: string; keyboard: InlineKeyboard } {
  const rows: InlineKeyboard = [];
  const kind = payload.meta.entityKind;

  if (payload.kind === "transaction") {
    rows.push([
      { text: "🔁 Daromad/Xarajat", callback_data: `ed:${draftId}:type:${(payload.data as { type?: string }).type === "income" ? "expense" : "income"}` },
      { text: "📁 Kategoriya", callback_data: `ed:${draftId}:cat` },
    ]);
    rows.push([
      { text: "📅 Bugun", callback_data: `ed:${draftId}:date:today` },
      { text: "📅 Kecha", callback_data: `ed:${draftId}:date:yesterday` },
    ]);
  }
  if (payload.kind === "debt") {
    rows.push([
      { text: "⬅️ Menga qarzdor", callback_data: `ed:${draftId}:dir:owed_to_me` },
      { text: "➡️ Men qarzdorman", callback_data: `ed:${draftId}:dir:i_owe` },
    ]);
  }
  if (payload.kind === "payment_plan" || payload.kind === "expected_income") {
    rows.push([{ text: "📁 Kategoriya", callback_data: `ed:${draftId}:cat` }]);
  }
  rows.push([
    { text: "✅ Tasdiqlash", callback_data: `draft:${draftId}:confirm` },
    { text: "🗑 O‘chirish", callback_data: `ed:${draftId}:drop` },
  ]);

  const issues = payload.meta.issues ?? [];
  const text = [
    `✏️ Tahrirlash — ${KIND_TITLES[kind]?.singular ?? "operatsiya"}`,
    "",
    payload.meta.label,
    issues.length ? `\n❓ Aniqlashtirish: ${issues.map((i) => ISSUE_LABELS[i] ?? i).join(", ")}` : "",
    payload.meta.suggestedCategory ? `\n💡 Taklif: ${payload.meta.suggestedCategory} — bunday kategoriyangiz yo‘q` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { text, keyboard: rows };
}

/** Category picker built ONLY from the user's existing categories (§9, §31). */
export function buildCategoryKeyboard(
  draftId: number,
  categories: UserCategory[],
  type: "income" | "expense",
): InlineKeyboard {
  const usable = categories.filter((c) => c.isActive && c.type === type).slice(0, 18);
  const buttons = usable.map((c) => ({ text: c.name.slice(0, 24), callback_data: `ec:${draftId}:${c.id}` }));
  const rows: InlineKeyboard = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: "⬅️ Orqaga", callback_data: `ed:${draftId}:menu` }]);
  return rows;
}
