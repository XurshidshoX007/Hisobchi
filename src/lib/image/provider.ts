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

export type VisionFailure = {
  ok: false;
  provider: string;
  reason: "unconfigured" | "provider_error" | "timeout" | "unreadable" | "too_large";
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

/** OpenAI-compatible chat/completions vision provider (also fits vLLM, Groq…). */
export class OpenAiCompatibleVisionProvider implements VisionProvider {
  readonly name = "openai-compatible";

  constructor(
    private readonly config: {
      apiKey: string;
      baseUrl: string;
      model: string;
    },
  ) {}

  async readFinancialImage(request: VisionRequest): Promise<VisionResult> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const dataUri = `data:${request.mimeType};base64,${request.image.toString("base64")}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          max_tokens: request.maxOutputTokens ?? 1_500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Today is ${request.hints.today}. Known category names: ${request.hints.categoryNames.slice(0, 40).join(", ") || "none"}.`,
                },
                { type: "image_url", image_url: { url: dataUri, detail: "high" } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 45_000),
        cache: "no-store",
      });
      if (!response.ok) return { ok: false, provider: this.name, reason: "provider_error" };
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return { ok: false, provider: this.name, reason: "unreadable" };
      return parseProviderPayload(content, this.name);
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
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

/** Returns the configured provider, or null when the feature is unconfigured. */
export function resolveVisionProvider(): VisionProvider | null {
  const apiKey = process.env.VISION_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAiCompatibleVisionProvider({
    apiKey,
    baseUrl: process.env.VISION_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.VISION_MODEL ?? "gpt-4o-mini",
  });
}
