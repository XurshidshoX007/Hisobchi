import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCurrentMonthPlan,
  buildPlanned,
  comparePlansByDue,
  isActivePlanLoad,
  producesFutureOccurrences,
  resolvePlanLifecycle,
  type PlanLifecycle,
} from "../src/lib/finance";
import {
  nextScheduleDate,
  restoreIncomeState,
  restoreRecurringState,
} from "../src/lib/reconciliation";
import { dayMonth, relativeDayLabel, relativeDayShort } from "../src/lib/money";

const TODAY = "2026-08-16";

const plan = (over: Partial<Parameters<typeof buildPlanned>[0][number]> = {}) => ({
  id: 1,
  name: "Kredit",
  amount: 1_880_000,
  minAmount: null,
  maxAmount: null,
  nextDueDate: "2026-08-17",
  frequency: "monthly",
  isMandatory: true,
  certainty: "exact",
  isActive: true,
  status: "active" as string | null,
  categoryId: null,
  planType: "recurring",
  ...over,
});

/* ==================== ONE AUTHORITATIVE LIFECYCLE SELECTOR (§10/§39) ==================== */

test("resolvePlanLifecycle: an exhausted term is completed even when isActive drifted to true", () => {
  assert.equal(
    resolvePlanLifecycle({ status: "active", isActive: true, planType: "term", installmentCount: 2, installmentsPaid: 2 }),
    "completed",
  );
});

test("resolvePlanLifecycle: a cancelled term stays cancelled even when its counters are exhausted", () => {
  assert.equal(
    resolvePlanLifecycle({ status: "cancelled", isActive: false, planType: "term", installmentCount: 2, installmentsPaid: 2 }),
    "cancelled",
  );
});

test("resolvePlanLifecycle: explicit status outranks the legacy isActive flag", () => {
  assert.equal(resolvePlanLifecycle({ status: "paused", isActive: true, planType: "recurring" }), "paused");
  assert.equal(resolvePlanLifecycle({ status: "cancelled", isActive: true, planType: "recurring" }), "cancelled");
  assert.equal(resolvePlanLifecycle({ status: "completed", isActive: true, planType: "one_time" }), "completed");
});

test("resolvePlanLifecycle: legacy rows without a status fall back to isActive", () => {
  assert.equal(resolvePlanLifecycle({ status: null, isActive: true, planType: "recurring" }), "active");
  assert.equal(resolvePlanLifecycle({ status: undefined, isActive: false, planType: "recurring" }), "paused");
});

test("only ACTIVE plans produce future occurrences / carry money load", () => {
  const statuses: PlanLifecycle[] = ["active", "paused", "cancelled", "completed"];
  assert.deepEqual(
    statuses.map((s) => isActivePlanLoad(s)),
    [true, false, false, false],
  );
  assert.equal(producesFutureOccurrences({ status: "paused", isActive: false, planType: "recurring" }), false);
  assert.equal(producesFutureOccurrences({ status: "active", isActive: true, planType: "recurring" }), true);
});

test("a status-drifted row (cancelled but isActive=true) never leaks into the forecast", () => {
  const planned = buildPlanned([plan({ status: "cancelled", isActive: true })], [], TODAY, 60, []);
  assert.deepEqual(planned, []);
});

/* ==================== LIST ORDER (§16) ==================== */

test("plans sort by lifecycle then nearest due date — overdue first, never alphabetically", () => {
  const rows = [
    { name: "Zebra", status: "active" as PlanLifecycle, daysLeft: 12 },
    { name: "Alfa", status: "cancelled" as PlanLifecycle, daysLeft: -3 },
    { name: "Beta", status: "active" as PlanLifecycle, daysLeft: -2 },
    { name: "Gamma", status: "paused" as PlanLifecycle, daysLeft: 1 },
    { name: "Delta", status: "active" as PlanLifecycle, daysLeft: 0 },
  ];
  assert.deepEqual(
    [...rows].sort(comparePlansByDue).map((r) => r.name),
    ["Beta", "Delta", "Zebra", "Gamma", "Alfa"],
  );
});

/* ==================== OVERDUE OCCURRENCES ARE STILL OWED (§17) ==================== */

test("an overdue recurring occurrence stays in the money model as exactly ONE backlog item", () => {
  // Cursor parked on 10 May while today is 16 Aug: the missed payment is still
  // owed, but the plan must not generate a phantom Jun/Jul backlog.
  const planned = buildPlanned([plan({ nextDueDate: "2026-05-10" })], [], TODAY, 60, []);
  assert.deepEqual(planned.map((p) => p.date), ["2026-05-10", "2026-09-10", "2026-10-10"]);
});

test("an overdue one-time payment does not disappear when its date passes", () => {
  const planned = buildPlanned([plan({ planType: "one_time", frequency: "once", nextDueDate: "2026-08-14" })], [], TODAY, 60, []);
  assert.deepEqual(planned.map((p) => p.date), ["2026-08-14"]);
});

test("a paid overdue occurrence is reconciled away by occurrence identity", () => {
  const planned = buildPlanned(
    [plan({ planType: "one_time", frequency: "once", nextDueDate: "2026-08-14" })],
    [],
    TODAY,
    60,
    [{ date: "2026-08-15", type: "expense", amount: 1_880_000, recurringId: 1, plannedDate: "2026-08-14" }],
  );
  assert.deepEqual(planned, []);
});

test("unreceived past income is still NOT forecast (real vs plan separation is preserved)", () => {
  const planned = buildPlanned(
    [],
    [
      {
        id: 5,
        sourceName: "Ish haqi",
        amount: 5_000_000,
        minAmount: null,
        maxAmount: null,
        expectedDate: "2026-08-10",
        frequency: "monthly",
        certainty: "exact",
        isActive: true,
        status: "active",
        linkedTransactionId: null,
        planType: "recurring",
      },
    ],
    TODAY,
    60,
    [],
  );
  assert.deepEqual(planned.map((p) => p.date), ["2026-09-10", "2026-10-10"]);
});

/* ==================== CURRENT-MONTH SUMMARY (§28/§29) ==================== */

test("current-month summary splits mandatory/optional, paid and remaining from reconciled sources", () => {
  const ledger = [
    // Kredit's August occurrence was really paid (1/12).
    { type: "expense", amount: 1_880_000, date: "2026-08-17", recurringId: 1, plannedDate: "2026-08-17" },
    // A deleted payment must not count …
    { type: "expense", amount: 999_999, date: "2026-08-05", recurringId: 2, plannedDate: "2026-08-05", isDeleted: true },
    // … and neither must an unrelated transaction.
    { type: "expense", amount: 123_000, date: "2026-08-05", recurringId: null },
  ];
  const planned = buildPlanned(
    [
      plan({ id: 1, name: "Kredit", nextDueDate: "2026-09-17", startDate: "2026-08-17", planType: "term", installmentCount: 12, installmentsPaid: 1 }),
      plan({ id: 2, name: "Elektr", amount: 400_000, nextDueDate: "2026-08-20" }),
      plan({ id: 3, name: "Sport", amount: 350_000, nextDueDate: "2026-08-25", isMandatory: false }),
    ],
    [],
    TODAY,
    60,
    ledger,
  );
  const summary = buildCurrentMonthPlan(
    planned,
    ledger,
    new Map([
      [1, true],
      [2, true],
      [3, false],
    ]),
    TODAY,
  );

  assert.equal(summary.paid, 1_880_000);
  assert.equal(summary.paidMandatory, 1_880_000);
  assert.equal(summary.remaining, 750_000); // 400k mandatory + 350k optional
  assert.equal(summary.remainingMandatory, 400_000);
  assert.equal(summary.mandatoryTotal, 2_280_000);
  assert.equal(summary.optionalTotal, 350_000);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.remainingCount, 2);
  assert.equal(summary.overdueCount, 0);
  assert.equal(summary.nearest?.name, "Elektr");
  assert.equal(summary.nearest?.status, "upcoming");
  assert.ok(summary.progress > 0.8 && summary.progress < 0.83);
});

test("current-month summary surfaces overdue occurrences", () => {
  const planned = buildPlanned([plan({ id: 9, name: "Kompyuter", amount: 1_250_000, planType: "one_time", frequency: "once", nextDueDate: "2026-08-14" })], [], TODAY, 60, []);
  const summary = buildCurrentMonthPlan(planned, [], new Map([[9, true]]), TODAY);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.overdueAmount, 1_250_000);
  assert.equal(summary.nearest?.status, "overdue");
});

test("cancelled and paused plans contribute nothing to the current month", () => {
  const planned = buildPlanned(
    [plan({ id: 1, status: "cancelled", isActive: false }), plan({ id: 2, status: "paused", isActive: false })],
    [],
    TODAY,
    60,
    [],
  );
  const summary = buildCurrentMonthPlan(planned, [], new Map(), TODAY);
  assert.equal(summary.total, 0);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.nearest, null);
});

/* ==================== RESTORE RE-ANCHORS THE SCHEDULE (§26) ==================== */

test("nextScheduleDate rolls a stale monthly cursor forward to the next real occurrence", () => {
  assert.equal(nextScheduleDate({ planType: "recurring", frequency: "monthly", cursor: "2026-05-10" }, TODAY), "2026-09-10");
  assert.equal(nextScheduleDate({ planType: "recurring", frequency: "weekly", cursor: "2026-08-01" }, TODAY), "2026-08-22");
  // A future cursor is already valid and must not move.
  assert.equal(nextScheduleDate({ planType: "recurring", frequency: "monthly", cursor: "2026-09-01" }, TODAY), "2026-09-01");
  // A one-time plan has no cadence to roll: it stays honest about being overdue.
  assert.equal(nextScheduleDate({ planType: "one_time", frequency: "once", cursor: "2026-07-01" }, TODAY), "2026-07-01");
});

test("restore reactivates AND re-anchors the schedule instead of reviving a stale date", () => {
  assert.deepEqual(
    restoreRecurringState({ planType: "recurring", frequency: "monthly", nextDueDate: "2026-05-10" }, TODAY),
    { isActive: true, status: "active", nextDueDate: "2026-09-10" },
  );
  assert.deepEqual(
    restoreIncomeState({ planType: "recurring", frequency: "monthly", expectedDate: "2026-06-05" }, TODAY),
    { isActive: true, status: "active", expectedDate: "2026-09-05" },
  );
});

test("a restored plan immediately forecasts from its new anchor", () => {
  const restored = restoreRecurringState({ planType: "recurring", frequency: "monthly", nextDueDate: "2026-05-10" }, TODAY);
  const planned = buildPlanned([plan({ nextDueDate: restored.nextDueDate })], [], TODAY, 60, []);
  assert.deepEqual(planned.map((p) => p.date), ["2026-09-10", "2026-10-10"]);
});

/* ==================== HUMAN DATE LABELS (§9) ==================== */

test("relative day labels never render cryptic counters like '17k'", () => {
  assert.equal(relativeDayLabel(0), "Bugun");
  assert.equal(relativeDayLabel(1), "Ertaga");
  assert.equal(relativeDayLabel(4), "4 kundan keyin");
  assert.equal(relativeDayLabel(-1), "Kecha");
  assert.equal(relativeDayLabel(-3), "3 kun kechikdi");
  assert.equal(relativeDayShort(3), "3 kun qoldi");
  assert.equal(relativeDayShort(-2), "2 kun kechikdi");
  assert.equal(dayMonth("2026-08-17"), "17 avg");
});
