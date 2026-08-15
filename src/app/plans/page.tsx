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
import { compact, formatAmount, humanDate, shortDate, todayISO } from "@/lib/money";
import type { ExpectedIncomeView, RecurringView } from "@/lib/finance";

type Tab = "payments" | "income" | "cashflow";

export default function PlansPage() {
  const { state, loading, mutate } = useFinance();
  const [tab, setTab] = useState<Tab>("payments");
  const [sheet, setSheet] = useState<"recurring" | "income" | null>(null);
  const [editing, setEditing] = useState<RecurringView | null>(null);
  const [editingIncome, setEditingIncome] = useState<ExpectedIncomeView | null>(null);

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
              <Stat label="Yillik jami" value={state.recurring.filter((r) => r.isActive).reduce((s, r) => s + r.baseAmount * 12, 0)} />
            </div>
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
                          {r.categoryName ?? "kategoriya yo‘q"} · har {r.frequency === "monthly" ? "oy" : r.frequency === "weekly" ? "hafta" : "yil"}{" "}
                          {r.dueDay}-sana · {humanDate(r.nextDueDate)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge tone={r.isMandatory ? "negative" : "neutral"}>{r.isMandatory ? "majburiy" : "ixtiyoriy"}</Badge>
                          <Badge tone={r.certainty === "estimated" ? "warning" : "accent"}>
                            {r.certainty === "estimated" ? "taxminiy" : "aniq"}
                          </Badge>
                          {!r.isActive ? <Badge tone="neutral">pauza</Badge> : null}
                        </div>
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
                            className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-positive hover:text-positive-text active:bg-surface-3 touch-manipulation"
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Aniq kutilmoqda" value={f.income.exactBase} tone="positive" />
              <Stat label="Taxminiy (bazaviy)" value={f.income.estimatedBase} tone="muted" />
              <Stat label="Jami prognoz" value={f.income.base} tone="positive" />
            </div>
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
                          {!i.isActive ? <Badge tone="neutral">pauza</Badge> : null}
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
        <div className="space-y-3.5 sm:space-y-4">
          <Card>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Prognoz balans</p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <Money value={f.scenarios.base.balance} size="xl" />
                  <Badge tone={f.scenarios.base.delta >= 0 ? "positive" : "negative"}>
                    {f.scenarios.base.delta >= 0 ? "+" : ""}
                    {compact(f.scenarios.base.delta)}
                  </Badge>
                </div>
              </div>
              <div className="shrink-0 text-right text-[11.5px] leading-tight text-muted">
                <p>min {compact(f.scenarios.min.balance)}</p>
                <p>max {compact(f.scenarios.max.balance)}</p>
              </div>
            </div>
            <ForecastArea data={f.cashflow} />
            <Divider />
            <div className="mt-4 overflow-x-auto">
              <CashFlowStrip data={f.cashflow} />
            </div>
          </Card>

          <Card>
            <p className="mb-3 text-[15px] font-semibold">Kalendar bo‘yicha reja</p>
            <div className="divide-y divide-line">
              {f.planned
                .filter((p) => p.date >= todayISO())
                .slice(0, 24)
                .map((p) => (
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
          </Card>

          <Card>
            <p className="mb-2 text-[15px] font-semibold">⚠️ Xavf kunlari</p>
            {f.riskDates.length ? (
              <div className="space-y-2">
                {f.riskDates.slice(0, 8).map((r) => (
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
                Kelasi {f.horizonDays} kunda pul yetishmasligi xavfi aniqlanmadi.
              </p>
            )}
          </Card>
        </div>
      ) : null}

      <RecurringSheet open={sheet === "recurring"} onClose={closeSheet} editing={editing} />
      <IncomeSheet open={sheet === "income"} onClose={closeSheet} editing={editingIncome} />
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
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isMandatory, setIsMandatory] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCertainty(editing?.certainty ?? "exact");
      setAmount(editing?.amount ? String(editing.amount) : "");
      setMin(editing?.minAmount ? String(editing.minAmount) : "");
      setMax(editing?.maxAmount ? String(editing.maxAmount) : "");
      setNextDueDate(editing?.nextDueDate ?? todayISO());
      setFrequency(editing?.frequency ?? "monthly");
      setCategoryId(editing?.categoryId ? String(editing.categoryId) : "");
      setAccountId(editing?.accountId ? String(editing.accountId) : "");
      setIsMandatory(editing?.isMandatory ?? true);
      setIsActive(editing?.isActive ?? true);
    }
  }, [open, editing]);

  const categories = (state?.flatCategories ?? []).filter((c) => c.type === "expense" && c.isActive);

  async function save() {
    if (!name.trim()) return;
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
      frequency,
      categoryId: categoryId ? Number(categoryId) : null,
      accountId: accountId ? Number(accountId) : null,
      isMandatory,
      isActive,
    });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Doimiy to‘lovni tahrirlash" : "Doimiy to‘lov qo‘shish"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={save}>
            Saqlash
          </Button>
        </>
      }
    >
      <Field label="Nomi">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ijara / Elektr / Kredit" />
      </Field>
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
        <Field label="Takrorlanish">
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="once">Bir marta</option>
            <option value="weekly">Har hafta</option>
            <option value="monthly">Har oy</option>
            <option value="yearly">Har yil</option>
          </Select>
        </Field>
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
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    // Initialize every field for the selected record. Opening a second record
    // cannot inherit any draft value from the first one.
    setSourceName(editing?.sourceName ?? "");
    setCertainty(editing?.certainty ?? "exact");
    setAmount(editing?.amount !== null && editing?.amount !== undefined ? String(editing.amount) : "");
    setMin(editing?.minAmount !== null && editing?.minAmount !== undefined ? String(editing.minAmount) : "");
    setMax(editing?.maxAmount !== null && editing?.maxAmount !== undefined ? String(editing.maxAmount) : "");
    setExpectedDate(editing?.expectedDate ?? todayISO());
    setFrequency(editing?.frequency ?? "monthly");
    setCategoryId(editing?.categoryId ? String(editing.categoryId) : "");
    setAccountId(editing?.accountId ? String(editing.accountId) : "");
    setIsActive(editing?.isActive ?? true);
    setNote(editing?.note ?? "");
  }, [open, editing]);

  const categories = (state?.flatCategories ?? []).filter((c) => c.type === "income" && c.isActive);
  const accounts = (state?.accounts ?? []).filter((a) => a.isActive || a.id === editing?.accountId);

  async function save() {
    if (!sourceName.trim() || !expectedDate) return;
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
      frequency,
      categoryId: categoryId ? Number(categoryId) : null,
      accountId: accountId ? Number(accountId) : null,
      isActive,
      note: note.trim() || null,
    });
    if (res.ok) onClose();
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
          <Button className="flex-[2]" onClick={save}>
            {editing ? "Yangilash" : "Saqlash"}
          </Button>
        </>
      }
    >
      <Field label="Manba nomi">
        <TextInput value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Ish haqi / Biznes daromadi" />
      </Field>
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
        <Field label="Takrorlanish">
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="once">Bir marta</option>
            <option value="weekly">Har hafta</option>
            <option value="monthly">Har oy</option>
            <option value="yearly">Har yil</option>
          </Select>
        </Field>
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
