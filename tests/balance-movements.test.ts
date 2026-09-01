import assert from "node:assert/strict";
import test from "node:test";
import { buildBalanceMovements } from "../src/lib/finance";

test("balance movements keep debt and credit principal out of income/expense", () => {
  const movements = buildBalanceMovements({
    month: "2026-09",
    today: "2026-09-30",
    transactions: [
      { date: "2026-09-01", type: "income", amount: 500_000, debtId: 1 },
      { date: "2026-09-02", type: "expense", amount: 200_000, debtId: 2 },
      { date: "2026-09-03", type: "income", amount: 120_000, debtId: 2, debtPaymentId: 10 },
      { date: "2026-09-04", type: "expense", amount: 90_000, debtId: 1, debtPaymentId: 11 },
      { date: "2026-09-05", type: "expense", amount: 300_000, creditPrincipalAmount: 260_000, creditInterestAmount: 35_000, creditFeeAmount: 5_000 },
      { date: "2026-08-31", type: "expense", amount: 999_999, creditPrincipalAmount: 999_999 },
    ],
  });

  assert.deepEqual(movements, {
    debtBorrowed: 500_000,
    debtLent: 200_000,
    debtRepaid: 90_000,
    debtRecovered: 120_000,
    creditPrincipalPaid: 260_000,
    creditInterestAndFees: 40_000,
  });
});
