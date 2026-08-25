import { Navigate, Route, Routes } from "react-router-dom";
import { FinanceProvider } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { DashboardPage } from "@/pages/dashboard";
import { AccountsPage } from "@/pages/accounts";
import { AnalyticsPage } from "@/pages/analytics";
import { BotPage } from "@/pages/bot";
import { BudgetsPage } from "@/pages/budgets";
import { DebtsPage } from "@/pages/debts";
import { GoalsPage } from "@/pages/goals";
import { MorePage } from "@/pages/more";
import { PlansPage } from "@/pages/plans";
import { SettingsPage } from "@/pages/settings";
import { TransactionsPage } from "@/pages/transactions";

/**
 * Ilova ildizi — Next.js `src/app/layout.tsx` + fayl-tizim marshrutlarining
 * ekvivalenti. Profil satri/qobiq AppShell'da, ma'lumot FinanceProvider'da.
 */
export function App() {
  return (
    <FinanceProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/bot" element={<BotPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/debts" element={<DebtsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </FinanceProvider>
  );
}
