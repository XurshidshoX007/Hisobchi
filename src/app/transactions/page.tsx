"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useFinance } from "@/components/providers";
import { QuickAddSheet } from "@/components/quick-add";
import { Badge, Button, EmptyState, FinancialRow, Money, PageHeader, Section, Segmented, Select, Sheet, Skeleton, TextInput } from "@/components/ui";
import { addDays, formatAmount, formatSigned, humanDate } from "@/lib/money";
import type { TxView } from "@/lib/finance";

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
  const [editing, setEditing] = useState<TxView | null>(null);
  const [deleting, setDeleting] = useState<TxView | null>(null);
  const [actionsFor, setActionsFor] = useState<TxView | null>(null);

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
        action={
          <Button type="button" size="sm" onClick={openCreate}>
            ➕ Qo‘shish
          </Button>
        }
      />

      {planScope ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-accent-soft px-3 py-2.5">
          <p className="min-w-0 text-[13px]">
            <span className="text-muted">Filtr:</span> <span className="font-semibold">{planScope}</span>
          </p>
          <Link href="/transactions" className="text-[12.5px] font-medium text-accent-text underline-offset-2 hover:underline">
            Olib tashlash
          </Link>
        </div>
      ) : null}

      <Section framed className="space-y-3">
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
          <Badge tone="positive">{formatSigned(totals.income)}</Badge>
          <Badge tone="neutral">{formatAmount(-totals.expense)}</Badge>
          <Badge tone="accent">{totals.count} ta</Badge>
          <Badge tone="neutral">sof {formatAmount(totals.income - totals.expense)}</Badge>
        </div>
      </Section>

      {grouped.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Operatsiya topilmadi"
          description="Filtr yoki qidiruv shartlarini o‘zgartiring."
          action={
            <Button type="button" onClick={openCreate}>
              ➕ Operatsiya qo‘shish
            </Button>
          }
        />
      ) : (
        <div className="space-y-5 sm:space-y-6">
          {grouped.map(([date, items]) => {
            const dayIn = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
            const dayOut = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
            const relative = date === state.forecast.today ? "Bugun" : date === addDays(state.forecast.today, -1) ? "Kecha" : null;
            return (
              <section key={date} aria-labelledby={`history-${date}`}>
                <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
                  <div>
                    <h2 id={`history-${date}`} className="text-[14px] font-semibold">{relative ?? humanDate(date)}</h2>
                    {relative ? <p className="mt-0.5 text-[10.5px] text-muted">{humanDate(date)}</p> : null}
                  </div>
                  <div className="num flex flex-wrap justify-end gap-2 text-[11px]">
                    {dayIn > 0 ? <span className="font-medium text-positive-text">{formatSigned(dayIn)}</span> : null}
                    {dayOut > 0 ? <span className="text-muted">{formatAmount(-dayOut)}</span> : null}
                  </div>
                </div>
                <div>
                  {items.map((t) => (
                    <FinancialRow key={t.id} interactive className="row-enter group flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base">
                        {t.type === "transfer" ? "↔️" : t.categoryIcon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[14px] font-medium">
                          <span className="truncate">
                            {t.type === "transfer" ? `${t.accountName} → ${t.toAccountName ?? ""}` : t.categoryName ?? "Boshqa"}
                          </span>
                          {t.recurringId ? <Badge tone="accent">Reja</Badge> : null}
                          {t.expectedIncomeId ? <Badge tone="positive">Kutilgan</Badge> : null}
                          {t.date > state.forecast.today ? <Badge tone="warning">Kelajak</Badge> : null}
                          {accountById.get(t.accountId)?.isActive === false ? <Badge tone="neutral">arxiv</Badge> : null}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-muted">
                          {t.note ? `${t.note} · ` : ""}{t.accountName}
                        </p>
                      </div>
                      <Money
                        value={t.type === "expense" ? -t.amount : t.amount}
                        size="sm"
                        signed
                        tone={t.type === "income" ? "positive" : t.type === "expense" ? "default" : "muted"}
                      />
                      <button
                        type="button"
                        onClick={() => setActionsFor(t)}
                        className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg"
                        aria-label={`${t.categoryName ?? "Operatsiya"} amallari`}
                      >
                        •••
                      </button>
                    </FinancialRow>
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

      <Sheet open={Boolean(actionsFor)} onClose={() => setActionsFor(null)} title={actionsFor?.categoryName ?? "Operatsiya amallari"}>
        <div className="space-y-1">
          <button
            type="button"
            className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-sm font-medium hover:bg-surface-2"
            onClick={() => {
              if (!actionsFor) return;
              setEditing(actionsFor);
              setActionsFor(null);
              setAddOpen(true);
            }}
          >
            ✎ Tahrirlash
          </button>
          <button
            type="button"
            className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-negative-text hover:bg-negative-soft"
            onClick={() => {
              setDeleting(actionsFor);
              setActionsFor(null);
            }}
          >
            O‘chirish
          </button>
        </div>
      </Sheet>
      <QuickAddSheet open={addOpen} onClose={closeSheet} editing={editing} />
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
