"use client";

import Link from "next/link";
import { useState } from "react";
import { CashFlowStrip, ForecastArea, Ring } from "@/components/charts";
import { useFinance } from "@/components/providers";
import { Badge, Button, Card, Divider, EmptyState, Money, Progress, SectionTitle, Skeleton } from "@/components/ui";
import { QuickAddSheet } from "@/components/quick-add";
import { compact, formatAmount, humanDate, monthLabel, shortDate } from "@/lib/money";

export default function DashboardPage() {
  const { state, loading, error } = useFinance();
  const [addOpen, setAddOpen] = useState(false);

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
    return <EmptyState icon="⚠️" title="Ma'lumot yuklanmadi" description={error} />;
  }
  if (!state) return null;

  const f = state.forecast;
  const a = state.analytics;
  const monthDelta = a.monthly.length >= 2 ? a.monthTotals.net - a.monthly[a.monthly.length - 2].net : 0;
  const critical = state.alerts.filter((x) => x.severity === "critical" || x.severity === "warning");

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-6">
      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 62%)", opacity: 0.08 }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Umumiy balans</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <Money value={f.currentBalance} size="hero" />
              <span className="text-sm font-medium text-muted">{state.user.currency}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Badge tone={monthDelta >= 0 ? "positive" : "negative"}>
                {monthDelta >= 0 ? "▲" : "▼"} {compact(Math.abs(monthDelta))} / oy
              </Badge>
              <Badge tone="neutral">{monthLabel(a.month)}</Badge>
              <Badge tone="neutral">{state.accounts.filter((x) => x.isActive).length} hisob</Badge>
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
            ➕ Operatsiya
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3">
          <div className="rounded-2xl bg-positive-soft px-3.5 py-3 sm:px-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-positive-text">Daromad / oy</p>
            <div className="mt-1">
              <Money value={a.monthTotals.income} size="lg" tone="positive" />
            </div>
          </div>
          <div className="rounded-2xl bg-surface-3 px-3.5 py-3 sm:px-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Xarajat / oy</p>
            <div className="mt-1">
              <Money value={a.monthTotals.expense} size="lg" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3.5 text-center sm:gap-3 sm:pt-4">
          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-medium text-muted">Bugun</p>
            <p className="num mt-0.5 truncate text-sm font-medium">{formatAmount(a.today.net)}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-medium text-muted">Kunlik o‘rtacha</p>
            <p className="num mt-0.5 truncate text-sm font-medium">{formatAmount(a.monthTotals.avgDaily)}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-medium text-muted">Jamg‘arish</p>
            <p className="num mt-0.5 text-sm font-medium">{(a.monthTotals.savingsRate * 100).toFixed(0)}%</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">✨ Safe-to-Spend</p>
              <div className="mt-2">
                <Money value={Math.max(0, f.safeToSpend)} size="xl" tone={f.safeToSpend < 0 ? "negative" : "default"} />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {f.safeToSpend < 0
                  ? "Majburiy to‘lovlar va zaxira hisobga olinganda balans yetmaydi."
                  : `Oy oxirigacha (${shortDate(f.safeHorizonEnd)}) xavfsiz sarflash mumkin.`}
              </p>
            </div>
            <div className="shrink-0">
              <Ring
                value={Math.max(0, Math.min(1, f.safeToSpend / Math.max(1, f.currentBalance)))}
                size={74}
                label={
                  f.safeToSpend < 0
                    ? "!"
                    : `${Math.round(Math.max(0, Math.min(1, f.safeToSpend / Math.max(1, f.currentBalance))) * 100)}%`
                }
              />
            </div>
          </div>
          <Divider />
          <dl className="mt-3 space-y-1.5 text-[12px]">
            {[
              { k: "Joriy balans", v: f.safeToSpendParts.balance, tone: "default" as const },
              { k: "Aniq kutilayotgan daromad", v: f.safeToSpendParts.confirmedIncome, tone: "positive" as const },
              { k: "Taxminiy daromad (50%)", v: f.safeToSpendParts.estimatedIncomeWeighted, tone: "muted" as const },
              { k: "Majburiy to‘lovlar", v: -f.safeToSpendParts.mandatoryUpcoming, tone: "negative" as const },
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
        </Card>

        <Card>
          <SectionTitle title="Forecast" hint={`${f.horizonDays} kun prognozi`} />
          <div className="space-y-3">
            <ForecastRow
              label="Kutilayotgan daromad"
              value={f.income.base}
              sub={`aniq ${compact(f.income.exactBase)} · taxminiy ${compact(f.income.estimatedBase)}`}
              tone="positive"
            />
            <ForecastRow
              label="Rejalashtirilgan xarajat"
              value={f.expense.base}
              sub={`majburiy ${compact(f.expense.mandatoryBase)} · ixtiyoriy ${compact(f.expense.optionalBase)}`}
              tone="negative"
            />
          </div>
          <Divider />
          <div className="mt-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Prognoz balans</p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <Money value={f.scenarios.base.balance} size="xl" />
              <Badge tone={f.scenarios.base.delta >= 0 ? "positive" : "negative"}>
                {f.scenarios.base.delta >= 0 ? "+" : ""}
                {compact(f.scenarios.base.delta)}
              </Badge>
            </div>
            <p className="mt-1.5 text-[12px] text-muted">
              Ssenariylar: {compact(f.scenarios.min.balance)} — {compact(f.scenarios.max.balance)}
            </p>
          </div>
          <Link href="/plans" className="mt-3 inline-flex touch-manipulation text-[12px] font-medium text-accent-text">
            Cash-flow kalendarni ko‘rish →
          </Link>
        </Card>
      </div>

      {critical.length ? (
        <div className="space-y-2.5">
          {critical.slice(0, 2).map((x) => (
            <div
              key={x.id}
              className="card flex items-start gap-3 p-4"
              style={{ borderColor: x.severity === "critical" ? "var(--negative)" : "var(--warning)" }}
            >
              <span className="shrink-0 text-lg">{x.severity === "critical" ? "🚨" : "⚠️"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{x.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{x.body}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle
          title="📈 Cash Flow"
          hint="Kelasi 35 kun"
          action={<Badge tone={f.riskDates.length ? "negative" : "positive"}>{f.riskDates.length ? `${f.riskDates.length} xavf` : "xavfsiz"}</Badge>}
        />
        <ForecastArea data={f.cashflow} />
        <div className="mt-4 overflow-x-auto">
          <CashFlowStrip data={f.cashflow} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-positive" /> tushum
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-fg opacity-70" /> to‘lov
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full bg-negative" /> minus kun
          </span>
        </div>
        {f.riskDates.length ? (
          <div className="mt-3 rounded-xl bg-negative-soft p-3 text-[12px] font-medium leading-relaxed text-negative-text">
            <strong>Xavf kunlari:</strong> {f.riskDates.slice(0, 4).map((r) => `${shortDate(r.date)} (−${compact(r.deficit)})`).join(", ")}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <SectionTitle title="📌 Yaqin to‘lovlar" hint="Majburiy va rejalashtirilgan" />
          {f.upcomingPayments.length ? (
            <div className="divide-y divide-line">
              {f.upcomingPayments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-[11px] font-semibold">
                    {p.daysLeft < 0 ? "!" : `${p.daysLeft}k`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.name}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {shortDate(p.date)}
                      {p.mandatory ? " · majburiy" : ""}
                      {p.certainty === "estimated" ? " · taxminiy" : ""}
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
            <EmptyState
              icon="📌"
              title="Rejalashtirilgan to‘lov yo‘q"
              description="Doimiy to‘lovlarni qo‘shsangiz, tizim ularni avtomatik eslab turadi."
            />
          )}
        </Card>

        <Card>
          <SectionTitle title="💰 Kutilayotgan daromadlar" hint="Aniq va taxminiy" />
          {f.upcomingIncome.length ? (
            <div className="divide-y divide-line">
              {f.upcomingIncome.slice(0, 5).map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-positive-soft text-[11px] font-semibold text-positive-text">
                    {i.daysLeft < 0 ? "!" : `${i.daysLeft}k`}
                  </div>
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
            <EmptyState icon="💰" title="Kutilayotgan daromad yo‘q" description="Keladigan daromadlarni kiriting." />
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
            {state.health.label} · {state.health.factors.find((x) => x.score < 55)?.detail ?? "Barcha ko‘rsatkichlar barqaror"}
          </p>
        </Card>

        <Card>
          <SectionTitle
            title="🎯 Budjetlar"
            hint={monthLabel(a.month)}
            action={
              <Link href="/budgets" className="text-[12px] font-medium text-accent-text touch-manipulation">
                Batafsil →
              </Link>
            }
          />
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
            <EmptyState icon="🎯" title="Budjet belgilanmagan" description="Toifalar uchun limit qo‘ying." />
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="So‘nggi operatsiyalar"
          action={
            <Link href="/transactions" className="text-[12px] font-medium text-accent-text touch-manipulation">
              Hammasi →
            </Link>
          }
        />
        {state.transactions.length ? (
          <div className="divide-y divide-line">
            {state.transactions.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base">
                  {t.type === "transfer" ? "↔️" : t.categoryIcon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {t.type === "transfer" ? `${t.accountName} → ${t.toAccountName ?? ""}` : t.categoryName ?? "Boshqa"}
                  </p>
                  <p className="truncate text-[11.5px] text-muted">
                    {humanDate(t.date)} · {t.accountName}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
                <Money
                  value={t.type === "expense" ? -t.amount : t.amount}
                  size="sm"
                  signed
                  tone={t.type === "income" ? "positive" : t.type === "expense" ? "default" : "muted"}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🧾"
            title="Moliyaviy tarix bo‘sh"
            description="Birinchi operatsiyangizni qo‘shing — qolganini tizim tartibga soladi."
            action={
              <Button type="button" onClick={() => setAddOpen(true)}>
                ➕ Operatsiya qo‘shish
              </Button>
            }
          />
        )}
      </Card>

      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function ForecastRow({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "positive" | "negative" }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{label}</p>
        <p className="truncate text-[11.5px] text-muted">{sub}</p>
      </div>
      <div className="shrink-0">
        <Money value={value} size="md" tone={tone} />
      </div>
    </div>
  );
}
