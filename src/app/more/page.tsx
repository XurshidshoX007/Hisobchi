"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertsSheet } from "@/components/app-shell";
import { useFinance } from "@/components/providers";
import { Badge, Card, Label, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icon";

/**
 * MENU = NAVIGATION HUB (§37). It routes to secondary tools and nothing more.
 * Balances, budget usage, debt totals and goal progress each have exactly ONE
 * primary home — their own pages. So every row carries a COUNT or a STATUS,
 * never a sum: "is there anything in there, and does it need me?" is
 * navigation information; the amount itself is not.
 */
const LINKS: Array<{ href: string; icon: string; title: string }> = [
  { href: "/accounts", icon: "card", title: "Hisoblar" },
  { href: "/budgets", icon: "target", title: "Budjetlar" },
  { href: "/debts", icon: "doc", title: "Qarzdorlik" },
  { href: "/goals", icon: "goal", title: "Maqsadlar" },
  { href: "/bot", icon: "telegram", title: "Telegram bot" },
  { href: "/settings", icon: "settings", title: "Sozlamalar" },
];

export default function MorePage() {
  const { state, loading, theme, setTheme, telegram } = useFinance();
  const [alertsOpen, setAlertsOpen] = useState(false);

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const user = state.user;
  const accountCount = state.accounts.filter((a) => a.isActive).length;
  const exceeded = state.budgets.filter((b) => b.status === "exceeded").length;
  const unread = state.alerts.length + state.notifications.filter((n) => !n.isRead).length;

  /**
   * A row's trailing slot is a status when something needs attention, and a
   * plain count otherwise. An over-limit budget is the one case on this screen
   * that is genuinely urgent, so it is the one case that gets a tone.
   */
  const status = (href: string): { node: React.ReactNode } | null => {
    if (href === "/budgets" && exceeded > 0) {
      return { node: <Badge tone="negative">{exceeded} oshdi</Badge> };
    }
    if (href === "/bot") {
      return telegram ? { node: <Badge tone="positive">Ulangan</Badge> } : null;
    }
    const counts: Record<string, number> = {
      "/accounts": accountCount,
      "/budgets": state.budgets.length,
      "/debts": state.debts.length,
      "/goals": state.goals.length,
    };
    const count = counts[href];
    return count ? { node: <span className="text-[12px] font-semibold text-faint">{count}</span> } : null;
  };

  const themeLabel = theme === "dark" ? "Tungi" : theme === "light" ? "Kunduzgi" : "Tizim";

  return (
    <div className="animate-fade-up space-y-3.5">
      {/* Identity, centred — the Menu's own header. It states WHO, never how
          much: the balance has exactly one home and this is not it. */}
      <Card className="text-center">
        <div
          className="mx-auto grid h-[62px] w-[62px] place-items-center rounded-[21px] text-[23px] font-extrabold"
          style={{ background: "var(--gold-gradient)", color: "var(--gold-on)" }}
          aria-hidden="true"
        >
          <span className="num">{(user.firstName || "?").trim().charAt(0).toUpperCase()}</span>
        </div>
        <p className="mt-3 truncate text-[18px] font-bold leading-tight">{user.firstName}</p>
        <p className="mt-1 truncate text-[11.5px] text-faint">
          {user.username ? `@${user.username} · ` : ""}Telegram Mini App
        </p>
      </Card>

      <nav aria-label="Qo‘shimcha bo‘limlar" className="divide-y divide-hairline rounded-2xl border border-line bg-surface">
        {LINKS.map((l) => {
          const trailing = status(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-13 items-center gap-3 px-4 py-2.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2 active:bg-surface-2 touch-manipulation"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-soft text-fg-soft" aria-hidden="true">
                <Icon name={l.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{l.title}</span>
              {trailing ? <span className="shrink-0">{trailing.node}</span> : null}
              <Icon name="chevron-right" size={13} className="shrink-0 text-text-4" />
            </Link>
          );
        })}
      </nav>

      {/* Two controls that belong to the person rather than to a section, so
          they sit here instead of costing a whole row in the list. */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          className="card flex items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99] touch-manipulation"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--tint-gold)", color: "var(--gold)" }} aria-hidden="true">
            <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} size={17} />
          </span>
          <span className="min-w-0">
            <Label className="block">Rejim</Label>
            <span className="mt-0.5 block truncate text-[13.5px] font-bold">{themeLabel}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAlertsOpen(true)}
          className="card flex items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99] touch-manipulation"
          aria-label={`Eslatmalar${unread ? `, ${unread} o‘qilmagan` : ""}`}
        >
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--tint-blue)", color: "var(--blue)" }} aria-hidden="true">
            <Icon name="bell" size={17} />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-negative shadow-[0_0_0_2px_var(--surface)]" />
            ) : null}
          </span>
          <span className="min-w-0">
            <Label className="block">Eslatma</Label>
            <span className="mt-0.5 block truncate text-[13.5px] font-bold">
              {unread > 0 ? `${unread} ta yangi` : "Yangi yo‘q"}
            </span>
          </span>
        </button>
      </div>

      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
