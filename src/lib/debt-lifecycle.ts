export type DebtListFilter = "active" | "i_owe" | "owed_to_me" | "settled";

type FilterableDebt = {
  direction: "i_owe" | "owed_to_me";
  remainingAmount: number;
};

/** Outstanding money is the source of truth, including legacy rows with stale status. */
export function isSettledDebt(debt: Pick<FilterableDebt, "remainingAmount">): boolean {
  return debt.remainingAmount <= 0;
}

export function filterDebtsByTab<T extends FilterableDebt>(debts: T[], filter: DebtListFilter): T[] {
  return debts.filter((debt) => {
    const settled = isSettledDebt(debt);
    if (filter === "settled") return settled;
    if (settled) return false;
    return filter === "active" || debt.direction === filter;
  });
}
