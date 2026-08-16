import { addDays, addMonths, clamp, dayDiff, monthEnd, monthKey, monthStart, round2, todayISO } from "./money";

/* ============================ Shared view types ============================ */

export type TxView = {
  id: number;
  accountId: number;
  accountName: string;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string;
  note: string | null;
  source: string;
  recurringId: number | null;
  expectedIncomeId: number | null;
  isDeleted: boolean;
};

export type AccountView = {
  id: number;
  name: string;
  type: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  isActive: boolean;
  inflow: number;
  outflow: number;
  txCount: number;
};

export type CategoryView = {
  id: number;
  parentId: number | null;
  name: string;
  type: "income" | "expense";
  icon: string;
  isEssential: boolean;
  isActive: boolean;
  isSystem: boolean;
  children: CategoryView[];
};

export type RecurringView = {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  accountId: number | null;
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  baseAmount: number;
  dueDay: number;
  frequency: string;
  isMandatory: boolean;
  certainty: "exact" | "estimated";
  nextDueDate: string;
  reminderDaysBefore: number;
  isActive: boolean;
  daysLeft: number;
  paidThisMonth: boolean;
  yearlyTotal: number;
  planType: "one_time" | "recurring" | "term";
  installmentCount: number | null;
  installmentsPaid: number;
  remainingInstallments: number | null;
  remainingTotal: number | null;
  termCompleted: boolean;
};

export type ExpectedIncomeView = {
  id: number;
  sourceName: string;
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  baseAmount: number;
  expectedDate: string;
  frequency: string;
  certainty: "exact" | "estimated";
  isActive: boolean;
  note: string | null;
  accountId: number | null;
  categoryId: number | null;
  received: boolean;
  daysLeft: number;
  linkedTransactionId: number | null;
  planType: "one_time" | "recurring" | "term";
  occurrenceCount: number | null;
  occurrencesReceived: number;
  remainingOccurrences: number | null;
  termCompleted: boolean;
};

export type BudgetView = {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string;
  month: string;
  amount: number;
  spent: number;
  usage: number;
  status: "normal" | "warning" | "exceeded";
};

export type DebtView = {
  id: number;
  direction: "i_owe" | "owed_to_me";
  personName: string;
  amount: number;
  remainingAmount: number;
  paidAmount: number;
  dueDate: string | null;
  note: string | null;
  status: string;
  daysLeft: number | null;
  progress: number;
  payments: Array<{ id: number; amount: number; date: string; note: string | null }>;
};

export type GoalView = {
  id: number;
  name: string;
  icon: string;
  targetAmount: number;
  savedAmount: number;
  remaining: number;
  progress: number;
  targetDate: string | null;
  monthlyContribution: number;
  requiredMonthly: number;
  monthsLeft: number | null;
  etaDate: string | null;
  onTrack: boolean;
  status: string;
};

export type NotificationView = {
  id: number;
  type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  refDate: string | null;
  amount: number | null;
  isRead: boolean;
  createdAt: string;
};

/* ============================ Primitives ============================ */

export function rangeValue(
  exact: number | null,
  min: number | null,
  max: number | null,
  fallback = 0,
): { base: number; min: number; max: number } {
  if (exact !== null && exact !== undefined) return { base: exact, min: exact, max: exact };
  const lo = min ?? fallback;
  const hi = max ?? lo;
  return { base: (lo + hi) / 2, min: lo, max: hi };
}

function nextOccurrences(
  seedDate: string,
  frequency: string,
  today: string,
  horizonEnd: string,
  maxOccurrences: number | null = null,
): string[] {
  const out: string[] = [];
  let cursor = seedDate;
  // The scheduled date itself counts. A one-time item must never be silently
  // expanded into monthly occurrences.
  if (seedDate <= horizonEnd) out.push(seedDate);
  if (frequency === "once") return out.slice(0, maxOccurrences ?? out.length);
  let guard = 0;
  while (cursor <= horizonEnd && guard < 60) {
    cursor =
      frequency === "weekly"
        ? addDays(cursor, 7)
        : frequency === "yearly"
          ? addMonths(cursor, 12)
          : addMonths(cursor, 1);
    if (cursor >= today && cursor <= horizonEnd) out.push(cursor);
    guard += 1;
  }
  const unique = out.filter((d, i, arr) => arr.indexOf(d) === i).sort();
  // Term plans project only the REMAINING installments — a finished credit
  // must never keep draining the forecast.
  return maxOccurrences !== null ? unique.slice(0, Math.max(0, maxOccurrences)) : unique;
}

export type PlannedItem = {
  key: string;
  date: string;
  kind: "income" | "expense";
  label: string;
  min: number;
  base: number;
  max: number;
  certainty: "exact" | "estimated";
  mandatory: boolean;
  source: "recurring" | "expected";
  refId: number;
  categoryName?: string | null;
  accountId?: number | null;
};

/* ============================ Forecast ============================ */

export type Forecast = {
  today: string;
  horizonDays: number;
  horizonEnd: string;
  safeHorizonEnd: string;
  currentBalance: number;
  income: {
    exactBase: number;
    exactMin: number;
    estimatedBase: number;
    estimatedMin: number;
    estimatedMax: number;
    base: number;
    min: number;
    max: number;
  };
  expense: {
    mandatoryBase: number;
    mandatoryMin: number;
    mandatoryMax: number;
    optionalBase: number;
    optionalMin: number;
    optionalMax: number;
    base: number;
    min: number;
    max: number;
  };
  scenarios: {
    min: { balance: number; delta: number };
    base: { balance: number; delta: number };
    max: { balance: number; delta: number };
  };
  safeToSpend: number;
  safeToSpendParts: {
    balance: number;
    confirmedIncome: number;
    estimatedIncomeWeighted: number;
    mandatoryUpcoming: number;
    optionalPlanned: number;
    minReserve: number;
  };
  cashflow: Array<{
    date: string;
    inflow: number;
    outflow: number;
    net: number;
    projectedBase: number;
    projectedMin: number;
    projectedMax: number;
    events: PlannedItem[];
  }>;
  riskDates: Array<{ date: string; balance: number; deficit: number; cause: string }>;
  planned: PlannedItem[];
  upcomingPayments: Array<{
    id: number;
    name: string;
    categoryName: string | null;
    date: string;
    daysLeft: number;
    base: number;
    min: number;
    max: number;
    certainty: "exact" | "estimated";
    mandatory: boolean;
    status: "overdue" | "today" | "upcoming";
  }>;
  upcomingIncome: Array<{
    id: number;
    sourceName: string;
    date: string;
    daysLeft: number;
    base: number;
    min: number;
    max: number;
    certainty: "exact" | "estimated";
    received: boolean;
  }>;
};

type RecurringLike = {
  id: number;
  name: string;
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  nextDueDate: string;
  frequency: string;
  isMandatory: boolean;
  certainty: string;
  isActive: boolean;
  categoryId: number | null;
  planType?: string;
  installmentCount?: number | null;
  installmentsPaid?: number | null;
};

type ExpectedLike = {
  id: number;
  sourceName: string;
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  expectedDate: string;
  frequency: string;
  certainty: string;
  isActive: boolean;
  linkedTransactionId: number | null;
  planType?: string;
  occurrenceCount?: number | null;
  occurrencesReceived?: number | null;
};

/** Remaining scheduled occurrences for a plan; null = unlimited (recurring). */
export function remainingOccurrences(plan: {
  planType?: string;
  frequency: string;
  installmentCount?: number | null;
  installmentsPaid?: number | null;
  occurrenceCount?: number | null;
  occurrencesReceived?: number | null;
}): number | null {
  if (plan.planType === "term") {
    const total = plan.installmentCount ?? plan.occurrenceCount ?? 0;
    const done = plan.installmentsPaid ?? plan.occurrencesReceived ?? 0;
    return Math.max(0, total - done);
  }
  if (plan.planType === "one_time" || plan.frequency === "once") return 1;
  return null;
}

export function buildPlanned(
  recurring: RecurringLike[],
  incomes: ExpectedLike[],
  today: string,
  horizonDays: number,
): PlannedItem[] {
  const horizonEnd = addDays(today, horizonDays);
  const items: PlannedItem[] = [];

  for (const r of recurring) {
    if (!r.isActive) continue;
    const remaining = remainingOccurrences(r);
    if (remaining !== null && remaining <= 0) continue; // term plan finished
    const { base, min, max } = rangeValue(r.amount, r.minAmount, r.maxAmount);
    for (const date of nextOccurrences(r.nextDueDate, r.frequency, today, horizonEnd, remaining)) {
      items.push({
        key: `r-${r.id}-${date}`,
        date,
        kind: "expense",
        label: r.name,
        min,
        base,
        max,
        certainty: (r.certainty === "estimated" ? "estimated" : "exact") as "exact" | "estimated",
        mandatory: r.isMandatory,
        source: "recurring",
        refId: r.id,
      });
    }
  }

  for (const inc of incomes) {
    if (!inc.isActive) continue;
    const remaining = remainingOccurrences(inc);
    if (remaining !== null && remaining <= 0) continue; // term income finished
    const { base, min, max } = rangeValue(inc.amount, inc.minAmount, inc.maxAmount);
    for (const date of nextOccurrences(inc.expectedDate, inc.frequency, today, horizonEnd, remaining)) {
      // already-received (past-dated) income is not projected again — REAL vs PLANNED
      if (date < today) continue;
      items.push({
        key: `i-${inc.id}-${date}`,
        date,
        kind: "income",
        label: inc.sourceName,
        min,
        base,
        max,
        certainty: (inc.certainty === "estimated" ? "estimated" : "exact") as "exact" | "estimated",
        mandatory: false,
        source: "expected",
        refId: inc.id,
      });
    }
  }

  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildForecast(params: {
  currentBalance: number;
  recurring: RecurringLike[];
  incomes: ExpectedLike[];
  minReserve: number;
  estimatedConfidence: number;
  today?: string;
  horizonDays?: number;
}): Forecast {
  const today = params.today ?? todayISO();
  const horizonDays = params.horizonDays ?? 35;
  const horizonEnd = addDays(today, horizonDays);
  const planned = buildPlanned(params.recurring, params.incomes, today, horizonDays);

  const income = {
    exactBase: 0,
    exactMin: 0,
    estimatedBase: 0,
    estimatedMin: 0,
    estimatedMax: 0,
    base: 0,
    min: 0,
    max: 0,
  };
  const expense = {
    mandatoryBase: 0,
    mandatoryMin: 0,
    mandatoryMax: 0,
    optionalBase: 0,
    optionalMin: 0,
    optionalMax: 0,
    base: 0,
    min: 0,
    max: 0,
  };

  for (const p of planned) {
    if (p.kind === "income") {
      if (p.certainty === "exact") {
        income.exactBase += p.base;
        income.exactMin += p.min;
      } else {
        income.estimatedBase += p.base;
        income.estimatedMin += p.min;
        income.estimatedMax += p.max;
      }
    } else if (p.mandatory) {
      expense.mandatoryBase += p.base;
      expense.mandatoryMin += p.min;
      expense.mandatoryMax += p.max;
    } else {
      expense.optionalBase += p.base;
      expense.optionalMin += p.min;
      expense.optionalMax += p.max;
    }
  }
  // Scenario semantics (MIN/BASE/MAX):
  //  MIN  — only confirmed (exact) income; estimated income may not arrive.
  //  BASE — exact + probable estimated income at its base value.
  //  MAX  — exact + estimated income at its upper bound.
  income.base = income.exactBase + income.estimatedBase;
  income.min = income.exactMin;
  income.max = income.exactBase + income.estimatedMax;
  expense.base = expense.mandatoryBase + expense.optionalBase;
  expense.min = expense.mandatoryMin + expense.optionalMin;
  expense.max = expense.mandatoryMax + expense.optionalMax;

  // Safe-to-Spend answers "how much can I spend right now" — it uses the
  // current-month window, while the forecast uses the full horizon.
  const daysToMonthEnd = dayDiff(today, monthEnd(today));
  const safeHorizonEnd = daysToMonthEnd >= 5 ? monthEnd(today) : addDays(today, 7);
  const safeWindow = planned.filter((p) => p.date <= safeHorizonEnd);
  const safeExactIncome = safeWindow
    .filter((p) => p.kind === "income" && p.certainty === "exact")
    .reduce((s, p) => s + p.base, 0);
  const safeEstimatedIncome = safeWindow
    .filter((p) => p.kind === "income" && p.certainty === "estimated")
    .reduce((s, p) => s + p.base, 0);
  const safeMandatory = safeWindow
    .filter((p) => p.kind === "expense" && p.mandatory)
    .reduce((s, p) => s + p.base, 0);

  const balance = params.currentBalance;
  const scenarios = {
    min: { balance: balance + income.min - expense.max, delta: income.min - expense.max },
    base: { balance: balance + income.base - expense.base, delta: income.base - expense.base },
    max: { balance: balance + income.max - expense.min, delta: income.max - expense.min },
  };

  const confidence = clamp(params.estimatedConfidence, 0, 100) / 100;
  const safeEstimatedWeighted = safeEstimatedIncome * confidence;
  const safeToSpend =
    balance + safeExactIncome + safeEstimatedWeighted - safeMandatory - params.minReserve;

  const cashflow: Forecast["cashflow"] = [];
  const riskDates: Forecast["riskDates"] = [];
  let runningBase = balance;
  let runningMin = balance;
  let runningMax = balance;
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i);
    const events = planned.filter((p) => p.date === date);
    const inflow = events.filter((e) => e.kind === "income").reduce((s, e) => s + e.base, 0);
    const outflow = events.filter((e) => e.kind === "expense").reduce((s, e) => s + e.base, 0);
    runningBase += inflow - outflow;
    runningMin +=
      events.filter((e) => e.kind === "income").reduce((s, e) => s + e.min, 0) -
      events.filter((e) => e.kind === "expense").reduce((s, e) => s + e.max, 0);
    runningMax +=
      events.filter((e) => e.kind === "income").reduce((s, e) => s + e.max, 0) -
      events.filter((e) => e.kind === "expense").reduce((s, e) => s + e.min, 0);
    cashflow.push({ date, inflow, outflow, net: inflow - outflow, projectedBase: runningBase, projectedMin: runningMin, projectedMax: runningMax, events });
    if (runningMin < 0) {
      riskDates.push({
        date,
        balance: round2(runningMin),
        deficit: round2(Math.abs(runningMin)),
        cause: events.filter((e) => e.kind === "expense").map((e) => e.label).join(", ") || "balans pasayishi",
      });
    }
  }

  const upcomingPayments = params.recurring
    .filter((r) => r.isActive)
    .filter((r) => {
      const remaining = remainingOccurrences(r);
      return remaining === null || remaining > 0;
    })
    .map((r) => {
      const { base, min, max } = rangeValue(r.amount, r.minAmount, r.maxAmount);
      const daysLeft = dayDiff(today, r.nextDueDate);
      return {
        id: r.id,
        name: r.name,
        categoryName: null,
        date: r.nextDueDate,
        daysLeft,
        base,
        min,
        max,
        certainty: (r.certainty === "estimated" ? "estimated" : "exact") as "exact" | "estimated",
        mandatory: r.isMandatory,
        status: daysLeft < 0 ? ("overdue" as const) : daysLeft === 0 ? ("today" as const) : ("upcoming" as const),
      };
    })
    .filter((p) => p.daysLeft <= 21)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const upcomingIncome = params.incomes
    .filter((i) => i.isActive)
    .filter((i) => {
      const remaining = remainingOccurrences(i);
      return remaining === null || remaining > 0;
    })
    .map((i) => {
      const { base, min, max } = rangeValue(i.amount, i.minAmount, i.maxAmount);
      return {
        id: i.id,
        sourceName: i.sourceName,
        date: i.expectedDate,
        daysLeft: dayDiff(today, i.expectedDate),
        base,
        min,
        max,
        certainty: (i.certainty === "estimated" ? "estimated" : "exact") as "exact" | "estimated",
        received: Boolean(i.linkedTransactionId),
      };
    })
    .filter((i) => i.daysLeft <= 21)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    today,
    horizonDays,
    horizonEnd,
    safeHorizonEnd,
    currentBalance: balance,
    income,
    expense,
    scenarios,
    safeToSpend: round2(safeToSpend),
    safeToSpendParts: {
      balance,
      confirmedIncome: round2(safeExactIncome),
      estimatedIncomeWeighted: round2(safeEstimatedWeighted),
      mandatoryUpcoming: round2(safeMandatory),
      optionalPlanned: round2(expense.optionalBase),
      minReserve: params.minReserve,
    },
    cashflow,
    riskDates,
    planned,
    upcomingPayments,
    upcomingIncome,
  };
}

/* ============================ Analytics ============================ */

export type Analytics = {
  month: string;
  today: { income: number; expense: number; net: number };
  monthTotals: {
    income: number;
    expense: number;
    net: number;
    avgDaily: number;
    projectedMonthExpense: number;
    savingsRate: number;
    mandatoryRatio: number;
    discretionaryRatio: number;
    transferTotal: number;
    daysElapsed: number;
    daysInMonth: number;
  };
  monthly: Array<{ month: string; income: number; expense: number; net: number }>;
  balanceHistory: Array<{ date: string; balance: number }>;
  categories: Array<{
    id: number | null;
    name: string;
    icon: string;
    amount: number;
    share: number;
    prevAmount: number;
    change: number;
    changePct: number;
    isEssential: boolean;
    txCount: number;
  }>;
  incomeSources: Array<{ name: string; amount: number; share: number }>;
  topCategory: { name: string; amount: number; share: number } | null;
  fastestGrowing: { name: string; changePct: number; change: number } | null;
  recurringTotal: number;
  anomalies: Array<{ id: number; name: string; amount: number; date: string; ratio: number }>;
  insights: Insight[];
};

export type Insight = {
  icon: string;
  tone: "positive" | "negative" | "warning" | "neutral";
  title: string;
  body: string;
};

export function buildAnalytics(params: {
  transactions: Array<{
    id: number;
    type: string;
    amount: number;
    date: string;
    categoryId: number | null;
    note: string | null;
    isDeleted?: boolean;
  }>;
  categories: Array<{ id: number; name: string; icon: string; isEssential: boolean }>;
  recurringBase: number;
  currentBalance: number;
  today?: string;
}): Analytics {
  const today = params.today ?? todayISO();
  const mk = monthKey(today);
  const active = params.transactions.filter((t) => !t.isDeleted && t.date <= today);
  const catById = new Map(params.categories.map((c) => [c.id, c]));

  const inMonth = (key: string, type: string) =>
    active.filter((t) => t.date.startsWith(key) && t.type === type).reduce((s, t) => s + t.amount, 0);

  const todayIncome = active.filter((t) => t.date === today && t.type === "income").reduce((s, t) => s + t.amount, 0);
  const todayExpense = active.filter((t) => t.date === today && t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const start = monthStart(today);
  const end = monthEnd(today);
  const daysInMonth = dayDiff(start, end) + 1;
  const daysElapsed = Math.max(1, dayDiff(start, today) + 1);

  const income = inMonth(mk, "income");
  const expense = inMonth(mk, "expense");
  const transferTotal = inMonth(mk, "transfer");
  const net = income - expense;

  // monthly series (last 6 months)
  const monthly: Analytics["monthly"] = [];
  for (let i = 5; i >= 0; i--) {
    const key = monthKey(addMonths(start, -i));
    monthly.push({
      month: key,
      income: round2(inMonth(key, "income")),
      expense: round2(inMonth(key, "expense")),
      net: round2(inMonth(key, "income") - inMonth(key, "expense")),
    });
  }

  // category breakdown current + previous month
  const prevKey = monthKey(addMonths(start, -1));
  const byCat = new Map<string, { amount: number; prev: number; count: number; cat: (typeof params.categories)[number] | null }>();
  for (const t of active) {
    if (t.type !== "expense") continue;
    const key = monthKey(t.date);
    if (key !== mk && key !== prevKey) continue;
    const cat = t.categoryId ? catById.get(t.categoryId) ?? null : null;
    const entry = byCat.get(cat?.name ?? "Boshqa") ?? { amount: 0, prev: 0, count: 0, cat };
    if (key === mk) {
      entry.amount += t.amount;
      entry.count += 1;
    } else entry.prev += t.amount;
    byCat.set(cat?.name ?? "Boshqa", entry);
  }

  const categoriesOut: Analytics["categories"] = [...byCat.entries()]
    .map(([name, v]) => ({
      id: v.cat?.id ?? null,
      name,
      icon: v.cat?.icon ?? "•",
      amount: round2(v.amount),
      share: expense > 0 ? v.amount / expense : 0,
      prevAmount: round2(v.prev),
      change: round2(v.amount - v.prev),
      changePct: v.prev > 0 ? (v.amount - v.prev) / v.prev : v.amount > 0 ? 1 : 0,
      isEssential: Boolean(v.cat?.isEssential),
      txCount: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const incomeMap = new Map<string, number>();
  for (const t of active) {
    if (t.type !== "income" || !t.date.startsWith(mk)) continue;
    const name = t.categoryId ? catById.get(t.categoryId)?.name ?? "Daromad" : "Daromad";
    incomeMap.set(name, (incomeMap.get(name) ?? 0) + t.amount);
  }
  const incomeSources = [...incomeMap.entries()]
    .map(([name, amount]) => ({ name, amount: round2(amount), share: income > 0 ? amount / income : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const mandatoryAmount = categoriesOut.filter((c) => c.isEssential).reduce((s, c) => s + c.amount, 0);
  const essentialIds = new Set(params.categories.filter((c) => c.isEssential).map((c) => c.id));

  // balance history: reconstruct backwards 90 days from current balance
  const balanceHistory: Array<{ date: string; balance: number }> = [];
  let running = params.currentBalance;
  for (let i = 0; i <= 90; i++) {
    const date = addDays(today, -i);
    balanceHistory.push({ date, balance: round2(running) });
    const dayTx = active.filter((t) => t.date === date);
    for (const t of dayTx) {
      if (t.type === "income") running -= t.amount;
      else if (t.type === "expense") running += t.amount;
    }
  }
  balanceHistory.reverse();

  // anomalies: > 2.5x category median in current month
  const anomalies: Analytics["anomalies"] = [];
  const grouped = new Map<number, number[]>();
  for (const t of active) {
    if (t.type !== "expense" || !t.date.startsWith(mk)) continue;
    const key = t.categoryId ?? -1;
    grouped.set(key, [...(grouped.get(key) ?? []), t.amount]);
  }
  for (const [catId, values] of grouped) {
    if (values.length < 3) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const t of active) {
      if (t.type !== "expense" || !t.date.startsWith(mk)) continue;
      if ((t.categoryId ?? -1) !== catId) continue;
      if (median > 0 && t.amount > median * 2.5) {
        anomalies.push({
          id: t.id,
          name: catById.get(catId)?.name ?? "Boshqa",
          amount: round2(t.amount),
          date: t.date,
          ratio: round2(t.amount / median),
        });
      }
    }
  }
  anomalies.sort((a, b) => b.amount - a.amount);

  const topCategory = categoriesOut[0]
    ? { name: categoriesOut[0].name, amount: categoriesOut[0].amount, share: categoriesOut[0].share }
    : null;
  const fastest = categoriesOut
    .filter((c) => c.prevAmount > 0 && c.amount > c.prevAmount)
    .sort((a, b) => b.change - a.change)[0];

  const prevExpense = monthly[monthly.length - 2]?.expense ?? 0;
  const prevIncome = monthly[monthly.length - 2]?.income ?? 0;
  const savingsRate = income > 0 ? (income - expense) / income : 0;
  const mandatoryRatio = income > 0 ? mandatoryAmount / income : mandatoryAmount > 0 ? 1 : 0;

  const insights: Insight[] = [];
  if (prevIncome > 0) {
    const diff = (income - prevIncome) / prevIncome;
    insights.push({
      icon: diff >= 0 ? "📈" : "📉",
      tone: diff >= 0 ? "positive" : "neutral",
      title: `Daromad ${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(0)}%`,
      body: `Bu oy daromad ${Math.round(income / 1000)} ming, oldingi oy ${Math.round(prevIncome / 1000)} ming edi.`,
    });
  }
  if (prevExpense > 0) {
    const diff = (expense - prevExpense) / prevExpense;
    insights.push({
      icon: diff > 0.1 ? "⚠️" : "✅",
      tone: diff > 0.1 ? "warning" : "positive",
      title: `Xarajat ${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(0)}%`,
      body: diff > 0.1
        ? "Xarajatlar o‘sishi daromaddan tez ketyapti — ixtiyoriy toifalarni ko'rib chiqing."
        : "Xarajatlar nazorat ostida.",
    });
  }
  if (fastest) {
    insights.push({
      icon: "🔥",
      tone: "warning",
      title: `Eng tez o‘sish: ${fastest.name}`,
      body: `${round2(fastest.change / 1000)} ming so'mga oshdi (${(fastest.changePct * 100).toFixed(0)}%).`,
    });
  }
  if (topCategory && topCategory.amount > 0) {
    insights.push({
      icon: "🥇",
      tone: "neutral",
      title: `Eng katta toifa: ${topCategory.name}`,
      body: `Bu oy xarajatning ${(topCategory.share * 100).toFixed(0)}% (${round2(topCategory.amount / 1000)} ming) shu toifaga ketdi.`,
    });
  }
  if (income > expense && income > 0) {
    insights.push({
      icon: "💎",
      tone: "positive",
      title: `Daromad xarajatdan ${round2((income - expense) / 1_000_000) >= 1 ? `${round2((income - expense) / 1_000_000)} mln` : `${round2((income - expense) / 1000)} ming`} yuqori`,
      body: "Ijobiy cash-flow — jamg'arma yoki maqsadlarga yo'naltirish mumkin.",
    });
  }
  insights.push({
    icon: "🏠",
    tone: mandatoryRatio > 0.6 ? "warning" : "neutral",
    title: `Majburiy xarajat ${(mandatoryRatio * 100).toFixed(0)}%`,
    body:
      mandatoryRatio > 0.6
        ? "Majburiy to'lovlar daromadning katta qismini olmoqda."
        : "Majburiy to'lovlar daromadga nisbatan barqaror.",
  });

  return {
    month: mk,
    today: { income: round2(todayIncome), expense: round2(todayExpense), net: round2(todayIncome - todayExpense) },
    monthTotals: {
      income: round2(income),
      expense: round2(expense),
      net: round2(net),
      avgDaily: round2(expense / daysElapsed),
      projectedMonthExpense: round2((expense / daysElapsed) * daysInMonth),
      savingsRate,
      mandatoryRatio,
      discretionaryRatio: expense > 0 ? 1 - mandatoryAmount / expense : 0,
      transferTotal: round2(transferTotal),
      daysElapsed,
      daysInMonth,
    },
    monthly,
    balanceHistory,
    categories: categoriesOut,
    incomeSources,
    topCategory,
    fastestGrowing: fastest ? { name: fastest.name, changePct: fastest.changePct, change: fastest.change } : null,
    recurringTotal: round2(params.recurringBase),
    anomalies: anomalies.slice(0, 5),
    insights,
  };
}

/* ============================ Financial health ============================ */

export type HealthFactor = {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type Health = {
  score: number;
  grade: "EXCELLENT" | "GOOD" | "STABLE" | "FAIR" | "CRITICAL";
  label: string;
  factors: HealthFactor[];
};

export function buildHealth(params: {
  analytics: Analytics;
  forecast: Forecast;
  debtsOwedByMe: number;
  debtsToMe: number;
}): Health {
  const a = params.analytics;
  const monthlyExpense = a.monthly.length
    ? a.monthly.reduce((s, m) => s + m.expense, 0) / Math.max(1, a.monthly.filter((m) => m.expense > 0).length)
    : a.monthTotals.expense;

  const savings = clamp((a.monthTotals.savingsRate / 0.25) * 100);
  const reserveMonths = monthlyExpense > 0 ? params.forecast.currentBalance / monthlyExpense : 3;
  const reserve = clamp((reserveMonths / 3) * 100);
  const debtRatio = a.monthTotals.income * 6 > 0 ? params.debtsOwedByMe / (a.monthTotals.income * 6) : params.debtsOwedByMe > 0 ? 1 : 0;
  const debt = clamp(100 - debtRatio * 100);
  const positiveMonths = a.monthly.filter((m) => m.net > 0).length;
  const stability = clamp((positiveMonths / Math.max(1, a.monthly.filter((m) => m.income > 0 || m.expense > 0).length)) * 100);
  const mandatory = clamp(((0.75 - a.monthTotals.mandatoryRatio) / 0.45) * 100);
  const riskPenalty = Math.min(35, params.forecast.riskDates.length * 4);
  const liquidity = clamp(100 - riskPenalty);

  const factors: HealthFactor[] = [
    { key: "savings", label: "Jamg‘arish ulushi", score: Math.round(savings), weight: 25, detail: `${(a.monthTotals.savingsRate * 100).toFixed(0)}% daromad qolmoqda` },
    { key: "reserve", label: "Zaxira darajasi", score: Math.round(reserve), weight: 20, detail: `${reserveMonths.toFixed(1)} oy xarajat qoplanadi` },
    { key: "debt", label: "Qarz bosimi", score: Math.round(debt), weight: 15, detail: params.debtsOwedByMe > 0 ? "Faol qarzlar mavjud" : "Faol qarz yo‘q" },
    { key: "stability", label: "Cash-flow barqarorligi", score: Math.round(stability), weight: 15, detail: `${positiveMonths}/6 oy ijobiy qoldiq` },
    { key: "mandatory", label: "Majburiy xarajat nisbati", score: Math.round(mandatory), weight: 10, detail: `${(a.monthTotals.mandatoryRatio * 100).toFixed(0)}% daromadga nisbatan` },
    { key: "liquidity", label: "Likvidlik xavfi", score: Math.round(liquidity), weight: 15, detail: params.forecast.riskDates.length ? `${params.forecast.riskDates.length} kun xavf ostida` : "Xavf aniqlanmadi" },
  ];

  const total = factors.reduce((s, f) => s + f.score * f.weight, 0) / factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(clamp(total));
  const grade: Health["grade"] =
    score >= 85 ? "EXCELLENT" : score >= 70 ? "GOOD" : score >= 55 ? "STABLE" : score >= 40 ? "FAIR" : "CRITICAL";
  const labelMap: Record<Health["grade"], string> = {
    EXCELLENT: "A‘lo",
    GOOD: "Yaxshi",
    STABLE: "Barqaror",
    FAIR: "O‘rtacha",
    CRITICAL: "Zaif",
  };

  return { score, grade, label: labelMap[grade], factors };
}
