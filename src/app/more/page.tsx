"use client";

import Link from "next/link";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { PageHeader, Section, Skeleton } from "@/components/ui";

/**
 * MENU = NAVIGATION HUB (§37). It routes to secondary tools and nothing more.
 * Balances, budget usage, debt totals and goal progress each have exactly ONE
 * primary home — their own pages. The Menu renders no metrics, no
 * descriptions, no mini-dashboard: just icon + title + chevron per row.
 */
const LINKS: Array<{ href: string; icon: string; title: string }> = [
  { href: "/accounts", icon: "💳", title: "Hisoblar" },
  { href: "/budgets", icon: "🎯", title: "Budjetlar" },
  { href: "/debts", icon: "📋", title: "Qarzdorlik" },
  { href: "/goals", icon: "🏆", title: "Maqsadlar" },
  { href: "/bot", icon: "🤖", title: "Telegram bot" },
  { href: "/settings", icon: "⚙️", title: "Sozlamalar" },
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
      <PageHeader title="Menyu" />

      <Section>
        <nav aria-label="Qo‘shimcha bo‘limlar" className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2 active:bg-surface-2 touch-manipulation"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-base" aria-hidden="true">
                {l.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{l.title}</span>
              <span className="shrink-0 text-muted" aria-hidden="true">›</span>
            </Link>
          ))}
        </nav>
      </Section>
    </div>
  );
}
