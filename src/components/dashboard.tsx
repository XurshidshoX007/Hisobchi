import Link from "next/link";
import type { DashboardCategory, DashboardFacts } from "@/lib/dashboard";
import { currencyLabel } from "@/lib/money";
import { Card, Money, Section, Skeleton } from "./ui";

function WalletIcon() {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 7.5V6.2A2.2 2.2 0 0 1 6.7 4h10.8a2 2 0 0 1 2 2v1.5" />
      <path d="M4.5 7.5h14.2a1.8 1.8 0 0 1 1.8 1.8v8.2a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 17.5V9.1a1.6 1.6 0 0 1 1.6-1.6" />
      <path d="M16.4 11.2h4.1v4.6h-4.1a2.3 2.3 0 1 1 0-4.6Z" />
      <path d="M16.5 13.5h.01" />
    </svg>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "up" ? <path d="M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5" /> : <path d="M8 3v10m0 0 3.5-3.5M8 13 4.5 9.5" />}
    </svg>
  );
}

/** One balance source, one primary balance UI. */
export function DashboardHero({ facts, currency }: { facts: DashboardFacts; currency: string }) {
  const unit = currencyLabel(currency);
  const valueKey = `${facts.monthLabel}-${facts.balance}-${facts.income}-${facts.expense}`;

  return (
    <Card padded={false} className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-accent opacity-[0.06]" aria-hidden="true" />
      <div className="pointer-events-none absolute right-9 top-9 h-20 w-20 rounded-full border border-accent opacity-[0.06]" aria-hidden="true" />

      <div key={valueKey} className="dashboard-value-transition relative min-w-0 px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold tracking-tight text-fg-soft">Balans</p>
            <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <Money whole value={facts.balance} size="hero" tone={facts.balance < 0 ? "negative" : "default"} signed />
              <span className={`text-xs font-semibold sm:text-sm ${facts.balance < 0 ? "text-negative-text" : "text-muted"}`}>{unit}</span>
            </div>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent-text">
            <WalletIcon />
          </span>
        </div>
      </div>

      <div className="relative grid min-w-0 grid-cols-2 border-t border-line bg-surface-2/60">
        <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-2 text-positive-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-positive-soft"><TrendIcon direction="up" /></span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em]">Daromad</span>
          </div>
          <div className="mt-2 min-w-0 leading-tight">
            <Money whole value={facts.income} size="lg" tone="positive" signed zeroSign="+" currency={unit} />
          </div>
        </div>
        <div className="min-w-0 border-l border-line px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-2 text-negative-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-negative-soft"><TrendIcon direction="down" /></span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em]">Xarajat</span>
          </div>
          <div className="mt-2 min-w-0 leading-tight">
            <Money whole value={-facts.expense} size="lg" tone="negative" signed currency={unit} />
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
  const max = Math.max(1, ...items.map((item) => item.amount));
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
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(12,18,34,0.025)]">
          {items.map((item, index) => {
            const progress = Math.min(100, (item.amount / max) * 100);
            return (
              <div key={item.id ?? `${tone}-${item.name}`} className={`min-w-0 px-3.5 py-3.5 sm:px-4 ${index ? "border-t border-line" : ""}`}>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-medium">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[14px] ${tone === "income" ? "bg-positive-soft" : "bg-negative-soft"}`}
                      aria-hidden="true"
                    >
                      {item.icon || "•"}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="max-w-[48%] shrink-0 text-right leading-tight">
                    <Money whole value={item.amount} size="sm" currency={unit} />
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${item.name}: eng katta kategoriya summasining ${Math.round(progress)} foizi`}
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone === "income" ? "bg-positive" : "bg-negative"}`}
                    style={{ width: `${progress}%`, opacity: 0.72 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface px-4 py-4">
          <p className="text-[13px] text-muted">{emptyText}</p>
        </div>
      )}
    </Section>
  );
}

export function DashboardLoading() {
  return (
    <div className="space-y-4 sm:space-y-5" aria-label="Ma’lumotlar yuklanmoqda" aria-busy="true">
      <div className="card overflow-hidden">
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="mt-2 h-9 w-4/5 max-w-80" />
            </div>
            <Skeleton className="h-11 w-11 shrink-0 rounded-[14px]" />
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-line bg-surface-2/60">
          <div className="p-4 sm:p-6"><Skeleton className="h-5 w-24" /><Skeleton className="mt-2 h-6 w-4/5" /></div>
          <div className="border-l border-line p-4 sm:p-6"><Skeleton className="h-5 w-24" /><Skeleton className="mt-2 h-6 w-4/5" /></div>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column}>
            <Skeleton className="mb-3 h-5 w-44" />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-4">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className={row ? "border-t border-line py-4" : "pb-4"}>
                  <div className="flex items-center justify-between gap-4"><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-24" /></div>
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
