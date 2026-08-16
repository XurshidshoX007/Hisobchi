import type { User } from "@/db/schema";
import { buildAppState } from "./state";
import { quickAdd } from "./mutations";
import { parseDrafts } from "./nlp";
import { compact, formatAmount, humanDate, shortDate } from "./money";
import type { AppState } from "./types";
import { botIntent } from "./bot-routing";

export type BotDraft = {
  type: "income" | "expense" | "transfer";
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  categoryName: string | null;
  date: string;
  note: string;
  estimated: boolean;
  confidence: number;
  accountId?: number;
  toAccountId?: number;
};

export type BotReply = {
  text: string;
  keyboard: string[][];
  draft?: BotDraft;
  drafts?: BotDraft[];
  failedSegments?: string[];
};

/**
 * Telegram main keyboard per spec - compact logically grouped.
 */
export const MAIN_MENU: string[][] = [
  ["💰 Kirim", "💸 Chiqim", "🔄 Transfer"],
  ["📊 Hisobot", "📅 Reja va prognoz"],
  ["💳 Hisoblar", "📁 Kategoriyalar"],
  ["📌 Majburiy to'lovlar", "💵 Kutilayotgan daromadlar"],
  ["🎯 Budjet", "💳 Qarzdorlik", "🏆 Maqsadlar"],
  ["🔔 Eslatmalar", "⚙️ Sozlamalar"],
];

export const MORE_MENU: string[][] = [
  ["💳 Hisoblar", "📁 Kategoriyalar"],
  ["📌 Majburiy to'lovlar", "💵 Kutilayotgan daromadlar"],
  ["🎯 Budjet", "💳 Qarzdorlik", "🏆 Maqsadlar"],
  ["🔔 Eslatmalar", "⚙️ Sozlamalar"],
  ["⬅️ Asosiy menyu"],
];

const mon = (n: number) => (n < 0 ? `-${compact(Math.abs(n))}` : compact(n));

export async function respondToBotMessage(
  user: User,
  message: string,
  confirm?: Record<string, unknown> | null,
): Promise<BotReply> {
  const text = message.trim();
  const intent = botIntent(text);
  const state = await buildAppState(user);

  if (confirm && (Array.isArray(confirm.drafts) || (confirm.amount && confirm.type))) {
    const items = Array.isArray(confirm.drafts)
      ? (confirm.drafts as Array<Record<string, unknown>>)
      : [confirm];
    let okCount = 0;
    let lastMessage = "";
    for (const item of items) {
      if (!item || !item.amount || !item.type) continue;
      const result = await quickAdd(user, `${item.amount} ${item.note ?? ""}`, item);
      if (result.ok) okCount += 1;
      lastMessage = result.message;
    }
    const after = await buildAppState(user);
    if (!okCount) return { text: `❌ ${lastMessage || "Operatsiyani saqlab bo'lmadi"}`, keyboard: MAIN_MENU };
    return {
      text: `✅ ${okCount > 1 ? `${okCount} ta operatsiya qayd etildi` : lastMessage}\n\n${summaryBlock(after)}`,
      keyboard: MAIN_MENU,
    };
  }

  if (intent === "start") {
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

  if (intent === "add-income") {
    return {
      text: "💰 Kirim summasi va manbasini yozing. Misol: „1,5 mln maosh keldi“.",
      keyboard: MAIN_MENU,
    };
  }
  if (intent === "add-expense") {
    return {
      text: "💸 Chiqim summasi va maqsadini yozing. Misol: „150 ming ovqatga ketdi“.",
      keyboard: MAIN_MENU,
    };
  }
  if (intent === "add-transfer") {
    return {
      text: "🔄 Summani va ikkala hisob nomini yozing. Misol: „Naqd puldan Humo hisobiga 200 ming o'tkazdim“.",
      keyboard: MAIN_MENU,
    };
  }

  if (intent === "report") {
    return { text: reportBlock(state), keyboard: MAIN_MENU };
  }
  if (intent === "forecast") {
    return { text: forecastBlock(state), keyboard: MAIN_MENU };
  }
  if (intent === "accounts") {
    return { text: accountsBlock(state), keyboard: MORE_MENU };
  }
  if (intent === "categories") {
    return { text: categoriesBlock(state), keyboard: MORE_MENU };
  }
  if (intent === "payments") {
    return { text: paymentsBlock(state), keyboard: MAIN_MENU };
  }
  if (intent === "income-plans") {
    return { text: incomeBlock(state), keyboard: MAIN_MENU };
  }
  if (intent === "budget") {
    return { text: budgetBlock(state), keyboard: MORE_MENU };
  }
  if (intent === "debts") {
    return { text: debtsBlock(state), keyboard: MORE_MENU };
  }
  if (intent === "goals") {
    return { text: goalsBlock(state), keyboard: MORE_MENU };
  }
  if (intent === "alerts") {
    return { text: alertsBlock(state), keyboard: MORE_MENU };
  }
  if (intent === "more-menu") {
    return {
      text: "📂 Qo'shimcha bo'limlar: hisoblar, kategoriyalar, budjet, qarzdorlik, maqsadlar va sozlamalar.",
      keyboard: MORE_MENU,
    };
  }
  if (intent === "main-menu") {
    return {
      text: "⬅️ Asosiy menyu. Operatsiyani tabiiy tilda yozing yoki tugmalardan foydalaning.",
      keyboard: MAIN_MENU,
    };
  }
  if (intent === "settings" || intent === "help") {
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
        "Buyruqlar:",
        "/start — asosiy menyu",
        "/report — bugun va oylik hisobot",
        "/forecast — reja, xavf va Safe-to-Spend",
        "/help — yordam",
        "",
        "Operatsiyani tabiiy tilda yozing:",
        "• „150 ming ovqatga ketdi“",
        "• „kecha 150 ming ovqat, 70 ming taksi“ — bitta xabarda bir nechta operatsiya",
        "• „15-avgust 500 ming ijara to'ladim“ — sana bilan",
        "",
        "Mini App tugmasi grafiklar va batafsil boshqaruvni ochadi.",
      ].join("\n"),
      keyboard: MAIN_MENU,
    };
  }

  const batch = parseDrafts(text);
  if (!batch.drafts.length) {
    return {
      text: "🤔 Summani tushunmadim. Misol: „150 ming ovqatga ketdi“ yoki „8 mln maosh keldi“.\nBir nechta operatsiyani vergul yoki yangi qator bilan ajratib yozishingiz mumkin.",
      keyboard: MAIN_MENU,
    };
  }

  const drafts: BotDraft[] = [];
  for (const draft of batch.drafts) {
    const transferAccounts = draft.type === "transfer" ? matchTransferAccounts(draft.note, state) : null;
    if (draft.type === "transfer" && !transferAccounts) {
      batch.failed.push(draft.note);
      continue;
    }
    drafts.push({
      type: draft.type,
      amount: draft.amount,
      minAmount: draft.minAmount,
      maxAmount: draft.maxAmount,
      categoryName: draft.categoryName,
      date: draft.date,
      note: draft.note,
      estimated: draft.estimated,
      confidence: draft.confidence,
      accountId: transferAccounts?.accountId,
      toAccountId: transferAccounts?.toAccountId,
    });
  }

  if (!drafts.length) {
    return {
      text: "Transfer uchun manba va qabul qiluvchi hisob nomlarini yozing. Misol: „Naqd puldan Humo hisobiga 200 ming o'tkazdim“.",
      keyboard: MAIN_MENU,
    };
  }

  const lines =
    drafts.length === 1
      ? [
          "Quyidagi operatsiyani topdim:",
          "",
          `Summa: ${formatAmount(drafts[0].amount ?? 0)}${drafts[0].estimated && drafts[0].minAmount && drafts[0].maxAmount ? ` (${formatAmount(drafts[0].minAmount)}–${formatAmount(drafts[0].maxAmount)})` : ""}`,
          `Turi: ${typeLabel(drafts[0].type)}`,
          `Kategoriya: ${drafts[0].categoryName ?? "aniqlanmadi"}`,
          `Sana: ${humanDate(drafts[0].date)}`,
        ]
      : [
          `${drafts.length} ta operatsiya topildi:`,
          "",
          ...drafts.map(
            (d, i) =>
              `${i + 1}. ${d.type === "income" ? "🟢" : d.type === "transfer" ? "🔄" : "🔴"} ${formatAmount(d.amount ?? 0)} — ${d.categoryName ?? typeLabel(d.type)}${d.date !== state.forecast.today ? ` (${shortDate(d.date)})` : ""}`,
          ),
          "",
          "Barchasini tasdiqlash yoki alohida tanlashingiz mumkin.",
        ];
  if (batch.failed.length) {
    lines.push("", `⚠️ Tushunilmagan qismlar: ${batch.failed.slice(0, 3).join("; ")}`);
  }

  return {
    text: lines.join("\n"),
    keyboard: [["✅ Ha, qo'sh", "❌ Bekor qilish"], ...MAIN_MENU],
    draft: drafts[0],
    drafts,
    failedSegments: batch.failed,
  };
}

function typeLabel(type: BotDraft["type"]): string {
  return type === "income" ? "Kirim" : type === "transfer" ? "Transfer" : "Chiqim";
}

function matchTransferAccounts(text: string, state: AppState): { accountId: number; toAccountId: number } | null {
  const normalized = text.toLocaleLowerCase("uz").replace(/[’‘]/g, "'");
  const matches = state.accounts
    .filter((account) => account.isActive)
    .map((account) => ({ account, index: normalized.indexOf(account.name.toLocaleLowerCase("uz")) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (matches.length < 2 || matches[0].account.id === matches[1].account.id) return null;
  return { accountId: matches[0].account.id, toAccountId: matches[1].account.id };
}

function summaryBlock(s: AppState): string {
  const f = s.forecast;
  const m = s.monthly?.find((x) => x.isCurrent);
  return [
    `💰 REAL BALANS: ${formatAmount(f.currentBalance)} so'm`,
    m ? `📅 ${m.label.toUpperCase()}` : "",
    m ? `💵 Kutilayotgan daromad: ${compact(m.expectedIncomeBase)}` : `💵 Kutilayotgan: ${compact(f.income.base)}`,
    m ? `📌 Majburiy: -${compact(m.mandatoryExpenseBase)}` : `📌 Majburiy: -${compact(f.expense.mandatoryBase)}`,
    `✨ Safe-to-Spend: ${formatAmount(Math.max(0, f.safeToSpend))} so'm`,
    `📊 Bu oy: +${mon(s.analytics.monthTotals.income)} / -${mon(s.analytics.monthTotals.expense)}`,
    m ? `🔮 Prognoz balans: ${formatAmount(m.forecastClosingBase)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
  const m = s.monthly?.find((x) => x.isCurrent);
  const lines = [
    `📅 Reja va prognoz (${f.horizonDays} kun)`,
    "",
    `REAL BALANS: ${mon(f.currentBalance)}`,
  ];
  if (m) {
    lines.push(
      `${m.label}:`,
      `  Ochilish: ${mon(m.openingBalance)}`,
      `  Kutilayotgan daromad: +${mon(m.expectedIncomeBase)}`,
      `  Majburiy to'lov: -${mon(m.mandatoryExpenseBase)}`,
      `  Ixtiyoriy reja: -${mon(m.optionalExpenseBase)}`,
      `  Prognoz yakun: ${mon(m.forecastClosingBase)}`,
      `  Eng past: ${mon(m.lowestProjected)} ${m.deficitDays ? `🔴 ${m.deficitDays} kun xavf` : ""}`,
    );
  }
  lines.push(
    "",
    `Kutilayotgan daromad (butun prognoz): ${mon(f.income.base)} (aniq ${mon(f.income.exactBase)}, taxminiy ${mon(f.income.estimatedBase)})`,
    `Rejalashtirilgan xarajat: ${mon(f.expense.base)} (majburiy ${mon(f.expense.mandatoryBase)})`,
    "",
    `Prognoz (konservativ): ${mon(f.scenarios.min.balance)}`,
    `Prognoz (bazaviy): ${mon(f.scenarios.base.balance)}`,
    `Prognoz (optimistik): ${mon(f.scenarios.max.balance)}`,
    "",
    `✨ Safe-to-Spend: ${mon(f.safeToSpend)}`,
    `  Hisob: ${mon(f.safeToSpendParts.balance)} + aniq ${mon(f.safeToSpendParts.confirmedIncome)} + taxminiy ${mon(f.safeToSpendParts.estimatedIncomeWeighted)} - to'lov ${mon(f.safeToSpendParts.mandatoryUpcoming)} - zaxira ${mon(f.safeToSpendParts.minReserve)}`,
    "",
  );
  if (f.riskDates.length) {
    const first = f.riskDates[0];
    lines.push(`🚨 Xavf: ${shortDate(first.date)} kuni ${first.cause} tufayli ${mon(first.deficit)} yetishmasligi`);
    if (first.recoveryDate) lines.push(`  Tuzalish: ${shortDate(first.recoveryDate)} kuni +${mon(first.recoveryAmount ?? 0)} kutilmoqda`);
  } else {
    lines.push("✅ Pul yetishmasligi xavfi aniqlanmadi");
  }
  return lines.join("\n");
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
      (p) => `${shortDate(p.date)} — ${p.name}: ${p.certainty === "estimated" ? `${mon(p.min)}–${mon(p.max)} (taxminiy)` : mon(p.base)}${p.mandatory ? " [majburiy]" : ""}`,
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
          (i) => `${shortDate(i.date)} — ${i.sourceName}: ${i.certainty === "estimated" ? `${mon(i.min)}–${mon(i.max)} (taxminiy)` : mon(i.base)}${i.received ? " ✅ qayd etilgan" : ""}`,
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
      (b) => `${b.categoryIcon} ${b.categoryName}: ${mon(b.spent)} / ${mon(b.amount)} — ${(b.usage * 100).toFixed(0)}%${b.status === "exceeded" ? " 🚨" : b.status === "warning" ? " ⚠️" : ""}`,
    ),
  ].join("\n");
}

function debtsBlock(s: AppState): string {
  const iOwe = s.debts.filter((d) => d.direction === "i_owe");
  const toMe = s.debts.filter((d) => d.direction === "owed_to_me");
  const fmt = (d: (typeof s.debts)[number]) => `• ${d.personName}: ${formatAmount(d.remainingAmount)} so'm qoldi${d.dueDate ? ` (${shortDate(d.dueDate)})` : ""}`;
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
