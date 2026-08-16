"use client";
/* eslint-disable react-hooks/set-state-in-effect -- modal form draft reset is synchronized to open state */

import { useEffect, useState } from "react";
import { useFinance } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Field, Money, PageHeader, Progress, Select, Sheet, Skeleton, TextInput } from "@/components/ui";
import { formatCompactAmount, formatAmount, monthLabel } from "@/lib/money";
import type { BudgetView } from "@/lib/finance";

export default function BudgetsPage() {
  const { state, loading, mutate } = useFinance();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<BudgetView | null>(null);

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

  const budgets = state.budgets;
  const totalLimit = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const exceeded = budgets.filter((b) => b.status === "exceeded").length;
  const warning = budgets.filter((b) => b.status === "warning").length;
  const daysLeft = state.analytics.monthTotals.daysInMonth - state.analytics.monthTotals.daysElapsed;

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      <PageHeader
        title="Budjetlar"
        subtitle={`${monthLabel(state.analytics.month)} · ${daysLeft} kun qoldi`}
        action={
          <Button type="button" size="sm" onClick={openCreate}>
            ➕ Limit
          </Button>
        }
      />

      <Card>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Umumiy limit</p>
            <div className="mt-1.5">
              <Money value={totalLimit} size="xl" />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Sarflandi</p>
            <div className="mt-1.5">
              <Money value={totalSpent} size="lg" />
            </div>
          </div>
        </div>
        <div className="mt-3.5">
          <Progress value={totalLimit > 0 ? totalSpent / totalLimit : 0} height={10} />
          <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted">
            <span>{totalLimit > 0 ? ((totalSpent / totalLimit) * 100).toFixed(0) : 0}% ishlatildi</span>
            <span>{exceeded > 0 ? `${exceeded} oshdi` : warning > 0 ? `${warning} ogohlantirish` : "normal"}</span>
          </div>
        </div>
        <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-[11px] sm:mt-4 sm:gap-3 sm:pt-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Normal</p>
            <p className="num mt-0.5 text-sm font-semibold">{budgets.filter((b) => b.status === "normal").length}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-warning-text">Warning</p>
            <p className="num mt-0.5 text-sm font-semibold">{warning}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-negative-text">Exceeded</p>
            <p className="num mt-0.5 text-sm font-semibold">{exceeded}</p>
          </div>
        </div>
      </Card>

      {budgets.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          {budgets.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-3 text-lg">{b.categoryIcon}</div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium">{b.categoryName}</p>
                    <p className="text-[11.5px] text-muted">{monthLabel(b.month)}</p>
                  </div>
                </div>
                <Badge tone={b.status === "exceeded" ? "negative" : b.status === "warning" ? "warning" : "positive"}>
                  {(b.usage * 100).toFixed(0)}%
                </Badge>
              </div>
              <div className="mt-4">
                <Progress value={b.usage} />
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12px]">
                  <span className="num break-words font-medium text-fg-soft">{formatAmount(b.spent)}</span>
                  <span className="num break-words text-right text-muted">limit {formatAmount(b.amount)}</span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
                  {b.spent > b.amount
                    ? `Limit ${formatCompactAmount(b.spent - b.amount)} oshdi`
                    : `Qoldi ${formatCompactAmount(b.amount - b.spent)} · kuniga ${formatCompactAmount(Math.max(0, b.amount - b.spent) / Math.max(1, daysLeft))}`}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(b);
                    setSheet(true);
                  }}
                  className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                >
                  Tahrir
                </button>
                <button
                  type="button"
                  onClick={() => mutate("budget", "delete", { id: b.id })}
                  className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-muted transition-colors hover:text-fg active:bg-surface-3 touch-manipulation"
                >
                  O‘chirish
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="🎯"
          title="Budjet belgilanmagan"
          description="Toifalar uchun oylik limit qo‘ying — tizim 80% da ogohlantiradi."
          action={
            <Button type="button" onClick={openCreate}>
              ➕ Birinchi budjet
            </Button>
          }
        />
      )}

      <BudgetSheet open={sheet} onClose={closeSheet} editing={editing} />
    </div>
  );
}

function BudgetSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: BudgetView | null }) {
  const { state, mutate } = useFinance();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategoryId(editing?.categoryId ? String(editing.categoryId) : "");
    setAmount(editing ? String(editing.amount) : "");
  }, [open, editing]);

  const categories = (state?.flatCategories ?? []).filter((c) => c.type === "expense" && c.isActive);

  async function save() {
    const value = Number(amount.replace(/\s/g, ""));
    if (!value) return;
    const res = await mutate("budget", "upsert", {
      categoryId: categoryId ? Number(categoryId) : null,
      month: state?.analytics.month,
      amount: value,
    });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Budjetni tahrirlash" : "Budjet limiti"}
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
      <Field label="Kategoriya" hint="Bo‘sh qoldirilsa — umumiy oylik limit">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={Boolean(editing)}>
          <option value="">Umumiy oylik</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Oylik limit">
        <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="2000000" />
      </Field>
    </Sheet>
  );
}
