export type {
  User,
  Account,
  Category,
  Transaction,
  RecurringExpense,
  ExpectedIncome,
  Budget,
  Debt,
  Goal,
  NotificationRow,
} from "@/db/schema";

import type { User } from "@/db/schema";

/** Session user shape used across the service layer. */
export type SessionUserLike = User;

export {
  accounts,
  budgets,
  categories,
  debtPayments,
  debts,
  expectedIncomes,
  financialSnapshots,
  goalContributions,
  goals,
  notifications,
  recurringExpenses,
  transactions,
  users,
} from "@/db/schema";
