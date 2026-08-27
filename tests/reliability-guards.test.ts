import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeErrorDiagnostic } from "../src/lib/error-diagnostics";
import { classifyWebhookFailure } from "../src/lib/webhook-failure";
import { totalBalanceInCurrency } from "../src/lib/finance";
import { PayloadTooLargeError, readJsonBody } from "../src/lib/request-body";

test("a pre-claim database failure remains retriable while malformed JSON is poison", () => {
  assert.deepEqual(classifyWebhookFailure(new SyntaxError("bad json")), {
    code: "invalid_json",
    status: 200,
  });
  assert.deepEqual(classifyWebhookFailure(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" })), {
    code: "internal",
    status: 500,
  });
});

test("audit fallback diagnostics never serialize raw error messages or connection URLs", () => {
  const secretUrl = "postgresql://user:do-not-log@example.invalid/db";
  const diagnostic = safeErrorDiagnostic(Object.assign(new Error(secretUrl), { code: "ECONNRESET" }));
  const serialized = JSON.stringify(diagnostic);
  assert.equal(diagnostic.errorName, "Error");
  assert.equal(diagnostic.errorCode, "ECONNRESET");
  assert.ok(!serialized.includes("do-not-log"));
  assert.ok(!serialized.includes("postgresql://"));
});

test("an ambiguous mutation exception keeps its idempotency claim", () => {
  const route = readFileSync(new URL("../src/app/api/mutate/route.ts", import.meta.url), "utf8");
  const catchBlock = route.split("} catch {").at(-1) ?? "";
  assert.match(catchBlock, /Never delete an idempotency claim/);
  assert.doesNotMatch(catchBlock, /\.delete\(idempotencyKeys\)/);
  assert.match(route, /status === "completed"/);
  assert.match(route, /request_in_progress/);
  assert.match(route, /idempotency_key_payload_mismatch/);
  assert.match(route, /existing\[0\]\.requestHash !== requestHash/);
});

test("the Mini App reuses an idempotency key after an ambiguous response", () => {
  const provider = readFileSync(new URL("../src/components/providers.tsx", import.meta.url), "utf8");
  assert.match(provider, /pendingMutationRef/);
  assert.match(provider, /memoryPending\.signature === signature/);
  assert.match(provider, /sessionStorage\.setItem/);
  assert.match(provider, /mutationSignature\(body\)/);
  assert.doesNotMatch(provider, /sessionStorage\.setItem\([^\n]*body/);
  assert.match(provider, /res\.status < 500/);
  assert.match(provider, /Keep pendingMutationRef/);
});

test("schedule idempotency never converts a database exception into duplicate success", () => {
  const webhook = readFileSync(new URL("../src/app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  const claim = webhook.split("Claim idempotency.")[1]?.split("if (!claimedIdem[0])")[0] ?? "";
  assert.match(claim, /schedule_idempotency_claim_failed/);
  assert.doesNotMatch(claim, /isDuplicate = true/);
  assert.match(webhook, /existingClaim\[0\]\?\.status === "completed"/);
});

test("the PostgreSQL pool handles idle-client error events without logging raw messages", () => {
  const source = readFileSync(new URL("../src/db/index.ts", import.meta.url), "utf8");
  assert.match(source, /pool\.on\("error"/);
  assert.match(source, /safeErrorDiagnostic\(error\)/);
  assert.doesNotMatch(source, /error\.message/);
});

test("deleting a goal contribution from History reverses its saved amount", () => {
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0011_goal_transaction_link.sql", import.meta.url), "utf8");

  assert.match(schema, /transactionId: integer\("transaction_id"\)/);
  assert.match(mutations, /transactionId: transaction\.id/);
  assert.match(mutations, /eq\(goalContributions\.transactionId, existing\[0\]\.id\)/);
  assert.match(mutations, /savedAfterReversal/);
  assert.match(migration, /goal_contributions_transaction_id_transactions_id_fk/);
  assert.match(migration, /DELETE FROM "goal_contributions"/);
});

test("ledger currency cannot be relabelled or mixed without an FX model", () => {
  const user = readFileSync(new URL("../src/lib/user.ts", import.meta.url), "utf8");
  const state = readFileSync(new URL("../src/lib/state.ts", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");

  assert.match(user, /patch\.currency !== user\.currency/);
  assert.match(user, /avtomatik almashtirib bo'lmaydi/);
  assert.equal(
    totalBalanceInCurrency(
      [
        { currency: "UZS", currentBalance: 1_000_000, isActive: true },
        { currency: "USD", currentBalance: 100, isActive: true },
        { currency: "UZS", currentBalance: 50_000, isActive: false },
      ],
      "UZS",
    ),
    1_000_000,
    "USD and archived UZS accounts are never dimensionlessly added",
  );
  assert.match(state, /totalBalanceInCurrency\(accountViews, user\.currency\)/);
  assert.match(state, /const reportingTxRows = txRows\.filter\(\(t\) => t\.currency === user\.currency\)/);
  assert.match(state, /ledger-currency-mismatch/);
  assert.match(settings, /setCurrency\(e\.target\.value\)\} disabled>/);
});

test("generic transaction creation cannot bypass plan occurrence CAS", () => {
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  const transactionCreate = mutations.split('case "transaction"')[1]?.split('if (input.action === "update")')[0] ?? "";

  assert.match(transactionCreate, /d\.recurringId !== undefined/);
  assert.match(transactionCreate, /d\.expectedIncomeId !== undefined/);
  assert.match(transactionCreate, /Reja operatsiyasini To'lovlar bo'limidan/);
  assert.doesNotMatch(transactionCreate, /recurringId,/);
  assert.doesNotMatch(transactionCreate, /expectedIncomeId,/);
});

test("every new posting account must match the user's immutable ledger currency", () => {
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  assert.match(mutations, /requestedCurrency !== user\.currency/);
  assert.match(mutations, /eq\(accounts\.currency, currency\)/);
  assert.match(mutations, /rows\[0\]\.currency !== currency/);
});

test("nullable all-category budget upserts are serialized by logical key", () => {
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  assert.match(mutations, /pg_advisory_xact_lock/);
  assert.match(mutations, /budget:\$\{month\}:\$\{categoryId \?\? "all"\}/);
  assert.match(mutations, /existing\.length > 1/);
});

test("financial categories are owner-, active-, and direction-scoped", () => {
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  assert.match(mutations, /ownsCategory\(userId, categoryId, type\)/);
  assert.match(mutations, /ownsCategory\(userId, categoryId, "expense"\)/);
  assert.match(mutations, /ownsCategory\(userId, categoryId, "income"\)/);
  assert.match(mutations, /eq\(categories\.type, categoryType\)/);
  assert.match(mutations, /parent\.type !== type \|\| parent\.parentId/);
});

test("database preflight is read-only and emits aggregate counts only", () => {
  const preflight = readFileSync(new URL("../scripts/db-preflight.mjs", import.meta.url), "utf8");
  assert.match(preflight, /BEGIN READ ONLY/);
  assert.match(preflight, /count\(\*\)::int/);
  assert.doesNotMatch(preflight, /delete from|update\s+[a-z_]+\s+set|truncate|drop table/i);
  assert.match(preflight, /never row values, names, Telegram ids, notes or secrets/i);
});

test("migration runner fails closed on edited or out-of-order applied migrations", () => {
  const runner = readFileSync(new URL("../scripts/migrate.mjs", import.meta.url), "utf8");
  assert.match(runner, /Migration drift detected/);
  assert.match(runner, /Migration ordering gap detected/);
  assert.match(runner, /appliedByTimestamp/);
});

test("JSON payload limits are enforced on bytes read, not only Content-Length", async () => {
  const parsed = await readJsonBody<{ ok: boolean }>(
    new Request("https://example.test", { method: "POST", body: JSON.stringify({ ok: true }) }),
    64,
  );
  assert.deepEqual(parsed, { ok: true });

  await assert.rejects(
    readJsonBody(new Request("https://example.test", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) }), 32),
    PayloadTooLargeError,
  );
  await assert.rejects(
    readJsonBody(new Request("https://example.test", { method: "POST", body: "{" }), 32),
    SyntaxError,
  );
});
