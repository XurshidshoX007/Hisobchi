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
import { localizedMonth } from "@/lib/i18n";

export default function DashboardPage() {
  const { state, loading, error, refresh, t, locale } = useFinance();
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
        title={t("dashboard.loadError")}
        description={t("dashboard.checkConnection")}
        action={<Button onClick={() => void refresh()}>{t("dashboard.retry")}</Button>}
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
        <ExpenseBreakdown facts={facts} monthLabel={localizedMonth(locale, facts.month)} quickDock={<QuickExpenses />} />
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
