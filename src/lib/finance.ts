import { addDays, addMonths, clamp, dayDiff, monthEnd, monthKey, monthStart, round2, todayISO, UZ_MONTHS } from "./money";
import { advancePeriod, rewindPeriod } from "./reconciliation";

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
  /** Ledger denomination. Optional only for legacy/pure-test fixtures. */
  currency?: string;
  date: string;
  note: string | null;
  source: string;
  recurringId: number | null;
  expectedIncomeId: number | null;
  debtId: number | null;
  debtPaymentId: number | null;
  creditPrincipalAmount: number | null;
  creditInterestAmount: number | null;
  creditFeeAmount: number | null;
  /** Legacy credit-plan payment without a principal/interest allocation. */
  isUnallocatedCreditPayment?: boolean;
  /** Scheduled occurrence date this transaction fulfils (occurrence identity). */
  plannedDate: string | null;
  occurrenceNumber: number | null;
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

/**
 * A total is meaningful only inside one denomination. Accounts in another
 * currency remain visible as separate ledgers until an explicit immutable FX
 * rate exists; they must never be added as if 1 USD = 1 UZS.
 */
export function totalBalanceInCurrency(
  accounts: Array<Pick<AccountView, "currency" | "currentBalance" | "isActive">>,
  currency: string,
): number {
  return round2(
    accounts
      .filter((account) => account.isActive && account.currency === currency)
      .reduce((sum, account) => sum + account.currentBalance, 0),
  );
}

/* ============================ Authoritative ledger balance ============================ */

export type LedgerTx = {
  accountId: number;
  toAccountId?: number | null;
  type: string;
  amount: number;
  date: string;
  isDeleted?: boolean;
};

export type AccountLedger = {
  accountId: number;
  initialBalance: number;
  inflow: number;
  outflow: number;
  transferIn: number;
  transferOut: number;
  txCount: number;
  currentBalance: number;
};

/**
 * THE single real-balance calculation of the product.
 *
 * Every factual surface (dashboard, accounts page, forecast start, bot report)
 * must derive its number from this function so a balance can never
 * disagree with the transaction history that produced it.
 *
 * Eligibility rules — deliberately identical to the History list, except for
 * the two documented exceptions:
 *   - soft-deleted transactions never count (they are not money);
 *   - a transaction dated in the FUTURE is a confirmed ledger event that has
 *     not happened yet, so it belongs to the forecast, not to today's balance.
 *
 * balance = initialBalance + income − expense + transferIn − transferOut
 */
export function computeLedgerBalances(
  accounts: Array<{ id: number; initialBalance: number }>,
  transactions: LedgerTx[],
  today: string,
): Map<number, AccountLedger> {
  const ledger = new Map<number, AccountLedger>();
  for (const account of accounts) {
    ledger.set(account.id, {
      accountId: account.id,
      initialBalance: account.initialBalance,
      inflow: 0,
      outflow: 0,
      transferIn: 0,
      transferOut: 0,
      txCount: 0,
      currentBalance: account.initialBalance,
    });
  }

  for (const tx of transactions) {
    if (tx.isDeleted) continue;
    // A future-dated real transaction is forecast, never today's balance.
    if (tx.date > today) continue;
    const source = ledger.get(tx.accountId);
    if (source) {
      source.txCount += 1;
      if (tx.type === "income") source.inflow += tx.amount;
      else if (tx.type === "expense") source.outflow += tx.amount;
      else if (tx.type === "transfer") source.transferOut += tx.amount;
    }
    if (tx.type === "transfer" && tx.toAccountId !== null && tx.toAccountId !== undefined) {
      const target = ledger.get(tx.toAccountId);
      if (target) target.transferIn += tx.amount;
    }
  }

  for (const entry of ledger.values()) {
    entry.currentBalance = round2(
      entry.initialBalance + entry.inflow - entry.outflow + entry.transferIn - entry.transferOut,
    );
    entry.inflow = round2(entry.inflow);
    entry.outflow = round2(entry.outflow);
    entry.transferIn = round2(entry.transferIn);
    entry.transferOut = round2(entry.transferOut);
  }
  return ledger;
}

export type LedgerCheck = {
  today: string;
  initialBalance: number;
  realIncome: number;
  realExpense: number;
  transferIn: number;
  transferOut: number;
  /** Ledger total over EVERY account of the user. */
  computedBalance: number;
  /** What the dashboard shows: active (non-archived) accounts only. */
  activeBalance: number;
  /** Money parked on archived accounts — invisible in the dashboard total. */
  excludedBalance: number;
  excludedAccounts: Array<{ id: number; name: string; balance: number }>;
  /** Confirmed but future-dated ledger events (excluded from today's balance). */
  futureIncome: number;
  futureExpense: number;
  /** True when active + excluded reconciles to the full ledger. */
  balanced: boolean;
};

/**
 * Diagnostic cross-check between HISTORY and REAL BALANCE (internal use only —
 * never exposed through a public endpoint).
 *
 * It makes the two documented exceptions explicit (future-dated and archived
 * accounts) so a mismatch can be attributed instead of guessed: if
 * `excludedBalance` is non-zero, real money is sitting on an archived account
 * and the dashboard total is legitimately smaller than the raw history sum.
 */
export function ledgerBalanceCheck(
  accounts: Array<{ id: number; name: string; initialBalance: number; isActive: boolean }>,
  transactions: LedgerTx[],
  today: string,
): LedgerCheck {
  const ledger = computeLedgerBalances(accounts, transactions, today);
  const live = transactions.filter((t) => !t.isDeleted);
  const past = live.filter((t) => t.date <= today);
  const future = live.filter((t) => t.date > today);
  const sum = (rows: LedgerTx[], type: string) => round2(rows.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0));

  let activeBalance = 0;
  let computedBalance = 0;
  const excludedAccounts: LedgerCheck["excludedAccounts"] = [];
  for (const account of accounts) {
    const balance = ledger.get(account.id)?.currentBalance ?? account.initialBalance;
    computedBalance += balance;
    if (account.isActive) activeBalance += balance;
    else if (Math.round(balance) !== 0) excludedAccounts.push({ id: account.id, name: account.name, balance: round2(balance) });
  }
  const excludedBalance = round2(computedBalance - activeBalance);

  return {
    today,
    initialBalance: round2(accounts.reduce((s, a) => s + a.initialBalance, 0)),
    realIncome: sum(past, "income"),
    realExpense: sum(past, "expense"),
    transferIn: round2(past.filter((t) => t.type === "transfer" && t.toAccountId).reduce((s, t) => s + t.amount, 0)),
    transferOut: sum(past, "transfer"),
    computedBalance: round2(computedBalance),
    activeBalance: round2(activeBalance),
    excludedBalance,
    excludedAccounts,
    futureIncome: sum(future, "income"),
    futureExpense: sum(future, "expense"),
    balanced: Math.abs(round2(activeBalance + excludedBalance) - round2(computedBalance)) < 0.01,
  };
}

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

export type PlanLifecycle = "active" | "paused" | "cancelled" | "completed";

/**
 * Plans → To'lovlar list lifecycle filter (§2/§7/§20).
 *   open      — the default view: ACTIVE + PAUSED (paused clearly badged)
 *   paused    — only paused
 *   completed — only completed terms / finished one-time plans
 *   cancelled — only user-cancelled (hidden from the default list)
 */
export type PlanListTab = "open" | "paused" | "completed" | "cancelled";

export function planInTab(status: PlanLifecycle, tab: PlanListTab): boolean {
  switch (tab) {
    case "open":
      return status === "active" || status === "paused";
    case "paused":
      return status === "paused";
    case "completed":
      return status === "completed";
    case "cancelled":
      return status === "cancelled";
  }
}

export function filterPlansByTab<T extends { status: PlanLifecycle }>(plans: T[], tab: PlanListTab): T[] {
  return plans.filter((p) => planInTab(p.status, tab));
}

/**
 * Money-load statistics (Majburiy/oy, Yillik jami, Muddatli jami/qolgan,
 * forecast load) count ONLY plans that produce future occurrences (§4/§16):
 * cancelled and completed contribute 0; paused is excluded from the active
 * load and shown separately via its own badge/tab instead.
 */
export function isActivePlanLoad(status: PlanLifecycle): boolean {
  return status === "active";
}

/**
 * THE authoritative lifecycle selector (§10/§39).
 *
 * Every surface — state builder views, forecast/planned occurrences, monthly
 * load, notifications and the Plans UI — must derive a plan's status from this
 * single function instead of mixing `isActive`, `termCompleted` and `status`
 * as independent concepts. Precedence:
 *   1. an exhausted term (or a finished one_time) is COMPLETED;
 *   2. an explicit stored status wins (cancelled / paused / completed);
 *   3. legacy rows fall back to the `isActive` flag.
 */
export function resolvePlanLifecycle(plan: {
  status?: string | null;
  isActive: boolean;
  planType?: string | null;
  frequency?: string | null;
  installmentCount?: number | null;
  installmentsPaid?: number | null;
  occurrenceCount?: number | null;
  occurrencesReceived?: number | null;
}): PlanLifecycle {
  const planType =
    plan.planType === "term"
      ? "term"
      : plan.planType === "one_time" || plan.frequency === "once"
        ? "one_time"
        : "recurring";
  if (planType === "term") {
    const total = plan.installmentCount ?? plan.occurrenceCount ?? 0;
    const done = plan.installmentsPaid ?? plan.occurrencesReceived ?? 0;
    // A cancelled term stays cancelled even when its counters are exhausted:
    // the user's intent outranks the natural end of the schedule.
    if (total > 0 && done >= total && plan.status !== "cancelled") return "completed";
  }
  if (plan.status === "cancelled" || plan.status === "paused" || plan.status === "completed") {
    return plan.status;
  }
  return plan.isActive ? "active" : "paused";
}

/** True when the plan still produces future occurrences (forecast/load rule). */
export function producesFutureOccurrences(plan: Parameters<typeof resolvePlanLifecycle>[0]): boolean {
  return isActivePlanLoad(resolvePlanLifecycle(plan));
}

/**
 * List order for payment/income plans (§16): overdue first, then today, then
 * the nearest upcoming date. Never alphabetical — the question the page must
 * answer is "what do I pay next", not "what starts with A".
 */
export function comparePlansByDue(
  a: { status: PlanLifecycle; daysLeft: number; name?: string; sourceName?: string },
  b: { status: PlanLifecycle; daysLeft: number; name?: string; sourceName?: string },
): number {
  const rank = (status: PlanLifecycle): number =>
    status === "active" ? 0 : status === "paused" ? 1 : status === "completed" ? 2 : 3;
  if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
  if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
  const an = a.name ?? a.sourceName ?? "";
  const bn = b.name ?? b.sourceName ?? "";
  return an.localeCompare(bn);
}

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
  /** Lifecycle state (active | paused | cancelled | completed). */
  status: PlanLifecycle;
  daysLeft: number;
  paidThisMonth: boolean;
  yearlyTotal: number;
  planType: "one_time" | "recurring" | "term";
  installmentCount: number | null;
  installmentsPaid: number;
  remainingInstallments: number | null;
  remainingTotal: number | null;
  /** Total value of the whole plan: term → count × amount, one_time → amount. */
  planTotal: number | null;
  termCompleted: boolean;
  /** Real (non-deleted) payments ever recorded for this plan — history link. */
  paymentsCount: number;
  /** Money actually paid into this plan's occurrences in the current month. */
  paidThisMonthAmount: number;
  /** Date of the newest real payment, or null when nothing was paid yet. */
  lastPaymentDate: string | null;
  /** First occurrence that is not in the past — restore/resume preview (§26). */
  nextOccurrenceDate: string;
  /** Scheduled date already passed and its occurrence is still unfulfilled. */
  isOverdue: boolean;
  /**
   * Credit schedule installments (irregular dates/amounts). Populated only for
   * term plans created from a bot-parsed credit schedule; `paid` is derived
   * from the real transactions fulfilling each occurrence.
   */
  installments: Array<{
    date: string;
    amount: number;
    occurrenceNumber: number;
    paid: boolean;
    principalAmount: number | null;
    interestAmount: number | null;
    feeAmount: number | null;
  }> | null;
  /** Present only when a credit schedule contains audited principal/fee splits. */
  creditSummary: {
    principalTotal: number;
    principalPaid: number;
    principalRemaining: number;
    interestTotal: number;
    interestPaid: number;
    interestRemaining: number;
    feeTotal: number;
    feePaid: number;
    feeRemaining: number;
  } | null;
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
  /** Lifecycle state (active | paused | cancelled | completed). */
  status: PlanLifecycle;
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
  /** Total value of the whole plan: term → count × amount, one_time → amount. */
  planTotal: number | null;
  termCompleted: boolean;
  /** Real (non-deleted) receipts ever recorded for this plan — history link. */
  receiptsCount: number;
  /** Money actually received for this plan's occurrences in the current month. */
  receivedThisMonthAmount: number;
  lastReceiptDate: string | null;
  /** First occurrence that is not in the past — restore/resume preview (§26). */
  nextOccurrenceDate: string;
  isOverdue: boolean;
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

/**
 * Returns all occurrence dates of a plan that fall between [today, horizonEnd].
 *
 * Occurrence identity is schedule-based, not counter-based, so un-doing a
 * payment (or an early payment) restores the exact scheduled dates without
 * silently shifting the sequence:
 *  - one_time  → at most its single date, only if today/future.
 *  - recurring → fast-forwarded from the next-due cursor (past dates skipped).
 *  - term      → the FULL finite schedule from `startDate`; fulfilled dates are
 *    removed by the caller via occurrence identity, so a gap left by a deleted
 *    middle installment does not truncate later unpaid occurrences.
 */
function planOccurrences(
  plan: {
    planType?: string;
    frequency: string;
    nextDueDate?: string;
    expectedDate?: string;
    startDate?: string | null;
    installmentCount?: number | null;
    occurrenceCount?: number | null;
    installmentsPaid?: number | null;
    occurrencesReceived?: number | null;
  },
  today: string,
  horizonEnd: string,
): string[] {
  const planType = plan.planType;
  const freq = plan.frequency === "once" ? "once" : plan.frequency;
  const cursorDate = plan.nextDueDate ?? plan.expectedDate;

  if (planType === "one_time" || freq === "once") {
    // An unpaid one-time payment does not stop existing when its date passes:
    // it becomes OVERDUE and is still owed (§17). Only the caller's fulfilment
    // check (occurrence identity) removes it.
    const d = cursorDate;
    return d !== undefined && d <= horizonEnd ? [d] : [];
  }

  if (planType === "term") {
    const count = plan.installmentCount ?? plan.occurrenceCount ?? 0;
    // Seed the schedule from `startDate` when present. Legacy rows (or test
    // fixtures) without it derive the seed by rewinding the cursor past the
    // already-fulfilled occurrences — valid while payments are contiguous.
    const paid = plan.installmentsPaid ?? plan.occurrencesReceived ?? 0;
    const seed = plan.startDate ?? (cursorDate !== undefined ? rewindPeriod(cursorDate, freq, paid) : cursorDate);
    const out: string[] = [];
    let cursor = seed;
    let guard = 0;
    let total = 0;
    while (total < count && cursor !== undefined && cursor <= horizonEnd && guard < 100_000) {
      total += 1;
      // Future occurrences plus the plan's own cursor when it is already
      // overdue — a missed installment is still owed money (§17).
      if (cursor >= today || cursor === cursorDate) out.push(cursor);
      cursor = advancePeriod(cursor, freq);
      guard += 1;
    }
    return out;
  }

  // recurring (indefinite): the cursor IS the plan's outstanding occurrence.
  // When it sits in the past the payment is overdue and must stay visible in
  // the money model (§17) — exactly one backlog item per plan, never a
  // months-long phantom backlog, because the schedule is then fast-forwarded.
  let cursor = cursorDate;
  const out: string[] = [];
  let guard = 0;
  if (cursor !== undefined && cursor < today) {
    if (cursor <= horizonEnd) out.push(cursor);
    while (cursor < today && guard < 100_000) {
      cursor = advancePeriod(cursor, freq);
      guard += 1;
    }
  }
  if (cursor === undefined || cursor < today) return out;

  guard = 0;
  while (cursor <= horizonEnd && guard < 200) {
    out.push(cursor);
    cursor = advancePeriod(cursor, freq);
    guard += 1;
  }
  return out;
}

export type TimelineKind =
  | "real_income"
  | "real_expense"
  | "planned_income"
  | "planned_expense"
  | "mandatory"
  | "optional"
  | "transfer"
  | "risk";

/** Canonical event consumed by forecast, monthly cards, chart and dashboard. */
export type FinancialTimelineEvent = {
  key: string;
  occurrenceId: string;
  date: string;
  kind: TimelineKind;
  phase: "real" | "plan" | "forecast" | "risk";
  label: string;
  min: number;
  base: number;
  max: number;
  certainty: "exact" | "estimated";
  mandatory: boolean;
  source: "transaction" | "recurring" | "expected" | "system";
  refId: number;
};

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
  source: "real" | "recurring" | "expected";
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
  freeToSpend: number;
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
  riskDates: Array<{ date: string; balance: number; deficit: number; cause: string; recoveryDate?: string | null; recoveryAmount?: number | null }>;
  planned: PlannedItem[];
  timeline: FinancialTimelineEvent[];
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
  /** Lifecycle status column; see resolvePlanLifecycle. */
  status?: string | null;
  categoryId: number | null;
  planType?: string;
  installmentCount?: number | null;
  installmentsPaid?: number | null;
  startDate?: string | null;
  /**
   * Credit schedule installments (irregular dates/amounts). When present for a
   * `term` plan, the forecast uses these exact occurrences instead of a
   * generated monthly cadence.
   */
  installments?: Array<{
    date: string;
    amount: number;
    occurrenceNumber: number;
    /**
     * Historical rows explicitly confirmed as paid while importing a credit.
     * They have no ledger transaction by design, so the forecast must exclude
     * them independently of transaction reconciliation.
     */
    settledOnImport?: boolean;
  }> | null;
};

type ReconciliationTx = {
  date: string;
  type: string;
  amount: number;
  recurringId?: number | null;
  expectedIncomeId?: number | null;
  plannedDate?: string | null;
  occurrenceNumber?: number | null;
  isDeleted?: boolean;
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
  /** Lifecycle status column; see resolvePlanLifecycle. */
  status?: string | null;
  linkedTransactionId: number | null;
  planType?: string;
  occurrenceCount?: number | null;
  occurrencesReceived?: number | null;
  startDate?: string | null;
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

/**
 * THE credit-schedule headline rule (§23).
 *
 * A bot-parsed credit is stored as ONE `term` plan whose parent row keeps only
 * a nominal AVERAGE amount (`jami / soni`) — the real money lives on the
 * installment rows, each with its OWN date AND amount. Every surface that must
 * say "qancha to'layman" therefore shows the NEXT UNPAID installment from this
 * helper, never the parent average (which matches no actual payment date).
 * When the schedule is fully paid, the last installment is returned (the
 * schedule's finale); regular plans without a schedule yield null.
 */
export function nextCreditInstallment(plan: {
  installments: Array<{ date: string; amount: number; paid: boolean }> | null;
}): { date: string; amount: number } | null {
  const schedule = plan.installments;
  if (!schedule || !schedule.length) return null;
  const next = schedule.find((i) => !i.paid) ?? schedule[schedule.length - 1];
  return { date: next.date, amount: next.amount };
}

export function buildPlanned(
  recurring: RecurringLike[],
  incomes: ExpectedLike[],
  today: string,
  horizonDays: number,
  transactions: ReconciliationTx[] = [],
): PlannedItem[] {
  const horizonEnd = addDays(today, horizonDays);
  const items: PlannedItem[] = [];

  for (const r of recurring) {
    // §14/§39: only ACTIVE plans produce future occurrences. Paused, cancelled
    // and completed plans contribute nothing to forecast, cash-flow or load —
    // and the rule is evaluated from the authoritative lifecycle selector, not
    // from the raw `isActive` flag, so a drifted row cannot leak into money.
    if (!producesFutureOccurrences(r)) continue;
    const remaining = remainingOccurrences(r);
    if (remaining !== null && remaining <= 0) continue;
    const { base, min, max } = rangeValue(r.amount, r.minAmount, r.maxAmount);
    const certainty = (r.certainty === "estimated" ? "estimated" : "exact") as "exact" | "estimated";
    // Credit schedule: each installment carries its OWN date AND amount (§6/§7),
    // so the forecast must not spread a single amount over a monthly cadence
    // nor annualize it (§21/§22/§23). Each unpaid installment is counted once.
    if (r.planType === "term" && r.installments && r.installments.length) {
      for (const inst of r.installments) {
        // Imported historical installments are opening state, not a future
        // obligation. Without this guard they were re-added on day 0 and
        // inflated cash-flow/risk figures despite showing as paid in Plans.
        if (inst.settledOnImport) continue;
        if (inst.date > horizonEnd) continue;
        const fulfilled = transactions.some(
          (t) => !t.isDeleted && t.type === "expense" && t.recurringId === r.id && (t.plannedDate ?? t.date) === inst.date,
        );
        if (fulfilled) continue;
        items.push({
          key: `r-${r.id}-${inst.date}`,
          date: inst.date,
          kind: "expense",
          label: r.name,
          min: inst.amount,
          base: inst.amount,
          max: inst.amount,
          certainty: "exact",
          mandatory: r.isMandatory,
          source: "recurring",
          refId: r.id,
        });
      }
      continue;
    }
    for (const date of planOccurrences(r, today, horizonEnd)) {
      // A fulfilled occurrence is reconciled by occurrence identity: the
      // transaction's *planned* date (not its actual, possibly early, date).
      const fulfilled = transactions.some(
        (t) => !t.isDeleted && t.type === "expense" && t.recurringId === r.id && (t.plannedDate ?? t.date) === date,
      );
      if (fulfilled) continue;
      items.push({
        key: `r-${r.id}-${date}`,
        date,
        kind: "expense",
        label: r.name,
        min,
        base,
        max,
        certainty,
        mandatory: r.isMandatory,
        source: "recurring",
        refId: r.id,
      });
    }
  }

  for (const inc of incomes) {
    if (!producesFutureOccurrences(inc)) continue;
    const remaining = remainingOccurrences(inc);
    if (remaining !== null && remaining <= 0) continue;
    const { base, min, max } = rangeValue(inc.amount, inc.minAmount, inc.maxAmount);
    for (const date of planOccurrences(inc, today, horizonEnd)) {
      // A received occurrence is fulfilled by its linked real transaction.
      // Match by occurrence identity (planned date) to avoid double-counting.
      const received = transactions.some(
        (t) => !t.isDeleted && t.type === "income" && t.expectedIncomeId === inc.id && (t.plannedDate ?? t.date) === date,
      );
      if (received) continue;
      // Past income never forecasted - REAL vs PLAN separation
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
  transactions?: Array<{ id: number; date: string; type: string; amount: number; note?: string | null; recurringId?: number | null; expectedIncomeId?: number | null; plannedDate?: string | null; occurrenceNumber?: number | null; isDeleted?: boolean }>;
  recurring: RecurringLike[];
  incomes: ExpectedLike[];
  minReserve: number;
  estimatedConfidence: number;
  today?: string;
  horizonDays?: number;
}): Forecast {
  const today = params.today ?? todayISO();
  const horizonDays = params.horizonDays ?? 90; // extended for monthly planning
  const horizonEnd = addDays(today, horizonDays);
  const planned = buildPlanned(params.recurring, params.incomes, today, horizonDays, params.transactions ?? []);
  const timeline: FinancialTimelineEvent[] = (params.transactions ?? [])
    .filter((tx) => !tx.isDeleted && tx.date <= today)
    .map((tx) => ({
      key: `tx-${tx.id}`,
      occurrenceId: `transaction:${tx.id}`,
      date: tx.date,
      kind: tx.type === "income" ? "real_income" : tx.type === "expense" ? "real_expense" : "transfer",
      phase: "real",
      label: tx.note ?? (tx.type === "income" ? "Daromad" : tx.type === "expense" ? "Xarajat" : "O'tkazma"),
      min: tx.amount,
      base: tx.amount,
      max: tx.amount,
      certainty: "exact",
      mandatory: false,
      source: "transaction",
      refId: tx.id,
    }));
  // Future-dated real transactions are confirmed ledger events, not plans.
  // Include them in the same timeline so forecast, calendar and monthly views
  // cannot disagree. Today and past events are already reflected in balance.
  for (const tx of params.transactions ?? []) {
    if (tx.isDeleted || tx.date <= today || tx.type === "transfer" || tx.date > horizonEnd) continue;
    const linkedRecurring = tx.recurringId ? params.recurring.find((item) => item.id === tx.recurringId) : undefined;
    planned.push({
      key: `tx-${tx.id}`,
      date: tx.date,
      kind: tx.type === "income" ? "income" : "expense",
      label: tx.note ?? linkedRecurring?.name ?? "Qayd etilgan operatsiya",
      min: tx.amount,
      base: tx.amount,
      max: tx.amount,
      certainty: "exact",
      // A future ledger expense that fulfils a mandatory occurrence remains a
      // mandatory commitment for safe-to-spend; only its source changes.
      mandatory: Boolean(linkedRecurring?.isMandatory),
      source: "real",
      refId: tx.id,
    });
  }
  planned.sort((a, b) => a.date.localeCompare(b.date));
  timeline.push(
    ...planned.map((item): FinancialTimelineEvent => ({
      key: item.key,
      occurrenceId: `${item.source}:${item.refId}:${item.date}`,
      date: item.date,
      kind:
        item.kind === "income"
          ? "planned_income"
          : item.mandatory
            ? "mandatory"
            : "optional",
      phase: item.source === "real" ? "forecast" : "plan",
      label: item.label,
      min: item.min,
      base: item.base,
      max: item.max,
      certainty: item.certainty,
      mandatory: item.mandatory,
      source: item.source === "real" ? "transaction" : item.source,
      refId: item.refId,
    })),
  );

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
  income.base = income.exactBase + income.estimatedBase;
  // Conservative still includes the lower bound of estimated income;
  // omitting it made the "minimum" scenario unnecessarily pessimistic and
  // inconsistent with the scenario definition.
  income.min = income.exactMin + income.estimatedMin;
  income.max = income.exactBase + income.estimatedMax;
  expense.base = expense.mandatoryBase + expense.optionalBase;
  expense.min = expense.mandatoryMin + expense.optionalMin;
  expense.max = expense.mandatoryMax + expense.optionalMax;

  // SAFE-TO-SPEND is what can be spent while preserving mandatory
  // commitments and reserve. Optional planned spending is deliberately a
  // separate FREE-TO-SPEND deduction.
  const daysToMonthEnd = dayDiff(today, monthEnd(today));
  const safeHorizonEnd = daysToMonthEnd >= 5 ? monthEnd(today) : addDays(today, 14);
  const safeWindow = planned.filter((p) => p.date <= safeHorizonEnd);
  const safeExactIncome = safeWindow.filter((p) => p.kind === "income" && p.certainty === "exact").reduce((s, p) => s + p.base, 0);
  const safeEstimatedIncome = safeWindow.filter((p) => p.kind === "income" && p.certainty === "estimated").reduce((s, p) => s + p.base, 0);
  const safeMandatory = safeWindow.filter((p) => p.kind === "expense" && p.mandatory).reduce((s, p) => s + p.base, 0);
  const safeOptional = safeWindow.filter((p) => p.kind === "expense" && !p.mandatory).reduce((s, p) => s + p.base, 0);

  const balance = params.currentBalance;
  const scenarios = {
    min: { balance: balance + income.min - expense.max, delta: income.min - expense.max },
    base: { balance: balance + income.base - expense.base, delta: income.base - expense.base },
    max: { balance: balance + income.max - expense.min, delta: income.max - expense.min },
  };

  const confidence = clamp(params.estimatedConfidence, 0, 100) / 100;
  const safeEstimatedWeighted = safeEstimatedIncome * confidence;
  // Conservative: subtract mandatory and optional (if configured) and reserve
  const safeToSpend = balance + safeExactIncome + safeEstimatedWeighted - safeMandatory - params.minReserve;
  const freeToSpend = safeToSpend - safeOptional;

  const cashflow: Forecast["cashflow"] = [];
  const riskDates: Forecast["riskDates"] = [];
  let runningBase = balance;
  let runningMin = balance;
  let runningMax = balance;
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(today, i);
    // Overdue obligations still have to be paid, so they hit the projection on
    // day 0 while keeping their true (past) planned date for labels (§17).
    const events = planned.filter((p) => p.date === date || (i === 0 && p.date < today));
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
      // Try to find recovery date (next income)
      let recoveryDate: string | null = null;
      let recoveryAmount: number | null = null;
      let probeBalance = runningMin;
      for (let j = i + 1; j <= horizonDays; j++) {
        const d2 = addDays(today, j);
        const ev2 = planned.filter((p) => p.date === d2);
        const in2 = ev2.filter((e) => e.kind === "income").reduce((s, e) => s + e.base, 0);
        const out2 = ev2.filter((e) => e.kind === "expense").reduce((s, e) => s + e.base, 0);
        const minIn2 = ev2.filter((e) => e.kind === "income").reduce((s, e) => s + e.min, 0);
        const maxOut2 = ev2.filter((e) => e.kind === "expense").reduce((s, e) => s + e.max, 0);
        probeBalance += minIn2 - maxOut2;
        if (probeBalance >= 0 && in2 > 0) {
          recoveryDate = d2;
          recoveryAmount = in2;
          break;
        }
      }
      riskDates.push({
        date,
        balance: round2(runningMin),
        deficit: round2(Math.abs(runningMin)),
        cause: events.filter((e) => e.kind === "expense").map((e) => e.label).join(", ") || "balans pasayishi",
        recoveryDate,
        recoveryAmount,
      });
    }
  }

  // Upcoming lists are projections of the reconciled timeline, never raw
  // plan rows. A fulfilled occurrence therefore cannot reappear here.
  const upcomingPayments = planned
    .filter((p) => p.kind === "expense")
    .filter((p, index, all) => all.findIndex((x) => x.source === p.source && x.refId === p.refId) === index)
    .filter((p) => dayDiff(today, p.date) <= 45)
    .map((p) => ({
      id: p.refId,
      name: p.label,
      categoryName: p.categoryName ?? null,
      date: p.date,
      daysLeft: dayDiff(today, p.date),
      base: p.base,
      min: p.min,
      max: p.max,
      certainty: p.certainty,
      mandatory: p.mandatory,
      status: dayDiff(today, p.date) < 0 ? ("overdue" as const) : dayDiff(today, p.date) === 0 ? ("today" as const) : ("upcoming" as const),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const upcomingIncome = planned
    .filter((p) => p.kind === "income")
    .filter((p, index, all) => all.findIndex((x) => x.source === p.source && x.refId === p.refId) === index)
    .filter((p) => dayDiff(today, p.date) <= 45)
    .map((p) => ({
      id: p.refId,
      sourceName: p.label,
      date: p.date,
      daysLeft: dayDiff(today, p.date),
      base: p.base,
      min: p.min,
      max: p.max,
      certainty: p.certainty,
      received: false,
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  timeline.push(
    ...riskDates.map((risk, index): FinancialTimelineEvent => ({
      key: `risk-${risk.date}-${index}`,
      occurrenceId: `risk:${risk.date}`,
      date: risk.date,
      kind: "risk",
      phase: "risk",
      label: risk.cause,
      min: risk.balance,
      base: risk.balance,
      max: risk.balance,
      certainty: "exact",
      mandatory: false,
      source: "system",
      refId: index,
    })),
  );
  timeline.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));

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
    freeToSpend: round2(freeToSpend),
    safeToSpendParts: {
      balance,
      confirmedIncome: round2(safeExactIncome),
      estimatedIncomeWeighted: round2(safeEstimatedWeighted),
      mandatoryUpcoming: round2(safeMandatory),
      optionalPlanned: round2(safeOptional),
      minReserve: params.minReserve,
    },
    cashflow,
    riskDates,
    planned,
    timeline,
    upcomingPayments,
    upcomingIncome,
  };
}

/* ============================ Monthly Finance Engine ============================ */

export type MonthlyDay = {
  date: string;
  realIncome: number;
  realExpense: number;
  plannedIncome: number;
  plannedExpense: number;
  projectedBase: number;
  projectedMin: number;
  projectedMax: number;
  events: PlannedItem[];
  timelineEvents: FinancialTimelineEvent[];
  isToday: boolean;
  isPast: boolean;
  isRisk: boolean;
  balance: number;
};

export type MonthlyView = {
  monthKey: string;
  monthStart: string;
  monthEnd: string;
  label: string; // e.g. "Avgust 2026"
  labelShort: string; // "Avg 26"
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  openingBalance: number;
  realIncome: number;
  realExpense: number;
  realNet: number;
  expectedIncomeBase: number;
  expectedIncomeMin: number;
  expectedIncomeMax: number;
  mandatoryExpenseBase: number;
  optionalExpenseBase: number;
  totalPlannedExpense: number;
  forecastClosingBase: number;
  forecastClosingMin: number;
  forecastClosingMax: number;
  lowestProjected: number;
  highestProjected: number;
  deficitDays: number;
  deficitAmount: number;
  safeToSpend?: number;
  daily: MonthlyDay[];
};

function monthLabelFull(key: string): { full: string; short: string } {
  const [y, m] = key.split("-").map(Number);
  const monthName = UZ_MONTHS[(m ?? 1) - 1] ?? "";
  const cap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return { full: `${cap} ${y}`, short: `${monthName.slice(0, 3)} ${String(y).slice(2)}` };
}

export function buildMonthlyView(params: {
  monthKey: string;
  today: string;
  currentBalance: number;
  transactions: Array<{ date: string; type: string; amount: number }>; // ledger rows; engine enforces date semantics
  /**
   * Rows that are eligible for income/expense reporting.  Debt principal is a
   * real cash movement, but not earned income or consumption spending, so it
   * stays in `transactions` for balance reconciliation and is omitted here.
   */
  reportingTransactions?: Array<{ date: string; type: string; amount: number }>;
  planned: PlannedItem[];
  cashflow: Forecast["cashflow"];
  analytics: Analytics;
  forecast: Forecast;
}): MonthlyView {
  const { monthKey: mk, today, currentBalance, planned, cashflow, analytics, forecast } = params;
  const transactions = params.transactions.filter((t) => t.date <= today);
  const reportingTransactions = (params.reportingTransactions ?? params.transactions).filter((t) => t.date <= today);
  const mStart = monthStart(mk + "-01");
  const mEnd = monthEnd(mStart);
  const { full, short } = monthLabelFull(mk);
  const isCurrent = mk === monthKey(today);
  const isPast = mk < monthKey(today);
  const isFuture = mk > monthKey(today);

  // Opening balance
  let openingBalance: number;
  if (isCurrent) {
    // Opening cash must include every confirmed movement, including debt
    // principal. Analytics intentionally excludes debt principal, so using
    // its net here would make the liquid-balance timeline start incorrectly.
    const monthNet = transactions
      .filter((t) => t.date.startsWith(mk))
      .reduce((sum, t) => sum + (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0), 0);
    openingBalance = currentBalance - monthNet;
  } else if (isPast) {
    // For past months, opening = balance at day before month start
    // Compute by subtracting all transactions from monthStart onwards up to today
    let netSinceStart = 0;
    for (const t of transactions) {
      if (t.date >= mStart) {
        if (t.type === "income") netSinceStart += t.amount;
        else if (t.type === "expense") netSinceStart -= t.amount;
      }
    }
    openingBalance = currentBalance - netSinceStart;
  } else {
    // Future month: opening = projected balance at day before month start
    const prevDay = addDays(mStart, -1);
    const cf = cashflow.find((c) => c.date === prevDay);
    if (cf) {
      openingBalance = cf.projectedBase;
    } else {
      // Fallback: accumulate planned net from today to prevDay
      let running = currentBalance;
      const todayIdx = cashflow.findIndex((c) => c.date === today);
      for (let i = todayIdx + 1; i < cashflow.length; i++) {
        const c = cashflow[i];
        if (c.date > prevDay) break;
        running = c.projectedBase;
      }
      // If still not found (beyond horizon), estimate from planned
      if (running === currentBalance && cashflow.length && cashflow[cashflow.length - 1].date < prevDay) {
        let extra = 0;
        for (const p of planned) {
          if (p.date > cashflow[cashflow.length - 1].date && p.date <= prevDay) {
            extra += p.kind === "income" ? p.base : -p.base;
          }
        }
        running += extra;
      }
      openingBalance = running;
    }
  }

  // Real income/expense for this month
  let realIncome = 0;
  let realExpense = 0;
  if (isCurrent) {
    realIncome = analytics.monthTotals.income;
    realExpense = analytics.monthTotals.expense;
  } else if (isPast) {
    const found = analytics.monthly.find((m) => m.month === mk);
    if (found) {
      realIncome = found.income;
      realExpense = found.expense;
    } else {
      // fallback from transactions
      for (const t of reportingTransactions) {
        if (t.date.startsWith(mk + "-")) {
          if (t.type === "income") realIncome += t.amount;
          else if (t.type === "expense") realExpense += t.amount;
        }
      }
    }
  }

  // Planned for this month (future events)
  const monthPlanned = planned.filter((p) => monthKey(p.date) === mk);
  const expectedIncomeBase = monthPlanned.filter((p) => p.kind === "income").reduce((s, p) => s + p.base, 0);
  const expectedIncomeMin = monthPlanned.filter((p) => p.kind === "income").reduce((s, p) => s + p.min, 0);
  const expectedIncomeMax = monthPlanned.filter((p) => p.kind === "income").reduce((s, p) => s + p.max, 0);
  const mandatoryExpenseBase = monthPlanned.filter((p) => p.kind === "expense" && p.mandatory).reduce((s, p) => s + p.base, 0);
  const optionalExpenseBase = monthPlanned.filter((p) => p.kind === "expense" && !p.mandatory).reduce((s, p) => s + p.base, 0);

  // Build daily breakdown
  const daily: MonthlyDay[] = [];
  let runningBase = openingBalance;
  let runningMin = openingBalance;
  let runningMax = openingBalance;
  let lowest = isCurrent ? Number.POSITIVE_INFINITY : openingBalance;
  let highest = isCurrent ? Number.NEGATIVE_INFINITY : openingBalance;
  let deficitDays = 0;
  let maxDeficit = 0;

  // Map real transactions per day for quick lookup
  const realByDate = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    if (!t.date.startsWith(mk)) continue;
    const entry = realByDate.get(t.date) ?? { income: 0, expense: 0 };
    if (t.type === "income") entry.income += t.amount;
    else if (t.type === "expense") entry.expense += t.amount;
    realByDate.set(t.date, entry);
  }

  for (let d = mStart; d <= mEnd; d = addDays(d, 1)) {
    const isToday = d === today;
    const isPastDay = d < today;
    const events = planned.filter((p) => p.date === d);
    const timelineEvents = forecast.timeline.filter((event) => event.date === d && event.kind !== "risk");
    const plannedIncome = events.filter((e) => e.kind === "income").reduce((s, e) => s + e.base, 0);
    const plannedExpense = events.filter((e) => e.kind === "expense").reduce((s, e) => s + e.base, 0);
    const plannedIncomeMin = events.filter((e) => e.kind === "income").reduce((s, e) => s + e.min, 0);
    const plannedIncomeMax = events.filter((e) => e.kind === "income").reduce((s, e) => s + e.max, 0);
    const plannedExpenseMin = events.filter((e) => e.kind === "expense").reduce((s, e) => s + e.min, 0);
    const plannedExpenseMax = events.filter((e) => e.kind === "expense").reduce((s, e) => s + e.max, 0);

    const real = realByDate.get(d) ?? { income: 0, expense: 0 };

    if (!isFuture && isPastDay) {
      // Past days: only real matters
      runningBase += real.income - real.expense;
      runningMin += real.income - real.expense;
      runningMax += real.income - real.expense;
    } else if (isToday) {
      // Today: real already included in currentBalance, but for daily we show real for today plus planned that already happened?
      // Our opening already accounts for month net up to today, so running after today is currentBalance if we processed all past days.
      // To avoid double counting, set running to currentBalance at end of today if isCurrent month.
      if (isCurrent) {
        // Recompute running up to today should equal currentBalance
        // We have been accumulating past days; include today's real
        runningBase += real.income - real.expense;
        runningMin = runningBase;
        runningMax = runningBase;
        // For future part of today (planned that hasn't happened yet today?), we keep as is - but forecast cashflow for today includes planned events of today.
        // If there are planned events today that haven't been realized as real, they will have been already counted in forecast cashflow.
        // To align, if planned events exist today and not yet realized, add them for future projection? Simplification: add planned for today as well.
        runningBase += plannedIncome - plannedExpense;
        runningMin += plannedIncomeMin - plannedExpenseMax;
        runningMax += plannedIncomeMax - plannedExpenseMin;
      } else {
        runningBase += real.income - real.expense;
        runningMin += real.income - real.expense;
        runningMax += real.income - real.expense;
      }
    } else {
      // Future day
      runningBase += plannedIncome - plannedExpense;
      runningMin += plannedIncomeMin - plannedExpenseMax;
      runningMax += plannedIncomeMax - plannedExpenseMin;
    }

    // Historical dips are useful for a past-month audit, but must not be
    // presented as a current forecast risk. Current-month projection starts
    // today; future-month projection starts at that month's opening.
    const projectionDay = isPast || isFuture || d >= today;
    if (projectionDay) {
      lowest = Math.min(lowest, runningBase, runningMin);
      highest = Math.max(highest, runningBase, runningMax);
      if (runningMin < 0) {
        deficitDays += 1;
        maxDeficit = Math.max(maxDeficit, Math.abs(runningMin));
      }
    }

    daily.push({
      date: d,
      realIncome: real.income,
      realExpense: real.expense,
      plannedIncome,
      plannedExpense,
      projectedBase: round2(runningBase),
      projectedMin: round2(runningMin),
      projectedMax: round2(runningMax),
      events,
      timelineEvents,
      isToday,
      isPast: isPastDay,
      isRisk: runningMin < 0,
      balance: round2(runningBase),
    });
  }

  // Determine forecast closing
  const forecastClosingBase = daily.length ? daily[daily.length - 1].projectedBase : openingBalance;
  const forecastClosingMin = daily.length ? daily[daily.length - 1].projectedMin : openingBalance;
  const forecastClosingMax = daily.length ? daily[daily.length - 1].projectedMax : openingBalance;

  // For current month, if we are past beginning, the running should align with forecast's cashflow at monthEnd if within horizon.
  // Adjust using forecast cashflow if available
  let finalClosingBase = forecastClosingBase;
  let finalClosingMin = forecastClosingMin;
  let finalClosingMax = forecastClosingMax;
  const cfEnd = cashflow.find((c) => c.date === mEnd);
  if (cfEnd && (isCurrent || isFuture)) {
    finalClosingBase = cfEnd.projectedBase;
    finalClosingMin = cfEnd.projectedMin;
    finalClosingMax = cfEnd.projectedMax;
  }

  return {
    monthKey: mk,
    monthStart: mStart,
    monthEnd: mEnd,
    label: full,
    labelShort: short,
    isCurrent,
    isPast,
    isFuture,
    openingBalance: round2(openingBalance),
    realIncome: round2(realIncome),
    realExpense: round2(realExpense),
    realNet: round2(realIncome - realExpense),
    expectedIncomeBase: round2(expectedIncomeBase),
    expectedIncomeMin: round2(expectedIncomeMin),
    expectedIncomeMax: round2(expectedIncomeMax),
    mandatoryExpenseBase: round2(mandatoryExpenseBase),
    optionalExpenseBase: round2(optionalExpenseBase),
    totalPlannedExpense: round2(mandatoryExpenseBase + optionalExpenseBase),
    forecastClosingBase: round2(finalClosingBase),
    forecastClosingMin: round2(finalClosingMin),
    forecastClosingMax: round2(finalClosingMax),
    lowestProjected: round2(Number.isFinite(lowest) ? lowest : openingBalance),
    highestProjected: round2(Number.isFinite(highest) ? highest : openingBalance),
    deficitDays,
    deficitAmount: round2(maxDeficit),
    safeToSpend: isCurrent ? forecast.safeToSpend : undefined,
    daily,
  };
}

export function buildMonthlySeries(params: {
  today: string;
  currentBalance: number;
  transactions: Array<{ date: string; type: string; amount: number }>;
  reportingTransactions?: Array<{ date: string; type: string; amount: number }>;
  planned: PlannedItem[];
  cashflow: Forecast["cashflow"];
  analytics: Analytics;
  forecast: Forecast;
  monthsBefore?: number;
  monthsAfter?: number;
}): MonthlyView[] {
  const { today, monthsBefore = 1, monthsAfter = 4 } = params;
  const result: MonthlyView[] = [];
  const start = monthStart(addMonths(monthStart(today), -monthsBefore));
  for (let i = 0; i < monthsBefore + monthsAfter + 1; i++) {
    const mkDate = addMonths(start, i);
    const mk = monthKey(mkDate);
    result.push(
      buildMonthlyView({
        monthKey: mk,
        today,
        currentBalance: params.currentBalance,
        transactions: params.transactions,
        reportingTransactions: params.reportingTransactions,
        planned: params.planned,
        cashflow: params.cashflow,
        analytics: params.analytics,
        forecast: params.forecast,
      }),
    );
  }
  return result;
}

/* ============================ Month-scoped summaries ============================ */

export type MonthIncomeSummary = {
  month: string;
  label: string;
  exactBase: number;
  exactMin: number;
  estimatedBase: number;
  estimatedMin: number;
  estimatedMax: number;
  base: number;
  min: number;
  max: number;
};

/**
 * "Aniq kutilmoqda / Taxminiy / Jami prognoz" for the CURRENT month only.
 * Only open expected-income occurrences (source === "expected") whose planned
 * date falls inside [monthStart(today), monthEnd(today)] are counted — next
 * months must not leak into the current month's top statistics.
 */
export function buildCurrentMonthIncome(planned: PlannedItem[], today: string): MonthIncomeSummary {
  const mk = monthKey(today);
  const items = planned.filter((p) => p.kind === "income" && p.source === "expected" && monthKey(p.date) === mk);
  const exact = items.filter((p) => p.certainty === "exact");
  const estimated = items.filter((p) => p.certainty === "estimated");
  const exactBase = exact.reduce((s, p) => s + p.base, 0);
  const exactMin = exact.reduce((s, p) => s + p.min, 0);
  const estimatedBase = estimated.reduce((s, p) => s + p.base, 0);
  const estimatedMin = estimated.reduce((s, p) => s + p.min, 0);
  const estimatedMax = estimated.reduce((s, p) => s + p.max, 0);
  const base = exactBase + estimatedBase;
  const min = exactMin + estimatedMin;
  const max = exactBase + estimatedMax;
  const monthName = UZ_MONTHS[Number(mk.slice(5, 7)) - 1] ?? "";
  return {
    month: mk,
    label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${mk.slice(0, 4)}`,
    exactBase: round2(exactBase),
    exactMin: round2(exactMin),
    estimatedBase: round2(estimatedBase),
    estimatedMin: round2(estimatedMin),
    estimatedMax: round2(estimatedMax),
    base: round2(base),
    min: round2(min),
    max: round2(max),
  };
}

export type MonthPlanSummary = {
  month: string;
  label: string;
  /** Mandatory obligations scheduled in this month (paid + still open). */
  mandatoryTotal: number;
  optionalTotal: number;
  total: number;
  /** Real money already paid into this month's plan occurrences. */
  paid: number;
  paidMandatory: number;
  /** Still open (unfulfilled) occurrences of this month. */
  remaining: number;
  remainingMandatory: number;
  /** Progress of the mandatory load, 0..1 (1 = everything paid). */
  progress: number;
  planCount: number;
  paidCount: number;
  remainingCount: number;
  overdueCount: number;
  overdueAmount: number;
  /** The next thing to pay: overdue first, then today, then nearest (§15). */
  nearest: {
    id: number;
    name: string;
    date: string;
    daysLeft: number;
    base: number;
    mandatory: boolean;
    certainty: "exact" | "estimated";
    status: "overdue" | "today" | "upcoming";
  } | null;
};

/**
 * CURRENT-MONTH payment load — the primary metric of the Plans page (§28/§29).
 *
 * The product is monthly planning, so the page leads with "what does this month
 * cost, how much of it is already paid, what is left" instead of an annual
 * total. Both halves come from the SAME reconciled sources the forecast uses:
 *   paid      → real, non-deleted transactions linked to a plan whose
 *               *occurrence* (plannedDate) falls in this month;
 *   remaining → open planned occurrences of this month (fulfilled ones were
 *               already removed by buildPlanned's occurrence reconciliation).
 * Cancelled / paused / completed plans contribute nothing on either side of
 * the equation, because neither source can contain them.
 */
export function buildCurrentMonthPlan(
  planned: PlannedItem[],
  transactions: Array<{
    type: string;
    amount: number;
    date: string;
    recurringId?: number | null;
    plannedDate?: string | null;
    isDeleted?: boolean;
  }>,
  mandatoryByPlanId: Map<number, boolean>,
  today: string,
): MonthPlanSummary {
  const mk = monthKey(today);
  const open = planned.filter((p) => p.kind === "expense" && p.source === "recurring" && monthKey(p.date) === mk);
  const paidTx = transactions.filter(
    (t) =>
      !t.isDeleted &&
      t.type === "expense" &&
      t.recurringId !== null &&
      t.recurringId !== undefined &&
      monthKey(t.plannedDate ?? t.date) === mk,
  );

  const paidMandatory = paidTx
    .filter((t) => mandatoryByPlanId.get(Number(t.recurringId)) === true)
    .reduce((s, t) => s + t.amount, 0);
  const paid = paidTx.reduce((s, t) => s + t.amount, 0);
  const remainingMandatory = open.filter((p) => p.mandatory).reduce((s, p) => s + p.base, 0);
  const remaining = open.reduce((s, p) => s + p.base, 0);
  const overdue = open.filter((p) => p.date < today);

  const mandatoryTotal = paidMandatory + remainingMandatory;
  const optionalTotal = paid - paidMandatory + (remaining - remainingMandatory);
  const nearestItem = [...open].sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const monthName = UZ_MONTHS[Number(mk.slice(5, 7)) - 1] ?? "";

  return {
    month: mk,
    label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${mk.slice(0, 4)}`,
    mandatoryTotal: round2(mandatoryTotal),
    optionalTotal: round2(optionalTotal),
    total: round2(mandatoryTotal + optionalTotal),
    paid: round2(paid),
    paidMandatory: round2(paidMandatory),
    remaining: round2(remaining),
    remainingMandatory: round2(remainingMandatory),
    progress: mandatoryTotal > 0 ? clamp(paidMandatory / mandatoryTotal, 0, 1) : remaining === 0 && paid > 0 ? 1 : 0,
    planCount: new Set([...open.map((p) => p.refId), ...paidTx.map((t) => Number(t.recurringId))]).size,
    paidCount: paidTx.length,
    remainingCount: open.length,
    overdueCount: overdue.length,
    overdueAmount: round2(overdue.reduce((s, p) => s + p.base, 0)),
    nearest: nearestItem
      ? {
          id: nearestItem.refId,
          name: nearestItem.label,
          date: nearestItem.date,
          daysLeft: dayDiff(today, nearestItem.date),
          base: round2(nearestItem.base),
          mandatory: nearestItem.mandatory,
          certainty: nearestItem.certainty,
          status: nearestItem.date < today ? "overdue" : nearestItem.date === today ? "today" : "upcoming",
        }
      : null,
  };
}

/** The cash-flow days belonging to a single month key. */
export function monthCashflow(cashflow: Forecast["cashflow"], mk: string): Forecast["cashflow"] {
  return cashflow.filter((c) => monthKey(c.date) === mk);
}

/** The planned items belonging to a single month key. */
export function monthPlanned(planned: PlannedItem[], mk: string): PlannedItem[] {
  return planned.filter((p) => monthKey(p.date) === mk);
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
    projectedAvgDaily: number;
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
  incomeSources: Array<{
    id: number | null;
    name: string;
    icon: string;
    amount: number;
    share: number;
  }>;
  topCategory: { name: string; amount: number; share: number } | null;
  fastestGrowing: { name: string; changePct: number; change: number } | null;
  recurringTotal: number;
  /** Cash-only movements that are deliberately outside income/expense. */
  balanceMovements: BalanceMovements;
  anomalies: Array<{ id: number; name: string; amount: number; date: string; ratio: number }>;
  insights: Insight[];
};

export type BalanceMovements = {
  debtBorrowed: number;
  debtLent: number;
  debtRepaid: number;
  debtRecovered: number;
  /** Principal repayment changes balance, but is not consumption spending. */
  creditPrincipalPaid: number;
  /** Legacy credit payment whose principal/interest split is not available. */
  creditUnallocatedPaid: number;
  /** Kept explicit so the balance-movement card can disclose true cost. */
  creditInterestAndFees: number;
};

const EMPTY_BALANCE_MOVEMENTS: BalanceMovements = {
  debtBorrowed: 0,
  debtLent: 0,
  debtRepaid: 0,
  debtRecovered: 0,
  creditPrincipalPaid: 0,
  creditUnallocatedPaid: 0,
  creditInterestAndFees: 0,
};

/**
 * Classify completed ledger rows without ever relabelling principal as revenue
 * or consumption. The output is intentionally a separate reporting axis: it
 * explains why balance changed while preserving clean income/expense metrics.
 */
export function buildBalanceMovements(params: {
  transactions: Array<{
    date: string;
    type: string;
    amount: number;
    debtId?: number | null;
    debtPaymentId?: number | null;
    creditPrincipalAmount?: number | null;
    creditInterestAmount?: number | null;
    creditFeeAmount?: number | null;
    isUnallocatedCreditPayment?: boolean;
    isDeleted?: boolean;
  }>;
  month: string;
  today?: string;
}): BalanceMovements {
  const today = params.today ?? todayISO();
  const result = { ...EMPTY_BALANCE_MOVEMENTS };
  for (const tx of params.transactions) {
    if (tx.isDeleted || tx.date > today || !tx.date.startsWith(params.month)) continue;
    if (tx.debtId) {
      if (tx.debtPaymentId) {
        if (tx.type === "expense") result.debtRepaid += tx.amount;
        else if (tx.type === "income") result.debtRecovered += tx.amount;
      } else if (tx.type === "income") result.debtBorrowed += tx.amount;
      else if (tx.type === "expense") result.debtLent += tx.amount;
      continue;
    }
    if (tx.type === "expense" && tx.isUnallocatedCreditPayment) {
      result.creditUnallocatedPaid += tx.amount;
      continue;
    }
    if (tx.type === "expense" && tx.creditPrincipalAmount !== null && tx.creditPrincipalAmount !== undefined) {
      const principal = Math.max(0, Math.min(tx.amount, tx.creditPrincipalAmount));
      result.creditPrincipalPaid += principal;
      // Imported allocations are authoritative. For an older repaired row
      // where only principal is known, the remainder correctly stays zero.
      result.creditInterestAndFees += Math.max(0, tx.amount - principal);
    }
  }
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, round2(value)])) as BalanceMovements;
}

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
    /** Debt principal remains in the cash ledger but is never revenue/cost. */
    debtId?: number | null;
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
  // Debt opening and repayment transactions move available cash and therefore
  // must remain in History/ledger. They are deliberately excluded from every
  // income/expense metric below: principal is neither earned nor spent.
  const active = params.transactions.filter((t) => !t.isDeleted && t.date <= today && t.debtId == null);
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

  const prevKey = monthKey(addMonths(start, -1));
  const byCat = new Map<number | "uncategorized", {
    amount: number;
    prev: number;
    count: number;
    cat: (typeof params.categories)[number] | null;
  }>();
  for (const t of active) {
    if (t.type !== "expense") continue;
    const key = monthKey(t.date);
    if (key !== mk && key !== prevKey) continue;
    const cat = t.categoryId !== null ? catById.get(t.categoryId) ?? null : null;
    const categoryKey = cat?.id ?? "uncategorized";
    const entry = byCat.get(categoryKey) ?? { amount: 0, prev: 0, count: 0, cat };
    if (key === mk) {
      entry.amount += t.amount;
      entry.count += 1;
    } else entry.prev += t.amount;
    byCat.set(categoryKey, entry);
  }

  const categoriesOut: Analytics["categories"] = [...byCat.values()]
    .map((v) => ({
      id: v.cat?.id ?? null,
      name: v.cat?.name ?? "Boshqa",
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

  const incomeMap = new Map<number | "uncategorized", {
    id: number | null;
    name: string;
    icon: string;
    amount: number;
  }>();
  for (const t of active) {
    if (t.type !== "income" || !t.date.startsWith(mk)) continue;
    const cat = t.categoryId !== null ? catById.get(t.categoryId) ?? null : null;
    const categoryKey = cat?.id ?? "uncategorized";
    const source = incomeMap.get(categoryKey) ?? {
      id: cat?.id ?? null,
      name: cat?.name ?? "Daromad",
      icon: cat?.icon ?? "•",
      amount: 0,
    };
    source.amount += t.amount;
    incomeMap.set(categoryKey, source);
  }
  const incomeSources: Analytics["incomeSources"] = [...incomeMap.values()]
    .map((source) => ({
      ...source,
      amount: round2(source.amount),
      share: income > 0 ? source.amount / income : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const mandatoryAmount = categoriesOut.filter((c) => c.isEssential).reduce((s, c) => s + c.amount, 0);

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
      body:
        diff > 0.1
          ? "Xarajatlar o'sishi daromaddan tez ketyapti — ixtiyoriy toifalarni ko'rib chiqing."
          : "Xarajatlar nazorat ostida.",
    });
  }
  if (fastest) {
    insights.push({
      icon: "🔥",
      tone: "warning",
      title: `Eng tez o'sish: ${fastest.name}`,
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
      // avgDaily is strictly actual spending. Forecast projections have a
      // separate name so callers cannot mistake a historical metric for a
      // planned one.
      avgDaily: round2(expense / daysElapsed),
      projectedAvgDaily: round2(expense / daysElapsed),
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
    balanceMovements: { ...EMPTY_BALANCE_MOVEMENTS },
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
    { key: "savings", label: "Jamg'arish ulushi", score: Math.round(savings), weight: 25, detail: `${(a.monthTotals.savingsRate * 100).toFixed(0)}% daromad qolmoqda` },
    { key: "reserve", label: "Zaxira darajasi", score: Math.round(reserve), weight: 20, detail: `${reserveMonths.toFixed(1)} oy xarajat qoplanadi` },
    { key: "debt", label: "Qarz bosimi", score: Math.round(debt), weight: 15, detail: params.debtsOwedByMe > 0 ? "Faol qarzlar mavjud" : "Faol qarz yo'q" },
    { key: "stability", label: "Cash-flow barqarorligi", score: Math.round(stability), weight: 15, detail: `${positiveMonths}/6 oy ijobiy qoldiq` },
    { key: "mandatory", label: "Majburiy xarajat nisbati", score: Math.round(mandatory), weight: 10, detail: `${(a.monthTotals.mandatoryRatio * 100).toFixed(0)}% daromadga nisbatan` },
    { key: "liquidity", label: "Likvidlik xavfi", score: Math.round(liquidity), weight: 15, detail: params.forecast.riskDates.length ? `${params.forecast.riskDates.length} kun xavf ostida` : "Xavf aniqlanmadi" },
  ];

  const total = factors.reduce((s, f) => s + f.score * f.weight, 0) / factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(clamp(total));
  const grade: Health["grade"] =
    score >= 85 ? "EXCELLENT" : score >= 70 ? "GOOD" : score >= 55 ? "STABLE" : score >= 40 ? "FAIR" : "CRITICAL";
  const labelMap: Record<Health["grade"], string> = {
    EXCELLENT: "A'lo",
    GOOD: "Yaxshi",
    STABLE: "Barqaror",
    FAIR: "O'rtacha",
    CRITICAL: "Zaif",
  };

  return { score, grade, label: labelMap[grade], factors };
}
