"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useFinance } from "@/components/providers";
import { QuickAddSheet } from "@/components/quick-add";
import { TransactionFilter, type TransactionFilterContext } from "@/components/transaction-filter";
import { Badge, Button, EmptyState, Money, Sheet, Skeleton, TextInput } from "@/components/ui";
import { compact, humanDate } from "@/lib/money";
import { LOADING } from "@/lib/copy";
import type { TxView } from "@/lib/finance";
import {
  DEFAULT_TRANSACTION_FILTER_STATE,
  composeTransactionFilters,
  filterTransactions,
  localTransactionFilterCount,
  type TransactionFilterState,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<TransactionFilterState>({ ...DEFAULT_TRANSACTION_FILTER_STATE });
  const [editing, setEditing] = useState<TxView | null>(null);
  const [deleting, setDeleting] = useState<TxView | null>(null);

  const grouped = useMemo(() => {
    // Keep the established filtering pipeline and compose its input here. The
    // independently-owned search and filter states therefore combine with AND
    // semantics without either clear action resetting the other.
    const list = filterTransactions(state?.transactions ?? [], composeTransactionFilters(filterState, searchQuery), {
      planId: planFilter,
      incomeId: incomeFilter,
    });
    const map = new Map<string, typeof list>();
    for (const transaction of list) {
      map.set(transaction.date, [...(map.get(transaction.date) ?? []), transaction]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [state?.transactions, filterState, searchQuery, planFilter, incomeFilter]);

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

  const hasSearch = Boolean(searchQuery.trim());
  const hasActiveFilters = localTransactionFilterCount(filterState) > 0 || contexts.length > 0;

  return (
    <div className="animate-fade-up mx-auto w-full max-w-3xl space-y-3.5 sm:space-y-4">
      {/* No section-name headline: the page content starts at the top (§38). */}
      <div className="relative min-w-0">
        <label htmlFor="history-search" className="sr-only">
          Tarixdan qidirish
        </label>
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" strokeLinecap="round" />
          </svg>
        </span>
        <TextInput
          id="history-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Kategoriya, izoh yoki summa"
          autoComplete="off"
          className="pl-10 pr-11"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Qidiruvni tozalash"
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3 touch-manipulation"
          >
            ✕
          </button>
        ) : null}
      </div>

      <TransactionFilter
        filters={filterState}
        onChange={setFilterState}
        categories={state.flatCategories}
        contexts={contexts}
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
        aria-label={`Daromad ${totals.income}, xarajat ${totals.expense}, ${totals.count} ta operatsiya`}
        aria-live="polite"
      >
        <span className="font-semibold text-positive-text">+{compact(totals.income)}</span>
        <span aria-hidden="true" className="text-muted">·</span>
        <span className="font-medium">−{compact(totals.expense)}</span>
        <span aria-hidden="true" className="text-muted">·</span>
        <span>{totals.count} ta</span>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={
            state.transactions.length === 0
              ? "Tarix hozircha bo‘sh."
              : hasSearch
                ? "Hech narsa topilmadi."
                : "Tanlangan filtrlar bo‘yicha ma'lumot yo‘q."
          }
          description={
            state.transactions.length === 0
              ? "Operatsiyalar Asosiy sahifada kiritiladi."
              : hasSearch && hasActiveFilters
                ? "Qidiruv so‘rovi va faol filtrlarni tekshirib ko‘ring."
                : hasSearch
                  ? "Boshqa kategoriya, izoh yoki summani qidiring."
                  : "Filtrlarni o‘zgartirib ko‘ring."
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
                          {transaction.debtId ? <Badge tone={transaction.debtPaymentId ? "accent" : "neutral"}>Qarz</Badge> : null}
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
                          onClick={() => (transaction.debtId ? null : setEditing(transaction))}
                          disabled={Boolean(transaction.debtId)}
                          title={transaction.debtId ? "Qarz operatsiyasi Qarzdorlik bo‘limidan boshqariladi" : undefined}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={transaction.debtId ? "Qarz operatsiyasi Qarzdorlik bo‘limidan boshqariladi" : "Tahrirlash"}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => (transaction.debtId && !transaction.debtPaymentId ? null : setDeleting(transaction))}
                          disabled={Boolean(transaction.debtId && !transaction.debtPaymentId)}
                          title={transaction.debtId && !transaction.debtPaymentId ? "Qarz ochilishi Qarzdorlik bo‘limidan bekor qilinadi" : undefined}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-negative-text active:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={transaction.debtId && !transaction.debtPaymentId ? "Qarz ochilishi Qarzdorlik bo‘limidan bekor qilinadi" : "Bekor qilish"}
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
