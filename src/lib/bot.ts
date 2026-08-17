import type { User } from "@/db/schema";
import { buildAppState } from "./state";
import { quickAdd } from "./mutations";
import { parseDrafts } from "./nlp";
import { isPaymentScheduleCandidate, parsePaymentSchedule, type PaymentSchedule } from "./payment-schedule-parser";
import { creditSchedulesMatch } from "./installments";
import { compact, formatAmount, humanDate, parseISO, shortDate, UZ_MONTHS } from "./money";
import type { AppState } from "./types";
import { botIntent } from "./bot-routing";
import { TERMS, TX_LABEL } from "./copy";

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
  schedule?: PaymentSchedule;
};

/**
 * Telegram main keyboard per spec — the three core finance actions only.
 * Every deeper section (Hisobot, Reja, Hisoblar, Budjet, Qarzdorlik,
 * Maqsadlar, Eslatmalar, Sozlamalar, …) keeps working: the text routing in
 * bot-routing.ts is untouched, so typed messages, legacy pinned keyboards
 * and the Mini App console still resolve to the same intents.
 */
export const MAIN_MENU: string[][] = [["💰 Daromad", "💸 Xarajat", "🔄 Transfer"]];

/**
 * Deep-section keyboard, still used when an old flow is reached by text.
 * Not part of the main keyboard; removal is a separate product decision.
 */
export const MORE_MENU: string[][] = [
  ["💳 Hisoblar", "📁 Kategoriyalar"],
  ["📌 To‘lovlar", "💵 Kutilayotgan daromad"],
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
    if (!okCount) return { text: `❌ ${lastMessage || "Operatsiyani saqlab bo'lmadi. Qayta urinib ko'ring."}`, keyboard: MAIN_MENU };
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
        "Daromad, xarajat va transferni tabiiy tilda yozing:",
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
      text: "💰 Daromad summasi va manbasini yozing. Misol: „1,5 mln maosh keldi“.",
      keyboard: MAIN_MENU,
    };
  }
  if (intent === "add-expense") {
    return {
      text: "💸 Xarajat summasi va maqsadini yozing. Misol: „150 ming ovqatga ketdi“.",
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
      text: "📂 Qo'shimcha bo'limlar.",
      keyboard: MORE_MENU,
    };
  }
  if (intent === "main-menu") {
    return {
      text: "⬅️ Asosiy menyu.",
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
        "/forecast — reja, xavf va sarflash mumkin bo'lgan summa",
        "/help — yordam",
        "",
        "Operatsiyani tabiiy tilda yozing:",
        "• „150 ming ovqatga ketdi“",
        "• „kecha 150 ming ovqat, 70 ming taksi“ — bitta xabarda bir nechta operatsiya",
        "• „15-avgust 500 ming ijara to'ladim“ — sana bilan",
        "",
        "Mini App tugmasi to'liq boshqaruvni ochadi.",
      ].join("\n"),
      keyboard: MAIN_MENU,
    };
  }

  // Payment schedule detection — must run before normal transaction parsing
  // so a single credit message with many installments is not split into
  // independent expenses.
  if (isPaymentScheduleCandidate(text)) {
    const parsed = parsePaymentSchedule(text, state.forecast.today ?? state.forecast.today);
    if (parsed.ok && parsed.schedule && parsed.schedule.items.length >= 2) {
      const total = parsed.schedule.totalAmount;
      const scheduleDateLabel = (iso: string) => {
        const d = parseISO(iso);
        return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]}`;
      };
      // §17 duplicate protection: warn (never silently merge) when an active
      // credit plan with the same merchant and the same (date, amount) set
      // already exists. The user still explicitly confirms to proceed.
      const duplicateActive = state.recurring.some(
        (p) =>
          p.status === "active" &&
          p.planType === "term" &&
          p.installments !== null &&
          p.installments !== undefined &&
          creditSchedulesMatch(
            p.name,
            p.installments.map((i) => ({ date: i.date, amount: i.amount })),
            parsed.schedule!.name,
            parsed.schedule!.items.map((i) => ({ date: i.date, amount: i.amount })),
          ),
      );
      const lines = [
        "📋 Kredit jadvali",
        "",
        parsed.schedule.name,
        "",
        ...parsed.schedule.items.map((it, idx) => `${idx + 1}. ${scheduleDateLabel(it.date)} — ${formatAmount(it.amount)} so'm`),
        "",
        `${parsed.schedule.items.length} ta to'lov · jami ${formatAmount(total)} so'm`,
      ];
      if (duplicateActive) {
        lines.push("", "⚠️ Shunga o'xshash faol kredit rejasi mavjud.");
      }
      return {
        text: lines.join("\n"),
        keyboard: [["✅ Hammasini qo‘shish", "❌ Bekor qilish"], ...MAIN_MENU],
        schedule: parsed.schedule,
      };
    }
    if (parsed.schedule && parsed.schedule.items.length === 1) {
      return {
        text: "1 ta to‘lov topildi. Bu kredit rejasimi yoki oddiy to‘lovmi? Agar kredit jadvali bo‘lsa, to‘liq jadvalni yuboring.",
        keyboard: MAIN_MENU,
      };
    }
    if (parsed.errors.length) {
      return {
        text: `⚠️ Kredit jadvalida xatolik:\n${parsed.errors.slice(0, 3).join("\n")}\nQayta tekshirib yuboring.`,
        keyboard: MAIN_MENU,
      };
    }
  }

  const batch = parseDrafts(text);
  if (!batch.drafts.length) {
    return {
      text: "🤔 Summani tushunmadim. Misol: „150 ming ovqatga ketdi“.\nBir nechta operatsiyani vergul bilan ajrating.",
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
          "Tasdiqlash yoki alohida tanlash mumkin.",
        ];
  if (batch.failed.length) {
    lines.push("", `⚠️ Tushunilmadi: ${batch.failed.slice(0, 3).join("; ")}`);
  }

  return {
    text: lines.join("\n"),
    keyboard: [["✅ Tasdiqlash", "❌ Bekor qilish"], ...MAIN_MENU],
    draft: drafts[0],
    drafts,
    failedSegments: batch.failed,
  };
}

function typeLabel(type: BotDraft["type"]): string {
  return TX_LABEL[type];
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
    `💰 ${TERMS.balance}: ${formatAmount(f.currentBalance)} so'm`,
    m ? `📅 ${m.label.toUpperCase()}` : "",
    `💵 ${TERMS.expectedIncome}: ${formatAmount(m ? m.expectedIncomeBase : f.income.base)}`,
    `📌 Majburiy: -${formatAmount(m ? m.mandatoryExpenseBase : f.expense.mandatoryBase)}`,
    `✨ ${TERMS.safeToSpend}: ${formatAmount(f.safeToSpend)}${f.safeToSpend < 0 ? " (yetishmayapti)" : ""}`,
    `📊 ${TERMS.income} +${formatAmount(s.analytics.monthTotals.income)} / ${TERMS.expense} -${formatAmount(s.analytics.monthTotals.expense)}`,
    m ? `🔮 ${TERMS.forecast}: ${formatAmount(m.forecastClosingBase)}` : "",
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
    `• Daromad: ${mon(a.today.income)} so'm`,
    `• Xarajat: ${mon(a.today.expense)} so'm`,
    `• Sof: ${mon(a.today.net)} so'm`,
    "",
    `Bu oy (${a.month})`,
    `• Daromad: ${mon(a.monthTotals.income)}`,
    `• Xarajat: ${mon(a.monthTotals.expense)}`,
    `• Sof: ${mon(a.monthTotals.net)}`,
    `• Kunlik o'rtacha xarajat: ${mon(a.monthTotals.avgDaily)}`,
    `• Jamg'arish ulushi: ${(a.monthTotals.savingsRate * 100).toFixed(0)}%`,
    "",
    a.topCategory ? `Eng katta kategoriya: ${a.topCategory.name} — ${mon(a.topCategory.amount)} (${(a.topCategory.share * 100).toFixed(0)}%)` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function forecastBlock(s: AppState): string {
  const f = s.forecast;
  const m = s.monthly?.find((x) => x.isCurrent);
  const lines = [
    `📅 ${TERMS.plan} · ${TERMS.forecast} (${f.horizonDays} kun)`,
    "",
    `${TERMS.balance}: ${mon(f.currentBalance)}`,
  ];
  if (m) {
    lines.push(
      `${m.label}:`,
      `  Ochilish: ${mon(m.openingBalance)}`,
      `  ${TERMS.expectedIncome}: +${mon(m.expectedIncomeBase)}`,
      `  Majburiy to'lov: -${mon(m.mandatoryExpenseBase)}`,
      `  Ixtiyoriy reja: ${m.optionalExpenseBase ? `-${mon(m.optionalExpenseBase)}` : "0"}`,
      `  ${TERMS.forecast}: ${mon(m.forecastClosingBase)}`,
      `  Eng past: ${mon(m.lowestProjected)}${m.deficitDays ? ` 🔴 ${m.deficitDays} kun xavf` : ""}`,
    );
  }
  lines.push(
    "",
    `${TERMS.expectedIncome}: ${mon(f.income.base)} (aniq ${mon(f.income.exactBase)}, taxminiy ${mon(f.income.estimatedBase)})`,
    `Rejalashtirilgan xarajat: ${mon(f.expense.base)} (majburiy ${mon(f.expense.mandatoryBase)})`,
    "",
    `${TERMS.forecast} (past): ${mon(f.scenarios.min.balance)}`,
    `${TERMS.forecast} (o'rta): ${mon(f.scenarios.base.balance)}`,
    `${TERMS.forecast} (yuqori): ${mon(f.scenarios.max.balance)}`,
    "",
    `✨ ${TERMS.safeToSpend}: ${mon(f.safeToSpend)}`,
    `  Hisob: ${mon(f.safeToSpendParts.balance)} + aniq ${mon(f.safeToSpendParts.confirmedIncome)} + taxminiy ${mon(f.safeToSpendParts.estimatedIncomeWeighted)} - to'lov ${mon(f.safeToSpendParts.mandatoryUpcoming)} - zaxira ${mon(f.safeToSpendParts.minReserve)}`,
    "",
  );
  if (f.riskDates.length) {
    const first = f.riskDates[0];
    lines.push(`🚨 Xavf: ${shortDate(first.date)} kuni ${first.cause} tufayli ${mon(first.deficit)} yetishmaydi`);
    if (first.recoveryDate) lines.push(`  Tiklanish: ${shortDate(first.recoveryDate)} kuni +${mon(first.recoveryAmount ?? 0)}`);
  } else {
    lines.push("✅ Xavf aniqlanmadi");
  }
  return lines.join("\n");
}

function accountsBlock(s: AppState): string {
  // "Jami" must be the SAME number the Mini App dashboard shows as REAL
  // BALANCE: active accounts only. Archived accounts are listed, but their
  // money is reported separately instead of being folded into a total that
  // no other surface agrees with.
  const archived = s.accounts.filter((a) => !a.isActive && Math.round(a.currentBalance) !== 0);
  return [
    "💳 Hisoblar",
    "",
    ...s.accounts.map((a) => `${a.isActive ? "•" : "○"} ${a.name}: ${formatAmount(a.currentBalance)} so'm`),
    "",
    `${TERMS.total} (faol hisoblar): ${formatAmount(s.forecast.currentBalance)} so'm`,
    ...(archived.length
      ? [`⚠️ Arxiv hisoblarda: ${formatAmount(archived.reduce((t, a) => t + a.currentBalance, 0))} so'm — balansga kirmaydi`]
      : []),
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
  if (!f.upcomingPayments.length) return "📌 Rejalashtirilgan to'lovlar yo'q.";
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
    `💵 ${TERMS.expectedIncome}`,
    "",
    ...(f.upcomingIncome.length
      ? f.upcomingIncome.map(
          (i) => `${shortDate(i.date)} — ${i.sourceName}: ${i.certainty === "estimated" ? `${mon(i.min)}–${mon(i.max)} (taxminiy)` : mon(i.base)}${i.received ? " ✅ qayd etilgan" : ""}`,
        )
      : ["Daromadlar hali kiritilmagan."]),
  ].join("\n");
}

function budgetBlock(s: AppState): string {
  if (!s.budgets.length) return "🎯 Budjetlar yo'q.";
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
    `${TERMS.net}: ${formatAmount(toMe.reduce((t, d) => t + d.remainingAmount, 0) - iOwe.reduce((t, d) => t + d.remainingAmount, 0))} so'm`,
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
  if (!s.alerts.length) return "🔔 Eslatmalar yo'q.";
  const icons: Record<string, string> = { info: "🔔", warning: "⚠️", critical: "🚨", success: "✅" };
  return ["🔔 Eslatmalar", "", ...s.alerts.map((a) => `${icons[a.severity]} ${a.title}\n${a.body}`)].join("\n");
}
