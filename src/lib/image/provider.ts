/**
 * Vision/OCR provider abstraction (§28).
 *
 * The rest of the codebase talks to `VisionProvider` only. Swapping OpenAI for
 * Gemini, a self-hosted OCR service or a local Tesseract worker means adding a
 * module here — webhook routing, mutation code and the database never change.
 *
 * A provider's ONLY job is reading the image into rows of text (plus an
 * optional coarse hint). All financial meaning is derived deterministically in
 * `extract.ts`, so a provider can never invent a transaction on its own.
 */

import type { DocumentClass } from "./types";

export type VisionRequest = {
  image: Buffer;
  mimeType: string;
  /** Non-sensitive hints; never contains amounts or personal data. */
  hints: {
    today: string;
    /** Names of the user's EXISTING categories, to bias reading, not writing. */
    categoryNames: string[];
  };
  timeoutMs?: number;
  maxOutputTokens?: number;
};

export type VisionSuccess = {
  ok: true;
  provider: string;
  /** Rows of the document, top to bottom, preserving order. */
  lines: string[];
  /** Optional coarse classification hint from the model. */
  documentHint?: DocumentClass;
};

/**
 * Failure taxonomy (§25). Each reason maps to exactly one user-facing message
 * in `ux.ts`; a raw provider error/body NEVER reaches the user or the logs.
 */
export type VisionFailureReason =
  | "unconfigured"
  | "auth_error"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "unreadable"
  | "unsupported_image"
  | "too_large";

export type VisionFailure = {
  ok: false;
  provider: string;
  reason: VisionFailureReason;
};

export type VisionResult = VisionSuccess | VisionFailure;

export interface VisionProvider {
  readonly name: string;
  readFinancialImage(request: VisionRequest): Promise<VisionResult>;
}

const SYSTEM_PROMPT = [
  "You are an OCR engine for personal-finance documents (Uzbek, Russian or English).",
  "Read the image and return STRICT JSON: {\"documentHint\": string, \"lines\": string[]}.",
  "`lines` must contain the visible rows of the document, top to bottom, in reading order.",
  "Keep the original wording, numbers and separators exactly as printed — do not convert,",
  "sum, invent, translate or reorder anything. If a row is unreadable, return it as an empty string.",
  "documentHint must be one of: PAYMENT_SCHEDULE, SHOPPING_LIST, EXPENSE_LIST, INCOME_LIST,",
  "DEBT_LIST, CREDITOR_LIST, EXPECTED_PAYMENT, EXPECTED_INCOME, MIXED_FINANCE, UNKNOWN.",
].join(" ");

const DOCUMENT_CLASSES: DocumentClass[] = [
  "PAYMENT_SCHEDULE",
  "SHOPPING_LIST",
  "EXPENSE_LIST",
  "INCOME_LIST",
  "DEBT_LIST",
  "CREDITOR_LIST",
  "EXPECTED_PAYMENT",
  "EXPECTED_INCOME",
  "MIXED_FINANCE",
  "UNKNOWN",
];

/**
 * Default model.
 *
 * Requirements checked against the provider catalogue before shipping:
 *   • image input supported (this feature is useless without vision)
 *   • `v1/chat/completions` supported (the endpoint this provider speaks)
 *   • not on a deprecation/shutdown list
 *   • cheap enough for a per-photo workload
 *
 * `gpt-5.4-mini` satisfies all four (text+image in, chat completions, current
 * catalogue entry). Operators can override with `VISION_MODEL` for another
 * OpenAI-compatible gateway — the payload adapts automatically (see
 * `buildChatPayload`).
 */
export const DEFAULT_VISION_MODEL = "gpt-5.4-mini";
export const DEFAULT_VISION_BASE_URL = "https://api.openai.com/v1";

const REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);

/**
 * GPT-5 / o-series style models reject `max_tokens` and `temperature` and
 * expect `max_completion_tokens` instead. Older chat models (gpt-4o, Llama
 * gateways, vLLM…) expect the classic parameters. The provider must therefore
 * know which dialect the configured model speaks.
 */
export function usesCompletionTokenParams(model: string): boolean {
  const normalized = model.trim().toLowerCase().replace(/^[^/]*\//, "");
  return /^(gpt-5|o1|o3|o4)/.test(normalized);
}

export type VisionProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort?: string | null;
};

/** Builds the OpenAI-compatible request body for the configured model. */
export function buildChatPayload(
  config: Omit<VisionProviderConfig, "apiKey">,
  request: VisionRequest,
  dataUri: string,
): Record<string, unknown> {
  const reasoningStyle = usesCompletionTokenParams(config.model);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Today is ${request.hints.today}. Known category names: ${
            request.hints.categoryNames.slice(0, 40).join(", ") || "none"
          }.`,
        },
        { type: "image_url", image_url: { url: dataUri, detail: "high" } },
      ],
    },
  ];

  const payload: Record<string, unknown> = {
    model: config.model,
    response_format: { type: "json_object" },
    messages,
  };

  if (reasoningStyle) {
    // Reasoning tokens are billed inside the completion budget, so the cap is
    // higher than the ~1.5k tokens the JSON answer itself needs.
    payload.max_completion_tokens = request.maxOutputTokens ?? 4_000;
    const effort = config.reasoningEffort?.trim().toLowerCase();
    if (effort && REASONING_EFFORTS.has(effort)) payload.reasoning_effort = effort;
  } else {
    payload.max_tokens = request.maxOutputTokens ?? 1_500;
    payload.temperature = 0;
  }
  return payload;
}

/**
 * A 400 from an OpenAI-compatible gateway is usually a parameter dialect
 * mismatch, not a bad image. This rewrites the payload once so a mis-guessed
 * dialect (or a stricter gateway) self-heals instead of failing the user.
 * Returns null when nothing can be adjusted.
 */
export function adjustPayloadForError(
  payload: Record<string, unknown>,
  errorBody: string,
): Record<string, unknown> | null {
  const body = errorBody.toLowerCase();
  const next = { ...payload };
  let changed = false;

  if (body.includes("max_tokens") && "max_tokens" in next) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
    // A gateway that rejects `max_tokens` speaks the reasoning-model dialect,
    // which also rejects `temperature`. Both are dropped in ONE retry rather
    // than burning an attempt per rejected parameter.
    delete next.temperature;
    changed = true;
  } else if (body.includes("max_completion_tokens") && "max_completion_tokens" in next) {
    next.max_tokens = next.max_completion_tokens;
    delete next.max_completion_tokens;
    changed = true;
  }
  if (body.includes("temperature") && "temperature" in next) {
    delete next.temperature;
    changed = true;
  }
  if (body.includes("reasoning_effort") && "reasoning_effort" in next) {
    delete next.reasoning_effort;
    changed = true;
  }
  if (body.includes("response_format") && "response_format" in next) {
    delete next.response_format;
    changed = true;
  }
  return changed ? next : null;
}

/** HTTP status → failure taxonomy (§25). Never leaks the provider body. */
export function failureReasonForStatus(status: number): VisionFailureReason {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status === 413) return "too_large";
  if (status === 415 || status === 422 || status === 400) return "unsupported_image";
  return "provider_error";
}

/** OpenAI-compatible chat/completions vision provider (also fits vLLM, Groq…). */
export class OpenAiCompatibleVisionProvider implements VisionProvider {
  readonly name = "openai-compatible";

  constructor(private readonly config: VisionProviderConfig) {}

  async readFinancialImage(request: VisionRequest): Promise<VisionResult> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const dataUri = `data:${request.mimeType};base64,${request.image.toString("base64")}`;
    const timeoutMs = request.timeoutMs ?? 45_000;
    let payload = buildChatPayload(this.config, request, dataUri);

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });

        if (!response.ok) {
          // Read a bounded slice purely to detect a parameter dialect problem.
          // It is never logged and never shown to the user.
          const body = response.status === 400 ? (await response.text().catch(() => "")).slice(0, 2_000) : "";
          const adjusted = attempt === 0 && response.status === 400 ? adjustPayloadForError(payload, body) : null;
          if (adjusted) {
            payload = adjusted;
            continue;
          }
          return { ok: false, provider: this.name, reason: failureReasonForStatus(response.status) };
        }

        const json = (await response.json().catch(() => null)) as
          | { choices?: Array<{ message?: { content?: string } }> }
          | null;
        const content = json?.choices?.[0]?.message?.content;
        if (!content) return { ok: false, provider: this.name, reason: "unreadable" };
        return parseProviderPayload(content, this.name);
      }
      return { ok: false, provider: this.name, reason: "provider_error" };
    } catch (error) {
      const timeout =
        (error instanceof DOMException && error.name === "TimeoutError") ||
        (error instanceof Error && error.name === "TimeoutError");
      return { ok: false, provider: this.name, reason: timeout ? "timeout" : "provider_error" };
    }
  }
}

/** Parses a provider payload defensively — never trusts shape or size. */
export function parseProviderPayload(content: string, provider: string): VisionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Some providers wrap JSON in prose or a code fence.
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, provider, reason: "unreadable" };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { ok: false, provider, reason: "unreadable" };
    }
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, provider, reason: "unreadable" };
  const record = parsed as { lines?: unknown; documentHint?: unknown };
  const rawLines = Array.isArray(record.lines) ? record.lines : [];
  const lines = rawLines
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.slice(0, 200))
    .slice(0, 200);
  if (!lines.length) return { ok: false, provider, reason: "unreadable" };
  const hint = typeof record.documentHint === "string" ? record.documentHint.toUpperCase() : "";
  return {
    ok: true,
    provider,
    lines,
    documentHint: (DOCUMENT_CLASSES as string[]).includes(hint) ? (hint as DocumentClass) : undefined,
  };
}

/** Deterministic provider used by tests and offline development. */
export class StaticVisionProvider implements VisionProvider {
  readonly name = "static";
  constructor(private readonly lines: string[]) {}
  async readFinancialImage(request: VisionRequest): Promise<VisionResult> {
    void request;
    return { ok: true, provider: this.name, lines: this.lines };
  }
}

/** Deterministic failure provider for unit tests of the error paths (§25). */
export class FailingVisionProvider implements VisionProvider {
  readonly name = "failing";
  constructor(private readonly reason: VisionFailureReason) {}
  async readFinancialImage(request: VisionRequest): Promise<VisionResult> {
    void request;
    return { ok: false, provider: this.name, reason: this.reason };
  }
}

export type VisionProviderInfo = {
  configured: boolean;
  provider: string | null;
  model: string | null;
  /** Host only — never the full URL with a query string, never the key. */
  endpointHost: string | null;
};

/** Non-secret description of the configured provider, for /api/health (§13). */
export function visionProviderInfo(): VisionProviderInfo {
  const configured = Boolean(process.env.VISION_API_KEY ?? process.env.OPENAI_API_KEY);
  const baseUrl = process.env.VISION_BASE_URL ?? DEFAULT_VISION_BASE_URL;
  let endpointHost: string | null = null;
  try {
    endpointHost = new URL(baseUrl).host;
  } catch {
    endpointHost = null;
  }
  return {
    configured,
    provider: configured ? "openai-compatible" : null,
    model: configured ? process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL : null,
    endpointHost: configured ? endpointHost : null,
  };
}

/** Returns the configured provider, or null when the feature is unconfigured. */
export function resolveVisionProvider(): VisionProvider | null {
  const apiKey = process.env.VISION_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAiCompatibleVisionProvider({
    apiKey,
    baseUrl: process.env.VISION_BASE_URL ?? DEFAULT_VISION_BASE_URL,
    model: process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL,
    reasoningEffort: process.env.VISION_REASONING_EFFORT ?? null,
  });
}
