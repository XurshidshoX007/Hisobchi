import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceRecurringState,
  canRestorePlan,
  isUserDeactivated,
  resolveEditLifecycle,
  revertIncomeState,
  revertRecurringState,
  togglePlanError,
  type PlanStatus,
} from "../src/lib/reconciliation";
import { buildPlanned, filterPlansByTab, isActivePlanLoad, planInTab, type PlanLifecycle } from "../src/lib/finance";

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

/* ============================ TOGGLE GUARD (§13) ============================ */

test("toggle is blocked for cancelled plans (must use restore instead)", () => {
  assert.match(togglePlanError("cancelled") ?? "", /Qayta faollashtirish/);
});

test("toggle is blocked for completed plans", () => {
  assert.ok(togglePlanError("completed") !== null);
});

test("toggle is allowed for active and paused plans (pause/resume)", () => {
  assert.equal(togglePlanError("active"), null);
  assert.equal(togglePlanError("paused"), null);
  assert.equal(togglePlanError(null), null); // legacy rows
});

/* ============================ RESTORE GUARD (§11) ============================ */

test("restore is the ONLY way back from cancelled; nothing else qualifies", () => {
  assert.equal(canRestorePlan("cancelled"), true);
  assert.equal(canRestorePlan("active"), false);
  assert.equal(canRestorePlan("paused"), false); // paused resumes via toggle
  assert.equal(canRestorePlan("completed"), false); // completed stays final
  assert.equal(canRestorePlan(null), false);
});

/* ============================ EDIT LIFECYCLE (§11) ============================ */

test("editing a cancelled plan NEVER reactivates it (active intent)", () => {
  assert.deepEqual(
    resolveEditLifecycle({
      previousStatus: "cancelled",
      planType: "term",
      frequency: "monthly",
      total: 12,
      done: 2,
      nextIsActive: true,
    }),
    { isActive: false, status: "cancelled" },
  );
});

test("editing a cancelled plan NEVER reactivates it (paused intent)", () => {
  assert.deepEqual(
    resolveEditLifecycle({
      previousStatus: "cancelled",
      planType: "recurring",
      frequency: "monthly",
      total: null,
      done: 0,
      nextIsActive: false,
    }),
    { isActive: false, status: "cancelled" },
  );
});

test("editing a completed term (rename only) keeps it completed", () => {
  assert.deepEqual(
    resolveEditLifecycle({
      previousStatus: "completed",
      planType: "term",
      frequency: "monthly",
      total: 2,
      done: 2,
      nextIsActive: true,
    }),
    { isActive: false, status: "completed" },
  );
});

test("editing a completed one_time plan keeps it completed", () => {
  assert.deepEqual(
    resolveEditLifecycle({
      previousStatus: "completed",
      planType: "one_time",
      frequency: "once",
      total: null,
      done: 0,
      nextIsActive: true,
    }),
    { isActive: false, status: "completed" },
  );
});

test("extending a completed term (2/2 → count 3) re-opens it via form intent", () => {
  assert.deepEqual(
    resolveEditLifecycle({
      previousStatus: "completed",
      planType: "term",
      frequency: "monthly",
      total: 3,
      done: 2,
      nextIsActive: true,
    }),
    { isActive: true, status: "active" },
  );
});

test("ordinary active/paused edits honour the form intent", () => {
  assert.deepEqual(
    resolveEditLifecycle({ previousStatus: "active", planType: "recurring", frequency: "monthly", total: null, done: 0, nextIsActive: false }),
    { isActive: false, status: "paused" },
  );
  assert.deepEqual(
    resolveEditLifecycle({ previousStatus: "paused", planType: "recurring", frequency: "monthly", total: null, done: 0, nextIsActive: true }),
    { isActive: true, status: "active" },
  );
  // Legacy rows (no status) behave like the active flag says.
  assert.deepEqual(
    resolveEditLifecycle({ previousStatus: null, planType: "recurring", frequency: "monthly", total: null, done: 0, nextIsActive: true }),
    { isActive: true, status: "active" },
  );
});

/* ============================ LIST SELECTOR (§2/§7/§20) ============================ */

const plansOf = (...statuses: PlanLifecycle[]) => statuses.map((status, i) => ({ id: i + 1, status }));

test("default To'lovlar list (open tab) shows ACTIVE + PAUSED only", () => {
  const plans = plansOf("active", "paused", "cancelled", "completed");
  assert.deepEqual(
    filterPlansByTab(plans, "open").map((p) => p.status),
    ["active", "paused"],
  );
});

test("cancelled and completed never leak into the open tab, each has its own tab", () => {
  const plans = plansOf("cancelled", "completed", "active", "cancelled", "paused", "completed");
  assert.deepEqual(filterPlansByTab(plans, "cancelled").length, 2);
  assert.deepEqual(filterPlansByTab(plans, "completed").length, 2);
  assert.deepEqual(filterPlansByTab(plans, "paused").length, 1);
  assert.equal(planInTab("cancelled", "open"), false);
  assert.equal(planInTab("completed", "open"), false);
  assert.equal(planInTab("paused", "open"), true);
  assert.equal(planInTab("active", "open"), true);
});

/* ============================ ACTIVE-LOAD STATISTICS (§4/§15/§16) ============================ */

test("money load counts only plans producing future occurrences", () => {
  assert.equal(isActivePlanLoad("active"), true);
  assert.equal(isActivePlanLoad("paused"), false); // policy: excluded from active load
  assert.equal(isActivePlanLoad("cancelled"), false);
  assert.equal(isActivePlanLoad("completed"), false);
});

test("monthly mandatory/optional, yearly and term stats exclude cancelled+completed (§4)", () => {
  // Mirrors the Plans-page stat selectors: cancelled 1.88M term plan and a
  // completed 2-installment term must contribute 0 to every money stat.
  const plans = [
    { status: "active" as PlanLifecycle, isMandatory: true, baseAmount: 500_000, planType: "recurring" as const, yearlyTotal: 6_000_000, planTotal: null, remainingTotal: null },
    { status: "paused" as PlanLifecycle, isMandatory: true, baseAmount: 300_000, planType: "recurring" as const, yearlyTotal: 3_600_000, planTotal: null, remainingTotal: null },
    { status: "cancelled" as PlanLifecycle, isMandatory: true, baseAmount: 1_880_000, planType: "term" as const, yearlyTotal: 0, planTotal: 22_560_000, remainingTotal: 18_800_000 },
    { status: "completed" as PlanLifecycle, isMandatory: true, baseAmount: 1_880_000, planType: "term" as const, yearlyTotal: 0, planTotal: 3_760_000, remainingTotal: 0 },
  ];
  const load = plans.filter((p) => isActivePlanLoad(p.status));
  assert.equal(load.filter((p) => p.isMandatory).reduce((s, p) => s + p.baseAmount, 0), 500_000);
  assert.equal(load.filter((p) => p.planType === "recurring").reduce((s, p) => s + p.yearlyTotal, 0), 6_000_000);
  assert.equal(load.filter((p) => p.planType === "term").reduce((s, p) => s + (p.remainingTotal ?? 0), 0), 0);
});

/* ============================ TEST MATRIX (§24) ============================ */

test("TEST 6: paused plan stays paused on payment delete and can resume via toggle", () => {
  const paused: Parameters<typeof revertRecurringState>[0] = {
    planType: "recurring",
    frequency: "monthly",
    nextDueDate: "2026-09-01",
    installmentsPaid: 0,
    installmentCount: null,
    isActive: false,
    status: "paused",
  };
  // Deleting this month's payment rewinds the schedule but keeps the pause.
  const reverted = revertRecurringState(paused, "2026-08-01");
  assert.deepEqual(reverted, { nextDueDate: "2026-08-01" });
  // …and toggle is allowed (resume), unlike for cancelled/completed.
  assert.equal(togglePlanError("paused"), null);
});

test("TEST 8: active plan payment delete restores the occurrence, plan stays active", () => {
  const active: Parameters<typeof revertRecurringState>[0] = {
    planType: "term",
    frequency: "monthly",
    nextDueDate: "2026-09-20",
    installmentsPaid: 1,
    installmentCount: 2,
    isActive: true,
    status: "active",
  };
  const reverted = revertRecurringState(active, "2026-08-20");
  assert.deepEqual(reverted, { installmentsPaid: 0, nextDueDate: "2026-08-20" });
});

test("TEST 2: completed 2/2 term is not in the open list, keeps history, reopens on delete", () => {
  const completedView = { id: 1, status: "completed" as PlanLifecycle };
  assert.deepEqual(filterPlansByTab([completedView], "open"), []);
  assert.deepEqual(filterPlansByTab([completedView], "completed"), [completedView]);
  // Reconciliation explicitly allows re-opening a completed term only when ITS
  // OWN final fulfilment is deleted (product rule, section 10).
  const reverted = revertRecurringState(
    {
      planType: "term",
      frequency: "monthly",
      nextDueDate: "2026-09-20",
      installmentsPaid: 2,
      installmentCount: 2,
      isActive: false,
      status: "completed",
    },
    "2026-09-20",
  );
  assert.equal(reverted.status, "active");
  assert.equal(reverted.isActive, true);
});

test("TEST 4/5: cancelled plan never returns — not via toggle, not via edit, not via history delete", () => {
  const cancelledView = { id: 7, status: "cancelled" as PlanLifecycle };
  assert.deepEqual(filterPlansByTab([cancelledView], "open"), []);
  // toggle guard
  assert.ok(togglePlanError("cancelled") !== null);
  // edit lifecycle
  const edited = resolveEditLifecycle({
    previousStatus: "cancelled",
    planType: "recurring",
    frequency: "monthly",
    total: null,
    done: 0,
    nextIsActive: true,
  });
  assert.deepEqual(edited, { isActive: false, status: "cancelled" });
  // history payment delete
  const reverted = revertRecurringState(
    { planType: "term", frequency: "monthly", nextDueDate: "2026-10-20", installmentsPaid: 2, installmentCount: 12, isActive: false, status: "cancelled" },
    "2026-09-20",
  );
  assert.equal(reverted.isActive, undefined);
  assert.equal(reverted.status, undefined);
  // restore is the deliberate escape hatch.
  assert.equal(canRestorePlan("cancelled"), true);
});

test("TEST 9/10: cancelled plan forecasts nothing and carries no active load (§23)", () => {
  const cancelledPlan = {
    id: 1,
    name: "Kredit",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-09-01",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: false,
    categoryId: null,
    planType: "term",
    installmentCount: 12,
    installmentsPaid: 2,
    startDate: "2026-07-01",
  };
  assert.deepEqual(buildPlanned([cancelledPlan], [], "2026-08-16", 180, []), []);
  assert.equal(isActivePlanLoad("cancelled"), false);
  assert.equal(isActivePlanLoad("completed"), false);
});
