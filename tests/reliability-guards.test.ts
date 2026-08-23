import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeErrorDiagnostic } from "../src/lib/error-diagnostics";
import { classifyWebhookFailure } from "../src/lib/webhook-failure";

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
});

test("the Mini App reuses an idempotency key after an ambiguous response", () => {
  const provider = readFileSync(new URL("../src/components/providers.tsx", import.meta.url), "utf8");
  assert.match(provider, /pendingMutationRef/);
  assert.match(provider, /previous\.signature === signature/);
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
