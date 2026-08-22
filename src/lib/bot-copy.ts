/**
 * ONE PLACE FOR EVERY WORD THE TELEGRAM BOT SAYS.
 *
 * Pure copy — no DB, no finance logic, no routing. `bot.ts` composes replies
 * from here and the webhook renders the same strings, so a single sentence can
 * never drift between the two surfaces (before this module the draft
 * confirmation existed twice, in two different wordings).
 *
 * Product truth this copy must respect:
 *   • the bot itself does THREE things — Daromad, Xarajat, Transfer;
 *   • everything else (hisoblar, budjet, qarzdorlik, maqsadlar, tarix, tahlil)
 *     lives in the Mini App and is only ever described as such;
 *   • vocabulary comes from `copy.ts` (`TERMS`) — the Mini App and the bot use
 *     one word per concept.
 *
 * Style rules: one idea per message, ≤ 6 short lines, typographic apostrophe
 * (o‘, g‘, App’ni), emoji only where it carries meaning, every message ends
 * knowing what the user does next.
 */

import { TERMS, TX_LABEL } from "./copy";
import { formatAmount, parseISO, UZ_MONTHS } from "./money";

/* ============================ Shared fragments ============================ */

/** The one example sentence used product-wide. Repeating a different example
 *  in every message is what made the old bot feel like documentation. */
export const EXAMPLE_EXPENSE = "150 ming ovqatga ketdi";
export const EXAMPLE_INCOME = "1,5 mln maosh keldi";
export const EXAMPLE_TRANSFER = "Naqd puldan Humoga 200 ming";

const CURRENCY = "so‘m";

/** Button labels. Reply-keyboard labels are ALSO routing keys — see
 *  `bot-routing.ts`; inline labels are free text next to a fixed
 *  `callback_data`. Never change a label without checking both. */
export const BUTTON = {
  income: "💰 Daromad",
  expense: "💸 Xarajat",
  transfer: "🔄 Transfer",
  miniApp: "📱 Mini App’ni ochish",
  confirm: "✅ Tasdiqlash",
  confirmAll: "✅ Hammasini tasdiqlash",
  cancel: "❌ Bekor qilish",
  backToMain: "⬅️ Asosiy menyu",
} as const;

/* ============================ Onboarding / start ============================ */

const greet = (firstName?: string | null) => {
  const name = (firstName ?? "").trim();
  return name ? `Assalomu alaykum, ${name} 👋` : "Assalomu alaykum 👋";
};

/**
 * First contact. No numbers here on purpose: a brand-new account has only
 * zeroes, and a wall of zeroes is the fastest way to lose a user. The message
 * answers three questions — what is this, what can I press, what now.
 */
export function startNew(firstName?: string | null): string {
  return [
    greet(firstName),
    "",
    "Hisobchi pulingiz qayerdan kelib, qayerga ketayotganini yozib boradi.",
    "",
    `${BUTTON.income} — pul keldi`,
    `${BUTTON.expense} — pul ketdi`,
    `${BUTTON.transfer} — hisobdan hisobga`,
    "",
    `Yoki shunchaki yozing: „${EXAMPLE_EXPENSE}“.`,
    "",
    "Birinchi operatsiyani hozir qo‘shing 👇",
  ].join("\n");
}

/**
 * Returning user. Two facts, one action — the full picture is one tap away in
 * the Mini App, so /start stays a launchpad, not a report.
 */
export function startReturning(input: {
  firstName?: string | null;
  balance: number;
  monthIncome: number;
  monthExpense: number;
  monthLabel?: string | null;
}): string {
  const month = (input.monthLabel ?? "Bu oy").trim();
  return [
    greet(input.firstName),
    "",
    `💰 ${TERMS.balance}: ${formatAmount(input.balance)} ${CURRENCY}`,
    `📅 ${month}: +${formatAmount(input.monthIncome)} / −${formatAmount(input.monthExpense)}`,
    "",
    "Yangi operatsiya qo‘shamizmi? Tugmani bosing yoki yozib yuboring 👇",
  ].join("\n");
}

/** Second /start message — the Mini App door. Names only what really exists
 *  there; the bot never promises a Mini App feature as its own. */
export const MINI_APP_INTRO = "Hisoblar, budjet, qarzdorlik, maqsadlar va tahlil — Mini App’da.";

/* ============================ Three core actions ============================ */

/**
 * A tapped button already says “Daromad”; repeating it wastes the first line.
 * Each prompt asks ONE question and shows ONE example.
 */
export const PROMPT = {
  income: ["Qancha pul keldi?", "", `Masalan: ${EXAMPLE_INCOME}`].join("\n"),
  expense: ["Qancha va nimaga sarfladingiz?", "", `Masalan: ${EXAMPLE_EXPENSE}`].join("\n"),
  transfer: ["Qaysi hisobdan qaysi hisobga o‘tkazdingiz?", "", `Masalan: ${EXAMPLE_TRANSFER}`].join("\n"),
} as const;

/* ============================ Draft confirmation ============================ */

export type DraftLike = {
  type: "income" | "expense" | "transfer";
  amount: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  categoryName?: string | null;
  date: string;
};

/** “22 avgust” — the year is noise for an entry made today or yesterday. */
function dateLabel(iso: string): string {
  const d = parseISO(iso);
  const label = `${d.getDate()} ${UZ_MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

const SIGN: Record<DraftLike["type"], string> = { income: "💰", expense: "💸", transfer: "🔄" };

const amountText = (d: DraftLike) =>
  `${formatAmount(d.amount ?? 0)} ${CURRENCY}${
    d.minAmount && d.maxAmount ? ` (${formatAmount(d.minAmount)}–${formatAmount(d.maxAmount)})` : ""
  }`;

/** Single draft — the user has to verify three facts, so exactly three lines. */
export function draftSummary(d: DraftLike): string {
  return [
    "Shunday yozib qo‘yaymi?",
    "",
    `${SIGN[d.type]} ${TX_LABEL[d.type]} · ${amountText(d)}`,
    `${d.categoryName ?? "Kategoriyasiz"} · ${dateLabel(d.date)}`,
  ].join("\n");
}

/** Several drafts in one message — numbers match the inline buttons exactly. */
export function batchSummary(drafts: DraftLike[], failed: string[] = []): string {
  const lines = [
    `${drafts.length} ta operatsiya topildi:`,
    "",
    ...drafts.map(
      (d, i) => `${i + 1}. ${SIGN[d.type]} ${amountText(d)} — ${d.categoryName ?? TX_LABEL[d.type]} · ${dateLabel(d.date)}`,
    ),
    "",
    "Hammasini tasdiqlang yoki raqami bo‘yicha bittalab tanlang.",
  ];
  if (failed.length) lines.push("", `⚠️ Bularni tushunmadim: ${failed.slice(0, 3).join("; ")}`);
  return lines.join("\n");
}

/* ============================ Results / acks ============================ */

export const ACK = {
  saved: (message: string) => `✅ ${message}`,
  savedCount: (n: number) => `✅ ${n} ta operatsiya saqlandi`,
  savedPartly: (ok: number, pending: number) => `✅ ${ok} ta saqlandi · ❓ ${pending} tasi aniqlashtirishni kutmoqda`,
  cancelled: "Bekor qilindi",
  cancelledCount: (n: number) => `❌ ${n} ta operatsiya bekor qilindi`,
  alreadyDone: "Bu allaqachon yakunlangan",
  alreadySaved: "Bu allaqachon saqlangan",
  notFound: "Bu so‘rov topilmadi",
  expired: "Muddati tugadi. Operatsiyani qayta yuboring",
  invalidRequest: "So‘rov noto‘g‘ri",
  saveFailed: "⛔ Saqlanmadi. Qayta urinib ko‘ring",
  failed: (message: string) => `⛔ ${message}`,
  edited: (message: string) => `✏️ ${message}`,
} as const;

/* ============================ Misunderstanding ============================ */

export const NOT_UNDERSTOOD = [
  "Summani topa olmadim 🤔",
  "",
  `Shunday yozing: „${EXAMPLE_EXPENSE}“.`,
  "Bir nechta operatsiyani vergul bilan ajrating.",
].join("\n");

export const TRANSFER_NEEDS_ACCOUNTS = [
  "Ikkala hisob nomini ham yozing.",
  "",
  `Masalan: ${EXAMPLE_TRANSFER}`,
  "",
  "Hisoblaringizni Mini App’da ko‘rishingiz mumkin.",
].join("\n");

/* ============================ Credit schedule ============================ */

export const SCHEDULE = {
  title: "📋 Kredit jadvali",
  total: (count: number, total: number) => `${count} ta to‘lov · jami ${formatAmount(total)} ${CURRENCY}`,
  duplicate: "⚠️ Shunga o‘xshash faol kredit rejasi bor.",
  confirmHint: "Hammasini qo‘shamizmi?",
  single: [
    "Bu yerda bitta to‘lov ko‘rinyapti.",
    "",
    "Agar kredit bo‘lsa — to‘liq jadvalni yuboring.",
    "Oddiy to‘lov bo‘lsa — summani yozing, masalan: „500 ming ijara to‘ladim“.",
  ].join("\n"),
  invalid: (errors: string[]) =>
    ["⚠️ Jadvalni to‘liq o‘qib bo‘lmadi:", ...errors.slice(0, 3).map((e) => `• ${e}`), "", "Tekshirib, qayta yuboring."].join("\n"),
  saved: (name: string, count: number, total: number, nearestDate: string, nearestAmount: number) =>
    [
      "✅ Kredit jadvali qo‘shildi",
      "",
      name,
      `${count} ta to‘lov · jami ${formatAmount(total)} ${CURRENCY}`,
      "",
      `Eng yaqin to‘lov: ${nearestDate} · ${formatAmount(nearestAmount)} ${CURRENCY}`,
    ].join("\n"),
  savedShort: "✅ Kredit jadvali qo‘shildi",
  duplicateSaved: "✅ Bu kredit jadvali avval qo‘shilgan",
} as const;

/* ============================ Help & navigation ============================ */

export const HELP = [
  "Hisobchi shunday ishlaydi 👇",
  "",
  "Operatsiyani o‘z so‘zingiz bilan yozing:",
  `• „${EXAMPLE_EXPENSE}“`,
  "• „kecha 150 ming ovqat, 70 ming taksi“ — bir nechtasi birdan",
  "• „15-avgust 500 ming ijara to‘ladim“ — o‘tgan sana bilan",
  "",
  `Tugmalar: ${BUTTON.income} · ${BUTTON.expense} · ${BUTTON.transfer}`,
  "",
  "Buyruqlar:",
  "/report — bugun va bu oy",
  "/forecast — kelayotgan to‘lovlar va prognoz",
  "/start — boshidan",
  "",
  MINI_APP_INTRO,
].join("\n");

export const MORE_MENU_TEXT = "📂 Qo‘shimcha bo‘limlar. Kerakligini tanlang 👇";

export const MAIN_MENU_TEXT = "Asosiy menyu. Kerakli amalni tanlang 👇";

/* ============================ Settings ============================ */

export function settingsBlock(input: {
  currency: string;
  minReserve: string;
  estimatedIncomeConfidence: number;
  notifyPayments: boolean;
  notifyIncome: boolean;
  notifyBudget: boolean;
  notifyRisk: boolean;
}): string {
  const onOff = (value: boolean) => (value ? "yoqilgan" : "o‘chirilgan");
  return [
    "⚙️ Sozlamalar",
    "",
    `Valyuta: ${input.currency}`,
    `Minimal zaxira: ${input.minReserve} ${CURRENCY}`,
    `Taxminiy daromad ishonchliligi: ${input.estimatedIncomeConfidence}%`,
    "",
    "Eslatmalar:",
    `• To‘lovlar: ${onOff(input.notifyPayments)}`,
    `• Daromad: ${onOff(input.notifyIncome)}`,
    `• Budjet: ${onOff(input.notifyBudget)}`,
    `• Xavf: ${onOff(input.notifyRisk)}`,
    "",
    "Sozlamalarni Mini App’da o‘zgartirasiz. Yordam kerak bo‘lsa — /help.",
  ].join("\n");
}
