"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { formatAmount, humanDate } from "@/lib/money";
import { getFabActions, supportsFab } from "@/lib/fab";
import { MENU_ROUTE, isMenuSubroute, showsProfileHeader } from "@/lib/navigation";
import { useFinance } from "./providers";
import { FabProvider, GlobalAddFab, useFab } from "./fab";
import { Badge, Button, Money, Sheet } from "./ui";
import { SwipeBack } from "./swipe-back";

const NAV = [
  { href: "/", label: "Asosiy", short: "Asosiy", icon: HomeIcon },
  { href: "/transactions", label: "Operatsiyalar", short: "Tarix", icon: ListIcon },
  { href: "/plans", label: "Rejalar", short: "Reja", icon: CalendarIcon },
  { href: "/analytics", label: "Tahlil", short: "Tahlil", icon: ChartIcon },
  { href: "/more", label: "Boshqaruv", short: "Menyu", icon: GridIcon },
];

const PAGE_DETAILS: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  "/": { eyebrow: "Moliya markazi", title: "Umumiy ko‘rinish", subtitle: "Balans va oylik pul harakati" },
  "/transactions": { eyebrow: "Hisob-kitob", title: "Operatsiyalar", subtitle: "Barcha daromad va xarajatlar tarixi" },
  "/plans": { eyebrow: "Oldindan nazorat", title: "Moliyaviy rejalar", subtitle: "To‘lovlar, daromadlar va pul oqimi" },
  "/analytics": { eyebrow: "Moliyaviy razvedka", title: "Tahlil", subtitle: "Trendlar va foydali xulosalar" },
  "/more": { eyebrow: "Ish maydoni", title: "Boshqaruv", subtitle: "Moliya vositalari va sozlamalar" },
  "/accounts": { eyebrow: "Boshqaruv", title: "Hisoblar", subtitle: "Hamyonlar va kategoriyalar" },
  "/budgets": { eyebrow: "Boshqaruv", title: "Budjetlar", subtitle: "Oylik limitlar va sarf nazorati" },
  "/debts": { eyebrow: "Boshqaruv", title: "Qarzdorlik", subtitle: "Berilgan va olingan qarzlar" },
  "/goals": { eyebrow: "Boshqaruv", title: "Maqsadlar", subtitle: "Jamg‘arma rejalari va natijalar" },
  "/bot": { eyebrow: "Avtomatlashtirish", title: "Telegram bot", subtitle: "Operatsiyalarni suhbat orqali kiriting" },
  "/settings": { eyebrow: "Tizim", title: "Sozlamalar", subtitle: "Profil, eslatma va ko‘rinish" },
};

function pageDetails(pathname: string) {
  const exact = PAGE_DETAILS[pathname];
  if (exact) return exact;
  const key = Object.keys(PAGE_DETAILS).find((route) => route !== "/" && pathname.startsWith(`${route}/`));
  return (key && PAGE_DETAILS[key]) || PAGE_DETAILS["/"];
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark ${compact ? "h-9 w-9 rounded-xl" : "h-10 w-10 rounded-[14px]"}`} aria-hidden="true">
      <svg width={compact ? 18 : 20} height={compact ? 18 : 20} viewBox="0 0 24 24" fill="none">
        <path d="M7 5v14M17 5v14M7 12h10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="m14.5 7.5 2.5-2.5 2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

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
  const details = pageDetails(pathname);

  if (error === "auth") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="card relative w-full max-w-sm overflow-hidden p-7 text-center sm:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent" />
          <div className="mx-auto w-fit"><BrandMark /></div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-accent-text">Xavfsiz kirish</p>
          <h1 className="mt-1.5 text-xl font-bold tracking-[-0.035em]">Hisobchi</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Ilovani Telegram ichidan oching. Shaxsingiz xavfsiz tarzda avtomatik tasdiqlanadi.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[11.5px] text-muted">
            <LockIcon /> Ma’lumotlaringiz himoyalangan
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className={`app-shell-layout mx-auto flex min-h-dvh w-full max-w-[1440px] gap-7 px-3.5 pt-0 sm:px-6 lg:px-5 lg:pt-5 ${hasFloatingAction ? "has-global-fab" : ""}`}>
      {/* Sidebar — desktop */}
      <aside className="sidebar-panel sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-[252px] shrink-0 flex-col gap-1 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-2 pt-0.5">
          <BrandMark />
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-[-0.025em] text-white">Hisobchi</p>
            <p className="sidebar-subtle mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em]">Moliya tizimi</p>
          </div>
        </div>
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              className={`sidebar-nav-item flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-[13.5px] ${active ? "font-semibold" : "font-medium"}`}
            >
              <span className="grid h-7 w-7 place-items-center"><item.icon active={active} /></span>
              {item.label}
              {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
            </Link>
          );
        })}
        <div className="my-2 h-px bg-white/10" />
        <Link
          href="/bot"
          data-active={pathname === "/bot"}
          className={`sidebar-nav-item flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-[13.5px] ${pathname === "/bot" ? "font-semibold" : "font-medium"}`}
        >
          <span className="grid h-7 w-7 place-items-center"><BotIcon /></span> Telegram bot
        </Link>

        <div className="mt-auto space-y-2 pt-6">
          {/* Balance is a compact reference, never a duplicate dashboard hero. */}
          <Link href="/" className="sidebar-balance block rounded-2xl px-3.5 py-3.5 transition-colors hover:bg-white/[0.09]">
            <div className="flex items-center justify-between gap-2">
              <p className="sidebar-subtle text-[9.5px] font-bold uppercase tracking-[0.12em]">Umumiy balans</p>
              <span className="sidebar-subtle text-[11px]">→</span>
            </div>
            <p className="num mt-1.5 truncate text-[17px] font-semibold tracking-[-0.03em] text-white">
              {formatAmount(state?.currentBalance ?? 0)}
              <span className="ml-1 text-[9px] font-medium tracking-normal text-white/50">{state?.user.currency ?? "UZS"}</span>
            </p>
            <p className="sidebar-subtle mt-1 text-[10px]">{state?.accounts.length ?? 0} ta faol hisob</p>
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAlertsOpen(true)}
              className="relative flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] text-[11.5px] font-medium text-white/70 transition-colors hover:bg-white/[0.09] hover:text-white touch-manipulation"
            >
              <BellIcon /> Eslatma
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[#0b1e18] bg-negative px-1 text-[8px] font-bold text-negative-fg">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] text-[11.5px] font-medium text-white/70 transition-colors hover:bg-white/[0.09] hover:text-white touch-manipulation"
            >
              <ThemeIcon theme={theme} /> {theme === "dark" ? "Tungi" : theme === "light" ? "Yorug‘" : "Tizim"}
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:pt-0.5">
        {/* A consistent route header makes hierarchy obvious on every screen.
            Only Menu owns profile facts; other routes show product context. */}
        <header className="shell-topbar glass-bar sticky top-0 z-30 -mx-3.5 mb-4 flex min-h-[72px] items-center justify-between gap-3 px-3.5 py-2.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:min-h-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            {isSub ? (
              <Link
                href={MENU_ROUTE}
                aria-label="Boshqaruvga qaytish"
                className="shell-icon-button shrink-0 lg:hidden"
              >
                <BackIcon />
              </Link>
            ) : (
              <span className="shrink-0 lg:hidden"><BrandMark compact /></span>
            )}
            <div className="min-w-0">
              <p className="shell-eyebrow truncate">
                {profileHeader ? `Salom, ${state?.user.firstName ?? "…"}` : details.eyebrow}
              </p>
              <h1 className="shell-title mt-0.5 truncate">{details.title}</h1>
              <p className="mt-1 hidden truncate text-[12px] text-muted sm:block">
                {profileHeader
                  ? `${formatAmount(state?.currentBalance ?? 0)} ${state?.user.currency ?? "UZS"} · ${details.subtitle}`
                  : details.subtitle}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
              className="shell-icon-button"
              aria-label="Mavzuni almashtirish"
              title={theme === "dark" ? "Tungi mavzu" : theme === "light" ? "Yorug‘ mavzu" : "Tizim mavzusi"}
            >
              <ThemeIcon theme={theme} />
            </button>
            <button
              onClick={() => setAlertsOpen(true)}
              className="shell-icon-button relative"
              aria-label={`Eslatmalar${unread ? `, ${unread} o‘qilmagan` : ""}`}
            >
              <BellIcon />
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-bg bg-negative px-1 text-[8px] font-bold text-negative-fg">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <SwipeBack enabled={isSub}>
          <div className="min-w-0 pb-1">{children}</div>
        </SwipeBack>
      </main>

      {/* Bottom navigation has deterministic geometry; FAB positioning and
          content clearance consume the same CSS variables. */}
      <nav className="app-bottom-nav glass-nav fixed inset-x-0 bottom-0 px-2 lg:hidden">
        <div className="mobile-bottom-nav-inner mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pt-1.5 sm:px-2">
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
      className={`nav-item flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 pt-1.5 touch-manipulation ${active ? "text-accent-text" : "text-muted"}`}
    >
      <span
        className={`relative grid h-7 w-full place-items-center rounded-lg transition-[background-color] duration-200 ease-out ${
          active ? "bg-accent-soft" : "bg-transparent"
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
            className="animate-badge-pop absolute right-1/2 top-0 grid h-[15px] min-w-[15px] translate-x-[14px] place-items-center rounded-full border-2 border-bg bg-negative px-1 text-[8px] font-bold leading-none text-negative-fg"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span
        className={`w-full truncate text-center text-[10px] leading-none transition-[color,font-weight] duration-200 ease-out ${
          active ? "font-semibold text-fg" : "font-medium text-muted"
        }`}
      >
        {label}
      </span>
      <span
        className="mt-0.5 h-[3px] w-4 rounded-full bg-accent transition-[transform,opacity] duration-200 ease-out"
        style={{
          transform: active ? "scaleX(1)" : "scaleX(0.5)",
          opacity: active ? 1 : 0,
          transformOrigin: "center",
        }}
      />
    </Link>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: "light" | "dark" | "system" }) {
  if (theme === "system") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.5 15.2A8.6 8.6 0 0 1 8.8 3.5 8.6 8.6 0 1 0 20.5 15.2Z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="4" /><path d="M12 3v4M8.5 12h.01M15.5 12h.01M9 16h6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

type IconProps = { active?: boolean };

function HomeIcon({}: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}
function ListIcon({}: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
    </svg>
  );
}
function CalendarIcon({}: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" strokeLinecap="round" />
    </svg>
  );
}
function ChartIcon({}: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" strokeLinecap="round" />
    </svg>
  );
}
function GridIcon({}: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </svg>
  );
}
