import Link from "next/link";
import type { DashboardCategory, DashboardFacts } from "@/lib/dashboard";
import { currencyLabel } from "@/lib/money";
import { Card, Money, Section, Skeleton } from "./ui";

export function DashboardHero({ facts, currency }: { facts: DashboardFacts; currency: string }) {
  const unit = currencyLabel(currency);

  return (
    <Card className="relative overflow-hidden p-5 sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent opacity-[0.055]" aria-hidden="true" />
      <div className="relative min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">Balans</p>
        <div className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <Money value={facts.balance} size="hero" tone={facts.balance < 0 ? "negative" : "default"} />
          <span className="text-xs font-medium text-muted sm:text-sm">{unit}</span>
        </div>
      </div>

      <div className="relative mt-5 grid min-w-0 grid-cols-2 border-t border-line pt-4 sm:mt-6 sm:pt-5">
        <div className="min-w-0 pr-2 sm:pr-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Daromad</p>
          <div className="mt-1.5 min-w-0 leading-tight">
            <Money value={facts.income} size="lg" tone="positive" signed currency={unit} />
          </div>
        </div>
        <div className="min-w-0 border-l border-line pl-3 sm:pl-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Xarajat</p>
          <div className="mt-1.5 min-w-0 leading-tight">
            <Money value={-facts.expense} size="lg" tone="negative" signed currency={unit} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DashboardCategorySection({
  title,
  emptyText,
  items,
  currency,
  hasMore,
  tone,
}: {
  title: string;
  emptyText: string;
  items: DashboardCategory[];
  currency: string;
  hasMore: boolean;
  tone: "income" | "expense";
}) {
  const max = items[0]?.amount ?? 1;
  const unit = currencyLabel(currency);

  return (
    <Section
      title={title}
      action={
        hasMore ? (
          <Link href="/transactions" className="inline-flex min-h-9 items-center text-xs font-semibold text-accent-text">
            Barchasi →
          </Link>
        ) : undefined
      }
    >
      {items.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {items.map((item, index) => (
            <div key={item.id ?? `${tone}-${item.name}`} className={`min-w-0 px-3.5 py-3 sm:px-4 ${index ? "border-t border-line" : ""}`}>
              <div className="flex min-w-0 items-baseline justify-between gap-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium">
                  <span className="shrink-0 text-[13px] text-muted" aria-hidden="true">{item.icon || "•"}</span>
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="max-w-[52%] shrink-0 text-right leading-tight">
                  <Money value={item.amount} size="sm" currency={unit} />
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${tone === "income" ? "bg-positive" : "bg-negative"}`}
                  style={{ width: `${Math.max(3, (item.amount / max) * 100)}%`, opacity: 0.82 }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2 px-4 py-7 text-center">
          <p className="text-[13px] text-muted">{emptyText}</p>
        </div>
      )}
    </Section>
  );
}

export function DashboardLoading() {
  return (
    <div className="space-y-4 sm:space-y-5" aria-label="Ma’lumotlar yuklanmoqda" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      <div className="card p-5 sm:p-7">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-9 w-4/5 max-w-80" />
        <div className="mt-6 grid grid-cols-2 gap-5 border-t border-line pt-5">
          <div><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-6 w-4/5" /></div>
          <div><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-6 w-4/5" /></div>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column}>
            <Skeleton className="mb-3 h-5 w-44" />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-4">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className={row ? "border-t border-line py-4" : "pb-4"}>
                  <div className="flex justify-between gap-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-24" /></div>
                  <Skeleton className="mt-2 h-1 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
