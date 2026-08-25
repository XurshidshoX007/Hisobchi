/**
 * Web API (fetch Request/Response) → Fastify adapteri.
 *
 * API marshrutlari Next.js App Router'dan ko'chirilgan va ularning
 * xavfsizlik mantiqi (rate-limit, initData autentifikatsiyasi, xavfsizlik
 * sarlavhalari, byte-budget body o'qish) bayt-bayt saqlanishi kerak.
 * Shuning uchun marshrutlar standart Web `Request` → `Response` shaklida
 * yozilgan qoladi, bu adapter esa ularni Fastify req/reply ga aylantiradi:
 *
 *   Fastify request ──► new Request(url, { headers, body }) ──► handler
 *   handler Response ──► status + headers + body ──► Fastify reply
 *
 * Jismoniy cheklovlar:
 *  - Request body si Fastify tomonidan buffer sifatida o'qiladi (quyida
 *    `addContentTypeParser`), shuning uchun `readJsonBody`'ning oqimli
 *    byte-budget mantiqi o'z ishini bajaraveradi.
 *  - Response body si buferlanadi — barcha javoblar JSON (kichik).
 */

import type { FastifyReply, FastifyRequest } from "fastify";

export type WebHandler = (request: Request) => Promise<Response> | Response;

/** Fastify'da barcha content-type'larni xom buffer sifatida o'qish. */
export function registerRawBodyParser(app: {
  addContentTypeParser: (
    contentType: string,
    options: { bodyLimit?: number; parseAs: "buffer" },
    parser: (request: FastifyRequest, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => void,
  ) => void;
}): void {
  app.addContentTypeParser(
    "*",
    { bodyLimit: 12 * 1024 * 1024, parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );
}

function buildWebRequest(req: FastifyRequest): Request {
  const host = (req.headers.host as string | undefined) ?? "localhost";
  const url = new URL(req.url, `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    // undici buffer tanasi uchun content-length ni o'zi hisoblaydi;
    // eskirgan/dublikat qiymat Request konstruktorini buzmasligi kerak.
    if (key === "content-length" || key === "transfer-encoding") continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item as string);
    else headers.set(key, value as string);
  }

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) init.body = new Uint8Array(req.body);
    else init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  return new Request(url, init);
}

async function sendWebResponse(reply: FastifyReply, res: Response): Promise<void> {
  const body = Buffer.from(await res.arrayBuffer());
  reply.status(res.status);
  res.headers.forEach((value, key) => {
    // Fastabayt sarlavhalarni o'zi hisoblaydi — dublikat taqiqlanadi.
    if (key === "content-length" || key === "transfer-encoding" || key === "connection") return;
    reply.header(key, value);
  });
  reply.send(body);
}

export function toFastify(handler: WebHandler) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const res = await handler(buildWebRequest(req));
    await sendWebResponse(reply, res);
  };
}
