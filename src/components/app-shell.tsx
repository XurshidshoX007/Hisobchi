"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { formatAmount, humanDate } from "@/lib/money";
import { getFabActions, supportsFab } from "@/lib/fab";
import { MENU_ROUTE, isMenuSubroute } from "@/lib/navigation";
import { useFinance } from "./providers";
import { FabProvider, GlobalAddFab, useFab } from "./fab";
import { Badge, Button, Divider, Money, Sheet } from "./ui";
import { SwipeBack } from "./swipe-back";
import { Icon } from "@/components/icon";
import { OnboardingTour } from "@/components/onboarding-tour";

const NAV = [
  { href: "/", label: "Asosiy", short: "Asosiy", icon: "nav-home" },
  { href: "/transactions", label: "Tarix", short: "Tarix", icon: "nav-history" },
  { href: "/plans", label: "Reja", short: "Reja", icon: "nav-plans" },
  { href: "/analytics", label: "Tahlil", short: "Tahlil", icon: "nav-analytics" },
  { href: "/more", label: "Ko‘proq", short: "Menyu", icon: "nav-more" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <FabProvider>
      <AppShellContent>{children}</AppShellContent>
    </FabProvider>
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, error, theme, setTheme, mutate } = useFinance();
  const { currentContext } = useFab();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [tourRoute, setTourRoute] = useState<string | null>(null);
  const setTourRouteStable = useCallback((route: string | null) => setTourRoute(route), []);
  const hasGlobalFab = supportsFab(pathname) && getFabActions({ pathname, ...currentContext }).length > 0;
  // History owns a contextual filter FAB in the same shared geometry slot. It
  // replaces (rather than stacks with) the global add action on that route.
  const hasContextualFab = pathname === "/transactions";
  const hasFloatingAction = hasGlobalFab || hasContextualFab;

  const unread = (state?.alerts.length ?? 0) + (state?.notifications.filter((n) => !n.isRead).length ?? 0);
  // Internal pages reached from the Menu (Hisoblar, Budjetlar, Qarzdorlik,
  // Maqsadlar, Sozlamalar, Bot) get swipe-back instead of a back button.
  const isSub = isMenuSubroute(pathname);

  if (error === "auth") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-fg">
            ₮
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Hisobchi</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Ilovani Telegram orqali oching — kirish Telegramda tasdiqlanadi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className={`app-shell-layout mx-auto flex min-h-dvh w-full max-w-6xl gap-6 px-3.5 pt-3 sm:px-6 ${hasFloatingAction ? "has-global-fab" : ""}`}>
      {/* Sidebar — desktop */}
      <aside className="sticky top-6 hidden h-fit w-60 shrink-0 flex-col gap-1 lg:flex">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[15px] font-bold text-primary-fg">
            <span>₮</span>
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-tight">Hisobchi</p>
            <p className="text-[11px] text-muted">Shaxsiy moliya</p>
          </div>
        </div>
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors ${
                active ? "bg-primary font-semibold text-primary-fg" : "text-fg-soft hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <Icon name={item.icon} size={20} strokeWidth={active ? 1.9 : 1.8} />
              {item.label}
            </Link>
          );
        })}
        <Divider />
        <Link
          href="/bot"
          className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors ${
            pathname === "/bot" ? "bg-primary text-primary-fg" : "text-fg-soft hover:bg-surface-2 hover:text-fg"
          }`}
        >
          <Icon name="telegram" size={17} className="text-muted" /> Telegram bot
        </Link>

        {/* Balance is OWNED by the Dashboard hero — the sidebar carries only a
            one-line reference to it (§4), never a second hero. */}
        <Link href="/" className="mt-6 block rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2">
          <p className="text-[11.5px] text-muted">
            Balans: <span className="num font-semibold text-fg">{formatAmount(state?.currentBalance ?? 0)}</span>
          </p>
          <p className="text-[10.5px] text-muted">{state?.accounts.length ?? 0} hisob · Asosiy →</p>
        </Link>

        <button
          onClick={() => setAlertsOpen(true)}
          className="mt-4 flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg touch-manipulation"
        >
          <Icon name="bell" size={17} className="text-muted" />
          Eslatmalar
          {unread > 0 ? (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-negative px-1.5 text-[10px] font-bold text-negative-fg">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg touch-manipulation"
        >
          <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} size={17} className="text-muted" />
          {theme === "dark" ? "Tungi" : theme === "light" ? "Kunduzgi" : "Tizim"}
        </button>
      </aside>

      <main className="min-w-0 flex-1">
        {/*
         * No shell-level header on any route. The Menu owns its profile card
         * (src/app/more/page.tsx), while the Dashboard starts straight at its
         * balance card, so no route pays for chrome it does not use.
         */}
        <SwipeBack enabled={isSub}>
          <div className="min-w-0">{children}</div>
        </SwipeBack>
      </main>

      {/* Floating glass navigation. Geometry (inset, height, radius) lives in
          .app-bottom-nav; FAB positioning and content clearance consume the
          same CSS variables, so the three never drift apart. */}
      <nav className="app-bottom-nav glass-nav lg:hidden">
        <div className="mobile-bottom-nav-inner mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 sm:px-2">
          {NAV.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.short}
              icon={item.icon}
              active={
                pathname === item.href ||
                (item.href !== "/" && item.href !== MENU_ROUTE && pathname.startsWith(item.href)) ||
                // Internal pages (Hisoblar, Budjetlar, …) belong to the Menu
                // tab — keep it highlighted so the user knows where they are.
                (item.href === MENU_ROUTE && isMenuSubroute(pathname))
              }
              tourActive={tourRoute === item.href}
              // The bell now lives in the Menu header only, so the Menu tab
              // carries the unread indicator — notifications stay discoverable
              // from every screen without a global header.
              badge={item.href === MENU_ROUTE ? unread : 0}
            />
          ))}
        </div>
      </nav>

      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
    <GlobalAddFab />
    <OnboardingTour onStepChange={setTourRouteStable} />
    </>
  );
}

/**
 * Notifications live in ONE sheet mounted by whichever surface owns the bell:
 * the Menu header on `/more`, and the Dashboard header on `/`. Exporting it
 * keeps a single implementation instead of a second copy per screen.
 */
export function AlertsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, mutate } = useFinance();
  return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Eslatmalar"
        footer={
          <Button variant="secondary" className="flex-1" onClick={() => mutate("notification", "readAll", {})}>
            Hammasini o‘qilgan qilish
          </Button>
        }
      >
        {!state?.alerts.length && !state?.notifications.length ? (
          <p className="py-6 text-center text-sm text-muted">Hozircha eslatmalar yo‘q.</p>
        ) : null}
        {state?.alerts.map((a) => (
          <div
            key={a.id}
            className="flat-card p-4"
            style={{
              borderColor:
                a.severity === "critical" ? "var(--negative)" : a.severity === "warning" ? "var(--warning)" : "var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-semibold">
                <Icon
                  name={a.severity === "critical" ? "warning" : a.severity === "warning" ? "warning" : "bell"}
                  size={15}
                  className={`mr-1.5 inline-block align-[-2px] ${a.severity === "critical" ? "text-negative-text" : a.severity === "warning" ? "text-warning-text" : "text-muted"}`}
                />
                {a.title}
              </p>
              {a.amount ? <Money value={a.amount} size="sm" tone={a.severity === "critical" ? "negative" : "default"} /> : null}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{a.body}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              {a.refDate ? <p className="text-[11px] text-muted">{humanDate(a.refDate)}</p> : <span />}
              {/* Notification = event; the full context lives at its primary
                  home (§23) — link there instead of reproducing the card. */}
              <Link
                href={a.severity === "critical" ? "/" : "/plans"}
                onClick={onClose}
                className="shrink-0 text-[11.5px] font-semibold text-accent-text touch-manipulation"
              >
                {a.severity === "critical" ? "Asosiy →" : "Reja →"}
              </Link>
            </div>
          </div>
        ))}
        {state?.notifications.map((n) => (
          <div key={n.id} className="flat-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-medium">{n.title}</p>
              <Badge tone={n.isRead ? "neutral" : "accent"}>{n.isRead ? "O‘qilgan" : "Yangi"}</Badge>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{n.body}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted">{humanDate(n.createdAt.slice(0, 10))}</span>
              {!n.isRead ? (
                <button
                  type="button"
                  onClick={() => mutate("notification", "read", { id: n.id }, { silent: true })}
                  className="text-[11px] font-medium text-accent-text touch-manipulation"
                >
                  O‘qilgan
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </Sheet>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
  tourActive = false,
  badge = 0,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  tourActive?: boolean;
  badge?: number;
}) {
  /*
   * The active state is carried by COLOUR ALONE: gold icon, bright label, 700
   * weight. The old underline indicator and the tinted pill behind the icon are
   * both gone — with a five-tab bar they were three separate things saying the
   * same thing, and on a floating glass panel the pill fought the blur.
   *
   * Geometry is fixed: the icon box and the label baseline keep their exact
   * position and size in both states, so switching tabs never shifts layout.
   * Motion is a 180ms colour crossfade (§ Motion: "Tab almashish"); press
   * feedback stays the gentle 0.98 scale on `.nav-item`.
   *
   * `aria-current="page"` is what actually announces the active tab, so the
   * removed indicator costs nothing in accessibility terms.
   */
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} o‘qilmagan eslatma` : undefined}
      className={`nav-item flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-1 transition-colors duration-[180ms] ease-out touch-manipulation ${tourActive ? "animate-pulse-subtle ring-1 ring-accent/60" : ""} ${
        active ? "text-gold" : "text-faint"
      }`}
    >
      <span className="relative grid h-6 w-full place-items-center">
        <Icon name={icon} size={22} strokeWidth={active ? 1.9 : 1.8} />
        {badge > 0 ? (
          <span
            key={badge}
            className="animate-badge-pop absolute right-1/2 top-0 grid h-[15px] min-w-[15px] translate-x-[14px] place-items-center rounded-full border-2 border-bg bg-negative px-1 text-[8px] font-bold leading-none text-negative-fg"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span
        className={`w-full truncate text-center text-[9.5px] leading-none transition-colors duration-[180ms] ease-out ${
          active ? "font-bold text-fg" : "font-semibold"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}
