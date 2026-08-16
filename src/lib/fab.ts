/**
 * Single source of truth for the Global Context-Aware Floating Action Button.
 *
 * ONE FAB → MANY CONTEXTUAL ACTIONS.
 *
 * This module is intentionally PURE: it maps a route + tab + sub-filter context
 * to a compact list of typed actions. It contains no React, no finance logic and
 * no sheet orchestration — the FAB component only consumes `getFabActions` and
 * the pages own the sheets those actions open.
 */

export type FabAction =
  | "transaction"
  | "payment_plan"
  | "expected_income"
  | "account"
  | "debt"
  | "goal"
  | "budget"
  | "category";

export type FabTransactionType = "income" | "expense" | "transfer";

export type FabContext = {
  pathname: string;
  /** `/plans` active tab. */
  tab?: "payments" | "income" | "cashflow";
  /** `/transactions` active type filter. */
  txFilter?: "all" | FabTransactionType;
  /** `/accounts` active sub-tab. */
  accountsTab?: "accounts" | "categories";
};

export type FabActionDef = {
  id: FabAction;
  label: string;
  icon: string;
  description?: string;
  /**
   * For `transaction` actions: which default type to open. Omitted means
   * "last-used, otherwise expense" — so a neutral "Operatsiya" entry never
   * forces the user to re-choose their habitual direction.
   */
  type?: FabTransactionType;
};

export function normalizePath(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  if (!path) return "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

/**
 * Resolve the contextual actions for a route. Kept 1–3 (Dashboard) to 5 (Menu)
 * items — never a second "giant menu". Returns an empty array for contexts that
 * must NOT offer a create action (e.g. Cash-flow: analysis only).
 */
export function getFabActions(ctx: FabContext): FabActionDef[] {
  const path = normalizePath(ctx.pathname);

  switch (path) {
    case "/":
      // Dashboard — ONE transaction entry point, three directions.
      return [
        { id: "transaction", label: "Kirim", icon: "➕", description: "Pul keldi", type: "income" },
        { id: "transaction", label: "Chiqim", icon: "➖", description: "Pul ketdi", type: "expense" },
        { id: "transaction", label: "Transfer", icon: "↔️", description: "Hisoblar orasida", type: "transfer" },
      ];

    case "/transactions":
      // History exposes every real ledger direction. The list filter must not
      // silently remove creation choices from the global entry point.
      return [
        { id: "transaction", label: "Kirim", icon: "➕", description: "Pul keldi", type: "income" },
        { id: "transaction", label: "Chiqim", icon: "➖", description: "Pul ketdi", type: "expense" },
        { id: "transaction", label: "Transfer", icon: "↔️", description: "Hisoblar orasida", type: "transfer" },
      ];

    case "/plans":
      if (ctx.tab === "income") {
        return [{ id: "expected_income", label: "Kutilayotgan daromad", icon: "💵" }];
      }
      if (ctx.tab === "cashflow") {
        // Cash-flow is analysis: no direct create action, no misleading entry.
        return [];
      }
      return [{ id: "payment_plan", label: "To‘lov rejasi", icon: "📌" }];

    case "/analytics":
      // Analytics is interpretation only. No create control is rendered here.
      return [];

    case "/more":
      // Menu = secondary tools. Only entities that actually live here.
      return [
        { id: "account", label: "Hisob", icon: "💳", description: "Karta, naqd, bank" },
        { id: "debt", label: "Qarz", icon: "💰", description: "Qarzdorman / qarzdor" },
        { id: "goal", label: "Maqsad", icon: "🎯", description: "Jamg‘arma rejasi" },
        { id: "budget", label: "Budjet", icon: "📊", description: "Oylik limit" },
        { id: "category", label: "Kategoriya", icon: "🏷️", description: "Xarajat / daromad" },
      ];

    case "/accounts":
      return ctx.accountsTab === "categories"
        ? [{ id: "category", label: "Kategoriya", icon: "🏷️" }]
        : [{ id: "account", label: "Hisob", icon: "💳" }];

    case "/debts":
      return [{ id: "debt", label: "Qarz", icon: "💰" }];

    case "/goals":
      return [{ id: "goal", label: "Maqsad", icon: "🎯" }];

    case "/budgets":
      return [{ id: "budget", label: "Budjet", icon: "📊" }];

    default:
      return [];
  }
}

/** Routes that may own a create action; contextual empty lists still hide it. */
const FAB_ROUTES = new Set(["/", "/transactions", "/plans", "/more", "/accounts", "/debts", "/goals", "/budgets"]);

export function supportsFab(pathname: string): boolean {
  return FAB_ROUTES.has(normalizePath(pathname));
}

/* ============================ Last-used default ============================ */
/* §27: context should set useful defaults. The neutral transaction entry
 * remembers the direction the user last saved and reopens with it. */

const LAST_TYPE_KEY = "pfos-last-tx-type";

export function lastTxType(): FabTransactionType {
  if (typeof window === "undefined") return "expense";
  try {
    const v = window.localStorage.getItem(LAST_TYPE_KEY);
    return v === "income" || v === "transfer" ? v : "expense";
  } catch {
    return "expense";
  }
}

export function rememberTxType(type: FabTransactionType): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_TYPE_KEY, type);
  } catch {
    /* storage may be unavailable in private mode — ignore */
  }
}
