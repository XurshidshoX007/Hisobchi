import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  budgets,
  categories,
  creditInstallments,
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
  buildCurrentMonthIncome,
  buildCurrentMonthPlan,
  buildForecast,
  buildHealth,
  buildMonthlySeries,
  comparePlansByDue,
  computeLedgerBalances,
  ledgerBalanceCheck,
  rangeValue,
  resolvePlanLifecycle,
  type AccountView,
  type BudgetView,
  type CategoryView,
  type DebtView,
  type ExpectedIncomeView,
  type GoalView,
  type MonthPlanSummary,
  type RecurringView,
  type TxView,
  type MonthlyView,
} from "./finance";
import { addDays, dayDiff, monthKey, monthStart, round2, todayISO } from "./money";
import { nextScheduleDate } from "./reconciliation";
import type { AppState, LiveAlert, UserView } from "./types";

const FORECAST_HORIZON_DAYS = 180;

export async function buildAppState(user: SessionUserLike): Promise<AppState> {
  const today = todayISO();
  const thisMonth = monthKey(today);

  const [
    accountRows,
    categoryRows,
    txRows,
    recurringRows,
    incomeRows,
    budgetRows,
    debtRows,
    goalRows,
    notificationRows,
    creditRows,
  ] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, user.id)).orderBy(accounts.sortOrder, accounts.id),
    db.select().from(categories).where(eq(categories.userId, user.id)).orderBy(categories.sortOrder, categories.id),
    // Analytics must use the complete ledger. The dashboard may render a
    // slice, but budgets and historical month totals must not silently lose
    // older transactions (or high-volume users' rows).
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), eq(transactions.isDeleted, false)))
      .orderBy(desc(transactions.date), desc(transactions.id)),
    db.select().from(recurringExpenses).where(eq(recurringExpenses.userId, user.id)),
    db.select().from(expectedIncomes).where(eq(expectedIncomes.userId, user.id)),
    db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, user.id), eq(budgets.month, thisMonth), eq(budgets.isDeleted, false))),
    db.select().from(debts).where(and(eq(debts.userId, user.id), eq(debts.isDeleted, false))),
    db.select().from(goals).where(and(eq(goals.userId, user.id), eq(goals.isDeleted, false))),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(30),
    db
      .select()
      .from(creditInstallments)
      .where(eq(creditInstallments.userId, user.id))
      .orderBy(creditInstallments.occurrenceNumber),
  ]);

  const creditByPlan = new Map<number, typeof creditRows>();
  for (const row of creditRows) {
    const list = creditByPlan.get(row.planId) ?? [];
    list.push(row);
    creditByPlan.set(row.planId, list);
  }

  const accountNames = new Map(accountRows.map((a) => [a.id, a.name]));
  const catById = new Map(categoryRows.map((c) => [c.id, c]));

  /* ---- balances ----
   * ONE authoritative calculation (`computeLedgerBalances`) shared with the
   * accounts page, the forecast start balance and the bot report. It runs over
   * the SAME rows the History list renders, so a transaction that is visible in
   * the history can never be missing from the balance.
   *
   * Date semantics: the balance reflects financial events up to and including
   * *today* (transaction.date); a future-dated transaction belongs to the
   * forecast, not to today's balance. */
  const ledgerRows = txRows.map((t) => ({
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    type: t.type,
    amount: t.amount,
    date: t.date,
    isDeleted: t.isDeleted,
  }));
  const ledger = computeLedgerBalances(accountRows, ledgerRows, today);

  const accountViews: AccountView[] = accountRows.map((a) => {
    const agg = ledger.get(a.id);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      initialBalance: a.initialBalance,
      currentBalance: agg?.currentBalance ?? round2(a.initialBalance),
      isActive: a.isActive,
      inflow: agg?.inflow ?? 0,
      outflow: agg?.outflow ?? 0,
      txCount: agg?.txCount ?? 0,
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
      plannedDate: t.plannedDate,
      occurrenceNumber: t.occurrenceNumber,
      isDeleted: false,
    }));

  /* ---- recurring / payment plans ---- */
  const recurringViews: RecurringView[] = recurringRows.map((r) => {
    const { base } = rangeValue(r.amount, r.minAmount, r.maxAmount);
    const planType = (r.planType === "term" ? "term" : r.planType === "one_time" || r.frequency === "once" ? "one_time" : "recurring") as
      | "one_time"
      | "recurring"
      | "term";
    // Lifecycle comes from the ONE authoritative selector shared with the
    // forecast engine (§10/§39) — never from a local mix of isActive /
    // termCompleted / status, which is exactly how the three concepts used to
    // drift apart between the list, the stats and the projection.
    const status = resolvePlanLifecycle(r);
    // §18: a "paid this month" tick is a RECONCILED fact, not decoration.
    // It requires a real, non-deleted EXPENSE transaction that fulfils an
    // occurrence (plannedDate) of THIS plan inside the current month — so
    // deleting that transaction makes the tick disappear, and an income or a
    // foreign transaction can never produce one.
    const planPayments = txViews.filter((t) => t.type === "expense" && t.recurringId === r.id);
    const paidDates = new Set(planPayments.map((t) => t.plannedDate ?? t.date));

    // Credit schedule: a term plan whose installments are stored explicitly
    // (irregular dates + amounts). `paid` is derived from the real payments.
    const creditRows = creditByPlan.get(r.id) ?? [];
    const installments =
      planType === "term" && creditRows.length
        ? creditRows.map((c) => ({
            date: c.date,
            amount: c.amount,
            occurrenceNumber: c.occurrenceNumber,
            paid: paidDates.has(c.date),
          }))
        : null;

    const installmentsPaid = installments ? installments.filter((i) => i.paid).length : r.installmentsPaid;
    const totalCount = installments ? installments.length : (r.installmentCount ?? 0);
    // The cursor is the next UNPAID installment for credit plans (irregular
    // dates), and the stored nextDueDate for every other plan kind.
    const effectiveNextDueDate = installments
      ? (installments.find((i) => !i.paid)?.date ?? installments[installments.length - 1].date)
      : r.nextDueDate;
    const daysLeft = dayDiff(today, effectiveNextDueDate);
    const termCompleted = planType === "term" && status === "completed";
    const remainingInstallments =
      planType === "term"
        ? Math.max(0, totalCount - installmentsPaid)
        : planType === "one_time"
          ? status === "completed" || status === "cancelled"
            ? 0
            : 1
          : null;
    const monthPayments = planPayments.filter((t) => (t.plannedDate ?? t.date).startsWith(thisMonth));
    // A cancelled plan has no live "paid" state to advertise.
    const paidThisMonth = status !== "cancelled" && monthPayments.length > 0;
    // Annualized total applies ONLY to indefinite recurring plans. Term and
    // one-time plans must never be multiplied by 12 (a 2-installment term is
    // worth count × amount, not amount × 12) — and a credit's real worth is
    // the SUM of its actual installments, never count × average (§23).
    const annualFactor = r.frequency === "weekly" ? 52 : r.frequency === "yearly" ? 1 : 12;
    const yearlyTotal = planType === "recurring" ? base * annualFactor : 0;
    const planTotal =
      planType === "term"
        ? installments
          ? round2(installments.reduce((sum, i) => sum + i.amount, 0))
          : round2((r.installmentCount ?? 0) * base)
        : planType === "one_time"
          ? round2(base)
          : null;
    const remainingTotal =
      planType === "term"
        ? installments
          ? round2(installments.filter((i) => !i.paid).reduce((sum, i) => sum + i.amount, 0))
          : round2(Math.max(0, totalCount - installmentsPaid) * base)
        : remainingInstallments !== null
          ? round2(remainingInstallments * base)
          : null;
    // The date this plan would really resume on (§26): for credit plans the
    // next unpaid installment (never rolled forward — its dates are fixed);
    // for regular plans a schedule parked in the past is rolled forward.
    const nextOccurrenceDate = installments
      ? (installments.find((i) => !i.paid)?.date ?? installments[installments.length - 1].date)
      : nextScheduleDate({ planType, frequency: r.frequency, cursor: r.nextDueDate }, today);
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
      nextDueDate: effectiveNextDueDate,
      reminderDaysBefore: r.reminderDaysBefore,
      isActive: status === "active",
      status,
      daysLeft,
      paidThisMonth,
      yearlyTotal: round2(yearlyTotal),
      planType,
      installmentCount: installments ? installments.length : r.installmentCount,
      installmentsPaid,
      remainingInstallments,
      remainingTotal,
      planTotal,
      termCompleted,
      paymentsCount: planPayments.length,
      paidThisMonthAmount: round2(monthPayments.reduce((sum, t) => sum + t.amount, 0)),
      lastPaymentDate: planPayments.map((t) => t.date).sort().at(-1) ?? null,
      nextOccurrenceDate,
      isOverdue: status === "active" && daysLeft < 0,
      installments,
    };
  });

  /* ---- expected incomes ---- */
  const incomeViews: ExpectedIncomeView[] = incomeRows.map((i) => {
    const { base } = rangeValue(i.amount, i.minAmount, i.maxAmount);
    const planType = (i.planType === "term" ? "term" : i.planType === "one_time" || i.frequency === "once" ? "one_time" : "recurring") as
      | "one_time"
      | "recurring"
      | "term";
    const status = resolvePlanLifecycle(i);
    const termCompleted = planType === "term" && status === "completed";
    const remaining =
      planType === "term"
        ? Math.max(0, (i.occurrenceCount ?? 0) - i.occurrencesReceived)
        : planType === "one_time"
          ? status === "completed" || status === "cancelled"
            ? 0
            : 1
          : null;
    // Same reconciliation rule as payments (§18/§30): a receipt tick requires
    // a real income transaction fulfilling an occurrence of this plan.
    const planReceipts = txViews.filter((t) => t.type === "income" && t.expectedIncomeId === i.id);
    const linkedTransaction = planReceipts.find(
      (t) => planType === "one_time" || (t.plannedDate ?? t.date).startsWith(thisMonth),
    );
    const received = status !== "cancelled" && Boolean(linkedTransaction);
    const monthReceipts = planReceipts.filter((t) => (t.plannedDate ?? t.date).startsWith(thisMonth));
    const planTotal =
      planType === "term"
        ? round2((i.occurrenceCount ?? 0) * base)
        : planType === "one_time"
          ? round2(base)
          : null;
    const daysLeft = dayDiff(today, i.expectedDate);
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
      isActive: status === "active",
      status,
      note: i.note,
      accountId: i.accountId,
      categoryId: i.categoryId,
      received,
      daysLeft,
      linkedTransactionId: linkedTransaction?.id ?? null,
      planType,
      occurrenceCount: i.occurrenceCount,
      occurrencesReceived: i.occurrencesReceived,
      remainingOccurrences: remaining,
      planTotal,
      termCompleted,
      receiptsCount: planReceipts.length,
      receivedThisMonthAmount: round2(monthReceipts.reduce((sum, t) => sum + t.amount, 0)),
      lastReceiptDate: planReceipts.map((t) => t.date).sort().at(-1) ?? null,
      nextOccurrenceDate: nextScheduleDate({ planType, frequency: i.frequency, cursor: i.expectedDate }, today),
      isOverdue: status === "active" && daysLeft < 0 && !received,
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
    const etaDate = g.monthlyContribution > 0 && remaining > 0 ? addDays(today, Math.ceil(remaining / g.monthlyContribution) * 30) : null;
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

  // §16: the list is ordered by WHEN money moves — overdue, today, nearest —
  // not by insertion order (the DB returns rows unordered) and never
  // alphabetically. Sorting lives in the state builder so every surface
  // (Mini App, bot, notifications) sees the same priority.
  recurringViews.sort(comparePlansByDue);
  incomeViews.sort(comparePlansByDue);

  /* ---- forecast / analytics / health ---- */
  const recurringBase = recurringViews.filter((r) => r.isActive).reduce((s, r) => s + r.baseAmount, 0);
  const forecast = buildForecast({
    currentBalance,
    transactions: txRows.map((t) => ({ id: t.id, date: t.date, type: t.type, amount: t.amount, note: t.note, recurringId: t.recurringId, expectedIncomeId: t.expectedIncomeId, plannedDate: t.plannedDate, occurrenceNumber: t.occurrenceNumber, isDeleted: t.isDeleted })),
    recurring: recurringRows.map((r) => ({
      ...r,
      installments:
        creditByPlan.get(r.id)?.map((c) => ({
          date: c.date,
          amount: c.amount,
          occurrenceNumber: c.occurrenceNumber,
        })) ?? undefined,
    })),
    incomes: incomeRows.map((i) => ({
      ...i,
      linkedTransactionId: incomeViews.find((v) => v.id === i.id)?.linkedTransactionId ?? null,
    })),
    minReserve: user.minReserve,
    estimatedConfidence: user.estimatedIncomeConfidence,
    today,
    horizonDays: FORECAST_HORIZON_DAYS,
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

  /* ---- monthly finance series (6 months: prev + current + next 4) ---- */
  let monthly: MonthlyView[] = [];
  try {
    const realTxForMonthly = txRows
      .filter((t) => !t.isDeleted)
      .map((t) => ({ date: t.date, type: t.type, amount: t.amount }));
    monthly = buildMonthlySeries({
      today,
      currentBalance,
      transactions: realTxForMonthly,
      planned: forecast.planned,
      cashflow: forecast.cashflow,
      analytics,
      forecast,
      monthsBefore: 5,
      monthsAfter: 4,
    });
  } catch {
    monthly = [];
  }

  /* ---- forecast-aware smart insights ---- */
  {
    const upcoming = forecast.planned.filter((p) => p.kind === "expense" && p.mandatory && p.date >= today && dayDiff(today, p.date) <= 12);
    if (upcoming.length) {
      analytics.insights.push({
        icon: "📌",
        tone: "neutral",
        title: `Kelasi 12 kunda ${upcoming.length} ta majburiy to'lov`,
        body: `Jami ${Math.round(upcoming.reduce((s, p) => s + p.base, 0) / 1000)} ming so'm rejalashtirilgan.`,
      });
    }
    if (forecast.riskDates.length) {
      const first = forecast.riskDates[0];
      const recov = first.recoveryDate ? ` ${first.recoveryDate.slice(8, 10)}-avgustda ${Math.round((first.recoveryAmount ?? 0) / 1000)} ming kutilmoqda.` : "";
      analytics.insights.push({
        icon: "🚨",
        tone: "negative",
        title: "Balans pasayishi mumkin",
        body: `${shortDate(first.date)} kuni ${Math.round(first.deficit / 1000)} ming so'm yetishmasligi mumkin.${recov}`,
      });
    }
    analytics.insights.push({
      icon: "✨",
      tone: forecast.safeToSpend < 0 ? "warning" : "positive",
      title: `Sarflash mumkin: ${Math.round(forecast.safeToSpend / 1000)} ming`,
      body:
        forecast.safeToSpend < 0
          ? "Majburiy to'lov va zaxiradan keyin erkin mablag' yo'q."
          : "Oy oxirigacha sarflash mumkin bo'lgan summa.",
    });
    if (forecast.income.estimatedBase > 0) {
      analytics.insights.push({
        icon: "🎲",
        tone: "neutral",
        title: "Taxminiy daromad",
        body: `Prognoz ${Math.round(forecast.income.base / 1000)} ming, shundan ${Math.round(forecast.income.exactBase / 1000)} ming aniq.`,
      });
    }
  }

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
        title: "Daromad qayd etilmadi",
        body: `${i.sourceName} (${formatRange(i)}) hali kiritilmagan.`,
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
  if (forecast.riskDates.length) {
    const first = forecast.riskDates[0];
    const causeExpense = forecast.planned.filter((p) => p.date === first.date && p.kind === "expense").sort((a, b) => b.base - a.base)[0];
    const nextIncomes = forecast.planned
      .filter((p) => p.kind === "income" && p.date >= first.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 2);
    const nextInc = nextIncomes[0];
    const severity = first.deficit > currentBalance || first.balance < -500_000 ? "critical" : "warning";

    let detailedBody: string;
    if (causeExpense) {
      const projectedBalance = first.balance;
      detailedBody = [
        `🔴 ${shortDate(first.date)} kuni ${causeExpense.label} to'lovi bor`,
        "",
        "To'lov:",
        `${Math.round(causeExpense.base).toLocaleString("ru-RU")} UZS`,
        "",
        `${shortDate(first.date)} dagi taxminiy balans:`,
        `${Math.round(projectedBalance).toLocaleString("ru-RU")} UZS`,
        "",
        nextInc ? `Kutilayotgan daromad:\n${Math.round(nextInc.base).toLocaleString("ru-RU")} UZS\n${shortDate(nextInc.date)}` : "",
        "",
        `Tavsiya:\n${shortDate(first.date)} gacha kamida ${Math.round(first.deficit).toLocaleString("ru-RU")} UZS kerak.`,
        nextInc ? `${shortDate(nextInc.date)} kuni balans tiklanadi.` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      const nextIncomeText = nextInc
        ? ` Kutilayotgan daromad: ${nextInc.label} ${Math.round(nextInc.base / 1000)} ming ${shortDate(nextInc.date)}.`
        : "";
      detailedBody = `${shortDate(first.date)} kuni ${first.cause ? `${first.cause} tufayli ` : ""}balans ${Math.round(Math.abs(first.balance) / 1000)} mingga tushishi mumkin (taqchillik ${Math.round(first.deficit / 1000)} ming).${nextIncomeText} ${
        first.recoveryDate ? `Tiklanish: ${shortDate(first.recoveryDate)}.` : ""
      }`.trim();
    }

    alerts.push({
      id: "risk-cash",
      type: "risk",
      severity,
      title: causeExpense ? `${shortDate(first.date)} · ${causeExpense.label} xavfi` : "Balans yetishmasligi mumkin",
      body: detailedBody,
      refDate: first.date,
      amount: first.deficit,
    });
  }
  /* ---- ledger consistency guard (History ↔ REAL BALANCE) ----
   * The dashboard total intentionally covers ACTIVE accounts only, so money
   * sitting on an archived account is real but invisible there. That gap used
   * to be silent — a transaction appeared in History while the balance never
   * moved. It is now surfaced instead of hidden. */
  const ledgerCheck = ledgerBalanceCheck(
    accountRows.map((a) => ({ id: a.id, name: a.name, initialBalance: a.initialBalance, isActive: a.isActive })),
    ledgerRows,
    today,
  );
  if (ledgerCheck.excludedAccounts.length) {
    const names = ledgerCheck.excludedAccounts.map((a) => a.name).join(", ");
    alerts.push({
      id: "ledger-archived-balance",
      type: "insight",
      severity: "warning",
      title: "Arxiv hisobda pul bor",
      body: `${names} hisobi noaktiv — undagi ${Math.round(ledgerCheck.excludedBalance).toLocaleString("ru-RU")} ${user.currency} balansga kirmaydi. Hisoblar bo'limida faollashtiring.`,
      refDate: null,
      amount: ledgerCheck.excludedBalance,
    });
  }

  const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 } as const;
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  /* ---- current-month summaries (Plans is monthly-first, §28/§29) ---- */
  const currentMonthIncome = buildCurrentMonthIncome(forecast.planned, today);
  const currentMonthPlan: MonthPlanSummary = buildCurrentMonthPlan(
    forecast.planned,
    txRows.map((t) => ({
      type: t.type,
      amount: t.amount,
      date: t.date,
      recurringId: t.recurringId,
      plannedDate: t.plannedDate,
      isDeleted: t.isDeleted,
    })),
    new Map(recurringRows.map((r) => [r.id, r.isMandatory])),
    today,
  );

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
    // Expose the ledger result directly so factual surfaces do not need to
    // reach through forecast state or repeat the account-summing calculation.
    currentBalance,
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
    alerts: alerts.slice(0, 10),
    forecast,
    analytics,
    health,
    monthly,
    currentMonthIncome,
    currentMonthPlan,
  } as unknown as AppState;
}

function formatRange(p: { min: number; max: number; base: number; certainty: string }): string {
  if (p.certainty === "estimated" && p.min !== p.max) {
    return `${Math.round(p.min / 1000)}–${Math.round(p.max / 1000)} ming (taxminiy)`;
  }
  return `${Math.round(p.base / 1000)} ming so'm`;
}

function shortDate(iso: string): string {
  const months = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  return `${day}-${months[(month || 1) - 1]}`;
}

// keeps unused imports referenced for future query extension
void or;
void isNull;
void monthStart;
