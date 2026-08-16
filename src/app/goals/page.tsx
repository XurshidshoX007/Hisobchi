"use client";
/* eslint-disable react-hooks/set-state-in-effect -- modal contribution drafts synchronize to selected goal */

import { useEffect, useState } from "react";
import { useFinance } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Field, Money, PageHeader, Progress, Sheet, Skeleton, TextInput } from "@/components/ui";
import { formatCompactAmount, formatAmount, humanDate } from "@/lib/money";
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

  function closeSheet() {
    setSheet(false);
    setEditing(null);
  }

  if (loading && !state) return <Skeleton className="h-72 w-full" />;
  if (!state) return null;

  const totalTarget = state.goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = state.goals.reduce((s, g) => s + g.savedAmount, 0);
  const monthly = state.goals.reduce((s, g) => s + g.requiredMonthly, 0);

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      <PageHeader
        title="Maqsadlar"
        subtitle="Jamg‘arma rejalari va taxminiy muddatlar"
        action={
          <Button type="button" size="sm" onClick={openCreate}>
            ➕ Maqsad
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Jami maqsad</p>
          <div className="mt-1.5">
            <Money value={totalTarget} size="lg" />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Yig‘ilgan</p>
          <div className="mt-1.5">
            <Money value={totalSaved} size="lg" tone="positive" />
          </div>
          <div className="mt-2">
            <Progress value={totalTarget > 0 ? totalSaved / totalTarget : 0} height={6} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Kerakli oylik</p>
          <div className="mt-1.5">
            <Money value={monthly} size="lg" />
          </div>
          <p className="mt-1 text-[11.5px] text-muted">barcha maqsadlar uchun</p>
        </Card>
      </div>

      {state.goals.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
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
                <Badge tone={g.onTrack ? "positive" : "warning"}>{g.onTrack ? "rejada" : "ortda"}</Badge>
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-2">
                <Money value={g.savedAmount} size="lg" tone="positive" />
                <span className="num max-w-[48%] break-words text-right text-[12px] text-muted">/ {formatAmount(g.targetAmount)}</span>
              </div>
              <div className="mt-2">
                <Progress value={g.progress} />
                <p className="mt-1.5 text-[11.5px] text-muted">
                  {(g.progress * 100).toFixed(0)}% · qolgan {formatCompactAmount(g.remaining)}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[11.5px]">
                <div className="min-w-0">
                  <p className="text-muted">Oylik</p>
                  <p className="num mt-0.5 break-words text-[13px] font-medium">{formatAmount(g.monthlyContribution)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted">Kerakli oylik</p>
                  <p className="num mt-0.5 break-words text-[13px] font-medium">{formatAmount(g.requiredMonthly)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted">Taxminiy tugash</p>
                  <p className="mt-0.5 truncate text-[13px] font-medium">{g.etaDate ? humanDate(g.etaDate) : "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted">Holat</p>
                  <p className="mt-0.5 truncate text-[13px] font-medium">
                    {g.monthlyContribution >= g.requiredMonthly ? "yetadi" : "tezlashtirish kerak"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setGoal(g)}
                  className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-accent hover:text-accent-text active:bg-surface-3 touch-manipulation"
                >
                  Jamg‘arma +
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
        <EmptyState
          icon="🏆"
          title="Maqsadlar yo‘q"
          description="Mashina, zaxira jamg‘arma yoki sayohat uchun maqsad qo‘shing."
          action={
            <Button type="button" onClick={openCreate}>
              ➕ Birinchi maqsad
            </Button>
          }
        />
      )}

      <GoalSheet open={sheet} onClose={closeSheet} editing={editing} />
      <ContributeSheet goal={goal} onClose={() => setGoal(null)} />
    </div>
  );
}

function GoalSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: GoalView | null }) {
  const { mutate } = useFinance();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [targetAmount, setTargetAmount] = useState("");
  const [savedAmount, setSavedAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthlyContribution, setMonthlyContribution] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? "🎯");
    setTargetAmount(editing ? String(editing.targetAmount) : "");
    setSavedAmount(editing ? String(editing.savedAmount) : "");
    setTargetDate(editing?.targetDate ?? "");
    setMonthlyContribution(editing ? String(editing.monthlyContribution) : "");
  }, [open, editing]);

  async function save() {
    const target = Number(targetAmount.replace(/\s/g, ""));
    if (!name.trim() || !target) return;
    const res = await mutate("goal", editing ? "update" : "create", {
      id: editing?.id,
      name: name.trim(),
      icon: icon || "🎯",
      targetAmount: target,
      savedAmount: Number(savedAmount.replace(/\s/g, "") || 0),
      targetDate: targetDate || null,
      monthlyContribution: Number(monthlyContribution.replace(/\s/g, "") || 0),
    });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Maqsadni tahrirlash" : "Yangi maqsad"}
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
      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Field label="Nomi">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Mashina" />
        </Field>
        <Field label="Ikona">
          <TextInput value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🚗" />
        </Field>
      </div>
      <Field label="Maqsad summasi">
        <TextInput value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} inputMode="decimal" placeholder="100000000" />
      </Field>
      {!editing ? (
        <Field label="Yig‘ilgan">
          <TextInput value={savedAmount} onChange={(e) => setSavedAmount(e.target.value)} inputMode="decimal" placeholder="25000000" />
        </Field>
      ) : (
        <div className="flat-card flex items-center justify-between p-3 text-sm">
          <span className="text-muted">Yig‘ilgan summa</span>
          <Money value={editing.savedAmount} size="sm" tone="positive" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mo‘ljaldangan sana">
          <TextInput type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
        <Field label="Oylik jamg‘arma">
          <TextInput
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            inputMode="decimal"
            placeholder="3000000"
          />
        </Field>
      </div>
    </Sheet>
  );
}

function ContributeSheet({ goal, onClose }: { goal: GoalView | null; onClose: () => void }) {
  const { mutate } = useFinance();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!goal) setAmount("");
  }, [goal]);

  if (!goal) return null;
  const record = goal;

  async function save() {
    const value = Number(amount.replace(/\s/g, ""));
    if (!value) return;
    const res = await mutate("goal", "contribute", { id: record.id, amount: value });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={Boolean(goal)}
      onClose={onClose}
      title={`${record.icon} ${record.name}`}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={save}>
            Qo‘shish
          </Button>
        </>
      }
    >
      <div className="flat-card p-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted">Yig‘ilgan</span>
          <Money value={record.savedAmount} size="sm" tone="positive" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-muted">Qolgan</span>
          <Money value={record.remaining} size="sm" />
        </div>
      </div>
      <Field label="Jamg‘arma summasi">
        <TextInput
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder={String(record.monthlyContribution || 500000)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {[record.monthlyContribution, record.requiredMonthly].filter(Boolean).map((v, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setAmount(String(Math.round(v)))}
            className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
          >
            {formatCompactAmount(v)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
