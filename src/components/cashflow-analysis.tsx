"use client";

import Link from "next/link";
import { useState } from "react";
import { CashFlowStrip, CategoryBars, ForecastArea, IncomeExpenseBars } from "@/components/charts";
import { Icon } from "@/components/icon";
import { useFinance } from "@/components/providers";
import { Badge, Card, Label, Skeleton } from "@/components/ui";
import { addMonths, compact, formatAmount, monthKey, monthStart, shortDate, todayISO } from "@/lib/money";
import { monthCashflow, monthPlanned } from "@/lib/finance";
import { hasEnoughAnalyticsData } from "@/lib/onboarding";

const NAV_BTN =
  "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation disabled:pointer-events-none disabled:opacity-40";

/** Read-only cash-flow analysis, kept separate from plan creation and editing. */
export function CashflowAnalysis() {
  const { state, loading } = useFinance();
  const [cashMonth, setCashMonth] = useState(() => monthKey(todayISO()));

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const forecast = state.forecast;
  const monthLabel = state.monthly?.find((month) => month.monthKey === cashMonth)?.label ?? cashMonth;
  const today = forecast.today;
  const current = monthKey(today);
  const days = monthCashflow(forecast.cashflow, cashMonth);
  const items = monthPlanned(forecast.planned, cashMonth);
  const risks = forecast.riskDates.filter((risk) => monthKey(risk.date) === cashMonth);
  const first = days[0];
  const last = days[days.length - 1];
  const opening = first ? first.projectedBase - first.net : 0;
  const closing = last ? last.projectedBase : opening;
  const inflow = days.reduce((sum, day) => sum + day.inflow, 0);
  const outflow = days.reduce((sum, day) => sum + day.outflow, 0);
  const mandatory = items.filter((item) => item.kind === "expense" && item.mandatory).reduce((sum, item) => sum + item.base, 0);
  const expectedIncome = items.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.base, 0);
  const chartData = days.map((day) => ({ ...day, actual: day.date <= today }));
  const isCurrent = cashMonth === current;
  const trend = state.analytics.monthly;
  const categories = state.analytics.categories.filter((category) => category.amount > 0).slice(0, 5);
  const completedTransactionCount = state.transactions.filter((transaction) => !transaction.isDeleted).length;

  if (!hasEnoughAnalyticsData(state.transactions)) {
    return <AnalyticsPreview transactionCount={completedTransactionCount} />;
  }

  return (
    <div className="animate-fade-up mx-auto w-full max-w-3xl space-y-3.5 sm:space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setCashMonth(monthKey(addMonths(monthStart(cashMonth), -1)))} className={NAV_BTN} aria-label="Oldingi oy" disabled={cashMonth <= current}>
            <Icon name="chevron-left" size={15} />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-[15px] font-semibold">Pul oqimi · {monthLabel}</p>
            <p className="mt-0.5 text-[11px] text-muted">{isCurrent ? "Joriy oy" : "Kelasi oy"}</p>
          </div>
          <button type="button" onClick={() => setCashMonth(monthKey(addMonths(monthStart(cashMonth), 1)))} className={NAV_BTN} aria-label="Keyingi oy">
            <Icon name="chevron-right" size={15} />
          </button>
        </div>

        {days.length ? (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] sm:grid-cols-4" style={{ background: "var(--border)" }}>
              <Metric label={isCurrent ? "Bugungi balans" : "Ochilish"} value={formatAmount(opening)} />
              <Metric label="Daromad" value={`+${formatAmount(inflow)}`} tone="positive" />
              <Metric label="Xarajat" value={`−${formatAmount(outflow)}`} />
              <Metric label="Yopilish" value={formatAmount(closing)} tone={closing < 0 ? "negative" : "warning"} />
            </div>
            <p className="text-[11px] text-muted">
              Majburiy <span className="num font-medium text-fg-soft">{compact(mandatory)}</span> · Kutilayotgan daromad{" "}
              <span className="num font-medium text-fg-soft">{compact(expectedIncome)}</span>
            </p>

            <div>
              <ForecastArea data={chartData} />
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--fg)" }} /> real</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded border-b border-dashed" style={{ borderColor: "var(--gold)" }} /> prognoz</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--negative)" }} /> xavf</span>
              </div>
            </div>
            <div className="overflow-x-auto border-t border-line pt-3"><CashFlowStrip data={days} /></div>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">Bu oy prognoz davridan tashqarida. Joriy oyga qayting.</p>
        )}
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-semibold">Muhim sanalar · {monthLabel}</p>
        {items.length ? <div className="divide-y divide-line">{items.map((item) => (
          <div key={item.key} className="flex items-center gap-2.5 py-2.5">
            <span className="num w-14 shrink-0 text-[11.5px] text-muted sm:w-16 sm:text-[12px]">{shortDate(item.date)}</span>
            <span className={`shrink-0 text-sm font-medium ${item.kind === "income" ? "text-positive-text" : "text-fg"}`}>{item.kind === "income" ? "+" : "−"}{compact(item.base)}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] sm:text-[13.5px]">{item.label}</span>
            <Badge tone={item.mandatory ? "negative" : item.kind === "income" ? "positive" : "neutral"}>{item.mandatory ? "Majburiy" : item.kind === "income" ? (item.certainty === "estimated" ? "Taxminiy" : "Aniq") : "Ixtiyoriy"}</Badge>
          </div>
        ))}</div> : <p className="text-[13px] leading-relaxed text-muted">Rejalashtirilgan to‘lovlar yo‘q.</p>}
      </Card>

      <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold">Daromad va xarajatlar</p>
            <p className="mt-0.5 text-[11.5px] text-muted">Oxirgi 6 oy</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--positive)" }} /> Daromad</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm opacity-75" style={{ background: "var(--fg)" }} /> Xarajat</span>
          </div>
        </div>
        {trend.some((month) => month.income > 0 || month.expense > 0) ? (
          <IncomeExpenseBars data={trend} />
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">Trend uchun hali operatsiyalar yetarli emas.</p>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold">Xarajat kategoriyalari</p>
            <p className="mt-0.5 text-[11.5px] text-muted">Joriy oy · eng kattalari</p>
          </div>
          <Link href={`/transactions?type=expense&month=${current}`} className="shrink-0 text-[12px] font-semibold text-accent-text">
            Tarix →
          </Link>
        </div>
        {categories.length ? (
          <CategoryBars items={categories} />
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">Bu oy xarajat kategoriyalari hali shakllanmadi.</p>
        )}
      </Card>

      <Card className={risks.length ? "animate-alert-once" : ""} style={risks.length ? { borderColor: "rgba(255,122,122,.28)", background: "linear-gradient(180deg, rgba(255,122,122,.09), rgba(255,122,122,.03))" } : undefined}>
        <p className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Icon name="warning" size={16} className={risks.length ? "shrink-0 text-negative-text" : "shrink-0 text-faint"} />Xavf kunlari · {monthLabel}</p>
        {risks.length ? <><div className="divide-y divide-line">{risks.slice(0, 5).map((risk) => (
          <div key={risk.date} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><span className="num text-[12.5px] font-semibold text-negative-text">{shortDate(risk.date)}</span><span className="ml-2 truncate text-[11.5px] text-muted">{risk.cause}</span></div><span className="num shrink-0 text-[12.5px] font-semibold text-negative-text">−{compact(risk.deficit)}</span></div>
        ))}</div><Link href="/" className="mt-2 inline-block text-[12px] font-semibold text-accent-text">To‘liq izoh → Asosiy</Link></> : <p className="text-[13px] leading-relaxed text-muted">Xavf aniqlanmadi.</p>}
      </Card>
    </div>
  );
}

const SAMPLE_TREND = [
  { month: "2026-03", income: 3_800_000, expense: 2_150_000 },
  { month: "2026-04", income: 4_200_000, expense: 2_650_000 },
  { month: "2026-05", income: 3_900_000, expense: 2_400_000 },
  { month: "2026-06", income: 4_700_000, expense: 2_850_000 },
  { month: "2026-07", income: 4_300_000, expense: 2_700_000 },
  { month: "2026-08", income: 4_900_000, expense: 3_100_000 },
];

const SAMPLE_CATEGORIES = [
  { name: "Oziq-ovqat", icon: "cart", amount: 1_180_000, share: 0.31 },
  { name: "Ijara", icon: "home", amount: 830_000, share: 0.22 },
  { name: "Transport", icon: "car", amount: 530_000, share: 0.14 },
  { name: "Kommunal", icon: "receipt", amount: 380_000, share: 0.1 },
  { name: "Sog‘liq", icon: "heart", amount: 300_000, share: 0.08 },
  { name: "Ta’lim", icon: "book", amount: 230_000, share: 0.06 },
  { name: "Ko‘ngilochar", icon: "sparkles", amount: 190_000, share: 0.05 },
  { name: "Boshqa", icon: "dot", amount: 150_000, share: 0.04 },
];

/** Clearly labelled, non-financial preview shown until the user has real data. */
function AnalyticsPreview({ transactionCount }: { transactionCount: number }) {
  const needed = Math.max(0, 2 - transactionCount);
  return (
    <div className="animate-fade-up mx-auto w-full max-w-3xl space-y-3.5 sm:space-y-4">
      <p className="px-1 text-center text-[11.5px] text-muted">Namuna tahlil — haqiqiy ko‘rinish uchun yana {needed || 1} ta operatsiya kiriting.</p>

      <AnalysisPreviewCard>
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2"><span className={NAV_BTN}><Icon name="chevron-left" size={15} /></span><div className="text-center"><p className="text-[15px] font-semibold">Pul oqimi · avgust</p><p className="mt-0.5 text-[11px] text-muted">Joriy oy</p></div><span className={NAV_BTN}><Icon name="chevron-right" size={15} /></span></div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] sm:grid-cols-4" style={{ background: "var(--border)" }}><Metric label="Bugungi balans" value="3 800 000" /><Metric label="Daromad" value="+4 900 000" tone="positive" /><Metric label="Xarajat" value="−3 810 000" /><Metric label="Yopilish" value="4 890 000" tone="warning" /></div>
          <div><ForecastArea data={sampleCashflow()} height={132} /><div className="mt-2 flex gap-4 text-[11px] text-muted"><span>real</span><span>prognoz</span><span>xavf</span></div></div>
        </Card>
      </AnalysisPreviewCard>

      <AnalysisPreviewCard>
        <Card><p className="mb-3 text-[15px] font-semibold">Muhim sanalar · avgust</p><div className="divide-y divide-line">{[
          ["5 avg", "−850 ming", "Ijara"], ["12 avg", "−180 ming", "Internet"], ["20 avg", "+3 mln", "Avans"], ["28 avg", "−420 ming", "Kredit"],
        ].map(([date, amount, label]) => <div key={label} className="flex items-center gap-2.5 py-2.5"><span className="num w-14 shrink-0 text-[11.5px] text-muted">{date}</span><span className={`shrink-0 text-sm font-medium ${amount.startsWith("+") ? "text-positive-text" : "text-fg"}`}>{amount}</span><span className="min-w-0 flex-1 truncate text-[13px]">{label}</span><Badge tone="neutral">Reja</Badge></div>)}</div></Card>
      </AnalysisPreviewCard>

      <AnalysisPreviewCard>
        <Card><div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-[15px] font-semibold">Daromad va xarajatlar</p><p className="mt-0.5 text-[11.5px] text-muted">Oxirgi 6 oy</p></div><span className="text-[11px] text-muted">Daromad · Xarajat</span></div><IncomeExpenseBars data={SAMPLE_TREND} /></Card>
      </AnalysisPreviewCard>

      <AnalysisPreviewCard>
        <Card><div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-[15px] font-semibold">Xarajat kategoriyalari</p><p className="mt-0.5 text-[11.5px] text-muted">Joriy oy · barcha kategoriyalar</p></div><span className="text-[12px] font-semibold text-accent-text">Tarix →</span></div><CategoryBars items={SAMPLE_CATEGORIES} /></Card>
      </AnalysisPreviewCard>

      <AnalysisPreviewCard>
        <Card><p className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Icon name="warning" size={16} className="shrink-0 text-negative-text" />Xavf kunlari · avgust</p><div className="divide-y divide-line">{[["16 avg", "Kutilgan to‘lov", "−240 ming"], ["28 avg", "Kredit to‘lovi", "−420 ming"]].map(([date, cause, amount]) => <div key={date} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><span className="num text-[12.5px] font-semibold text-negative-text">{date}</span><span className="ml-2 truncate text-[11.5px] text-muted">{cause}</span></div><span className="num shrink-0 text-[12.5px] font-semibold text-negative-text">{amount}</span></div>)}</div></Card>
      </AnalysisPreviewCard>

      <div className="flex justify-center"><Link href="/" className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-fg shadow-sm touch-manipulation">Operatsiya qo‘shish</Link></div>
    </div>
  );
}

function AnalysisPreviewCard({ children }: { children: React.ReactNode }) {
  return <div className="pointer-events-none select-none blur-[1.25px] opacity-60" aria-hidden="true">{children}</div>;
}

function sampleCashflow() {
  return Array.from({ length: 8 }, (_, index) => {
    const base = 3_200_000 + index * 310_000;
    return { date: `2026-08-${String(index + 1).padStart(2, "0")}`, projectedMin: base - 280_000, projectedBase: base, projectedMax: base + 240_000 };
  });
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "warning" }) {
  const color = tone === "positive" ? "text-positive-text" : tone === "negative" ? "text-negative-text" : tone === "warning" ? "text-warning-text" : "";
  return <div className="min-w-0 bg-surface-2 px-3.5 py-3"><Label className="block truncate">{label}</Label><p className={`num mt-1 break-words text-[13.5px] font-bold ${color}`}>{value}</p></div>;
}
