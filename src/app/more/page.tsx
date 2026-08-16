"use client";

import Link from "next/link";
import { useFinance } from "@/components/providers";
import { Badge, Card, FinancialRow, Money, PageHeader, Progress, Section, Skeleton } from "@/components/ui";
import { formatCompactAmount } from "@/lib/money";

const LINKS = [
  { href: "/accounts", icon: "💳", title: "Hisoblar", desc: "Naqd, Uzcard, Humo, bank va hamyon" },
  { href: "/budgets", icon: "🎯", title: "Budjetlar", desc: "Toifa va oy uchun limitlar" },
  { href: "/debts", icon: "📋", title: "Qarzdorlik", desc: "Qarzdorman / qarzdorlar" },
  { href: "/goals", icon: "🏆", title: "Maqsadlar", desc: "Jamg‘arma rejalari" },
  { href: "/bot", icon: "🤖", title: "Bot konsol", desc: "Tezkor kiritish va tabiiy til" },
  { href: "/settings", icon: "⚙️", title: "Sozlamalar", desc: "Valyuta, zaxira, mavzu" },
];

export default function MorePage() {
  const { state, loading } = useFinance();
  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const iOwe = state.debts.filter((d) => d.direction === "i_owe");
  const toMe = state.debts.filter((d) => d.direction === "owed_to_me");

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-6">
      <PageHeader title="Ko‘proq" subtitle="Budjet, qarzdorlik, maqsadlar va sozlamalar" />

      <Section title="Boshqaruv" hint="Hisob va moliyaviy sozlamalar" framed>
        <div className="grid sm:grid-cols-2 sm:gap-x-5">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="block touch-manipulation">
              <FinancialRow interactive className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base">{link.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{link.title}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted">{link.desc}</p>
                </div>
                <span className="text-muted" aria-hidden="true">›</span>
              </FinancialRow>
            </Link>
          ))}
        </div>
      </Section>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="truncate text-[15px] font-semibold">📋 Qarzdorlik</p>
            <Link href="/debts" className="shrink-0 text-[12px] font-medium text-accent-text touch-manipulation">
              Batafsil →
            </Link>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-muted">Men qarzdorman</span>
                <Money value={iOwe.reduce((s, d) => s + d.remainingAmount, 0)} size="md" tone="negative" />
              </div>
              <div className="mt-1.5">
                <Progress
                  value={iOwe.reduce((s, d) => s + d.remainingAmount, 0) / Math.max(1, iOwe.reduce((s, d) => s + d.amount, 0))}
                  height={5}
                />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-muted">Menga qarzdor</span>
                <Money value={toMe.reduce((s, d) => s + d.remainingAmount, 0)} size="md" tone="positive" />
              </div>
              <div className="mt-1.5">
                <Progress
                  value={toMe.reduce((s, d) => s + d.remainingAmount, 0) / Math.max(1, toMe.reduce((s, d) => s + d.amount, 0))}
                  height={5}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="truncate text-[15px] font-semibold">🏆 Maqsadlar</p>
            <Link href="/goals" className="shrink-0 text-[12px] font-medium text-accent-text touch-manipulation">
              Batafsil →
            </Link>
          </div>
          <div className="space-y-3">
            {state.goals.slice(0, 3).map((g) => (
              <div key={g.id} className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">
                    {g.icon} {g.name}
                  </span>
                  <span className="num max-w-[55%] break-words text-right text-[12px] text-muted">
                    {formatCompactAmount(g.savedAmount)} / {formatCompactAmount(g.targetAmount)}
                  </span>
                </div>
                <Progress value={g.progress} height={5} />
              </div>
            ))}
            {!state.goals.length ? <p className="text-[13px] text-muted">Maqsadlar yo‘q.</p> : null}
          </div>
        </Card>
      </div>

      <details className="px-1 text-[12px] text-muted">
        <summary className="cursor-pointer select-none py-2 font-medium text-fg-soft">Texnik integratsiya</summary>
        <div className="mt-1 flex flex-wrap gap-2 pb-2">
          <Badge tone="neutral">GET /api/state</Badge>
          <Badge tone="neutral">POST /api/mutate</Badge>
          <Badge tone="neutral">POST /api/bot</Badge>
        </div>
      </details>
    </div>
  );
}
