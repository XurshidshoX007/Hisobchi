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

export type AppState = {
  user: UserView;
  generatedAt: string;
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
  alerts: LiveAlert[];
  forecast: Forecast;
  analytics: Analytics;
  health: Health;
  monthly?: MonthlyView[];
};

export type MutateResult = { ok: true; message?: string; state?: AppState } | { ok: false; error: string };
