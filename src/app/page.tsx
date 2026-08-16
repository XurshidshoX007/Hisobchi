"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ForecastArea } from "@/components/charts";
import { useFinance } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Money, Section, SectionTitle, Skeleton } from "@/components/ui";
import { QuickAddSheet } from "@/components/quick-add";
import { formatAmount, shortDate } from "@/lib/money";
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

  // Dashboard shows the next 1–3 important events only — the FULL schedule
  // lives on Plans (§7): here it is a reference, not a second list.
  const monthEvents = useMemo(() => {
    if (!month || !state) return [];
    const events = state.forecast.timeline.filter((event) => event.date.startsWith(month.monthKey) && event.kind !== "risk");
    if (month.isCurrent) return events.filter((event) => event.date >= state.forecast.today).slice(0, 3);
    if (month.isFuture) return events.slice(0, 3);
    return events.filter((event) => event.phase === "real").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  }, [month, state]);

  if (loading && !state) {
    return (
      <div className="space-y-3" aria-label="Dashboard yuklanmoqda" aria-busy="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-56" />
        <Skeleton className="h-24" />
        <Skeleton className="h-36" />
        <Skeleton className="h-52" />
      </div>
    );
  }
  if (error && !state) {
    return <EmptyState icon="⚠️" title="Ma'lumot yuklanmadi" description={error} action={<Button onClick={() => void refresh()}>Qayta urinish</Button>} />;
  }
  if (!state || !month) return null;

  const forecast = state.forecast;
  const index = months.findIndex((item) => item.monthKey === month.monthKey);
  const previousMonth = state.analytics.monthly.find((item) => item.month === month.monthKey);
  const previous = state.analytics.monthly[state.analytics.monthly.findIndex((item) => item.month === month.monthKey) - 1];
  const trendVisible = !month.isFuture && Boolean(previousMonth && previous);

  const contextBalance = month.isCurrent ? forecast.currentBalance : month.isPast ? month.forecastClosingBase : month.openingBalance;
  const contextLabel = month.isCurrent ? "Joriy real balans" : month.isPast ? "Oy yopilish real balansi" : "Prognoz ochilish balansi";
  const closingLabel = month.isPast ? "Real yopilish balansi" : "Oy oxiri prognozi";

  const firstRiskDay = month.daily.find((day) => day.isRisk && (month.isCurrent ? day.date >= forecast.today : true));
  const riskCause = firstRiskDay?.timelineEvents
    .filter((event) => event.kind === "mandatory" || event.kind === "optional" || event.kind === "planned_expense")
    .sort((a, b) => b.base - a.base)[0];
  const recovery = firstRiskDay
    ? month.daily.find((day) => day.date > firstRiskDay.date && day.projectedMin >= 0 && day.timelineEvents.some((event) => event.kind === "planned_income"))
    : undefined;
  const recoveryIncome = recovery?.timelineEvents.filter((event) => event.kind === "planned_income").reduce((sum, event) => sum + event.base, 0) ?? 0;

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
    <div className="animate-fade-up space-y-3 sm:space-y-5">
      {/* 1 · Month switcher */}
      <nav className="flex items-center gap-2" aria-label="Oy tanlash">
        <button
          type="button"
          className="grid min-h-11 min-w-11 place-items-center rounded-full border border-line bg-surface text-lg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Oldingi oy"
          disabled={index <= 0}
          onClick={() => setSelectedMonthKey(months[index - 1]?.monthKey ?? month.monthKey)}
        >←</button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-lg font-bold uppercase tracking-tight">{month.label}</p>
          <p className="text-[11px] text-muted">{month.isCurrent ? "Joriy oy" : month.isPast ? "Tarixiy real natija" : "Kelajak rejasi"}</p>
        </div>
        <button
          type="button"
          className="grid min-h-11 min-w-11 place-items-center rounded-full border border-line bg-surface text-lg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Keyingi oy"
          disabled={index < 0 || index >= months.length - 1}
          onClick={() => setSelectedMonthKey(months[index + 1]?.monthKey ?? month.monthKey)}
        >→</button>
      </nav>

      {/* 2 · Hero — PRIMARY home of balance, this-month real flow and month-end
             forecast (§11). No other section repeats these numbers. */}
      <Card className="relative overflow-hidden">
        <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent opacity-[0.06]" />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">REAL · {contextLabel}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
              <Money value={contextBalance} size="hero" tone={contextBalance < 0 ? "negative" : "default"} />
              <span className="text-xs text-muted">{state.user.currency}</span>
            </div>
            {!month.isCurrent ? <p className="mt-1 text-[11px] text-muted">Bugungi global balans bilan aralashtirilmagan</p> : null}
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="shrink-0">＋ Operatsiya</Button>
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
          <div><p className="text-[10px] font-semibold uppercase text-muted">Bu oy · daromad</p><div className="mt-1"><Money value={month.realIncome} size="md" tone="positive" signed /></div></div>
          <div><p className="text-[10px] font-semibold uppercase text-muted">Bu oy · xarajat</p><div className="mt-1"><Money value={-month.realExpense} size="md" tone="negative" signed /></div></div>
        </div>
        <div className="relative mt-3 rounded-xl bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted">PROGNOZ · {closingLabel}</p>
          <div className="mt-1"><Money value={month.forecastClosingBase} size="lg" tone={month.forecastClosingBase < 0 ? "negative" : "default"} /></div>
        </div>
      </Card>

      {/* 3 · ONE risk card — the single home of risk (§5/§12) — or one
             positive insight line when there is nothing to worry about. */}
      {firstRiskDay ? (
        <Card className="border-negative bg-negative-soft" >
          <div className="flex items-start gap-3">
            <span className="text-xl" aria-hidden="true">🔴</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-negative-text">Eng yaqin xavf · {shortDate(firstRiskDay.date)}</p>
              <h2 className="mt-1 break-words text-base font-semibold">{riskCause?.label ?? "Balans yetishmasligi"}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div><p className="text-muted">Sabab / to‘lov</p><div className="mt-1"><Money value={-(riskCause?.base ?? 0)} size="md" tone="negative" signed /></div></div>
                <div><p className="text-muted">Kutilayotgan balans</p><div className="mt-1"><Money value={firstRiskDay.projectedMin} size="md" tone="negative" signed /></div></div>
              </div>
              <p className="mt-3 rounded-xl bg-surface/70 p-2.5 text-[12px] leading-relaxed">
                {recovery ? <><strong>{shortDate(recovery.date)}</strong> kuni +{formatAmount(recoveryIncome)} tushumdan keyin tiklanadi.</> : "Tanlangan davr ichida tiklanish manbasi topilmadi."}
              </p>
              <Link href="/plans" className="mt-2 inline-block text-[12px] font-semibold text-accent-text">To‘lov jadvali → Rejalar</Link>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex items-center gap-2.5 rounded-2xl bg-positive-soft px-4 py-3">
          <span aria-hidden="true">🟢</span>
          <p className="min-w-0 text-[12.5px] leading-snug text-positive-text">
            {month.isPast ? "Bu oy defitsitsiz yopilgan." : <>Xavf aniqlanmadi — eng past prognoz <strong className="num">{formatAmount(month.lowestProjected)}</strong>.</>}
          </p>
        </div>
      )}

      {/* 4 · Monthly summary — ONE compact grouped block (§13). Only the REJA
             side lives here: REAL flow and PROGNOZ already have their home in
             the hero above and are not repeated. */}
      <Section title="Oylik xulosa" hint="REJA tomoni · to‘liq ro‘yxat Rejalarda" action={<Link href="/plans" className="text-xs font-semibold text-accent-text">Rejalar →</Link>}>
        <h2 className="sr-only">Oylik asosiy ko‘rsatkichlar</h2>
        <div className="rounded-2xl border border-line bg-surface">
          <div className="grid grid-cols-2 divide-x divide-line">
            <div className="min-w-0 p-3">
              <p className="text-[10px] font-semibold uppercase leading-snug tracking-[0.07em] text-muted">Kutilayotgan daromad</p>
              <div className="mt-1.5"><Money value={month.expectedIncomeBase} size="md" tone="positive" signed /></div>
            </div>
            <div className="min-w-0 p-3">
              <p className="text-[10px] font-semibold uppercase leading-snug tracking-[0.07em] text-muted">Majburiy to‘lov</p>
              <div className="mt-1.5"><Money value={-month.mandatoryExpenseBase} size="md" tone="negative" signed /></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 border-t border-line p-2.5 text-center">
            <div className="min-w-0"><p className="text-[9.5px] uppercase text-muted">Ochilish</p><p className="num mt-1 break-words text-[11px] font-semibold sm:text-sm">{formatAmount(month.openingBalance)}</p></div>
            <div className="min-w-0"><p className="text-[9.5px] uppercase text-muted">Eng past</p><p className={`num mt-1 break-words text-[11px] font-semibold sm:text-sm ${month.lowestProjected < 0 ? "text-negative-text" : ""}`}>{formatAmount(month.lowestProjected)}</p></div>
            <div className="min-w-0"><p className="text-[9.5px] uppercase text-muted">Eng yuqori</p><p className="num mt-1 break-words text-[11px] font-semibold sm:text-sm">{formatAmount(month.highestProjected)}</p></div>
          </div>
        </div>
      </Section>

      {/* 5 · Safe-to-Spend — one strong card; the formula is secondary and
             collapsed (§14). */}
      {month.isCurrent ? (
        <Card>
          <SectionTitle title="Safe-to-Spend" hint={`Bugundan ${shortDate(forecast.safeHorizonEnd)} gacha`} action={<Badge tone={forecast.safeToSpend < 0 ? "negative" : "positive"}>{forecast.safeToSpend < 0 ? "Yetishmayapti" : "Xavfsiz"}</Badge>} />
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-muted">Majburiyatlardan keyin xavfsiz</p>
              <div className="mt-1"><Money value={forecast.safeToSpend} size="xl" tone={forecast.safeToSpend < 0 ? "negative" : "default"} signed /></div>
            </div>
            <p className="text-[12px] text-muted">
              Rejalardan keyin: <span className={`num font-semibold ${forecast.freeToSpend < 0 ? "text-negative-text" : "text-fg"}`}>{formatAmount(forecast.freeToSpend)}</span>
            </p>
          </div>
          <details className="mt-3 rounded-xl border border-line">
            <summary className="cursor-pointer select-none px-3 py-2.5 text-[11.5px] font-medium text-muted touch-manipulation">Formulani ko‘rish</summary>
            <p className="break-words border-t border-line p-3 text-[11px] leading-relaxed text-muted">
              {formatAmount(forecast.safeToSpendParts.balance)} balans + {formatAmount(forecast.safeToSpendParts.confirmedIncome)} aniq tushum + {formatAmount(forecast.safeToSpendParts.estimatedIncomeWeighted)} vaznlangan tushum − {formatAmount(forecast.safeToSpendParts.mandatoryUpcoming)} majburiy to‘lov − {formatAmount(forecast.safeToSpendParts.minReserve)} zaxira = <strong className="text-fg">{formatAmount(forecast.safeToSpend)}</strong>. Ixtiyoriy reja: −{formatAmount(forecast.safeToSpendParts.optionalPlanned)}.
            </p>
          </details>
        </Card>
      ) : null}

      {/* 6 · The ONE main chart (§15). */}
      <Card>
        <SectionTitle title="Balans prognozi" hint={`${month.label} · min / baza / max`} action={<Badge tone={month.deficitDays ? "negative" : "positive"}>{month.deficitDays ? `${month.deficitDays} xavf kuni` : "barqaror"}</Badge>} />
        <ForecastArea data={chartData} description={chartSummary} />
        <p className="sr-only">{chartSummary}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-[10.5px] text-muted"><span>— REAL</span><span className="text-accent-text">— PROGNOZ</span><span>▧ min–max</span><span className="text-negative-text">● xavf</span></div>
      </Card>

      {/* 7 · Next 3 important events — a reference to Plans, not a list. */}
      <Section title="Keyingi muhim voqealar" hint={month.isPast ? "Oy ichidagi so‘nggi REAL voqealar" : `${month.label} · 3 tagacha`} action={<Link href="/plans" className="text-xs font-semibold text-accent-text">Barchasi → Rejalar</Link>}>
        {monthEvents.length ? <div className="divide-y divide-line">{monthEvents.map((event) => {
          const amount = eventAmount(event);
          return <div key={event.key} className="flex min-w-0 items-center gap-3 py-3">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[11px] font-bold ${amount >= 0 ? "bg-positive-soft text-positive-text" : event.mandatory ? "bg-negative-soft text-negative-text" : "bg-warning-soft text-warning-text"}`}>{event.date.slice(8, 10)}</div>
            <div className="min-w-0 flex-1"><p className="break-words text-[13.5px] font-medium">{event.label}</p><p className="mt-0.5 text-[10.5px] text-muted">{shortDate(event.date)} · {eventLabel(event)}</p></div>
            <div className="max-w-[38%] shrink-0 text-right"><Money value={amount} size="sm" tone={amount >= 0 ? "positive" : "negative"} signed /></div>
          </div>;
        })}</div> : <EmptyState icon="📌" title="Bu davrda muhim voqea yo‘q" description={hasPlan ? "Rejalashtirilgan holat mavjud, ammo tanlangan mezonga tushmadi." : "Daromad yoki to‘lov rejasini qo‘shishingiz mumkin."} />}
      </Section>

      {/* 8 · One compact insight — interpretation itself lives in Analytics. */}
      {trendVisible && previousMonth && previous ? (
        <Link href="/analytics" className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 transition-colors hover:bg-surface-3 touch-manipulation">
          <p className="min-w-0 text-[12.5px] leading-snug text-fg-soft">
            📊 Oldingi oyga nisbatan: xarajat <strong>{change(previousMonth.expense, previous.expense)}</strong>, daromad <strong>{change(previousMonth.income, previous.income)}</strong>
          </p>
          <span className="shrink-0 text-xs font-semibold text-accent-text">Tahlil →</span>
        </Link>
      ) : null}

      {!hasReal ? <p className="px-2 text-center text-[12px] text-muted">Bu oy hali operatsiya yo‘q.{hasPlan ? " Rejalashtirilgan holat mavjud." : ""}</p> : null}
      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
