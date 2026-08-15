"use client";

import { useState } from "react";
import { BalanceLine, CategoryBars, IncomeExpenseBars, Ring, Sparkline } from "@/components/charts";
import { useFinance } from "@/components/providers";
import { Badge, Card, Divider, Money, PageHeader, Progress, Segmented, Skeleton } from "@/components/ui";
import { compact, monthLabel } from "@/lib/money";

export default function AnalyticsPage() {
  const { state, loading } = useFinance();
  const [range, setRange] = useState<"3" | "6">("6");

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const a = state.analytics;
  const monthly = range === "3" ? a.monthly.slice(-3) : a.monthly;
  const prev = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const cur = monthly[monthly.length - 1];
  const incomeDelta = prev && prev.income > 0 ? (cur.income - prev.income) / prev.income : 0;
  const expenseDelta = prev && prev.expense > 0 ? (cur.expense - prev.expense) / prev.expense : 0;

  const metrics = [
    { label: "Jami daromad", value: a.monthTotals.income, delta: incomeDelta, tone: "positive" as const },
    { label: "Jami xarajat", value: a.monthTotals.expense, delta: expenseDelta, tone: "default" as const },
    { label: "Sof qoldiq", value: a.monthTotals.net, tone: a.monthTotals.net >= 0 ? ("positive" as const) : ("negative" as const) },
    { label: "O‘rtacha kunlik", value: a.monthTotals.avgDaily, tone: "muted" as const },
  ];

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-6">
      <PageHeader title="Tahlil" subtitle={`${monthLabel(a.month)} · nima bo‘layotganini tushunamiz`} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{m.label}</p>
            <div className="mt-1.5">
              <Money value={m.value} size="lg" tone={m.tone} />
            </div>
            {m.delta !== undefined && prev ? (
              <p className={`mt-1 truncate text-[11px] font-medium ${m.delta >= 0 ? "text-positive-text" : "text-negative-text"}`}>
                {m.delta >= 0 ? "▲" : "▼"} {Math.abs(m.delta * 100).toFixed(0)}% oldingi oyga nisbatan
              </p>
            ) : null}
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-4 text-[15px] font-semibold">Oylik nisbatlar</p>
        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          <Ratio label="Jamg‘arish ulushi" value={a.monthTotals.savingsRate} caption="daromaddan qolgan" />
          <Ratio label="Majburiy xarajat" value={a.monthTotals.mandatoryRatio} caption="daromadga nisbatan" invert />
          <Ratio label="Ixtiyoriy xarajat" value={a.monthTotals.discretionaryRatio} caption="xarajatlar tarkibi" invert />
        </div>
        <Divider />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <MiniStat label="Prognoz oylik xarajat" value={compact(a.monthTotals.projectedMonthExpense)} />
          <MiniStat label="Doimiy to‘lovlar" value={compact(a.recurringTotal)} />
          <MiniStat label="Transferlar" value={compact(a.monthTotals.transferTotal)} />
          <MiniStat label="Oy kunlari" value={`${a.monthTotals.daysElapsed} / ${a.monthTotals.daysInMonth}`} />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Income vs Expense</p>
            <p className="truncate text-[11.5px] text-muted">Daromad (yashil) va xarajat</p>
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
        <IncomeExpenseBars data={monthly} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted">O‘rtacha daromad</p>
            <p className="num mt-0.5 truncate text-sm font-medium">{compact(monthly.reduce((s, m) => s + m.income, 0) / monthly.length)}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted">O‘rtacha xarajat</p>
            <p className="num mt-0.5 truncate text-sm font-medium">{compact(monthly.reduce((s, m) => s + m.expense, 0) / monthly.length)}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted">O‘rtacha jamg‘arish</p>
            <p className="num mt-0.5 truncate text-sm font-medium">{compact(monthly.reduce((s, m) => s + m.net, 0) / monthly.length)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">Balance History</p>
            <p className="text-[11.5px] text-muted">So‘nggi 90 kun</p>
          </div>
          <div className="shrink-0">
            <Money value={a.balanceHistory[a.balanceHistory.length - 1]?.balance ?? 0} size="lg" />
          </div>
        </div>
        <BalanceLine data={a.balanceHistory} />
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Jamg‘arish trendi</p>
          <Sparkline values={a.monthly.map((m) => m.net)} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-4 text-[15px] font-semibold">Xarajatlar tahlili</p>
          {a.categories.length ? (
            <>
              <CategoryBars
                items={a.categories.slice(0, 8).map((c) => ({ name: c.name, icon: c.icon, amount: c.amount, share: c.share }))}
              />
              <Divider />
              <div className="mt-3 space-y-2">
                {a.categories
                  .slice(0, 6)
                  .filter((c) => c.prevAmount > 0)
                  .map((c) => (
                    <div key={c.name} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate text-fg-soft">
                        {c.icon} {c.name}
                      </span>
                      <span className={`shrink-0 font-medium ${c.change > 0 ? "text-negative-text" : "text-positive-text"}`}>
                        {c.change > 0 ? "+" : ""}
                        {compact(c.change)} ({(c.changePct * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-muted">Bu oyda xarajat qayd etilmagan.</p>
          )}
        </Card>

        <Card>
          <p className="mb-4 text-[15px] font-semibold">Daromad manbalari</p>
          {a.incomeSources.length ? (
            <CategoryBars items={a.incomeSources.map((s) => ({ name: s.name, icon: "•", amount: s.amount, share: s.share }))} />
          ) : (
            <p className="text-[13px] text-muted">Daromad manbalari mavjud emas.</p>
          )}
          {a.anomalies.length ? (
            <>
              <Divider />
              <p className="mb-2 mt-4 text-[13px] font-semibold">Noodatiy xarajatlar</p>
              <div className="space-y-2">
                {a.anomalies.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{n.name}</p>
                      <p className="text-[11px] text-muted">o‘rtachadan {n.ratio.toFixed(1)}× ortiq</p>
                    </div>
                    <span className="num shrink-0 text-[12.5px] font-medium">{compact(n.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <Card>
        <p className="mb-4 text-[15px] font-semibold">📊 Intelligent Insights</p>
        <div className="space-y-3">
          {a.insights.map((ins, i) => (
            <div key={i} className="flat-card flex items-start gap-3 p-4">
              <span className="shrink-0 text-lg">{ins.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{ins.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{ins.body}</p>
              </div>
            </div>
          ))}
          <div className="flat-card flex items-start gap-3 p-4">
            <span className="shrink-0 text-lg">📈</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">Kelasi oy prognozi</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                Bazaviy ssenariy: {compact(state.forecast.scenarios.base.delta)} (
                {compact(state.forecast.scenarios.min.balance)} — {compact(state.forecast.scenarios.max.balance)})
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3.5 flex items-center justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">Financial Health</p>
            <p className="truncate text-[11.5px] text-muted">6 omil asosidagi ko‘rsatkich</p>
          </div>
          <Badge tone={state.health.score >= 70 ? "positive" : state.health.score >= 55 ? "warning" : "negative"}>
            {state.health.grade}
          </Badge>
        </div>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
          <Ring value={state.health.score / 100} size={120} label={`${state.health.score}`} sublabel="/ 100" />
          <div className="w-full min-w-0 flex-1 space-y-3">
            {state.health.factors.map((f) => (
              <div key={f.key} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-fg-soft">{f.label}</span>
                  <span className="shrink-0 text-muted">
                    <span className="num font-medium">{f.score}</span>
                    <span className="text-muted"> /{f.weight}%</span>
                  </span>
                </div>
                <Progress value={f.score / 100} height={6} />
                <p className="mt-1 truncate text-[11px] text-muted">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Ratio({
  label,
  value,
  caption,
  invert,
}: {
  label: string;
  value: number;
  caption: string;
  invert?: boolean;
}) {
  const good = invert ? value <= 0.5 : value >= 0.2;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[12px] text-muted">{label}</p>
        <p className={`num shrink-0 text-lg font-semibold ${good ? "text-positive-text" : "text-warning-text"}`}>
          {(value * 100).toFixed(0)}%
        </p>
      </div>
      <Progress value={value} height={6} />
      <p className="mt-1 truncate text-[11px] text-muted">{caption}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="num mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
