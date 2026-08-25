"use client";

import Link from "next/link";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { Icon, type AppIconName, Section, Skeleton } from "@/components/ui";

/**
 * Menu is a calm navigation hub. It routes to secondary tools without
 * duplicating their metrics or forms; each destination owns its own data.
 */
const LINKS: Array<{ href: string; icon: AppIconName; title: string; description: string }> = [
  { href: "/accounts", icon: "accounts", title: "Hisoblar", description: "Hisob va kategoriyalar" },
  { href: "/budgets", icon: "budget", title: "Budjetlar", description: "Limit va sarf nazorati" },
  { href: "/debts", icon: "debt", title: "Qarzdorlik", description: "Kimga berasiz yoki olasiz" },
  { href: "/goals", icon: "goal", title: "Maqsadlar", description: "Jamg‘arma va muddatlar" },
  { href: "/bot", icon: "bot", title: "Telegram bot", description: "Tezkor kiritish va hisobot" },
  { href: "/settings", icon: "settings", title: "Sozlamalar", description: "Profil, ko‘rinish va eslatmalar" },
];

export default function MorePage() {
  const { state, loading } = useFinance();

  // Global FAB → secondary tools. Each entry routes to the page that owns the
  // form, so the existing creation flows stay unchanged.
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

  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <Section>
        <nav aria-label="Qo‘shimcha bo‘limlar" className="overflow-hidden rounded-xl border border-line bg-surface">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex min-h-[68px] items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0 transition-colors hover:bg-surface-2 active:bg-surface-2 touch-manipulation"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent-text" aria-hidden="true">
                <Icon name={l.icon} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{l.title}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-muted">{l.description}</span>
              </span>
              <Icon name="chevronRight" size={17} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </nav>
      </Section>
    </div>
  );
}
