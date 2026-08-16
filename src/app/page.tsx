"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ForecastArea } from "@/components/charts";
import { useFinance } from "@/components/providers";
import {
  Badge,
  Button,
  EmptyState,
  FinancialRow,
  MetricGrid,
  Money,
  MonthSwitcher,
  PrimaryFinancialCard,
  Section,
  Skeleton,
} from "@/components/ui";
import { QuickAddSheet } from "@/components/quick-add";
import { formatAmount, formatSigned, shortDate } from "@/lib/money";
import type { FinancialTimelineEvent } from "@/lib/finance";

function change(current: number, previous: number): string {
  if (!previous) return current ? "yangi" : "0%";
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function eventAmount(event: FinancialTimelineEvent): number {
  return event.kind === "real_income" || event.kind === "planned_income" ? event.base : -event.base;
}

function eventLabel(event: FinancialTimelineEvent): string {
  if (event.phase === "real") return "REAL · amalga oshgan";
  if (event.phase === "forecast") return "PROGNOZ · qayd etilgan";
  if (event.kind === "planned_income") return event.certainty === "estimated" ? "REJA · taxminiy" : "REJA · aniq";
  return event.mandatory ? "REJA · majburiy" : "REJA · ixtiyoriy";
}

function SummaryMetric({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number;
  tone?: "default" | "positive" | "negative";
  hint: string;
}) {
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <p className="text-[10px] font-semibold uppercase leading-snug tracking-[0.07em] text-muted">{label}</p>
      <div className="mt-1.5 min-w-0">
        <Money value={value} size="md" tone={tone} signed={tone !== "default"} />
      </div>
      <p className="mt-1 text-[10.5px] leading-snug text-muted">{hint}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { state, loading, error, refresh } = useFinance();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const months = useMemo(() => state?.monthly ?? [], [state?.monthly]);
  const currentMonthKey = state?.analytics.month ?? "";
  const activeKey = selectedMonthKey ?? currentMonthKey;
  const month = useMemo(
    () => months.find((item) => item.monthKey === activeKey) ?? months.find((item) => item.isCurrent) ?? null,
    [activeKey, months],
  );

  const monthEvents = useMemo(() => {
    if (!month || !state) return [];
    const events = state.forecast.timeline.filter((event) => event.date.startsWith(month.monthKey) && event.kind !== "risk");
    if (month.isCurrent) return events.filter((event) => event.date >= state.forecast.today).slice(0, 5);
    if (month.isFuture) return events.slice(0, 5);
    return events.filter((event) => event.phase === "real").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [month, state]);

  if (loading && !state) {
    return (
      <div className="space-y-4" aria-label="Dashboard yuklanmoqda" aria-busy="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-52" />
        <Skeleton className="h-36" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (error && !state) {
    return (
      <EmptyState
        icon="⚠️"
        title="Moliyaviy ma’lumot yuklanmadi"
        description={`${error} Internetni tekshirib, qayta urinib ko‘ring.`}
        action={<Button onClick={() => void refresh()}>Qayta urinish</Button>}
      />
    );
  }
  if (!state || !month) return null;

  const forecast = state.forecast;
  const index = months.findIndex((item) => item.monthKey === month.monthKey);
  const previousMonth = state.analytics.monthly.find((item) => item.month === month.monthKey);
  const previous = state.analytics.monthly[state.analytics.monthly.findIndex((item) => item.month === month.monthKey) - 1];
  const trendVisible = !month.isFuture && Boolean(previousMonth && previous);

  const contextBalance = month.isCurrent ? forecast.currentBalance : month.isPast ? month.forecastClosingBase : month.openingBalance;
  const contextLabel = month.isCurrent ? "Joriy balans" : month.isPast ? "Oy yopilish balansi" : "Prognoz ochilish balansi";
  const closingLabel = month.isPast ? "Real yopilish" : "Oy oxiri prognozi";

  const firstRiskDay = month.daily.find((day) => day.isRisk && (month.isCurrent ? day.date >= forecast.today : true));
  const riskCause = firstRiskDay?.timelineEvents
    .filter((event) => event.kind === "mandatory" || event.kind === "optional" || event.kind === "planned_expense")
    .sort((a, b) => b.base - a.base)[0];
  const recovery = firstRiskDay
    ? month.daily.find(
        (day) =>
          day.date > firstRiskDay.date &&
          day.projectedMin >= 0 &&
          day.timelineEvents.some((event) => event.kind === "planned_income"),
      )
    : undefined;
  const recoveryIncome =
    recovery?.timelineEvents.filter((event) => event.kind === "planned_income").reduce((sum, event) => sum + event.base, 0) ?? 0;

  const chartData = month.daily.map((day) => ({
    date: day.date,
    projectedMin: day.projectedMin,
    projectedBase: day.projectedBase,
    projectedMax: day.projectedMax,
    actual: day.date <= forecast.today && !month.isFuture,
    events: day.timelineEvents,
  }));
  const chartSummary = `${month.label}: eng past balans ${formatAmount(month.lowestProjected)}, yopilish ${formatAmount(month.forecastClosingBase)} ${state.user.currency}.`;
  const hasReal = month.realIncome > 0 || month.realExpense > 0;
  const hasPlan = month.expectedIncomeBase > 0 || month.totalPlannedExpense > 0;

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      <MonthSwitcher
        label={month.label.toUpperCase()}
        context={month.isCurrent ? "Joriy oy" : month.isPast ? "Tarixiy real natija" : "Kelajak rejasi"}
        previousDisabled={index <= 0}
        nextDisabled={index < 0 || index >= months.length - 1}
        onPrevious={() => setSelectedMonthKey(months[index - 1]?.monthKey ?? month.monthKey)}
        onNext={() => setSelectedMonthKey(months[index + 1]?.monthKey ?? month.monthKey)}
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)] lg:items-start lg:gap-5">
        <PrimaryFinancialCard className="lg:col-start-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">REAL · {contextLabel}</p>
              <div className="mt-2">
                <Money
                  value={contextBalance}
                  size="hero"
                  tone={contextBalance < 0 ? "negative" : "default"}
                  currency={state.user.currency}
                />
              </div>
              {!month.isCurrent ? (
                <p className="mt-2 text-[11px] text-muted">Bugungi global balansdan alohida ko‘rsatilgan.</p>
              ) : null}
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
              ＋ Operatsiya
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-muted">Daromad</p>
              <div className="mt-1"><Money value={month.realIncome} size="sm" tone="positive" signed /></div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-muted">Xarajat</p>
              <div className="mt-1"><Money value={-month.realExpense} size="sm" tone="negative" signed /></div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-muted">{closingLabel}</p>
              <div className="mt-1"><Money value={month.forecastClosingBase} size="sm" tone={month.forecastClosingBase < 0 ? "negative" : "default"} /></div>
            </div>
          </div>
        </PrimaryFinancialCard>

        {firstRiskDay ? (
          <PrimaryFinancialCard className="border-negative/60 lg:col-start-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-negative-text">● Eng yaqin xavf</p>
              <p className="text-[12px] font-semibold text-negative-text">{shortDate(firstRiskDay.date)}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold">{riskCause?.label ?? "Balans yetishmasligi"}</h2>
                <p className="mt-1 text-[11px] text-muted">Sabab / to‘lov</p>
              </div>
              <Money value={-(riskCause?.base ?? 0)} size="lg" tone="negative" signed />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-[12px] text-muted">Prognoz balans</p>
              <Money value={firstRiskDay.projectedMin} size="md" tone="negative" signed />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-fg-soft">
              {recovery ? (
                <><strong>{shortDate(recovery.date)}</strong>: {formatSigned(recoveryIncome)} tushumdan keyin balans tiklanadi.</>
              ) : (
                "Tanlangan davrda tiklanish manbasi topilmadi."
              )}
            </p>
          </PrimaryFinancialCard>
        ) : null}

        <Section
          title="Oylik xulosa"
          hint="REAL, REJA va PROGNOZ"
          className="lg:col-start-1"
        >
          <MetricGrid className="sm:grid-cols-3">
            <SummaryMetric label="REAL daromad" value={month.realIncome} tone="positive" hint="amalga oshgan" />
            <SummaryMetric label="REAL xarajat" value={-month.realExpense} tone="negative" hint="amalga oshgan" />
            <SummaryMetric label="Kutilayotgan" value={month.expectedIncomeBase} tone="positive" hint="ochiq reja" />
            <SummaryMetric label="Majburiy" value={-month.mandatoryExpenseBase} tone="negative" hint="ochiq reja" />
            <SummaryMetric label="Oy oxiri" value={month.forecastClosingBase} tone={month.forecastClosingBase < 0 ? "negative" : "default"} hint="prognoz" />
          </MetricGrid>
          <div className="mt-3 grid grid-cols-3 gap-3 px-1 text-center">
            <div className="min-w-0"><p className="text-[10px] text-muted">Ochilish</p><p className="num mt-1 break-words text-xs font-semibold">{formatAmount(month.openingBalance)}</p></div>
            <div className="min-w-0"><p className="text-[10px] text-muted">Eng past</p><p className={`num mt-1 break-words text-xs font-semibold ${month.lowestProjected < 0 ? "text-negative-text" : ""}`}>{formatAmount(month.lowestProjected)}</p></div>
            <div className="min-w-0"><p className="text-[10px] text-muted">Eng yuqori</p><p className="num mt-1 break-words text-xs font-semibold">{formatAmount(month.highestProjected)}</p></div>
          </div>
        </Section>

        {month.isCurrent ? (
          <PrimaryFinancialCard className="lg:col-start-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Safe-to-Spend</p>
                <p className="mt-1 text-[11px] text-muted">{shortDate(forecast.safeHorizonEnd)} gacha</p>
              </div>
              <Badge tone={forecast.safeToSpend < 0 ? "negative" : "positive"}>{forecast.safeToSpend < 0 ? "Yetishmayapti" : "Xavfsiz"}</Badge>
            </div>
            <div className="mt-4"><Money value={forecast.safeToSpend} size="xl" tone={forecast.safeToSpend < 0 ? "negative" : "default"} currency={state.user.currency} /></div>
            <p className="mt-1 text-[12px] text-muted">Majburiy to‘lovlardan keyin xavfsiz sarflash mumkin.</p>
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-[10px] font-semibold uppercase text-muted">Rejalardan keyin erkin</p>
              <div className="mt-1"><Money value={forecast.freeToSpend} size="lg" tone={forecast.freeToSpend < 0 ? "negative" : "default"} /></div>
            </div>
            <details className="mt-3 border-t border-line pt-3 text-[11px] text-muted">
              <summary className="cursor-pointer select-none font-medium text-fg-soft">Hisoblash tafsiloti</summary>
              <p className="mt-2 break-words leading-relaxed">
                {formatAmount(forecast.safeToSpendParts.balance)} balans + {formatAmount(forecast.safeToSpendParts.confirmedIncome)} aniq tushum + {formatAmount(forecast.safeToSpendParts.estimatedIncomeWeighted)} vaznlangan tushum − {formatAmount(forecast.safeToSpendParts.mandatoryUpcoming)} majburiy to‘lov − {formatAmount(forecast.safeToSpendParts.minReserve)} zaxira.
              </p>
            </details>
          </PrimaryFinancialCard>
        ) : null}

        <PrimaryFinancialCard className="lg:col-start-1">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Oy oxirigacha balans</h2>
              <p className="mt-1 text-[11.5px] text-muted">REAL, prognoz va pul qisqaradigan kunlar</p>
            </div>
            <Badge tone={month.deficitDays ? "negative" : "positive"}>{month.deficitDays ? `${month.deficitDays} xavf kuni` : "barqaror"}</Badge>
          </div>
          <ForecastArea data={chartData} description={chartSummary} height={190} />
          <p className="sr-only">{chartSummary}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10.5px] text-muted">
            <span>— REAL</span><span className="text-accent-text">- - PROGNOZ</span><span className="text-negative-text">● xavf</span><span className="text-positive-text">⊕ tushum</span><span className="text-warning-text">⊖ to‘lov</span>
          </div>
        </PrimaryFinancialCard>

        <Section
          title="Muhim voqealar"
          hint={month.isPast ? "Oy ichidagi so‘nggi REAL voqealar" : `${month.label} · 5 tagacha`}
          action={<Link href="/plans" className="text-xs font-semibold text-accent-text">Rejalar →</Link>}
          framed
          className="lg:col-start-2"
        >
          {monthEvents.length ? (
            <div>
              {monthEvents.map((event) => {
                const amount = eventAmount(event);
                return (
                  <FinancialRow key={event.key} className="flex items-center gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold ${amount >= 0 ? "bg-positive-soft text-positive-text" : event.mandatory ? "bg-negative-soft text-negative-text" : "bg-warning-soft text-warning-text"}`}>
                      {event.date.slice(8, 10)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13.5px] font-medium">{event.label}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted">{shortDate(event.date)} · {eventLabel(event)}</p>
                    </div>
                    <Money value={amount} size="sm" tone={amount >= 0 ? "positive" : "negative"} signed />
                  </FinancialRow>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="📌" title="Muhim voqea yo‘q" description={hasPlan ? "Reja bor, ammo tanlangan davrga tushmadi." : "Daromad yoki to‘lov rejasini qo‘shishingiz mumkin."} />
          )}
        </Section>

        {trendVisible && previousMonth && previous ? (
          <Section title="Oylik trend" hint="Faqat tarixiy REAL operatsiyalar" framed className="lg:col-start-2">
            <div className="divide-y divide-line">
              {[
                { label: "Daromad", value: previousMonth.income, delta: change(previousMonth.income, previous.income) },
                { label: "Xarajat", value: previousMonth.expense, delta: change(previousMonth.expense, previous.expense) },
                { label: "Net", value: previousMonth.net, delta: change(previousMonth.net, previous.net) },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 py-2.5">
                  <div><p className="text-[11px] text-muted">{item.label}</p><p className="num mt-0.5 text-sm font-semibold">{formatAmount(item.value)}</p></div>
                  <p className="text-[11px] font-semibold text-accent-text">{item.delta}</p>
                </div>
              ))}
            </div>
          </Section>
        ) : null}
      </div>

      {!hasReal ? <p className="px-2 text-center text-[12px] text-muted">Bu oy hali operatsiya yo‘q.{hasPlan ? " Rejalashtirilgan holat mavjud." : ""}</p> : null}
      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
