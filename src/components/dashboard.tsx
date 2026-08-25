import Link from "next/link";
import type { DashboardCategory, DashboardFacts } from "@/lib/dashboard";
import { currencyLabel } from "@/lib/money";
import { BalanceDistributionBar } from "./balance-breakdown";
import { TrendDownIcon, TrendUpIcon, WalletIcon } from "./icons";
import { Card, Money, Section, Skeleton } from "./ui";

/** One balance source, one primary balance UI. */
export function DashboardHero({
  facts,
  currency,
  onOpenBreakdown,
}: {
  facts: DashboardFacts;
  currency: string;
  /** Opens the account-composition sheet. Omit to keep the bar as pure display. */
  onOpenBreakdown?: () => void;
}) {
  const unit = currencyLabel(currency);
  const valueKey = `${facts.monthLabel}-${facts.balance}-${facts.income}-${facts.expense}`;

  return (
    <Card padded={false} className="relative overflow-hidden border-line/90 shadow-[0_2px_8px_rgba(12,18,34,0.04),0_12px_28px_-12px_rgba(12,18,34,0.08)] transition-all duration-300 hover:shadow-[0_4px_16px_rgba(12,18,34,0.06),0_16px_36px_-12px_rgba(12,18,34,0.12)]">
      {/* Ambient aurora lighting */}
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent opacity-[0.08] blur-2xl animate-aurora" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-12 -bottom-16 h-44 w-44 rounded-full bg-positive opacity-[0.05] blur-2xl" aria-hidden="true" />
      <div className="pointer-events-none absolute right-8 top-8 h-24 w-24 rounded-full border border-accent/15 opacity-[0.08]" aria-hidden="true" />

      <div key={valueKey} className="dashboard-value-transition relative min-w-0 px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold tracking-tight text-fg-soft">Balans</p>
            <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <Money whole value={facts.balance} size="hero" tone={facts.balance < 0 ? "negative" : "default"} />
              <span className={`text-xs font-semibold sm:text-sm ${facts.balance < 0 ? "text-negative-text" : "text-muted"}`}>{unit}</span>
            </div>
          </div>
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[16px] border border-accent/15 bg-accent-soft text-accent-text shadow-xs transition-all duration-300 hover:scale-105 hover:shadow-sm">
            <WalletIcon className="h-8 w-8" />
          </span>
        </div>

        {facts.hasBalanceBreakdown && onOpenBreakdown ? (
          <BalanceDistributionBar groups={facts.balanceGroups} onOpen={onOpenBreakdown} />
        ) : null}
      </div>

      <div className="relative grid min-w-0 grid-cols-2 border-t border-line bg-surface-2/60 backdrop-blur-xs">
        <div className="group min-w-0 px-4 py-4.5 sm:px-6 sm:py-5 transition-colors duration-200 hover:bg-positive-soft/25">
          <div className="flex min-w-0 items-center gap-2 text-positive-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-positive-soft shadow-xs transition-transform duration-200 group-hover:scale-110"><TrendUpIcon className="h-[15px] w-[15px] group-hover:-translate-y-0.5 transition-transform duration-200" /></span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em]">Daromad</span>
          </div>
          <div className="mt-2 min-w-0 leading-tight">
            <Money whole value={facts.income} size="lg" tone="positive" zeroSign="+" currency={unit} />
          </div>
        </div>
        <div className="group min-w-0 border-l border-line px-4 py-4.5 sm:px-6 sm:py-5 transition-colors duration-200 hover:bg-negative-soft/25">
          <div className="flex min-w-0 items-center gap-2 text-negative-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-negative-soft shadow-xs transition-transform duration-200 group-hover:scale-110"><TrendDownIcon className="h-[15px] w-[15px] group-hover:translate-y-0.5 transition-transform duration-200" /></span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em]">Xarajat</span>
          </div>
          <div className="mt-2 min-w-0 leading-tight">
            <Money whole value={-facts.expense} size="lg" tone="negative" currency={unit} />
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
          <Link
            href="/transactions"
            className="group inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent-text transition-colors hover:text-accent"
          >
            Barchasi <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
          </Link>
        ) : undefined
      }
    >
      {items.length ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(12,18,34,0.03)] transition-shadow duration-200 hover:shadow-[0_2px_8px_rgba(12,18,34,0.06)]">
          {items.map((item, index) => {
            const progress = Math.min(100, (item.amount / max) * 100);
            return (
              <div
                key={item.id ?? `${tone}-${item.name}`}
                className={`group min-w-0 px-4 py-3.5 sm:px-4.5 transition-colors duration-150 hover:bg-surface-2/60 ${index ? "border-t border-line" : ""}`}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-medium">
                    <span
                      className={`grid h-8.5 w-8.5 shrink-0 place-items-center rounded-xl text-[14px] shadow-xs transition-transform duration-200 group-hover:scale-110 ${tone === "income" ? "bg-positive-soft text-positive-text" : "bg-negative-soft text-negative-text"}`}
                      aria-hidden="true"
                    >
                      {item.icon || "•"}
                    </span>
                    <span className="truncate font-medium text-fg transition-colors group-hover:text-fg-soft">{item.name}</span>
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
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out group-hover:brightness-105 ${tone === "income" ? "bg-positive" : "bg-negative"}`}
                    style={{ width: `${progress}%`, opacity: 0.82 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface px-5 py-6 text-center shadow-[0_1px_2px_rgba(12,18,34,0.02)]">
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
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column}>
            <Skeleton className="mb-3 h-5 w-44" />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-4">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className={row ? "border-t border-line py-4" : "pb-4"}>
                  <div className="flex items-center justify-between gap-4"><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-24" /></div>
                  <Skeleton className="mt-2 h-1.5 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
