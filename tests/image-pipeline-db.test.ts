import test from "node:test";
import assert from "node:assert/strict";

/**
 * Database-backed lifecycle tests for the image pipeline.
 *
 * Requires a real PostgreSQL: set `TEST_DATABASE_URL` (or `DATABASE_URL`) to a
 * throwaway database with the project migrations applied. Without it the suite
 * skips instead of failing, so CI without a database still runs the pure tests.
 *
 *   node scripts/migrate.mjs             # against the throwaway database
 *   TEST_DATABASE_URL=postgresql://...  npx tsx --test tests/image-pipeline-db.test.ts
 *
 * What is proven here (and cannot be proven by pure unit tests):
 *   • drafts are persisted as PENDING and write NO money before confirmation
 *   • confirmation goes through the SHARED finance engine (`applyDraft`)
 *   • plans / expected income do not move the real balance, only the forecast
 *   • duplicate images are rejected by the intake fingerprint
 *   • failed analysis leaves no orphan `processing` intake row
 *   • confirmed data is visible to the Mini App through `buildAppState`
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;
// The pipeline must never reach Telegram or a live model from a test.
process.env.IMAGE_INTELLIGENCE_ENABLED = "true";
process.env.VISION_API_KEY = process.env.VISION_API_KEY ?? "sk-test-not-used";
delete process.env.REDIS_URL;

const skip = DATABASE_URL ? false : "TEST_DATABASE_URL / DATABASE_URL is not set";

test("image pipeline database lifecycle", { skip }, async (t) => {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("../src/db");
  const {
    users,
    accounts,
    categories,
    transactions,
    recurringExpenses,
    expectedIncomes,
    debts,
    pendingDrafts,
    imageIntakes,
  } = await import("../src/db/schema");
  const { processImageMessage } = await import("../src/lib/image/pipeline");
  const { applyDraft } = await import("../src/lib/drafts");
  const { StaticVisionProvider, FailingVisionProvider } = await import("../src/lib/image/provider");
  const { buildAppState } = await import("../src/lib/state");

  /* --- Telegram download is injected: no bot token, no network, no bytes. --- */
  let nextContentHash = "hash-a";
  const download = async () => ({
    ok: true as const,
    image: {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mimeType: "image/jpeg" as const,
      bytes: 4,
      contentHash: nextContentHash,
    },
  });

  const telegramId = 900_000_000 + Math.floor(Math.random() * 1_000_000);
  const [user] = await db.insert(users).values({ telegramId, firstName: "Rasm Test" }).returning();
  t.after(async () => {
    await db.delete(users).where(eq(users.id, user.id));
    await pool.end();
  });

  const [account] = await db
    .insert(accounts)
    .values({ userId: user.id, name: "Naqd", type: "cash", initialBalance: 5_000_000, isActive: true })
    .returning();
  const [food] = await db
    .insert(categories)
    .values({ userId: user.id, name: "Oziq-ovqat", type: "expense", isActive: true })
    .returning();
  await db.insert(categories).values({ userId: user.id, name: "Kredit", type: "expense", isActive: true });
  await db.insert(categories).values({ userId: user.id, name: "Ish haqi", type: "income", isActive: true });

  const baseInput = {
    user,
    chatId: 555,
    messageId: 1,
    requestId: "test-request",
    ipHash: null,
    photo: [{ file_id: "f1", file_unique_id: "u1", file_size: 1_000 }],
    download,
  };

  const balance = async (): Promise<number> => {
    const state = await buildAppState(user);
    return state.forecast.currentBalance;
  };
  const txCount = async (): Promise<number> => {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.userId, user.id));
    return rows[0].count;
  };

  const startingBalance = await balance();
  assert.equal(startingBalance, 5_000_000, "seeded opening balance");

  /* ================= 1. SHOPPING IMAGE → DRAFTS, NO MONEY ================= */

  await t.test("a shopping image creates pending drafts and writes NO transaction", async () => {
    nextContentHash = "hash-shopping";
    const outcome = await processImageMessage({
      ...baseInput,
      provider: new StaticVisionProvider(["Non — 10 000", "Go'sht — 120 000", "Sut — 15 000", "Sabzavot — 35 000"]),
    });

    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.count, 4);
    assert.match(outcome.text, /Rasm o‘qildi/);
    assert.match(outcome.text, /Jami xarajat: 180 000/);
    assert.equal(outcome.keyboard[0][0].callback_data, `batch:${outcome.batchId}:confirm`);

    const drafts = await db
      .select()
      .from(pendingDrafts)
      .where(and(eq(pendingDrafts.userId, user.id), eq(pendingDrafts.batchId, outcome.batchId)));
    assert.equal(drafts.length, 4);
    assert.ok(drafts.every((d) => d.status === "pending"));

    assert.equal(await txCount(), 0, "NOTHING is written before confirmation");
    assert.equal(await balance(), startingBalance, "balance untouched before confirmation");

    const intake = await db.select().from(imageIntakes).where(eq(imageIntakes.userId, user.id));
    assert.equal(intake.length, 1);
    assert.equal(intake[0].status, "extracted");
    assert.equal(intake[0].entityCount, 4);

    /* ---- confirmation goes through the SHARED engine ---- */
    for (const draft of drafts) {
      const result = await applyDraft(user, draft.payload as Record<string, unknown>);
      assert.equal(result.ok, true, result.message);
      await db.update(pendingDrafts).set({ status: "confirmed", resolvedAt: new Date() }).where(eq(pendingDrafts.id, draft.id));
    }

    const rows = await db.select().from(transactions).where(eq(transactions.userId, user.id));
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => r.type === "expense"));
    assert.ok(rows.every((r) => r.categoryId === food.id), "mapped onto the EXISTING category, no duplicates created");
    assert.ok(rows.every((r) => r.accountId === account.id));
    const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
    assert.equal(total, 180_000);

    assert.equal(await balance(), startingBalance - 180_000, "confirmed expenses move the real balance");

    const categoryCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(categories)
      .where(and(eq(categories.userId, user.id), eq(categories.name, "Oziq-ovqat")));
    assert.equal(categoryCount[0].count, 1, "the pipeline never duplicates a category");
  });

  /* ===================== 2. DUPLICATE PROTECTION (§21) ===================== */

  await t.test("the same photo sent twice never books money twice", async () => {
    nextContentHash = "hash-shopping"; // identical fingerprint
    const outcome = await processImageMessage({
      ...baseInput,
      messageId: 2,
      provider: new StaticVisionProvider(["Non — 10 000", "Go'sht — 120 000", "Sut — 15 000", "Sabzavot — 35 000"]),
    });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.event, "image_duplicate");
    assert.match(outcome.text, /avval qayta ishlangan/);

    assert.equal(await txCount(), 4, "no duplicate transactions");
    const pending = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pendingDrafts)
      .where(and(eq(pendingDrafts.userId, user.id), eq(pendingDrafts.status, "pending")));
    assert.equal(pending[0].count, 0, "no duplicate drafts");
  });

  /* ============ 3. CREDIT SCHEDULE → PLAN, REAL BALANCE UNCHANGED ============ */

  await t.test("a credit schedule becomes a plan and does NOT reduce the real balance", async () => {
    nextContentHash = "hash-credit";
    const before = await balance();
    const outcome = await processImageMessage({
      ...baseInput,
      messageId: 3,
      provider: new StaticVisionProvider(["Kredit", "1 880 000", "17-sana", "12 oy"]),
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.count, 1);

    const [draft] = await db
      .select()
      .from(pendingDrafts)
      .where(and(eq(pendingDrafts.userId, user.id), eq(pendingDrafts.batchId, outcome.batchId)));
    assert.equal(draft.kind, "payment_plan");

    const result = await applyDraft(user, draft.payload as Record<string, unknown>);
    assert.equal(result.ok, true, result.message);

    const plans = await db.select().from(recurringExpenses).where(eq(recurringExpenses.userId, user.id));
    assert.equal(plans.length, 1);
    assert.equal(Number(plans[0].amount), 1_880_000);
    assert.equal(plans[0].dueDay, 17);
    assert.equal(plans[0].isMandatory, true);

    assert.equal(await balance(), before, "a PLAN never moves real money");
    assert.equal(await txCount(), 4, "no transaction was created for the plan");

    // Mini App: the plan is visible and the forecast knows about the payment.
    const state = await buildAppState(user);
    assert.equal(state.recurring.length, 1);
    assert.equal(Number(state.recurring[0].amount), 1_880_000);
  });

  /* ========= 4. EXPECTED INCOME → PLAN, NO REAL INCOME TRANSACTION ========= */

  await t.test("an expected advance becomes expectedIncome, not real income", async () => {
    nextContentHash = "hash-income";
    const before = await balance();
    const outcome = await processImageMessage({
      ...baseInput,
      messageId: 4,
      provider: new StaticVisionProvider(["20 avgust", "Avans", "3 000 000"]),
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;

    const [draft] = await db
      .select()
      .from(pendingDrafts)
      .where(and(eq(pendingDrafts.userId, user.id), eq(pendingDrafts.batchId, outcome.batchId)));
    assert.equal(draft.kind, "expected_income");

    const result = await applyDraft(user, draft.payload as Record<string, unknown>);
    assert.equal(result.ok, true, result.message);

    const incomes = await db.select().from(expectedIncomes).where(eq(expectedIncomes.userId, user.id));
    assert.equal(incomes.length, 1);
    assert.equal(Number(incomes[0].amount), 3_000_000);

    assert.equal(await balance(), before, "expected income does NOT increase the real balance");
    assert.equal(await txCount(), 4, "no income transaction was created");

    const state = await buildAppState(user);
    assert.equal(state.expectedIncomes.length, 1, "Mini App Plans → Daromad sees it");
  });

  /* ==================== 5. DEBT IMAGE → DEBT RECORDS ==================== */

  await t.test("a debt image creates debts with the correct direction", async () => {
    nextContentHash = "hash-debt";
    const before = await balance();
    const outcome = await processImageMessage({
      ...baseInput,
      messageId: 5,
      provider: new StaticVisionProvider(["Ali — menga 500 000 qarzdor", "Vali — men 700 000 berishim kerak"]),
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.count, 2);

    const drafts = await db
      .select()
      .from(pendingDrafts)
      .where(and(eq(pendingDrafts.userId, user.id), eq(pendingDrafts.batchId, outcome.batchId)));
    for (const draft of drafts) {
      const result = await applyDraft(user, draft.payload as Record<string, unknown>);
      assert.equal(result.ok, true, result.message);
    }

    const rows = await db.select().from(debts).where(eq(debts.userId, user.id));
    assert.equal(rows.length, 2);
    const ali = rows.find((r) => r.personName.includes("Ali"));
    const vali = rows.find((r) => r.personName.includes("Vali"));
    assert.equal(ali?.direction, "owed_to_me");
    assert.equal(Number(ali?.amount), 500_000);
    assert.equal(vali?.direction, "i_owe");
    assert.equal(Number(vali?.amount), 700_000);

    // §26: the image path uses the SHARED engine, which treats debt creation
    // as a real cash event (money borrowed arrives, money lent leaves). The
    // image must therefore behave EXACTLY like a Mini App / typed debt entry —
    // +700 000 borrowed, −500 000 lent.
    assert.equal(await balance(), before + 700_000 - 500_000, "identical to a debt created in the Mini App");

    const state = await buildAppState(user);
    assert.equal(state.debts.length, 2, "Mini App Debts sees them");
  });

  /* ============= 6. FAILURE PATHS LEAVE NO ORPHAN INTAKE ROW ============= */

  await t.test("a provider failure releases the intake so a clearer re-send is allowed", async () => {
    const intakesBefore = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(imageIntakes)
      .where(eq(imageIntakes.userId, user.id));

    nextContentHash = "hash-timeout";
    const failed = await processImageMessage({
      ...baseInput,
      messageId: 6,
      provider: new FailingVisionProvider("timeout"),
    });
    assert.equal(failed.ok, false);
    if (failed.ok) return;
    assert.equal(failed.event, "image_processing_timeout");
    assert.match(failed.text, /vaqt oldi|uzoq davom etdi/);

    const intakesAfter = await db.select().from(imageIntakes).where(eq(imageIntakes.userId, user.id));
    assert.equal(intakesAfter.length, intakesBefore[0].count, "the failed intake row is released");
    assert.ok(!intakesAfter.some((row) => row.status === "processing"), "no orphan 'processing' row");

    // The very same picture may be retried after a failure.
    nextContentHash = "hash-timeout";
    const retry = await processImageMessage({
      ...baseInput,
      messageId: 7,
      provider: new StaticVisionProvider(["Taksi 50 000"]),
    });
    assert.equal(retry.ok, true, "a failed image is not permanently blacklisted");
  });

  await t.test("a rate-limited provider produces a friendly temporary-load message", async () => {
    nextContentHash = "hash-429";
    const outcome = await processImageMessage({
      ...baseInput,
      messageId: 8,
      provider: new FailingVisionProvider("rate_limited", { status: 429, errorClass: "rate_limit" }),
    });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.event, "image_provider_rate_limited");
    assert.match(outcome.text, /yuklama yuqori/);
    assert.doesNotMatch(outcome.text, /429|error|limiti tugagan/i);
  });

  await t.test("a quota-exhausted provider is NOT labelled as queue high", async () => {
    nextContentHash = "hash-quota";
    const outcome = await processImageMessage({
      ...baseInput,
      messageId: 9,
      provider: new FailingVisionProvider("quota_exhausted", {
        status: 429,
        errorClass: "quota_exhausted",
      }),
    });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.event, "vision_quota_exhausted");
    assert.match(outcome.text, /limiti tugagan/);
    assert.doesNotMatch(outcome.text, /navbat|yuklama yuqori|429/i);
  });

  await t.test("an auth failure tells the user the service key is wrong, not that the feature is off", async () => {
    nextContentHash = "hash-auth";
    const outcome = await processImageMessage({
      ...baseInput,
      messageId: 10,
      provider: new FailingVisionProvider("auth_error", { status: 401, errorClass: "invalid_api_key" }),
    });
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.event, "image_provider_auth_error");
    assert.match(outcome.text, /API kalit/i);
    assert.doesNotMatch(outcome.text, /hozircha yoqilmagan/i);
  });

  /* ============== 7. RATE LIMIT STOPS BEFORE THE PROVIDER (§23) ============== */

  await t.test("the 11th image in a minute is rejected without calling the provider", async () => {
    let providerCalls = 0;
    const counting = {
      name: "counting",
      async readFinancialImage() {
        providerCalls += 1;
        return { ok: true as const, provider: "counting", lines: ["Non 10 000"] };
      },
    };

    let limited: string | null = null;
    for (let i = 0; i < 14; i += 1) {
      nextContentHash = `hash-rate-${i}`;
      const outcome = await processImageMessage({ ...baseInput, messageId: 100 + i, provider: counting });
      if (!outcome.ok && outcome.event === "image_rate_limited") {
        limited = outcome.text;
        const callsAtLimit = providerCalls;
        // One more attempt must not reach the provider either.
        nextContentHash = "hash-rate-extra";
        await processImageMessage({ ...baseInput, messageId: 200, provider: counting });
        assert.equal(providerCalls, callsAtLimit, "no provider request after a rate-limit rejection");
        break;
      }
    }
    assert.ok(limited, "the per-user image rate limit engages");
    assert.match(limited!, /Juda ko'p rasm/);
  });

  /* ================= 8. MINI APP SEES EVERYTHING (§27) ================= */

  await t.test("the Mini App state reflects every confirmed image entry", async () => {
    const state = await buildAppState(user);
    assert.ok(state.transactions.length >= 4, "History sees the image expenses");
    assert.equal(state.recurring.length, 1, "Plans sees the payment plan");
    assert.equal(state.expectedIncomes.length, 1, "Plans → Daromad sees the expected income");
    assert.equal(state.debts.length, 2, "Debts sees both debts");
    // 5 000 000 − 180 000 (confirmed expenses) + 700 000 − 500 000 (shared
    // debt cash semantics). The plan and the expected income contribute
    // NOTHING to the real balance — they only exist in the forecast.
    assert.equal(state.forecast.currentBalance, 5_000_000 - 180_000 + 700_000 - 500_000);
  });
});
