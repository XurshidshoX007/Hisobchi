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
 *
 * 429 is split into `rate_limited` (temporary throttle) vs `quota_exhausted`
 * (billing/project limit) so the user is never told "queue high" for a
 * depleted account.
 */
export type VisionFailureReason =
  | "unconfigured"
  | "auth_error"
  | "rate_limited"
  | "quota_exhausted"
  | "provider_error"
  | "timeout"
  | "unreadable"
  | "unsupported_image"
  | "too_large"
  | "model_error";

/** Non-secret diagnostics attached to a failure for server logs / audit. */
export type VisionFailureDiagnostics = {
  /** HTTP status when the failure came from the provider response. */
  status?: number;
  /** Short class: rate_limit | quota | auth | model | timeout | empty | invalid_json | network | … */
  errorClass?: string;
  /** Provider request id header when present (x-request-id / x-openai-request-id). */
  requestId?: string | null;
  /** Parsed Retry-After in seconds when the provider sent one. */
  retryAfterSec?: number | null;
  /** How many HTTP attempts were made (including the first). */
  attempts?: number;
};

export type VisionFailure = {
  ok: false;
  provider: string;
  reason: VisionFailureReason;
  diagnostics?: VisionFailureDiagnostics;
};

export type VisionResult = VisionSuccess | VisionFailure;

export interface VisionProvider {
  readonly name: string;
  readFinancialImage(request: VisionRequest): Promise<VisionResult>;
}

const SYSTEM_PROMPT = [
  "You are an OCR engine for personal-finance documents (Uzbek, Russian or English).",
  'Read the image and return STRICT JSON: {"documentHint": string, "lines": string[]}.',
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
 * `buildChatPayload`). Production often sets `VISION_MODEL=gpt-4o-mini`.
 */
export const DEFAULT_VISION_MODEL = "gpt-5.4-mini";
export const DEFAULT_VISION_BASE_URL = "https://api.openai.com/v1";

/** Default per-request timeout for the vision HTTP call. */
export const DEFAULT_VISION_TIMEOUT_MS = 45_000;

/** Transient provider errors: original attempt + up to this many retries. */
export const VISION_MAX_RETRIES = 2;

/** Backoff between transient retries (ms). Honours Retry-After when larger. */
export const VISION_RETRY_BACKOFF_MS = [1_000, 3_000] as const;

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
        // `auto` lets the provider pick a cost-appropriate detail level for
        // typical receipts / shopping lists while still allowing high detail
        // when the image needs it. Operators can force high via VISION_IMAGE_DETAIL.
        { type: "image_url", image_url: { url: dataUri, detail: visionImageDetail() } },
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

/** `low` | `high` | `auto` — default auto for receipt-scale images. */
export function visionImageDetail(): "low" | "high" | "auto" {
  const raw = (process.env.VISION_IMAGE_DETAIL ?? "auto").trim().toLowerCase();
  if (raw === "low" || raw === "high" || raw === "auto") return raw;
  return "auto";
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

/** Sleep helper used by the limited retry loop (injectable in tests via clock). */
export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into whole seconds. */
export function parseRetryAfterSeconds(header: string | null | undefined): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Math.ceil(Number(trimmed));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return null;
  return Math.max(0, Math.ceil((when - Date.now()) / 1000));
}

/** Pull a safe request id from common provider response headers. */
export function extractProviderRequestId(headers: Headers | { get(name: string): string | null }): string | null {
  const candidates = [
    headers.get("x-request-id"),
    headers.get("x-openai-request-id"),
    headers.get("cf-ray"),
    headers.get("openai-organization"),
  ];
  for (const value of candidates) {
    if (value && /^[a-zA-Z0-9_.:-]{6,128}$/.test(value.trim())) return value.trim().slice(0, 128);
  }
  return null;
}

/**
 * Safe, bounded slice of a provider error body used ONLY for classification.
 * Never logged in full; never shown to the user.
 */
export function readErrorBodySlice(text: string, max = 2_000): string {
  return text.slice(0, max);
}

export type ClassifiedProviderError = {
  reason: VisionFailureReason;
  errorClass: string;
  /** True when a limited retry is appropriate. */
  retryable: boolean;
};

/**
 * Classify a provider HTTP failure from status + a bounded body slice + headers.
 *
 * 429 is NOT always "queue high":
 *   • insufficient_quota / billing → quota_exhausted
 *   • rate_limit_exceeded / rpm/tpm → rate_limited (retryable)
 *   • generic overload → rate_limited (retryable)
 */
export function classifyProviderError(
  status: number,
  errorBody: string = "",
  headers?: Headers | { get(name: string): string | null } | null,
): ClassifiedProviderError {
  const body = errorBody.toLowerCase();
  const code = extractErrorCode(errorBody).toLowerCase();
  const type = extractErrorType(errorBody).toLowerCase();
  const combined = `${code} ${type} ${body}`;

  if (status === 401 || status === 403) {
    return { reason: "auth_error", errorClass: status === 401 ? "invalid_api_key" : "forbidden", retryable: false };
  }

  if (status === 408 || status === 504) {
    return { reason: "timeout", errorClass: "gateway_timeout", retryable: status === 504 };
  }

  if (status === 413) {
    return { reason: "too_large", errorClass: "payload_too_large", retryable: false };
  }

  if (status === 415 || status === 422) {
    return { reason: "unsupported_image", errorClass: "unsupported_media", retryable: false };
  }

  if (status === 404 || isModelError(combined, status)) {
    return { reason: "model_error", errorClass: "model_unavailable", retryable: false };
  }

  if (status === 429 || isQuotaSignal(combined) || isRateLimitSignal(combined)) {
    if (isQuotaSignal(combined)) {
      return { reason: "quota_exhausted", errorClass: "quota_exhausted", retryable: false };
    }
    // OpenAI sometimes puts the limit type in a header.
    const limitHeader = headers?.get?.("x-ratelimit-limit-requests") ?? headers?.get?.("x-ratelimit-remaining-requests");
    void limitHeader;
    return { reason: "rate_limited", errorClass: "rate_limit", retryable: true };
  }

  if (status === 400) {
    // Parameter dialect issues are handled before this helper is treated as final.
    if (isModelError(combined, status)) {
      return { reason: "model_error", errorClass: "model_unavailable", retryable: false };
    }
    if (isImagePayloadError(combined)) {
      return { reason: "unsupported_image", errorClass: "bad_image_payload", retryable: false };
    }
    return { reason: "unsupported_image", errorClass: "bad_request", retryable: false };
  }

  if (status === 502 || status === 503) {
    return { reason: "provider_error", errorClass: status === 502 ? "bad_gateway" : "service_unavailable", retryable: true };
  }

  if (status >= 500) {
    return { reason: "provider_error", errorClass: "server_error", retryable: status === 500 ? false : true };
  }

  return { reason: "provider_error", errorClass: "provider_error", retryable: false };
}

/** Back-compat helper used by unit tests and call sites that only have a status. */
export function failureReasonForStatus(status: number): VisionFailureReason {
  return classifyProviderError(status).reason;
}

function extractErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; type?: unknown } };
    if (typeof parsed?.error?.code === "string") return parsed.error.code;
  } catch {
    /* body may be plain text */
  }
  const match = body.match(/"code"\s*:\s*"([^"]+)"/i);
  return match?.[1] ?? "";
}

function extractErrorType(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { type?: unknown } };
    if (typeof parsed?.error?.type === "string") return parsed.error.type;
  } catch {
    /* ignore */
  }
  const match = body.match(/"type"\s*:\s*"([^"]+)"/i);
  return match?.[1] ?? "";
}

function isQuotaSignal(text: string): boolean {
  return (
    text.includes("insufficient_quota") ||
    text.includes("quota_exceeded") ||
    text.includes("billing_not_active") ||
    text.includes("billing_hard_limit") ||
    text.includes("exceeded your current quota") ||
    text.includes("you exceeded your current quota") ||
    text.includes("payment required") ||
    text.includes("credit balance") ||
    text.includes("out of credits") ||
    (text.includes("billing") && text.includes("limit"))
  );
}

function isRateLimitSignal(text: string): boolean {
  return (
    text.includes("rate_limit") ||
    text.includes("rate limit") ||
    text.includes("too many requests") ||
    text.includes("tpm") ||
    text.includes("rpm") ||
    text.includes("tokens per min") ||
    text.includes("requests per min")
  );
}

function isModelError(text: string, status: number): boolean {
  if (status === 404 && (text.includes("model") || text.includes("does not exist") || text.includes("not found"))) {
    return true;
  }
  return (
    text.includes("model_not_found") ||
    text.includes("invalid_model") ||
    text.includes("does not exist") && text.includes("model") ||
    text.includes("model is not available") ||
    text.includes("not a valid model") ||
    text.includes("does not have access to model") ||
    text.includes("unsupported model") ||
    text.includes("model_not_available")
  );
}

function isImagePayloadError(text: string): boolean {
  return (
    text.includes("image") ||
    text.includes("invalid_image") ||
    text.includes("could not process image") ||
    text.includes("unsupported image") ||
    text.includes("mime") ||
    text.includes("base64")
  );
}

/**
 * Safe structured diagnostic log for vision failures.
 * NEVER logs API keys, Authorization headers, image bytes, or full bodies.
 */
export function logVisionFailure(params: {
  reason: VisionFailureReason;
  provider: string;
  model: string;
  diagnostics?: VisionFailureDiagnostics;
  event?: string;
}): void {
  const event =
    params.event ??
    (params.reason === "quota_exhausted"
      ? "vision_quota_exhausted"
      : params.reason === "auth_error"
        ? "image_vision_auth_failed"
        : params.reason === "rate_limited"
          ? "image_vision_rate_limited"
          : "image_vision_failed");

  const payload = {
    ts: new Date().toISOString(),
    event,
    provider: params.provider,
    model: params.model,
    reason: params.reason,
    status: params.diagnostics?.status ?? null,
    errorClass: params.diagnostics?.errorClass ?? null,
    requestId: params.diagnostics?.requestId ?? null,
    retryAfterSec: params.diagnostics?.retryAfterSec ?? null,
    attempts: params.diagnostics?.attempts ?? null,
  };

  // warn for operator-actionable issues; info for transient noise.
  if (params.reason === "auth_error" || params.reason === "quota_exhausted" || params.reason === "model_error") {
    console.warn(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }
}

/** OpenAI-compatible chat/completions vision provider (also fits vLLM, Groq…). */
export class OpenAiCompatibleVisionProvider implements VisionProvider {
  readonly name = "openai-compatible";

  constructor(private readonly config: VisionProviderConfig) {}

  async readFinancialImage(request: VisionRequest): Promise<VisionResult> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const dataUri = `data:${request.mimeType};base64,${request.image.toString("base64")}`;
    const timeoutMs = request.timeoutMs ?? DEFAULT_VISION_TIMEOUT_MS;
    let payload = buildChatPayload(this.config, request, dataUri);

    // Total attempts = 1 + VISION_MAX_RETRIES. Dialect-400 self-heal shares the
    // same budget so we never spin forever on a broken gateway.
    const maxAttempts = 1 + VISION_MAX_RETRIES;
    let dialectAdjusted = false;
    let lastFailure: VisionFailure | null = null;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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

        const requestId = extractProviderRequestId(response.headers);
        const retryAfterSec = parseRetryAfterSeconds(response.headers.get("retry-after"));

        if (!response.ok) {
          // Bounded body for classification only — never logged in full.
          const bodyText = readErrorBodySlice(await response.text().catch(() => ""));
          const classified = classifyProviderError(response.status, bodyText, response.headers);

          // Parameter-dialect 400: rewrite once, then continue without counting
          // as a "transient" retry delay.
          if (
            response.status === 400 &&
            !dialectAdjusted &&
            attempt < maxAttempts - 1
          ) {
            const adjusted = adjustPayloadForError(payload, bodyText);
            if (adjusted) {
              payload = adjusted;
              dialectAdjusted = true;
              continue;
            }
          }

          const failure: VisionFailure = {
            ok: false,
            provider: this.name,
            reason: classified.reason,
            diagnostics: {
              status: response.status,
              errorClass: classified.errorClass,
              requestId,
              retryAfterSec,
              attempts: attempt + 1,
            },
          };
          lastFailure = failure;

          const canRetry =
            classified.retryable && attempt < maxAttempts - 1 && response.status !== 401 && response.status !== 403;

          if (canRetry) {
            const backoff = VISION_RETRY_BACKOFF_MS[Math.min(attempt, VISION_RETRY_BACKOFF_MS.length - 1)] ?? 3_000;
            const waitMs = Math.max(backoff, (retryAfterSec ?? 0) * 1_000);
            // Cap wait so a huge Retry-After cannot stall the Telegram webhook.
            await sleepMs(Math.min(waitMs, 10_000));
            continue;
          }

          logVisionFailure({
            reason: failure.reason,
            provider: this.name,
            model: this.config.model,
            diagnostics: failure.diagnostics,
          });
          return failure;
        }

        const json = (await response.json().catch(() => null)) as
          | { choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }> }
          | null;
        const content = json?.choices?.[0]?.message?.content;
        if (!content || (typeof content === "string" && !content.trim())) {
          const failure: VisionFailure = {
            ok: false,
            provider: this.name,
            reason: "unreadable",
            diagnostics: {
              status: response.status,
              errorClass: "empty_content",
              requestId,
              attempts: attempt + 1,
            },
          };
          logVisionFailure({
            reason: failure.reason,
            provider: this.name,
            model: this.config.model,
            diagnostics: failure.diagnostics,
          });
          return failure;
        }
        const parsed = parseProviderPayload(typeof content === "string" ? content : String(content), this.name);
        if (!parsed.ok) {
          logVisionFailure({
            reason: parsed.reason,
            provider: this.name,
            model: this.config.model,
            diagnostics: {
              status: response.status,
              errorClass: "invalid_json",
              requestId,
              attempts: attempt + 1,
            },
          });
          return {
            ...parsed,
            diagnostics: {
              status: response.status,
              errorClass: "invalid_json",
              requestId,
              attempts: attempt + 1,
            },
          };
        }
        return parsed;
      }

      if (lastFailure) {
        logVisionFailure({
          reason: lastFailure.reason,
          provider: this.name,
          model: this.config.model,
          diagnostics: lastFailure.diagnostics,
        });
        return lastFailure;
      }
      return { ok: false, provider: this.name, reason: "provider_error", diagnostics: { errorClass: "exhausted_retries" } };
    } catch (error) {
      const timeout =
        (error instanceof DOMException && error.name === "TimeoutError") ||
        (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"));
      const failure: VisionFailure = {
        ok: false,
        provider: this.name,
        reason: timeout ? "timeout" : "provider_error",
        diagnostics: {
          errorClass: timeout ? "timeout" : "network_error",
          attempts: 1,
        },
      };
      logVisionFailure({
        reason: failure.reason,
        provider: this.name,
        model: this.config.model,
        diagnostics: failure.diagnostics,
      });
      return failure;
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
  constructor(
    private readonly reason: VisionFailureReason,
    private readonly diagnostics?: VisionFailureDiagnostics,
  ) {}
  async readFinancialImage(request: VisionRequest): Promise<VisionResult> {
    void request;
    return { ok: false, provider: this.name, reason: this.reason, diagnostics: this.diagnostics };
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
