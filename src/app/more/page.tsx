"use client";

import Link from "next/link";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { compact } from "@/lib/money";

/**
 * MENU owns navigation to secondary tools (§22). Debt balances, goal progress
 * and account balances have their PRIMARY homes on their own pages — here each
 * row carries at most a one-line compact reference, never a duplicate card.
 */
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
    category: (a) => route("/accounts", a),
  });

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const iOwe = state.debts.filter((d) => d.direction === "i_owe").reduce((s, d) => s + d.remainingAmount, 0);
  const toMe = state.debts.filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + d.remainingAmount, 0);
  const activeGoals = state.goals.filter((g) => g.progress < 1);
  const activeBudgets = state.budgets?.length ?? 0;
  const activeAccounts = state.accounts.filter((a) => a.isActive).length;

  const links: Array<{ href: string; icon: string; title: string; desc: string; ref?: string; refTone?: "negative" | "positive" | "muted" }> = [
    { href: "/accounts", icon: "💳", title: "Hisoblar", desc: "Naqd, karta, bank va hamyon", ref: `${activeAccounts} ta faol` },
    { href: "/budgets", icon: "🎯", title: "Budjetlar", desc: "Toifa va oy uchun limitlar", ref: activeBudgets ? `${activeBudgets} ta limit` : undefined },
    {
      href: "/debts",
      icon: "📋",
      title: "Qarzdorlik",
      desc: "Qarzdorman / qarzdorlar",
      ref: iOwe || toMe ? `−${compact(iOwe)} · +${compact(toMe)}` : "qarz yo‘q",
      refTone: iOwe > 0 ? "negative" : toMe > 0 ? "positive" : "muted",
    },
    {
      href: "/goals",
      icon: "🏆",
      title: "Maqsadlar",
      desc: "Jamg‘arma rejalari",
      ref: activeGoals.length ? `${activeGoals.length} ta faol` : "maqsad yo‘q",
    },
    { href: "/bot", icon: "🤖", title: "Bot konsol", desc: "Tezkor kiritish va tabiiy til" },
    { href: "/settings", icon: "⚙️", title: "Sozlamalar", desc: "Valyuta, zaxira, mavzu" },
  ];

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-6">
      <PageHeader title="Ko‘proq" subtitle="Budjet, qarzdorlik, maqsadlar va sozlamalar" />

      <Section>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 active:bg-surface-2 touch-manipulation">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-lg">{l.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium">{l.title}</p>
                <p className="mt-0.5 truncate text-[11.5px] leading-snug text-muted">{l.desc}</p>
              </div>
              {l.ref ? (
                <span
                  className={`num shrink-0 text-[11.5px] font-medium ${
                    l.refTone === "negative" ? "text-negative-text" : l.refTone === "positive" ? "text-positive-text" : "text-muted"
                  }`}
                >
                  {l.ref}
                </span>
              ) : null}
              <span className="shrink-0 text-muted" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
