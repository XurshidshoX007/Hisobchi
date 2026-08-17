import test from "node:test";
import assert from "node:assert/strict";
import { parsePaymentSchedule } from "../src/lib/payment-schedule-parser";
import { buildPlanned } from "../src/lib/finance";
import {
  advanceCreditTerm,
  creditSchedulesMatch,
  normalizeCreditName,
  revertCreditTerm,
} from "../src/lib/installments";
import { parseDraft, parseDrafts } from "../src/lib/nlp";

/* ============================ ACCEPTANCE: 1 KREDIT = 1 REJA ============================ */

const ACCEPTANCE = "Anor Bank Krediti:\n5 avg 192772\n5 sen 227195\n5 okt 213426\n7 dek 220310";

test("acceptance: bot parses one credit into ONE schedule with 4 installments", () => {
  const res = parsePaymentSchedule(ACCEPTANCE, "2026-07-15");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.name, "Anor Bank Krediti");
  assert.equal(res.schedule?.items.length, 4);
  assert.equal(res.schedule?.totalAmount, 853703);
});

test("acceptance: irregular dates and amounts are preserved, not flattened", () => {
  const res = parsePaymentSchedule(ACCEPTANCE, "2026-07-15");
  const dates = res.schedule?.items.map((i) => i.date);
  const amounts = res.schedule?.items.map((i) => i.amount);
  assert.deepEqual(dates, ["2026-08-05", "2026-09-05", "2026-10-05", "2026-12-07"]);
  assert.deepEqual(amounts, [192772, 227195, 213426, 220310]);
});

/* ============================ FORECAST / CASH-FLOW (§21/§22/§23) ============================ */

const creditPlan = {
  id: 1,
  name: "Anor Bank Krediti",
  amount: 213426,
  minAmount: null,
  maxAmount: null,
  nextDueDate: "2026-08-05",
  frequency: "monthly",
  isMandatory: true,
  certainty: "exact",
  isActive: true,
  categoryId: null,
  planType: "term",
  installmentCount: 4,
  installmentsPaid: 0,
  startDate: "2026-08-05",
  installments: [
    { date: "2026-08-05", amount: 192772, occurrenceNumber: 1 },
    { date: "2026-09-05", amount: 227195, occurrenceNumber: 2 },
    { date: "2026-10-05", amount: 213426, occurrenceNumber: 3 },
    { date: "2026-12-07", amount: 220310, occurrenceNumber: 4 },
  ],
};

test("forecast uses each installment's own amount (not count × average, not ×12)", () => {
  const planned = buildPlanned([creditPlan], [], "2026-08-17", 180, []);
  assert.equal(planned.filter((p) => p.date === "2026-08-05")[0]?.base, 192772);
  assert.equal(planned.filter((p) => p.date === "2026-09-05")[0]?.base, 227195);
  assert.equal(planned.filter((p) => p.date === "2026-10-05")[0]?.base, 213426);
  assert.equal(planned.filter((p) => p.date === "2026-12-07")[0]?.base, 220310);
  // Total projected = the sum of the 4 occurrences, never 12 × anything.
  assert.equal(planned.reduce((s, p) => s + p.base, 0), 853703);
});

test("forecast counts each installment exactly once; a paid one is removed", () => {
  const paidTx = [
    { date: "2026-08-05", type: "expense", amount: 192772, recurringId: 1, plannedDate: "2026-08-05", occurrenceNumber: 1 },
  ];
  const planned = buildPlanned([creditPlan], [], "2026-08-17", 180, paidTx);
  assert.equal(planned.some((p) => p.date === "2026-08-05"), false);
  assert.equal(planned.reduce((s, p) => s + p.base, 0), 660931);
});

test("fully-paid credit plan contributes nothing to the forecast", () => {
  const done = { ...creditPlan, installmentsPaid: 4 };
  assert.deepEqual(buildPlanned([done], [], "2026-08-17", 180, []), []);
});

/* ============================ TERM STATE TRANSITIONS (§14/§15) ============================ */

const installments = [{ date: "2026-08-05" }, { date: "2026-09-05" }, { date: "2026-10-05" }, { date: "2026-12-07" }];

test("advanceCreditTerm: paying moves the cursor to the NEXT unpaid installment", () => {
  assert.deepEqual(advanceCreditTerm(installments, new Set(), "2026-08-05"), {
    installmentsPaid: 1,
    nextDueDate: "2026-09-05",
    isActive: true,
    status: "active",
  });
});

test("advanceCreditTerm: paying the final installment completes the plan", () => {
  assert.deepEqual(
    advanceCreditTerm(installments, new Set(["2026-08-05", "2026-09-05", "2026-10-05"]), "2026-12-07"),
    { installmentsPaid: 4, nextDueDate: "2026-12-07", isActive: false, status: "completed" },
  );
});

test("revertCreditTerm: deleting a payment steps 2/4 → 1/4 and restores the cursor", () => {
  const reverted = revertCreditTerm(
    { status: "active", installmentsPaid: 2, installmentCount: 4 },
    installments,
    new Set(["2026-08-05"]),
  );
  assert.equal(reverted.installmentsPaid, 1);
  assert.equal(reverted.nextDueDate, "2026-09-05");
  assert.equal(reverted.isActive, undefined); // active plan stays active
});

test("revertCreditTerm: deleting the final payment reopens a completed plan", () => {
  const reverted = revertCreditTerm(
    { status: "completed", installmentsPaid: 4, installmentCount: 4 },
    installments,
    new Set(["2026-08-05", "2026-09-05", "2026-10-05"]),
  );
  assert.equal(reverted.installmentsPaid, 3);
  assert.equal(reverted.nextDueDate, "2026-12-07");
  assert.equal(reverted.isActive, true);
  assert.equal(reverted.status, "active");
});

test("revertCreditTerm: a cancelled credit plan stays cancelled (§16)", () => {
  const reverted = revertCreditTerm(
    { status: "cancelled", installmentsPaid: 2, installmentCount: 4 },
    installments,
    new Set(["2026-08-05"]),
  );
  assert.equal(reverted.installmentsPaid, 1);
  assert.equal(reverted.isActive, undefined);
  assert.equal(reverted.status, undefined);
});

/* ============================ DUPLICATE PROTECTION (§17/§18) ============================ */

test("normalizeCreditName treats merchant variants as equal without renaming", () => {
  assert.equal(normalizeCreditName("Anor Bank Krediti"), "anorbank");
  assert.equal(normalizeCreditName("anor bank kredit"), "anorbank");
  assert.equal(normalizeCreditName("AnorBank krediti"), "anorbank");
  assert.notEqual(normalizeCreditName("Anor kredit"), normalizeCreditName("Anor Bank Krediti"));
});

test("creditSchedulesMatch requires same merchant AND same date+amount set", () => {
  const items = [
    { date: "2026-08-05", amount: 192772 },
    { date: "2026-09-05", amount: 227195 },
  ];
  assert.equal(creditSchedulesMatch("Anor Bank Krediti", items, "anor bank kredit", items), true);
  assert.equal(creditSchedulesMatch("Anor Bank Krediti", items, "Uzum Nasiya", items), false);
  assert.equal(
    creditSchedulesMatch("Anor Bank Krediti", items, "Anor Bank Krediti", [{ date: "2026-08-05", amount: 192773 }, { date: "2026-09-05", amount: 227195 }]),
    false,
  );
});

/* ============================ REGRESSION: ORDINARY FLOWS (§24) ============================ */

test("ordinary expense still parses (not misclassified as a credit)", () => {
  const d = parseDraft("150 ming ovqatga ketdi", "2026-08-17");
  assert.equal(d.ok, true);
  assert.equal(d.type, "expense");
  assert.equal(d.amount, 150000);
});

test("ordinary income still parses", () => {
  const d = parseDraft("1,5 mln maosh keldi", "2026-08-17");
  assert.equal(d.ok, true);
  assert.equal(d.type, "income");
  assert.equal(d.amount, 1500000);
});

test("ordinary transfer still parses as a batch, never a schedule", () => {
  const b = parseDrafts("Naqd puldan Humo hisobiga 200 ming o'tkazdim", "2026-08-17");
  assert.ok(b.drafts.length >= 0);
});
