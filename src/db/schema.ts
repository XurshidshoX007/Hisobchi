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
    icon: text("icon").notNull().default("•"),
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
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tx_user_date_idx").on(t.userId, t.date),
    index("tx_type_idx").on(t.userId, t.type),
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

export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("🎯"),
    targetAmount: money("target_amount").notNull(),
    savedAmount: money("saved_amount").notNull().default(0),
    targetDate: date("target_date", { mode: "string" }),
    monthlyContribution: money("monthly_contribution").notNull().default(0),
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"), // active | reached
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
    amount: money("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_contrib_goal_idx").on(t.goalId),
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
export type Transaction = typeof transactions.$inferSelect;
export type RecurringExpense = typeof recurringExpenses.$inferSelect;
export type ExpectedIncome = typeof expectedIncomes.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type PendingDraft = typeof pendingDrafts.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SecurityEvent = typeof securityEvents.$inferSelect;
