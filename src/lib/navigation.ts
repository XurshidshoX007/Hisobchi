/**
 * Route model of the Mini App shell.
 *
 * The mobile profile header (greeting, balance, theme switch, notification
 * bell) belongs to the MENU route (`/more`) ONLY. Every other route — the four
 * primary tabs AND the internal pages reached from Menu (Hisoblar, Budjetlar,
 * Qarzdorlik, Maqsadlar, Sozlamalar, Bot) — must start with its own content at
 * the very top of the viewport. On those routes the header is not rendered
 * (never merely hidden with CSS), so it takes zero height, margin and padding
 * and is absent from the DOM.
 */

/** Bottom-nav "Menyu" route — the only route that owns the profile header. */
export const MENU_ROUTE = "/more";

/**
 * Pages reached FROM Menu. They render NO profile header — each starts with a
 * compact PageHeader (`‹ Menyu` back affordance + title) instead. The list is
 * kept for navigation helpers and regression tests.
 */
export const MENU_SUBROUTES = ["/accounts", "/budgets", "/debts", "/goals", "/settings", "/bot"] as const;

function normalize(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  if (!path) return "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

/** True ONLY for `/more`. Internal pages and nested routes never show it. */
export function showsProfileHeader(pathname: string): boolean {
  return normalize(pathname) === MENU_ROUTE;
}

/** True for internal pages reached from Menu (including nested routes). */
export function isMenuSubroute(pathname: string): boolean {
  const path = normalize(pathname);
  return MENU_SUBROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}
