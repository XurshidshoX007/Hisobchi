import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { AddressInfo } from "node:net";

import { OpenAiCompatibleVisionProvider, type VisionRequest } from "../src/lib/image/provider";

/**
 * Integration tests for the vision provider's HTTP behaviour.
 *
 * A real local HTTP server stands in for the OpenAI-compatible endpoint, so
 * the request the bot actually puts on the wire — and every error status it
 * can receive — is verified without spending a cent or leaking a key.
 */

type Handler = (request: IncomingMessage, response: ServerResponse, body: string) => void;

async function withServer(handler: Handler, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => handler(request, response, Buffer.concat(chunks).toString("utf8")));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}/v1`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function request(): VisionRequest {
  return {
    image: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    mimeType: "image/jpeg",
    hints: { today: "2026-08-16", categoryNames: ["Oziq-ovqat"] },
    timeoutMs: 2_000,
  };
}

function provider(baseUrl: string, model = "gpt-5.4-mini") {
  return new OpenAiCompatibleVisionProvider({ apiKey: "sk-test-key", baseUrl, model });
}

function ocrAnswer(lines: string[]): string {
  return JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ documentHint: "SHOPPING_LIST", lines }) } }],
  });
}

test("a successful call posts the image to /chat/completions and returns OCR rows", async () => {
  let seenPath: string | null = null;
  let seenAuth: string | null = null;
  let seenBody: Record<string, unknown> = {};

  await withServer(
    (req, res, body) => {
      seenPath = req.url ?? null;
      seenAuth = req.headers.authorization ?? null;
      seenBody = JSON.parse(body) as Record<string, unknown>;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(ocrAnswer(["Non — 10 000", "Go'sht — 120 000"]));
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.lines, ["Non — 10 000", "Go'sht — 120 000"]);
      assert.equal(result.documentHint, "SHOPPING_LIST");
    },
  );

  assert.equal(seenPath, "/v1/chat/completions");
  assert.equal(seenAuth, "Bearer sk-test-key");
  assert.equal(seenBody.model, "gpt-5.4-mini");
  const messages = seenBody.messages as Array<{ content: unknown }>;
  const parts = messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
  const image = parts.find((part) => part.type === "image_url");
  assert.ok(image?.image_url?.url.startsWith("data:image/jpeg;base64,"), "the image travels inline as base64");
});

test("a trailing slash in VISION_BASE_URL does not produce a double slash", async () => {
  let seenPath: string | null = null;
  await withServer(
    (req, res) => {
      seenPath = req.url ?? null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(ocrAnswer(["Non 10 000"]));
    },
    async (baseUrl) => {
      await provider(`${baseUrl}///`).readFinancialImage(request());
    },
  );
  assert.equal(seenPath, "/v1/chat/completions");
});

test("provider error statuses map to friendly reasons without leaking the body", async () => {
  const cases: Array<[number, string, string?]> = [
    [401, "auth_error"],
    [403, "auth_error"],
    [429, "rate_limited"],
    [500, "provider_error"],
    [502, "provider_error"],
    [503, "provider_error"],
    [404, "model_error", JSON.stringify({ error: { message: "The model does not exist", code: "model_not_found" } })],
  ];
  for (const [status, expected, body] of cases) {
    await withServer(
      (_req, res) => {
        res.writeHead(status, { "content-type": "application/json", "x-request-id": `req-${status}` });
        res.end(body ?? JSON.stringify({ error: { message: "sk-leaky-secret should never surface", code: status } }));
      },
      async (baseUrl) => {
        const result = await provider(baseUrl).readFinancialImage(request());
        assert.equal(result.ok, false, `status ${status}`);
        if (result.ok) return;
        assert.equal(result.reason, expected, `status ${status}`);
        assert.equal(result.diagnostics?.status, status);
        assert.ok(!JSON.stringify(result).includes("sk-leaky-secret"), "provider body must not propagate");
      },
    );
  }
});

test("429 with insufficient_quota is quota_exhausted, not rate_limited", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(429, {
        "content-type": "application/json",
        "x-request-id": "quota-req-1",
        "retry-after": "60",
      });
      res.end(
        JSON.stringify({
          error: {
            message: "You exceeded your current quota, please check your plan and billing details.",
            type: "insufficient_quota",
            code: "insufficient_quota",
          },
        }),
      );
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reason, "quota_exhausted");
      assert.equal(result.diagnostics?.errorClass, "quota_exhausted");
      assert.equal(result.diagnostics?.status, 429);
      assert.equal(result.diagnostics?.requestId, "quota-req-1");
      // Quota is NOT retryable — one attempt only.
      assert.equal(result.diagnostics?.attempts, 1);
    },
  );
});

test("transient 429 rate_limit is retried with backoff then succeeds", async () => {
  let calls = 0;
  await withServer(
    (_req, res) => {
      calls += 1;
      if (calls < 3) {
        res.writeHead(429, {
          "content-type": "application/json",
          "retry-after": "0",
          "x-request-id": `rate-${calls}`,
        });
        res.end(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "Rate limit reached for rpm" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(ocrAnswer(["Non 10 000"]));
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, true);
      if (result.ok) assert.deepEqual(result.lines, ["Non 10 000"]);
    },
  );
  assert.equal(calls, 3, "original + 2 retries");
});

test("401 is never retried", async () => {
  let calls = 0;
  await withServer(
    (_req, res) => {
      calls += 1;
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Incorrect API key provided", code: "invalid_api_key" } }));
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "auth_error");
        assert.equal(result.diagnostics?.attempts, 1);
      }
    },
  );
  assert.equal(calls, 1);
});

test("empty content is unreadable with diagnostics, never rate_limited", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "x-request-id": "empty-1" });
      res.end(JSON.stringify({ choices: [{ message: { content: "" } }] }));
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "unreadable");
        assert.equal(result.diagnostics?.errorClass, "empty_content");
      }
    },
  );
});

test("a 400 about max_tokens is retried once with the corrected dialect", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  await withServer(
    (_req, res, body) => {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      bodies.push(parsed);
      if ("max_tokens" in parsed) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens'." } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(ocrAnswer(["Sut 15 000"]));
    },
    async (baseUrl) => {
      // A legacy-dialect model name forces the first attempt to use max_tokens.
      const result = await provider(baseUrl, "gpt-4o-mini").readFinancialImage(request());
      assert.equal(result.ok, true);
      if (result.ok) assert.deepEqual(result.lines, ["Sut 15 000"]);
    },
  );

  assert.equal(bodies.length, 2, "exactly one corrective retry");
  assert.ok("max_tokens" in bodies[0]);
  assert.ok("max_completion_tokens" in bodies[1]);
  assert.ok(!("temperature" in bodies[1]));
});

test("an unrecoverable 400 is not retried forever", async () => {
  let calls = 0;
  await withServer(
    (_req, res) => {
      calls += 1;
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "image payload rejected" } }));
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "unsupported_image");
    },
  );
  assert.equal(calls, 1);
});

test("a slow provider times out instead of hanging the Telegram webhook", async () => {
  await withServer(
    (_req, res) => {
      // Never responds within the request timeout.
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(ocrAnswer(["late"]));
      }, 3_000).unref();
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage({ ...request(), timeoutMs: 250 });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "timeout");
    },
  );
});

test("a 200 with malformed JSON is 'unreadable', never a thrown error", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("<html>gateway page</html>");
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "unreadable");
    },
  );
});

test("a 200 whose content is prose instead of JSON is 'unreadable'", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "I cannot read this picture." } }] }));
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "unreadable");
    },
  );
});

test("a fenced JSON answer is still parsed (real models wrap output)", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"lines":["Kredit 1 880 000 17-sana 12 oy"]}\n```' } }],
        }),
      );
    },
    async (baseUrl) => {
      const result = await provider(baseUrl).readFinancialImage(request());
      assert.equal(result.ok, true);
      if (result.ok) assert.deepEqual(result.lines, ["Kredit 1 880 000 17-sana 12 oy"]);
    },
  );
});

test("an unreachable endpoint degrades to provider_error, not an exception", async () => {
  const unreachable = new OpenAiCompatibleVisionProvider({
    apiKey: "sk-test-key",
    // Port 1 is reserved and refuses connections immediately.
    baseUrl: "http://127.0.0.1:1/v1",
    model: "gpt-5.4-mini",
  });
  const result = await unreachable.readFinancialImage(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "provider_error");
});
