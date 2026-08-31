"use client";

import { useMemo, useState } from "react";
import { BalanceBreakdownSheet } from "@/components/balance-breakdown";
import {
  DashboardHero,
  DashboardLoading,
  ExpenseBreakdown,
  MonthResult,
  QuickActions,
  type QuickActionId,
} from "@/components/dashboard";
import { useFinance } from "@/components/providers";
import { QuickAddSheet } from "@/components/quick-add";
import { QuickExpenses } from "@/components/quick-expenses";
import { Button, EmptyState } from "@/components/ui";
import { selectDashboardFacts } from "@/lib/dashboard";

export default function DashboardPage() {
  const { state, loading, error, refresh } = useFinance();
  const [addOpen, setAddOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<QuickActionId>("expense");
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  /*
   * The quick-action tiles replace the floating add button on this route (see
   * getFabActions("/"), which now returns no actions). Each tile opens the same
   * shared add sheet with its direction already selected, so the most frequent
   * action in the product costs one tap instead of two.
   */
  const openAdd = (type: QuickActionId) => {
    setDefaultType(type);
    setAddOpen(true);
  };

  const facts = useMemo(() => (state ? selectDashboardFacts(state) : null), [state]);

  if (loading && !state) return <DashboardLoading />;

  if (error && !state) {
    return (
      <EmptyState
        icon="warning"
        title="Ma’lumotni yuklashda xatolik yuz berdi."
        description="Internet aloqasini tekshirib, qayta urinib ko‘ring."
        action={<Button onClick={() => void refresh()}>Qayta urinish</Button>}
      />
    );
  }

  if (!state || !facts) return null;

  return (
    <div className="animate-fade-up min-w-0">
      <div className="animate-hero-in">
        <DashboardHero
          facts={facts}
          currency={state.user.currency}
          onOpenBreakdown={facts.hasBalanceBreakdown ? () => setBreakdownOpen(true) : undefined}
        />
      </div>

      <QuickActions onAdd={openAdd} />

      <div key={facts.monthLabel} className="dashboard-value-transition animate-category-in min-w-0">
        <MonthResult facts={facts} currency={state.user.currency} />
        <ExpenseBreakdown facts={facts} monthLabel={facts.monthLabel} quickDock={<QuickExpenses />} />
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
