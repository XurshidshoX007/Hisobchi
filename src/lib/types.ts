import type {
  AccountView,
  Analytics,
  BudgetView,
  CategoryView,
  DebtView,
  ExpectedIncomeView,
  Forecast,
  GoalView,
  Health,
  MonthIncomeSummary,
  MonthPlanSummary,
  NotificationView,
  RecurringView,
  TxView,
  MonthlyView,
} from "./finance";

export type UserView = {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  currency: string;
  locale: string;
  localeConfirmedAt: string | null;
  theme: string;
  minReserve: number;
  estimatedIncomeConfidence: number;
  notifyPayments: boolean;
  notifyIncome: boolean;
  notifyBudget: boolean;
  notifyRisk: boolean;
  isDemo: boolean;
};

export type LiveAlert = {
  id: string;
  type: "payment" | "income" | "budget" | "risk" | "insight";
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  refDate: string | null;
  amount: number | null;
};

export type QuickExpenseView = {
  id: number;
  name: string;
  amount: number;
  categoryId: number | null;
  accountId: number | null;
  icon: string;
};

export type AppState = {
  user: UserView;
  generatedAt: string;
  /** Today's authoritative completed-ledger balance from computeLedgerBalances. */
  currentBalance: number;
  accounts: AccountView[];
  categories: CategoryView[];
  flatCategories: Array<Omit<CategoryView, "children">>;
  transactions: TxView[];
  recurring: RecurringView[];
  expectedIncomes: ExpectedIncomeView[];
  budgets: BudgetView[];
  debts: DebtView[];
  goals: GoalView[];
  notifications: NotificationView[];
  quickExpenses: QuickExpenseView[];
  alerts: LiveAlert[];
  forecast: Forecast;
  analytics: Analytics;
  health: Health;
  monthly?: MonthlyView[];
  /** Current-month-only expected income summary (see Plans → Daromad). */
  currentMonthIncome: MonthIncomeSummary;
  /** Current-month payment load: mandatory/optional, paid, remaining, nearest. */
  currentMonthPlan: MonthPlanSummary;
};

export type MutateResult = { ok: true; message?: string; state?: AppState } | { ok: false; error: string };
