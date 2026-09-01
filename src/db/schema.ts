import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  bigint,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Personal Financial Operating System — data model.
 * All money values are stored as numeric(18,2) mapped to JS numbers (UZS / USD).
 * Important business rule: financial records are never hard-deleted (soft delete only).
 */

const money = (name: string) =>
  numeric(name, { precision: 18, scale: 2, mode: "number" });

export const users = pgTable(
  "users",
  {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }),
  firstName: text("first_name").notNull().default("Foydalanuvchi"),
  lastName: text("last_name"),
  username: text("username"),
  currency: text("currency").notNull().default("UZS"),
  locale: text("locale").notNull().default("uz"),
  theme: text("theme").notNull().default("system"),
  minReserve: money("min_reserve").notNull().default(0),
  estimatedIncomeConfidence: integer("estimated_income_confidence")
    .notNull()
    .default(50),
  notifyPayments: boolean("notify_payments").notNull().default(true),
  notifyIncome: boolean("notify_income").notNull().default(true),
  notifyBudget: boolean("notify_budget").notNull().default(true),
  notifyRisk: boolean("notify_risk").notNull().default(true),
  role: text("role").notNull().default("USER"), // USER | ADMIN (server-managed only)
  isBlocked: boolean("is_blocked").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_telegram_id_key").on(t.telegramId),
    check("users_role_check", sql`${t.role} in ('USER', 'ADMIN')`),
    check("users_confidence_check", sql`${t.estimatedIncomeConfidence} between 0 and 100`),
    check("users_reserve_check", sql`${t.minReserve} >= 0`),
  ],
);

/**
 * Pending drafts held for the Telegram confirmation flow.
 * Bot writes a draft, sends a confirmation message with `callback_data=draft:<id>`,
 * user taps ✅ → mutation applied, ❌ → draft archived.
 */
export const pendingDrafts = pgTable(
  "pending_drafts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "number" }),
    messageId: integer("message_id"),
    kind: text("kind").notNull().default("transaction"),
    /** One Telegram message can produce several drafts; they share a batch id. */
    batchId: text("batch_id"),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | confirmed | cancelled | expired
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("pending_drafts_user_idx").on(t.userId, t.status),
    index("pending_drafts_batch_idx").on(t.batchId),
    check("pending_drafts_status_check", sql`${t.status} in ('pending', 'processing', 'confirmed', 'cancelled', 'expired')`),
  ],
);

/**
 * Idempotency log for Telegram webhook updates.
 * Guarantees an `update_id` is processed exactly once even if Telegram retries.
 */
export const telegramUpdates = pgTable(
  "telegram_updates",
  {
    updateId: bigint("update_id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Duplicate protection + audit trail for Telegram image intelligence (§24).
 *
 * This table stores NO financial data and NO image bytes — only an irreversible
 * fingerprint (file_unique_id + content hash) so the same picture cannot create
 * the same transactions twice. Confirmed money always lives in the shared
 * finance tables below.
 */
export const imageIntakes = pgTable(
  "image_intakes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** sha256(file_unique_id : content hash) — never the image itself. */
    fingerprint: text("fingerprint").notNull(),
    chatId: bigint("chat_id", { mode: "number" }),
    messageId: integer("message_id"),
    /** Links every draft produced by this image (pending_drafts.batch_id). */
    batchId: text("batch_id"),
    documentClass: text("document_class"),
    entityCount: integer("entity_count").notNull().default(0),
    status: text("status").notNull().default("processing"), // processing | extracted | failed | rejected
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("image_intakes_user_fingerprint_key").on(t.userId, t.fingerprint),
    index("image_intakes_batch_idx").on(t.batchId),
    check("image_intakes_status_check", sql`${t.status} in ('processing', 'extracted', 'failed', 'rejected')`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("cash"), // cash | uzcard | humo | bank | ewallet | other
    currency: text("currency").notNull().default("UZS"),
    initialBalance: money("initial_balance").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    check("accounts_type_check", sql`${t.type} in ('cash', 'uzcard', 'humo', 'bank', 'ewallet', 'other')`),
    check("accounts_currency_check", sql`${t.currency} in ('UZS', 'USD', 'EUR')`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    name: text("name").notNull(),
    type: text("type").notNull(), // income | expense
    // Semantic key from src/components/icon.tsx (migration 0010 replaced the
    // emoji this column used to hold).
    icon: text("icon").notNull().default("dot"),
    color: text("color"),
    isEssential: boolean("is_essential").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("categories_user_idx").on(t.userId, t.type),
    check("categories_type_check", sql`${t.type} in ('income', 'expense')`),
  ],
);

/** User-defined shortcuts; tapping one is the only way it creates a ledger row. */
export const quickExpenses = pgTable(
  "quick_expenses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: money("amount").notNull(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    icon: text("icon").notNull().default("transport"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("quick_expenses_user_idx").on(t.userId, t.isActive, t.sortOrder),
    check("quick_expenses_amount_check", sql`${t.amount} > 0`),
  ],
);

export const recurringExpenses = pgTable(
  "recurring_expenses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    amount: money("amount"),
    minAmount: money("min_amount"),
    maxAmount: money("max_amount"),
    dueDay: integer("due_day").notNull().default(1),
    frequency: text("frequency").notNull().default("monthly"), // monthly | weekly | yearly
    isMandatory: boolean("is_mandatory").notNull().default(true),
    certainty: text("certainty").notNull().default("exact"), // exact | estimated
    nextDueDate: date("next_due_date", { mode: "string" }).notNull(),
    reminderDaysBefore: integer("reminder_days_before").notNull().default(1),
    paidThrough: date("paid_through", { mode: "string" }),
    /**
     * Payment plan model:
     *  one_time  — a single scheduled payment (frequency effectively "once")
     *  recurring — indefinite (rent, internet, subscriptions)
     *  term      — fixed duration: N installments (credit, installment purchase)
     */
    planType: text("plan_type").notNull().default("recurring"),
    startDate: date("start_date", { mode: "string" }),
    /** term: total number of installments; null for recurring/one_time */
    installmentCount: integer("installment_count"),
    /** term: how many installments were already paid */
    installmentsPaid: integer("installments_paid").notNull().default(0),
    /**
     * Lifecycle state, semantically distinct from `isActive`:
     *   active    — producing future occurrences
     *   paused    — user paused it (isActive=false, resumable)
     *   cancelled — user cancelled/deleted the plan (isActive=false, NOT
     *               resurrected by transaction reconciliation)
     *   completed — term/one_time reached its final occurrence naturally
     *
     * `isActive` remains the "produces occurrences" flag used by forecast;
     * `status` records *why* a plan is inactive so that deleting a historical
     * payment can reactivate a completed plan but never a cancelled one.
     */
    status: text("status").notNull().default("active"),
    /** Explicitly imported credit schedule. Legacy term plans stay false. */
    creditMode: boolean("credit_mode").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recurring_user_idx").on(t.userId),
    check("recurring_due_day_check", sql`${t.dueDay} between 1 and 28`),
    check("recurring_certainty_check", sql`${t.certainty} in ('exact', 'estimated')`),
    check("recurring_frequency_check", sql`${t.frequency} in ('once', 'weekly', 'monthly', 'yearly')`),
    check("recurring_plan_type_check", sql`${t.planType} in ('one_time', 'recurring', 'term')`),
    check("recurring_term_check", sql`${t.planType} <> 'term' or (${t.installmentCount} > 0 and ${t.installmentsPaid} >= 0)`),
    check("recurring_amount_check", sql`(${t.certainty} = 'exact' and ${t.amount} > 0) or (${t.certainty} = 'estimated' and ${t.minAmount} > 0 and ${t.maxAmount} >= ${t.minAmount})`),
    check("recurring_status_check", sql`${t.status} in ('active', 'paused', 'cancelled', 'completed')`),
  ],
);

/**
 * Credit schedule installments (§1 kredit = 1 term plan, 1 plan = N installment).
 *
 * A credit parsed from a Telegram message is stored as ONE `term` plan in
 * `recurringExpenses`; each installment is a separate row here with its OWN
 * date and amount (dates and amounts may both be irregular — 5 avg, 7 sen,
 * 5 okt …). Rows are schedule occurrences, NOT plans: the Mini App renders a
 * single card with a progress bar, never one card per installment.
 *
 * The `paid` state normally comes from real transactions that fulfil each
 * occurrence (`transactions.recurring_id` + `planned_date`). A bank schedule
 * may be imported after several historical installments were already paid
 * outside Hisobchi; `settledOnImport` records that opening state without
 * fabricating historical cash movements. Later payments always use the real
 * transaction reconciliation path.
 */
export const creditInstallments = pgTable(
  "credit_installments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    planId: integer("plan_id").notNull().references(() => recurringExpenses.id, { onDelete: "cascade" }),
    /** 1-based sequence index within the parent plan. */
    occurrenceNumber: integer("occurrence_number").notNull(),
    /** The original scheduled date (irregular dates are preserved as-is). */
    date: date("date", { mode: "string" }).notNull(),
    /** The original installment amount (amounts may differ per installment). */
    amount: money("amount").notNull(),
    /** Allocation is optional for legacy schedules, mandatory for new credit imports. */
    principalAmount: money("principal_amount"),
    interestAmount: money("interest_amount"),
    feeAmount: money("fee_amount"),
    settledOnImport: boolean("settled_on_import").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_installments_plan_idx").on(t.planId, t.occurrenceNumber),
    index("credit_installments_user_idx").on(t.userId),
    check("credit_installments_amount_check", sql`${t.amount} > 0`),
    check("credit_installments_occurrence_check", sql`${t.occurrenceNumber} > 0`),
  ],
);

export const expectedIncomes = pgTable(
  "expected_incomes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceName: text("source_name").notNull(),
    amount: money("amount"),
    minAmount: money("min_amount"),
    maxAmount: money("max_amount"),
    expectedDate: date("expected_date", { mode: "string" }).notNull(),
    frequency: text("frequency").notNull().default("monthly"), // once | monthly
    certainty: text("certainty").notNull().default("exact"), // exact | estimated
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** one_time | recurring | term — mirrors the payment plan model. */
    planType: text("plan_type").notNull().default("recurring"),
    /** term: total number of expected occurrences (e.g. a 3-month contract). */
    occurrenceCount: integer("occurrence_count"),
    /** term: how many occurrences were already received. */
    occurrencesReceived: integer("occurrences_received").notNull().default(0),
    /** Seed date of the occurrence schedule (mirrors recurring_expenses.start_date). */
    startDate: date("start_date", { mode: "string" }),
    /** Lifecycle state — mirrors recurring_expenses.status (active|paused|cancelled|completed). */
    status: text("status").notNull().default("active"),
    isActive: boolean("is_active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expected_income_user_idx").on(t.userId),
    check("expected_certainty_check", sql`${t.certainty} in ('exact', 'estimated')`),
    check("expected_frequency_check", sql`${t.frequency} in ('once', 'weekly', 'monthly', 'yearly')`),
    check("expected_plan_type_check", sql`${t.planType} in ('one_time', 'recurring', 'term')`),
    check("expected_term_check", sql`${t.planType} <> 'term' or (${t.occurrenceCount} > 0 and ${t.occurrencesReceived} >= 0)`),
    check("expected_amount_check", sql`(${t.certainty} = 'exact' and ${t.amount} > 0) or (${t.certainty} = 'estimated' and ${t.minAmount} > 0 and ${t.maxAmount} >= ${t.minAmount})`),
    check("expected_status_check", sql`${t.status} in ('active', 'paused', 'cancelled', 'completed')`),
  ],
);

export const debts = pgTable(
  "debts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // i_owe | owed_to_me
    personName: text("person_name").notNull(),
    amount: money("amount").notNull(),
    remainingAmount: money("remaining_amount").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    note: text("note"),
    status: text("status").notNull().default("active"), // active | settled
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("debts_user_idx").on(t.userId),
    check("debts_direction_check", sql`${t.direction} in ('i_owe', 'owed_to_me')`),
    check("debts_amount_check", sql`${t.amount} > 0 and ${t.remainingAmount} >= 0 and ${t.remainingAmount} <= ${t.amount}`),
    check("debts_status_check", sql`${t.status} in ('active', 'settled')`),
  ],
);

export const debtPayments = pgTable(
  "debt_payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    debtId: integer("debt_id").notNull().references(() => debts.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("debt_payments_debt_idx").on(t.debtId),
    check("debt_payments_amount_check", sql`${t.amount} > 0`),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
    toAccountId: integer("to_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    type: text("type").notNull(), // income | expense | transfer
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("UZS"),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    source: text("source").notNull().default("miniapp"), // bot | miniapp | api | auto
    recurringId: integer("recurring_id").references(() => recurringExpenses.id, { onDelete: "set null" }),
    expectedIncomeId: integer("expected_income_id").references(() => expectedIncomes.id, { onDelete: "set null" }),
    debtId: integer("debt_id").references(() => debts.id, { onDelete: "set null" }),
    debtPaymentId: integer("debt_payment_id").references(() => debtPayments.id, { onDelete: "set null" }),
    /** Credit-payment allocation. Principal changes cash but is not an expense metric. */
    creditPrincipalAmount: money("credit_principal_amount"),
    creditInterestAmount: money("credit_interest_amount"),
    creditFeeAmount: money("credit_fee_amount"),
    /**
     * Occurrence identity for plan ↔ transaction reconciliation.
     * `plannedDate` is the *scheduled* date of the occurrence this real
     * transaction fulfils; it is immutable once a payment is recorded and is
     * distinct from `date` (the *actual* payment/receipt date). This lets an
     * early payment (actual 15th, planned 20th) be un-done without corrupting
     * the schedule. `occurrenceNumber` is the 1-based sequence index.
     */
    plannedDate: date("planned_date", { mode: "string" }),
    occurrenceNumber: integer("occurrence_number"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tx_user_date_idx").on(t.userId, t.date),
    index("tx_type_idx").on(t.userId, t.type),
    index("tx_debt_idx").on(t.userId, t.debtId),
    index("tx_debt_payment_idx").on(t.userId, t.debtPaymentId),
    check("transactions_type_check", sql`${t.type} in ('income', 'expense', 'transfer')`),
    check("transactions_amount_check", sql`${t.amount} > 0`),
    check("transactions_currency_check", sql`${t.currency} in ('UZS', 'USD', 'EUR')`),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    amount: money("amount").notNull(),
    rollover: boolean("rollover").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("budget_unique_idx").on(t.userId, t.categoryId, t.month),
    check("budgets_amount_check", sql`${t.amount} > 0`),
    check("budgets_month_check", sql`${t.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("target"),
    targetAmount: money("target_amount").notNull(),
    savedAmount: money("saved_amount").notNull().default(0),
    targetDate: date("target_date", { mode: "string" }),
    monthlyContribution: money("monthly_contribution").notNull().default(0),
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"), // active | reached
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goals_user_idx").on(t.userId),
    check("goals_amount_check", sql`${t.targetAmount} > 0 and ${t.savedAmount} >= 0 and ${t.savedAmount} <= ${t.targetAmount} and ${t.monthlyContribution} >= 0`),
    check("goals_status_check", sql`${t.status} in ('active', 'reached')`),
  ],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: integer("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    /** The ledger row created by this contribution; History deletion reverses this aggregate through the link. */
    transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_contrib_goal_idx").on(t.goalId),
    uniqueIndex("goal_contrib_transaction_unique").on(t.transactionId),
    check("goal_contributions_amount_check", sql`${t.amount} > 0`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // payment | income | budget | risk | insight | system
    severity: text("severity").notNull().default("info"), // info | success | warning | critical
    title: text("title").notNull(),
    body: text("body").notNull(),
    refDate: date("ref_date", { mode: "string" }),
    amount: money("amount"),
    meta: jsonb("meta"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    check("notifications_severity_check", sql`${t.severity} in ('info', 'success', 'warning', 'critical')`),
  ],
);

export const financialSnapshots = pgTable(
  "financial_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    totalBalance: money("total_balance").notNull().default(0),
    income: money("income").notNull().default(0),
    expense: money("expense").notNull().default(0),
    savingsRate: numeric("savings_rate", { precision: 6, scale: 4, mode: "number" })
      .notNull()
      .default(0),
    healthScore: integer("health_score").notNull().default(0),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("snapshots_user_date_key").on(t.userId, t.snapshotDate),
    check("snapshots_health_check", sql`${t.healthScore} between 0 and 100`),
  ],
);

/** Immutable financial/security audit trail. No UI delete endpoint exists. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role").notNull().default("USER"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    outcome: text("outcome").notNull(), // success | denied | failed
    requestId: text("request_id").notNull(),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_user_created_idx").on(t.userId, t.createdAt),
    index("audit_request_idx").on(t.requestId),
    check("audit_outcome_check", sql`${t.outcome} in ('success', 'denied', 'failed')`),
    check("audit_actor_role_check", sql`${t.actorRole} in ('USER', 'ADMIN')`),
  ],
);

/** Security-only events: auth failure, rate limit, origin reject, callback abuse. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    event: text("event").notNull(),
    severity: text("severity").notNull().default("warning"),
    requestId: text("request_id").notNull(),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_event_created_idx").on(t.event, t.createdAt)],
);

/** Idempotency for Mini App financial mutations. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    /** SHA-256 of the exact mutation body; detects accidental key reuse. */
    requestHash: text("request_hash"),
    status: text("status").notNull().default("processing"),
    resultId: integer("result_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("idempotency_user_key_scope").on(t.userId, t.key, t.scope),
    index("idempotency_expires_idx").on(t.expiresAt),
    check("idempotency_status_check", sql`${t.status} in ('processing', 'completed')`),
  ],
);

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type QuickExpense = typeof quickExpenses.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type RecurringExpense = typeof recurringExpenses.$inferSelect;
export type CreditInstallment = typeof creditInstallments.$inferSelect;
export type ExpectedIncome = typeof expectedIncomes.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type PendingDraft = typeof pendingDrafts.$inferSelect;
export type ImageIntake = typeof imageIntakes.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SecurityEvent = typeof securityEvents.$inferSelect;
