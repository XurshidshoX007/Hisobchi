import { formatAmount } from "../money";
import type { ImageDraft } from "./types";
import type { UserCategory } from "./categories";

/**
 * Telegram confirmation UX for image intelligence (§21, §22, §23, §25, §30).
 *
 * Nothing is ever saved silently: every extracted row is listed, numbered and
 * individually editable, and the numbering NEVER changes between the summary
 * and the buttons, so no item can quietly disappear.
 */

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = InlineButton[][];

export const IMAGE_RECEIVED_TEXT = "📷 Rasm qabul qilindi…\n🔍 Tahlil qilinmoqda…";

export const IMAGE_FAILURE_TEXT = [
  "❌ Rasmni to'liq o'qib bo'lmadi.",
  "",
  "Rasmni aniqroq (yorug', to'g'ri burchakdan) yuboring yoki asosiy summalarni yozib yuboring.",
  "Masalan: „Non 30 ming, Go'sht 120 ming“.",
].join("\n");

export const IMAGE_DISABLED_TEXT =
  "🖼 Rasm tahlili hozircha yoqilmagan. Operatsiyani matn ko'rinishida yozib yuboring — masalan: „150 ming ovqatga ketdi“.";

export const IMAGE_UNSUPPORTED_TEXT =
  "📎 Bu fayl turi qo'llab-quvvatlanmaydi. JPEG, PNG yoki WEBP rasm yuboring (PDF keyingi bosqichda).";

export const IMAGE_TOO_LARGE_TEXT = "📦 Rasm hajmi juda katta. 5 MB gacha bo'lgan rasm yuboring.";

export const IMAGE_DUPLICATE_TEXT =
  "♻️ Bu rasm avval qayta ishlangan — takroriy yozuvlar yaratilmadi. Yangi ma'lumot bo'lsa, boshqa rasm yuboring.";

export const IMAGE_RATE_LIMITED_TEXT = "⏳ Juda ko'p rasm yuborildi. Bir daqiqadan so'ng qayta urinib ko'ring.";

const KIND_TITLES: Record<string, { icon: string; singular: string }> = {
  expense: { icon: "💸", singular: "xarajat" },
  income: { icon: "💰", singular: "daromad" },
  payment_plan: { icon: "📌", singular: "to'lov rejasi" },
  expected_income: { icon: "💵", singular: "kutilayotgan daromad" },
  debt: { icon: "💳", singular: "qarzdorlik" },
};

const ISSUE_LABELS: Record<string, string> = {
  category_unknown: "kategoriya",
  debt_direction_unknown: "qarz yo'nalishi",
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
    const title = KIND_TITLES[kind] ?? { icon: "•", singular: "yozuv" };
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
  const lines = ["📷 Rasm tahlil qilindi.", "", "Topildi:", ...summarizeCounts(drafts), ""];

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
    lines.push("", `⚠️ O'qilmagan qatorlar: ${options.unparsedRows.slice(0, 3).join(" · ").slice(0, 180)}`);
  }
  if (options.truncatedRows) {
    lines.push("", `ℹ️ Rasmda yana ${options.truncatedRows} ta qator bor. Ularni alohida rasm bilan yuboring.`);
  }

  return { text: lines.join("\n"), keyboard: buildBatchKeyboard(items, options.batchId) };
}

export function buildBatchKeyboard(items: Array<{ id: number }>, batchId: string): InlineKeyboard {
  const keyboard: InlineKeyboard = [
    [
      { text: "✅ Barchasini tasdiqlash", callback_data: `batch:${batchId}:confirm` },
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
      { text: "🔁 Kirim/Chiqim", callback_data: `ed:${draftId}:type:${(payload.data as { type?: string }).type === "income" ? "expense" : "income"}` },
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
    { text: "🗑 O'chirish", callback_data: `ed:${draftId}:drop` },
  ]);

  const issues = payload.meta.issues ?? [];
  const text = [
    `✏️ Tahrirlash — ${KIND_TITLES[kind]?.singular ?? "yozuv"}`,
    "",
    payload.meta.label,
    issues.length ? `\n❓ Aniqlashtirish: ${issues.map((i) => ISSUE_LABELS[i] ?? i).join(", ")}` : "",
    payload.meta.suggestedCategory ? `\n💡 Taklif: ${payload.meta.suggestedCategory} (mavjud kategoriyalaringizda topilmadi)` : "",
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
