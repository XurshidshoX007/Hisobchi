"use client";

import { useMemo, useState } from "react";
import { BalanceBreakdownSheet } from "@/components/balance-breakdown";
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
  const [breakdownOpen, setBreakdownOpen] = useState(false);

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
      <div className="animate-hero-in">
        <DashboardHero
          facts={facts}
          currency={state.user.currency}
          onOpenBreakdown={facts.hasBalanceBreakdown ? () => setBreakdownOpen(true) : undefined}
        />
      </div>

      <div key={facts.monthLabel} className="dashboard-value-transition animate-category-in grid min-w-0 gap-5 md:grid-cols-2 md:gap-6">
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
      <BalanceBreakdownSheet
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        groups={facts.balanceGroups}
        total={facts.balance}
        currency={state.user.currency}
      />
    </div>
  );
}
