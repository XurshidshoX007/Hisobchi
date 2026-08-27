import type { AccountView, Analytics } from "./finance";
import { UZ_MONTHS } from "./money";

export const DASHBOARD_CATEGORY_LIMIT = 5;

export type DashboardCategory = {
  id: number | null;
  name: string;
  icon: string;
  amount: number;
  share: number;
};

/**
 * Balance composition by account "type family" (cash / cards / bank / ewallet).
 *
 * This is a *reference* view of the same authoritative per-account balances
 * (`AccountView.currentBalance`, ledger-computed) — the dashboard never
 * recomputes anything, it only groups. The PRIMARY home for full per-account
 * management remains `/accounts` (see `docs/INFORMATION-OWNERSHIP.md`).
 */
export type BalanceGroupKey = "cash" | "cards" | "bank" | "ewallet" | "other";

export type BalanceGroupAccount = {
  id: number;
  name: string;
  type: string;
  balance: number;
  isActive: boolean;
};

export type BalanceGroup = {
  key: BalanceGroupKey;
  label: string;
  icon: string;
  /** Design token suffix — combined at the call site with `bg-*` / `text-*`. */
  tone: "positive" | "accent" | "info" | "warning" | "neutral";
  /** Sum of `currentBalance` over accounts in this group (can be negative). */
  amount: number;
  /** Share of the positive total, 0..1. Zero when total ≤ 0. */
  share: number;
  accounts: BalanceGroupAccount[];
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
  /** All groups that hold a non-zero balance (positive OR negative). */
  balanceGroups: BalanceGroup[];
  /** True when the distribution bar/sheet is worth surfacing (≥ 2 groups). */
  hasBalanceBreakdown: boolean;
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
  /** Optional so tests and legacy call sites keep compiling; groups are empty when absent. */
  accounts?: AccountView[];
};

function fullMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const name = UZ_MONTHS[(month || 1) - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function visibleCategories(items: DashboardCategory[]): DashboardCategory[] {
  return items.filter((item) => item.amount > 0);
}

/**
 * Ordered so the on-screen bar reads left→right in the same order as the
 * sheet list. Uzcard + Humo collapse into a single "Kartalar" segment so the
 * bar stays readable; the sheet still names each card individually.
 */
const GROUP_ORDER: BalanceGroupKey[] = ["cash", "cards", "bank", "ewallet", "other"];

const GROUP_META: Record<BalanceGroupKey, { label: string; icon: string; tone: BalanceGroup["tone"] }> = {
  cash: { label: "Naqd pul", icon: "wallet", tone: "positive" },
  cards: { label: "Kartalar", icon: "card", tone: "accent" },
  bank: { label: "Bank hisobi", icon: "bank", tone: "info" },
  ewallet: { label: "Elektron hamyon", icon: "phone", tone: "warning" },
  other: { label: "Boshqa", icon: "dot", tone: "neutral" },
};

function classifyAccountType(type: string): BalanceGroupKey {
  switch (type) {
    case "cash":
      return "cash";
    case "uzcard":
    case "humo":
      return "cards";
    case "bank":
      return "bank";
    case "ewallet":
      return "ewallet";
    default:
      return "other";
  }
}

function buildBalanceGroups(accounts: AccountView[] | undefined): BalanceGroup[] {
  if (!accounts?.length) return [];

  // Only faol accounts feed the primary picture on the dashboard hero;
  // noaktiv hisoblarning qoldig'i /accounts sahifasida "Noaktiv" bilan alohida
  // ko'rinadi va Balans headline'iga ham qo'shilmaydi (activeBalance).
  const active = accounts.filter((account) => account.isActive);
  if (!active.length) return [];

  const buckets = new Map<BalanceGroupKey, BalanceGroup>();

  for (const account of active) {
    const key = classifyAccountType(account.type);
    let bucket = buckets.get(key);
    if (!bucket) {
      const meta = GROUP_META[key];
      bucket = { key, label: meta.label, icon: meta.icon, tone: meta.tone, amount: 0, share: 0, accounts: [] };
      buckets.set(key, bucket);
    }
    bucket.amount += account.currentBalance;
    bucket.accounts.push({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.currentBalance,
      isActive: account.isActive,
    });
  }

  // Drop empty buckets. Keep negative-balance buckets — the sheet needs to
  // surface an overdrawn card even though it doesn't fit the % bar.
  const groups: BalanceGroup[] = [];
  for (const key of GROUP_ORDER) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (Math.round(bucket.amount) === 0 && bucket.accounts.every((a) => Math.round(a.balance) === 0)) continue;
    // Sort accounts within a group by balance desc for the sheet.
    bucket.accounts.sort((a, b) => b.balance - a.balance);
    groups.push(bucket);
  }

  const positiveTotal = groups.reduce((sum, group) => (group.amount > 0 ? sum + group.amount : sum), 0);
  if (positiveTotal > 0) {
    for (const group of groups) {
      group.share = group.amount > 0 ? group.amount / positiveTotal : 0;
    }
  }

  return groups;
}

export function selectDashboardFacts(
  source: DashboardFactsSource,
  limit = DASHBOARD_CATEGORY_LIMIT,
): DashboardFacts {
  const incomeCategories = visibleCategories(source.analytics.incomeSources);
  const expenseCategories = visibleCategories(source.analytics.categories);
  const balanceGroups = buildBalanceGroups(source.accounts);

  return {
    monthLabel: fullMonthLabel(source.analytics.month),
    balance: source.currentBalance,
    income: source.analytics.monthTotals.income,
    expense: source.analytics.monthTotals.expense,
    incomeCategories: incomeCategories.slice(0, limit),
    expenseCategories: expenseCategories.slice(0, limit),
    hasMoreIncomeCategories: incomeCategories.length > limit,
    hasMoreExpenseCategories: expenseCategories.length > limit,
    balanceGroups,
    // A one-group breakdown adds nothing beyond the hero headline.
    hasBalanceBreakdown: balanceGroups.length >= 2,
  };
}
