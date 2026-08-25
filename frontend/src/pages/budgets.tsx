/* eslint-disable react-hooks/set-state-in-effect -- modal form draft reset is synchronized to open state */

import { useEffect, useState } from "react";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { AmountField, Chip, FormActions, FormSheet, PreviewCard } from "@/components/form-kit";
import { Badge, Card, EmptyState, Field, Money, Progress, Select, Skeleton } from "@/components/ui";
import { amountError, formatAmountInput, isDirtyDraft, parseAmountInput } from "@/lib/form-kit";
import { addMonths, compact, formatAmount, monthKey, monthLabel, monthStart, todayISO } from "@hisobchi/shared/lib/money";
import type { BudgetView } from "@hisobchi/shared/lib/finance";

export function BudgetsPage() {
  const { state, loading, mutate } = useFinance();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<BudgetView | null>(null);

  function openCreate() {
    setEditing(null);
    setSheet(true);
  }

  // Global FAB → existing BudgetSheet.
  useFabPage({}, { budget: () => openCreate() });

  // Routed creates (Menu → "+ Budjet").
  const { consume } = useFab();
  useEffect(() => {
    const routed = consume();
    if (routed?.id === "budget") openCreate();
  }, [consume]);

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
      {/* §22: swipe-back replaces the old ‹ Menyu back link. */}

      {/* §15: Budgets owns limits + usage — ONE summary card, no Dashboard
          balance and no per-status count grid (statuses already live on each
          budget row as a badge). */}
      {budgets.length ? (
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
            <Progress value={totalLimit > 0 ? totalSpent / totalLimit : 0} height={10} ariaLabel="Umumiy budjet ishlatilishi" />
            <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted">
              <span>{totalLimit > 0 ? ((totalSpent / totalLimit) * 100).toFixed(0) : 0}% ishlatildi</span>
              <span>{exceeded > 0 ? `${exceeded} ta limit oshdi` : warning > 0 ? `${warning} ta ogohlantirish` : "Limitlar normal"}</span>
            </div>
          </div>
        </Card>
      ) : null}

      {budgets.length ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
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
                <div className="mt-2 flex items-baseline justify-between text-[12px]">
                  <span className="num font-medium text-fg-soft">{formatAmount(b.spent)}</span>
                  <span className="num text-muted">limit {formatAmount(b.amount)}</span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
                  {b.spent > b.amount
                    ? `Limit ${compact(b.spent - b.amount)} oshdi`
                    : `Qoldi ${compact(b.amount - b.spent)} · kuniga ${compact(Math.max(0, b.amount - b.spent) / Math.max(1, daysLeft))}`}
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
        <EmptyState icon="🎯" title="Budjetlar yo‘q." description="Pastdagi + tugmasi orqali budjet qo‘shing." />
      )}

      <BudgetSheet open={sheet} onClose={closeSheet} editing={editing} />
    </div>
  );
}

/**
 * §20: category + limit + month. The product has no alert-threshold column, so
 * the form does not invent one — the 80% warning stays a system behaviour.
 */
function BudgetSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: BudgetView | null }) {
  const { state, mutate, toast } = useFinance();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState("");
  const [touched, setTouched] = useState(false);
  const [initialDraft, setInitialDraft] = useState<Record<string, string>>({});

  const thisMonth = state?.analytics.month ?? monthKey(todayISO());
  const nextMonth = monthKey(addMonths(monthStart(`${thisMonth}-01`), 1));

  useEffect(() => {
    if (!open) return;
    const draft = {
      categoryId: editing?.categoryId ? String(editing.categoryId) : "",
      amount: editing ? formatAmountInput(String(editing.amount)) : "",
      month: editing?.month ?? thisMonth,
    };
    setCategoryId(draft.categoryId);
    setAmount(draft.amount);
    setMonth(draft.month);
    setTouched(false);
    setInitialDraft(draft);
  }, [open, editing, thisMonth]);

  const categories = (state?.flatCategories ?? []).filter((c) => c.type === "expense" && c.isActive);
  const categoryName = categoryId
    ? categories.find((c) => String(c.id) === categoryId)?.name ?? "Kategoriya"
    : "Umumiy oylik";

  const errorMsg = amountError(amount, "Limitni kiriting");
  const valid = !errorMsg;
  const parsed = parseAmountInput(amount) ?? 0;
  const dirty = isDirtyDraft({ categoryId, amount, month }, initialDraft);

  async function submit() {
    setTouched(true);
    if (!valid) return { ok: false, message: errorMsg ?? "" };
    const res = await mutate(
      "budget",
      "upsert",
      {
        categoryId: categoryId ? Number(categoryId) : null,
        month: month || thisMonth,
        amount: parsed,
      },
      { silent: true },
    );
    if (res.ok) toast(`${categoryName} · ${formatAmount(parsed)} so‘m limit saqlandi`, "success");
    return res;
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? "Budjetni tahrirlash" : "+ Budjet"}
      subtitle={editing ? undefined : "Qaysi kategoriyaga oylik limit?"}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={dirty}
      onSubmit={submit}
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

      <AmountField
        value={amount}
        onChange={setAmount}
        label="Oylik limit"
        currency="UZS"
        error={touched ? errorMsg : null}
        autoFocus={!editing}
      />

      {!editing ? (
        <div>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Oy</span>
          <FormActions>
            <Chip active={month === thisMonth} onClick={() => setMonth(thisMonth)}>
              {monthLabel(thisMonth)}
            </Chip>
            <Chip active={month === nextMonth} onClick={() => setMonth(nextMonth)}>
              {monthLabel(nextMonth)}
            </Chip>
          </FormActions>
        </div>
      ) : null}

      {parsed > 0 ? (
        <PreviewCard>
          <p className="min-w-0 break-words text-[13px] font-semibold">{categoryName}</p>
          <p className="num mt-0.5 break-words text-[12.5px] text-muted">
            {formatAmount(parsed)} so‘m / {monthLabel(month || thisMonth)} · 80% da ogohlantirish
          </p>
        </PreviewCard>
      ) : null}
    </FormSheet>
  );
}
