import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalytics, buildForecast, buildMonthlyView } from "../src/lib/finance";

const credit = {
  id: 11, name: "Kredit", amount: 1_880_000, minAmount: null, maxAmount: null,
  nextDueDate: "2026-08-17", frequency: "once", isMandatory: true,
  certainty: "exact", isActive: true, categoryId: null, planType: "one_time",
};
const salary = {
  id: 22, sourceName: "Avans", amount: 3_000_000, minAmount: null, maxAmount: null,
  expectedDate: "2026-08-20", frequency: "once", certainty: "exact",
  isActive: true, linkedTransactionId: null, planType: "one_time",
};

function analytics(today: string, currentBalance: number, transactions: Array<{ id: number; date: string; type: string; amount: number }>) {
  return buildAnalytics({
    transactions: transactions.map((tx) => ({ ...tx, categoryId: null, note: null })),
    categories: [], recurringBase: 0, currentBalance, today,
  });
}

test("dashboard acceptance timeline: risk, recovery, closing and transparent safe amount", () => {
  const today = "2026-08-16";
  const forecast = buildForecast({ currentBalance: 100_000, recurring: [credit], incomes: [salary], minReserve: 0, estimatedConfidence: 50, today, horizonDays: 31, transactions: [] });
  const monthly = buildMonthlyView({ monthKey: "2026-08", today, currentBalance: 100_000, transactions: [], planned: forecast.planned, cashflow: forecast.cashflow, analytics: analytics(today, 100_000, []), forecast });

  assert.equal(forecast.currentBalance, 100_000);
  assert.equal(monthly.lowestProjected, -1_780_000);
  assert.equal(monthly.forecastClosingBase, 1_220_000);
  assert.equal(forecast.safeToSpend, 1_220_000);
  assert.equal(forecast.riskDates[0]?.date, "2026-08-17");
  assert.equal(forecast.riskDates[0]?.recoveryDate, "2026-08-20");
  assert.deepEqual(
    forecast.timeline.filter((event) => event.phase === "plan").map((event) => event.occurrenceId),
    ["recurring:11:2026-08-17", "expected:22:2026-08-20"],
  );
});

test("today received expected income is REAL once and absent from every forecast surface", () => {
  const today = "2026-08-20";
  const tx = { id: 90, date: today, type: "income", amount: 3_000_000, expectedIncomeId: 22, recurringId: null };
  const forecast = buildForecast({ currentBalance: 3_100_000, recurring: [], incomes: [{ ...salary, expectedDate: today }], minReserve: 0, estimatedConfidence: 50, today, horizonDays: 31, transactions: [tx] });

  assert.equal(forecast.currentBalance, 3_100_000);
  assert.equal(forecast.income.base, 0);
  assert.equal(forecast.upcomingIncome.length, 0);
  assert.equal(forecast.planned.length, 0);
  assert.equal(forecast.timeline.filter((event) => event.kind === "real_income").length, 1);
  assert.equal(forecast.scenarios.base.balance, 3_100_000);
});

test("today paid recurring expense is REAL once and absent from plan, chart and upcoming", () => {
  const today = "2026-08-17";
  const tx = { id: 91, date: today, type: "expense", amount: 1_880_000, recurringId: 11, expectedIncomeId: null };
  const forecast = buildForecast({ currentBalance: 120_000, recurring: [{ ...credit, nextDueDate: today }], incomes: [], minReserve: 0, estimatedConfidence: 50, today, horizonDays: 31, transactions: [tx] });

  assert.equal(forecast.expense.base, 0);
  assert.equal(forecast.upcomingPayments.length, 0);
  assert.equal(forecast.cashflow[0].outflow, 0);
  assert.equal(forecast.timeline.filter((event) => event.kind === "real_expense").length, 1);
  assert.equal(forecast.scenarios.base.balance, 120_000);
});

test("selected past month ignores future transactions and future plans", () => {
  const today = "2026-08-16";
  const txs = [
    { id: 1, date: "2026-07-10", type: "income", amount: 500_000 },
    { id: 2, date: "2026-07-11", type: "expense", amount: 100_000 },
    { id: 3, date: "2026-09-01", type: "income", amount: 9_000_000 },
  ];
  const forecast = buildForecast({ currentBalance: 400_000, recurring: [credit], incomes: [salary], minReserve: 0, estimatedConfidence: 50, today, horizonDays: 60, transactions: txs });
  const view = buildMonthlyView({ monthKey: "2026-07", today, currentBalance: 400_000, transactions: txs, planned: forecast.planned, cashflow: forecast.cashflow, analytics: analytics(today, 400_000, txs), forecast });

  assert.equal(view.realIncome, 500_000);
  assert.equal(view.realExpense, 100_000);
  assert.equal(view.realNet, 400_000);
  assert.equal(view.expectedIncomeBase, 0);
  assert.equal(view.forecastClosingBase, 400_000);
});


test("future ledger payment keeps mandatory identity without double counting its plan", () => {
  const tx = { id: 92, date: "2026-08-17", type: "expense", amount: 1_880_000, recurringId: 11, expectedIncomeId: null };
  const forecast = buildForecast({ currentBalance: 2_000_000, recurring: [credit], incomes: [], minReserve: 0, estimatedConfidence: 50, today: "2026-08-16", horizonDays: 31, transactions: [tx] });
  const expenses = forecast.planned.filter((event) => event.kind === "expense");

  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].source, "real");
  assert.equal(expenses[0].mandatory, true);
  assert.equal(forecast.safeToSpend, 120_000);
});
