"use client";

import Link from "next/link";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { Section, Skeleton } from "@/components/ui";
import { BotIcon, CardIcon, ChevronRightIcon, ClipboardIcon, SettingsIcon, TargetIcon, TrophyIcon } from "@/components/icons";

/**
 * MENU = NAVIGATION HUB (§37). It routes to secondary tools and nothing more.
 * Balances, budget usage, debt totals and goal progress each have exactly ONE
 * primary home — their own pages. The Menu renders no metrics, no
 * descriptions, no mini-dashboard: just icon + title + chevron per row.
 *
 * Icons are the shared stroke set (icons.tsx) — the same weight, cap and
 * colour system as bottom navigation, never platform-dependent emoji.
 */
const LINKS: Array<{ href: string; icon: (p: { size?: number }) => React.ReactElement; title: string }> = [
  { href: "/accounts", icon: CardIcon, title: "Hisoblar" },
  { href: "/budgets", icon: TargetIcon, title: "Budjetlar" },
  { href: "/debts", icon: ClipboardIcon, title: "Qarzdorlik" },
  { href: "/goals", icon: TrophyIcon, title: "Maqsadlar" },
  { href: "/bot", icon: BotIcon, title: "Telegram bot" },
  { href: "/settings", icon: SettingsIcon, title: "Sozlamalar" },
];

export default function MorePage() {
  const { state, loading } = useFinance();

  // Global FAB → secondary tools. Each entry routes to the page that OWNS the
  // form, which auto-opens its own create sheet (no duplicated forms).
  const { route } = useFab();
  useFabPage({}, {
    account: (a) => route("/accounts", a),
    debt: (a) => route("/debts", a),
    goal: (a) => route("/goals", a),
    budget: (a) => route("/budgets", a),
    // Category creation is owned by Accounts → Kategoriyalar tab (§35).
    category: (a) => route("/accounts", a),
  });

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-6">
      {/* No section-name headline: the profile header + menu list start at the
          top. The Menu route owns the profile header, not a "Menyu" title. */}
      <Section>
        <nav aria-label="Qo‘shimcha bo‘limlar" className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2 active:bg-surface-2 touch-manipulation"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-fg-soft transition-colors group-hover:bg-surface-3 group-hover:text-fg" aria-hidden="true">
                <l.icon size={19} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{l.title}</span>
              <ChevronRightIcon size={16} className="shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </Section>
    </div>
  );
}
