import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/**
 * Production-safety integration coverage for invariants that pure finance tests
 * cannot prove. Requires a disposable, migrated PostgreSQL database.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;
process.env.BOT_TOKEN = "123456789:test-bot-token-for-local-integration-only";
process.env.DISABLE_DEMO = "true";
delete process.env.REDIS_URL;

const skip = DATABASE_URL ? false : "TEST_DATABASE_URL / DATABASE_URL is not set";

function signedInitData(telegramId: number): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "integration-query",
    user: JSON.stringify({ id: telegramId, first_name: "Integrity" }),
  });
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}

test("database accounting integrity guards", { skip }, async (t) => {
  const { and, eq, isNull, sql } = await import("drizzle-orm");
  const { db, pool } = await import("../src/db");
  const { accounts, budgets, categories, recurringExpenses, transactions, users } = await import("../src/db/schema");
  const { POST: mutateRoute } = await import("../src/app/api/mutate/route");
  const { runMutation } = await import("../src/lib/mutations");
  const { updateUserSettings } = await import("../src/lib/user");
  const { buildAppState } = await import("../src/lib/state");

  const telegramId = 910_000_000 + Math.floor(Math.random() * 1_000_000);
  const initData = signedInitData(telegramId);
  const key = "integrity-route-key-0001";
  const body = {
    entity: "transaction",
    action: "create",
    data: { type: "income", amount: 123.45, note: "idempotency integration" },
  };

  const request = (payload: unknown, idempotencyKey = key) =>
    new Request("https://hisobchi.test/api/mutate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://hisobchi.test",
        "x-telegram-init-data": initData,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

  t.after(async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
    if (user) await db.delete(users).where(eq(users.id, user.id));
    await pool.end();
  });

  await t.test("same-key replay is exactly once and payload mismatch is rejected", async () => {
    const first = await mutateRoute(request(body));
    assert.equal(first.status, 200);
    assert.equal((await first.json()).ok, true);

    const replay = await mutateRoute(request(body));
    assert.equal(replay.status, 200);
    const replayJson = await replay.json();
    assert.equal(replayJson.ok, true);
    assert.equal(replayJson.idempotent, true);

    const mismatch = await mutateRoute(
      request({ ...body, data: { ...body.data, amount: 999.99 } }),
    );
    assert.equal(mismatch.status, 422);
    assert.equal((await mismatch.json()).code, "idempotency_key_reused");

    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), eq(transactions.note, body.data.note)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, 123.45);
  });

  await t.test("currency, category, and plan bypasses fail closed", async () => {
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    assert.ok(user);
    const [foreignAccount] = await db
      .insert(accounts)
      .values({ userId: user.id, name: "Legacy USD", currency: "USD", initialBalance: 100 })
      .returning();

    const foreignPost = await runMutation(user, {
      entity: "transaction",
      action: "create",
      data: { type: "income", amount: 10, accountId: foreignAccount.id },
    });
    assert.equal(foreignPost.ok, false);

    const currencyChange = await updateUserSettings(user, { currency: "USD" });
    assert.equal(currencyChange.ok, false);

    const [incomeCategory] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, user.id), eq(categories.type, "income")))
      .limit(1);
    const wrongCategory = await runMutation(user, {
      entity: "transaction",
      action: "create",
      data: { type: "expense", amount: 10, categoryId: incomeCategory.id },
    });
    assert.equal(wrongCategory.ok, false);

    const [plan] = await db
      .insert(recurringExpenses)
      .values({
        userId: user.id,
        name: "CAS plan",
        amount: 50,
        certainty: "exact",
        nextDueDate: "2026-09-01",
      })
      .returning();
    const planBypass = await runMutation(user, {
      entity: "transaction",
      action: "create",
      data: { type: "expense", amount: 50, recurringId: plan.id },
    });
    assert.equal(planBypass.ok, false);

    const state = await buildAppState(user);
    assert.equal(state.currentBalance, 123.45, "foreign 100 USD is not added to UZS total");
    assert.ok(state.alerts.some((alert) => alert.id === "ledger-foreign-currency"));
  });

  await t.test("concurrent nullable-category budget upserts create one logical row", async () => {
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        runMutation(user, {
          entity: "budget",
          action: "upsert",
          data: { month: "2026-08", categoryId: null, amount: 1_000_000 },
        }),
      ),
    );
    assert.ok(results.every((result) => result.ok));

    const count = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(budgets)
      .where(and(eq(budgets.userId, user.id), eq(budgets.month, "2026-08"), isNull(budgets.categoryId)));
    assert.equal(count[0].value, 1);
  });
});
