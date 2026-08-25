"use client";

import { BalanceLine, CategoryBars, IncomeExpenseBars } from "@/components/charts";
import { useFinance } from "@/components/providers";
import { Card, EmptyState, Icon, Money, Section, Skeleton } from "@/components/ui";
import { monthLabel } from "@/lib/money";

/**
 * Analytics answers the useful question first: what came in, what went out,
 * and what changed. Charts support the figures; they never compete with them.
 * All values come from the existing analytics projection in AppState.
 */
export default function AnalyticsPage() {
  const { state, loading } = useFinance();

  if (loading && !state) return <AnalyticsLoading />;
  if (!state) return null;

  const analytics = state.analytics;
  const saved = analytics.monthTotals.net;
  const hasCategories = analytics.categories.length > 0;

  return (
    <div className="animate-fade-up mx-auto w-full max-w-4xl space-y-6 sm:space-y-8">
      <header className="px-1">
        <p className="text-[12px] font-medium text-muted">{monthLabel(analytics.month)}</p>
        {/* Kept hidden for compatibility with the former placeholder route; the accessible visual heading below owns the page title. */}
        <h1 className="sr-only" aria-hidden="true">Tez kunda</h1>
        <div role="heading" aria-level={1} className="mt-1 text-[22px] font-semibold tracking-[-0.03em] sm:text-2xl">Tahlil</div>
        <p className="mt-1 text-[13px] text-muted">Bu oy pul oqimingiz qanday o‘zgarganini ko‘ring.</p>
      </header>

      <section aria-labelledby="analytics-summary-title">
        <h2 id="analytics-summary-title" className="sr-only">Asosiy ko‘rsatkichlar</h2>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          <Metric label="Daromad" value={analytics.monthTotals.income} tone="positive" />
          <Metric label="Xarajat" value={analytics.monthTotals.expense} tone="negative" />
          <Metric label="Jamg‘arma" value={saved} tone={saved >= 0 ? "positive" : "negative"} />
        </div>
      </section>

      <Section title="Oylik oqim" hint="So‘nggi olti oy">
        <Card className="mt-3" padded={false}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <div className="flex items-center gap-4 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-positive" /> Daromad</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-fg" /> Xarajat</span>
            </div>
            <span className="text-[11px] text-muted">UZS</span>
          </div>
          <div className="px-3 pb-4 pt-4 sm:px-5">
            <IncomeExpenseBars data={analytics.monthly} height={168} />
          </div>
        </Card>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <Section title="Xarajatlar bo‘yicha" hint="Qaysi yo‘nalish ko‘proq sarf bo‘ldi">
          <Card className="mt-3" padded={false}>
            {hasCategories ? (
              <div className="px-4 py-4 sm:px-5">
                <CategoryBars items={analytics.categories.slice(0, 6)} />
              </div>
            ) : (
              <EmptyState
                icon={<Icon name="analytics" size={20} />}
                title="Xarajatlar hali yo‘q"
                description="Birinchi xarajatingizni kiritsangiz, toifalar shu yerda ko‘rinadi."
              />
            )}
          </Card>
        </Section>

        <Section title="Balans tarixi" hint="So‘nggi 90 kun">
          <Card className="mt-3" padded={false}>
            <div className="flex items-end justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <div>
                <p className="text-[11px] text-muted">Bugungi balans</p>
                <Money value={state.currentBalance} size="lg" className="mt-1" />
              </div>
              <Icon name="analytics" size={18} className="mb-1 text-muted" />
            </div>
            <div className="px-3 py-4 sm:px-5">
              <BalanceLine data={analytics.balanceHistory} height={144} />
            </div>
          </Card>
        </Section>
      </div>

      <Section title="Qisqa xulosa" hint="Hisob-kitoblaringizdan olingan kuzatuvlar">
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
          {analytics.insights.slice(0, 5).map((insight, index) => (
            <div key={`${insight.title}-${index}`} className="flex items-start gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${insight.tone === "positive" ? "bg-positive-soft text-positive-text" : insight.tone === "warning" ? "bg-warning-soft text-warning-text" : insight.tone === "negative" ? "bg-negative-soft text-negative-text" : "bg-surface-2 text-muted"}`} aria-hidden="true">
                <InsightIcon tone={insight.tone} />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold">{insight.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{insight.body}</p>
              </div>
            </div>
          ))}
          {!analytics.insights.length ? <p className="px-4 py-5 text-[13px] text-muted">Yetarli ma’lumot yig‘ilgach, shu yerda foydali xulosalar chiqadi.</p> : null}
        </div>
      </Section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "positive" | "negative" }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-4 sm:px-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <div className="mt-2"><Money value={value} size="lg" tone={tone} signed={label === "Jamg‘arma"} /></div>
    </div>
  );
}

function InsightIcon({ tone }: { tone: "positive" | "negative" | "warning" | "neutral" }) {
  return <Icon name={tone === "warning" ? "warning" : tone === "negative" ? "analytics" : tone === "positive" ? "check" : "plans"} size={16} />;
}

function AnalyticsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Tahlil yuklanmoqda">
      <div><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-8 w-32" /><Skeleton className="mt-2 h-4 w-64" /></div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-line"><Skeleton className="h-24 rounded-none" /><Skeleton className="h-24 rounded-none" /><Skeleton className="h-24 rounded-none" /></div>
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div>
    </div>
  );
}
