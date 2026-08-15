import type { User } from "@/db/schema";
import { buildAppState } from "./state";
import { quickAdd } from "./mutations";
import { parseDraft } from "./nlp";
import { compact, formatAmount, humanDate, shortDate } from "./money";
import type { AppState } from "./types";

export type BotReply = {
  text: string;
  keyboard: string[][];
  draft?: {
    type: "income" | "expense" | "transfer";
    amount: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    categoryName: string | null;
    date: string;
    note: string;
    estimated: boolean;
    confidence: number;
  };
};

export const MAIN_MENU: string[][] = [
  ["➕ Kirim", "➖ Chiqim", "↔️ Transfer"],
  ["📊 Hisobot", "📅 Reja va prognoz"],
  ["💳 Hisoblar", "📂 Kategoriyalar"],
  ["📌 Majburiy to'lovlar", "💰 Kutilayotgan daromadlar"],
  ["🎯 Budjet", "📋 Qarzdorlik", "🏆 Maqsadlar"],
  ["🔔 Eslatmalar", "⚙️ Sozlamalar"],
];

const mon = (n: number) => `${Math.round(n / 1000)} ming`;

export async function respondToBotMessage(
  user: User,
  message: string,
  confirm?: Record<string, unknown> | null,
): Promise<BotReply> {
  const text = message.trim();
  const lower = text.toLowerCase();
  const state = await buildAppState(user);

  if (confirm && confirm.amount && confirm.type) {
    const result = await quickAdd(user, `${confirm.amount} ${confirm.note ?? ""}`, confirm);
    const after = await buildAppState(user);
    return {
      text: result.ok
        ? `✅ ${result.message}\n\n${summaryBlock(after)}`
        : `❌ ${result.message}`,
      keyboard: MAIN_MENU,
    };
  }

  if (!text || lower === "/start" || lower === "start" || lower === "boshlash") {
    return {
      text: [
        `Salom, ${user.firstName} 👋`,
        "",
        "Men sizning shaxsiy moliya boshqaruvchingizman. Kirim, chiqim va transferni tabiiy tilda yozing:",
        "",
        "„150 ming ovqatga ketdi“",
        "„1,5 mln maosh keldi“",
        "„2.5 mln ijara to'ladim“",
        "",
        summaryBlock(state),
      ].join("\n"),
      keyboard: MAIN_MENU,
    };
  }

  if (lower.includes("hisobot") || lower === "/report" || lower === "📊 hisobot") {
    return { text: reportBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("prognoz") || lower.includes("reja") || lower === "/forecast") {
    return { text: forecastBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("hisob") && !lower.includes("hisobot")) {
    return { text: accountsBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("kategoriya")) {
    return { text: categoriesBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("majburiy") || lower.includes("to'lov") || lower.includes("tolov")) {
    return { text: paymentsBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("daromad")) {
    return { text: incomeBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("budjet")) {
    return { text: budgetBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("qarz")) {
    return { text: debtsBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("maqsad")) {
    return { text: goalsBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("eslatma") || lower.includes("xabar")) {
    return { text: alertsBlock(state), keyboard: MAIN_MENU };
  }
  if (lower.includes("sozlam") || lower.includes("help") || lower === "/help") {
    return {
      text: [
        "⚙️ Sozlamalar",
        "",
        `Valyuta: ${state.user.currency}`,
        `Minimal zaxira: ${mon(state.user.minReserve)} so'm`,
        `Taxminiy daromad ishonchliligi: ${state.user.estimatedIncomeConfidence}%`,
        "",
        "Eslatmalar:",
        `• To'lovlar: ${state.user.notifyPayments ? "yoqilgan" : "o'chirilgan"}`,
        `• Daromad: ${state.user.notifyIncome ? "yoqilgan" : "o'chirilgan"}`,
        `• Budjet: ${state.user.notifyBudget ? "yoqilgan" : "o'chirilgan"}`,
        `• Xavf: ${state.user.notifyRisk ? "yoqilgan" : "o'chirilgan"}`,
        "",
        "To'liq imkoniyatlar Mini Appda:",
        "/app — dashboard, grafiklar, forecast",
      ].join("\n"),
      keyboard: MAIN_MENU,
    };
  }

  // default: natural language parse
  const draft = parseDraft(text);
  if (!draft.ok || draft.amount === null) {
    return {
      text: "🤔 Summani tushunmadim. Misol: „150 ming ovqatga ketdi“ yoki „8 mln maosh keldi“.",
      keyboard: MAIN_MENU,
    };
  }
  return {
    text: [
      "Quyidagi operatsiyani topdim:",
      "",
      `Summa: ${formatAmount(draft.amount)}${draft.estimated && draft.minAmount && draft.maxAmount ? ` (${formatAmount(draft.minAmount)}–${formatAmount(draft.maxAmount)})` : ""}`,
      `Turi: ${draft.type === "income" ? "Kirim" : draft.type === "transfer" ? "Transfer" : "Chiqim"}`,
      `Kategoriya: ${draft.categoryName ?? "aniqlanmadi"}`,
      `Sana: ${humanDate(draft.date)}`,
      "",
      "Tasdiqlaysizmi? „ha“ deb yozing.",
    ].join("\n"),
    keyboard: [["✅ Ha, qo'sh", "❌ Bekor qilish"], ...MAIN_MENU],
    draft: {
      type: draft.type,
      amount: draft.amount,
      minAmount: draft.minAmount,
      maxAmount: draft.maxAmount,
      categoryName: draft.categoryName,
      date: draft.date,
      note: draft.note,
      estimated: draft.estimated,
      confidence: draft.confidence,
    },
  };
}

function summaryBlock(s: AppState): string {
  const f = s.forecast;
  return [
    `💰 Umumiy balans: ${formatAmount(f.currentBalance)} so'm`,
    `✨ Xavfsiz sarflash: ${formatAmount(f.safeToSpend)} so'm`,
    `📊 Bu oy: +${mon(s.analytics.monthTotals.income)} / -${mon(s.analytics.monthTotals.expense)}`,
  ].join("\n");
}

function reportBlock(s: AppState): string {
  const a = s.analytics;
  return [
    "📊 Hisobot",
    "",
    "Bugun",
    `• Kirim: ${mon(a.today.income)} so'm`,
    `• Chiqim: ${mon(a.today.expense)} so'm`,
    `• Sof: ${mon(a.today.net)} so'm`,
    "",
    `Bu oy (${a.month})`,
    `• Daromad: ${mon(a.monthTotals.income)}`,
    `• Xarajat: ${mon(a.monthTotals.expense)}`,
    `• Sof qoldiq: ${mon(a.monthTotals.net)}`,
    `• O'rtacha kunlik xarajat: ${mon(a.monthTotals.avgDaily)}`,
    `• Jamg'arish ulushi: ${(a.monthTotals.savingsRate * 100).toFixed(0)}%`,
    "",
    a.topCategory ? `Eng katta toifa: ${a.topCategory.name} — ${mon(a.topCategory.amount)} (${(a.topCategory.share * 100).toFixed(0)}%)` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function forecastBlock(s: AppState): string {
  const f = s.forecast;
  return [
    "📅 Reja va prognoz (35 kun)",
    "",
    `Joriy balans: ${mon(f.currentBalance)}`,
    `Kutilayotgan daromad: ${mon(f.income.base)} (aniq ${mon(f.income.exactBase)}, taxminiy ${mon(f.income.estimatedBase)})`,
    `Rejalashtirilgan xarajat: ${mon(f.expense.base)} (majburiy ${mon(f.expense.mandatoryBase)})`,
    "",
    `Prognoz (min): ${mon(f.scenarios.min.balance)}`,
    `Prognoz (bazaviy): ${mon(f.scenarios.base.balance)}`,
    `Prognoz (max): ${mon(f.scenarios.max.balance)}`,
    "",
    `✨ Safe-to-Spend: ${mon(f.safeToSpend)}`,
    f.riskDates.length
      ? `🚨 Xavf kunlari: ${f.riskDates.slice(0, 3).map((r) => `${shortDate(r.date)} (-${mon(r.deficit)})`).join(", ")}`
      : "✅ Pul yetishmasligi xavfi aniqlanmadi",
  ].join("\n");
}

function accountsBlock(s: AppState): string {
  return [
    "💳 Hisoblar",
    "",
    ...s.accounts.map((a) => `${a.isActive ? "•" : "○"} ${a.name}: ${formatAmount(a.currentBalance)} so'm`),
    "",
    `Jami: ${formatAmount(s.accounts.reduce((t, a) => t + a.currentBalance, 0))} so'm`,
  ].join("\n");
}

function categoriesBlock(s: AppState): string {
  const lines: string[] = ["📂 Kategoriyalar", ""];
  for (const c of s.categories) {
    lines.push(`${c.icon} ${c.name}${c.isEssential ? " (majburiy)" : ""}`);
    for (const ch of c.children) lines.push(`   ${ch.icon} ${ch.name}`);
  }
  return lines.join("\n");
}

function paymentsBlock(s: AppState): string {
  const f = s.forecast;
  if (!f.upcomingPayments.length) return "📌 Yaqin majburiy to'lovlar yo'q.";
  return [
    "📌 Yaqin to'lovlar",
    "",
    ...f.upcomingPayments.map(
      (p) =>
        `${shortDate(p.date)} — ${p.name}: ${p.certainty === "estimated" ? `${mon(p.min)}–${mon(p.max)} (taxminiy)` : mon(p.base)}${p.mandatory ? " [majburiy]" : ""}`,
    ),
  ].join("\n");
}

function incomeBlock(s: AppState): string {
  const f = s.forecast;
  return [
    "💰 Kutilayotgan daromadlar",
    "",
    ...(f.upcomingIncome.length
      ? f.upcomingIncome.map(
          (i) =>
            `${shortDate(i.date)} — ${i.sourceName}: ${i.certainty === "estimated" ? `${mon(i.min)}–${mon(i.max)} (taxminiy)` : mon(i.base)}${i.received ? " ✅ qayd etilgan" : ""}`,
        )
      : ["Yaqin daromad rejalari yo'q."]),
  ].join("\n");
}

function budgetBlock(s: AppState): string {
  if (!s.budgets.length) return "🎯 Budjetlar belgilanmagan.";
  return [
    "🎯 Budjetlar",
    "",
    ...s.budgets.map(
      (b) =>
        `${b.categoryIcon} ${b.categoryName}: ${mon(b.spent)} / ${mon(b.amount)} — ${(b.usage * 100).toFixed(0)}%${b.status === "exceeded" ? " 🚨" : b.status === "warning" ? " ⚠️" : ""}`,
    ),
  ].join("\n");
}

function debtsBlock(s: AppState): string {
  const iOwe = s.debts.filter((d) => d.direction === "i_owe");
  const toMe = s.debts.filter((d) => d.direction === "owed_to_me");
  const fmt = (d: (typeof s.debts)[number]) =>
    `• ${d.personName}: ${formatAmount(d.remainingAmount)} so'm qoldi${d.dueDate ? ` (${shortDate(d.dueDate)})` : ""}`;
  return [
    "📋 Qarzdorlik",
    "",
    "Men qarzdorman:",
    ...(iOwe.length ? iOwe.map(fmt) : ["—"]),
    "",
    "Menga qarzdor:",
    ...(toMe.length ? toMe.map(fmt) : ["—"]),
    "",
    `Sof holat: ${formatAmount(toMe.reduce((t, d) => t + d.remainingAmount, 0) - iOwe.reduce((t, d) => t + d.remainingAmount, 0))} so'm`,
  ].join("\n");
}

function goalsBlock(s: AppState): string {
  if (!s.goals.length) return "🏆 Maqsadlar yo'q.";
  return [
    "🏆 Maqsadlar",
    "",
    ...s.goals.map(
      (g) =>
        `${g.icon} ${g.name}: ${compact(g.savedAmount)} / ${compact(g.targetAmount)} (${(g.progress * 100).toFixed(0)}%) — oyda ${compact(g.requiredMonthly)} kerak${g.onTrack ? " ✅" : " ⚠️ ortda"}`,
    ),
  ].join("\n");
}

function alertsBlock(s: AppState): string {
  if (!s.alerts.length) return "🔔 Hozircha eslatmalar yo'q.";
  const icons: Record<string, string> = { info: "🔔", warning: "⚠️", critical: "🚨", success: "✅" };
  return ["🔔 Eslatmalar va ogohlantirishlar", "", ...s.alerts.map((a) => `${icons[a.severity]} ${a.title}\n${a.body}`)].join("\n");
}
