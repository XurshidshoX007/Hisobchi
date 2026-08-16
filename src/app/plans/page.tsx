"use client";
/* eslint-disable react-hooks/set-state-in-effect -- planning form drafts synchronize to editing/open state */

import { useEffect, useState } from "react";
import { CashFlowStrip, ForecastArea } from "@/components/charts";
import { useFinance } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  TextArea,
  TextInput,
} from "@/components/ui";
import { addMonths, compact, formatAmount, humanDate, monthKey, monthStart, shortDate, todayISO } from "@/lib/money";
import { monthCashflow, monthPlanned } from "@/lib/finance";
import type { ExpectedIncomeView, RecurringView } from "@/lib/finance";

type Tab = "payments" | "income" | "cashflow";

export default function PlansPage() {
  const { state, loading, mutate } = useFinance();
  const [tab, setTab] = useState<Tab>("payments");
  const [sheet, setSheet] = useState<"recurring" | "income" | null>(null);
  const [editing, setEditing] = useState<RecurringView | null>(null);
  const [editingIncome, setEditingIncome] = useState<ExpectedIncomeView | null>(null);
  const [cashMonth, setCashMonth] = useState<string>(monthKey(todayISO()));
  const [deletingPlan, setDeletingPlan] = useState<RecurringView | null>(null);

  function closeSheet() {
    setSheet(null);
    setEditing(null);
    setEditingIncome(null);
  }

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const f = state.forecast;
  const monthlyMandatory = state.recurring.filter((r) => r.isActive && r.isMandatory).reduce((s, r) => s + r.baseAmount, 0);
  const monthlyOptional = state.recurring.filter((r) => r.isActive && !r.isMandatory).reduce((s, r) => s + r.baseAmount, 0);
  const termPlans = state.recurring.filter((r) => r.isActive && r.planType === "term");

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      <PageHeader title="Reja va prognoz" subtitle="Real va planned pul alohida — tizim ikkalasini birlashtirib prognoz beradi" />

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
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Majburiy / oy" value={monthlyMandatory} />
              <Stat label="Ixtiyoriy / oy" value={monthlyOptional} />
              <Stat label="Rejalar soni" value={state.recurring.filter((r) => r.isActive).length} plain />
              {/* Annualized total counts ONLY indefinite recurring plans — term
                  plans must not be multiplied by 12. */}
              <Stat label="Yillik jami" value={state.recurring.filter((r) => r.isActive && r.planType === "recurring").reduce((s, r) => s + r.yearlyTotal, 0)} />
            </div>
            {termPlans.length ? (
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-2">
                <Stat label="Muddatli reja jami" value={termPlans.reduce((s, r) => s + (r.planTotal ?? 0), 0)} />
                <Stat label="Muddatli qolgan" value={termPlans.reduce((s, r) => s + (r.remainingTotal ?? 0), 0)} />
              </div>
            ) : null}
          </Card>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditing(null);
                setSheet("recurring");
              }}
            >
              ➕ Doimiy to‘lov
            </Button>
          </div>

          {state.recurring.length ? (
            <Card padded={false} className="overflow-hidden">
              <div className="divide-y divide-line px-4 sm:px-5">
                {state.recurring.map((r) => (
                  <div key={r.id} className="py-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-[11px] font-semibold">
                        {r.daysLeft < 0 ? "!" : `${r.daysLeft}k`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium">
                          {r.name} {r.paidThisMonth ? <span className="text-positive-text">✓</span> : null}
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                          {r.categoryName ?? "kategoriya yo‘q"} ·{" "}
                          {r.planType === "one_time"
                            ? "bir martalik"
                            : `har ${r.frequency === "monthly" ? "oy" : r.frequency === "weekly" ? "hafta" : "yil"} ${r.dueDay}-sana`}{" "}
                          · {humanDate(r.nextDueDate)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge tone={r.isMandatory ? "negative" : "neutral"}>{r.isMandatory ? "majburiy" : "ixtiyoriy"}</Badge>
                          <Badge tone={r.certainty === "estimated" ? "warning" : "accent"}>
                            {r.certainty === "estimated" ? "taxminiy" : "aniq"}
                          </Badge>
                          {r.planType === "term" ? (
                            <Badge tone={r.termCompleted ? "positive" : "neutral"}>
                              {r.installmentsPaid}/{r.installmentCount ?? 0} to‘lov
                            </Badge>
                          ) : null}
                          {r.planType === "one_time" ? <Badge tone="neutral">bir martalik</Badge> : null}
                          {r.termCompleted ? <Badge tone="positive">yakunlangan</Badge> : !r.isActive ? <Badge tone="neutral">pauza</Badge> : null}
                        </div>
                        {r.planType === "term" && r.remainingTotal !== null && !r.termCompleted ? (
                          <p className="mt-1.5 text-[11.5px] text-muted">
                            Qolgan: {compact(r.remainingTotal)} so‘m ({r.remainingInstallments} ta to‘lov)
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {r.certainty === "estimated" && r.minAmount && r.maxAmount ? (
                          <span className="num text-[14px] font-medium">
                            {compact(r.minAmount)}–{compact(r.maxAmount)}
                          </span>
                        ) : (
                          <Money value={r.baseAmount} size="md" />
                        )}
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => mutate("recurring", "pay", { id: r.id })}
                            disabled={!r.isActive || r.termCompleted}
                            className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-positive hover:text-positive-text active:bg-surface-3 disabled:pointer-events-none disabled:opacity-50 touch-manipulation"
                          >
                            To‘landi
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(r);
                              setSheet("recurring");
                            }}
                            className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                          >
                            Tahrir
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingPlan(r)}
                            className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-negative hover:text-negative-text active:bg-surface-3 touch-manipulation"
                            aria-label="O‘chirish"
                          >
                            O‘chirish
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              icon="📌"
              title="Doimiy to‘lovlar yo‘q"
              description="Ijara, kommunal, kredit kabi takrorlanuvchi to‘lovlarni bir marta kiriting — tizim sanani o‘zi hisoblaydi."
              action={
                <Button type="button" onClick={() => setSheet("recurring")}>
                  ➕ Doimiy to‘lov qo‘shish
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      {tab === "income" ? (
        <div className="space-y-3.5 sm:space-y-4">
          <Card>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Joriy oy: {state.currentMonthIncome.label}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Aniq kutilmoqda" value={state.currentMonthIncome.exactBase} tone="positive" />
              <Stat label="Taxminiy" value={state.currentMonthIncome.estimatedBase} tone="muted" />
              <Stat label="Jami prognoz" value={state.currentMonthIncome.base} tone="positive" />
            </div>
            <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-muted">
              90 kunlik prognoz: <span className="num font-medium text-fg">{compact(f.income.base)} so‘m</span> (aniq {compact(f.income.exactBase)}, taxminiy {compact(f.income.estimatedBase)})
            </p>
          </Card>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingIncome(null);
                setSheet("income");
              }}
            >
              ➕ Kutilayotgan daromad
            </Button>
          </div>

          {state.expectedIncomes.length ? (
            <Card padded={false} className="overflow-hidden">
              <div className="divide-y divide-line px-4 sm:px-5">
                {state.expectedIncomes.map((i) => (
                  <div key={i.id} className="py-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-positive-soft text-[11px] font-semibold text-positive-text">
                        {i.daysLeft < 0 ? "!" : `${i.daysLeft}k`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium">{i.sourceName}</p>
                        <p className="mt-0.5 text-[11.5px] text-muted">
                          {humanDate(i.expectedDate)} · {frequencyLabel(i.frequency)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge tone={i.certainty === "estimated" ? "warning" : "accent"}>
                            {i.certainty === "estimated" ? "taxminiy" : "aniq"}
                          </Badge>
                          {i.received ? <Badge tone="positive">qayd etilgan</Badge> : <Badge tone="neutral">kutilmoqda</Badge>}
                          {i.planType === "term" ? (
                            <Badge tone={i.termCompleted ? "positive" : "neutral"}>
                              {i.occurrencesReceived}/{i.occurrenceCount ?? 0}
                            </Badge>
                          ) : null}
                          {i.planType === "one_time" ? <Badge tone="neutral">bir martalik</Badge> : null}
                          {i.termCompleted ? <Badge tone="positive">yakunlangan</Badge> : !i.isActive ? <Badge tone="neutral">pauza</Badge> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {i.certainty === "estimated" && i.minAmount && i.maxAmount ? (
                          <span className="num text-[14px] font-medium">
                            {compact(i.minAmount)}–{compact(i.maxAmount)}
                          </span>
                        ) : (
                          <Money value={i.baseAmount} size="md" tone="positive" />
                        )}
                      </div>
                    </div>
                    <div className="ml-[52px] mt-3 flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => mutate("expectedIncome", "receive", { id: i.id })}
                        disabled={!i.isActive}
                        className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-positive hover:text-positive-text active:bg-surface-3 disabled:pointer-events-none disabled:opacity-50 touch-manipulation"
                      >
                        Qabul
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIncome(i);
                          setSheet("income");
                        }}
                        className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                      >
                        Tahrir
                      </button>
                      <button
                        type="button"
                        onClick={() => mutate("expectedIncome", "toggle", { id: i.id })}
                        className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                      >
                        {i.isActive ? "Pauza" : "Yoqish"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              icon="💰"
              title="Kutilayotgan daromad yo‘q"
              description="Keladigan daromadlarni kiritib prognoz aniqligini oshiring."
              action={
                <Button
                  type="button"
                  onClick={() => {
                    setEditingIncome(null);
                    setSheet("income");
                  }}
                >
                  ➕ Daromad reja
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      {tab === "cashflow" ? (
        <CashflowTab
          cashflow={f.cashflow}
          planned={f.planned}
          riskDates={f.riskDates}
          horizonDays={f.horizonDays}
          monthLabel={state.monthly?.find((m) => m.monthKey === cashMonth)?.label ?? cashMonth}
          cashMonth={cashMonth}
          setCashMonth={setCashMonth}
        />
      ) : null}

      <RecurringSheet open={sheet === "recurring"} onClose={closeSheet} editing={editing} />
      <IncomeSheet open={sheet === "income"} onClose={closeSheet} editing={editingIncome} />
      <PlanDeleteConfirm plan={deletingPlan} onClose={() => setDeletingPlan(null)} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  plain,
}: {
  label: string;
  value: number;
  tone?: "default" | "positive" | "muted";
  plain?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      {plain ? (
        <p className="num mt-1 text-xl font-semibold">{value}</p>
      ) : (
        <div className="mt-1">
          <Money value={value} size="lg" tone={tone === "positive" ? "positive" : tone === "muted" ? "muted" : "default"} />
        </div>
      )}
    </div>
  );
}

function CashflowTab({
  cashflow,
  planned,
  riskDates,
  horizonDays,
  monthLabel,
  cashMonth,
  setCashMonth,
}: {
  cashflow: ReturnType<typeof monthCashflow>;
  planned: ReturnType<typeof monthPlanned>;
  riskDates: Array<{ date: string; balance: number; deficit: number; cause: string; recoveryDate?: string | null; recoveryAmount?: number | null }>;
  horizonDays: number;
  monthLabel: string;
  cashMonth: string;
  setCashMonth: (mk: string) => void;
}) {
  const current = monthKey(todayISO());
  const days = monthCashflow(cashflow, cashMonth);
  const items = monthPlanned(planned, cashMonth);
  const risks = riskDates.filter((r) => monthKey(r.date) === cashMonth);
  const closing = days.length ? days[days.length - 1].projectedBase : 0;
  const opening = days.length ? days[0].projectedBase : 0;

  return (
    <div className="space-y-3.5 sm:space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCashMonth(monthKey(addMonths(monthStart(cashMonth), -1)))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation"
              aria-label="Oldingi oy"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setCashMonth(monthKey(addMonths(monthStart(cashMonth), 1)))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation"
              aria-label="Keyingi oy"
            >
              ›
            </button>
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-[15px] font-semibold">{monthLabel}</p>
            {cashMonth === current ? (
              <Badge tone="accent">joriy oy</Badge>
            ) : (
              <p className="text-[11px] text-muted">kelajak oy</p>
            )}
          </div>
        </div>

        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Oy oxiri prognoz balans</p>
            <Money value={closing} size="xl" />
          </div>
          <div className="shrink-0 text-right text-[11.5px] leading-tight text-muted">
            <p>ochilish {compact(opening)}</p>
            <p>yakun {compact(closing)}</p>
          </div>
        </div>
        <ForecastArea data={days} />
        <Divider />
        <div className="mt-4 overflow-x-auto">
          <CashFlowStrip data={days} />
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-semibold">Kalendar bo‘yicha reja ({monthLabel})</p>
        {items.length ? (
          <div className="divide-y divide-line">
            {items.map((p) => (
              <div key={p.key} className="flex items-center gap-2.5 py-2.5">
                <span className="num w-14 shrink-0 text-[11.5px] text-muted sm:w-16 sm:text-[12px]">{shortDate(p.date)}</span>
                <span className={`shrink-0 text-sm font-medium ${p.kind === "income" ? "text-positive-text" : "text-fg"}`}>
                  {p.kind === "income" ? "+" : "−"}
                  {formatAmount(p.base)}
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
        <p className="mb-2 text-[15px] font-semibold">⚠️ Xavf kunlari ({monthLabel})</p>
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
            Bu oyda pul yetishmasligi xavfi aniqlanmadi (butun {horizonDays} kunlik prognoz tekshirildi).
          </p>
        )}
      </Card>
    </div>
  );
}

function PlanDeleteConfirm({ plan, onClose }: { plan: RecurringView | null; onClose: () => void }) {
  const { mutate } = useFinance();
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!plan || saving) return;
    setSaving(true);
    try {
      await mutate("recurring", "delete", { id: plan.id });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <Sheet
      open={Boolean(plan)}
      onClose={onClose}
      title="Rejani o‘chirish"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="danger" className="flex-[2]" onClick={confirm} disabled={saving}>
            {saving ? "O‘chirilmoqda…" : "O‘chirish"}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed">
        <span className="font-semibold">{plan?.name}</span> rejasi o‘chiriladi.
      </p>
      <p className="text-[13px] leading-relaxed text-muted">
        Kelajakdagi to‘lovlar bekor qilinadi. Tarixdagi to‘lovlar o‘chirilmaydi.
      </p>
    </Sheet>
  );
}

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
  const [planType, setPlanType] = useState<"one_time" | "recurring" | "term">("recurring");
  const [installmentCount, setInstallmentCount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isMandatory, setIsMandatory] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSaving(false);
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

  async function save() {
    if (!name.trim() || saving) return;
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
          <Button className="flex-[2]" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </>
      }
    >
      <Field label="Nomi">
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
      {planType === "term" ? (
        <Field label="Bo‘lib to‘lashlar soni" hint="Masalan, 12 oylik kredit uchun 12">
          <TextInput
            value={installmentCount}
            onChange={(e) => setInstallmentCount(e.target.value)}
            inputMode="numeric"
            placeholder="12"
          />
        </Field>
      ) : null}
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
      {certainty === "exact" ? (
        <Field label="Summa">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="2500000" />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimal">
            <TextInput value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="300000" />
          </Field>
          <Field label="Maksimal">
            <TextInput value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="500000" />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label="Keyingi to‘lov sanasi">
          <TextInput type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
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
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label="Turi">
          <Select value={isMandatory ? "1" : "0"} onChange={(e) => setIsMandatory(e.target.value === "1")}>
            <option value="1">Majburiy</option>
            <option value="0">Ixtiyoriy</option>
          </Select>
        </Field>
        <Field label="Faollik">
          <Select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
            <option value="1">Faol</option>
            <option value="0">Pauza</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
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
  const [planType, setPlanType] = useState<"one_time" | "recurring" | "term">("recurring");
  const [occurrenceCount, setOccurrenceCount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Initialize every field for the selected record. Opening a second record
    // cannot inherit any draft value from the first one.
    setSaving(false);
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

  async function save() {
    if (!sourceName.trim() || !expectedDate || saving) return;
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "✏️ Kutilayotgan daromadni tahrirlash" : "➕ Kutilayotgan daromad"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={save} disabled={saving || !sourceName.trim()}>
            {saving ? "Saqlanmoqda…" : editing ? "Yangilash" : "Saqlash"}
          </Button>
        </>
      }
    >
      <Field label="Manba nomi">
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
      {planType === "term" ? (
        <Field label="Takrorlanishlar soni" hint="Masalan, 3 oylik kontrakt uchun 3">
          <TextInput
            value={occurrenceCount}
            onChange={(e) => setOccurrenceCount(e.target.value)}
            inputMode="numeric"
            placeholder="3"
          />
        </Field>
      ) : null}
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
      {certainty === "exact" ? (
        <Field label="Summa">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="8000000" />
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <Field label="Minimal summa">
            <TextInput value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="3000000" />
          </Field>
          <Field label="Maksimal summa">
            <TextInput value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="5000000" />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        <Field label="Kutilayotgan sana">
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
      <Field label="Faollik">
        <Select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
          <option value="1">Faol</option>
          <option value="0">Pauza</option>
        </Select>
      </Field>
      <Field label="Izoh">
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ixtiyoriy" />
      </Field>
    </Sheet>
  );
}

function frequencyLabel(frequency: string): string {
  if (frequency === "weekly") return "har hafta";
  if (frequency === "yearly") return "har yil";
  if (frequency === "monthly") return "har oy";
  return "bir marta";
}
