import type { Analytics } from "./finance";
import { UZ_MONTHS } from "./money";

export const DASHBOARD_CATEGORY_LIMIT = 5;

export type DashboardCategory = {
  id: number | null;
  name: string;
  icon: string;
  amount: number;
  share: number;
};

export type DashboardFacts = {
  monthLabel: string;
  balance: number;
  income: number;
  expense: number;
  incomeCategories: DashboardCategory[];
  expenseCategories: DashboardCategory[];
  hasMoreIncomeCategories: boolean;
  hasMoreExpenseCategories: boolean;
};

/**
 * The deliberately small data contract consumed by the home page.
 *
 * This selector does not calculate money. Balance remains owned by the shared
 * completed ledger, while current-month totals and category aggregation remain
 * owned by buildAnalytics. The dashboard only removes zero rows and limits
 * presentation length.
 */
export type DashboardFactsSource = {
  currentBalance: number;
  analytics: Pick<Analytics, "month" | "monthTotals" | "categories" | "incomeSources">;
};

function fullMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const name = UZ_MONTHS[(month || 1) - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function visibleCategories(items: DashboardCategory[]): DashboardCategory[] {
  return items.filter((item) => item.amount > 0);
}

export function selectDashboardFacts(
  source: DashboardFactsSource,
  limit = DASHBOARD_CATEGORY_LIMIT,
): DashboardFacts {
  const incomeCategories = visibleCategories(source.analytics.incomeSources);
  const expenseCategories = visibleCategories(source.analytics.categories);

  return {
    monthLabel: fullMonthLabel(source.analytics.month),
    balance: source.currentBalance,
    income: source.analytics.monthTotals.income,
    expense: source.analytics.monthTotals.expense,
    incomeCategories: incomeCategories.slice(0, limit),
    expenseCategories: expenseCategories.slice(0, limit),
    hasMoreIncomeCategories: incomeCategories.length > limit,
    hasMoreExpenseCategories: expenseCategories.length > limit,
  };
}
