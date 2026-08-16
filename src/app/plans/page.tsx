"use client";
/* eslint-disable react-hooks/set-state-in-effect -- planning form drafts synchronize to editing/open state */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CashFlowStrip, ForecastArea } from "@/components/charts";
import { useFinance } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Progress,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  addMonths,
  compact,
  dayMonth,
  formatAmount,
  humanDate,
  monthKey,
  monthStart,
  relativeDayShort,
  shortDate,
  todayISO,
} from "@/lib/money";
import { filterPlansByTab, isActivePlanLoad, monthCashflow, monthPlanned } from "@/lib/finance";
import type { ExpectedIncomeView, Forecast, PlanLifecycle, PlanListTab, RecurringView } from "@/lib/finance";

type Tab = "payments" | "income" | "cashflow";

/** Actions a payment-plan row can emit, keyed by lifecycle status. */
type PlanRowAction = "pay" | "toggle" | "restore" | "edit" | "cancel" | "history";
type IncomeRowAction = "receive" | "toggle" | "restore" | "edit" | "cancel" | "history";

/* ============================ Design system helpers ============================ */

type Tone = "neutral" | "positive" | "negative" | "warning" | "accent" | "info";

/**
 * ONE lifecycle status is authoritative (§10). `isActive` and `termCompleted`
 * are never surfaced as separate user-visible concepts — the badge below is the
 * single vocabulary the whole page (payments AND income) speaks.
 */
const STATUS_META: Record<PlanLifecycle, { label: string; tone: Tone; icon: string }> = {
  active: { label: "Faol", tone: "accent", icon: "●" },
  paused: { label: "Pauza", tone: "warning", icon: "❚❚" },
  cancelled: { label: "Bekor qilingan", tone: "negative", icon: "✕" },
  completed: { label: "Yakunlangan", tone: "positive", icon: "✓" },
};

const STATUS_TABS: Array<{ value: PlanListTab; label: string }> = [
  { value: "open", label: "Faol" },
  { value: "paused", label: "Pauza" },
  { value: "completed", label: "Yakunlangan" },
  { value: "cancelled", label: "Bekor qilingan" },
];

/** 44px round icon button — the standard secondary touch target of this page. */
const ICON_BTN =
  "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation disabled:pointer-events-none disabled:opacity-40";

const LINK_BTN =
  "inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-accent-text transition-colors hover:bg-accent-soft active:bg-accent-soft touch-manipulation";

function frequencyLabel(frequency: string): string {
  if (frequency === "weekly") return "Har hafta";
  if (frequency === "yearly") return "Har yil";
  if (frequency === "monthly") return "Har oy";
  return "Bir martalik";
}

/**
 * Date UX (§9/§17): an exact date FIRST, a human relative distance SECOND.
 * Cryptic counters such as "17k" carry no meaning and are never rendered.
 */
function dueMeta(plan: { nextOccurrenceDate: string; daysLeft: number; status: PlanLifecycle; lastEventDate: string | null }, dateISO: string) {
  const { status, daysLeft } = plan;
  // §11: a cancelled plan advertises the date it would REALLY resume on, so
  // reactivation never comes as a surprise.
  if (status === "cancelled") {
    return { text: `Qayta faollashtirilsa: ${dayMonth(plan.nextOccurrenceDate)}`, tone: "muted" as const, overdue: false };
  }
  if (status === "completed") {
    return {
      text: plan.lastEventDate ? `Yakunlandi · oxirgi ${dayMonth(plan.lastEventDate)}` : "Yakunlandi",
      tone: "positive" as const,
      overdue: false,
    };
  }
  // §13: a paused plan has no countdown — it has a schedule waiting to resume.
  if (status === "paused") {
    return { text: `${dayMonth(plan.nextOccurrenceDate)} · pauzada`, tone: "muted" as const, overdue: false };
  }
  const overdue = daysLeft < 0;
  return {
    text: `${dayMonth(dateISO)} · ${relativeDayShort(daysLeft)}`,
    tone: overdue ? ("negative" as const) : daysLeft <= 3 ? ("warning" as const) : ("muted" as const),
    overdue,
  };
}

const TONE_TEXT_STAT: Record<"default" | "positive" | "muted", string> = {
  default: "text-fg",
  positive: "text-positive-text",
  muted: "text-muted",
};

const TONE_TEXT: Record<"muted" | "negative" | "warning" | "positive", string> = {
  muted: "text-muted",
  negative: "text-negative-text",
  warning: "text-warning-text",
  positive: "text-positive-text",
};

/* ============================ Page ============================ */

export default function PlansPage() {
  const { state, loading, mutate } = useFinance();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("payments");
  const [planTab, setPlanTab] = useState<PlanListTab>("open");
  const [incomeTab, setIncomeTab] = useState<PlanListTab>("open");
  const [sheet, setSheet] = useState<"recurring" | "income" | null>(null);
  const [editing, setEditing] = useState<RecurringView | null>(null);
  const [editingIncome, setEditingIncome] = useState<ExpectedIncomeView | null>(null);
  const [cashMonth, setCashMonth] = useState<string>(monthKey(todayISO()));
  const [deletingPlan, setDeletingPlan] = useState<RecurringView | null>(null);
  const [deletingIncome, setDeletingIncome] = useState<ExpectedIncomeView | null>(null);
  const [restoringPlan, setRestoringPlan] = useState<RecurringView | null>(null);
  const [restoringIncome, setRestoringIncome] = useState<ExpectedIncomeView | null>(null);
  const [menuPlan, setMenuPlan] = useState<RecurringView | null>(null);
  const [menuIncome, setMenuIncome] = useState<ExpectedIncomeView | null>(null);

  function closeSheet() {
    setSheet(null);
    setEditing(null);
    setEditingIncome(null);
  }

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const f = state.forecast;
  const month = state.currentMonthPlan;

  // Lifecycle buckets (§3/§11): the default "Faol" tab shows ACTIVE plans plus
  // PAUSED ones in a clearly separated section; cancelled/completed live in
  // their own tabs and NEVER appear in the default list — and no plan can ever
  // show up in two visible sections at once.
  const activePlans = state.recurring.filter((r) => r.status === "active");
  const pausedPlans = state.recurring.filter((r) => r.status === "paused");
  const tabbedPlans = planTab === "open" ? null : filterPlansByTab(state.recurring, planTab);

  const activeIncomePlans = state.expectedIncomes.filter((i) => i.status === "active");
  const pausedIncomePlans = state.expectedIncomes.filter((i) => i.status === "paused");
  const tabbedIncomePlans = incomeTab === "open" ? null : filterPlansByTab(state.expectedIncomes, incomeTab);

  // Money load counts ONLY plans that produce future occurrences (§4/§14):
  // cancelled and completed contribute zero, paused is excluded from the active
  // load (it has its own section and badge).
  const loadPlans = state.recurring.filter((r) => isActivePlanLoad(r.status));
  const monthlyOptional = loadPlans.filter((r) => !r.isMandatory).reduce((s, r) => s + r.baseAmount, 0);
  const optionalCount = loadPlans.filter((r) => !r.isMandatory).length;
  // Annualized load applies ONLY to indefinite recurring plans — a term plan is
  // worth count × amount and must never be multiplied by 12.
  const recurringPlans = loadPlans.filter((r) => r.planType === "recurring");
  const yearlyLoad = recurringPlans.reduce((s, r) => s + r.yearlyTotal, 0);
  const termPlans = loadPlans.filter((r) => r.planType === "term");
  const termRemaining = termPlans.reduce((s, r) => s + (r.remainingTotal ?? 0), 0);

  // "Eng yaqin to'lov" — this month's next open occurrence, otherwise the next
  // one on the whole horizon (§15).
  const nearest =
    month.nearest ??
    (f.upcomingPayments[0]
      ? {
          id: f.upcomingPayments[0].id,
          name: f.upcomingPayments[0].name,
          date: f.upcomingPayments[0].date,
          daysLeft: f.upcomingPayments[0].daysLeft,
          base: f.upcomingPayments[0].base,
          mandatory: f.upcomingPayments[0].mandatory,
          certainty: f.upcomingPayments[0].certainty,
          status: f.upcomingPayments[0].status,
        }
      : null);

  function handlePlanAction(action: PlanRowAction, plan: RecurringView) {
    if (action === "edit") {
      setEditing(plan);
      setSheet("recurring");
      return;
    }
    if (action === "cancel") {
      setDeletingPlan(plan);
      return;
    }
    if (action === "restore") {
      setRestoringPlan(plan);
      return;
    }
    if (action === "history") {
      router.push(`/transactions?plan=${plan.id}`);
      return;
    }
    void mutate("recurring", action, { id: plan.id });
  }

  function handleIncomeAction(action: IncomeRowAction, plan: ExpectedIncomeView) {
    if (action === "edit") {
      setEditingIncome(plan);
      setSheet("income");
      return;
    }
    if (action === "cancel") {
      setDeletingIncome(plan);
      return;
    }
    if (action === "restore") {
      setRestoringIncome(plan);
      return;
    }
    if (action === "history") {
      router.push(`/transactions?income=${plan.id}`);
      return;
    }
    void mutate("expectedIncome", action, { id: plan.id });
  }

  return (
    <div className="animate-fade-up mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
      <PageHeader title="Reja va prognoz" subtitle="Kelajakdagi majburiyatlar va kutilayotgan pullar markazi" />

      <div className="mb-1 sm:mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "payments", label: "To‘lovlar" },
            { value: "income", label: "Daromad" },
            { value: "cashflow", label: "Cash-flow" },
          ]}
        />
      </div>

      {tab === "payments" ? (
        <div className="space-y-3.5 sm:space-y-4">
          {/* §28/§29: monthly planning first — the annual figures are secondary. */}
          <MonthLoadCard month={month} nearest={nearest} />

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <StatCard
              label="Ixtiyoriy / oy"
              value={monthlyOptional}
              context={`${optionalCount} ta reja`}
            />
            <StatCard label="Faol rejalar" value={activePlans.length} plain context={`${pausedPlans.length} ta pauzada`} />
            <StatCard
              label="Yillik yuklama"
              value={yearlyLoad}
              context={recurringPlans.length ? "faqat doimiy rejalar" : "doimiy reja yo‘q"}
            />
            <StatCard
              label="Muddatli qoldiq"
              value={termRemaining}
              context={termPlans.length ? `${termPlans.length} ta reja` : "muddatli reja yo‘q"}
            />
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <Segmented value={planTab} onChange={setPlanTab} options={STATUS_TABS} />
            </div>
            <Button
              type="button"
              className="w-full shrink-0 sm:w-auto"
              onClick={() => {
                setEditing(null);
                setSheet("recurring");
              }}
            >
              ➕ Yangi to‘lov rejasi
            </Button>
          </div>

          {planTab === "open" ? (
            activePlans.length || pausedPlans.length ? (
              <div className="space-y-3">
                {activePlans.map((r) => (
                  <PaymentPlanCard key={r.id} plan={r} onAction={handlePlanAction} onMenu={setMenuPlan} />
                ))}
                {pausedPlans.length ? (
                  <>
                    <SectionLabel>Pauzadagi rejalar · {pausedPlans.length} ta</SectionLabel>
                    {pausedPlans.map((r) => (
                      <PaymentPlanCard key={r.id} plan={r} onAction={handlePlanAction} onMenu={setMenuPlan} />
                    ))}
                  </>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon="📌"
                title="Faol reja yo‘q"
                description="Ijara, kommunal, kredit kabi takrorlanuvchi to‘lovlarni bir marta kiriting — tizim sanani va yukni o‘zi hisoblaydi."
                action={
                  <Button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setSheet("recurring");
                    }}
                  >
                    ➕ To‘lov rejasi qo‘shish
                  </Button>
                }
              />
            )
          ) : tabbedPlans && tabbedPlans.length ? (
            <div className="space-y-3">
              {tabbedPlans.map((r) => (
                <PaymentPlanCard key={r.id} plan={r} onAction={handlePlanAction} onMenu={setMenuPlan} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={planTab === "cancelled" ? "🚫" : planTab === "completed" ? "🏁" : "❚❚"}
              title={
                planTab === "paused"
                  ? "Pauzadagi reja yo‘q"
                  : planTab === "completed"
                    ? "Yakunlangan reja yo‘q"
                    : "Bekor qilingan reja yo‘q"
              }
              description={
                planTab === "paused"
                  ? "Faol rejani vaqtincha to‘xtatsangiz shu yerda ko‘rinadi — pauzadagi reja prognozga ta’sir qilmaydi."
                  : planTab === "completed"
                    ? "Muddatli reja barcha bo‘lib to‘lashlari tugagach shu yerga tushadi."
                    : "Bekor qilish faqat kelajakdagi to‘lovlarni to‘xtatadi — tarixdagi haqiqiy to‘lovlar saqlanadi."
              }
              action={
                <Button type="button" variant="secondary" onClick={() => setPlanTab("open")}>
                  Faol rejalarga qaytish
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      {tab === "income" ? (
        <div className="space-y-3.5 sm:space-y-4">
          <Card>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                Bu oy · {state.currentMonthIncome.label}
              </p>
              <Badge tone="positive">kutilmoqda</Badge>
            </div>
            <Money value={state.currentMonthIncome.base} size="xl" tone="positive" />
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <StatCard label="Aniq kutilmoqda" value={state.currentMonthIncome.exactBase} context="tasdiqlangan manbalar" tone="positive" />
              <StatCard label="Taxminiy" value={state.currentMonthIncome.estimatedBase} context="diapazon o‘rtachasi" tone="muted" />
            </div>
            <p className="mt-3 border-t border-line pt-3 text-[11.5px] leading-snug text-muted">
              90 kunlik prognoz: <span className="num font-medium text-fg">{compact(f.income.base)} so‘m</span> (aniq{" "}
              {compact(f.income.exactBase)}, taxminiy {compact(f.income.estimatedBase)})
            </p>
          </Card>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <Segmented value={incomeTab} onChange={setIncomeTab} options={STATUS_TABS} />
            </div>
            <Button
              type="button"
              className="w-full shrink-0 sm:w-auto"
              onClick={() => {
                setEditingIncome(null);
                setSheet("income");
              }}
            >
              ➕ Kutilayotgan daromad
            </Button>
          </div>

          {incomeTab === "open" ? (
            activeIncomePlans.length || pausedIncomePlans.length ? (
              <div className="space-y-3">
                {activeIncomePlans.map((i) => (
                  <IncomePlanCard key={i.id} plan={i} onAction={handleIncomeAction} onMenu={setMenuIncome} />
                ))}
                {pausedIncomePlans.length ? (
                  <>
                    <SectionLabel>Pauzadagi rejalar · {pausedIncomePlans.length} ta</SectionLabel>
                    {pausedIncomePlans.map((i) => (
                      <IncomePlanCard key={i.id} plan={i} onAction={handleIncomeAction} onMenu={setMenuIncome} />
                    ))}
                  </>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon="💰"
                title="Faol daromad rejasi yo‘q"
                description="Keladigan daromadlarni kiritib prognoz aniqligini oshiring — cash-flow ularni hisobga oladi."
                action={
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingIncome(null);
                      setSheet("income");
                    }}
                  >
                    ➕ Daromad rejasi qo‘shish
                  </Button>
                }
              />
            )
          ) : tabbedIncomePlans && tabbedIncomePlans.length ? (
            <div className="space-y-3">
              {tabbedIncomePlans.map((i) => (
                <IncomePlanCard key={i.id} plan={i} onAction={handleIncomeAction} onMenu={setMenuIncome} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={incomeTab === "cancelled" ? "🚫" : incomeTab === "completed" ? "🏁" : "❚❚"}
              title={
                incomeTab === "paused"
                  ? "Pauzadagi daromad rejasi yo‘q"
                  : incomeTab === "completed"
                    ? "Yakunlangan daromad rejasi yo‘q"
                    : "Bekor qilingan daromad rejasi yo‘q"
              }
              description={
                incomeTab === "paused"
                  ? "Pauzadagi daromad prognozga qo‘shilmaydi."
                  : incomeTab === "completed"
                    ? "Muddatli daromad barcha qabullari tugagach shu yerga tushadi."
                    : "Bekor qilish faqat kelajakdagi qabullarni to‘xtatadi — tarix saqlanadi."
              }
              action={
                <Button type="button" variant="secondary" onClick={() => setIncomeTab("open")}>
                  Faol rejalarga qaytish
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      {tab === "cashflow" ? (
        <CashflowTab
          forecast={f}
          monthLabel={state.monthly?.find((m) => m.monthKey === cashMonth)?.label ?? cashMonth}
          cashMonth={cashMonth}
          setCashMonth={setCashMonth}
        />
      ) : null}

      <RecurringSheet open={sheet === "recurring"} onClose={closeSheet} editing={editing} />
      <IncomeSheet open={sheet === "income"} onClose={closeSheet} editing={editingIncome} />

      <PlanActionsSheet
        plan={
          menuPlan
            ? {
                title: menuPlan.name,
                status: menuPlan.status,
                paymentsCount: menuPlan.paymentsCount,
                onEdit: () => handlePlanAction("edit", menuPlan),
                onToggle: () => handlePlanAction("toggle", menuPlan),
                onCancel: () => handlePlanAction("cancel", menuPlan),
                onHistory: () => handlePlanAction("history", menuPlan),
              }
            : menuIncome
              ? {
                  title: menuIncome.sourceName,
                  status: menuIncome.status,
                  paymentsCount: menuIncome.receiptsCount,
                  onEdit: () => handleIncomeAction("edit", menuIncome),
                  onToggle: () => handleIncomeAction("toggle", menuIncome),
                  onCancel: () => handleIncomeAction("cancel", menuIncome),
                  onHistory: () => handleIncomeAction("history", menuIncome),
                }
              : null
        }
        onClose={() => {
          setMenuPlan(null);
          setMenuIncome(null);
        }}
      />

      <CancelPlanConfirm
        target={
          deletingPlan
            ? { entity: "recurring" as const, id: deletingPlan.id, name: deletingPlan.name }
            : deletingIncome
              ? { entity: "expectedIncome" as const, id: deletingIncome.id, name: deletingIncome.sourceName }
              : null
        }
        onClose={() => {
          setDeletingPlan(null);
          setDeletingIncome(null);
        }}
      />

      <RestorePlanConfirm
        target={
          restoringPlan
            ? {
                entity: "recurring" as const,
                id: restoringPlan.id,
                name: restoringPlan.name,
                nextDate: restoringPlan.nextOccurrenceDate,
                amount: restoringPlan.baseAmount,
                frequency: restoringPlan.frequency,
                planType: restoringPlan.planType,
                remaining: restoringPlan.remainingInstallments,
              }
            : restoringIncome
              ? {
                  entity: "expectedIncome" as const,
                  id: restoringIncome.id,
                  name: restoringIncome.sourceName,
                  nextDate: restoringIncome.nextOccurrenceDate,
                  amount: restoringIncome.baseAmount,
                  frequency: restoringIncome.frequency,
                  planType: restoringIncome.planType,
                  remaining: restoringIncome.remainingOccurrences,
                }
              : null
        }
        onClose={() => {
          setRestoringPlan(null);
          setRestoringIncome(null);
        }}
      />
    </div>
  );
}

/* ============================ Building blocks ============================ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</p>
  );
}

/**
 * "BU OY" — the primary card of the page (§28/§29). It answers the three
 * questions of monthly planning in one glance: how much is due this month, how
 * much of it is already paid, what is still open, and what is next.
 */
function MonthLoadCard({
  month,
  nearest,
}: {
  month: {
    label: string;
    mandatoryTotal: number;
    optionalTotal: number;
    paid: number;
    paidMandatory: number;
    remaining: number;
    remainingMandatory: number;
    progress: number;
    remainingCount: number;
    paidCount: number;
    overdueCount: number;
    overdueAmount: number;
  };
  nearest: {
    id: number;
    name: string;
    date: string;
    daysLeft: number;
    base: number;
    mandatory: boolean;
    status: "overdue" | "today" | "upcoming";
  } | null;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Bu oy · {month.label}</p>
          <div className="mt-1">
            <Money value={month.mandatoryTotal} size="xl" />
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted">majburiy yuk</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Ixtiyoriy</p>
          <p className="num mt-1 text-[15px] font-semibold">{compact(month.optionalTotal)}</p>
        </div>
      </div>

      <div>
        <Progress value={month.progress} tone="accent" height={8} />
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[12px] text-muted">
            To‘langan: <span className="num font-semibold text-positive-text">{formatAmount(month.paid)}</span>
            {month.paidCount ? <span className="text-muted"> · {month.paidCount} ta</span> : null}
          </p>
          <p className="text-[12px] text-muted">
            Qolgan: <span className="num font-semibold text-fg">{formatAmount(month.remaining)}</span>
            {month.remainingCount ? <span className="text-muted"> · {month.remainingCount} ta</span> : null}
          </p>
        </div>
      </div>

      {month.overdueCount ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-negative-soft px-3.5 py-2.5">
          <p className="min-w-0 text-[12.5px] font-semibold text-negative-text">
            🔴 {month.overdueCount} ta kechikkan to‘lov
          </p>
          <span className="num shrink-0 text-[13px] font-semibold text-negative-text">
            {compact(month.overdueAmount)}
          </span>
        </div>
      ) : null}

      <div className="border-t border-line pt-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Eng yaqin to‘lov</p>
        {nearest ? (
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold">{nearest.name}</p>
              <p
                className={`mt-0.5 text-[12px] font-medium ${
                  nearest.status === "overdue" ? "text-negative-text" : nearest.status === "today" ? "text-warning-text" : "text-muted"
                }`}
              >
                {dayMonth(nearest.date)} · {relativeDayShort(nearest.daysLeft)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Money value={nearest.base} size="md" tone={nearest.status === "overdue" ? "negative" : "default"} />
              <p className="mt-0.5 text-[11px] text-muted">{nearest.mandatory ? "majburiy" : "ixtiyoriy"}</p>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-[13px] text-muted">Bu oyda ochiq to‘lov qolmadi. 🎉</p>
        )}
      </div>
    </Card>
  );
}

/** Metric with a label, a value and one short line of context (§5). */
function StatCard({
  label,
  value,
  context,
  tone = "default",
  plain,
}: {
  label: string;
  value: number;
  context?: string;
  tone?: "default" | "positive" | "muted";
  plain?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <div className="mt-1 min-w-0">
        {plain ? (
          <p className="num text-lg font-semibold">{value}</p>
        ) : (
          // Long UZS amounts must wrap instead of pushing the grid sideways (§5/§33).
          <p className={`num break-words text-[15px] font-semibold leading-tight sm:text-base ${TONE_TEXT_STAT[tone]}`}>
            {formatAmount(value)}
          </p>
        )}
      </div>
      {context ? <p className="mt-0.5 truncate text-[11px] text-muted">{context}</p> : null}
    </div>
  );
}

/* ============================ Payment plan card ============================ */

/**
 * One payment plan (§6/§7/§8). Structure is fixed for every status:
 *   TOP    — name + lifecycle status
 *   MIDDLE — amount, exact date + human relative date, cadence, progress
 *   BOTTOM — exactly ONE primary action + a "•••" menu + history link
 * Four competing buttons per row are never rendered.
 */
function PaymentPlanCard({
  plan: r,
  onAction,
  onMenu,
}: {
  plan: RecurringView;
  onAction: (action: PlanRowAction, plan: RecurringView) => void;
  onMenu: (plan: RecurringView) => void;
}) {
  const status = r.status;
  const meta = STATUS_META[status];
  const due = dueMeta({ ...r, lastEventDate: r.lastPaymentDate }, r.nextDueDate);
  const isTerm = r.planType === "term";
  const total = r.installmentCount ?? 0;
  const progress = isTerm && total > 0 ? r.installmentsPaid / total : 0;

  return (
    <Card className={`space-y-3 ${due.overdue ? "border-negative/40" : ""}`}>
      {/* TOP: what is it, and in which lifecycle state */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{r.name}</p>
          <p className="mt-1 truncate text-[11.5px] text-muted">
            {r.categoryName ?? "kategoriya yo‘q"}
            {r.planType === "recurring" ? ` · ${frequencyLabel(r.frequency)} · ${r.dueDay}-sana` : ""}
            {r.planType === "one_time" ? " · Bir martalik" : ""}
            {isTerm ? ` · ${frequencyLabel(r.frequency)}` : ""}
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {/* MIDDLE: how much, when */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          {r.certainty === "estimated" && r.minAmount && r.maxAmount ? (
            <p className="num text-lg font-semibold sm:text-xl">
              {compact(r.minAmount)}–{compact(r.maxAmount)}
            </p>
          ) : (
            <Money value={r.baseAmount} size="lg" tone={due.overdue ? "negative" : "default"} />
          )}
          <span className="ml-1 text-[11.5px] text-muted">so‘m</span>
        </div>
        <p className={`text-[12.5px] font-medium ${TONE_TEXT[due.tone]}`}>
          {due.overdue ? "🔴 Kechikkan · " : ""}
          {due.text}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone={r.isMandatory ? "negative" : "neutral"}>{r.isMandatory ? "Majburiy" : "Ixtiyoriy"}</Badge>
        {r.certainty === "estimated" ? <Badge tone="warning">Taxminiy</Badge> : null}
        {status === "active" && r.paidThisMonth ? <Badge tone="positive">✓ Bu oy to‘langan</Badge> : null}
      </div>

      {/* Term progress (§19) — a bar answers "how much is left" instantly. */}
      {isTerm ? (
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-semibold">
              {r.installmentsPaid} / {total} to‘lov
            </span>
            <span className="num text-muted">{Math.round(progress * 100)}%</span>
          </div>
          <Progress value={progress} tone="accent" height={6} />
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
            {status === "completed"
              ? `Jami to‘langan: ${formatAmount(r.planTotal ?? 0)} so‘m`
              : status === "cancelled"
                ? `Reja jami: ${formatAmount(r.planTotal ?? 0)} so‘m · qolgan to‘lovlar bekor qilindi`
                : `Qolgan: ${formatAmount(r.remainingTotal ?? 0)} so‘m · ${r.remainingInstallments ?? 0} ta to‘lov`}
          </p>
        </div>
      ) : r.planType === "recurring" && status !== "cancelled" ? (
        <p className="text-[11.5px] text-muted">
          Yillik yuklama: <span className="num font-medium text-fg-soft">{formatAmount(r.yearlyTotal)}</span> so‘m
        </p>
      ) : null}

      {status === "paused" ? (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-[11.5px] leading-snug text-warning-text">
          Kelajakdagi to‘lovlar vaqtincha to‘xtatilgan — prognoz va oylik yukka qo‘shilmaydi.
        </p>
      ) : null}
      {status === "cancelled" ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[11.5px] leading-snug text-muted">
          Kelajakdagi to‘lovlar bekor qilingan. Tarixdagi haqiqiy to‘lovlar saqlanadi.
        </p>
      ) : null}

      {/* BOTTOM: history link, then exactly ONE primary action + more menu.
          The link owns its own line so a long CTA label can never collide with
          it at 320px (§33). */}
      <div className="space-y-2 border-t border-line pt-3">
        {r.paymentsCount ? (
          <button type="button" className={`${LINK_BTN} -ml-2`} onClick={() => onAction("history", r)}>
            🧾 {r.paymentsCount} ta to‘lov · tarixni ko‘rish
          </button>
        ) : null}
        <div className="flex items-center gap-2">
          {status === "active" ? (
            <Button variant="positive" className="min-w-0 flex-1" onClick={() => onAction("pay", r)}>
              To‘landi
            </Button>
          ) : status === "paused" ? (
            <Button variant="secondary" className="min-w-0 flex-1" onClick={() => onAction("toggle", r)}>
              Yoqish
            </Button>
          ) : status === "cancelled" ? (
            <Button variant="secondary" className="min-w-0 flex-1" onClick={() => onAction("restore", r)}>
              Qayta faollashtirish
            </Button>
          ) : (
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted">Reja yakunlangan — yangi to‘lov yo‘q.</p>
          )}
          <button type="button" className={ICON_BTN} aria-label={`${r.name} — boshqa amallar`} onClick={() => onMenu(r)}>
            •••
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Expected income — deliberately the SAME card system as payments (§30). */
function IncomePlanCard({
  plan: i,
  onAction,
  onMenu,
}: {
  plan: ExpectedIncomeView;
  onAction: (action: IncomeRowAction, plan: ExpectedIncomeView) => void;
  onMenu: (plan: ExpectedIncomeView) => void;
}) {
  const status = i.status;
  const meta = STATUS_META[status];
  const due = dueMeta({ ...i, lastEventDate: i.lastReceiptDate }, i.expectedDate);
  const isTerm = i.planType === "term";
  const total = i.occurrenceCount ?? 0;
  const progress = isTerm && total > 0 ? i.occurrencesReceived / total : 0;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{i.sourceName}</p>
          <p className="mt-1 truncate text-[11.5px] text-muted">
            {frequencyLabel(i.frequency)}
            {i.planType === "one_time" ? " · Bir martalik" : ""}
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          {i.certainty === "estimated" && i.minAmount && i.maxAmount ? (
            <p className="num text-lg font-semibold text-positive-text sm:text-xl">
              {compact(i.minAmount)}–{compact(i.maxAmount)}
            </p>
          ) : (
            <Money value={i.baseAmount} size="lg" tone="positive" />
          )}
          <span className="ml-1 text-[11.5px] text-muted">so‘m</span>
        </div>
        <p className={`text-[12.5px] font-medium ${TONE_TEXT[due.tone]}`}>
          {due.overdue ? "⏳ Kutilmoqda · " : ""}
          {due.text}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {i.certainty === "estimated" ? <Badge tone="warning">Taxminiy</Badge> : <Badge tone="accent">Aniq</Badge>}
        {status === "active" && i.received ? <Badge tone="positive">✓ Bu oy qabul qilindi</Badge> : null}
      </div>

      {isTerm ? (
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-semibold">
              {i.occurrencesReceived} / {total} qabul
            </span>
            <span className="num text-muted">{Math.round(progress * 100)}%</span>
          </div>
          <Progress value={progress} tone="accent" height={6} />
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
            {status === "completed"
              ? `Jami qabul qilindi: ${formatAmount(i.planTotal ?? 0)} so‘m`
              : `Reja jami: ${formatAmount(i.planTotal ?? 0)} so‘m · qolgan ${i.remainingOccurrences ?? 0} ta`}
          </p>
        </div>
      ) : null}

      {status === "paused" ? (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-[11.5px] leading-snug text-warning-text">
          Kelajakdagi qabullar vaqtincha to‘xtatilgan — prognozga qo‘shilmaydi.
        </p>
      ) : null}

      <div className="space-y-2 border-t border-line pt-3">
        {i.receiptsCount ? (
          <button type="button" className={`${LINK_BTN} -ml-2`} onClick={() => onAction("history", i)}>
            🧾 {i.receiptsCount} ta qabul · tarixni ko‘rish
          </button>
        ) : null}
        <div className="flex items-center gap-2">
          {status === "active" ? (
            <Button variant="positive" className="min-w-0 flex-1" onClick={() => onAction("receive", i)}>
              Qabul
            </Button>
          ) : status === "paused" ? (
            <Button variant="secondary" className="min-w-0 flex-1" onClick={() => onAction("toggle", i)}>
              Yoqish
            </Button>
          ) : status === "cancelled" ? (
            <Button variant="secondary" className="min-w-0 flex-1" onClick={() => onAction("restore", i)}>
              Qayta faollashtirish
            </Button>
          ) : (
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted">Reja yakunlangan — yangi qabul yo‘q.</p>
          )}
          <button
            type="button"
            className={ICON_BTN}
            aria-label={`${i.sourceName} — boshqa amallar`}
            onClick={() => onMenu(i)}
          >
            •••
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ============================ Secondary actions ============================ */

type MenuTarget = {
  title: string;
  status: PlanLifecycle;
  paymentsCount: number;
  onEdit: () => void;
  onToggle: () => void;
  onCancel: () => void;
  onHistory: () => void;
};

/**
 * The "•••" sheet (§7). Secondary actions live here so each card shows exactly
 * one primary CTA. Which entries appear is derived from lifecycle status only:
 * a cancelled plan cannot be paused, a completed plan cannot be cancelled.
 */
function PlanActionsSheet({ plan, onClose }: { plan: MenuTarget | null; onClose: () => void }) {
  function run(action: () => void) {
    onClose();
    action();
  }
  const rowClass =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[14px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-3 touch-manipulation";
  return (
    <Sheet open={Boolean(plan)} onClose={onClose} title={plan?.title ?? ""}>
      <div className="-mx-1.5 space-y-0.5">
        {plan?.status === "active" || plan?.status === "paused" ? (
          <button type="button" className={rowClass} onClick={() => plan && run(plan.onToggle)}>
            <span className="w-6 text-center">{plan.status === "active" ? "❚❚" : "▶"}</span>
            {plan.status === "active" ? "Pauza qilish" : "Yoqish"}
          </button>
        ) : null}
        <button type="button" className={rowClass} onClick={() => plan && run(plan.onEdit)}>
          <span className="w-6 text-center">✏️</span>
          Tahrirlash
        </button>
        {plan?.paymentsCount ? (
          <button type="button" className={rowClass} onClick={() => plan && run(plan.onHistory)}>
            <span className="w-6 text-center">🧾</span>
            Tarixni ko‘rish ({plan.paymentsCount} ta)
          </button>
        ) : null}
        {plan?.status === "active" || plan?.status === "paused" ? (
          <button
            type="button"
            className={`${rowClass} text-negative-text`}
            onClick={() => plan && run(plan.onCancel)}
          >
            <span className="w-6 text-center">🚫</span>
            Rejani bekor qilish
          </button>
        ) : null}
      </div>
      {plan?.status === "completed" ? (
        <p className="mt-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
          Bu reja yakunlangan. Uni bekor qilish yoki pauzaga o‘tkazish kerak emas — kelajakdagi to‘lovlar allaqachon yo‘q.
        </p>
      ) : null}
      {plan?.status === "cancelled" ? (
        <p className="mt-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
          Bu reja bekor qilingan. Qaytarish uchun kartadagi «Qayta faollashtirish» tugmasidan foydalaning.
        </p>
      ) : null}
    </Sheet>
  );
}

type CancelTarget = { entity: "recurring" | "expectedIncome"; id: number; name: string };

/**
 * Plan cancellation confirmation (§25). Cancelling stops FUTURE occurrences
 * only: real historical transactions always survive and balances are never
 * rewritten — the wording says exactly that, and the action is never called
 * "O‘chirish".
 */
function CancelPlanConfirm({ target, onClose }: { target: CancelTarget | null; onClose: () => void }) {
  const { mutate } = useFinance();
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!target || saving) return;
    setSaving(true);
    try {
      await mutate(target.entity, "delete", { id: target.id });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  const isIncome = target?.entity === "expectedIncome";

  return (
    <Sheet
      open={Boolean(target)}
      onClose={onClose}
      title="Rejani bekor qilish"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="danger" className="flex-[2]" onClick={confirm} disabled={saving}>
            {saving ? "Bekor qilinmoqda…" : "Rejani bekor qilish"}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed">
        <span className="font-semibold">{target?.name}</span> rejasini bekor qilasizmi?
      </p>
      <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
        <li>• Kelajakdagi {isIncome ? "qabullar" : "to‘lovlar"} to‘xtatiladi.</li>
        <li>• Tarixdagi haqiqiy {isIncome ? "daromadlar" : "to‘lovlar"} saqlanadi.</li>
        <li>• Bu amal balansdagi tarixiy summalarni o‘zgartirmaydi.</li>
        <li>• Rejani keyinroq «Qayta faollashtirish» orqali qaytarish mumkin.</li>
      </ul>
    </Sheet>
  );
}

type RestoreTarget = {
  entity: "recurring" | "expectedIncome";
  id: number;
  name: string;
  nextDate: string;
  amount: number;
  frequency: string;
  planType: "one_time" | "recurring" | "term";
  remaining: number | null;
};

/**
 * Reactivation preview (§26). A cancelled plan is never revived on a silently
 * outdated schedule: the exact date it will resume on — the same date the
 * server re-anchors it to — is shown BEFORE the user confirms.
 */
function RestorePlanConfirm({ target, onClose }: { target: RestoreTarget | null; onClose: () => void }) {
  const { mutate } = useFinance();
  const [saving, setSaving] = useState(false);
  const isIncome = target?.entity === "expectedIncome";

  async function confirm() {
    if (!target || saving) return;
    setSaving(true);
    try {
      await mutate(target.entity, "restore", { id: target.id });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <Sheet
      open={Boolean(target)}
      onClose={onClose}
      title="Rejani qayta faollashtirish"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={confirm} disabled={saving}>
            {saving ? "Faollashtirilmoqda…" : "Qayta faollashtirish"}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed">
        <span className="font-semibold">{target?.name}</span> rejasini shu jadval bilan qayta faollashtirasizmi?
      </p>
      {target ? (
        <div className="space-y-2.5 rounded-xl bg-surface-2 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-muted">Keyingi {isIncome ? "qabul" : "to‘lov"}</span>
            <span className="text-[13.5px] font-semibold">{humanDate(target.nextDate)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-muted">Summa</span>
            <Money value={target.amount} size="sm" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-muted">Takrorlanish</span>
            <span className="text-[13px] font-medium">{frequencyLabel(target.frequency)}</span>
          </div>
          {target.planType === "term" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-muted">Qolgan</span>
              <span className="text-[13px] font-medium">{target.remaining ?? 0} ta</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="text-[12.5px] leading-relaxed text-muted">
        Eskirgan sana tiklanmaydi — reja bugundan keyingi birinchi haqiqiy sanadan davom etadi.
      </p>
    </Sheet>
  );
}

/* ============================ Cash-flow ============================ */

/**
 * Cash-flow tab (§31/§32). It opens on the CURRENT month and must answer one
 * question: "qachon pulim kamayadi?" — hence opening balance, in/out split,
 * mandatory load, expected income, projected closing balance, then the chart,
 * then the dates that actually matter.
 */
function CashflowTab({
  forecast,
  monthLabel,
  cashMonth,
  setCashMonth,
}: {
  forecast: Forecast;
  monthLabel: string;
  cashMonth: string;
  setCashMonth: (mk: string) => void;
}) {
  const today = forecast.today;
  const current = monthKey(today);
  const days = monthCashflow(forecast.cashflow, cashMonth);
  const items = monthPlanned(forecast.planned, cashMonth);
  const risks = forecast.riskDates.filter((r) => monthKey(r.date) === cashMonth);

  const first = days[0];
  const last = days[days.length - 1];
  const opening = first ? first.projectedBase - first.net : 0;
  const closing = last ? last.projectedBase : opening;
  const inflow = days.reduce((s, d) => s + d.inflow, 0);
  const outflow = days.reduce((s, d) => s + d.outflow, 0);
  const mandatory = items.filter((p) => p.kind === "expense" && p.mandatory).reduce((s, p) => s + p.base, 0);
  const expectedIncome = items.filter((p) => p.kind === "income").reduce((s, p) => s + p.base, 0);
  const chartData = days.map((d) => ({ ...d, actual: d.date <= today }));
  const isCurrent = cashMonth === current;

  return (
    <div className="space-y-3.5 sm:space-y-4">
      <Card className="space-y-4">
        {/* Month navigation first (§31) */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCashMonth(monthKey(addMonths(monthStart(cashMonth), -1)))}
            className={ICON_BTN}
            aria-label="Oldingi oy"
            disabled={cashMonth <= current}
          >
            ‹
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-[15px] font-semibold">{monthLabel}</p>
            <p className="mt-0.5 text-[11px] text-muted">{isCurrent ? "joriy oy" : "kelajak oy"}</p>
          </div>
          <button
            type="button"
            onClick={() => setCashMonth(monthKey(addMonths(monthStart(cashMonth), 1)))}
            className={ICON_BTN}
            aria-label="Keyingi oy"
          >
            ›
          </button>
        </div>

        {days.length ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <StatCard label={isCurrent ? "Bugungi balans" : "Boshlang‘ich balans"} value={opening} context="oy boshidagi holat" />
              <StatCard label="Kirim" value={inflow} context="rejalashtirilgan" tone="positive" />
              <StatCard label="Chiqim" value={outflow} context="rejalashtirilgan" />
              <StatCard label="Majburiy" value={mandatory} context="to‘lash shart" />
              <StatCard label="Kutilayotgan" value={expectedIncome} context="daromad rejalari" tone="positive" />
              <StatCard label="Oy oxiri prognoz" value={closing} context={closing < 0 ? "manfiy — xavf bor" : "prognoz balans"} />
            </div>

            <div>
              <ForecastArea data={chartData} />
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--fg)" }} /> real
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded border-b border-dashed" style={{ borderColor: "var(--accent)" }} />{" "}
                  prognoz
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--negative)" }} /> xavf
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border-t border-line pt-3">
              <CashFlowStrip data={days} />
            </div>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">
            Bu oy prognoz oynasidan tashqarida ({forecast.horizonDays} kunlik gorizont). Joriy oyga qayting.
          </p>
        )}
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-semibold">Muhim sanalar · {monthLabel}</p>
        {items.length ? (
          <div className="divide-y divide-line">
            {items.map((p) => (
              <div key={p.key} className="flex items-center gap-2.5 py-2.5">
                <span className="num w-14 shrink-0 text-[11.5px] text-muted sm:w-16 sm:text-[12px]">{shortDate(p.date)}</span>
                <span className={`shrink-0 text-sm font-medium ${p.kind === "income" ? "text-positive-text" : "text-fg"}`}>
                  {p.kind === "income" ? "+" : "−"}
                  {compact(p.base)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] sm:text-[13.5px]">{p.label}</span>
                <span className="shrink-0">
                  <Badge tone={p.mandatory ? "negative" : p.kind === "income" ? "positive" : "neutral"}>
                    {p.mandatory ? "majburiy" : p.kind === "income" ? (p.certainty === "estimated" ? "taxminiy" : "aniq") : "ixtiyoriy"}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">Bu oyda rejalashtirilgan hodisa yo‘q.</p>
        )}
      </Card>

      <Card>
        <p className="mb-2 text-[15px] font-semibold">⚠️ Xavf kunlari · {monthLabel}</p>
        {risks.length ? (
          <div className="space-y-2">
            {risks.slice(0, 8).map((r) => (
              <div key={r.date} className="flex items-center justify-between gap-3 rounded-xl bg-negative-soft px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-negative-text">{shortDate(r.date)}</p>
                  <p className="truncate text-[11.5px] text-negative-text/80">{r.cause}</p>
                </div>
                <span className="num shrink-0 text-[13px] font-semibold text-negative-text">−{compact(r.deficit)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">
            Bu oyda pul yetishmasligi xavfi aniqlanmadi (butun {forecast.horizonDays} kunlik prognoz tekshirildi).
          </p>
        )}
      </Card>
    </div>
  );
}

/* ============================ Forms ============================ */

type PlanTypeValue = "one_time" | "recurring" | "term";

function parseMoney(value: string): number | null {
  const raw = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Payment-plan form (§20/§21/§22/§23/§24). Only the fields that belong to the
 * chosen plan type are rendered, every rule is validated inline with a specific
 * message (never a generic "Xatolik"), and a live preview shows exactly what
 * the plan will cost before saving.
 */
function RecurringSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: RecurringView | null;
}) {
  const { state, mutate } = useFinance();
  const [name, setName] = useState("");
  const [certainty, setCertainty] = useState<"exact" | "estimated">("exact");
  const [amount, setAmount] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [nextDueDate, setNextDueDate] = useState(todayISO());
  const [frequency, setFrequency] = useState("monthly");
  const [planType, setPlanType] = useState<PlanTypeValue>("recurring");
  const [installmentCount, setInstallmentCount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isMandatory, setIsMandatory] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setSaving(false);
      setTouched(false);
      setName(editing?.name ?? "");
      setCertainty(editing?.certainty ?? "exact");
      setAmount(editing?.amount ? String(editing.amount) : "");
      setMin(editing?.minAmount ? String(editing.minAmount) : "");
      setMax(editing?.maxAmount ? String(editing.maxAmount) : "");
      setNextDueDate(editing?.nextDueDate ?? todayISO());
      setFrequency(editing?.frequency && editing.frequency !== "once" ? editing.frequency : "monthly");
      setPlanType(editing?.planType ?? "recurring");
      setInstallmentCount(editing?.installmentCount ? String(editing.installmentCount) : "");
      setCategoryId(editing?.categoryId ? String(editing.categoryId) : "");
      setAccountId(editing?.accountId ? String(editing.accountId) : "");
      setIsMandatory(editing?.isMandatory ?? true);
      setIsActive(editing?.isActive ?? true);
    }
  }, [open, editing]);

  const categories = (state?.flatCategories ?? []).filter((c) => c.type === "expense" && c.isActive);
  const paidCount = editing?.installmentsPaid ?? 0;

  // §23/§24: field-level validation, mirroring the server rules exactly.
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Reja nomini kiriting.";
    if (certainty === "exact") {
      const value = parseMoney(amount);
      if (value === null) e.amount = "Summani kiriting.";
      else if (value <= 0) e.amount = "Summa 0 dan katta bo‘lishi kerak.";
    } else {
      const lo = parseMoney(min);
      const hi = parseMoney(max);
      if (lo === null || lo <= 0) e.min = "Minimal summani kiriting.";
      if (hi === null || hi <= 0) e.max = "Maksimal summani kiriting.";
      if (lo !== null && hi !== null && lo > hi) e.max = "Maksimal summa minimaldan kichik bo‘lmasligi kerak.";
    }
    if (!nextDueDate) e.date = "Sanani tanlang.";
    if (planType === "term") {
      const count = Number(installmentCount);
      if (!installmentCount.trim()) e.installments = "Bo‘lib to‘lashlar sonini kiriting.";
      else if (!Number.isInteger(count) || count < 1 || count > 600) e.installments = "1 dan 600 gacha butun son kiriting.";
      else if (count < paidCount) e.installments = `Allaqachon ${paidCount} ta to‘langan — sonni kamaytirib bo‘lmaydi.`;
    }
    return e;
  }, [name, certainty, amount, min, max, nextDueDate, planType, installmentCount, paidCount]);

  const invalid = Object.keys(errors).length > 0;
  const showError = (key: string) => (touched ? errors[key] ?? null : null);

  const baseAmount = certainty === "exact" ? parseMoney(amount) ?? 0 : ((parseMoney(min) ?? 0) + (parseMoney(max) ?? 0)) / 2;
  const termCount = Number(installmentCount) || 0;
  const annualFactor = frequency === "weekly" ? 52 : frequency === "yearly" ? 1 : 12;

  async function save() {
    setTouched(true);
    if (invalid || saving) return;
    setSaving(true);
    try {
      const day = Math.min(28, Math.max(1, Number(nextDueDate.slice(8, 10)) || 1));
      const res = await mutate("recurring", editing ? "update" : "create", {
        id: editing?.id,
        name: name.trim(),
        certainty,
        amount: certainty === "exact" ? amount : null,
        minAmount: certainty === "estimated" ? min : null,
        maxAmount: certainty === "estimated" ? max : null,
        dueDay: day,
        nextDueDate,
        frequency: planType === "one_time" ? "once" : frequency,
        planType,
        installmentCount: planType === "term" ? Number(installmentCount) || null : null,
        categoryId: categoryId ? Number(categoryId) : null,
        accountId: accountId ? Number(accountId) : null,
        isMandatory,
        isActive,
      });
      if (res.ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  const lockedLifecycle = editing && (editing.status === "cancelled" || editing.status === "completed");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "To‘lov rejasini tahrirlash" : "To‘lov rejasi qo‘shish"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={save} disabled={saving || (touched && invalid)}>
            {saving ? "Saqlanmoqda…" : editing ? "Yangilash" : "Saqlash"}
          </Button>
        </>
      }
    >
      <Field label="Nomi" error={showError("name")}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ijara / Elektr / Kredit" />
      </Field>

      <Field label="To‘lov turi">
        <Segmented
          value={planType}
          onChange={setPlanType}
          options={[
            { value: "one_time", label: "Bir martalik" },
            { value: "recurring", label: "Doimiy" },
            { value: "term", label: "Muddatli" },
          ]}
        />
      </Field>

      <Field label="Summa turi">
        <Segmented
          value={certainty}
          onChange={(value) => {
            setCertainty(value);
            if (value === "exact") {
              setMin("");
              setMax("");
            } else {
              setAmount("");
            }
          }}
          options={[
            { value: "exact", label: "Aniq summa" },
            { value: "estimated", label: "Taxminiy diapazon" },
          ]}
        />
      </Field>

      {certainty === "exact" ? (
        <Field label="Summa" error={showError("amount")}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="2500000" />
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <Field label="Minimal" error={showError("min")}>
            <TextInput value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="300000" />
          </Field>
          <Field label="Maksimal" error={showError("max")}>
            <TextInput value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="500000" />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label={planType === "one_time" ? "To‘lov sanasi" : "Keyingi to‘lov sanasi"} error={showError("date")}>
          <TextInput type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        </Field>
        {/* One-time plans have no cadence and no installment count (§22). */}
        {planType !== "one_time" ? (
          <Field label="To‘lov chastotasi">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="weekly">Har hafta</option>
              <option value="monthly">Har oy</option>
              <option value="yearly">Har yil</option>
            </Select>
          </Field>
        ) : null}
      </div>

      {planType === "term" ? (
        <Field
          label="Bo‘lib to‘lashlar soni"
          error={showError("installments")}
          hint={paidCount ? `Allaqachon ${paidCount} ta to‘langan — bu sondan kam qilib bo‘lmaydi.` : "Masalan, 12 oylik kredit uchun 12"}
        >
          <TextInput
            value={installmentCount}
            onChange={(e) => setInstallmentCount(e.target.value)}
            inputMode="numeric"
            placeholder="12"
          />
        </Field>
      ) : null}

      {/* Live preview — what this plan actually costs (§20/§21/§22). */}
      <div className="rounded-xl bg-surface-2 px-3.5 py-3">
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Ko‘rinishi</p>
        {planType === "term" ? (
          <div className="space-y-1 text-[13px]">
            <p className="num font-semibold">
              {termCount || 0} × {formatAmount(baseAmount)} = {formatAmount(termCount * baseAmount)} so‘m
            </p>
            <p className="text-muted">
              {frequencyLabel(frequency)} · boshlanish {nextDueDate ? dayMonth(nextDueDate) : "—"} · qolgan{" "}
              {Math.max(0, termCount - paidCount)} ta
            </p>
          </div>
        ) : planType === "recurring" ? (
          <div className="space-y-1 text-[13px]">
            <p className="font-semibold">
              {frequencyLabel(frequency)} · {nextDueDate ? `${Number(nextDueDate.slice(8, 10))}-sana` : "—"}
            </p>
            <p className="num text-muted">Yillik: {formatAmount(baseAmount * annualFactor)} so‘m</p>
          </div>
        ) : (
          <div className="space-y-1 text-[13px]">
            <p className="font-semibold">Bir martalik · {nextDueDate ? humanDate(nextDueDate) : "—"}</p>
            <p className="num text-muted">{formatAmount(baseAmount)} so‘m · to‘langach yakunlanadi</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label="Turi">
          <Select value={isMandatory ? "1" : "0"} onChange={(e) => setIsMandatory(e.target.value === "1")}>
            <option value="1">Majburiy</option>
            <option value="0">Ixtiyoriy</option>
          </Select>
        </Field>
        {/* §13/§24: cancelled / completed plans are never reactivated by a
            normal Edit → Save — the server enforces it, and the form explains
            it instead of offering a misleading Faol/Pauza switch. */}
        {lockedLifecycle ? (
          <Field label="Holati">
            <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
              {editing?.status === "cancelled"
                ? "Bekor qilingan. Tahrirlash uni faollashtirmaydi — «Qayta faollashtirish» tugmasidan foydalaning."
                : "Yakunlangan. Tahrirlash uni qayta ochmaydi; bo‘lib to‘lashlar sonini oshirsangiz qolgan to‘lovlar davom etadi."}
            </p>
          </Field>
        ) : (
          <Field label="Holati">
            <Select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
              <option value="1">Faol</option>
              <option value="0">Pauza</option>
            </Select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label="Kategoriya">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanlanmagan</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hisob">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Standart</option>
            {(state?.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

/** Expected-income form — same validation and preview system as payments. */
function IncomeSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: ExpectedIncomeView | null;
}) {
  const { state, mutate } = useFinance();
  const [sourceName, setSourceName] = useState("");
  const [certainty, setCertainty] = useState<"exact" | "estimated">("exact");
  const [amount, setAmount] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [expectedDate, setExpectedDate] = useState(todayISO());
  const [frequency, setFrequency] = useState("monthly");
  const [planType, setPlanType] = useState<PlanTypeValue>("recurring");
  const [occurrenceCount, setOccurrenceCount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Initialize every field for the selected record. Opening a second record
    // cannot inherit any draft value from the first one.
    setSaving(false);
    setTouched(false);
    setSourceName(editing?.sourceName ?? "");
    setCertainty(editing?.certainty ?? "exact");
    setAmount(editing?.amount !== null && editing?.amount !== undefined ? String(editing.amount) : "");
    setMin(editing?.minAmount !== null && editing?.minAmount !== undefined ? String(editing.minAmount) : "");
    setMax(editing?.maxAmount !== null && editing?.maxAmount !== undefined ? String(editing.maxAmount) : "");
    setExpectedDate(editing?.expectedDate ?? todayISO());
    setFrequency(editing?.frequency && editing.frequency !== "once" ? editing.frequency : "monthly");
    setPlanType(editing?.planType ?? "recurring");
    setOccurrenceCount(editing?.occurrenceCount ? String(editing.occurrenceCount) : "");
    setCategoryId(editing?.categoryId ? String(editing.categoryId) : "");
    setAccountId(editing?.accountId ? String(editing.accountId) : "");
    setIsActive(editing?.isActive ?? true);
    setNote(editing?.note ?? "");
  }, [open, editing]);

  const categories = (state?.flatCategories ?? []).filter((c) => c.type === "income" && c.isActive);
  const accounts = (state?.accounts ?? []).filter((a) => a.isActive || a.id === editing?.accountId);
  const receivedCount = editing?.occurrencesReceived ?? 0;

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!sourceName.trim()) e.name = "Manba nomini kiriting.";
    if (certainty === "exact") {
      const value = parseMoney(amount);
      if (value === null) e.amount = "Summani kiriting.";
      else if (value <= 0) e.amount = "Summa 0 dan katta bo‘lishi kerak.";
    } else {
      const lo = parseMoney(min);
      const hi = parseMoney(max);
      if (lo === null || lo <= 0) e.min = "Minimal summani kiriting.";
      if (hi === null || hi <= 0) e.max = "Maksimal summani kiriting.";
      if (lo !== null && hi !== null && lo > hi) e.max = "Maksimal summa minimaldan kichik bo‘lmasligi kerak.";
    }
    if (!expectedDate) e.date = "Sanani tanlang.";
    if (planType === "term") {
      const count = Number(occurrenceCount);
      if (!occurrenceCount.trim()) e.occurrences = "Takrorlanishlar sonini kiriting.";
      else if (!Number.isInteger(count) || count < 1 || count > 600) e.occurrences = "1 dan 600 gacha butun son kiriting.";
      else if (count < receivedCount) e.occurrences = `Allaqachon ${receivedCount} ta qabul qilingan — sonni kamaytirib bo‘lmaydi.`;
    }
    return e;
  }, [sourceName, certainty, amount, min, max, expectedDate, planType, occurrenceCount, receivedCount]);

  const invalid = Object.keys(errors).length > 0;
  const showError = (key: string) => (touched ? errors[key] ?? null : null);
  const baseAmount = certainty === "exact" ? parseMoney(amount) ?? 0 : ((parseMoney(min) ?? 0) + (parseMoney(max) ?? 0)) / 2;
  const termCount = Number(occurrenceCount) || 0;

  async function save() {
    setTouched(true);
    if (invalid || saving) return;
    setSaving(true);
    try {
      const res = await mutate("expectedIncome", editing ? "update" : "create", {
        id: editing?.id,
        sourceName: sourceName.trim(),
        certainty,
        // Sending explicit nulls is intentional: switching modes clears stale
        // values in the opposite representation at the database boundary.
        amount: certainty === "exact" ? amount : null,
        minAmount: certainty === "estimated" ? min : null,
        maxAmount: certainty === "estimated" ? max : null,
        expectedDate,
        frequency: planType === "one_time" ? "once" : frequency,
        planType,
        occurrenceCount: planType === "term" ? Number(occurrenceCount) || null : null,
        categoryId: categoryId ? Number(categoryId) : null,
        accountId: accountId ? Number(accountId) : null,
        isActive,
        note: note.trim() || null,
      });
      if (res.ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  const lockedLifecycle = editing && (editing.status === "cancelled" || editing.status === "completed");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Kutilayotgan daromadni tahrirlash" : "Kutilayotgan daromad"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={save} disabled={saving || (touched && invalid)}>
            {saving ? "Saqlanmoqda…" : editing ? "Yangilash" : "Saqlash"}
          </Button>
        </>
      }
    >
      <Field label="Manba nomi" error={showError("name")}>
        <TextInput value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Ish haqi / Biznes daromadi" />
      </Field>

      <Field label="Daromad turi">
        <Segmented
          value={planType}
          onChange={setPlanType}
          options={[
            { value: "one_time", label: "Bir martalik" },
            { value: "recurring", label: "Doimiy" },
            { value: "term", label: "Muddatli" },
          ]}
        />
      </Field>

      <Field label="Summa turi">
        <Segmented
          value={certainty}
          onChange={(value) => {
            setCertainty(value);
            if (value === "exact") {
              setMin("");
              setMax("");
            } else {
              setAmount("");
            }
          }}
          options={[
            { value: "exact", label: "Aniq summa" },
            { value: "estimated", label: "Taxminiy diapazon" },
          ]}
        />
      </Field>

      {certainty === "exact" ? (
        <Field label="Summa" error={showError("amount")}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="8000000" />
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <Field label="Minimal summa" error={showError("min")}>
            <TextInput value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="3000000" />
          </Field>
          <Field label="Maksimal summa" error={showError("max")}>
            <TextInput value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="5000000" />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label="Kutilayotgan sana" error={showError("date")}>
          <TextInput type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Field>
        {planType !== "one_time" ? (
          <Field label="Takrorlanish">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="weekly">Har hafta</option>
              <option value="monthly">Har oy</option>
              <option value="yearly">Har yil</option>
            </Select>
          </Field>
        ) : null}
      </div>

      {planType === "term" ? (
        <Field
          label="Takrorlanishlar soni"
          error={showError("occurrences")}
          hint={receivedCount ? `Allaqachon ${receivedCount} ta qabul qilingan.` : "Masalan, 3 oylik kontrakt uchun 3"}
        >
          <TextInput
            value={occurrenceCount}
            onChange={(e) => setOccurrenceCount(e.target.value)}
            inputMode="numeric"
            placeholder="3"
          />
        </Field>
      ) : null}

      <div className="rounded-xl bg-surface-2 px-3.5 py-3">
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Ko‘rinishi</p>
        {planType === "term" ? (
          <p className="num text-[13px] font-semibold">
            {termCount || 0} × {formatAmount(baseAmount)} = {formatAmount(termCount * baseAmount)} so‘m
          </p>
        ) : planType === "recurring" ? (
          <p className="text-[13px] font-semibold">
            {frequencyLabel(frequency)} · <span className="num">{formatAmount(baseAmount)}</span> so‘m
          </p>
        ) : (
          <p className="text-[13px] font-semibold">
            Bir martalik · {expectedDate ? humanDate(expectedDate) : "—"} · <span className="num">{formatAmount(baseAmount)}</span> so‘m
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label="Kategoriya">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanlanmagan</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Qabul qiluvchi hisob">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Standart hisob</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {lockedLifecycle ? (
        <Field label="Holati">
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
            {editing?.status === "cancelled"
              ? "Bekor qilingan. Tahrirlash uni faollashtirmaydi — «Qayta faollashtirish» tugmasidan foydalaning."
              : "Yakunlangan. Tahrirlash uni qayta ochmaydi."}
          </p>
        </Field>
      ) : (
        <Field label="Holati">
          <Select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
            <option value="1">Faol</option>
            <option value="0">Pauza</option>
          </Select>
        </Field>
      )}

      <Field label="Izoh">
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ixtiyoriy" />
      </Field>
    </Sheet>
  );
}
