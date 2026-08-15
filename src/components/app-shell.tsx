"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { formatAmount, humanDate } from "@/lib/money";
import { useFinance } from "./providers";
import { Badge, Button, Divider, Money, Sheet } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", short: "Asosiy", icon: HomeIcon },
  { href: "/transactions", label: "Operatsiyalar", short: "Tarix", icon: ListIcon },
  { href: "/plans", label: "Reja", short: "Reja", icon: CalendarIcon },
  { href: "/analytics", label: "Tahlil", short: "Tahlil", icon: ChartIcon },
  { href: "/more", label: "Ko‘proq", short: "Menyu", icon: GridIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, error, theme, setTheme, mutate } = useFinance();
  const [alertsOpen, setAlertsOpen] = useState(false);

  const unread = (state?.alerts.length ?? 0) + (state?.notifications.filter((n) => !n.isRead).length ?? 0);

  if (error === "auth") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-fg">
            ₮
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Moliya OS</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Bu muhitda demo rejim o‘chirilgan. Ilovani Telegram Mini App sifatida oching —{" "}
            <span className="font-medium text-fg-soft">kirish Telegram orqali xavfsiz tasdiqlanadi</span>.
          </p>
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[11.5px] leading-snug text-muted">
            BotFather’da Mini App URL sozlangach, foydalanuvchilar to‘g‘ridan-to‘g‘ri Telegram ichida kiradi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl gap-6 px-3.5 pt-3 sm:px-6 pb-[calc(76px+env(safe-area-inset-bottom)+16px)] sm:pb-6 lg:pb-10">
      {/* Sidebar — desktop */}
      <aside className="sticky top-6 hidden h-fit w-60 shrink-0 flex-col gap-1 lg:flex">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[15px] font-bold text-primary-fg">
            <span>₮</span>
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-tight">Moliya OS</p>
            <p className="text-[11px] text-muted">Personal Finance</p>
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

        <div className="mt-6 px-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Umumiy balans</p>
          <p className="num mt-1 text-xl font-semibold">{formatAmount(state?.forecast.currentBalance ?? 0)}</p>
          <p className="text-[11px] text-muted">{state?.accounts.length ?? 0} hisob</p>
        </div>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          className="mt-4 flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg touch-manipulation"
        >
          <span className="text-base">{theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥"}</span>
          {theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "Tizim mavzusi"}
        </button>
      </aside>

      <main className="min-w-0 flex-1">
        {/* Mobile header — sticky */}
        <header className="glass-bar sticky top-0 z-30 -mx-3.5 mb-3 flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 sm:-mx-6 sm:mb-4 sm:px-6 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-[15px] font-bold text-primary-fg">
              ₮
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight">Salom, {state?.user.firstName ?? "…"} 👋</p>
              <p className="num truncate text-[11.5px] font-semibold leading-tight">
                {formatAmount(state?.forecast.currentBalance ?? 0)}{" "}
                <span className="font-normal text-muted">{state?.user.currency ?? "UZS"}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-sm transition-colors active:bg-surface-3 touch-manipulation"
              aria-label="Mavzuni almashtirish"
            >
              {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥"}
            </button>
            <button
              onClick={() => setAlertsOpen(true)}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-sm transition-colors active:bg-surface-3 touch-manipulation"
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

        <div className="min-w-0">{children}</div>

        {/* Desktop alerts */}
        <div className="mt-8 hidden shrink-0 justify-end lg:flex">
          <Button variant="secondary" size="sm" onClick={() => setAlertsOpen(true)}>
            🔔 Eslatmalar {unread > 0 ? `(${unread})` : ""}
          </Button>
        </div>
      </main>

      {/* Bottom nav — mobile only, 5 items, no FAB */}
      <nav className="glass-nav fixed inset-x-0 bottom-0 z-40 border-t border-line lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 sm:px-2">
          {NAV.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.short}
              icon={item.icon}
              active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
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
            Barchasini o‘qilgan deb belgilash
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
            {a.refDate ? <p className="mt-2 text-[11px] text-muted">{humanDate(a.refDate)}</p> : null}
          </div>
        ))}
        {state?.notifications.map((n) => (
          <div key={n.id} className="flat-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-medium">{n.title}</p>
              <Badge tone={n.isRead ? "neutral" : "accent"}>{n.isRead ? "o‘qilgan" : "yangi"}</Badge>
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
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (p: { active: boolean }) => React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 pb-1 pt-1.5 transition-colors active:bg-surface-2 touch-manipulation"
    >
      <span className={`grid h-7 w-full place-items-center rounded-lg transition-colors ${active ? "bg-accent-soft" : ""}`}>
        <Icon active={active} />
      </span>
      <span className={`w-full truncate text-center text-[10px] font-medium leading-none ${active ? "text-fg" : "text-muted"}`}>
        {label}
      </span>
      <span className="mt-0.5 h-[3px] w-4 rounded-full transition-all" style={{ background: active ? "var(--accent)" : "transparent" }} />
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
