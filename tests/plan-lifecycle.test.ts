import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceRecurringState,
  isUserDeactivated,
  revertIncomeState,
  revertRecurringState,
  type PlanStatus,
} from "../src/lib/reconciliation";
import { buildPlanned } from "../src/lib/finance";

/* ============================ LIFECYCLE GUARD ============================ */

test("isUserDeactivated only treats pause/cancel as user intent", () => {
  assert.equal(isUserDeactivated("cancelled"), true);
  assert.equal(isUserDeactivated("paused"), true);
  assert.equal(isUserDeactivated("active"), false);
  assert.equal(isUserDeactivated("completed"), false);
  assert.equal(isUserDeactivated(null), false);
  assert.equal(isUserDeactivated(undefined), false);
});

/* ============================ CANCELLED PLAN NEVER REAPPEARS ============================ */

test("cancelled term plan: deleting a payment does NOT reactivate it (section 8/10)", () => {
  const cancelled: Parameters<typeof revertRecurringState>[0] = {
    planType: "term",
    frequency: "monthly",
    nextDueDate: "2026-09-20",
    installmentsPaid: 1,
    installmentCount: 2,
    isActive: false,
    status: "cancelled",
  };
  const reverted = revertRecurringState(cancelled, "2026-08-20");
  // Occurrence is still un-done, but the plan stays cancelled.
  assert.equal(reverted.installmentsPaid, 0);
  assert.equal(reverted.nextDueDate, "2026-08-20");
  assert.equal(reverted.isActive, undefined);
  assert.equal(reverted.status, undefined);
});

test("paused term plan: deleting a payment does NOT resume it", () => {
  const paused: Parameters<typeof revertRecurringState>[0] = {
    planType: "term",
    frequency: "monthly",
    nextDueDate: "2026-09-20",
    installmentsPaid: 1,
    installmentCount: 2,
    isActive: false,
    status: "paused",
  };
  const reverted = revertRecurringState(paused, "2026-08-20");
  assert.equal(reverted.installmentsPaid, 0);
  assert.equal(reverted.isActive, undefined);
});

test("cancelled one_time plan: deleting the payment does NOT resurrect it", () => {
  const cancelled: Parameters<typeof revertRecurringState>[0] = {
    planType: "one_time",
    frequency: "once",
    nextDueDate: "2026-08-20",
    installmentsPaid: 0,
    installmentCount: null,
    isActive: false,
    status: "cancelled",
  };
  assert.deepEqual(revertRecurringState(cancelled, "2026-08-20"), {});
});

test("cancelled expected income: deleting the receipt does NOT resurrect it", () => {
  const cancelled = {
    planType: "one_time",
    frequency: "once",
    expectedDate: "2026-08-20",
    occurrencesReceived: 0,
    occurrenceCount: null,
    isActive: false,
    status: "cancelled" as PlanStatus,
  };
  assert.deepEqual(revertIncomeState(cancelled, "2026-08-20"), {});
});

/* ============================ COMPLETED PLAN REACTIVATES ============================ */

test("completed term plan: deleting the final payment reactivates it (2/2 → 1/2)", () => {
  const completed: Parameters<typeof revertRecurringState>[0] = {
    planType: "term",
    frequency: "monthly",
    nextDueDate: "2026-09-20",
    installmentsPaid: 2,
    installmentCount: 2,
    isActive: false,
    status: "completed",
  };
  const reverted = revertRecurringState(completed, "2026-09-20");
  assert.equal(reverted.installmentsPaid, 1);
  assert.equal(reverted.nextDueDate, "2026-09-20");
  assert.equal(reverted.isActive, true);
  assert.equal(reverted.status, "active");
});

test("legacy completed term (status default 'active', fully paid) still reactivates", () => {
  const legacy: Parameters<typeof revertRecurringState>[0] = {
    planType: "term",
    frequency: "monthly",
    nextDueDate: "2026-09-20",
    installmentsPaid: 2,
    installmentCount: 2,
    isActive: false,
    status: "active", // no explicit completed marker (pre-migration rows)
  };
  const reverted = revertRecurringState(legacy, "2026-09-20");
  assert.equal(reverted.isActive, true);
});

/* ============================ ADVANCE MARKS COMPLETED ============================ */

test("final term installment and one_time mark status completed", () => {
  assert.deepEqual(
    advanceRecurringState(
      { planType: "term", frequency: "monthly", nextDueDate: "2026-09-20", installmentsPaid: 1, installmentCount: 2, isActive: true },
      "2026-09-20",
    ),
    { installmentsPaid: 2, isActive: false, status: "completed" },
  );
  assert.deepEqual(
    advanceRecurringState(
      { planType: "one_time", frequency: "once", nextDueDate: "2026-08-20", installmentsPaid: 0, installmentCount: null, isActive: true },
      "2026-08-20",
    ),
    { isActive: false, status: "completed" },
  );
});

/* ============================ FORECAST SEPARATION ============================ */

test("cancelled term plan contributes no future occurrences to forecast", () => {
  const plan = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: false,
    categoryId: null,
    planType: "term",
    installmentCount: 2,
    installmentsPaid: 1,
    startDate: "2026-08-20",
  };
  const planned = buildPlanned([plan], [], "2026-08-16", 60, []);
  assert.deepEqual(planned.map((p) => p.date), []);
});

test("active term plan 1/2 still forecasts its one remaining occurrence", () => {
  const plan = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-09-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 2,
    installmentsPaid: 1,
    startDate: "2026-08-20",
  };
  // The first occurrence was paid (fulfilled by a real transaction); only the
  // second scheduled occurrence remains in the forecast.
  const paidTx = [{ date: "2026-08-16", type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-08-20" }];
  const planned = buildPlanned([plan], [], "2026-08-16", 60, paidTx);
  assert.deepEqual(planned.map((p) => p.date), ["2026-09-20"]);
});

/* ============================ SECTION 20 SCENARIO ============================ */

test("section 20: pay 1/2 → cancel → forecast removes future payment; history stays", () => {
  // After paying 1/2 the plan is active with one future occurrence.
  const afterPay = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-09-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 2,
    installmentsPaid: 1,
    startDate: "2026-08-20",
  };
  const paidTx = [{ date: "2026-08-16", type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-08-20", occurrenceNumber: 1 }];
  assert.deepEqual(buildPlanned([afterPay], [], "2026-08-16", 60, paidTx).map((p) => p.date), ["2026-09-20"]);

  // User cancels: isActive=false, status=cancelled. Future occurrence is gone…
  const cancelled = { ...afterPay, isActive: false };
  assert.deepEqual(buildPlanned([cancelled], [], "2026-08-16", 60, paidTx).map((p) => p.date), []);

  // …but the historical payment (the real transaction) is untouched: plan
  // cancellation never deletes transactions. Here `paidTx` remains a live,
  // non-deleted fulfilment of the 20 Aug occurrence.

  // Deleting that historical payment later must NOT resurrect the cancelled plan.
  const afterHistoryDelete = revertRecurringState(
    { ...cancelled, status: "cancelled", nextDueDate: "2026-09-20" },
    "2026-08-20",
  );
  assert.equal(afterHistoryDelete.isActive, undefined);
  assert.equal(afterHistoryDelete.status, undefined);
});
