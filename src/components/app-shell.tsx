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
  const { state, error, theme, setTheme, mutate, telegram } = useFinance();
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
          <div className="brand-mark mx-auto grid h-12 w-12 place-items-center rounded-2xl text-lg font-bold">
            H
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
          <div className="brand-mark grid h-9 w-9 place-items-center rounded-xl text-[15px] font-bold">
            <span>H</span>
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
                active ? "bg-primary font-semibold text-primary-fg shadow-sm shadow-indigo-500/25" : "text-fg-soft hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <item.icon active={active} />
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
          <span className="text-base">🤖</span> Telegram bot
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
          <BellIcon />
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
          <span className="grid h-5 w-5 place-items-center text-fg-soft">
            {theme === "dark" ? <MoonIcon /> : theme === "light" ? <SunIcon /> : <SystemIcon />}
          </span>
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
          <header className="glass-bar sticky top-0 z-30 -mx-3.5 mb-3 border-b border-slate-900/[0.04] px-3.5 pb-3 pt-2.5 backdrop-blur-md transition-colors dark:border-white/[0.05] sm:-mx-6 sm:mb-4 sm:px-6 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold">
                  H
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-bold leading-tight tracking-tight text-fg">
                    Salom, {state?.user.firstName ?? "…"}
                  </p>
                  <p className="num truncate text-[11.5px] text-slate-400">
                    {formatAmount(state?.currentBalance ?? 0)}{" "}
                    <span className="font-normal">{state?.user.currency ?? "UZS"}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition active:scale-90 dark:text-slate-300 touch-manipulation"
                  aria-label="Mavzuni almashtirish"
                >
                  {theme === "dark" ? <SunIcon /> : theme === "light" ? <MoonIcon /> : <SystemIcon />}
                </button>
                <button
                  onClick={() => setAlertsOpen(true)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition active:scale-90 dark:text-slate-300 touch-manipulation"
                  aria-label={`Eslatmalar${unread ? `, ${unread} o‘qilmagan` : ""}`}
                >
                  <BellIcon />
                  {unread > 0 ? (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-[#f4f5f9] dark:ring-[#0b0f19]" />
                  ) : null}
                </button>
                {telegram ? (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        (
                          window as unknown as {
                            Telegram?: { WebApp?: { close?: () => void } };
                          }
                        ).Telegram?.WebApp?.close?.();
                      } catch {
                        /* optional Mini App chrome */
                      }
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition active:scale-90 dark:text-slate-300 touch-manipulation"
                    aria-label="Yopish"
                  >
                    <CloseIcon />
                  </button>
                ) : null}
              </div>
            </div>
          </header>
        ) : null}

        <SwipeBack enabled={isSub}>
          <div className="min-w-0">{children}</div>
        </SwipeBack>
      </main>

      {/* Bottom navigation has deterministic geometry; FAB positioning and
          content clearance consume the same CSS variables. */}
      <nav className="app-bottom-nav glass-nav fixed inset-x-0 bottom-0 border-t border-slate-900/[0.06] dark:border-white/[0.06] lg:hidden">
        <div className="mobile-bottom-nav-inner mx-auto grid max-w-lg grid-cols-5 items-stretch px-1 pt-1.5 sm:px-2">
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
      className="nav-item relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-2 touch-manipulation"
    >
      {active ? <span className="anim-fade absolute inset-x-1 inset-y-0 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15" /> : null}
      {badge > 0 ? (
        <span
          key={badge}
          className="animate-badge-pop absolute right-2.5 top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold leading-none text-white"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      <span
        className="relative z-10 transition-transform duration-200 ease-out"
        style={{ transform: active ? "scale(1.06)" : "scale(1)" }}
      >
        <Icon active={active} />
      </span>
      <span
        className={`relative z-10 w-full truncate text-center text-[10px] leading-none transition-[color,font-weight] duration-200 ease-out ${
          active ? "font-semibold text-indigo-600 dark:text-indigo-300" : "font-medium text-slate-400 dark:text-slate-500"
        }`}
      >
        {label}
      </span>
      <span
        className="relative z-10 mt-0.5 h-[3px] w-4 rounded-full bg-indigo-600 transition-[transform,opacity] duration-200 ease-out dark:bg-indigo-300"
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

function iconStroke(active?: boolean) {
  return active ? "currentColor" : "var(--muted)";
}

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={iconStroke(active)} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-indigo-600 dark:text-indigo-300" : ""}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}
function ListIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={iconStroke(active)} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-indigo-600 dark:text-indigo-300" : ""}>
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
    </svg>
  );
}
function CalendarIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={iconStroke(active)} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-indigo-600 dark:text-indigo-300" : ""}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" strokeLinecap="round" />
    </svg>
  );
}
function ChartIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={iconStroke(active)} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-indigo-600 dark:text-indigo-300" : ""}>
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" strokeLinecap="round" />
    </svg>
  );
}
function GridIcon({ active }: IconProps) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={iconStroke(active)} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-indigo-600 dark:text-indigo-300" : ""}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2 4.8 4.8M19.2 19.2l-1.4-1.4M6.2 17.8 4.8 19.2M19.2 4.8l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
