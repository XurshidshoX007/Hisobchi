import type { TxView } from "./finance";

export type TransactionFilterState = {
  type: "all" | "income" | "expense" | "transfer";
  categoryId: string;
};

/** The filtering pipeline still receives one composed value; UI state does not. */
export type TransactionFilters = TransactionFilterState & {
  query: string;
};

export type TransactionRouteContext = {
  planId: number | null;
  incomeId: number | null;
};

export const DEFAULT_TRANSACTION_FILTER_STATE: TransactionFilterState = {
  type: "all",
  categoryId: "",
};

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  ...DEFAULT_TRANSACTION_FILTER_STATE,
  query: "",
};

/** Compose independent UI state only at the established filtering boundary. */
export function composeTransactionFilters(
  filterState: TransactionFilterState,
  searchQuery: string,
): TransactionFilters {
  return { ...filterState, query: searchQuery };
}

type FilterableTransaction = Pick<
  TxView,
  "type" | "categoryId" | "note" | "categoryName" | "accountName" | "amount" | "recurringId" | "expectedIncomeId"
>;

type FilterableCategory = {
  id: number;
  name: string;
  type: "income" | "expense";
  isActive: boolean;
};

/**
 * The single client-side transaction filter pipeline. Route-owned plan/income
 * context and user-owned controls are combined with AND semantics, without a
 * fetch or a second filtering pass in the UI.
 */
export function filterTransactions<T extends FilterableTransaction>(
  transactions: readonly T[],
  filters: TransactionFilters,
  context: TransactionRouteContext,
): T[] {
  return transactions.filter((transaction) => {
    if (context.planId && transaction.recurringId !== context.planId) return false;
    if (context.incomeId && transaction.expectedIncomeId !== context.incomeId) return false;
    if (filters.type !== "all" && transaction.type !== filters.type) return false;
    if (filters.categoryId && String(transaction.categoryId ?? "") !== filters.categoryId) return false;
    if (filters.query) {
      const query = filters.query.trim().toLowerCase();
      const haystack = `${transaction.note ?? ""} ${transaction.categoryName ?? ""} ${transaction.accountName}`.toLowerCase();
      // Search accepts the same localized decimal/grouping form that History
      // renders ("7 532,96") while the transaction remains a numeric value.
      const numericQuery = query.replace(/\s/g, "").replace(",", ".");
      if (!haystack.includes(query) && !String(transaction.amount).includes(numericQuery)) return false;
    }
    return true;
  });
}

/** Active, type-compatible category options; duplicate names are shown once. */
export function transactionCategoryOptions<T extends FilterableCategory>(
  categories: readonly T[],
  type: TransactionFilters["type"],
): T[] {
  if (type === "transfer") return [];

  const seenNames = new Set<string>();
  return categories.filter((category) => {
    if (!category.isActive) return false;
    if (type !== "all" && category.type !== type) return false;
    const key = category.name.trim().toLocaleLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
}

export function localTransactionFilterCount(filters: TransactionFilterState): number {
  return Number(filters.type !== "all") + Number(Boolean(filters.categoryId));
}
