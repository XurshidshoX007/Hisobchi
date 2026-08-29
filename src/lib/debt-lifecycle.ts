export type DebtListFilter = "i_owe" | "owed_to_me";

type FilterableDebt = {
  direction: "i_owe" | "owed_to_me";
  remainingAmount: number;
};

/** Outstanding money is the source of truth, including legacy rows with stale status. */
export function isSettledDebt(debt: Pick<FilterableDebt, "remainingAmount">): boolean {
  return debt.remainingAmount <= 0;
}

export function filterDebtsByTab<T extends FilterableDebt>(debts: T[], filter: DebtListFilter): T[] {
  return debts.filter((debt) => !isSettledDebt(debt) && debt.direction === filter);
}
