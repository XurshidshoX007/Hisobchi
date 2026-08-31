import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalytics, computeLedgerBalances } from "../src/lib/finance";

test("debt principal changes the cash ledger but not income or expense analytics", () => {
  const today = "2026-08-31";
  const transactions = [
    // A loan made and then returned: cash leaves and comes back.
    { id: 1, accountId: 1, type: "expense", amount: 100_000, date: "2026-08-10", debtId: 71, categoryId: null, note: "Qarz berildi" },
    { id: 2, accountId: 1, type: "income", amount: 100_000, date: "2026-08-20", debtId: 71, categoryId: null, note: "Qarz qaytdi" },
    // Genuine financial activity remains visible in reporting.
    { id: 3, accountId: 1, type: "income", amount: 500_000, date: "2026-08-21", debtId: null, categoryId: 1, note: "Ish haqi" },
    { id: 4, accountId: 1, type: "expense", amount: 120_000, date: "2026-08-22", debtId: null, categoryId: 2, note: "Oziq-ovqat" },
  ];

  const ledger = computeLedgerBalances([{ id: 1, initialBalance: 1_000_000 }], transactions, today);
  assert.equal(ledger.get(1)?.currentBalance, 1_380_000);

  const analytics = buildAnalytics({
    transactions: transactions.map(({ id, type, amount, date, debtId, categoryId, note }) => ({ id, type, amount, date, debtId, categoryId, note })),
    categories: [
      { id: 1, name: "Ish haqi", icon: "wallet", isEssential: false },
      { id: 2, name: "Oziq-ovqat", icon: "cart", isEssential: true },
    ],
    recurringBase: 0,
    currentBalance: 1_380_000,
    today,
  });

  assert.equal(analytics.monthTotals.income, 500_000);
  assert.equal(analytics.monthTotals.expense, 120_000);
  assert.equal(analytics.monthTotals.net, 380_000);
  assert.deepEqual(analytics.categories.map((category) => category.name), ["Oziq-ovqat"]);
  assert.deepEqual(analytics.incomeSources.map((source) => source.name), ["Ish haqi"]);
});
