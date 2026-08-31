export type {
  User,
  Account,
  Category,
  Transaction,
  RecurringExpense,
  CreditInstallment,
  ExpectedIncome,
  Budget,
  Debt,
  Goal,
  NotificationRow,
  QuickExpense,
} from "@/db/schema";

import type { User } from "@/db/schema";

/** Session user shape used across the service layer. */
export type SessionUserLike = User;

export {
  accounts,
  budgets,
  categories,
  creditInstallments,
  debtPayments,
  debts,
  expectedIncomes,
  financialSnapshots,
  goalContributions,
  goals,
  notifications,
  quickExpenses,
  recurringExpenses,
  transactions,
  users,
} from "@/db/schema";
