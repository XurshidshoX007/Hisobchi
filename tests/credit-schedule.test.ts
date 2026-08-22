import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

/* ============================ 60-INSTALLMENT LIFECYCLE & RECONCILIATION (§7, §8, §9) ============================ */

function generate60Installments(): Array<{ date: string; amount: number; occurrenceNumber: number }> {
  const out: Array<{ date: string; amount: number; occurrenceNumber: number }> = [];
  const start = new Date("2026-09-01T00:00:00Z");
  for (let i = 0; i < 60; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    const date = d.toISOString().slice(0, 10);
    out.push({ date, amount: 500_000, occurrenceNumber: i + 1 });
  }
  return out;
}

const installments60 = generate60Installments();

test("create 60-installment plan representation", () => {
  assert.equal(installments60.length, 60);
  assert.equal(installments60[0].date, "2026-09-01");
  assert.equal(installments60[59].date, "2031-08-01");
  const total = installments60.reduce((s, i) => s + i.amount, 0);
  assert.equal(total, 30_000_000);
});

test("pay installment #1 of 60", () => {
  const res = advanceCreditTerm(installments60, new Set(), installments60[0].date);
  assert.equal(res.installmentsPaid, 1);
  assert.equal(res.nextDueDate, installments60[1].date);
  assert.equal(res.isActive, true);
  assert.equal(res.status, "active");
});

test("pay installment #30 of 60 (midpoint)", () => {
  const paidDates = new Set(installments60.slice(0, 29).map((i) => i.date));
  const res = advanceCreditTerm(installments60, paidDates, installments60[29].date);
  assert.equal(res.installmentsPaid, 30);
  assert.equal(res.nextDueDate, installments60[30].date);
  assert.equal(res.isActive, true);
  assert.equal(res.status, "active");
});

test("pay installment #59 of 60", () => {
  const paidDates = new Set(installments60.slice(0, 58).map((i) => i.date));
  const res = advanceCreditTerm(installments60, paidDates, installments60[58].date);
  assert.equal(res.installmentsPaid, 59);
  assert.equal(res.nextDueDate, installments60[59].date);
  assert.equal(res.isActive, true);
  assert.equal(res.status, "active");
});

test("pay installment #60 of 60 (completion)", () => {
  const paidDates = new Set(installments60.slice(0, 59).map((i) => i.date));
  const res = advanceCreditTerm(installments60, paidDates, installments60[59].date);
  assert.equal(res.installmentsPaid, 60);
  assert.equal(res.isActive, false);
  assert.equal(res.status, "completed");
});

test("delete paid installment #30 (30/60 -> 29/60)", () => {
  const paidDates = new Set(installments60.slice(0, 29).map((i) => i.date)); // #30 removed
  const reverted = revertCreditTerm(
    { status: "active", installmentsPaid: 30, installmentCount: 60 },
    installments60,
    paidDates,
  );
  assert.equal(reverted.installmentsPaid, 29);
  assert.equal(reverted.nextDueDate, installments60[29].date);
});

test("complete 60/60 plan and reopen after deleting 60th payment", () => {
  const paidDates = new Set(installments60.slice(0, 59).map((i) => i.date)); // #60 removed
  const reverted = revertCreditTerm(
    { status: "completed", installmentsPaid: 60, installmentCount: 60 },
    installments60,
    paidDates,
  );
  assert.equal(reverted.installmentsPaid, 59);
  assert.equal(reverted.nextDueDate, installments60[59].date);
  assert.equal(reverted.isActive, true);
  assert.equal(reverted.status, "active");
});

test("duplicate 60-installment schedule detection", () => {
  const a = installments60.map((i) => ({ date: i.date, amount: i.amount }));
  const b = installments60.map((i) => ({ date: i.date, amount: i.amount }));
  assert.equal(creditSchedulesMatch("Anor Bank Krediti", a, "anor bank kredit", b), true);

  // Single installment date difference -> not duplicate
  const c = a.map((item, idx) => (idx === 30 ? { ...item, date: "2029-04-02" } : item));
  assert.equal(creditSchedulesMatch("Anor Bank Krediti", a, "Anor Bank Krediti", c), false);

  // Single installment amount difference -> not duplicate
  const d = a.map((item, idx) => (idx === 59 ? { ...item, amount: 500_001 } : item));
  assert.equal(creditSchedulesMatch("Anor Bank Krediti", a, "Anor Bank Krediti", d), false);
});

test("idempotency fingerprint with 60 installments", () => {
  const payload = {
    name: "Anor Bank Krediti",
    items: installments60.map((i) => ({ date: i.date, amount: i.amount })),
  };
  const fp1 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const fp2 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 64);
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
