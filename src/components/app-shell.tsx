"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { formatAmount, humanDate } from "@/lib/money";
import { getFabActions, supportsFab } from "@/lib/fab";
import { MENU_ROUTE, isMenuSubroute, showsProfileHeader } from "@/lib/navigation";
import { useFinance } from "./providers";
import { FabProvider, GlobalAddFab, useFab } from "./fab";
import { Badge, Button, Divider, Money, Sheet } from "./ui";
import { SwipeBack } from "./swipe-back";

const NAV = [
  { href: "/", label: "Asosiy", short: "Asosiy", icon: HomeIcon },
  { href: "/transactions", label: "Tarix", short: "Tarix", icon: ListIcon },
  { href: "/plans", label: "Reja", short: "Reja", icon: CalendarIcon },
  { href: "/analytics", label: "Tahlil", short: "Tahlil", icon: ChartIcon },
  { href: "/more", label: "Ko‘proq", short: "Menyu", icon: GridIcon },
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
  const hasGlobalFab = supportsFab(pathname) && getFabActions({ pathname, ...currentContext }).length > 0;
  // History owns a contextual filter FAB in the same shared geometry slot. It
  // replaces (rather than stacks with) the global add action on that route.
  const hasContextualFab = pathname === "/transactions";
  const hasFloatingAction = hasGlobalFab || hasContextualFab;

  const unread = (state?.alerts.length ?? 0) + (state?.notifications.filter((n) => !n.isRead).length ?? 0);
  // Route-aware header: TRUE only on `/more`. Internal pages (Hisoblar,
  // Budjetlar, Qarzdorlik, Maqsadlar, Sozlamalar, Bot) never mount it — no
  // CSS hiding, the element is simply absent from the DOM there. No data
  // fetching depends on this flag: profile/balance state stays in the
  // provider, only its render location changes.
  const profileHeader = showsProfileHeader(pathname);
  const isSub = isMenuSubroute(pathname);

  if (error === "auth") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-fg">
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
    <div className={`app-shell-layout mx-auto flex min-h-dvh w-full max-w-6xl gap-6 px-3.5 pt-3 sm:px-6 lg:pt-6 ${hasFloatingAction ? "has-global-fab" : ""}`}>
      {/* Sidebar — desktop */}
      <aside className="sticky top-6 hidden h-fit w-60 shrink-0 flex-col gap-1 rounded-lg border border-line bg-surface p-2 shadow-card lg:flex">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-[15px] font-bold text-primary-fg">
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
              className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] transition-colors ${
                active ? "bg-surface-2 font-semibold text-fg" : "text-fg-soft hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {active ? <span className="absolute left-0 top-2 h-7 w-1 rounded-r-full bg-primary" aria-hidden="true" /> : null}
              <item.icon active={active} />
              {item.label}
            </Link>
          );
        })}
        <Divider />
        <Link
          href="/bot"
          className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] transition-colors ${
            pathname === "/bot" ? "bg-surface-2 font-semibold text-fg" : "text-fg-soft hover:bg-surface-2 hover:text-fg"
          }`}
        >
          {pathname === "/bot" ? <span className="absolute left-0 top-2 h-7 w-1 rounded-r-full bg-primary" aria-hidden="true" /> : null}
          <span className="text-base">🤖</span> Telegram bot
        </Link>

        {/* Balance is OWNED by the Dashboard hero — the sidebar carries only a
            one-line reference to it (§4), never a second hero. */}
        <Link href="/" className="mt-5 block rounded-md border border-line bg-surface-2 px-3 py-2 transition-colors hover:border-line-strong">
          <p className="text-[11.5px] text-muted">
            Balans: <span className="num font-semibold text-fg">{formatAmount(state?.currentBalance ?? 0)}</span>
          </p>
          <p className="text-[10.5px] text-muted">{state?.accounts.length ?? 0} hisob · Asosiy →</p>
        </Link>

        <button
          onClick={() => setAlertsOpen(true)}
          className="mt-3 flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg touch-manipulation"
        >
          <span className="text-base">🔔</span>
          Eslatmalar
          {unread > 0 ? (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-negative px-1.5 text-[10px] font-bold text-negative-fg">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          className="mt-1 flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg touch-manipulation"
        >
          <span className="text-base">{theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥"}</span>
          {theme === "dark" ? "Tungi" : theme === "light" ? "Kunduzgi" : "Tizim"}
        </button>
      </aside>

      <main className="min-w-0 flex-1">
        {/*
         * Mobile profile header — `/more` (Menu) route ONLY. Internal pages
         * reached from Menu start with their own compact back affordance instead.
         * It is not hidden with CSS: on every other route the element is never
         * mounted, so it occupies zero height/margin/padding and the page
         * content starts at the top of the viewport.
         */}
        {profileHeader ? (
          <header className="glass-bar sticky top-0 z-30 -mx-3.5 mb-3 flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 sm:-mx-6 sm:mb-4 sm:px-6 lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-[15px] font-bold text-primary-fg">
                ₮
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold leading-tight">Salom, {state?.user.firstName ?? "…"} 👋</p>
                <p className="num truncate text-[11.5px] font-semibold leading-tight">
                  {formatAmount(state?.currentBalance ?? 0)}{" "}
                  <span className="font-normal text-muted">{state?.user.currency ?? "UZS"}</span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
                className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-sm transition-colors active:bg-surface-3 touch-manipulation"
                aria-label="Mavzuni almashtirish"
              >
                {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥"}
              </button>
              <button
                onClick={() => setAlertsOpen(true)}
                className="relative grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-sm transition-colors active:bg-surface-3 touch-manipulation"
                aria-label={`Eslatmalar${unread ? `, ${unread} o‘qilmagan` : ""}`}
              >
                🔔
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-bg bg-negative px-1 text-[9px] font-bold text-negative-fg">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </button>
            </div>
          </header>
        ) : null}

        <SwipeBack enabled={isSub}>
          <div className="min-w-0">{children}</div>
        </SwipeBack>
      </main>

      {/* Bottom navigation has deterministic geometry; FAB positioning and
          content clearance consume the same CSS variables. */}
      <nav className="app-bottom-nav glass-nav fixed inset-x-0 bottom-0 border-t border-line lg:hidden">
        <div className="mobile-bottom-nav-inner mx-auto flex max-w-lg items-stretch justify-between gap-1 px-1.5 pt-2 sm:px-2">
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
              // The bell now lives in the Menu header only, so the Menu tab
              // carries the unread indicator — notifications stay discoverable
              // from every screen without a global header.
              badge={item.href === MENU_ROUTE ? unread : 0}
            />
          ))}
        </div>
      </nav>

      <Sheet
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
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
                {a.severity === "critical" ? "🚨" : a.severity === "warning" ? "⚠️" : "🔔"} {a.title}
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
                onClick={() => setAlertsOpen(false)}
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
    </div>
    <GlobalAddFab />
    </>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge = 0,
}: {
  href: string;
  label: string;
  icon: (p: { active: boolean }) => React.ReactNode;
  active: boolean;
  badge?: number;
}) {
  /*
   * Motion model (§6–§14):
   *  - one shared ease-out curve + 200ms duration for background/icon/label/
   *    indicator so every part of the active state changes in sync;
   *  - the indicator expands/fades (scaleX + opacity) instead of repainting,
   *    so the old line "shrinks" while the new one "grows" with no geometry change;
   *  - the icon scales ~1.06 while active — a "you are here" cue, not a bounce;
   *  - press feedback is a gentle 0.98 scale (no jump, no flash).
   * Geometry is fixed: icon box, label baseline and indicator all keep their
   * exact position and size, so switching tabs never shifts the nav layout.
   */
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} o‘qilmagan eslatma` : undefined}
      className={`nav-item flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-0.5 pb-1 pt-1.5 touch-manipulation ${
        active ? "text-primary" : "text-muted"
      }`}
    >
      <span
        className={`relative grid h-8 w-full place-items-center rounded-md transition-[background-color,color] duration-200 ease-out ${
          active ? "bg-primary text-primary-fg shadow-[0_8px_18px_-14px_rgba(13,59,52,0.65)]" : "bg-transparent"
        }`}
      >
        <span
          className="transition-transform duration-200 ease-out"
          style={{ transform: active ? "scale(1.06)" : "scale(1)" }}
        >
          <Icon active={active} />
        </span>
        {badge > 0 ? (
          <span
            key={badge}
            className="animate-badge-pop absolute right-1/2 top-0 grid h-[15px] min-w-[15px] translate-x-[15px] place-items-center rounded-full border-2 border-bg bg-negative px-1 text-[8px] font-bold leading-none text-negative-fg"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span
        className={`w-full truncate text-center text-[10px] leading-none transition-[color,font-weight] duration-200 ease-out ${
          active ? "font-semibold text-primary" : "font-medium text-muted"
        }`}
      >
        {label}
      </span>
      <span
        className="mt-0.5 h-[3px] w-4 rounded-full bg-primary transition-[transform,opacity] duration-200 ease-out"
        style={{
          transform: active ? "scaleX(1)" : "scaleX(0.5)",
          opacity: active ? 1 : 0,
          transformOrigin: "center",
        }}
      />
    </Link>
  );
}

type IconProps = { active?: boolean };

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "currentColor" : "var(--muted)"} strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}
function ListIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "currentColor" : "var(--muted)"} strokeWidth="1.8">
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
    </svg>
  );
}
function CalendarIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "currentColor" : "var(--muted)"} strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" strokeLinecap="round" />
    </svg>
  );
}
function ChartIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "currentColor" : "var(--muted)"} strokeWidth="1.8">
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" strokeLinecap="round" />
    </svg>
  );
}
function GridIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "currentColor" : "var(--muted)"} strokeWidth="1.8">
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </svg>
  );
}
