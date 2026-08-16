"use client";
/* eslint-disable react-hooks/set-state-in-effect -- planning form drafts synchronize to editing/open state */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CashFlowStrip, ForecastArea } from "@/components/charts";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { PlanStatusFilter } from "@/components/plan-status-filter";
import { MonthlyPlanSummary, SecondaryPlanMetrics } from "@/components/plan-summary";
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

  // Global FAB: the active tab decides the action — To'lovlar → payment plan,
  // Daromad → expected income, Cash-flow → no create action (§7/§8).
  useFabPage(
    { tab },
    {
      payment_plan: () => {
        setEditing(null);
        setSheet("recurring");
      },
      expected_income: () => {
        setEditingIncome(null);
        setSheet("income");
      },
    },
  );

  // A routed plan create opens the matching tab and reuses its existing sheet.
  const { consume } = useFab();
  useEffect(() => {
    const routed = consume();
    if (!routed) return;
    if (routed.id === "payment_plan") {
      setTab("payments");
      setEditing(null);
      setSheet("recurring");
    } else if (routed.id === "expected_income") {
      setTab("income");
      setEditingIncome(null);
      setSheet("income");
    }
  }, [consume]);

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
          {/* §28/§29: ONE monthly surface + ONE flat metrics strip — no nested cards. */}
          <MonthlyPlanSummary
            monthLabel={month.label}
            mandatory={month.mandatoryTotal}
            paid={month.paid}
            remaining={month.remaining}
            progress={month.progress}
            paidCount={month.paidCount}
            remainingCount={month.remainingCount}
            overdueCount={month.overdueCount}
            overdueAmount={month.overdueAmount}
            activeCount={activePlans.length}
            nearestPayment={nearest}
            onNearestClick={nearest ? () => router.push(`/transactions?plan=${nearest.id}`) : undefined}
          />

          {loadPlans.length ? (
            <SecondaryPlanMetrics
              optional={monthlyOptional}
              optionalCount={optionalCount}
              active={activePlans.length}
              pausedCount={pausedPlans.length}
              yearly={yearlyLoad}
              recurringCount={recurringPlans.length}
              termRemaining={termRemaining}
              termCount={termPlans.length}
            />
          ) : null}

          <div className="flex min-h-11 items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">To‘lovlar</h2>
            <PlanStatusFilter value={planTab} onChange={setPlanTab} kind="payments" />
          </div>

          {planTab === "open" ? (
            activePlans.length || pausedPlans.length ? (
              <div className="space-y-3">
                {activePlans.length ? (
                  <PlanRowList>
                    {activePlans.map((r) => (
                      <PaymentPlanRow key={r.id} plan={r} onAction={handlePlanAction} onMenu={setMenuPlan} />
                    ))}
                  </PlanRowList>
                ) : null}
                {pausedPlans.length ? (
                  <>
                    <SectionLabel>Pauzadagi rejalar · {pausedPlans.length} ta</SectionLabel>
                    <PlanRowList>
                      {pausedPlans.map((r) => (
                        <PaymentPlanRow key={r.id} plan={r} onAction={handlePlanAction} onMenu={setMenuPlan} />
                      ))}
                    </PlanRowList>
                  </>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon="📌"
                title="Faol reja yo‘q"
                description="Ijara, kommunal, kredit kabi takrorlanuvchi to‘lovlarni pastdagi + tugmasi orqali kiriting."
              />
            )
          ) : tabbedPlans && tabbedPlans.length ? (
            <PlanRowList>
              {tabbedPlans.map((r) => (
                <PaymentPlanRow key={r.id} plan={r} onAction={handlePlanAction} onMenu={setMenuPlan} />
              ))}
            </PlanRowList>
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

          <div className="flex min-h-11 items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">Daromad rejalari</h2>
            <PlanStatusFilter value={incomeTab} onChange={setIncomeTab} kind="income" />
          </div>

          {incomeTab === "open" ? (
            activeIncomePlans.length || pausedIncomePlans.length ? (
              <div className="space-y-3">
                {activeIncomePlans.length ? (
                  <PlanRowList>
                    {activeIncomePlans.map((i) => (
                      <IncomePlanRow key={i.id} plan={i} onAction={handleIncomeAction} onMenu={setMenuIncome} />
                    ))}
                  </PlanRowList>
                ) : null}
                {pausedIncomePlans.length ? (
                  <>
                    <SectionLabel>Pauzadagi rejalar · {pausedIncomePlans.length} ta</SectionLabel>
                    <PlanRowList>
                      {pausedIncomePlans.map((i) => (
                        <IncomePlanRow key={i.id} plan={i} onAction={handleIncomeAction} onMenu={setMenuIncome} />
                      ))}
                    </PlanRowList>
                  </>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon="💰"
                title="Faol daromad rejasi yo‘q"
                description="Keladigan daromadni pastdagi + tugmasi orqali kiriting — cash-flow uni hisobga oladi."
              />
            )
          ) : tabbedIncomePlans && tabbedIncomePlans.length ? (
            <PlanRowList>
              {tabbedIncomePlans.map((i) => (
                <IncomePlanRow key={i.id} plan={i} onAction={handleIncomeAction} onMenu={setMenuIncome} />
              ))}
            </PlanRowList>
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

/** Compact metric section: intentionally unframed so cards never nest. */
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
    <div className="min-w-0 px-1 py-1">
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

/* ============================ Payment plan rows ============================ */

/** ONE bordered container per list — rows inside carry no frame of their own (§17/§24). */
function PlanRowList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>;
}

/**
 * One payment plan as a LIGHTWEIGHT row (§17): name + amount, one meta line
 * (exact date · human distance · cadence/term), a thin term progress when
 * relevant, then exactly ONE primary action + "•••". Payment history, pausing
 * and cancelling live behind "•••" — no frame, no badge wall, no nested boxes.
 */
function PaymentPlanRow({
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

  const metaBits: string[] = [];
  if (isTerm) metaBits.push(`${r.installmentsPaid}/${total}`);
  else if (r.planType === "recurring") metaBits.push(frequencyLabel(r.frequency));
  else metaBits.push("Bir martalik");
  metaBits.push(r.isMandatory ? "majburiy" : "ixtiyoriy");
  if (r.certainty === "estimated") metaBits.push("taxminiy");

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[14px] font-semibold leading-tight">{r.name}</p>
            {status !== "active" ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
            {status === "active" && r.paidThisMonth ? <span className="shrink-0 text-[11px] font-medium text-positive-text">✓ bu oy</span> : null}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-muted">
            <span className={TONE_TEXT[due.tone]}>{due.overdue ? "🔴 " : ""}{due.text}</span>
            {" · "}
            {metaBits.join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {r.certainty === "estimated" && r.minAmount && r.maxAmount ? (
            <p className="num text-[14px] font-semibold">{compact(r.minAmount)}–{compact(r.maxAmount)}</p>
          ) : (
            <Money value={r.baseAmount} size="md" tone={due.overdue ? "negative" : "default"} />
          )}
        </div>
      </div>

      {isTerm && status !== "cancelled" ? (
        <div className="mt-2">
          <Progress
            value={progress}
            tone="accent"
            height={4}
            label={
              status === "completed"
                ? `Jami to‘langan: ${formatAmount(r.planTotal ?? 0)} so‘m`
                : `Qolgan: ${formatAmount(r.remainingTotal ?? 0)} so‘m · ${r.remainingInstallments ?? 0} ta`
            }
          />
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        {status === "active" ? (
          <Button variant="positive" size="sm" className="min-w-0 flex-1 sm:max-w-44" onClick={() => onAction("pay", r)}>
            To‘landi
          </Button>
        ) : status === "paused" ? (
          <Button variant="secondary" size="sm" className="min-w-0 flex-1 sm:max-w-44" onClick={() => onAction("toggle", r)}>
            Yoqish
          </Button>
        ) : status === "cancelled" ? (
          <Button variant="secondary" size="sm" className="min-w-0 flex-1 sm:max-w-56" onClick={() => onAction("restore", r)}>
            Qayta faollashtirish
          </Button>
        ) : (
          <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted">Yakunlangan — yangi to‘lov yo‘q.</p>
        )}
        {r.paymentsCount ? (
          <button type="button" className={`${LINK_BTN} hidden sm:inline-flex`} onClick={() => onAction("history", r)}>
            🧾 {r.paymentsCount} ta
          </button>
        ) : null}
        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation"
          aria-label={`${r.name} — boshqa amallar`}
          onClick={() => onMenu(r)}
        >
          •••
        </button>
      </div>
    </div>
  );
}

/** Expected income — deliberately the SAME row system as payments (§30). */
function IncomePlanRow({
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

  const metaBits: string[] = [];
  if (isTerm) metaBits.push(`${i.occurrencesReceived}/${total}`);
  else if (i.planType === "recurring") metaBits.push(frequencyLabel(i.frequency));
  else metaBits.push("Bir martalik");
  metaBits.push(i.certainty === "estimated" ? "taxminiy" : "aniq");

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[14px] font-semibold leading-tight">{i.sourceName}</p>
            {status !== "active" ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
            {status === "active" && i.received ? <span className="shrink-0 text-[11px] font-medium text-positive-text">✓ bu oy</span> : null}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-muted">
            <span className={TONE_TEXT[due.tone]}>{due.overdue ? "⏳ " : ""}{due.text}</span>
            {" · "}
            {metaBits.join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {i.certainty === "estimated" && i.minAmount && i.maxAmount ? (
            <p className="num text-[14px] font-semibold text-positive-text">{compact(i.minAmount)}–{compact(i.maxAmount)}</p>
          ) : (
            <Money value={i.baseAmount} size="md" tone="positive" />
          )}
        </div>
      </div>

      {isTerm && status !== "cancelled" ? (
        <div className="mt-2">
          <Progress
            value={progress}
            tone="accent"
            height={4}
            label={
              status === "completed"
                ? `Jami qabul qilindi: ${formatAmount(i.planTotal ?? 0)} so‘m`
                : `Reja jami: ${formatAmount(i.planTotal ?? 0)} so‘m · qolgan ${i.remainingOccurrences ?? 0} ta`
            }
          />
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        {status === "active" ? (
          <Button variant="positive" size="sm" className="min-w-0 flex-1 sm:max-w-44" onClick={() => onAction("receive", i)}>
            Qabul
          </Button>
        ) : status === "paused" ? (
          <Button variant="secondary" size="sm" className="min-w-0 flex-1 sm:max-w-44" onClick={() => onAction("toggle", i)}>
            Yoqish
          </Button>
        ) : status === "cancelled" ? (
          <Button variant="secondary" size="sm" className="min-w-0 flex-1 sm:max-w-56" onClick={() => onAction("restore", i)}>
            Qayta faollashtirish
          </Button>
        ) : (
          <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted">Yakunlangan — yangi qabul yo‘q.</p>
        )}
        {i.receiptsCount ? (
          <button type="button" className={`${LINK_BTN} hidden sm:inline-flex`} onClick={() => onAction("history", i)}>
            🧾 {i.receiptsCount} ta
          </button>
        ) : null}
        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation"
          aria-label={`${i.sourceName} — boshqa amallar`}
          onClick={() => onMenu(i)}
        >
          •••
        </button>
      </div>
    </div>
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
            {/* ONE contextual month strip (§20): opening → in/out → closing.
                Mandatory load and expected income belong to the To‘lovlar /
                Daromad tabs and are not repeated here. */}
            <div className="grid grid-cols-2 divide-x divide-line rounded-xl border border-line sm:grid-cols-4">
              <div className="min-w-0 p-3">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{isCurrent ? "Bugungi balans" : "Ochilish"}</p>
                <p className="num mt-1 break-words text-[13.5px] font-semibold">{formatAmount(opening)}</p>
              </div>
              <div className="min-w-0 p-3">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">Kirim</p>
                <p className="num mt-1 break-words text-[13.5px] font-semibold text-positive-text">+{formatAmount(inflow)}</p>
              </div>
              <div className="min-w-0 border-t border-line p-3 sm:border-t-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">Chiqim</p>
                <p className="num mt-1 break-words text-[13.5px] font-semibold">−{formatAmount(outflow)}</p>
              </div>
              <div className="min-w-0 border-t border-line p-3 sm:border-t-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">Yopilish</p>
                <p className={`num mt-1 break-words text-[13.5px] font-semibold ${closing < 0 ? "text-negative-text" : ""}`}>{formatAmount(closing)}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted">
              Majburiy: <span className="num font-medium text-fg-soft">{compact(mandatory)}</span> · Kutilayotgan daromad:{" "}
              <span className="num font-medium text-fg-soft">{compact(expectedIncome)}</span> — to‘liq ro‘yxat To‘lovlar / Daromad tablarida.
            </p>

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
          <>
            {/* Timeline context only — the full risk explanation is OWNED by
                the Dashboard risk card (§5); here each date is one thin row. */}
            <div className="divide-y divide-line">
              {risks.slice(0, 5).map((r) => (
                <div key={r.date} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className="num text-[12.5px] font-semibold text-negative-text">{shortDate(r.date)}</span>
                    <span className="ml-2 truncate text-[11.5px] text-muted">{r.cause}</span>
                  </div>
                  <span className="num shrink-0 text-[12.5px] font-semibold text-negative-text">−{compact(r.deficit)}</span>
                </div>
              ))}
            </div>
            <Link href="/" className="mt-2 inline-block text-[12px] font-semibold text-accent-text">
              To‘liq izoh → Dashboard
            </Link>
          </>
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
            {/* Archived accounts are excluded from the dashboard balance, so a
                plan must never be able to target one. */}
            {(state?.accounts ?? [])
              .filter((a) => a.isActive || a.id === editing?.accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.isActive ? "" : " (arxiv)"}
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
                {a.isActive ? "" : " (arxiv)"}
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
