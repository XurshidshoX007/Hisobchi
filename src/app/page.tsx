"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CashFlowStrip, ForecastArea, Ring } from "@/components/charts";
import { useFinance } from "@/components/providers";
import { Badge, Button, Card, Divider, EmptyState, Money, Progress, SectionTitle, Skeleton } from "@/components/ui";
import { QuickAddSheet } from "@/components/quick-add";
import { compact, formatAmount, humanDate, monthLabel, shortDate, todayISO } from "@/lib/money";
import type { MonthlyView } from "@/lib/finance";

export default function DashboardPage() {
  const { state, loading, error, refresh } = useFinance();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Monthly calculations - hooks before early returns
  const monthlyViews = useMemo(() => state?.monthly ?? [], [state?.monthly]);
  const currentMonthKey = state?.analytics?.month ?? "";
  const activeMonthKey = selectedMonthKey ?? currentMonthKey;
  const activeMonthly: MonthlyView | null = useMemo(() => {
    if (!monthlyViews.length) return null;
    return monthlyViews.find((m) => m.monthKey === activeMonthKey) ?? monthlyViews.find((m) => m.isCurrent) ?? monthlyViews[0] ?? null;
  }, [monthlyViews, activeMonthKey]);

  const nextEvents = useMemo(() => {
    if (!activeMonthly) return [];
    const today = todayISO();
    return activeMonthly.daily
      .filter((d) => (activeMonthly.isCurrent ? d.date >= today : true))
      .flatMap((d) => d.events.map((ev) => ({ date: d.date, ev, daily: d })))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 8);
  }, [activeMonthly]);

  const monthlyCashflow = useMemo(() => {
    if (!state) return [];
    if (!activeMonthly) return state.forecast.cashflow;
    return activeMonthly.daily.map((d) => ({
      date: d.date,
      projectedMin: d.projectedMin,
      projectedBase: d.projectedBase,
      projectedMax: d.projectedMax,
      inflow: d.plannedIncome + d.realIncome,
      outflow: d.plannedExpense + d.realExpense,
      net: d.plannedIncome - d.plannedExpense + d.realIncome - d.realExpense,
      events: d.events,
    }));
  }, [activeMonthly, state]);

  if (loading && !state) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (error && !state) {
    return <EmptyState icon="⚠️" title="Ma&#39;lumot yuklanmadi" description={error} action={<Button type="button" onClick={() => void refresh()}>Qayta urinish</Button>} />;
  }
  if (!state) return null;

  const f = state.forecast;
  const a = state.analytics;
  const monthIndex = monthlyViews.findIndex((m) => m.monthKey === activeMonthKey);
  const canPrev = monthIndex > 0;
  const canNext = monthIndex >= 0 && monthIndex < monthlyViews.length - 1;
  const monthDelta = a.monthly.length >= 2 ? a.monthTotals.net - a.monthly[a.monthly.length - 2].net : 0;
  const critical = state.alerts.filter((x) => x.severity === "critical" || x.severity === "warning");

  const expectedThisMonth = activeMonthly?.expectedIncomeBase ?? f.income.base;
  const mandatoryThisMonth = activeMonthly?.mandatoryExpenseBase ?? f.expense.mandatoryBase;
  const optionalThisMonth = activeMonthly?.optionalExpenseBase ?? f.expense.optionalBase;
  const forecastClosing = activeMonthly?.forecastClosingBase ?? f.scenarios.base.balance;
  const forecastClosingMin = activeMonthly?.forecastClosingMin ?? f.scenarios.min.balance;
  const forecastClosingMax = activeMonthly?.forecastClosingMax ?? f.scenarios.max.balance;

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-6">
      <Card className="relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Oldingi oy"
            disabled={!canPrev}
            onClick={() => {
              if (canPrev) setSelectedMonthKey(monthlyViews[monthIndex - 1].monthKey);
            }}
          >
            ←
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Oy</p>
            <h1 className="mt-1 truncate text-xl font-bold uppercase tracking-tight">{activeMonthly?.label ?? monthLabel(activeMonthKey)}</h1>
            <p className="mt-1 text-[11px] text-muted">
              {activeMonthly?.isCurrent ? "Joriy oy" : activeMonthly?.isPast ? "O&#39;tgan oy" : "Kelasi oy"} · {activeMonthly?.daily.length ?? 30} kun
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Keyingi oy"
            disabled={!canNext}
            onClick={() => {
              if (canNext) setSelectedMonthKey(monthlyViews[monthIndex + 1].monthKey);
            }}
          >
            →
          </Button>
        </div>
        <div className="mt-3 flex justify-center gap-1.5">
          {monthlyViews.map((m) => (
            <button
              key={m.monthKey}
              onClick={() => setSelectedMonthKey(m.monthKey)}
              aria-pressed={m.monthKey === activeMonthKey}
              className={`h-1.5 rounded-full transition-all ${m.monthKey === activeMonthKey ? "w-6 bg-accent" : "w-1.5 bg-line-strong"}`}
              aria-label={m.label}
            />
          ))}
        </div>
      </Card>

      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 62%)", opacity: 0.08 }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{activeMonthly?.isCurrent ? "REAL BALANS · HOZIR" : "REAL BALANS · GLOBAL HOZIR"}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <Money value={f.currentBalance} size="hero" />
              <span className="text-sm font-medium text-muted">{state.user.currency}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Badge tone={monthDelta >= 0 ? "positive" : "negative"}>
                {monthDelta >= 0 ? "▲" : "▼"} {compact(Math.abs(monthDelta))} / oy
              </Badge>
              <Badge tone="neutral">{monthLabel(a.month)}</Badge>
              <Badge tone="neutral">{activeMonthly?.openingBalance ? `Ochilish ${compact(activeMonthly.openingBalance)}` : `${state.accounts.filter((x) => x.isActive).length} hisob`}</Badge>
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
            ➕ Operatsiya
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3">
          <div className="rounded-2xl bg-positive-soft px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-positive-text">Kutilayotgan daromad</p>
            <div className="mt-1.5 flex items-baseline justify-between">
              <Money value={expectedThisMonth} size="lg" tone="positive" />
              <span className="text-[11px] text-positive-text/70">{activeMonthly ? `${activeMonthly.daily.filter((d) => d.events.some((e) => e.kind === "income")).length} kun` : ""}</span>
            </div>
            {activeMonthly?.expectedIncomeMin !== activeMonthly?.expectedIncomeMax && (activeMonthly?.expectedIncomeMin ?? 0) > 0 ? (
              <p className="mt-1 text-[11px] text-muted">
                {compact(activeMonthly!.expectedIncomeMin ?? 0)} – {compact(activeMonthly!.expectedIncomeMax ?? 0)} oralig&#39;ida
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl bg-negative-soft px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-negative-text">Majburiy to&#39;lovlar</p>
            <div className="mt-1.5 flex items-baseline justify-between">
              <Money value={-mandatoryThisMonth} size="lg" tone="negative" signed />
              <span className="text-[11px] text-negative-text/70">{mandatoryThisMonth > 0 ? "majburiy" : "yo&#39;q"}</span>
            </div>
            {activeMonthly?.deficitDays ? <p className="mt-1 text-[11px] text-negative-text">⚠️ {activeMonthly.deficitDays} kun taqchillik xavfi</p> : null}
          </div>
          <div className="rounded-2xl bg-positive-soft px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-positive-text">Real daromad</p>
            <div className="mt-1.5"><Money value={activeMonthly?.realIncome ?? a.monthTotals.income} size="lg" tone="positive" signed /></div>
            <p className="mt-1 text-[11px] text-muted">REAL · {activeMonthly?.isCurrent ? "shu oy" : activeMonthly?.label}</p>
          </div>
          <div className="rounded-2xl bg-negative-soft px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-negative-text">Real xarajat</p>
            <div className="mt-1.5"><Money value={-(activeMonthly?.realExpense ?? a.monthTotals.expense)} size="lg" tone="negative" signed /></div>
            <p className="mt-1 text-[11px] text-muted">REAL · actual transactionlar</p>
          </div>
          <div className="rounded-2xl bg-surface-3 px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Ixtiyoriy reja</p>
            <div className="mt-1.5"><Money value={-optionalThisMonth} size="lg" signed /></div>
            <p className="mt-1 text-[11px] text-muted">PLAN · {optionalThisMonth > 0 ? "ixtiyoriy" : "reja yo'q"}</p>
          </div>
          <div className="rounded-2xl bg-accent-soft px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">Prognoz balans</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <Money value={forecastClosing} size="lg" />
              <Badge tone={forecastClosing >= 0 ? "positive" : "negative"}>{forecastClosing >= 0 ? "🟢" : "🔴"}</Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {compact(forecastClosingMin)} – {compact(forecastClosingMax)}
            </p>
          </div>
        </div>

        {activeMonthly ? (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3.5 text-center sm:gap-3 sm:pt-4">
            <div className="min-w-0">
              <p className="truncate text-[10.5px] font-medium text-muted">Ochilish balansi</p>
              <p className="num mt-0.5 truncate text-sm font-medium">{formatAmount(activeMonthly.openingBalance)}</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10.5px] font-medium text-muted">Eng past</p>
              <p className={`num mt-0.5 truncate text-sm font-medium ${activeMonthly.lowestProjected < 0 ? "text-negative-text" : ""}`}>{formatAmount(activeMonthly.lowestProjected)}</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10.5px] font-medium text-muted">Eng yuqori</p>
              <p className="num mt-0.5 truncate text-sm font-medium">{formatAmount(activeMonthly.highestProjected)}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">✨ Safe-to-Spend</p>
              <div className="mt-2">
                <Money value={f.safeToSpend} size="xl" tone={f.safeToSpend < 0 ? "negative" : "default"} signed />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {f.safeToSpend < 0
                  ? "Majburiy to&#39;lovlar va zaxira hisobga olinganda balans yetmaydi."
                  : `Oy oxirigacha (${shortDate(f.safeHorizonEnd)}) xavfsiz sarflash mumkin.`}
              </p>
            </div>
            <div className="shrink-0">
              <Ring
                value={Math.max(0, Math.min(1, f.safeToSpend / Math.max(1, f.currentBalance)))}
                size={74}
                label={f.safeToSpend < 0 ? "!" : `${Math.round(Math.max(0, Math.min(1, f.safeToSpend / Math.max(1, f.currentBalance))) * 100)}%`}
              />
            </div>
          </div>
          <Divider />
          <dl className="mt-3 space-y-1.5 text-[12px]">
            {[
              { k: "Joriy balans", v: f.safeToSpendParts.balance, tone: "default" as const },
              { k: "Aniq kutilayotgan daromad", v: f.safeToSpendParts.confirmedIncome, tone: "positive" as const },
              { k: "Taxminiy daromad (ishonch)", v: f.safeToSpendParts.estimatedIncomeWeighted, tone: "muted" as const },
              { k: "Majburiy to&#39;lovlar", v: -f.safeToSpendParts.mandatoryUpcoming, tone: "negative" as const },
              { k: "Rejalashtirilgan ixtiyoriy", v: -f.safeToSpendParts.optionalPlanned, tone: "muted" as const },
              { k: "Minimal zaxira", v: -f.safeToSpendParts.minReserve, tone: "muted" as const },
            ].map((r) => (
              <div key={r.k} className="flex items-center justify-between gap-2">
                <dt className="truncate text-muted">{r.k}</dt>
                <dd className="shrink-0">
                  <Money value={r.v} size="sm" tone={r.tone} signed />
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 rounded-xl bg-surface-3 p-3 text-[11.5px] leading-snug text-muted">
            Hisob: Balans {formatAmount(f.safeToSpendParts.balance)} + Aniq daromad {formatAmount(f.safeToSpendParts.confirmedIncome)} + Taxminiy ({state.user.estimatedIncomeConfidence}%)
            {formatAmount(f.safeToSpendParts.estimatedIncomeWeighted)} − To&#39;lovlar {formatAmount(f.safeToSpendParts.mandatoryUpcoming)} − Zaxira {formatAmount(f.safeToSpendParts.minReserve)}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Prognoz ssenariylari" hint={`${activeMonthly?.label ?? monthLabel(a.month)} uchun`} />
          <div className="space-y-3">
            <div className="rounded-xl bg-surface-3 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Konservativ</p>
              <div className="mt-1 flex items-baseline justify-between">
                <Money value={forecastClosingMin} size="md" />
                <span className="text-[11px] text-muted">faqat aniq daromad, max xarajat</span>
              </div>
            </div>
            <div className="rounded-xl bg-accent-soft p-3">
              <p className="text-[11px] uppercase tracking-wide text-accent-text">Bazaviy</p>
              <div className="mt-1 flex items-baseline justify-between">
                <Money value={forecastClosing} size="md" />
                <span className="text-[11px] text-muted">real + reja</span>
              </div>
            </div>
            <div className="rounded-xl bg-positive-soft p-3">
              <p className="text-[11px] uppercase tracking-wide text-positive-text">Optimistik</p>
              <div className="mt-1 flex items-baseline justify-between">
                <Money value={forecastClosingMax} size="md" tone="positive" />
                <span className="text-[11px] text-muted">max daromad, min xarajat</span>
              </div>
            </div>
          </div>
          <Link href="/plans" className="mt-3 inline-flex touch-manipulation text-[12px] font-medium text-accent-text">
            Cash-flow kalendarni ko&#39;rish →
          </Link>
        </Card>
      </div>

      {critical.length ? (
        <div className="space-y-2.5">
          {critical.slice(0, 3).map((x) => (
            <div key={x.id} className="card flex items-start gap-3 p-4" style={{ borderColor: x.severity === "critical" ? "var(--negative)" : "var(--warning)" }}>
              <span className="shrink-0 text-lg">{x.severity === "critical" ? "🚨" : "⚠️"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{x.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{x.body}</p>
                {x.refDate ? <p className="mt-1 text-[11px] text-muted">📅 {humanDate(x.refDate)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle
          title="📅 Keyingi muhim voqealar"
          hint={activeMonthly ? `${activeMonthly.label} bo&#39;yicha` : "35 kun ichida"}
          action={<Badge tone={activeMonthly?.deficitDays ? "negative" : "positive"}>{nextEvents.length} ta</Badge>}
        />
        {nextEvents.length ? (
          <div className="divide-y divide-line">
            {nextEvents.map(({ date, ev }) => (
              <div key={ev.key} className="flex items-center gap-3 py-3">
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-semibold ${
                    ev.kind === "income" ? "bg-positive-soft text-positive-text" : ev.mandatory ? "bg-negative-soft text-negative-text" : "bg-surface-3"
                  }`}
                >
                  {date.slice(8, 10)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {ev.kind === "income" ? "🟢" : ev.mandatory ? "🔴" : "🟡"} {ev.label}
                  </p>
                  <p className="truncate text-[11.5px] text-muted">
                    {shortDate(date)} · {ev.mandatory ? "majburiy" : ev.kind === "income" ? (ev.certainty === "estimated" ? "taxminiy daromad" : "aniq daromad") : "ixtiyoriy"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Money value={ev.kind === "income" ? ev.base : -ev.base} size="sm" tone={ev.kind === "income" ? "positive" : "default"} signed />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="📌" title="Muhim voqea yo&#39;q" description="Bu oy uchun rejalashtirilgan to&#39;lov yoki daromad yo&#39;q." />
        )}
      </Card>

      <Card>
        <SectionTitle
          title="📈 Oylik pul oqimi"
          hint={activeMonthly ? `${activeMonthly.label} prognozi` : `Kelasi ${f.horizonDays} kun`}
          action={<Badge tone={f.riskDates.length ? "negative" : "positive"}>{activeMonthly?.deficitDays ? `${activeMonthly.deficitDays} xavf` : "xavfsiz"}</Badge>}
        />
        <ForecastArea data={monthlyCashflow as any} />
        <div className="mt-4 overflow-x-auto">
          <CashFlowStrip data={monthlyCashflow as any} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-positive" /> tushum
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-fg opacity-70" /> to&#39;lov
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-negative" /> minus kun
          </span>
        </div>
        {activeMonthly?.deficitDays ? (
          <div className="mt-3 rounded-xl bg-negative-soft p-3 text-[12px] font-medium leading-relaxed text-negative-text">
            <strong>Xavf kunlari:</strong> {activeMonthly.daily.filter((d) => d.isRisk).slice(0, 4).map((r) => `${shortDate(r.date)} (−${compact(r.projectedMin < 0 ? Math.abs(r.projectedMin) : 0)})`).join(", ")}
          </div>
        ) : f.riskDates.length ? (
          <div className="mt-3 rounded-xl bg-negative-soft p-3 text-[12px] font-medium leading-relaxed text-negative-text">
            <strong>Xavf kunlari:</strong> {f.riskDates.slice(0, 4).map((r) => `${shortDate(r.date)} (−${compact(r.deficit)})`).join(", ")}
          </div>
        ) : null}
      </Card>

      {activeMonthly ? (
        <Card>
          <SectionTitle title="🗓️ Moliyaviy kalendar" hint={activeMonthly.label} />
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">
            {["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {(() => {
              const firstWeekDay = new Date(activeMonthly.monthStart).getDay();
              const offset = firstWeekDay === 0 ? 6 : firstWeekDay - 1;
              const cells: (MonthlyView["daily"][number] | null)[] = [];
              for (let i = 0; i < offset; i++) cells.push(null);
              for (const d of activeMonthly.daily) cells.push(d);
              return cells.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="h-[72px] rounded-xl bg-surface-2/50" />;
                const hasIncome = day.events.some((e) => e.kind === "income");
                const hasMandatory = day.events.some((e) => e.kind === "expense" && e.mandatory);
                const hasOptional = day.events.some((e) => e.kind === "expense" && !e.mandatory);
                const isRisk = day.isRisk;
                return (
                  <div
                    key={day.date}
                    className={`min-h-[72px] rounded-xl border p-1.5 text-left ${day.isToday ? "border-accent bg-accent-soft" : isRisk ? "border-negative bg-negative-soft" : "border-line bg-surface-2"} ${day.isPast ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-semibold ${day.isToday ? "text-accent-text" : isRisk ? "text-negative-text" : ""}`}>{day.date.slice(8, 10)}</span>
                      {isRisk ? <span className="text-[9px]">🔴</span> : hasIncome ? <span className="text-[9px]">🟢</span> : hasMandatory ? <span className="text-[9px]">🔴</span> : null}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {day.events.slice(0, 2).map((ev) => (
                        <div key={ev.key} className="truncate text-[9px] leading-tight">
                          {ev.kind === "income" ? `+${compact(ev.base)}` : `-${compact(ev.base)}`}
                        </div>
                      ))}
                      {day.events.length > 2 ? <div className="text-[8px] text-muted">+{day.events.length - 2} yana</div> : null}
                      {day.realIncome || day.realExpense ? (
                        <div className="mt-0.5 truncate text-[8px] text-muted">
                          {day.realIncome ? `+${compact(day.realIncome)}` : ""} {day.realExpense ? `-${compact(day.realExpense)}` : ""}
                        </div>
                      ) : null}
                    </div>
                    {hasIncome || hasMandatory || hasOptional ? (
                      <div className="mt-1 flex gap-0.5">
                        {hasMandatory ? <i className="h-1 w-1 rounded-full bg-negative" /> : null}
                        {hasIncome ? <i className="h-1 w-1 rounded-full bg-positive" /> : null}
                        {hasOptional ? <i className="h-1 w-1 rounded-full bg-warning" /> : null}
                      </div>
                    ) : null}
                  </div>
                );
              });
            })()}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-negative" /> majburiy
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-positive" /> daromad
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-warning" /> ixtiyoriy
            </span>
          </div>
          <div className="mt-3 rounded-xl bg-surface-3 p-3 text-[11.5px]">
            <p className="font-medium">Oy yakuni: {formatAmount(activeMonthly.forecastClosingBase)} so&#39;m</p>
            <p className="mt-1 text-muted">
              Ochilish {formatAmount(activeMonthly.openingBalance)} · Kirim {formatAmount(activeMonthly.realIncome + activeMonthly.expectedIncomeBase)} · Chiqim {formatAmount(activeMonthly.realExpense + activeMonthly.totalPlannedExpense)}
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <SectionTitle title="📌 Yaqin to&#39;lovlar" hint="Majburiy va rejalashtirilgan" />
          {f.upcomingPayments.length ? (
            <div className="divide-y divide-line">
              {f.upcomingPayments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-[11px] font-semibold">{p.daysLeft < 0 ? "!" : `${p.daysLeft}k`}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.name}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {shortDate(p.date)}
                      {p.mandatory ? " · majburiy" : ""} {p.certainty === "estimated" ? " · taxminiy" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {p.certainty === "estimated" && p.min !== p.max ? (
                      <p className="num text-[13px] font-medium">
                        {compact(p.min)}–{compact(p.max)}
                      </p>
                    ) : (
                      <Money value={p.base} size="sm" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="📌" title="Rejalashtirilgan to&#39;lov yo&#39;q" description="Doimiy to&#39;lovlarni qo&#39;shsangiz, tizim ularni avtomatik eslab turadi." />
          )}
        </Card>

        <Card>
          <SectionTitle title="💰 Kutilayotgan daromadlar" hint="Aniq va taxminiy" />
          {f.upcomingIncome.length ? (
            <div className="divide-y divide-line">
              {f.upcomingIncome.slice(0, 5).map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-positive-soft text-[11px] font-semibold text-positive-text">{i.daysLeft < 0 ? "!" : `${i.daysLeft}k`}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{i.sourceName}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {shortDate(i.date)} · {i.certainty === "estimated" ? "taxminiy" : "aniq"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {i.certainty === "estimated" && i.min !== i.max ? (
                      <p className="num text-[13px] font-medium">
                        {compact(i.min)}–{compact(i.max)}
                      </p>
                    ) : (
                      <Money value={i.base} size="sm" tone="positive" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="💰" title="Kutilayotgan daromad yo&#39;q" description="Keladigan daromadlarni kiriting." />
          )}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <SectionTitle title="Financial Health" hint="Metrikalar asosida" />
          <div className="flex items-center gap-4 sm:gap-5">
            <Ring value={state.health.score / 100} size={104} label={`${state.health.score}`} sublabel={state.health.grade} />
            <div className="min-w-0 flex-1 space-y-2">
              {state.health.factors.slice(0, 4).map((x) => (
                <div key={x.key} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="truncate text-fg-soft">{x.label}</span>
                    <span className="num shrink-0 text-muted">{x.score}</span>
                  </div>
                  <Progress value={x.score / 100} height={4} />
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 line-clamp-2 text-[12px] leading-snug text-muted">
            {state.health.label} · {state.health.factors.find((x) => x.score < 55)?.detail ?? "Barcha ko&#39;rsatkichlar barqaror"}
          </p>
        </Card>

        <Card>
          <SectionTitle title="🎯 Budjetlar" hint={monthLabel(a.month)} action={<Link href="/budgets" className="text-[12px] font-medium text-accent-text touch-manipulation">Batafsil →</Link>} />
          {state.budgets.length ? (
            <div className="space-y-3.5">
              {state.budgets.slice(0, 4).map((b) => (
                <div key={b.id} className="min-w-0">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">
                      {b.categoryIcon} {b.categoryName}
                    </span>
                    <span className="num shrink-0 text-[12px] text-muted">
                      {compact(b.spent)} / {compact(b.amount)}
                    </span>
                  </div>
                  <Progress value={b.usage} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="🎯" title="Budjet belgilanmagan" description="Toifalar uchun limit qo&#39;ying." />
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle title="So&#39;nggi operatsiyalar" action={<Link href="/transactions" className="text-[12px] font-medium text-accent-text touch-manipulation">Hammasi →</Link>} />
        {state.transactions.length ? (
          <div className="divide-y divide-line">
            {state.transactions.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base">{t.type === "transfer" ? "↔️" : t.categoryIcon}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{t.type === "transfer" ? `${t.accountName} → ${t.toAccountName ?? ""}` : t.categoryName ?? "Boshqa"}</p>
                  <p className="truncate text-[11.5px] text-muted">
                    {humanDate(t.date)} · {t.accountName} {t.note ? `· ${t.note}` : ""}
                  </p>
                </div>
                {t.type === "transfer" ? (
                  <span className="text-sm font-semibold text-muted">—</span>
                ) : (
                  <Money value={t.type === "expense" ? -t.amount : t.amount} size="sm" signed tone={t.type === "income" ? "positive" : "default"} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🧾"
            title="Moliyaviy tarix bo&#39;sh"
            description="Birinchi operatsiyangizni qo&#39;shing — qolganini tizim tartibga soladi."
            action={<Button type="button" onClick={() => setAddOpen(true)}>➕ Operatsiya qo&#39;shish</Button>}
          />
        )}
      </Card>

      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
