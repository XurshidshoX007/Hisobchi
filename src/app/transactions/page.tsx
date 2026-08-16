"use client";
/* eslint-disable react-hooks/set-state-in-effect -- routed FAB creates synchronize the sheet to the pending action on mount */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { QuickAddSheet } from "@/components/quick-add";
import { Badge, Button, EmptyState, Money, PageHeader, Segmented, Select, Sheet, Skeleton, TextInput } from "@/components/ui";
import { compact, humanDate } from "@/lib/money";
import type { TxView } from "@/lib/finance";
import { lastTxType, type FabTransactionType } from "@/lib/fab";

type Filter = "all" | "income" | "expense" | "transfer";

export default function TransactionsPage() {
  // useSearchParams needs a Suspense boundary during prerender (Next app router).
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TransactionsView />
    </Suspense>
  );
}

function TransactionsView() {
  const { state, loading, mutate } = useFinance();
  // Plan ↔ History link (§27): "2 ta to'lov" on a plan card opens exactly the
  // real transactions that fulfil THAT plan's occurrences.
  const params = useSearchParams();
  const planFilter = Number(params.get("plan")) || null;
  const incomeFilter = Number(params.get("income")) || null;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<FabTransactionType>("expense");
  const [editing, setEditing] = useState<TxView | null>(null);
  const [deleting, setDeleting] = useState<TxView | null>(null);

  // Global FAB exposes Kirim / Chiqim / Transfer and opens the existing shared
  // QuickAddSheet with that direction preselected.
  useFabPage({ txFilter: filter }, { transaction: (a) => { setDefaultType(a.type ?? lastTxType()); openCreate(); } });

  // Any routed transaction action opens the same shared QuickAddSheet.
  const { consume } = useFab();
  useEffect(() => {
    const routed = consume();
    if (routed && routed.id === "transaction") {
      setDefaultType(routed.type ?? lastTxType());
      setEditing(null);
      setAddOpen(true);
    }
  }, [consume]);

  function openCreate() {
    setEditing(null);
    setAddOpen(true);
  }

  function closeSheet() {
    setAddOpen(false);
    setEditing(null);
  }

  const grouped = useMemo(() => {
    const list = (state?.transactions ?? []).filter((t) => {
      if (planFilter && t.recurringId !== planFilter) return false;
      if (incomeFilter && t.expectedIncomeId !== incomeFilter) return false;
      if (filter !== "all" && t.type !== filter) return false;
      if (category && String(t.categoryId ?? "") !== category) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${t.note ?? ""} ${t.categoryName ?? ""} ${t.accountName}`.toLowerCase();
        if (!hay.includes(q) && !String(t.amount).includes(q)) return false;
      }
      return true;
    });
    const map = new Map<string, typeof list>();
    for (const t of list) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [state?.transactions, filter, query, category, planFilter, incomeFilter]);

  const totals = useMemo(() => {
    const list = grouped.flatMap(([, v]) => v);
    return {
      income: list.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expense: list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      count: list.length,
    };
  }, [grouped]);

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const categories = state.flatCategories.filter((c) => c.isActive);
  const accountById = new Map(state.accounts.map((a) => [a.id, a]));
  const linkedPlan = planFilter ? state.recurring.find((r) => r.id === planFilter) ?? null : null;
  const linkedIncome = incomeFilter ? state.expectedIncomes.find((i) => i.id === incomeFilter) ?? null : null;
  const planScope = linkedPlan?.name ?? linkedIncome?.sourceName ?? null;

  return (
    <div className="animate-fade-up space-y-3.5 sm:space-y-4">
      <PageHeader
        title="Operatsiyalar"
        subtitle={planScope ? `${planScope} rejasi bo‘yicha to‘lovlar tarixi` : "Real pul harakatlari"}
      />

      {planScope ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-accent-soft px-4 py-2.5">
          <p className="min-w-0 text-[13px]">
            <span className="text-muted">Filtr:</span> <span className="font-semibold">{planScope}</span>
          </p>
          <Link href="/transactions" className="text-[12.5px] font-medium text-accent-text underline-offset-2 hover:underline">
            Filtrni olib tashlash
          </Link>
        </div>
      ) : null}

      {/* Filter / search — the page's control strip, not a card (§16/§27). */}
      <div className="space-y-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Hammasi" },
            { value: "income", label: "Kirim" },
            { value: "expense", label: "Chiqim" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Qidirish: kategoriya, izoh, summa" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Barcha kategoriyalar</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <Badge tone="positive">+{compact(totals.income)}</Badge>
          <Badge tone="neutral">−{compact(totals.expense)}</Badge>
          <Badge tone="accent">{totals.count} ta</Badge>
          <Badge tone="neutral">sof {compact(totals.income - totals.expense)}</Badge>
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Operatsiya topilmadi"
          description="Filtr yoki qidiruv shartlarini o‘zgartiring. Yangi operatsiya uchun pastdagi + tugmasidan foydalaning."
        />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {/* LIST FIRST (§16): date groups are separated by spacing and a
              divider — no frame around every day, no card around every row. */}
          {grouped.map(([date, items]) => {
            const dayIn = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
            const dayOut = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
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
                  {items.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 py-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base">
                        {t.type === "transfer" ? "↔️" : t.categoryIcon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                          <span className="truncate">
                            {t.type === "transfer" ? `${t.accountName} → ${t.toAccountName ?? ""}` : t.categoryName ?? "Boshqa"}
                          </span>
                          {t.recurringId ? <Badge tone="accent">Reja to‘lovi</Badge> : null}
                          {t.expectedIncomeId ? <Badge tone="positive">Kutilgan daromad</Badge> : null}
                          {/* A confirmed but future-dated ledger event is real, yet it is
                              deliberately NOT part of today's balance — say so explicitly. */}
                          {t.date > state.forecast.today ? <Badge tone="warning">Kelajak sana</Badge> : null}
                          {accountById.get(t.accountId)?.isActive === false ? (
                            <Badge tone="neutral">arxiv hisob</Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-[11.5px] text-muted">
                          {t.note ? `${t.note} · ` : ""}
                          {t.accountName}
                        </p>
                      </div>
                      <Money
                        value={t.type === "expense" ? -t.amount : t.amount}
                        size="sm"
                        signed
                        tone={t.type === "income" ? "positive" : t.type === "expense" ? "default" : "muted"}
                      />
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(t);
                            setAddOpen(true);
                          }}
                          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-3 touch-manipulation sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label="Tahrirlash"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(t)}
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

      <p className="px-1 text-center text-[11px] leading-snug text-muted">
        Muhim operatsiyalar o‘chirilmaydi — belgilanadi va tarix saqlanadi.
      </p>

      <QuickAddSheet open={addOpen} onClose={closeSheet} editing={editing} defaultType={defaultType} />
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
      ? `Reja hisobidagi occurrence qayta tiklanadi: ${linkedPlan.installmentsPaid}/${linkedPlan.installmentCount} → ${Math.max(
          0,
          linkedPlan.installmentsPaid - 1,
        )}/${linkedPlan.installmentCount}.`
      : "Reja hisobidagi occurrence qayta tiklanadi."
    : linkedIncome
      ? "Daromad rejasidagi occurrence qayta tiklanadi."
      : null;

  const cancelledNote =
    linkedPlan?.status === "cancelled" || linkedIncome?.status === "cancelled"
      ? " Reja bekor qilinganligi uchun kelajakdagi to‘lovlar qaytmaydi — faqat shu tarixiy to‘lov o‘chiriladi."
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
            {saving ? "O‘chirilmoqda…" : "O‘chirish"}
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
        {linked
          ? `Bu to‘lov tarixdan o‘chiriladi. ${revertNote ?? ""}${cancelledNote}`
          : "Operatsiya tarixdan olib tashlanadi."}
      </p>
    </Sheet>
  );
}
