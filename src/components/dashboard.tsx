import Link from "next/link";
import type { CSSProperties } from "react";
import type { DashboardCategory, DashboardFacts } from "@/lib/dashboard";
import { currencyLabel } from "@/lib/money";
import { BalanceDistributionBar } from "./balance-breakdown";
import { Card, Money, Section, Skeleton } from "./ui";

function WalletIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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
      className={`transition-transform duration-200 ${direction === "up" ? "group-hover:-translate-y-0.5" : "group-hover:translate-y-0.5"}`}
    >
      {direction === "up" ? <path d="M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5" /> : <path d="M8 3v10m0 0 3.5-3.5M8 13 4.5 9.5" />}
    </svg>
  );
}

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
    <Card
      padded={false}
      className="dashboard-hero-card relative overflow-hidden border-transparent shadow-[0_18px_45px_-20px_rgba(31,45,96,0.65)] transition-all duration-300 hover:shadow-[0_22px_55px_-18px_rgba(31,45,96,0.72)]"
    >
      <div className="dashboard-hero-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="dashboard-hero-orb dashboard-hero-orb-primary pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full" aria-hidden="true" />
      <div className="dashboard-hero-orb dashboard-hero-orb-secondary pointer-events-none absolute -bottom-28 -left-16 h-52 w-52 rounded-full" aria-hidden="true" />

      <div key={valueKey} className="dashboard-value-transition dashboard-hero-main relative min-w-0 px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-7">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="dashboard-hero-kicker flex items-center gap-2">
              <span className="dashboard-live-dot" aria-hidden="true" />
              <p className="dashboard-hero-label text-[13px] font-semibold tracking-tight">Balans</p>
            </div>
            <div className="hero-balance-value mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <Money whole value={facts.balance} size="hero" tone={facts.balance < 0 ? "negative" : "default"} />
              <span className={`text-xs font-semibold sm:text-sm ${facts.balance < 0 ? "text-negative-text" : "text-muted"}`}>{unit}</span>
            </div>
          </div>
          <span className="dashboard-wallet-mark relative grid h-14 w-14 shrink-0 place-items-center rounded-[19px] transition-transform duration-300 hover:rotate-[-4deg] hover:scale-105">
            <WalletIcon />
          </span>
        </div>

        {facts.hasBalanceBreakdown && onOpenBreakdown ? (
          <BalanceDistributionBar groups={facts.balanceGroups} onOpen={onOpenBreakdown} />
        ) : null}
      </div>

      <div className="dashboard-flow-grid relative grid min-w-0 grid-cols-2">
        <div className="dashboard-flow-item group min-w-0 px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
            <span className="dashboard-flow-icon dashboard-flow-icon-income grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110">
              <TrendIcon direction="up" />
            </span>
            <div className="min-w-0">
              <p className="dashboard-flow-label truncate text-[10px] font-semibold uppercase tracking-[0.1em]">Daromad</p>
              <div className="mt-1 min-w-0 leading-tight">
                <Money whole value={facts.income} size="lg" tone="positive" zeroSign="+" currency={unit} />
              </div>
            </div>
          </div>
        </div>
        <div className="dashboard-flow-item group min-w-0 border-l border-white/10 px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
            <span className="dashboard-flow-icon dashboard-flow-icon-expense grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110">
              <TrendIcon direction="down" />
            </span>
            <div className="min-w-0">
              <p className="dashboard-flow-label truncate text-[10px] font-semibold uppercase tracking-[0.1em]">Xarajat</p>
              <div className="mt-1 min-w-0 leading-tight">
                <Money whole value={-facts.expense} size="lg" tone="negative" currency={unit} />
              </div>
            </div>
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
      className={`dashboard-category-section dashboard-category-section--${tone}`}
      title={title}
      action={
        hasMore ? (
          <Link
            href="/transactions"
            className="dashboard-category-more group inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-accent-text transition-colors hover:text-accent"
          >
            Barchasi <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
          </Link>
        ) : undefined
      }
    >
      {items.length ? (
        <div className="dashboard-category-list overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(12,18,34,0.03)] transition-shadow duration-200 hover:shadow-[0_8px_22px_-16px_rgba(12,18,34,0.35)]">
          {items.map((item, index) => {
            const progress = Math.min(100, (item.amount / max) * 100);
            const rowStyle = { "--dashboard-row-delay": `${Math.min(index * 55, 220)}ms` } as CSSProperties;
            return (
              <div
                key={item.id ?? `${tone}-${item.name}`}
                className="dashboard-category-row group min-w-0 px-4 py-3.5 sm:px-4.5"
                style={rowStyle}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-medium">
                    <span
                      className="dashboard-category-icon grid h-9 w-9 shrink-0 place-items-center rounded-[13px] text-[14px] shadow-xs transition-transform duration-200 group-hover:scale-110"
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
                  className="dashboard-category-progress mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3"
                >
                  <div
                    className="dashboard-category-progress-fill h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dashboard-empty-state rounded-2xl border border-dashed border-line bg-surface px-5 py-7 text-center shadow-[0_1px_2px_rgba(12,18,34,0.02)]">
          <span className="dashboard-empty-icon mx-auto grid h-10 w-10 place-items-center rounded-2xl text-base" aria-hidden="true">＋</span>
          <p className="mt-2.5 text-[13px] text-muted">{emptyText}</p>
        </div>
      )}
    </Section>
  );
}

export function DashboardLoading() {
  return (
    <div className="dashboard-loading space-y-5 sm:space-y-6" aria-label="Ma’lumotlar yuklanmoqda" aria-busy="true">
      <div className="dashboard-hero-card card overflow-hidden">
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-16 bg-white/15" />
              <Skeleton className="mt-3 h-10 w-4/5 max-w-80 bg-white/15" />
            </div>
            <Skeleton className="h-14 w-14 shrink-0 rounded-[19px] bg-white/15" />
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 bg-black/10">
          <div className="p-4 sm:p-6"><Skeleton className="h-8 w-8 rounded-xl bg-white/15" /><Skeleton className="mt-2 h-5 w-24 bg-white/15" /><Skeleton className="mt-1 h-6 w-4/5 bg-white/15" /></div>
          <div className="border-l border-white/10 p-4 sm:p-6"><Skeleton className="h-8 w-8 rounded-xl bg-white/15" /><Skeleton className="mt-2 h-5 w-24 bg-white/15" /><Skeleton className="mt-1 h-6 w-4/5 bg-white/15" /></div>
        </div>
      </div>
      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column}>
            <Skeleton className="mb-3 h-5 w-44" />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-4">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className={row ? "border-t border-line py-4" : "pb-4"}>
                  <div className="flex items-center justify-between gap-4"><Skeleton className="h-9 w-32" /><Skeleton className="h-4 w-24" /></div>
                  <Skeleton className="mt-3 h-1.5 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
