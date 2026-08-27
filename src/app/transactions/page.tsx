"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useFinance } from "@/components/providers";
import { QuickAddSheet } from "@/components/quick-add";
import { SwipeActions } from "@/components/swipe-actions";
import { TransactionFilter, type TransactionFilterContext } from "@/components/transaction-filter";
import { Badge, Button, EmptyState, Label, Money, Sheet, Skeleton, TextInput } from "@/components/ui";
import { Icon } from "@/components/icon";
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

/** Row-icon tint per direction. Expense stays neutral on purpose (see below). */
const ROW_ICON_TONE: Record<string, { background: string; color: string }> = {
  income: { background: "var(--tint-green)", color: "var(--green)" },
  expense: { background: "var(--tint-neutral)", color: "var(--fg-soft)" },
  transfer: { background: "var(--tint-blue)", color: "var(--blue)" },
};

/** Direction shortcuts. "Hammasi" carries no icon — it is the absence of one. */
const TYPE_CHIPS: Array<{ value: TransactionFilterState["type"]; label: string; icon?: string }> = [
  { value: "all", label: "Hammasi" },
  { value: "income", label: "Daromad", icon: "arrow-up" },
  { value: "expense", label: "Xarajat", icon: "arrow-down" },
  { value: "transfer", label: "Transfer", icon: "transfer" },
];

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
  // Row actions are swipe-revealed (never permanently visible); at most one
  // row stays open at a time.
  const [openRowId, setOpenRowId] = useState<number | null>(null);

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
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true">
          <Icon name="search" size={18} />
        </span>
        <TextInput
          id="history-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Kategoriya, izoh yoki summa"
          autoComplete="off"
          // The shared input radius is 12px; the search field is the one place the
          // design asks for 15px, so it overrides rather than forking inputClass.
          className="h-[46px] rounded-[15px]! pl-10 pr-11"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Qidiruvni tozalash"
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3 touch-manipulation"
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>

      {/* Direction chips: the common filter, one tap away. They share
          filterState.type with the filter sheet, so opening the sheet always
          shows what the chips already selected. */}
      <div className="no-scrollbar -mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1" role="group" aria-label="Tur bo‘yicha filtr">
        {TYPE_CHIPS.map((chip) => {
          const active = filterState.type === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilterState((prev) => ({ ...prev, type: chip.value, categoryId: chip.value === "transfer" ? "" : prev.categoryId }))}
              style={active ? { background: "var(--gold-gradient)" } : undefined}
              className={`inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 transition-colors touch-manipulation ${
                active ? "border-transparent" : "border-line bg-surface"
              }`}
            >
              {chip.icon ? (
                <Icon
                  name={chip.icon}
                  size={13}
                  className={active ? "text-[color:var(--gold-on)]" : "text-faint"}
                />
              ) : null}
              <span className={`text-[12.5px] ${active ? "font-bold text-[color:var(--gold-on)]" : "font-semibold text-fg-soft"}`}>
                {chip.label}
              </span>
            </button>
          );
        })}
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
                <Icon name="close" size={12} />
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
        <span aria-hidden="true" className="text-text-4">·</span>
        <span className="font-medium">−{compact(totals.expense)}</span>
        <span aria-hidden="true" className="text-text-4">·</span>
        <span className="text-faint">{totals.count} ta</span>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon="search"
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
            const reportingItems = items.filter(
              (transaction) => (transaction.currency ?? state.user.currency) === state.user.currency,
            );
            const dayIn = reportingItems.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
            const dayOut = reportingItems.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
            return (
              <section key={date}>
                <div className="flex items-center justify-between gap-3 border-b border-line px-1 pb-2">
                  <Label>{humanDate(date)}</Label>
                  <span className="num flex items-center gap-2 text-[12px]">
                    {dayIn > 0 ? <span className="font-medium text-positive-text">+{compact(dayIn)}</span> : null}
                    {dayOut > 0 ? <span className="text-fg-soft">−{compact(dayOut)}</span> : null}
                  </span>
                </div>
                <div className="divide-y divide-line px-1">
                  {items.map((transaction) => (
                    // Row actions hide in the swipe underlay at rest; the row
                    // body itself keeps its exact resting layout.
                    <SwipeActions
                      key={transaction.id}
                      open={openRowId === transaction.id}
                      onOpenChange={(next) => setOpenRowId(next ? transaction.id : null)}
                      actions={
                        <>
                          <button
                            type="button"
                            onClick={() => (transaction.debtId ? null : setEditing(transaction))}
                            disabled={Boolean(transaction.debtId)}
                            title={transaction.debtId ? "Qarz operatsiyasi Qarzdorlik bo‘limidan boshqariladi" : undefined}
                            className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                            aria-label={transaction.debtId ? "Qarz operatsiyasi Qarzdorlik bo‘limidan boshqariladi" : "Tahrirlash"}
                          >
                            {/* Registry icon, not a text glyph: the Unicode pencil
                                (✎ U+270E) points to the LOWER right, so it reads
                                mirrored and varies by font. */}
                            <Icon name="edit" size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => (transaction.debtId && !transaction.debtPaymentId ? null : setDeleting(transaction))}
                            disabled={Boolean(transaction.debtId && !transaction.debtPaymentId)}
                            title={transaction.debtId && !transaction.debtPaymentId ? "Qarz ochilishi Qarzdorlik bo‘limidan bekor qilinadi" : undefined}
                            className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-negative-text active:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                            aria-label={transaction.debtId && !transaction.debtPaymentId ? "Qarz ochilishi Qarzdorlik bo‘limidan bekor qilinadi" : "Bekor qilish"}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </>
                      }
                    >
                      <div className="flex min-w-0 items-center gap-2.5 py-3 sm:gap-3">
                        {/* Tinted by direction so the eye can sort the column
                            without reading it: income green, transfer blue,
                            expense deliberately neutral — a page of red rows
                            reads as a page of errors. */}
                        <div
                          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px]"
                          style={ROW_ICON_TONE[transaction.type] ?? ROW_ICON_TONE.expense}
                        >
                          <Icon
                            name={transaction.type === "transfer" ? "transfer" : transaction.categoryIcon}
                            size={17}
                          />
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
                            {transaction.currency && transaction.currency !== state.user.currency
                              ? ` · ${transaction.currency}`
                              : ""}
                          </p>
                        </div>
                        <Money
                          value={transaction.type === "expense" ? -transaction.amount : transaction.amount}
                          size="sm"
                          signed
                          tone={transaction.type === "income" ? "positive" : transaction.type === "expense" ? "default" : "muted"}
                        />
                      </div>
                    </SwipeActions>
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
