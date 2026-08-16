import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceIncomeState,
  advanceRecurringState,
  revertIncomeState,
  revertRecurringState,
} from "../src/lib/reconciliation";
import { buildCurrentMonthIncome, buildForecast, buildPlanned, monthCashflow, monthPlanned } from "../src/lib/finance";

/* ============================ PLAN STATE TRANSITIONS ============================ */

test("recurring state transition is symmetric: advance then revert restores the plan", () => {
  const plan = {
    planType: "term",
    frequency: "monthly",
    nextDueDate: "2026-08-20",
    installmentsPaid: 0,
    installmentCount: 2,
    isActive: true,
  };
  const after = advanceRecurringState(plan, "2026-08-20");
  assert.equal(after.installmentsPaid, 1);
  assert.equal(after.nextDueDate, "2026-09-20");
  assert.equal(after.isActive, undefined);

  const reverted = revertRecurringState({ ...plan, ...after, installmentsPaid: 1 }, "2026-08-20");
  assert.equal(reverted.installmentsPaid, 0);
  assert.equal(reverted.nextDueDate, "2026-08-20");
});

test("completing the final term installment deactivates; revert reactivates", () => {
  const plan = {
    planType: "term",
    frequency: "monthly",
    nextDueDate: "2026-09-20",
    installmentsPaid: 1,
    installmentCount: 2,
    isActive: true,
  };
  const after = advanceRecurringState(plan, "2026-09-20");
  assert.equal(after.installmentsPaid, 2);
  assert.equal(after.isActive, false);

  const reverted = revertRecurringState({ ...plan, ...after, installmentsPaid: 2, isActive: false }, "2026-09-20");
  assert.equal(reverted.installmentsPaid, 1);
  assert.equal(reverted.isActive, true);
  assert.equal(reverted.nextDueDate, "2026-09-20");
});

test("one_time payment deactivates and revert reactivates without changing the date", () => {
  const plan = { planType: "one_time", frequency: "once", nextDueDate: "2026-08-20", installmentsPaid: 0, installmentCount: null, isActive: true };
  assert.deepEqual(advanceRecurringState(plan, "2026-08-20"), { isActive: false, status: "completed" });
  assert.deepEqual(revertRecurringState({ ...plan, isActive: false, status: "completed" }, "2026-08-20"), {
    isActive: true,
    status: "active",
  });
});

test("recurring payment advances the cursor and revert restores the paid occurrence date", () => {
  const plan = { planType: "recurring", frequency: "monthly", nextDueDate: "2026-08-20", installmentsPaid: 0, installmentCount: null, isActive: true };
  assert.deepEqual(advanceRecurringState(plan, "2026-08-20"), { nextDueDate: "2026-09-20" });
  assert.deepEqual(revertRecurringState(plan, "2026-08-20"), { nextDueDate: "2026-08-20" });
});

test("expected income receive/revert is symmetric for term plans", () => {
  const plan = { planType: "term", frequency: "monthly", expectedDate: "2026-08-20", occurrencesReceived: 0, occurrenceCount: 3, isActive: true };
  const after = advanceIncomeState(plan, "2026-08-20");
  assert.equal(after.occurrencesReceived, 1);
  assert.equal(after.expectedDate, "2026-09-20");

  const reverted = revertIncomeState({ ...plan, ...after, occurrencesReceived: 1 }, "2026-08-20");
  assert.equal(reverted.occurrencesReceived, 0);
  assert.equal(reverted.expectedDate, "2026-08-20");
});

test("expected income one_time receive deactivates and revert reactivates", () => {
  const plan = { planType: "one_time", frequency: "once", expectedDate: "2026-08-20", occurrencesReceived: 0, occurrenceCount: null, isActive: true };
  assert.deepEqual(advanceIncomeState(plan, "2026-08-20"), { isActive: false, status: "completed" });
  assert.deepEqual(revertIncomeState({ ...plan, isActive: false, status: "completed" }, "2026-08-20"), {
    isActive: true,
    status: "active",
  });
});

/* ============================ TERM TOTAL (no ×12) ============================ */

test("2-installment term plan totals 2 × amount, never amount × 12", () => {
  const term = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 2,
    installmentsPaid: 0,
    startDate: "2026-08-20",
  };
  const f = buildForecast({
    currentBalance: 0,
    recurring: [term],
    incomes: [],
    minReserve: 0,
    estimatedConfidence: 50,
    today: "2026-08-16",
    horizonDays: 60,
  });
  assert.equal(f.expense.base, 1_880_000 * 2);
  assert.notEqual(f.expense.base, 1_880_000 * 12);
  assert.deepEqual(
    f.planned.map((p) => p.date),
    ["2026-08-20", "2026-09-20"],
  );
});

/* ============================ EARLY PAYMENT RECONCILIATION ============================ */

test("early payment fulfils the planned occurrence, not the actual date (section 25)", () => {
  const tx = {
    date: "2026-08-15",
    type: "expense",
    amount: 1_880_000,
    recurringId: 1,
    plannedDate: "2026-08-20",
    occurrenceNumber: 1,
  };
  const plan = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "once",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "one_time",
  };
  const planned = buildPlanned([plan], [], "2026-08-16", 31, [tx]);
  // The 20 Aug planned occurrence is fulfilled even though the transaction
  // landed on the 15th — it must not reappear as an unpaid plan.
  assert.equal(planned.filter((p) => p.source === "recurring").length, 0);
});

test("deleting the early payment restores the planned occurrence at its scheduled date", () => {
  const plan = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "once",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "one_time",
  };
  // Fulfilled: real transaction on 15 Aug for the 20 Aug occurrence.
  const fulfilled = buildPlanned([plan], [], "2026-08-16", 31, [
    { date: "2026-08-15", type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-08-20" },
  ]);
  assert.equal(fulfilled.length, 0);

  // Deleted: no non-deleted transaction → the 20 Aug occurrence returns.
  const reverted = buildPlanned([plan], [], "2026-08-16", 31, [
    { date: "2026-08-15", type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-08-20", isDeleted: true },
  ]);
  assert.deepEqual(
    reverted.map((p) => p.date),
    ["2026-08-20"],
  );
});

test("term 2-installment full lifecycle: pay → delete → pay → pay → delete → delete (section 7/30)", () => {
  const base = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 2,
    startDate: "2026-08-20",
  };
  const today = "2026-08-16";

  // initial 0/2
  assert.deepEqual(
    buildPlanned([{ ...base, installmentsPaid: 0 }], [], today, 60).map((p) => p.date),
    ["2026-08-20", "2026-09-20"],
  );

  // pay #1 (1/2)
  const paid1 = [{ date: today, type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-08-20", occurrenceNumber: 1 }];
  assert.deepEqual(
    buildPlanned([{ ...base, installmentsPaid: 1, nextDueDate: "2026-09-20" }], [], today, 60, paid1).map((p) => p.date),
    ["2026-09-20"],
  );

  // delete → 0/2
  const deleted1 = [{ ...paid1[0], isDeleted: true }];
  assert.deepEqual(
    buildPlanned([{ ...base, installmentsPaid: 0, nextDueDate: "2026-08-20" }], [], today, 60, deleted1).map((p) => p.date),
    ["2026-08-20", "2026-09-20"],
  );

  // pay again #1 then #2 (2/2 → completed, no occurrences)
  const paidBoth = [
    { date: today, type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-08-20", occurrenceNumber: 1 },
    { date: today, type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-09-20", occurrenceNumber: 2 },
  ];
  assert.deepEqual(
    buildPlanned([{ ...base, installmentsPaid: 2, nextDueDate: "2026-09-20", isActive: false }], [], today, 60, paidBoth).map((p) => p.date),
    [],
  );

  // delete second → 1/2, next unpaid = Sep 20
  const keepFirst = [{ ...paidBoth[0] }, { ...paidBoth[1], isDeleted: true }];
  assert.deepEqual(
    buildPlanned([{ ...base, installmentsPaid: 1, nextDueDate: "2026-09-20", isActive: true }], [], today, 60, keepFirst).map((p) => p.date),
    ["2026-09-20"],
  );

  // delete first too → 0/2
  const allDeleted = [{ ...paidBoth[0], isDeleted: true }, { ...paidBoth[1], isDeleted: true }];
  assert.deepEqual(
    buildPlanned([{ ...base, installmentsPaid: 0, nextDueDate: "2026-08-20", isActive: true }], [], today, 60, allDeleted).map((p) => p.date),
    ["2026-08-20", "2026-09-20"],
  );
});

test("deleting a middle installment restores its date without shifting later occurrences (section 24)", () => {
  const plan = {
    id: 1,
    name: "Kredit",
    amount: 1_000_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 4,
    startDate: "2026-08-20",
  };
  // Occurrences 1,2,3 paid (Aug/Sep/Oct), occurrence 1 deleted → it returns;
  // occurrences 2 and 3 stay fulfilled; occurrence 4 (Nov) is the only future unpaid.
  const txs = [
    { date: "2026-08-20", type: "expense", amount: 1_000_000, recurringId: 1, plannedDate: "2026-08-20", occurrenceNumber: 1, isDeleted: true },
    { date: "2026-09-20", type: "expense", amount: 1_000_000, recurringId: 1, plannedDate: "2026-09-20", occurrenceNumber: 2 },
    { date: "2026-10-20", type: "expense", amount: 1_000_000, recurringId: 1, plannedDate: "2026-10-20", occurrenceNumber: 3 },
  ];
  const planned = buildPlanned([{ ...plan, installmentsPaid: 2, nextDueDate: "2026-08-20" }], [], "2026-11-01", 90, txs);
  assert.deepEqual(
    planned.map((p) => p.date),
    ["2026-11-20"],
  );
});

/* ============================ EXPECTED INCOME RECONCILIATION ============================ */

test("receive then delete restores the one-time expected income to the forecast (section 31)", () => {
  const income = {
    id: 7,
    sourceName: "Ish haqi",
    amount: 1_000_000,
    minAmount: null,
    maxAmount: null,
    expectedDate: "2026-08-20",
    frequency: "once",
    certainty: "exact",
    isActive: true,
    linkedTransactionId: null,
    planType: "one_time",
  };
  const today = "2026-08-16";

  // Before receive: forecast includes 1m.
  const before = buildPlanned([], [income], today, 31, []);
  assert.equal(before.filter((p) => p.source === "expected").length, 1);

  // Received on 16 Aug (early): planned occurrence fulfilled by identity.
  const receivedTx = [{ date: "2026-08-16", type: "income", amount: 1_000_000, expectedIncomeId: 7, plannedDate: "2026-08-20" }];
  const after = buildPlanned([], [{ ...income, isActive: false }], today, 31, receivedTx);
  assert.equal(after.filter((p) => p.source === "expected").length, 0);

  // Delete → expected income returns at 20 Aug (not 16 Aug).
  const reverted = buildPlanned([], [{ ...income, isActive: true }], today, 31, [{ ...receivedTx[0], isDeleted: true }]);
  assert.deepEqual(
    reverted.map((p) => p.date),
    ["2026-08-20"],
  );
});

test("term income: 3 occurrences, receive 1, delete restores the exact occurrence (section 10/26)", () => {
  const contract = {
    id: 8,
    sourceName: "Kontrakt",
    amount: 2_000_000,
    minAmount: null,
    maxAmount: null,
    expectedDate: "2026-08-25",
    frequency: "monthly",
    certainty: "exact",
    isActive: true,
    linkedTransactionId: null,
    planType: "term",
    occurrenceCount: 3,
    startDate: "2026-08-25",
  };
  const today = "2026-08-16";

  const initial = buildPlanned([], [{ ...contract, occurrencesReceived: 0 }], today, 120);
  assert.deepEqual(initial.map((p) => p.date), ["2026-08-25", "2026-09-25", "2026-10-25"]);

  // Receive #1 (early, on 16 Aug for the 25 Aug occurrence).
  const receivedTx = [{ date: "2026-08-16", type: "income", amount: 2_000_000, expectedIncomeId: 8, plannedDate: "2026-08-25" }];
  const received = buildPlanned([], [{ ...contract, occurrencesReceived: 1, expectedDate: "2026-09-25" }], today, 120, receivedTx);
  assert.deepEqual(received.map((p) => p.date), ["2026-09-25", "2026-10-25"]);

  // Delete → restore the 25 Aug occurrence (not 16 Aug).
  const reverted = buildPlanned([], [{ ...contract, occurrencesReceived: 0, expectedDate: "2026-08-25" }], today, 120, [{ ...receivedTx[0], isDeleted: true }]);
  assert.deepEqual(reverted.map((p) => p.date), ["2026-08-25", "2026-09-25", "2026-10-25"]);
});

/* ============================ CURRENT-MONTH SCOPED STATS ============================ */

test("current-month income summary excludes next months (section 17)", () => {
  const planned = [
    // August salary +3m and bonus +500k
    { key: "i-1-2026-08-05", date: "2026-08-05", kind: "income" as const, label: "Maosh", min: 3_000_000, base: 3_000_000, max: 3_000_000, certainty: "exact" as const, mandatory: false, source: "expected" as const, refId: 1 },
    { key: "i-2-2026-08-20", date: "2026-08-20", kind: "income" as const, label: "Bonus", min: 500_000, base: 500_000, max: 500_000, certainty: "exact" as const, mandatory: false, source: "expected" as const, refId: 2 },
    // September salary must NOT affect August top stats.
    { key: "i-1-2026-09-05", date: "2026-09-05", kind: "income" as const, label: "Maosh", min: 3_000_000, base: 3_000_000, max: 3_000_000, certainty: "exact" as const, mandatory: false, source: "expected" as const, refId: 1 },
  ];
  const summary = buildCurrentMonthIncome(planned, "2026-08-16");
  assert.equal(summary.exactBase, 3_500_000);
  assert.equal(summary.base, 3_500_000);
});

test("current-month income summary splits exact vs estimated", () => {
  const planned = [
    { key: "a", date: "2026-08-10", kind: "income" as const, label: "Aniq", min: 1_000_000, base: 1_000_000, max: 1_000_000, certainty: "exact" as const, mandatory: false, source: "expected" as const, refId: 1 },
    { key: "b", date: "2026-08-15", kind: "income" as const, label: "Taxminiy", min: 300_000, base: 400_000, max: 500_000, certainty: "estimated" as const, mandatory: false, source: "expected" as const, refId: 2 },
  ];
  const summary = buildCurrentMonthIncome(planned, "2026-08-16");
  assert.equal(summary.exactBase, 1_000_000);
  assert.equal(summary.estimatedBase, 400_000);
  assert.equal(summary.estimatedMin, 300_000);
  assert.equal(summary.estimatedMax, 500_000);
  assert.equal(summary.base, 1_400_000);
});

test("monthCashflow and monthPlanned scope to a single month", () => {
  const cashflow = [
    { date: "2026-08-16", inflow: 0, outflow: 0, net: 0, projectedBase: 100, projectedMin: 100, projectedMax: 100, events: [] },
    { date: "2026-08-17", inflow: 0, outflow: 0, net: 0, projectedBase: 100, projectedMin: 100, projectedMax: 100, events: [] },
    { date: "2026-09-01", inflow: 0, outflow: 0, net: 0, projectedBase: 100, projectedMin: 100, projectedMax: 100, events: [] },
  ];
  assert.equal(monthCashflow(cashflow as never, "2026-08").length, 2);
  assert.equal(monthCashflow(cashflow as never, "2026-09").length, 1);

  const planned = [
    { key: "a", date: "2026-08-20", kind: "expense" as const, label: "X", min: 1, base: 1, max: 1, certainty: "exact" as const, mandatory: true, source: "recurring" as const, refId: 1 },
    { key: "b", date: "2026-09-20", kind: "expense" as const, label: "Y", min: 1, base: 1, max: 1, certainty: "exact" as const, mandatory: true, source: "recurring" as const, refId: 1 },
  ];
  assert.equal(monthPlanned(planned, "2026-08").length, 1);
  assert.equal(monthPlanned(planned, "2026-09").length, 1);
});
