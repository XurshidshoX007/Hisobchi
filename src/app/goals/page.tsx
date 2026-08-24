"use client";
/* eslint-disable react-hooks/set-state-in-effect -- modal contribution drafts synchronize to selected goal */

import { useEffect, useRef, useState } from "react";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { AdvancedSection, AmountField, Chip, DateField, FormActions, FormSheet, PreviewCard } from "@/components/form-kit";
import { Badge, Card, EmptyState, Field, Money, Progress, Skeleton, TextInput } from "@/components/ui";
import { amountError, formatAmountInput, isDirtyDraft, parseAmountInput } from "@/lib/form-kit";
import { compact, formatAmount, humanDate } from "@/lib/money";
import type { GoalView } from "@/lib/finance";

export default function GoalsPage() {
  const { state, loading, mutate } = useFinance();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<GoalView | null>(null);
  const [goal, setGoal] = useState<GoalView | null>(null);

  function openCreate() {
    setEditing(null);
    setSheet(true);
  }

  // Global FAB → existing GoalSheet.
  useFabPage({}, { goal: () => openCreate() });

  // Routed creates (Menu → "+ Maqsad").
  const { consume } = useFab();
  useEffect(() => {
    const routed = consume();
    if (routed?.id === "goal") openCreate();
  }, [consume]);

  function closeSheet() {
    setSheet(false);
    setEditing(null);
  }

  if (loading && !state) return <Skeleton className="h-72 w-full" />;
  if (!state) return null;

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      {/* §18/§22: swipe-back replaces the old ‹ Menyu back link. */}

      {state.goals.length ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
          {state.goals.map((g) => (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-3 text-lg">{g.icon}</div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium">{g.name}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {g.targetDate ? `${humanDate(g.targetDate)} gacha` : "muddat yo‘q"}
                      {g.monthsLeft !== null ? ` · ${g.monthsLeft} oy` : ""}
                    </p>
                  </div>
                </div>
                <Badge tone={g.onTrack ? "positive" : "warning"}>{g.onTrack ? "Rejada" : "Ortda"}</Badge>
              </div>

              {/* §18: primary = progress toward target; secondary = one muted
                  line (remaining + required monthly + ETA). No 4-cell grid. */}
              <div className="mt-4 flex items-baseline justify-between gap-2">
                <Money value={g.savedAmount} size="lg" tone="positive" />
                <span className="num shrink-0 text-[12px] text-muted">/ {formatAmount(g.targetAmount)}</span>
              </div>
              <div className="mt-2">
                <Progress value={g.progress} ariaLabel={`${g.name} progressi`} />
                <p className="mt-1.5 text-[11.5px] text-muted">
                  {(g.progress * 100).toFixed(0)}% · qolgan {compact(g.remaining)}
                  {g.requiredMonthly > 0 ? ` · oyiga ${compact(g.requiredMonthly)}` : ""}
                  {g.etaDate ? ` · ~${humanDate(g.etaDate)}` : ""}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setGoal(g)}
                  className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-accent hover:text-accent-text active:bg-surface-3 touch-manipulation"
                >
                  Jamg‘arma
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(g);
                    setSheet(true);
                  }}
                  className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                >
                  Tahrir
                </button>
                <button
                  type="button"
                  onClick={() => mutate("goal", "delete", { id: g.id })}
                  className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-muted transition-colors hover:text-negative-text active:bg-surface-3 touch-manipulation"
                >
                  O‘chirish
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon="🏆" title="Maqsadlar yo‘q." description="Pastdagi + tugmasi orqali maqsad qo‘shing." />
      )}

      <GoalSheet open={sheet} onClose={closeSheet} editing={editing} />
      <ContributeSheet goal={goal} onClose={() => setGoal(null)} />
    </div>
  );
}

/**
 * §19: a goal is a name and a number. Everything else (current savings,
 * deadline, monthly plan, icon) is optional and stays collapsed.
 */
function GoalSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: GoalView | null }) {
  const { mutate, toast } = useFinance();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [targetAmount, setTargetAmount] = useState("");
  const [savedAmount, setSavedAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [touched, setTouched] = useState(false);
  const [initialDraft, setInitialDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const draft = {
      name: editing?.name ?? "",
      icon: editing?.icon ?? "🎯",
      targetAmount: editing ? formatAmountInput(String(editing.targetAmount)) : "",
      savedAmount: editing ? formatAmountInput(String(editing.savedAmount)) : "",
      targetDate: editing?.targetDate ?? "",
      monthlyContribution: editing ? formatAmountInput(String(editing.monthlyContribution)) : "",
    };
    setName(draft.name);
    setIcon(draft.icon);
    setTargetAmount(draft.targetAmount);
    setSavedAmount(draft.savedAmount);
    setTargetDate(draft.targetDate);
    setMonthlyContribution(draft.monthlyContribution);
    setTouched(false);
    setInitialDraft(draft);
  }, [open, editing]);

  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = "Maqsad nomini kiriting";
  const targetMsg = amountError(targetAmount, "Kerakli summani kiriting");
  if (targetMsg) errors.targetAmount = targetMsg;
  const valid = Object.keys(errors).length === 0;
  const showError = (key: string) => (touched ? errors[key] ?? null : null);

  const target = parseAmountInput(targetAmount) ?? 0;
  const saved = parseAmountInput(savedAmount) ?? (editing?.savedAmount ?? 0);
  const dirty = isDirtyDraft({ name, icon, targetAmount, savedAmount, targetDate, monthlyContribution }, initialDraft);

  async function submit() {
    setTouched(true);
    if (!valid) return { ok: false, message: Object.values(errors)[0] };
    const res = await mutate(
      "goal",
      editing ? "update" : "create",
      {
        id: editing?.id,
        name: name.trim(),
        icon: icon || "🎯",
        targetAmount: target,
        savedAmount: parseAmountInput(savedAmount) ?? 0,
        targetDate: targetDate || null,
        monthlyContribution: parseAmountInput(monthlyContribution) ?? 0,
      },
      { silent: true },
    );
    if (res.ok) toast(editing ? "Maqsad yangilandi" : `“${name.trim()}” maqsadi saqlandi`, "success");
    return res;
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? "Maqsadni tahrirlash" : "+ Maqsad"}
      subtitle={editing ? undefined : "Nimaga jamg‘arasiz?"}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={dirty}
      onSubmit={submit}
    >
      <Field label="Maqsad nomi" error={showError("name")}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Mashina / iPhone / Zaxira" />
      </Field>

      <AmountField
        value={targetAmount}
        onChange={setTargetAmount}
        label="Kerakli summa"
        currency="UZS"
        error={showError("targetAmount")}
        autoFocus={!editing}
      />

      {target > 0 ? (
        <PreviewCard>
          <p className="min-w-0 break-words text-[13px] font-semibold">
            {icon} {name.trim() || "Maqsad"}
          </p>
          <p className="num mt-0.5 break-words text-[12.5px] text-muted">
            {formatAmount(saved)} / {formatAmount(target)} so‘m
            {targetDate ? ` · ${humanDate(targetDate)} gacha` : ""}
          </p>
          <div className="mt-2">
            <Progress value={target > 0 ? saved / target : 0} height={6} ariaLabel="Maqsad progressi" />
          </div>
        </PreviewCard>
      ) : null}

      <AdvancedSection>
        <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 [&>*]:min-w-0">
          {!editing ? (
            <Field label="Hozirgi summa">
              <TextInput
                value={savedAmount}
                onChange={(e) => setSavedAmount(formatAmountInput(e.target.value))}
                inputMode="decimal"
                placeholder="0"
              />
            </Field>
          ) : (
            <div className="flat-card flex items-center justify-between p-3 text-sm">
              <span className="text-muted">Yig‘ilgan</span>
              <Money value={editing.savedAmount} size="sm" tone="positive" />
            </div>
          )}
          <Field label="Ikona">
            <TextInput value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🚗" />
          </Field>
        </div>
        <DateField value={targetDate} onChange={setTargetDate} label="Muddat (ixtiyoriy)" chips={false} />
        <Field label="Oylik jamg‘arma" hint="Rejalashtirilgan oylik summa">
          <TextInput
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(formatAmountInput(e.target.value))}
            inputMode="decimal"
            placeholder="3 000 000"
          />
        </Field>
      </AdvancedSection>
    </FormSheet>
  );
}

/** Goal contribution — one number, one action. */
function ContributeSheet({ goal, onClose }: { goal: GoalView | null; onClose: () => void }) {
  const { mutate, toast } = useFinance();
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!goal) return;
    setAmount("");
    setTouched(false);
  }, [goal]);

  // Retain the selected record until the shared primitive finishes its exit;
  // otherwise clearing page state would unmount the whole sheet mid-motion.
  const [record, setRecord] = useState<GoalView | null>(goal);
  useEffect(() => {
    if (goal) setRecord(goal);
  }, [goal]);
  const parsed = parseAmountInput(amount);
  const errorMsg = amountError(amount, "Jamg‘arma summasini kiriting");
  const valid = !errorMsg;

  async function submit() {
    setTouched(true);
    if (!record || !valid || parsed === null) return { ok: false, message: errorMsg ?? "" };
    const res = await mutate("goal", "contribute", { id: record.id, amount: parsed }, { silent: true });
    if (res.ok) toast(`${formatAmount(parsed)} so‘m jamg‘armaga qo‘shildi`, "success");
    return res;
  }

  if (!record) return null;

  return (
    <FormSheet
      open={Boolean(goal)}
      onClose={onClose}
      title={`${record.icon} ${record.name}`}
      subtitle={`Qolgan ${formatAmount(record.remaining)} so‘m`}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={Boolean(amount)}
      onSubmit={submit}
    >
      <AmountField
        value={amount}
        onChange={setAmount}
        label="Jamg‘arma summasi"
        currency="UZS"
        error={touched ? errorMsg : null}
        autoFocus
      />
      <FormActions>
        {[record.monthlyContribution, record.requiredMonthly]
          .filter((v) => v > 0)
          .map((v, i) => (
            <Chip key={i} onClick={() => setAmount(formatAmountInput(String(Math.round(v))))}>
              {compact(v)}
            </Chip>
          ))}
      </FormActions>
    </FormSheet>
  );
}
