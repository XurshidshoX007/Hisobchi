/**
 * Route model of the Mini App shell.
 *
 * The mobile profile header (greeting, balance, theme switch, notification
 * bell) belongs to the MENU route only. The four primary tabs — Asosiy, Tarix,
 * Reja, Tahlil — must start with their own content at the very top of the
 * viewport, so the header is not rendered (not merely hidden) there and takes
 * zero height, margin and padding.
 */

/** Bottom-nav "Menyu" route. */
export const MENU_ROUTE = "/more";

/** Pages reached FROM Menu — they keep the header for a consistent back-path. */
export const MENU_SUBROUTES = ["/accounts", "/budgets", "/debts", "/goals", "/settings", "/bot"] as const;

export function showsProfileHeader(pathname: string): boolean {
  const path = pathname.split("?")[0];
  if (path === MENU_ROUTE) return true;
  return MENU_SUBROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}
