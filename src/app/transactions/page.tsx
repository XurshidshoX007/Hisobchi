"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/components/providers";
import { QuickAddSheet } from "@/components/quick-add";
import { Badge, Button, Card, EmptyState, Money, PageHeader, Segmented, Select, Skeleton, TextInput } from "@/components/ui";
import { compact, formatAmount, humanDate } from "@/lib/money";

type Filter = "all" | "income" | "expense" | "transfer";

export default function TransactionsPage() {
  const { state, loading, mutate } = useFinance();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const grouped = useMemo(() => {
    const list = (state?.transactions ?? []).filter((t) => {
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
  }, [state?.transactions, filter, query, category]);

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

  return (
    <div className="animate-fade-up space-y-3.5 sm:space-y-4">
      <PageHeader
        title="Operatsiyalar"
        subtitle="Real pul harakatlari"
        action={
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            ➕ Qo‘shish
          </Button>
        }
      />

      <Card className="space-y-3">
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
      </Card>

      {grouped.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Operatsiya topilmadi"
          description="Filtr yoki qidiruv shartlarini o‘zgartiring."
          action={
            <Button type="button" onClick={() => setAddOpen(true)}>
              ➕ Operatsiya qo‘shish
            </Button>
          }
        />
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {grouped.map(([date, items]) => {
            const dayIn = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
            const dayOut = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
            return (
              <Card key={date} padded={false} className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5 sm:py-3">
                  <span className="text-[12px] font-medium text-muted">{humanDate(date)}</span>
                  <span className="num flex items-center gap-2 text-[12px]">
                    {dayIn > 0 ? <span className="font-medium text-positive-text">+{compact(dayIn)}</span> : null}
                    {dayOut > 0 ? <span className="text-fg-soft">−{compact(dayOut)}</span> : null}
                  </span>
                </div>
                <div className="divide-y divide-line px-4 sm:px-5">
                  {items.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 py-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base">
                        {t.type === "transfer" ? "↔️" : t.categoryIcon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">
                          {t.type === "transfer" ? `${t.accountName} → ${t.toAccountName ?? ""}` : t.categoryName ?? "Boshqa"}
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
                      <button
                        type="button"
                        onClick={() => mutate("transaction", "delete", { id: t.id })}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-negative-text active:bg-surface-3 touch-manipulation sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="Bekor qilish"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="px-1 text-center text-[11px] leading-snug text-muted">
        Muhim operatsiyalar o‘chirilmaydi — belgilanadi va tarix saqlanadi.
      </p>

      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
