import type { User } from "@/db/schema";
import { buildAppState } from "./state";
import { quickAdd } from "./mutations";
import { parseDrafts } from "./nlp";
import { isPaymentScheduleCandidate, parsePaymentSchedule, type PaymentSchedule } from "./payment-schedule-parser";
import { creditSchedulesMatch } from "./installments";
import { CREDIT_COMMAND_HELP, parseCreditCommand } from "./credit-import";
import { compact, formatAmount, parseISO, shortDate, UZ_MONTHS } from "./money";
import type { AppState } from "./types";
import { botIntent } from "./bot-routing";
import { TERMS } from "./copy";
import {
  ACK,
  batchSummary,
  BUTTON,
  draftSummary,
  NOT_UNDERSTOOD,
  SCHEDULE,
  settingsBlock,
  TRANSFER_NEEDS_ACCOUNTS,
} from "./bot-copy";
import { botLocaleCopy } from "./bot-i18n";

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
  // Keep reply keyboards and the primary bot journey aligned with the Mini
  // App preference. Callback payloads remain language-neutral identifiers.
  const localized = botLocaleCopy(user.locale);
  const MAIN_MENU = localized.mainMenu;
  const MORE_MENU = localized.moreMenu;
  const PROMPT = localized.prompts;
  const HELP = localized.help;
  const MAIN_MENU_TEXT = localized.mainMenuText;
  const MORE_MENU_TEXT = localized.moreMenuText;

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
    if (!okCount) return { text: ACK.failed(lastMessage || "Saqlanmadi. Qayta urinib ko‘ring"), keyboard: MAIN_MENU };
    return {
      text: `${okCount > 1 ? ACK.savedCount(okCount) : ACK.saved(lastMessage)}\n\n${balanceLine(after)}`,
      keyboard: MAIN_MENU,
    };
  }

  if (intent === "start") {
    // A brand-new account has nothing but zeroes; showing them as a welcome
    // teaches the user nothing. Numbers appear only once they exist.
    const isNew = state.transactions.length === 0;
    return {
      text: isNew
        ? localized.startNew(user.firstName)
        : localized.startReturning({
            firstName: user.firstName,
            balance: state.forecast.currentBalance,
            monthIncome: state.analytics.monthTotals.income,
            monthExpense: state.analytics.monthTotals.expense,
          }),
      keyboard: MAIN_MENU,
    };
  }

  if (intent === "add-income") {
    return {
      text: PROMPT.income,
      keyboard: MAIN_MENU,
    };
  }
  if (intent === "add-expense") {
    return {
      text: PROMPT.expense,
      keyboard: MAIN_MENU,
    };
  }
  if (intent === "add-transfer") {
    return {
      text: PROMPT.transfer,
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
      text: MORE_MENU_TEXT,
      keyboard: MORE_MENU,
    };
  }
  if (intent === "main-menu") {
    return {
      text: MAIN_MENU_TEXT,
      keyboard: MAIN_MENU,
    };
  }
  if (intent === "help") {
    return { text: HELP, keyboard: MAIN_MENU };
  }
  if (intent === "credit") {
    const parsedCredit = parseCreditCommand(text);
    if (parsedCredit.error) return { text: `⚠️ ${parsedCredit.error}\n\n${CREDIT_COMMAND_HELP}`, keyboard: MAIN_MENU };
    if (!parsedCredit.schedule) return { text: CREDIT_COMMAND_HELP, keyboard: MAIN_MENU };
    const schedule = parsedCredit.schedule;
    const principal = schedule.items.reduce((sum, item) => sum + (item.principalAmount ?? 0), 0);
    const interest = schedule.items.reduce((sum, item) => sum + (item.interestAmount ?? 0) + (item.feeAmount ?? 0), 0);
    const itemLines = schedule.items.map((item, index) => {
      const fees = (item.interestAmount ?? 0) + (item.feeAmount ?? 0);
      return `${index + 1}. ${shortDate(item.date)} — ${formatAmount(item.amount)} so‘m\n   asosiy ${formatAmount(item.principalAmount ?? 0)} · foiz/komissiya ${formatAmount(fees)}`;
    });
    return {
      text: [SCHEDULE.title, "", schedule.name, "", ...itemLines, "", `Asosiy qism: ${formatAmount(principal)} so‘m`, `Foiz va komissiya: ${formatAmount(interest)} so‘m`, "", SCHEDULE.confirmHint].join("\n"),
      keyboard: [[BUTTON.confirmAll, BUTTON.cancel], ...MAIN_MENU],
      schedule,
    };
  }
  if (intent === "settings") {
    return {
      text: settingsBlock({
        currency: state.user.currency,
        minReserve: mon(state.user.minReserve),
        estimatedIncomeConfidence: state.user.estimatedIncomeConfidence,
        notifyPayments: state.user.notifyPayments,
        notifyIncome: state.user.notifyIncome,
        notifyBudget: state.user.notifyBudget,
        notifyRisk: state.user.notifyRisk,
      }),
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
        SCHEDULE.title,
        "",
        parsed.schedule.name,
        "",
        ...parsed.schedule.items.map((it, idx) => `${idx + 1}. ${scheduleDateLabel(it.date)} — ${formatAmount(it.amount)} so‘m`),
        "",
        SCHEDULE.total(parsed.schedule.items.length, total),
      ];
      if (duplicateActive) lines.push("", SCHEDULE.duplicate);
      lines.push("", SCHEDULE.confirmHint);
      return {
        text: lines.join("\n"),
        keyboard: [[BUTTON.confirmAll, BUTTON.cancel], ...MAIN_MENU],
        schedule: parsed.schedule,
      };
    }
    if (parsed.schedule && parsed.schedule.items.length === 1) {
      return {
        text: SCHEDULE.single,
        keyboard: MAIN_MENU,
      };
    }
    if (parsed.errors.length) {
      return {
        text: SCHEDULE.invalid(parsed.errors),
        keyboard: MAIN_MENU,
      };
    }
  }

  const batch = parseDrafts(text);
  if (!batch.drafts.length) {
    return {
      text: NOT_UNDERSTOOD,
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
      text: TRANSFER_NEEDS_ACCOUNTS,
      keyboard: MAIN_MENU,
    };
  }

  const summaryText = drafts.length === 1 ? draftSummary(drafts[0]) : batchSummary(drafts, batch.failed);

  return {
    text: summaryText,
    keyboard: [[BUTTON.confirm, BUTTON.cancel], ...MAIN_MENU],
    draft: drafts[0],
    drafts,
    failedSegments: batch.failed,
  };
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

/**
 * Post-action feedback: the ONE number a user checks after saving. The full
 * picture stays one tap away in the Mini App instead of being pasted after
 * every confirmation.
 */
function balanceLine(s: AppState): string {
  return `💰 ${TERMS.balance}: ${formatAmount(s.forecast.currentBalance)} so‘m`;
}

function reportBlock(s: AppState): string {
  const a = s.analytics;
  return [
    "📊 Hisobot",
    "",
    "Bugun",
    `• Daromad: ${mon(a.today.income)} so‘m`,
    `• Xarajat: ${mon(a.today.expense)} so‘m`,
    `• Sof: ${mon(a.today.net)} so‘m`,
    "",
    `Bu oy (${a.month})`,
    `• Daromad: ${mon(a.monthTotals.income)}`,
    `• Xarajat: ${mon(a.monthTotals.expense)}`,
    `• Sof: ${mon(a.monthTotals.net)}`,
    `• Kunlik o‘rtacha xarajat: ${mon(a.monthTotals.avgDaily)}`,
    `• Jamg‘arish ulushi: ${(a.monthTotals.savingsRate * 100).toFixed(0)}%`,
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
      `  Majburiy to‘lov: -${mon(m.mandatoryExpenseBase)}`,
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
    `${TERMS.forecast} (o‘rta): ${mon(f.scenarios.base.balance)}`,
    `${TERMS.forecast} (yuqori): ${mon(f.scenarios.max.balance)}`,
    "",
    `✨ ${TERMS.safeToSpend}: ${mon(f.safeToSpend)}`,
    `  Hisob: ${mon(f.safeToSpendParts.balance)} + aniq ${mon(f.safeToSpendParts.confirmedIncome)} + taxminiy ${mon(f.safeToSpendParts.estimatedIncomeWeighted)} - to‘lov ${mon(f.safeToSpendParts.mandatoryUpcoming)} - zaxira ${mon(f.safeToSpendParts.minReserve)}`,
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
    ...s.accounts.map((a) => `${a.isActive ? "•" : "○"} ${a.name}: ${formatAmount(a.currentBalance)} so‘m`),
    "",
    `${TERMS.total} (faol hisoblar): ${formatAmount(s.forecast.currentBalance)} so‘m`,
    ...(archived.length
      ? [`⚠️ Arxiv hisoblarda: ${formatAmount(archived.reduce((t, a) => t + a.currentBalance, 0))} so‘m — balansga kirmaydi`]
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
  if (!f.upcomingPayments.length) return "📌 Rejalashtirilgan to‘lovlar yo‘q.";
  return [
    "📌 Yaqin to‘lovlar",
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
  if (!s.budgets.length) return "🎯 Budjetlar yo‘q.";
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
  const fmt = (d: (typeof s.debts)[number]) => `• ${d.personName}: ${formatAmount(d.remainingAmount)} so‘m qoldi${d.dueDate ? ` (${shortDate(d.dueDate)})` : ""}`;
  return [
    "📋 Qarzdorlik",
    "",
    "Men qarzdorman:",
    ...(iOwe.length ? iOwe.map(fmt) : ["—"]),
    "",
    "Menga qarzdor:",
    ...(toMe.length ? toMe.map(fmt) : ["—"]),
    "",
    `${TERMS.net}: ${formatAmount(toMe.reduce((t, d) => t + d.remainingAmount, 0) - iOwe.reduce((t, d) => t + d.remainingAmount, 0))} so‘m`,
  ].join("\n");
}

function goalsBlock(s: AppState): string {
  if (!s.goals.length) return "🏆 Maqsadlar yo‘q.";
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
  if (!s.alerts.length) return "🔔 Eslatmalar yo‘q.";
  const icons: Record<string, string> = { info: "🔔", warning: "⚠️", critical: "🚨", success: "✅" };
  return ["🔔 Eslatmalar", "", ...s.alerts.map((a) => `${icons[a.severity]} ${a.title}\n${a.body}`)].join("\n");
}
