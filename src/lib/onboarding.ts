export const MIN_ANALYTICS_TRANSACTIONS = 2;

type TransactionLike = { isDeleted: boolean };

/** Real analytics starts only when there is enough completed ledger activity. */
export function hasEnoughAnalyticsData(transactions: readonly TransactionLike[]): boolean {
  return transactions.filter((transaction) => !transaction.isDeleted).length >= MIN_ANALYTICS_TRANSACTIONS;
}

/** A guide is relevant only before the user has created any finance entity. */
export function shouldStartOnboarding(source: {
  transactions: readonly TransactionLike[];
  recurring: readonly unknown[];
  expectedIncomes: readonly unknown[];
  goals: readonly unknown[];
  budgets: readonly unknown[];
  debts: readonly unknown[];
}): boolean {
  return (
    source.transactions.every((transaction) => transaction.isDeleted) &&
    source.recurring.length === 0 &&
    source.expectedIncomes.length === 0 &&
    source.goals.length === 0 &&
    source.budgets.length === 0 &&
    source.debts.length === 0
  );
}
