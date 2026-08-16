import test from "node:test";
import assert from "node:assert/strict";

/**
 * Activation / configuration / failure-path tests for the image pipeline.
 *
 * These cover the ROOT CAUSE of "Rasm tahlili hozircha yoqilmagan" and every
 * runtime branch around it: the feature flag, test-user rollout, provider
 * configuration, the OpenAI-compatible request payload and the mapping of
 * provider failures onto user-friendly Uzbek messages.
 *
 * No live vision API is used anywhere: the deterministic providers and pure
 * helpers are the only things exercised.
 */

import { imageAccessDecision } from "../src/lib/image/access";
import {
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
  FailingVisionProvider,
  StaticVisionProvider,
  adjustPayloadForError,
  buildChatPayload,
  failureReasonForStatus,
  parseProviderPayload,
  resolveVisionProvider,
  usesCompletionTokenParams,
  visionProviderInfo,
  type VisionFailureReason,
  type VisionRequest,
} from "../src/lib/image/provider";
import {
  IMAGE_DISABLED_TEXT,
  IMAGE_PROVIDER_BUSY_TEXT,
  IMAGE_SERVICE_UNAVAILABLE_TEXT,
  IMAGE_TIMEOUT_TEXT,
  IMAGE_UNREADABLE_TEXT,
  failureEventFor,
  failureTextFor,
} from "../src/lib/image/ux";
import { analyzeFinancialImage } from "../src/lib/imageIntelligence";
import {
  imageIntelligenceEnabled,
  imageIntelligenceStatus,
  imageIntelligenceTestUsers,
  visionProviderConfigured,
} from "../src/lib/env";
import { normalizeAmount, normalizeDate } from "../src/lib/image/normalize";
import type { UserCategory } from "../src/lib/image/categories";
import type { DownloadedImage } from "../src/lib/image/telegram-file";

const TODAY = "2026-08-16";

const CATEGORIES: UserCategory[] = [
  { id: 1, name: "Oziq-ovqat", type: "expense", isActive: true },
  { id: 2, name: "Transport", type: "expense", isActive: true },
  { id: 5, name: "Kredit", type: "expense", isActive: true },
  { id: 6, name: "Ish haqi", type: "income", isActive: true },
];

const IMAGE: DownloadedImage = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  mimeType: "image/jpeg",
  bytes: 4,
  contentHash: "a".repeat(64),
};

const VISION_ENV_KEYS = [
  "IMAGE_INTELLIGENCE_ENABLED",
  "IMAGE_INTELLIGENCE_TEST_USERS",
  "VISION_API_KEY",
  "OPENAI_API_KEY",
  "VISION_BASE_URL",
  "VISION_MODEL",
  "VISION_REASONING_EFFORT",
] as const;

/** Runs `fn` with a temporary environment and always restores the original. */
function withEnv(values: Partial<Record<(typeof VISION_ENV_KEYS)[number], string | undefined>>, fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const key of VISION_ENV_KEYS) saved.set(key, process.env[key]);
  try {
    for (const key of VISION_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function visionRequest(): VisionRequest {
  return {
    image: IMAGE.buffer,
    mimeType: IMAGE.mimeType,
    hints: { today: TODAY, categoryNames: CATEGORIES.map((c) => c.name) },
  };
}

/* ===================== ROOT CAUSE: FEATURE FLAG (§2, §12) ===================== */

test("the flag is OFF by default and is never bypassed", () => {
  withEnv({}, () => {
    assert.equal(imageIntelligenceEnabled(777), false);
    assert.equal(imageIntelligenceEnabled(), false);
    assert.equal(imageIntelligenceStatus().state, "disabled");
  });
});

test("a test user is enabled while the global flag is still off (stage 1 rollout)", () => {
  withEnv({ IMAGE_INTELLIGENCE_TEST_USERS: "111222333, 444", VISION_API_KEY: "sk-test" }, () => {
    assert.deepEqual(imageIntelligenceTestUsers(), [111_222_333, 444]);
    assert.equal(imageIntelligenceEnabled(111_222_333), true);
    assert.equal(imageIntelligenceEnabled(999), false, "a non-listed user stays gated");
    const status = imageIntelligenceStatus();
    assert.equal(status.enabled, false);
    assert.equal(status.testUserCount, 2);
    assert.equal(status.state, "test-users-only");
  });
});

test("the global flag enables every user (stage 4 rollout)", () => {
  withEnv({ IMAGE_INTELLIGENCE_ENABLED: "true", VISION_API_KEY: "sk-test" }, () => {
    assert.equal(imageIntelligenceEnabled(999), true);
    assert.equal(imageIntelligenceEnabled(), true);
    assert.equal(imageIntelligenceStatus().state, "configured");
  });
});

test("only the exact string \"true\" enables the flag", () => {
  for (const value of ["1", "yes", "TRUE", "on", ""]) {
    withEnv({ IMAGE_INTELLIGENCE_ENABLED: value }, () => {
      assert.equal(imageIntelligenceEnabled(999), false, value);
    });
  }
});

test("a malformed test-user list never enables anyone", () => {
  withEnv({ IMAGE_INTELLIGENCE_TEST_USERS: "abc, -5, 0, 1.5, ," }, () => {
    assert.deepEqual(imageIntelligenceTestUsers(), []);
    assert.equal(imageIntelligenceEnabled(999), false);
  });
});

/* ===================== ROOT CAUSE: PROVIDER CONFIG (§3, §12) ===================== */

test("no key means no provider — and the feature reports itself as misconfigured", () => {
  withEnv({ IMAGE_INTELLIGENCE_ENABLED: "true" }, () => {
    assert.equal(visionProviderConfigured(), false);
    assert.equal(resolveVisionProvider(), null);
    const status = imageIntelligenceStatus();
    assert.equal(status.providerConfigured, false);
    assert.equal(status.state, "provider-missing");
  });
});

test("either VISION_API_KEY or OPENAI_API_KEY configures the provider", () => {
  withEnv({ VISION_API_KEY: "sk-vision" }, () => assert.ok(resolveVisionProvider()));
  withEnv({ OPENAI_API_KEY: "sk-openai" }, () => assert.ok(resolveVisionProvider()));
});

test("the health signal exposes provider and model names but NEVER the key", () => {
  withEnv(
    {
      IMAGE_INTELLIGENCE_ENABLED: "true",
      VISION_API_KEY: "sk-super-secret-value",
      VISION_MODEL: "gpt-5.4-mini",
      VISION_BASE_URL: "https://api.openai.com/v1",
    },
    () => {
      const status = imageIntelligenceStatus();
      assert.deepEqual(status, {
        enabled: true,
        testUserCount: 0,
        providerConfigured: true,
        providerName: "openai-compatible",
        model: "gpt-5.4-mini",
        endpointHost: "api.openai.com",
        state: "configured",
      });
      const serialized = JSON.stringify(status);
      assert.ok(!serialized.includes("sk-super-secret-value"), "the API key must never be serialized");
    },
  );
});

test("provider info falls back to the vetted default model", () => {
  withEnv({ VISION_API_KEY: "sk-test" }, () => {
    const info = visionProviderInfo();
    assert.equal(info.model, DEFAULT_VISION_MODEL);
    assert.equal(info.endpointHost, new URL(DEFAULT_VISION_BASE_URL).host);
  });
});

/* ========================= THE ACCESS GATE (§12, §33) ========================= */

test("flag OFF returns the honest 'not enabled yet' fallback", () => {
  const decision = imageAccessDecision(42, { featureEnabled: () => false, providerConfigured: () => true });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.reason, "feature_disabled");
  assert.equal(decision.text, IMAGE_DISABLED_TEXT);
  assert.equal(decision.event, "image_rejected");
});

test("flag ON without a provider is a SERVICE error, never 'feature disabled'", () => {
  const decision = imageAccessDecision(42, { featureEnabled: () => true, providerConfigured: () => false });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.reason, "provider_unconfigured");
  assert.equal(decision.text, IMAGE_SERVICE_UNAVAILABLE_TEXT);
  assert.equal(decision.event, "image_provider_unconfigured");
  assert.notEqual(decision.text, IMAGE_DISABLED_TEXT, "misleading message regression");
  assert.match(decision.text, /vaqtincha mavjud emas/);
});

test("flag ON with a provider lets the photo through", () => {
  const decision = imageAccessDecision(42, { featureEnabled: () => true, providerConfigured: () => true });
  assert.equal(decision.allowed, true);
});

test("the gate reads the real environment when nothing is injected", () => {
  withEnv({ IMAGE_INTELLIGENCE_ENABLED: "true", VISION_API_KEY: "sk-test" }, () => {
    assert.equal(imageAccessDecision(42).allowed, true);
  });
  withEnv({ IMAGE_INTELLIGENCE_ENABLED: "true" }, () => {
    const decision = imageAccessDecision(42);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.reason, "provider_unconfigured");
  });
});

/* ===================== PROVIDER REQUEST PAYLOAD (§3, §30) ===================== */

test("GPT-5 class models get max_completion_tokens and no temperature", () => {
  assert.equal(usesCompletionTokenParams("gpt-5.4-mini"), true);
  assert.equal(usesCompletionTokenParams("gpt-5.6-luna"), true);
  assert.equal(usesCompletionTokenParams("openai/gpt-5.5"), true);
  assert.equal(usesCompletionTokenParams("o4-mini"), true);
  assert.equal(usesCompletionTokenParams("gpt-4o-mini"), false);
  assert.equal(usesCompletionTokenParams("llava-1.6"), false);

  const payload = buildChatPayload({ baseUrl: DEFAULT_VISION_BASE_URL, model: "gpt-5.4-mini" }, visionRequest(), "data:image/jpeg;base64,AAAA");
  assert.ok("max_completion_tokens" in payload);
  assert.ok(!("max_tokens" in payload));
  assert.ok(!("temperature" in payload), "GPT-5 models reject temperature");
});

test("legacy OpenAI-compatible gateways keep max_tokens and temperature 0", () => {
  const payload = buildChatPayload({ baseUrl: DEFAULT_VISION_BASE_URL, model: "gpt-4o-mini" }, visionRequest(), "data:image/jpeg;base64,AAAA");
  assert.equal(payload.max_tokens, 1_500);
  assert.equal(payload.temperature, 0);
  assert.ok(!("max_completion_tokens" in payload));
});

test("the image is sent as an inline data URI with the OCR system prompt", () => {
  const payload = buildChatPayload(
    { baseUrl: DEFAULT_VISION_BASE_URL, model: "gpt-5.4-mini" },
    visionRequest(),
    "data:image/jpeg;base64,AAAA",
  ) as { messages: Array<{ role: string; content: unknown }>; response_format: unknown };

  assert.equal(payload.messages[0].role, "system");
  assert.match(String(payload.messages[0].content), /OCR engine for personal-finance documents/);
  const parts = payload.messages[1].content as Array<Record<string, unknown>>;
  const image = parts.find((part) => part.type === "image_url") as { image_url: { url: string } };
  assert.equal(image.image_url.url, "data:image/jpeg;base64,AAAA");
  const text = parts.find((part) => part.type === "text") as { text: string };
  assert.match(text.text, /Today is 2026-08-16/);
  assert.match(text.text, /Oziq-ovqat/, "existing category names bias reading");
  assert.deepEqual(payload.response_format, { type: "json_object" });
});

test("a valid reasoning effort is forwarded, an invalid one is ignored", () => {
  const good = buildChatPayload(
    { baseUrl: DEFAULT_VISION_BASE_URL, model: "gpt-5.4-mini", reasoningEffort: "low" },
    visionRequest(),
    "data:,",
  );
  assert.equal(good.reasoning_effort, "low");
  const bad = buildChatPayload(
    { baseUrl: DEFAULT_VISION_BASE_URL, model: "gpt-5.4-mini", reasoningEffort: "turbo" },
    visionRequest(),
    "data:,",
  );
  assert.ok(!("reasoning_effort" in bad));
});

test("a parameter-dialect 400 rewrites the payload once instead of failing the user", () => {
  const legacy = { model: "gpt-5.4-mini", max_tokens: 1_500, temperature: 0 };
  const fixed = adjustPayloadForError(legacy, "Unsupported parameter: 'max_tokens' is not supported. Use 'max_completion_tokens'.");
  assert.deepEqual(fixed, { model: "gpt-5.4-mini", max_completion_tokens: 1_500 });

  const modern = { model: "custom", max_completion_tokens: 4_000 };
  assert.deepEqual(adjustPayloadForError(modern, "unknown field max_completion_tokens"), {
    model: "custom",
    max_tokens: 4_000,
  });

  const jsonMode = { model: "custom", response_format: { type: "json_object" }, max_tokens: 10 };
  assert.deepEqual(adjustPayloadForError(jsonMode, "response_format is not supported"), { model: "custom", max_tokens: 10 });

  assert.equal(adjustPayloadForError({ model: "x" }, "you are out of credits"), null, "nothing to retry");
});

/* ======================= PROVIDER FAILURE MAPPING (§14) ======================= */

test("HTTP statuses map onto the failure taxonomy", () => {
  assert.equal(failureReasonForStatus(401), "auth_error");
  assert.equal(failureReasonForStatus(403), "auth_error");
  assert.equal(failureReasonForStatus(429), "rate_limited");
  assert.equal(failureReasonForStatus(500), "provider_error");
  assert.equal(failureReasonForStatus(502), "provider_error");
  assert.equal(failureReasonForStatus(504), "timeout");
  assert.equal(failureReasonForStatus(413), "too_large");
  assert.equal(failureReasonForStatus(415), "unsupported_image");
});

test("every failure reason has a friendly Uzbek message and a monitoring event", () => {
  const reasons: VisionFailureReason[] = [
    "unconfigured",
    "auth_error",
    "rate_limited",
    "provider_error",
    "timeout",
    "unreadable",
    "unsupported_image",
    "too_large",
  ];
  for (const reason of [...reasons, "no_content" as const]) {
    const text = failureTextFor(reason);
    assert.ok(text.length > 10, reason);
    // No raw provider vocabulary may reach the user.
    assert.doesNotMatch(text, /error|status|http|401|403|429|500|token|api[_ ]?key|openai|gpt-/i, reason);
    assert.ok(failureEventFor(reason).startsWith("image_"), reason);
  }

  assert.equal(failureTextFor("rate_limited"), IMAGE_PROVIDER_BUSY_TEXT);
  assert.equal(failureTextFor("timeout"), IMAGE_TIMEOUT_TEXT);
  assert.equal(failureTextFor("unreadable"), IMAGE_UNREADABLE_TEXT);
  assert.equal(failureTextFor("unconfigured"), IMAGE_SERVICE_UNAVAILABLE_TEXT);
  assert.equal(failureTextFor("auth_error"), IMAGE_SERVICE_UNAVAILABLE_TEXT);
  assert.equal(failureEventFor("unconfigured"), "image_provider_unconfigured");
  assert.equal(failureEventFor("auth_error"), "image_provider_unconfigured");
  assert.equal(failureEventFor("rate_limited"), "image_provider_rate_limited");
});

test("an auth failure is never reported to the user as a disabled feature", () => {
  assert.notEqual(failureTextFor("auth_error"), IMAGE_DISABLED_TEXT);
  assert.notEqual(failureTextFor("unconfigured"), IMAGE_DISABLED_TEXT);
});

/* ================= ANALYSIS WITH DETERMINISTIC PROVIDERS (§30) ================= */

test("analysis without a configured provider reports 'unconfigured', not a crash", async () => {
  await withEnvAsync({}, async () => {
    const result = await analyzeFinancialImage(IMAGE, { today: TODAY, categories: CATEGORIES });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unconfigured");
  });
});

test("every provider failure propagates its reason to the analysis layer", async () => {
  for (const reason of ["timeout", "rate_limited", "auth_error", "provider_error", "unreadable"] as VisionFailureReason[]) {
    const result = await analyzeFinancialImage(IMAGE, {
      today: TODAY,
      categories: CATEGORIES,
      provider: new FailingVisionProvider(reason),
    });
    assert.equal(result.ok, false, reason);
    if (!result.ok) assert.equal(result.reason, reason);
  }
});

test("a readable but non-financial image asks for content instead of saving nothing silently", async () => {
  const result = await analyzeFinancialImage(IMAGE, {
    today: TODAY,
    categories: CATEGORIES,
    provider: new StaticVisionProvider(["Xayrli kun", "Rahmat!"]),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_content");
});

/* ======================= E2E SCENARIOS VIA THE PIPELINE ======================= */

test("E2E shopping image → 4 expense drafts totalling 180 000, nothing saved yet", async () => {
  const result = await analyzeFinancialImage(IMAGE, {
    today: TODAY,
    categories: CATEGORIES,
    provider: new StaticVisionProvider(["Non — 10 000", "Go'sht — 120 000", "Sut — 15 000", "Sabzavot — 35 000"]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.drafts.length, 4);
  assert.ok(result.drafts.every((d) => d.kind === "transaction"));
  assert.ok(result.drafts.every((d) => (d.data as { type: string }).type === "expense"));
  assert.ok(result.drafts.every((d) => (d.data as { categoryId: number }).categoryId === 1), "all map to Oziq-ovqat");
  const total = result.drafts.reduce((sum, d) => sum + Number((d.data as { amount: number }).amount), 0);
  assert.equal(total, 180_000);
  assert.ok(result.drafts.every((d) => d.meta.source === "image"), "drafts are confirmation-only, never writes");
});

test("E2E credit schedule → a mandatory 12-month plan, not 12 transactions", async () => {
  const result = await analyzeFinancialImage(IMAGE, {
    today: TODAY,
    categories: CATEGORIES,
    provider: new StaticVisionProvider(["Kredit", "1 880 000", "17-sana", "12 oy"]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.drafts.length, 1);
  const draft = result.drafts[0];
  assert.equal(draft.kind, "payment_plan", "a schedule is a PLAN, never a real transaction");
  const data = draft.data as Record<string, unknown>;
  assert.equal(data.amount, 1_880_000);
  assert.equal(data.dueDay, 17);
  assert.equal(data.planType, "term");
  assert.equal(data.installmentCount, 12);
  assert.equal(data.isMandatory, true);
  assert.equal(data.categoryId, 5, "mapped onto the existing Kredit category");
});

test("E2E expected income → an expectedIncome plan, not a real income transaction", async () => {
  const result = await analyzeFinancialImage(IMAGE, {
    today: TODAY,
    categories: CATEGORIES,
    provider: new StaticVisionProvider(["20 avgust", "Avans", "3 000 000"]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].kind, "expected_income");
  const data = result.drafts[0].data as Record<string, unknown>;
  assert.equal(data.amount, 3_000_000);
  assert.equal(data.expectedDate, "2026-08-20");
  assert.equal(result.documentClass, "EXPECTED_INCOME");
});

test("E2E debt list → per-person direction taken from the wording", async () => {
  const result = await analyzeFinancialImage(IMAGE, {
    today: TODAY,
    categories: CATEGORIES,
    provider: new StaticVisionProvider(["Ali — menga 500 000 qarzdor", "Vali — men 700 000 berishim kerak"]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.drafts.length, 2);
  const [ali, vali] = result.drafts.map((d) => d.data as Record<string, unknown>);
  assert.equal(ali.direction, "owed_to_me");
  assert.equal(ali.amount, 500_000);
  assert.match(String(ali.personName), /Ali/);
  assert.equal(vali.direction, "i_owe");
  assert.equal(vali.amount, 700_000);
  assert.match(String(vali.personName), /Vali/);
});

test("E2E mixed image keeps every entity type — no silent drops", async () => {
  const result = await analyzeFinancialImage(IMAGE, {
    today: TODAY,
    categories: CATEGORIES,
    provider: new StaticVisionProvider([
      "Maosh 8 000 000",
      "Kredit 1 880 000 17-sana 12 oy",
      "Non 30 000",
      "Taksi 50 000",
      "Ali — menga 500 000 qarzdor",
      "Vali — men 700 000 berishim kerak",
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.documentClass, "MIXED_FINANCE");
  const kinds = result.drafts.map((d) => d.meta.entityKind);
  assert.equal(kinds.filter((k) => k === "income").length, 1);
  assert.equal(kinds.filter((k) => k === "payment_plan").length, 1);
  assert.equal(kinds.filter((k) => k === "expense").length, 2);
  assert.equal(kinds.filter((k) => k === "debt").length, 2);
  assert.equal(result.drafts.length, 6, "every row survives to confirmation");
});

/* ==================== NORMALIZATION REGRESSIONS (§16, §17) ==================== */

test("separator ambiguity never turns 1 880 000 into 1.88, 1880 or 18 800 000", () => {
  for (const raw of ["1 880 000", "1,880,000", "1.880.000", "1880000", "1 880 000 so'm", "1 880 000 UZS"]) {
    assert.equal(normalizeAmount(raw).value, 1_880_000, raw);
  }
});

test("dates are read from Uzbek, Russian and English rows", () => {
  assert.equal(normalizeDate("17 avg", TODAY).date, "2026-08-17");
  assert.equal(normalizeDate("17-avgust", TODAY).date, "2026-08-17");
  assert.equal(normalizeDate("17.08", TODAY).date, "2026-08-17");
  assert.equal(normalizeDate("20/08", TODAY).date, "2026-08-20");
  assert.equal(normalizeDate("20 августа", TODAY).date, "2026-08-20");
  assert.equal(normalizeDate("20 August", TODAY).date, "2026-08-20");
  assert.equal(normalizeDate("5 сентября", TODAY).date, "2026-09-05");
});

/* ============================ PAYLOAD PARSING ============================ */

test("a provider answer that is not JSON is 'unreadable', never a crash", () => {
  for (const content of ["", "sorry, I cannot read this image", "{ broken", "[]"]) {
    const parsed = parseProviderPayload(content, "test");
    assert.equal(parsed.ok, false, content);
    if (!parsed.ok) assert.equal(parsed.reason, "unreadable");
  }
});

/* ================================ helpers ================================ */

async function withEnvAsync(
  values: Partial<Record<(typeof VISION_ENV_KEYS)[number], string | undefined>>,
  fn: () => Promise<void>,
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const key of VISION_ENV_KEYS) saved.set(key, process.env[key]);
  try {
    for (const key of VISION_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key] = value;
    }
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
