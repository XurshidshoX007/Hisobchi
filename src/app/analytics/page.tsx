"use client";

import { useState } from "react";
import { BalanceLine, CategoryBars, IncomeExpenseBars, Ring, Sparkline } from "@/components/charts";
import { useFinance } from "@/components/providers";
import {
  Badge,
  Divider,
  FinancialRow,
  MetricGrid,
  Money,
  PageHeader,
  PrimaryFinancialCard,
  Progress,
  Section,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { formatAmount, formatCompactAmount, monthLabel } from "@/lib/money";

export default function AnalyticsPage() {
  const { state, loading } = useFinance();
  const [range, setRange] = useState<"3" | "6">("6");

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const a = state.analytics;
  const monthly = range === "3" ? a.monthly.slice(-3) : a.monthly;
  const prev = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const cur = monthly[monthly.length - 1];
  const incomeDelta = prev && cur && prev.income > 0 ? (cur.income - prev.income) / prev.income : 0;
  const expenseDelta = prev && cur && prev.expense > 0 ? (cur.expense - prev.expense) / prev.expense : 0;
  const primaryInsight = a.insights[0];
  const expenseDirection = expenseDelta > 0 ? "oshgan" : expenseDelta < 0 ? "kamaygan" : "o‘zgarmagan";

  const metrics = [
    { label: "Jami daromad", value: a.monthTotals.income, delta: incomeDelta, tone: "positive" as const },
    { label: "Jami xarajat", value: a.monthTotals.expense, delta: expenseDelta, tone: "default" as const },
    { label: "Sof qoldiq", value: a.monthTotals.net, tone: a.monthTotals.net >= 0 ? ("positive" as const) : ("negative" as const) },
    { label: "O‘rtacha kunlik", value: a.monthTotals.avgDaily, tone: "muted" as const },
  ];

  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <PageHeader title="Tahlil" subtitle={`${monthLabel(a.month)} · qaror uchun muhim signallar`} />

      <PrimaryFinancialCard>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-lg" aria-hidden="true">
            {primaryInsight?.icon ?? "↗"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Bu oyning asosiy signali</p>
            <h2 className="mt-1 text-lg font-semibold leading-snug">
              {prev ? `Xarajatlar oldingi oyga nisbatan ${Math.abs(expenseDelta * 100).toFixed(0)}% ${expenseDirection}.` : primaryInsight?.title ?? "Moliyaviy tendensiya shakllanmoqda."}
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              {primaryInsight?.body ?? "Ko‘proq operatsiya kiritilgach, tahlil aniqroq tavsiya beradi."}
            </p>
          </div>
        </div>
      </PrimaryFinancialCard>

      <PrimaryFinancialCard>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Daromad va xarajat</h2>
            <p className="mt-1 text-[11.5px] text-muted">Oylik pul oqimi dinamikasi</p>
          </div>
          <div className="w-36 shrink-0 sm:w-40">
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: "3", label: "3 oy" },
                { value: "6", label: "6 oy" },
              ]}
            />
          </div>
        </div>
        <IncomeExpenseBars data={monthly} height={180} />
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
          <MiniStat label="O‘rtacha daromad" value={formatAmount(monthly.reduce((sum, item) => sum + item.income, 0) / Math.max(1, monthly.length))} />
          <MiniStat label="O‘rtacha xarajat" value={formatAmount(monthly.reduce((sum, item) => sum + item.expense, 0) / Math.max(1, monthly.length))} />
          <MiniStat label="O‘rtacha qoldiq" value={formatAmount(monthly.reduce((sum, item) => sum + item.net, 0) / Math.max(1, monthly.length))} />
        </div>
      </PrimaryFinancialCard>

      <Section title="Asosiy ko‘rsatkichlar" hint="Bu oy · exact qiymatlar">
        <MetricGrid className="sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 p-3 sm:p-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">{metric.label}</p>
              <div className="mt-1.5"><Money value={metric.value} size="lg" tone={metric.tone} /></div>
              {metric.delta !== undefined && prev ? (
                <p className={`mt-1 text-[11px] font-medium ${metric.delta >= 0 ? "text-positive-text" : "text-negative-text"}`}>
                  {metric.delta >= 0 ? "▲" : "▼"} {Math.abs(metric.delta * 100).toFixed(0)}%
                </p>
              ) : null}
            </div>
          ))}
        </MetricGrid>
      </Section>

      <Section title="Oylik nisbatlar" hint="Daromadga nisbatan" framed>
        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          <Ratio label="Jamg‘arish ulushi" value={a.monthTotals.savingsRate} caption="daromaddan qolgan" />
          <Ratio label="Majburiy xarajat" value={a.monthTotals.mandatoryRatio} caption="daromadga nisbatan" invert />
          <Ratio label="Ixtiyoriy xarajat" value={a.monthTotals.discretionaryRatio} caption="xarajatlar tarkibi" invert />
        </div>
        <Divider />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MiniStat label="Prognoz xarajat" value={formatAmount(a.monthTotals.projectedMonthExpense)} />
          <MiniStat label="Doimiy to‘lov" value={formatAmount(a.recurringTotal)} />
          <MiniStat label="Transfer" value={formatAmount(a.monthTotals.transferTotal)} />
          <MiniStat label="Oy kunlari" value={`${a.monthTotals.daysElapsed} / ${a.monthTotals.daysInMonth}`} />
        </div>
      </Section>

      <Section title="Balans tarixi" hint="So‘nggi 90 kun" framed action={<Money value={a.balanceHistory[a.balanceHistory.length - 1]?.balance ?? 0} size="lg" />}>
        <BalanceLine data={a.balanceHistory} />
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Jamg‘arish trendi</p>
          <Sparkline values={a.monthly.map((item) => item.net)} />
        </div>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Xarajatlar tarkibi" framed>
          {a.categories.length ? (
            <>
              <CategoryBars items={a.categories.slice(0, 8).map((category) => ({ name: category.name, icon: category.icon, amount: category.amount, share: category.share }))} />
              {a.categories.some((category) => category.prevAmount > 0) ? (
                <div className="mt-4 border-t border-line pt-2">
                  {a.categories.filter((category) => category.prevAmount > 0).slice(0, 6).map((category) => (
                    <FinancialRow key={category.name} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate text-fg-soft">{category.icon} {category.name}</span>
                      <span className={`shrink-0 font-medium ${category.change > 0 ? "text-negative-text" : "text-positive-text"}`}>
                        {category.change > 0 ? "+" : ""}{formatAmount(category.change)} ({(category.changePct * 100).toFixed(0)}%)
                      </span>
                    </FinancialRow>
                  ))}
                </div>
              ) : null}
            </>
          ) : <p className="text-[13px] text-muted">Bu oyda xarajat qayd etilmagan.</p>}
        </Section>

        <Section title="Daromad va noodatiy xarajat" framed>
          {a.incomeSources.length ? (
            <CategoryBars items={a.incomeSources.map((source) => ({ name: source.name, icon: "•", amount: source.amount, share: source.share }))} />
          ) : <p className="text-[13px] text-muted">Daromad manbalari mavjud emas.</p>}
          {a.anomalies.length ? (
            <div className="mt-4 border-t border-line pt-2">
              <p className="py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Noodatiy xarajatlar</p>
              {a.anomalies.map((anomaly) => (
                <FinancialRow key={anomaly.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-medium">{anomaly.name}</p><p className="text-[11px] text-muted">o‘rtachadan {anomaly.ratio.toFixed(1)}× ortiq</p></div>
                  <span className="num max-w-[48%] break-words text-right text-[12.5px] font-medium">{formatAmount(anomaly.amount)}</span>
                </FinancialRow>
              ))}
            </div>
          ) : null}
        </Section>
      </div>

      <Section title="Tavsiyalar" hint="Keyingi qaror uchun" framed>
        <div>
          {a.insights.slice(1).map((insight, index) => (
            <FinancialRow key={`${insight.title}-${index}`} className="flex items-start gap-3">
              <span className="shrink-0 text-lg">{insight.icon}</span>
              <div className="min-w-0 flex-1"><p className="text-[14px] font-medium">{insight.title}</p><p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{insight.body}</p></div>
            </FinancialRow>
          ))}
          <FinancialRow className="flex items-start gap-3">
            <span className="shrink-0 text-lg">📈</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">Kelasi oy prognozi</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                Bazaviy: {formatCompactAmount(state.forecast.scenarios.base.delta)} · {formatCompactAmount(state.forecast.scenarios.min.balance)} — {formatCompactAmount(state.forecast.scenarios.max.balance)}
              </p>
            </div>
          </FinancialRow>
        </div>
      </Section>

      <Section title="Moliyaviy salomatlik" hint="6 omil asosidagi ko‘rsatkich" framed action={<Badge tone={state.health.score >= 70 ? "positive" : state.health.score >= 55 ? "warning" : "negative"}>{state.health.grade}</Badge>}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
          <Ring value={state.health.score / 100} size={120} label={`${state.health.score}`} sublabel="/ 100" />
          <div className="w-full min-w-0 flex-1 space-y-3">
            {state.health.factors.map((factor) => (
              <div key={factor.key} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2 text-[12px]"><span className="truncate text-fg-soft">{factor.label}</span><span className="shrink-0 text-muted"><span className="num font-medium">{factor.score}</span> /{factor.weight}%</span></div>
                <Progress value={factor.score / 100} height={6} />
                <p className="mt-1 text-[11px] text-muted">{factor.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Ratio({ label, value, caption, invert }: { label: string; value: number; caption: string; invert?: boolean }) {
  const good = invert ? value <= 0.5 : value >= 0.2;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[12px] text-muted">{label}</p>
        <p className={`num shrink-0 text-lg font-semibold ${good ? "text-positive-text" : "text-warning-text"}`}>{(value * 100).toFixed(0)}%</p>
      </div>
      <Progress value={value} height={6} />
      <p className="mt-1 text-[11px] text-muted">{caption}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</p>
      <p className="num mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}
