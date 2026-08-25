"use client";

import Link from "next/link";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { Section, Skeleton } from "@/components/ui";

const LINKS = [
  { href: "/accounts", icon: "wallet", title: "Hisoblar", description: "Hamyonlar va kategoriyalar" },
  { href: "/budgets", icon: "target", title: "Budjetlar", description: "Oylik limit va nazorat" },
  { href: "/debts", icon: "ledger", title: "Qarzdorlik", description: "Olingan va berilgan qarzlar" },
  { href: "/goals", icon: "flag", title: "Maqsadlar", description: "Jamg‘arma rejalari" },
  { href: "/bot", icon: "bot", title: "Telegram bot", description: "Tezkor operatsiyalar" },
  { href: "/settings", icon: "settings", title: "Sozlamalar", description: "Profil va ilova parametrlari" },
] as const;

type ToolIconName = (typeof LINKS)[number]["icon"];

export default function MorePage() {
  const { state, loading } = useFinance();

  const { route } = useFab();
  useFabPage({}, {
    account: (action) => route("/accounts", action),
    debt: (action) => route("/debts", action),
    goal: (action) => route("/goals", action),
    budget: (action) => route("/budgets", action),
    category: (action) => route("/accounts", action),
  });

  if (loading && !state) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-36 w-full" />)}
      </div>
    );
  }
  if (!state) return null;

  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <Section title="Moliya vositalari" hint="Kerakli bo‘limni tanlang">
        <nav aria-label="Qo‘shimcha bo‘limlar" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group card relative min-h-[138px] overflow-hidden p-4 transition-all duration-200 hover:-translate-y-1 hover:border-line-strong hover:shadow-[0_18px_38px_-25px_rgba(8,42,30,0.55)] active:translate-y-0 active:scale-[0.99] sm:min-h-[150px] sm:p-5 touch-manipulation"
            >
              <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-accent/10 bg-accent-soft text-accent-text transition-transform duration-200 group-hover:scale-105" aria-hidden="true">
                <ToolIcon name={item.icon} />
              </span>
              <p className="mt-4 truncate text-[14px] font-bold tracking-[-0.02em] sm:text-[15px]">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted sm:text-[11.5px]">{item.description}</p>
              <span className="absolute right-3.5 top-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent-text" aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>
      </Section>

      <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3.5 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-positive-soft text-positive-text"><ShieldIcon /></span>
          <div>
            <p className="text-[12.5px] font-bold">Ma’lumotlar yagona tizimda</p>
            <p className="mt-0.5 text-[10.5px] text-muted">Mini App va Telegram bot doim sinxron</p>
          </div>
        </div>
        <Link href="/settings" className="mt-3 inline-flex text-[11.5px] font-semibold text-accent-text sm:mt-0">Boshqarish →</Link>
      </div>
    </div>
  );
}

function ToolIcon({ name }: { name: ToolIconName }) {
  const common = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "wallet") return <svg {...common}><path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12v4" /><path d="M16 11h5v5h-5a2.5 2.5 0 0 1 0-5Z" /></svg>;
  if (name === "target") return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>;
  if (name === "ledger") return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  if (name === "flag") return <svg {...common}><path d="M5 21V4M5 5h11l-2 3 2 3H5" /></svg>;
  if (name === "bot") return <svg {...common}><rect x="4" y="7" width="16" height="12" rx="4" /><path d="M12 3v4M8.5 12h.01M15.5 12h.01M9 16h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.09A1.7 1.7 0 0 0 4 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.4 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.4h4v.09A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.4a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.09v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></svg>;
}

function ShieldIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>;
}
