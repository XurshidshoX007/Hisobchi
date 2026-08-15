import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  budgets,
  categories,
  debtPayments,
  debts,
  expectedIncomes,
  goalContributions,
  goals,
  notifications,
  recurringExpenses,
  transactions,
  type SessionUserLike,
} from "./schema-types";
import {
  buildAnalytics,
  buildForecast,
  buildHealth,
  rangeValue,
  type AccountView,
  type BudgetView,
  type CategoryView,
  type DebtView,
  type ExpectedIncomeView,
  type GoalView,
  type RecurringView,
  type TxView,
} from "./finance";
import { addDays, dayDiff, monthKey, monthStart, round2, todayISO } from "./money";
import type { AppState, LiveAlert, UserView } from "./types";

const HISTORY_DAYS = 190;

export async function buildAppState(user: SessionUserLike): Promise<AppState> {
  const today = todayISO();
  const historyFrom = addDays(today, -HISTORY_DAYS);
  const thisMonth = monthKey(today);

  const [accountRows, categoryRows, txRows, recurringRows, incomeRows, budgetRows, debtRows, goalRows, notificationRows] =
    await Promise.all([
      db.select().from(accounts).where(eq(accounts.userId, user.id)).orderBy(accounts.sortOrder, accounts.id),
      db.select().from(categories).where(eq(categories.userId, user.id)).orderBy(categories.sortOrder, categories.id),
      db
        .select()
        .from(transactions)
        .where(and(eq(transactions.userId, user.id), gte(transactions.date, historyFrom)))
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(600),
      db.select().from(recurringExpenses).where(eq(recurringExpenses.userId, user.id)),
      db.select().from(expectedIncomes).where(eq(expectedIncomes.userId, user.id)),
      db
        .select()
        .from(budgets)
        .where(and(eq(budgets.userId, user.id), eq(budgets.month, thisMonth), eq(budgets.isDeleted, false))),
      db.select().from(debts).where(and(eq(debts.userId, user.id), eq(debts.isDeleted, false))),
      db.select().from(goals).where(eq(goals.userId, user.id)),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(25),
    ]);

  const accountNames = new Map(accountRows.map((a) => [a.id, a.name]));
  const catById = new Map(categoryRows.map((c) => [c.id, c]));

  /* ---- balances (full history, SQL aggregated) ---- */
  const balanceRows = await db
    .select({
      accountId: transactions.accountId,
      inflow: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      outflow: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
      transferOut: sql<number>`coalesce(sum(case when ${transactions.type} = 'transfer' then ${transactions.amount} else 0 end), 0)`,
      transferIn: sql<number>`coalesce(sum(case when ${transactions.type} = 'transfer' and ${transactions.toAccountId} = ${transactions.accountId} then 0 else 0 end), 0)`,
      txCount: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, user.id), eq(transactions.isDeleted, false)))
    .groupBy(transactions.accountId);

  const transferInRows = await db
    .select({ toAccountId: transactions.toAccountId, total: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.userId, user.id), eq(transactions.type, "transfer"), eq(transactions.isDeleted, false)))
    .groupBy(transactions.toAccountId);

  const balanceByAccount = new Map<number, { inflow: number; outflow: number; transferOut: number; transferIn: number; txCount: number }>();
  for (const row of balanceRows) {
    balanceByAccount.set(Number(row.accountId), {
      inflow: Number(row.inflow),
      outflow: Number(row.outflow),
      transferOut: Number(row.transferOut),
      transferIn: 0,
      txCount: Number(row.txCount),
    });
  }
  for (const row of transferInRows) {
    if (row.toAccountId === null) continue;
    const cur = balanceByAccount.get(Number(row.toAccountId)) ?? { inflow: 0, outflow: 0, transferOut: 0, transferIn: 0, txCount: 0 };
    cur.transferIn = Number(row.total);
    balanceByAccount.set(Number(row.toAccountId), cur);
  }

  const accountViews: AccountView[] = accountRows.map((a) => {
    const agg = balanceByAccount.get(a.id) ?? { inflow: 0, outflow: 0, transferOut: 0, transferIn: 0, txCount: 0 };
    const currentBalance =
      a.initialBalance + agg.inflow - agg.outflow + agg.transferIn - agg.transferOut;
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      initialBalance: a.initialBalance,
      currentBalance: round2(currentBalance),
      isActive: a.isActive,
      inflow: round2(agg.inflow),
      outflow: round2(agg.outflow),
      txCount: agg.txCount,
    };
  });

  const currentBalance = accountViews.filter((a) => a.isActive).reduce((s, a) => s + a.currentBalance, 0);

  /* ---- categories tree ---- */
  const catViews: CategoryView[] = categoryRows.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    type: c.type === "income" ? "income" : "expense",
    icon: c.icon,
    isEssential: c.isEssential,
    isActive: c.isActive,
    isSystem: c.isSystem,
    children: [],
  }));
  const byId = new Map(catViews.map((c) => [c.id, c]));
  const tree: CategoryView[] = [];
  for (const c of catViews) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.children.push(c);
    else tree.push(c);
  }

  /* ---- transactions view ---- */
  const txViews: TxView[] = txRows
    .filter((t) => !t.isDeleted)
    .map((t) => ({
      id: t.id,
      accountId: t.accountId,
      accountName: accountNames.get(t.accountId) ?? "—",
      toAccountId: t.toAccountId,
      toAccountName: t.toAccountId ? accountNames.get(t.toAccountId) ?? null : null,
      categoryId: t.categoryId,
      categoryName: t.categoryId ? catById.get(t.categoryId)?.name ?? null : null,
      categoryIcon: t.categoryId ? catById.get(t.categoryId)?.icon ?? "•" : "↔",
      type: (t.type as TxView["type"]) ?? "expense",
      amount: t.amount,
      date: t.date,
      note: t.note,
      source: t.source,
      recurringId: t.recurringId,
      expectedIncomeId: t.expectedIncomeId,
      isDeleted: false,
    }));

  /* ---- recurring ---- */
  const recurringViews: RecurringView[] = recurringRows.map((r) => {
    const { base } = rangeValue(r.amount, r.minAmount, r.maxAmount);
    const daysLeft = dayDiff(today, r.nextDueDate);
    const paidThisMonth = txViews.some(
      (t) => t.recurringId === r.id && t.date.startsWith(thisMonth),
    );
    return {
      id: r.id,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.categoryId ? catById.get(r.categoryId)?.name ?? null : null,
      accountId: r.accountId,
      amount: r.amount,
      minAmount: r.minAmount,
      maxAmount: r.maxAmount,
      baseAmount: round2(base),
      dueDay: r.dueDay,
      frequency: r.frequency,
      isMandatory: r.isMandatory,
      certainty: r.certainty === "estimated" ? "estimated" : "exact",
      nextDueDate: r.nextDueDate,
      reminderDaysBefore: r.reminderDaysBefore,
      isActive: r.isActive,
      daysLeft,
      paidThisMonth,
      yearlyTotal: round2(r.frequency === "yearly" ? base : base * 12),
    };
  });

  /* ---- expected incomes ---- */
  const incomeViews: ExpectedIncomeView[] = incomeRows.map((i) => {
    const { base } = rangeValue(i.amount, i.minAmount, i.maxAmount);
    // A category/amount heuristic marks unrelated income as received (especially
    // when categoryId is null). The explicit FK is the source of truth.
    const linkedTransaction = txViews.find(
      (t) =>
        t.type === "income" &&
        t.expectedIncomeId === i.id &&
        (i.frequency === "once" || t.date.startsWith(thisMonth)),
    );
    const received = Boolean(linkedTransaction);
    return {
      id: i.id,
      sourceName: i.sourceName,
      amount: i.amount,
      minAmount: i.minAmount,
      maxAmount: i.maxAmount,
      baseAmount: round2(base),
      expectedDate: i.expectedDate,
      frequency: i.frequency,
      certainty: i.certainty === "estimated" ? "estimated" : "exact",
      isActive: i.isActive,
      note: i.note,
      accountId: i.accountId,
      categoryId: i.categoryId,
      received,
      daysLeft: dayDiff(today, i.expectedDate),
      linkedTransactionId: linkedTransaction?.id ?? null,
    };
  });

  /* ---- budgets ---- */
  const monthSpendByCat = new Map<number, number>();
  let monthExpenseTotal = 0;
  for (const t of txViews) {
    if (t.type !== "expense" || !t.date.startsWith(thisMonth)) continue;
    monthExpenseTotal += t.amount;
    if (t.categoryId) monthSpendByCat.set(t.categoryId, (monthSpendByCat.get(t.categoryId) ?? 0) + t.amount);
  }
  const budgetViews: BudgetView[] = budgetRows
    .map((b) => {
      const spent = b.categoryId === null ? monthExpenseTotal : monthSpendByCat.get(b.categoryId) ?? 0;
      const usage = b.amount > 0 ? spent / b.amount : 0;
      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.categoryId ? catById.get(b.categoryId)?.name ?? "Umumiy" : "Umumiy oylik",
        categoryIcon: b.categoryId ? catById.get(b.categoryId)?.icon ?? "◎" : "◎",
        month: b.month,
        amount: b.amount,
        spent: round2(spent),
        usage,
        status: (usage >= 1 ? "exceeded" : usage >= 0.8 ? "warning" : "normal") as BudgetView["status"],
      };
    })
    .sort((a, b) => b.usage - a.usage);

  /* ---- debts ---- */
  const debtIds = debtRows.map((d) => d.id);
  const paymentRows = debtIds.length
    ? await db.select().from(debtPayments).where(inArray(debtPayments.debtId, debtIds)).orderBy(desc(debtPayments.date))
    : [];
  const debtViews: DebtView[] = debtRows.map((d) => {
    const payments = paymentRows
      .filter((p) => p.debtId === d.id)
      .map((p) => ({ id: p.id, amount: p.amount, date: p.date, note: p.note }));
    return {
      id: d.id,
      direction: d.direction === "owed_to_me" ? "owed_to_me" : "i_owe",
      personName: d.personName,
      amount: d.amount,
      remainingAmount: d.remainingAmount,
      paidAmount: round2(d.amount - d.remainingAmount),
      dueDate: d.dueDate,
      note: d.note,
      status: d.status,
      daysLeft: d.dueDate ? dayDiff(today, d.dueDate) : null,
      progress: d.amount > 0 ? (d.amount - d.remainingAmount) / d.amount : 0,
      payments,
    };
  });

  /* ---- goals ---- */
  const goalIds = goalRows.map((g) => g.id);
  const contributionRows = goalIds.length
    ? await db.select().from(goalContributions).where(inArray(goalContributions.goalId, goalIds))
    : [];
  void contributionRows;
  const goalViews: GoalView[] = goalRows.map((g) => {
    const remaining = Math.max(0, g.targetAmount - g.savedAmount);
    const monthsLeft = g.targetDate ? Math.max(0, Math.round(dayDiff(today, g.targetDate) / 30)) : null;
    const requiredMonthly = monthsLeft && monthsLeft > 0 ? remaining / monthsLeft : remaining;
    const etaDate =
      g.monthlyContribution > 0 && remaining > 0
        ? addDays(today, Math.ceil(remaining / g.monthlyContribution) * 30)
        : null;
    return {
      id: g.id,
      name: g.name,
      icon: g.icon,
      targetAmount: g.targetAmount,
      savedAmount: g.savedAmount,
      remaining: round2(remaining),
      progress: g.targetAmount > 0 ? g.savedAmount / g.targetAmount : 0,
      targetDate: g.targetDate,
      monthlyContribution: g.monthlyContribution,
      requiredMonthly: round2(requiredMonthly),
      monthsLeft,
      etaDate,
      onTrack: g.monthlyContribution >= requiredMonthly * 0.95 || remaining === 0,
      status: g.status,
    };
  });

  /* ---- forecast / analytics / health ---- */
  const recurringBase = recurringViews.filter((r) => r.isActive).reduce((s, r) => s + r.baseAmount, 0);
  const forecast = buildForecast({
    currentBalance,
    recurring: recurringRows,
    incomes: incomeRows.map((i) => ({
      ...i,
      linkedTransactionId: incomeViews.find((v) => v.id === i.id)?.linkedTransactionId ?? null,
    })),
    minReserve: user.minReserve,
    estimatedConfidence: user.estimatedIncomeConfidence,
    today,
    horizonDays: 35,
  });

  const analytics = buildAnalytics({
    transactions: txRows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      date: t.date,
      categoryId: t.categoryId,
      note: t.note,
      isDeleted: t.isDeleted,
    })),
    categories: categoryRows.map((c) => ({ id: c.id, name: c.name, icon: c.icon, isEssential: c.isEssential })),
    recurringBase,
    currentBalance,
    today,
  });

  const health = buildHealth({
    analytics,
    forecast,
    debtsOwedByMe: debtViews.filter((d) => d.direction === "i_owe").reduce((s, d) => s + d.remainingAmount, 0),
    debtsToMe: debtViews.filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + d.remainingAmount, 0),
  });

  /* ---- live alerts (derived, never stored) ---- */
  const alerts: LiveAlert[] = [];
  for (const p of forecast.upcomingPayments) {
    if (p.daysLeft < 0) {
      alerts.push({
        id: `pay-overdue-${p.id}`,
        type: "payment",
        severity: "critical",
        title: `${p.name} kechikkan`,
        body: `${p.name} to'lovi ${Math.abs(p.daysLeft)} kun kechikdi — ${formatRange(p)}`,
        refDate: p.date,
        amount: p.base,
      });
    } else if (p.daysLeft <= 3) {
      alerts.push({
        id: `pay-${p.id}`,
        type: "payment",
        severity: p.daysLeft === 0 ? "warning" : "info",
        title: p.daysLeft === 0 ? `Bugun to'lov: ${p.name}` : `${p.daysLeft} kundan keyin to'lov`,
        body: `${p.name} — ${formatRange(p)}`,
        refDate: p.date,
        amount: p.base,
      });
    }
  }
  for (const i of forecast.upcomingIncome) {
    if (i.daysLeft <= 3 && i.daysLeft >= 0) {
      alerts.push({
        id: `inc-${i.id}`,
        type: "income",
        severity: "info",
        title: i.daysLeft === 0 ? `Bugun daromad kutilmoqda` : `${i.daysLeft} kundan keyin daromad`,
        body: `${i.sourceName} — ${formatRange(i)}`,
        refDate: i.date,
        amount: i.base,
      });
    } else if (i.daysLeft < -1 && !i.received) {
      alerts.push({
        id: `inc-late-${i.id}`,
        type: "income",
        severity: "warning",
        title: "Kutilgan daromad qayd etilmadi",
        body: `${i.sourceName} (${formatRange(i)}) hali ro'yxatga olinmadi.`,
        refDate: i.date,
        amount: i.base,
      });
    }
  }
  for (const b of budgetViews) {
    if (b.usage >= 1) {
      alerts.push({
        id: `budget-over-${b.id}`,
        type: "budget",
        severity: "critical",
        title: `${b.categoryName} budjeti oshdi`,
        body: `Limit ${Math.round(b.amount / 1000)} ming, sarflandi ${Math.round(b.spent / 1000)} ming.`,
        refDate: null,
        amount: b.spent - b.amount,
      });
    } else if (b.usage >= 0.8) {
      alerts.push({
        id: `budget-warn-${b.id}`,
        type: "budget",
        severity: "warning",
        title: `${b.categoryName} budjetining ${(b.usage * 100).toFixed(0)}% ishlatildi`,
        body: `Qoldi ${Math.round((b.amount - b.spent) / 1000)} ming so'm.`,
        refDate: null,
        amount: b.amount - b.spent,
      });
    }
  }
  if (forecast.riskDates.length && forecast.safeToSpend < 0) {
    const first = forecast.riskDates[0];
    alerts.push({
      id: "risk-cash",
      type: "risk",
      severity: "critical",
      title: "Pul yetishmasligi xavfi",
      body: `${shortDate(first.date)} kuni majburiy to'lovlar balansdan oshishi mumkin (taxminiy ${Math.round(first.deficit / 1000)} ming taqchillik).`,
      refDate: first.date,
      amount: first.deficit,
    });
  }
  const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 } as const;
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const userView: UserView = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    currency: user.currency,
    theme: user.theme,
    minReserve: user.minReserve,
    estimatedIncomeConfidence: user.estimatedIncomeConfidence,
    notifyPayments: user.notifyPayments,
    notifyIncome: user.notifyIncome,
    notifyBudget: user.notifyBudget,
    notifyRisk: user.notifyRisk,
    isDemo: user.isDemo,
  };

  return {
    user: userView,
    generatedAt: new Date().toISOString(),
    accounts: accountViews,
    categories: tree,
    flatCategories: catViews.map(({ children, ...rest }) => {
      void children;
      return rest;
    }),
    transactions: txViews,
    recurring: recurringViews,
    expectedIncomes: incomeViews,
    budgets: budgetViews,
    debts: debtViews,
    goals: goalViews,
    notifications: notificationRows.map((n) => ({
      id: n.id,
      type: n.type,
      severity: (n.severity as "info" | "success" | "warning" | "critical") ?? "info",
      title: n.title,
      body: n.body,
      refDate: n.refDate,
      amount: n.amount,
      isRead: Boolean(n.readAt),
      createdAt: n.createdAt.toISOString(),
    })),
    alerts: alerts.slice(0, 8),
    forecast,
    analytics,
    health,
  };
}

function formatRange(p: { min: number; max: number; base: number; certainty: string }): string {
  if (p.certainty === "estimated" && p.min !== p.max) {
    return `${Math.round(p.min / 1000)}–${Math.round(p.max / 1000)} ming (taxminiy)`;
  }
  return `${Math.round(p.base / 1000)} ming so'm`;
}

function shortDate(iso: string): string {
  const months = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
  const d = new Date(iso);
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

// keeps unused imports referenced for future query extension
void or;
void isNull;
void monthStart;
