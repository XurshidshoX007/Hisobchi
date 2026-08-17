import test from "node:test";
import assert from "node:assert/strict";

/**
 * Database-backed lifecycle for credit schedules (§8–§16).
 *
 * Requires a real PostgreSQL: set `TEST_DATABASE_URL` (or `DATABASE_URL`) to a
 * throwaway database with the project migrations applied. Without it the suite
 * skips instead of failing.
 *
 * What is proven here (and cannot be proven by pure unit tests):
 *   • confirm creates ONE `term` plan + N installments atomically
 *   • the Mini App sees 0/4 + remaining total as one card
 *   • "To‘landi" pays the NEXT installment and recomputes the counters
 *   • deleting a payment steps back 2/4 → 1/4 without deleting the plan
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;
delete process.env.REDIS_URL;

const skip = DATABASE_URL ? false : "TEST_DATABASE_URL / DATABASE_URL is not set";

test("credit schedule database lifecycle", { skip }, async (t) => {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("../src/db");
  const { users, accounts, recurringExpenses, creditInstallments, transactions } = await import("../src/db/schema");
  const { createCreditTermPlan, runMutation } = await import("../src/lib/mutations");
  const { buildAppState } = await import("../src/lib/state");

  const telegramId = 900_000_000 + Math.floor(Math.random() * 1_000_000);
  const [user] = await db.insert(users).values({ telegramId, firstName: "Kredit Test" }).returning();
  t.after(async () => {
    await db.delete(users).where(eq(users.id, user.id));
    await pool.end();
  });

  await db.insert(accounts).values({ userId: user.id, name: "Naqd", type: "cash", initialBalance: 5_000_000, isActive: true });

  const installments = [
    { date: "2026-08-05", amount: 192772 },
    { date: "2026-09-05", amount: 227195 },
    { date: "2026-10-05", amount: 213426 },
    { date: "2026-12-07", amount: 220310 },
  ];

  await t.test("createCreditTermPlan writes ONE term plan and N installments", async () => {
    const result = await createCreditTermPlan(user, { name: "Anor Bank Krediti", installments });
    assert.equal(result.ok, true, result.message);

    const plans = await db
      .select()
      .from(recurringExpenses)
      .where(and(eq(recurringExpenses.userId, user.id), eq(recurringExpenses.id, result.id ?? -1)));
    assert.equal(plans.length, 1);
    assert.equal(plans[0].planType, "term");
    assert.equal(plans[0].installmentCount, 4);
    assert.equal(plans[0].installmentsPaid, 0);
    assert.equal(plans[0].nextDueDate, "2026-08-05");

    const rows = await db
      .select()
      .from(creditInstallments)
      .where(eq(creditInstallments.planId, plans[0].id))
      .orderBy(creditInstallments.occurrenceNumber);
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.map((r) => ({ date: r.date, amount: Number(r.amount) })),
      installments,
    );
  });

  await t.test("Mini App sees ONE card: 0/4 and remaining 853 703", async () => {
    const state = await buildAppState(user);
    const credit = state.recurring.filter((p) => p.name === "Anor Bank Krediti");
    assert.equal(credit.length, 1, "exactly one card, never one per installment");
    assert.equal(credit[0].planType, "term");
    assert.equal(credit[0].installmentCount, 4);
    assert.equal(credit[0].installmentsPaid, 0);
    assert.equal(credit[0].remainingInstallments, 4);
    assert.equal(credit[0].remainingTotal, 853703);
    assert.equal(credit[0].planTotal, 853703);
    assert.equal(credit[0].installments?.length, 4);
  });

  await t.test("To‘landi pays the next installment and recomputes counters", async () => {
    const state = await buildAppState(user);
    const credit = state.recurring.find((p) => p.name === "Anor Bank Krediti");
    assert.ok(credit);

    const pay = await runMutation(user, { entity: "recurring", action: "pay", data: { id: credit.id } });
    assert.equal(pay.ok, true, pay.message);

    const after = await buildAppState(user);
    const plan = after.recurring.find((p) => p.id === credit.id);
    assert.equal(plan?.installmentsPaid, 1);
    assert.equal(plan?.remainingInstallments, 3);
    assert.equal(plan?.nextDueDate, "2026-09-05");
    assert.equal(plan?.remainingTotal, 660931);
    assert.equal(plan?.installments?.find((i) => i.date === "2026-08-05")?.paid, true);

    const paidTx = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), eq(transactions.recurringId, credit.id), eq(transactions.isDeleted, false)));
    assert.equal(paidTx.length, 1);
    assert.equal(paidTx[0].plannedDate, "2026-08-05");
    assert.equal(Number(paidTx[0].amount), 192772);
  });

  await t.test("deleting the payment steps back 1/4 → 0/4 and keeps the plan", async () => {
    const state = await buildAppState(user);
    const credit = state.recurring.find((p) => p.name === "Anor Bank Krediti");
    assert.ok(credit);
    const paidTx = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), eq(transactions.recurringId, credit.id), eq(transactions.isDeleted, false)));

    const del = await runMutation(user, { entity: "transaction", action: "delete", data: { id: paidTx[0].id } });
    assert.equal(del.ok, true, del.message);

    const after = await buildAppState(user);
    const plan = after.recurring.find((p) => p.id === credit.id);
    assert.ok(plan, "parent plan survives payment deletion");
    assert.equal(plan.installmentsPaid, 0);
    assert.equal(plan.remainingInstallments, 4);
    assert.equal(plan.nextDueDate, "2026-08-05");
    assert.equal(plan.remainingTotal, 853703);
  });

  await t.test("atomic save never leaves a half-written schedule", async () => {
    const bad = await createCreditTermPlan(user, {
      name: "Buzuq Kredit",
      installments: [{ date: "2026-08-05", amount: 100000 }, { date: "not-a-date", amount: 200000 }],
    });
    assert.equal(bad.ok, false);
    const count = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringExpenses)
      .where(and(eq(recurringExpenses.userId, user.id), eq(recurringExpenses.name, "Buzuq Kredit")));
    assert.equal(count[0].count, 0);
  });
});
