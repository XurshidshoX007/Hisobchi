"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useFinance } from "@/components/providers";
import { QuickAddSheet } from "@/components/quick-add";
import { TransactionFilter, type TransactionFilterContext } from "@/components/transaction-filter";
import { Badge, Button, EmptyState, Money, PageHeader, Sheet, Skeleton } from "@/components/ui";
import { compact, humanDate } from "@/lib/money";
import { LOADING } from "@/lib/copy";
import type { TxView } from "@/lib/finance";
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
  type TransactionFilters,
} from "@/lib/transaction-filters";

export default function TransactionsPage() {
  // useSearchParams needs a Suspense boundary during prerender (Next app router).
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TransactionsView />
    </Suspense>
  );
}

function TransactionsView() {
  const { state, loading } = useFinance();
  // Plan ↔ History links remain route-owned context. They are deliberately
  // separate from the local filter state and combine with it using AND logic.
  const params = useSearchParams();
  const planFilter = Number(params.get("plan")) || null;
  const incomeFilter = Number(params.get("income")) || null;
  const [filters, setFilters] = useState<TransactionFilters>({ ...DEFAULT_TRANSACTION_FILTERS });
  const [editing, setEditing] = useState<TxView | null>(null);
  const [deleting, setDeleting] = useState<TxView | null>(null);

  const grouped = useMemo(() => {
    const list = filterTransactions(state?.transactions ?? [], filters, {
      planId: planFilter,
      incomeId: incomeFilter,
    });
    const map = new Map<string, typeof list>();
    for (const transaction of list) {
      map.set(transaction.date, [...(map.get(transaction.date) ?? []), transaction]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [state?.transactions, filters, planFilter, incomeFilter]);

  const totals = useMemo(() => {
    const list = grouped.flatMap(([, transactions]) => transactions);
    return {
      income: list.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + transaction.amount, 0),
      expense: list.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0),
      count: list.length,
    };
  }, [grouped]);

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const accountById = new Map(state.accounts.map((account) => [account.id, account]));
  const linkedPlan = planFilter ? state.recurring.find((plan) => plan.id === planFilter) ?? null : null;
  const linkedIncome = incomeFilter ? state.expectedIncomes.find((income) => income.id === incomeFilter) ?? null : null;

  function clearContextHref(key: "plan" | "income") {
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    const query = next.toString();
    return query ? `/transactions?${query}` : "/transactions";
  }

  const contexts: TransactionFilterContext[] = [];
  if (planFilter) {
    contexts.push({
      key: "plan",
      label: "Reja",
      name: linkedPlan?.name ?? `Reja #${planFilter}`,
      clearHref: clearContextHref("plan"),
    });
  }
  if (incomeFilter) {
    contexts.push({
      key: "income",
      label: "Daromad",
      name: linkedIncome?.sourceName ?? `Daromad #${incomeFilter}`,
      clearHref: clearContextHref("income"),
    });
  }

  const net = totals.income - totals.expense;

  return (
    <div className="animate-fade-up mx-auto w-full max-w-3xl space-y-3.5 sm:space-y-4">
      <PageHeader
        title="Tarix"
        action={
          <TransactionFilter
            filters={filters}
            onChange={setFilters}
            categories={state.flatCategories}
            contexts={contexts}
          />
        }
      />

      {contexts.length ? (
        <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Tarix konteksti">
          {contexts.map((context) => (
            <div
              key={context.key}
              className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-[12px] text-accent-text"
            >
              <span className="shrink-0 text-muted">{context.label}:</span>
              <span className="min-w-0 truncate font-semibold">{context.name}</span>
              <Link
                href={context.clearHref}
                aria-label={`${context.label} kontekstini olib tashlash`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface/70 touch-manipulation"
              >
                ✕
              </Link>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className="num flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11.5px] text-fg-soft sm:text-[12px]"
        aria-label={`Daromad ${totals.income}, xarajat ${totals.expense}, ${totals.count} ta operatsiya, sof ${net}`}
        aria-live="polite"
      >
        <span className="font-semibold text-positive-text">+{compact(totals.income)}</span>
        <span aria-hidden="true" className="text-muted">·</span>
        <span className="font-medium">−{compact(totals.expense)}</span>
        <span aria-hidden="true" className="text-muted">·</span>
        <span>{totals.count} ta</span>
        <span aria-hidden="true" className="text-muted">·</span>
        <span className={net > 0 ? "font-medium text-positive-text" : net < 0 ? "font-medium text-negative-text" : ""}>
          Sof {net > 0 ? "+" : net < 0 ? "−" : ""}{compact(net)}
        </span>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={state.transactions.length === 0 ? "Tarix hozircha bo‘sh." : "Operatsiya topilmadi"}
          description={
            state.transactions.length === 0
              ? "Operatsiyalar Asosiy sahifada kiritiladi."
              : "Filtrni o‘zgartirib ko‘ring."
          }
        />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {grouped.map(([date, items]) => {
            const dayIn = items.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
            const dayOut = items.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
            return (
              <section key={date}>
                <div className="flex items-center justify-between gap-3 border-b border-line px-1 pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{humanDate(date)}</span>
                  <span className="num flex items-center gap-2 text-[12px]">
                    {dayIn > 0 ? <span className="font-medium text-positive-text">+{compact(dayIn)}</span> : null}
                    {dayOut > 0 ? <span className="text-fg-soft">−{compact(dayOut)}</span> : null}
                  </span>
                </div>
                <div className="divide-y divide-line px-1">
                  {items.map((transaction) => (
                    <div key={transaction.id} className="group flex min-w-0 items-center gap-2.5 py-3 sm:gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base">
                        {transaction.type === "transfer" ? "↔️" : transaction.categoryIcon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-1.5 truncate text-[14px] font-medium">
                          <span className="truncate">
                            {transaction.type === "transfer"
                              ? `${transaction.accountName} → ${transaction.toAccountName ?? ""}`
                              : transaction.categoryName ?? "Boshqa"}
                          </span>
                          {transaction.recurringId ? <Badge tone="accent">To‘lov</Badge> : null}
                          {transaction.expectedIncomeId ? <Badge tone="positive">Reja</Badge> : null}
                          {transaction.date > state.forecast.today ? <Badge tone="warning">Kelajak</Badge> : null}
                          {accountById.get(transaction.accountId)?.isActive === false ? (
                            <Badge tone="neutral">Arxiv</Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-[11.5px] text-muted">
                          {transaction.note ? `${transaction.note} · ` : ""}
                          {transaction.accountName}
                        </p>
                      </div>
                      <Money
                        value={transaction.type === "expense" ? -transaction.amount : transaction.amount}
                        size="sm"
                        signed
                        tone={transaction.type === "income" ? "positive" : transaction.type === "expense" ? "default" : "muted"}
                      />
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditing(transaction)}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3 touch-manipulation sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label="Tahrirlash"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(transaction)}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-negative-text active:bg-surface-3 touch-manipulation sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label="Bekor qilish"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <QuickAddSheet open={Boolean(editing)} onClose={() => setEditing(null)} editing={editing} />
      <DeleteConfirm tx={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DeleteConfirm({ tx, onClose }: { tx: TxView | null; onClose: () => void }) {
  const { state, mutate } = useFinance();
  const [saving, setSaving] = useState(false);
  const linkedPlan = tx?.recurringId
    ? state?.recurring.find((r) => r.id === tx.recurringId) ?? null
    : null;
  const linkedIncome = tx?.expectedIncomeId
    ? state?.expectedIncomes.find((i) => i.id === tx.expectedIncomeId) ?? null
    : null;
  const linked = Boolean(linkedPlan || linkedIncome);

  async function confirm() {
    if (!tx || saving) return;
    setSaving(true);
    try {
      await mutate("transaction", "delete", { id: tx.id });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  // A plan-linked delete reconciles its occurrence: the scheduled date is
  // restored and (for term plans) the paid counter steps back. A cancelled
  // plan never re-appears — only its historical payment is removed.
  const revertNote = linkedPlan
    ? linkedPlan.planType === "term" && linkedPlan.installmentCount !== null
      ? `Reja qayta ochiladi: ${linkedPlan.installmentsPaid}/${linkedPlan.installmentCount} → ${Math.max(
          0,
          linkedPlan.installmentsPaid - 1,
        )}/${linkedPlan.installmentCount}.`
      : "Reja qayta ochiladi."
    : linkedIncome
      ? "Daromad rejasi qayta ochiladi."
      : null;

  const cancelledNote =
    linkedPlan?.status === "cancelled" || linkedIncome?.status === "cancelled"
      ? " Reja bekor qilingan — faqat shu to‘lov o‘chiriladi."
      : "";

  return (
    <Sheet
      open={Boolean(tx)}
      onClose={onClose}
      title={linked ? "To‘lovni o‘chirish" : "Operatsiyani o‘chirish"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="danger" className="flex-[2]" onClick={confirm} disabled={saving}>
            {saving ? LOADING.deleting : "O‘chirish"}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed">
        {tx?.note ? (
          <>
            <span className="font-semibold">{tx.note}</span> operatsiyasi o‘chiriladi.
          </>
        ) : (
          "Ushbu operatsiya o‘chiriladi."
        )}
      </p>
      <p className="text-[13px] leading-relaxed text-muted">
        {linked ? `${revertNote ?? ""}${cancelledNote}`.trim() : "Tarixdan olib tashlanadi."}
      </p>
    </Sheet>
  );
}
