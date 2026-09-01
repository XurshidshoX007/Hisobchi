"use client";

import Link from "next/link";
import { useState } from "react";
import { CashFlowStrip, CategoryBars, ForecastArea, IncomeExpenseBars } from "@/components/charts";
import { Icon } from "@/components/icon";
import { useFinance } from "@/components/providers";
import { Badge, Card, Label, Skeleton } from "@/components/ui";
import { addDays, addMonths, compact, dayDiff, formatAmount, monthEnd, monthKey, monthStart, shortDate, todayISO } from "@/lib/money";
import { buildBalanceMovements, monthCashflow, monthPlanned } from "@/lib/finance";
import { hasEnoughAnalyticsData } from "@/lib/onboarding";

const NAV_BTN =
  "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation disabled:pointer-events-none disabled:opacity-40";

/** Read-only cash-flow analysis, kept separate from plan creation and editing. */
export function CashflowAnalysis() {
  const { state, loading } = useFinance();
  const [cashMonth, setCashMonth] = useState(() => monthKey(todayISO()));
  const [movementDetailsOpen, setMovementDetailsOpen] = useState(false);
  const [insightView, setInsightView] = useState<"categories" | "trend">("categories");

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const forecast = state.forecast;
  const monthlyView = state.monthly?.find((month) => month.monthKey === cashMonth);
  const monthLabel = monthlyView?.label ?? cashMonth;
  const today = forecast.today;
  const current = monthKey(today);
  const isPast = cashMonth < current;
  const forecastDays = monthCashflow(forecast.cashflow, cashMonth);
  // Historical months use the real ledger only. Forecast rows only exist from
  // today forward, so reusing them here would make a past balance look empty.
  const historicalDays = isPast ? buildHistoricalDays({
    transactions: state.transactions,
    month: cashMonth,
    today,
    currentBalance: state.currentBalance,
  }) : [];
  const days = isPast
    ? monthlyView
      ? monthlyView.daily.map((day) => ({
        date: day.date,
        inflow: day.realIncome,
        outflow: day.realExpense,
        net: day.realIncome - day.realExpense,
        projectedBase: day.projectedBase,
        projectedMin: day.projectedMin,
        projectedMax: day.projectedMax,
        events: day.events,
      }))
      : historicalDays
    : forecastDays;
  const items = monthPlanned(forecast.planned, cashMonth);
  const risks = isPast ? [] : forecast.riskDates.filter((risk) => monthKey(risk.date) === cashMonth);
  const first = days[0];
  const last = days[days.length - 1];
  const opening = monthlyView?.openingBalance ?? (first ? first.projectedBase - first.net : 0);
  const closing = last ? last.projectedBase : opening;
  // Income/expense reporting remains clean: loan and debt principal affect the
  // cash line above, but are intentionally excluded from these two metrics.
  const completedOperational = historicalOperationalTotals(state.transactions, cashMonth, today);
  // The upper chart is deliberately a forecast for the current/future period.
  // The balance-movement card below always uses completed ledger rows only.
  const inflow = isPast && monthlyView ? monthlyView.realIncome : isPast ? completedOperational.income : days.reduce((sum, day) => sum + day.inflow, 0);
  const outflow = isPast && monthlyView ? monthlyView.realExpense : isPast ? completedOperational.expense : days.reduce((sum, day) => sum + day.outflow, 0);
  const mandatory = isPast ? 0 : items.filter((item) => item.kind === "expense" && item.mandatory).reduce((sum, item) => sum + item.base, 0);
  const expectedIncome = isPast ? 0 : items.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.base, 0);
  const plannedPayments = isPast ? 0 : items.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.base, 0);
  const confirmedExpectedIncome = isPast ? 0 : items.filter((item) => item.kind === "income" && item.certainty === "exact").reduce((sum, item) => sum + item.base, 0);
  const chartData = days.map((day) => ({ ...day, actual: isPast || day.date <= today }));
  const isCurrent = cashMonth === current;
  const previousMonth = monthKey(addMonths(monthStart(cashMonth), -1));
  const nextMonth = monthKey(addMonths(monthStart(cashMonth), 1));
  const earliestTransactionMonth = state.transactions
    .filter((transaction) => !transaction.isDeleted && transaction.date <= today)
    .map((transaction) => monthKey(transaction.date))
    .sort()[0] ?? current;
  // Historical navigation must not depend on an optional precomputed series.
  // A ledger row is the authoritative lower bound; the component has its own
  // safe fallback calculator when a monthly view is unavailable.
  const canGoPrevious = cashMonth > earliestTransactionMonth;
  const canGoNext = isPast || (state.monthly?.some((month) => month.monthKey === nextMonth) ?? false);
  const trend = state.analytics.monthly;
  const categories = state.analytics.categories.filter((category) => category.amount > 0).slice(0, 5);
  const movements = buildBalanceMovements({ transactions: state.transactions, month: cashMonth, today });
  const debtNet = movements.debtBorrowed - movements.debtLent + movements.debtRecovered - movements.debtRepaid;
  // Show the parts separately so interest is never mistaken for a second
  // deduction after it has already been included in a generic expense total.
  const everydayExpense = Math.max(0, completedOperational.expense - movements.creditInterestAndFees);
  const balanceMovementNet = completedOperational.income - everydayExpense - movements.creditInterestAndFees + debtNet - movements.creditPrincipalPaid;
  const forecastBalanceNet = closing - opening;
  const completedTransactionCount = state.transactions.filter((transaction) => !transaction.isDeleted).length;
  const essentialCategoryIds = new Set(state.categories.filter((category) => category.isEssential).map((category) => category.id));
  const essentialHistory = state.transactions.filter((transaction) =>
    !transaction.isDeleted &&
    transaction.type === "expense" &&
    transaction.date <= today &&
    transaction.date >= addDays(today, -27) &&
    transaction.debtId == null &&
    transaction.creditPrincipalAmount == null &&
    transaction.categoryId != null &&
    essentialCategoryIds.has(transaction.categoryId),
  );
  const essentialSpent = essentialHistory.reduce((sum, transaction) => sum + transaction.amount, 0);
  const firstEssentialDate = essentialHistory.map((transaction) => transaction.date).sort()[0];
  const essentialObservedDays = firstEssentialDate ? Math.min(28, Math.max(7, dayDiff(firstEssentialDate, today) + 1)) : 0;
  const dailyEssentialAverage = essentialObservedDays ? essentialSpent / essentialObservedDays : 0;
  const daysRemaining = isCurrent ? Math.max(0, dayDiff(today, monthEnd(today))) : 0;
  const essentialRemaining = dailyEssentialAverage * daysRemaining;
  const emergencyReserve = Math.max(state.user.minReserve, dailyEssentialAverage * 3);
  const safeAvailable = state.currentBalance + confirmedExpectedIncome - mandatory - essentialRemaining - emergencyReserve;
  const activeCredits = state.recurring.filter((plan) => plan.status === "active" && plan.creditSummary);
  const creditPrincipalRemaining = activeCredits.reduce((sum, plan) => sum + (plan.creditSummary?.principalRemaining ?? 0), 0);
  const creditInterestRemaining = activeCredits.reduce((sum, plan) => sum + (plan.creditSummary?.interestRemaining ?? 0) + (plan.creditSummary?.feeRemaining ?? 0), 0);
  const nextCredit = activeCredits
    .flatMap((plan) => plan.installments?.filter((installment) => !installment.paid && installment.date >= today).map((installment) => ({ ...installment, name: plan.name })) ?? [])
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const upcomingItems = isPast ? [] : items.filter((item) => item.date >= today).slice(0, 6);

  if (!hasEnoughAnalyticsData(state.transactions)) {
    return <AnalyticsPreview transactionCount={completedTransactionCount} />;
  }

  return (
    <div className="animate-fade-up mx-auto w-full max-w-3xl space-y-3.5 sm:space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setCashMonth(previousMonth)} className={NAV_BTN} aria-label="Oldingi oy" disabled={!canGoPrevious}>
            <Icon name="chevron-left" size={15} />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-[15px] font-semibold">Pul oqimi · {monthLabel}</p>
            <p className="mt-0.5 text-[11px] text-muted">{isPast ? "O‘tgan oy" : isCurrent ? "Joriy oy" : "Kelasi oy"}</p>
          </div>
          <button type="button" onClick={() => setCashMonth(nextMonth)} className={NAV_BTN} aria-label="Keyingi oy" disabled={!canGoNext}>
            <Icon name="chevron-right" size={15} />
          </button>
        </div>

        {days.length ? (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] sm:grid-cols-4" style={{ background: "var(--border)" }}>
              <Metric label={isCurrent ? "Bugungi balans" : "Ochilish"} value={formatAmount(opening)} />
              <Metric label={isPast ? "Daromad" : "Kutilgan kirim"} value={`+${formatAmount(inflow)}`} tone="positive" />
              <Metric label={isPast ? "Xarajat" : "Kutilgan chiqim"} value={`−${formatAmount(outflow)}`} />
              <Metric label="Yopilish" value={formatAmount(closing)} tone={closing < 0 ? "negative" : "warning"} />
            </div>
            {isPast ? (
              <p className="text-[11px] text-muted">Bu oy yakunlangan — grafik faqat real pul harakatlarini ko‘rsatadi.</p>
            ) : (
              <p className="text-[11px] text-muted">
                Majburiy <span className="num font-medium text-fg-soft">{compact(mandatory)}</span> · Kutilayotgan daromad{" "}
                <span className="num font-medium text-fg-soft">{compact(expectedIncome)}</span>
              </p>
            )}

            <div>
              <ForecastArea data={chartData} />
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--fg)" }} /> real</span>
                {!isPast ? <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded border-b border-dashed" style={{ borderColor: "var(--gold)" }} /> prognoz</span> : null}
                {!isPast ? <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--negative)" }} /> xavf</span> : null}
              </div>
            </div>
            <div className="overflow-x-auto border-t border-line pt-3"><CashFlowStrip data={days} /></div>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">Bu oy prognoz davridan tashqarida. Joriy oyga qayting.</p>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label>{isPast ? "OY YAKUNI" : "QO‘SHIMCHA XARAJAT UCHUN"}</Label>
            <p className={`num mt-1 text-[24px] font-bold tracking-tight ${isPast ? (balanceMovementNet > 0 ? "text-positive-text" : balanceMovementNet < 0 ? "text-negative-text" : "text-fg") : safeAvailable > 0 ? "text-positive-text" : safeAvailable < 0 ? "text-negative-text" : "text-fg"}`}>
              {isPast ? (balanceMovementNet > 0 ? "+" : balanceMovementNet < 0 ? "−" : "") + formatAmount(Math.abs(balanceMovementNet)) : (safeAvailable > 0 ? "+" : safeAvailable < 0 ? "−" : "") + formatAmount(Math.abs(safeAvailable))}
            </p>
            <p className="mt-1 text-[11.5px] text-muted">{isPast ? "oy davomida haqiqiy balans o‘zgarishi" : "reja, zaruriy xarajat va zaxiradan keyin"}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${isPast ? "bg-surface-2 text-muted" : safeAvailable < 0 ? "bg-negative-soft text-negative-text" : "bg-positive-soft text-positive-text"}`}>{isPast ? "Yakunlangan" : safeAvailable < 0 ? "Ehtiyot bo‘ling" : "Xavfsiz"}</span>
        </div>
        <div className={`grid gap-2 ${isPast ? "grid-cols-1" : "grid-cols-2"}`}>
          <BalanceSnapshot label={isPast ? "Oy yakuniy balansi" : "Hozirgi balans"} value={isPast ? closing : state.currentBalance} hint={isPast ? "oy tugagan paytdagi holat" : "barcha hisoblarda hozir"} />
          {!isPast ? <BalanceSnapshot label="Kutilgan oy yakuni" value={closing} hint="barcha reja bajarilsa" tone="forecast" /> : null}
        </div>
        {!isPast && essentialObservedDays === 0 ? <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">Kundalik xarajat tarixi hali yetarli emas; xavfsiz limit hozircha rejalangan to‘lovlarga tayangan.</p> : null}
        {!isPast && activeCredits.length ? <Link href="/plans" className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 text-[12px] transition-colors hover:bg-surface-3 active:scale-[0.99] touch-manipulation"><span className="min-w-0 truncate text-muted">Kredit qarzi qoldig‘i</span><span className="num shrink-0 font-bold text-fg">{formatAmount(creditPrincipalRemaining)} <span className="font-medium text-warning-text">· foiz {formatAmount(creditInterestRemaining)}</span> →</span></Link> : null}
        <button
          type="button"
          onClick={() => setMovementDetailsOpen((open) => !open)}
          aria-expanded={movementDetailsOpen}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-[12px] font-semibold text-accent-text transition-colors hover:bg-accent-soft active:scale-[0.98] touch-manipulation"
        >
          {movementDetailsOpen ? "Hisobni yopish" : "Balans hisobini ko‘rish"}
          <Icon name="chevron-down" size={14} className={movementDetailsOpen ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
        {movementDetailsOpen ? (
          <div className="mt-2 border-t border-line pt-1">
            {!isPast ? <>
              <p className="px-0 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Erkin pul hisobi</p>
              <div className="divide-y divide-line">
                <DecisionRow label="Hozirgi balans" value={state.currentBalance} />
                {confirmedExpectedIncome > 0 ? <DecisionRow label="Aniq kutilgan daromad" value={confirmedExpectedIncome} /> : null}
                {mandatory > 0 ? <DecisionRow label="Majburiy to‘lovlar" value={-mandatory} /> : null}
                {essentialRemaining > 0 ? <DecisionRow label={`Kundalik zaruriy xarajatlar · ${daysRemaining} kun`} value={-essentialRemaining} hint={`${formatAmount(dailyEssentialAverage)} / kun`} /> : null}
                {emergencyReserve > 0 ? <DecisionRow label="Fors-major zaxirasi" value={-emergencyReserve} hint={state.user.minReserve > dailyEssentialAverage * 3 ? "siz belgilagan zaxira" : "kamida 3 kunlik ehtiyoj"} /> : null}
                <DecisionRow label="Erkin foydalanish mumkin" value={safeAvailable} strong />
              </div>
            </> : null}
            <p className="px-0 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Bajarilgan harakatlar</p>
            <div className="divide-y divide-line">
              {completedOperational.income > 0 ? <MovementRow label="Daromad" value={completedOperational.income} /> : null}
              {everydayExpense > 0 ? <MovementRow label="Kundalik xarajatlar" value={-everydayExpense} /> : null}
              {movements.debtBorrowed > 0 ? <MovementRow label="Qarz olindi" value={movements.debtBorrowed} /> : null}
              {movements.debtLent > 0 ? <MovementRow label="Qarz berildi" value={-movements.debtLent} /> : null}
              {movements.debtRecovered > 0 ? <MovementRow label="Qarz qaytdi" value={movements.debtRecovered} /> : null}
              {movements.debtRepaid > 0 ? <MovementRow label="Qarz to‘landi" value={-movements.debtRepaid} /> : null}
              {movements.creditInterestAndFees > 0 ? <MovementRow label="Kredit foizi va komissiyasi" value={-movements.creditInterestAndFees} hint="xarajat sifatida hisoblandi" /> : null}
              {movements.creditPrincipalPaid > 0 ? <MovementRow label="Kredit qarzining asosiy qismi" value={-movements.creditPrincipalPaid} hint="balans kamayadi, xarajat emas" /> : null}
              <MovementRow label="Haqiqiy o‘zgarish" value={balanceMovementNet} strong final />
            </div>
            {!isPast ? (
              <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Qolgan reja</p>
                <div className="mt-1 divide-y divide-line">
                  {expectedIncome > 0 ? <MovementRow label="Kutilgan kirim" value={expectedIncome} /> : null}
                  {plannedPayments > 0 ? <MovementRow label="Rejalangan to‘lovlar" value={-plannedPayments} /> : null}
                  <MovementRow label="Oy yakuni prognozi" value={forecastBalanceNet} strong final />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {!isPast ? <UpcomingCard items={upcomingItems} risks={risks} monthLabel={monthLabel} /> : null}

      <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><p className="text-[15px] font-semibold">Chuqur tahlil</p><p className="mt-0.5 text-[11.5px] text-muted">Odatlar va xarajat tuzilmasi</p></div>
          {insightView === "categories" ? <Link href={`/transactions?type=expense&month=${current}`} className="shrink-0 text-[12px] font-semibold text-accent-text">Tarix →</Link> : null}
        </div>
        <div className="mb-4 grid grid-cols-2 rounded-xl bg-surface-2 p-1">
          <button type="button" onClick={() => setInsightView("categories")} className={`min-h-8 rounded-[9px] px-2 text-[11.5px] font-semibold transition-colors ${insightView === "categories" ? "bg-surface text-fg shadow-sm" : "text-muted"}`}>Xarajatlar</button>
          <button type="button" onClick={() => setInsightView("trend")} className={`min-h-8 rounded-[9px] px-2 text-[11.5px] font-semibold transition-colors ${insightView === "trend" ? "bg-surface text-fg shadow-sm" : "text-muted"}`}>6 oylik trend</button>
        </div>
        {insightView === "categories" ? (
          categories.length ? <CategoryBars items={categories} /> : <p className="text-[13px] leading-relaxed text-muted">Bu oy xarajat kategoriyalari hali shakllanmadi.</p>
        ) : trend.some((month) => month.income > 0 || month.expense > 0) ? (
          <><div className="mb-3 flex items-center gap-3 text-[11px] text-muted"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--positive)" }} /> Daromad</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm opacity-75" style={{ background: "var(--fg)" }} /> Xarajat</span></div><IncomeExpenseBars data={trend} /></>
        ) : <p className="text-[13px] leading-relaxed text-muted">Trend uchun hali operatsiyalar yetarli emas.</p>}
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

type LedgerMovement = {
  date: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  debtId: number | null;
  creditPrincipalAmount: number | null;
  isDeleted: boolean;
};

/**
 * A resilient audit fallback for a historical month. The server normally
 * supplies `monthly`, but this keeps month navigation usable while that
 * optional derived series is unavailable or still refreshing in Telegram.
 */
function buildHistoricalDays({
  transactions,
  month,
  today,
  currentBalance,
}: {
  transactions: LedgerMovement[];
  month: string;
  today: string;
  currentBalance: number;
}) {
  const start = monthStart(month);
  const end = monthEnd(start);
  const active = transactions.filter((transaction) => !transaction.isDeleted && transaction.date <= today);
  const cashDelta = (transaction: LedgerMovement) =>
    transaction.type === "income" ? transaction.amount : transaction.type === "expense" ? -transaction.amount : 0;
  const opening = currentBalance - active
    .filter((transaction) => transaction.date >= start)
    .reduce((sum, transaction) => sum + cashDelta(transaction), 0);
  const byDate = new Map<string, { inflow: number; outflow: number }>();
  for (const transaction of active) {
    if (!transaction.date.startsWith(month)) continue;
    const row = byDate.get(transaction.date) ?? { inflow: 0, outflow: 0 };
    if (transaction.type === "income") row.inflow += transaction.amount;
    if (transaction.type === "expense") row.outflow += transaction.amount;
    byDate.set(transaction.date, row);
  }

  let balance = opening;
  const days: Array<{ date: string; inflow: number; outflow: number; net: number; projectedBase: number; projectedMin: number; projectedMax: number; events: [] }> = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const row = byDate.get(date) ?? { inflow: 0, outflow: 0 };
    const net = row.inflow - row.outflow;
    balance += net;
    days.push({ date, ...row, net, projectedBase: balance, projectedMin: balance, projectedMax: balance, events: [] });
  }
  return days;
}

/** Principal is cash movement, not operational revenue or consumption. */
function historicalOperationalTotals(transactions: LedgerMovement[], month: string, today: string) {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    if (transaction.isDeleted || transaction.date > today || !transaction.date.startsWith(month) || transaction.debtId) continue;
    if (transaction.type === "income") income += transaction.amount;
    if (transaction.type === "expense") {
      const principal = transaction.creditPrincipalAmount ?? 0;
      expense += Math.max(0, transaction.amount - principal);
    }
  }
  return { income, expense };
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "warning" }) {
  const color = tone === "positive" ? "text-positive-text" : tone === "negative" ? "text-negative-text" : tone === "warning" ? "text-warning-text" : "";
  return <div className="min-w-0 bg-surface-2 px-3.5 py-3"><Label className="block truncate">{label}</Label><p className={`num mt-1 break-words text-[13.5px] font-bold ${color}`}>{value}</p></div>;
}

function BalanceSnapshot({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "forecast" }) {
  const color = value > 0 ? "text-positive-text" : value < 0 ? "text-negative-text" : "text-fg-soft";
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-3 ${tone === "forecast" ? "border-accent/20 bg-accent-soft/30" : "border-line bg-surface-2"}`}>
      <Label>{label}</Label>
      <p className={`num mt-1 text-[15px] font-bold ${color}`}>{value < 0 ? "−" : ""}{formatAmount(Math.abs(value))}</p>
      <p className="mt-1 text-[10.5px] text-muted">{hint}</p>
    </div>
  );
}

function UpcomingCard({
  items,
  risks,
  monthLabel,
}: {
  items: Array<{ key: string; date: string; kind: "income" | "expense"; base: number; label: string; mandatory: boolean; certainty?: "exact" | "estimated" }>;
  risks: Array<{ date: string; cause: string; deficit: number }>;
  monthLabel: string;
}) {
  const visibleDates = new Set(items.map((item) => item.date));
  const standaloneRisks = risks.filter((risk) => !visibleDates.has(risk.date)).slice(0, 2);
  return (
    <Card
      className={risks.length ? "animate-alert-once" : ""}
      style={risks.length ? { borderColor: "rgba(255,122,122,.28)", background: "linear-gradient(180deg, rgba(255,122,122,.09), rgba(255,122,122,.03))" } : undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><p className="flex items-center gap-2 text-[15px] font-semibold"><Icon name="calendar" size={16} className="shrink-0 text-accent-text" />Yaqin kunlar</p><p className="mt-0.5 text-[11px] text-muted">To‘lovlar, kirimlar va xavf nuqtalari</p></div>
        <span className="text-[11px] text-muted">{monthLabel}</span>
      </div>
      {items.length || standaloneRisks.length ? <div className="divide-y divide-line">
        {items.map((item) => {
          const risk = risks.find((entry) => entry.date === item.date);
          return <div key={item.key} className="flex items-center gap-2.5 py-2.5"><span className="num w-12 shrink-0 text-[11.5px] text-muted">{shortDate(item.date)}</span><span className={`num shrink-0 text-[12.5px] font-semibold ${item.kind === "income" ? "text-positive-text" : "text-fg"}`}>{item.kind === "income" ? "+" : "−"}{compact(item.base)}</span><span className="min-w-0 flex-1 truncate text-[12.5px]">{item.label}</span><Badge tone={risk || item.mandatory ? "negative" : item.kind === "income" ? "positive" : "neutral"}>{risk ? "Xavf" : item.mandatory ? "Majburiy" : item.kind === "income" ? (item.certainty === "estimated" ? "Taxminiy" : "Aniq") : "Reja"}</Badge></div>;
        })}
        {standaloneRisks.map((risk) => <div key={`risk-${risk.date}`} className="flex items-center gap-2.5 py-2.5"><span className="num w-12 shrink-0 text-[11.5px] text-negative-text">{shortDate(risk.date)}</span><span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{risk.cause}</span><span className="num shrink-0 text-[12.5px] font-semibold text-negative-text">−{compact(risk.deficit)}</span></div>)}
      </div> : <p className="text-[13px] leading-relaxed text-muted">Yaqin kunlar uchun rejalashtirilgan harakat yoki xavf aniqlanmadi.</p>}
    </Card>
  );
}

function MovementRow({ label, value, hint, strong, final }: { label: string; value: number; hint?: string; strong?: boolean; final?: boolean }) {
  const color = value > 0 ? "text-positive-text" : value < 0 ? "text-negative-text" : "text-fg-soft";
  return (
    <div className={`flex items-center justify-between gap-3 py-2.5 ${final ? "pt-3" : ""}`}>
      <div className="min-w-0"><p className={`truncate text-[13px] ${strong ? "font-semibold" : ""}`}>{label}</p>{hint ? <p className="mt-0.5 text-[10.5px] text-muted">{hint}</p> : null}</div>
      <span className={`num shrink-0 text-[13px] ${strong ? "font-bold" : "font-semibold"} ${color}`}>{value > 0 ? "+" : value < 0 ? "−" : ""}{formatAmount(Math.abs(value))}</span>
    </div>
  );
}

function DecisionRow({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  const color = value > 0 ? "text-positive-text" : value < 0 ? "text-negative-text" : "text-fg-soft";
  return (
    <div className={`flex items-center justify-between gap-3 py-2.5 ${strong ? "pt-3" : ""}`}>
      <div className="min-w-0"><p className={`truncate text-[13px] ${strong ? "font-semibold" : ""}`}>{label}</p>{hint ? <p className="mt-0.5 text-[10.5px] text-muted">{hint}</p> : null}</div>
      <span className={`num shrink-0 text-[13px] ${strong ? "font-bold" : "font-semibold"} ${color}`}>{value > 0 ? "+" : value < 0 ? "−" : ""}{formatAmount(Math.abs(value))}</span>
    </div>
  );
}
