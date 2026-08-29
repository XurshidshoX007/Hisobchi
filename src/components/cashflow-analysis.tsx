"use client";

import Link from "next/link";
import { useState } from "react";
import { CashFlowStrip, CategoryBars, ForecastArea, IncomeExpenseBars } from "@/components/charts";
import { Icon } from "@/components/icon";
import { useFinance } from "@/components/providers";
import { Badge, Card, Label, Skeleton } from "@/components/ui";
import { addMonths, compact, formatAmount, monthKey, monthStart, shortDate, todayISO } from "@/lib/money";
import { monthCashflow, monthPlanned } from "@/lib/finance";

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

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "warning" }) {
  const color = tone === "positive" ? "text-positive-text" : tone === "negative" ? "text-negative-text" : tone === "warning" ? "text-warning-text" : "";
  return <div className="min-w-0 bg-surface-2 px-3.5 py-3"><Label className="block truncate">{label}</Label><p className={`num mt-1 break-words text-[13.5px] font-bold ${color}`}>{value}</p></div>;
}
