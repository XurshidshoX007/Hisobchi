"use client";

import { useMemo, useState } from "react";
import { DashboardCategorySection, DashboardHero, DashboardLoading } from "@/components/dashboard";
import { useFabPage } from "@/components/fab";
import { useFinance } from "@/components/providers";
import { QuickAddSheet } from "@/components/quick-add";
import { Button, EmptyState } from "@/components/ui";
import { selectDashboardFacts } from "@/lib/dashboard";
import type { FabTransactionType } from "@/lib/fab";

export default function DashboardPage() {
  const { state, loading, error, refresh } = useFinance();
  const [addOpen, setAddOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<FabTransactionType>("expense");

  // Keep the existing global add flow. Successful Mini App mutations replace
  // provider state with the server-built state, so every fact below updates
  // from the same ledger without an optimistic parallel calculation.
  useFabPage({}, {
    transaction: (action) => {
      setDefaultType(action.type ?? "expense");
      setAddOpen(true);
    },
  });

  const facts = useMemo(() => (state ? selectDashboardFacts(state) : null), [state]);

  if (loading && !state) return <DashboardLoading />;

  if (error && !state) {
    return (
      <EmptyState
        icon="⚠️"
        title="Ma’lumotni yuklashda xatolik yuz berdi."
        description="Internet aloqasini tekshirib, qayta urinib ko‘ring."
        action={<Button onClick={() => void refresh()}>Qayta urinish</Button>}
      />
    );
  }

  if (!state || !facts) return null;

  return (
    <div className="animate-fade-up min-w-0 space-y-4 sm:space-y-5">
      {/* The month is dashboard-wide context, not part of the balance card. */}
      <div className="flex justify-center" aria-label="Dashboard oyi">
        <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-3.5 shadow-[0_1px_2px_rgba(12,18,34,0.03)]">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-muted" aria-hidden="true">
            <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
            <path d="M5 1.75v3M11 1.75v3M2.5 6.5h11" strokeLinecap="round" />
          </svg>
          <time className="text-[12px] font-semibold tracking-tight text-fg-soft">{facts.monthLabel}</time>
        </div>
      </div>

      <DashboardHero facts={facts} currency={state.user.currency} />

      <div key={facts.monthLabel} className="dashboard-value-transition grid min-w-0 gap-5 md:grid-cols-2 md:gap-6">
        <DashboardCategorySection
          title="Daromad kategoriyalari"
          emptyText="Daromad hali kiritilmagan."
          items={facts.incomeCategories}
          currency={state.user.currency}
          hasMore={facts.hasMoreIncomeCategories}
          tone="income"
        />
        <DashboardCategorySection
          title="Xarajat kategoriyalari"
          emptyText="Xarajat hali kiritilmagan."
          items={facts.expenseCategories}
          currency={state.user.currency}
          hasMore={facts.hasMoreExpenseCategories}
          tone="expense"
        />
      </div>

      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} defaultType={defaultType} />
    </div>
  );
}
