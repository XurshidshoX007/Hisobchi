import Link from "next/link";
import type { DashboardCategory, DashboardFacts } from "@/lib/dashboard";
import { currencyLabel } from "@/lib/money";
import { BalanceDistributionBar } from "./balance-breakdown";
import { Card, Money, Section, Skeleton } from "./ui";

function WalletIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
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
    <Card padded={false} className="relative overflow-hidden border-0 shadow-[0_18px_40px_-18px_rgba(79,70,229,0.65)] transition-all duration-300 hover:shadow-[0_22px_46px_-16px_rgba(79,70,229,0.72)]">
      <div className="hero-gradient relative">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/20 blur-2xl animate-aurora" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-12 bottom-8 h-44 w-44 rounded-full bg-violet-300/20 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute right-8 top-8 h-24 w-24 rounded-full border border-white/15" aria-hidden="true" />

        <div key={valueKey} className="dashboard-value-transition relative min-w-0 px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold tracking-tight text-white/75">Balans</p>
              <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <Money whole value={facts.balance} size="hero" tone={facts.balance < 0 ? "negative" : "inverse"} />
                <span className={`text-xs font-semibold sm:text-sm ${facts.balance < 0 ? "text-rose-100" : "text-white/70"}`}>{unit}</span>
              </div>
            </div>
            <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[16px] border border-white/20 bg-white/15 text-white shadow-xs transition-all duration-300 hover:scale-105 hover:bg-white/20">
              <WalletIcon />
            </span>
          </div>

          {facts.hasBalanceBreakdown && onOpenBreakdown ? (
            <BalanceDistributionBar inverse groups={facts.balanceGroups} onOpen={onOpenBreakdown} />
          ) : null}
        </div>
      </div>

      <div className="relative grid min-w-0 grid-cols-2 border-t border-line bg-surface">
        <div className="group min-w-0 px-4 py-4.5 sm:px-6 sm:py-5 transition-colors duration-200 hover:bg-positive-soft/25">
          <div className="flex min-w-0 items-center gap-2 text-positive-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-positive-soft shadow-xs transition-transform duration-200 group-hover:scale-110"><TrendIcon direction="up" /></span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em]">Daromad</span>
          </div>
          <div className="mt-2 min-w-0 leading-tight">
            <Money whole value={facts.income} size="lg" tone="positive" zeroSign="+" currency={unit} />
          </div>
        </div>
        <div className="group min-w-0 border-l border-line px-4 py-4.5 sm:px-6 sm:py-5 transition-colors duration-200 hover:bg-negative-soft/25">
          <div className="flex min-w-0 items-center gap-2 text-negative-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-negative-soft shadow-xs transition-transform duration-200 group-hover:scale-110"><TrendIcon direction="down" /></span>
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
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.03),0_12px_28px_-20px_rgba(79,70,229,0.28)] transition-shadow duration-200 hover:shadow-[0_8px_24px_-16px_rgba(79,70,229,0.35)]">
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
        <div className="hero-gradient p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-14 bg-white/20" />
              <Skeleton className="mt-2 h-9 w-4/5 max-w-80 bg-white/25" />
            </div>
            <Skeleton className="h-11 w-11 shrink-0 rounded-[14px] bg-white/20" />
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-line bg-surface">
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
