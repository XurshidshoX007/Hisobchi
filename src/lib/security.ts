import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { demoModeEnabled } from "./env";
import { getRedis } from "./redis";

type RateBucket = { count: number; resetAt: number };

const globalSecurity = globalThis as typeof globalThis & {
  __pfosRateBuckets?: Map<string, RateBucket>;
};

const buckets = globalSecurity.__pfosRateBuckets ?? new Map<string, RateBucket>();
if (process.env.NODE_ENV !== "production") globalSecurity.__pfosRateBuckets = buckets;

export type SecurityContext = {
  requestId: string;
  ipKey: string;
};

/** Never persists/logs a raw address — returns an irreversible keyed digest. */
export function hashedClientIp(request: Request): string {
  const raw =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const secret = process.env.LOG_HASH_SECRET;
  if (secret) return createHmac("sha256", secret).update(raw).digest("hex").slice(0, 24);
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function securityContext(request: Request): SecurityContext {
  const supplied = request.headers.get("x-request-id");
  const requestId = supplied && /^[a-zA-Z0-9_.:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
  return { requestId, ipKey: hashedClientIp(request) };
}

/**
 * Fixed-window limiter. Works immediately on a single process. Production
 * multi-instance deployments should use the same contract backed by private
 * Redis; until then this still limits per-instance abuse and is fail-safe.
 */
export async function checkRateLimit(params: {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
}): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter: number }> {
  const now = Date.now();
  const redis = await getRedis();
  if (redis) {
    try {
      const redisKey = `pfos:rate:${params.scope}:${params.identity}`;
      const result = (await redis.eval(
        `local current = redis.call('INCR', KEYS[1])
         if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         local ttl = redis.call('PTTL', KEYS[1])
         return {current, ttl}`,
        { keys: [redisKey], arguments: [String(params.windowMs)] },
      )) as [number, number];
      const count = Number(result[0]);
      const ttl = Math.max(1, Number(result[1]));
      return {
        allowed: count <= params.limit,
        remaining: Math.max(0, params.limit - count),
        resetAt: now + ttl,
        retryAfter: Math.max(1, Math.ceil(ttl / 1000)),
      };
    } catch {
      // Degrade to the per-process limiter. Production startup already checks
      // Redis presence, while this fallback keeps transient outages contained.
    }
  }

  const key = `${params.scope}:${params.identity}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + params.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, params.limit - bucket.count);
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  if (buckets.size > 10_000) {
    for (const [entryKey, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(entryKey);
      if (buckets.size <= 8_000) break;
    }
  }
  return { allowed: bucket.count <= params.limit, remaining, resetAt: bucket.resetAt, retryAfter };
}

export function rateLimitResponse(retryAfter: number, requestId: string) {
  return NextResponse.json(
    { ok: false, error: "So'rovlar soni cheklangan. Keyinroq urinib ko'ring.", code: "rate_limited", requestId },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-Request-Id": requestId,
        "Cache-Control": "no-store",
      },
    },
  );
}

export function withSecurityHeaders<T extends NextResponse>(response: T, requestId: string): T {
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Mutation endpoints accept only same-origin browser requests. */
export function isAllowedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Native Telegram webhook/server calls have no Origin. Browser mutations
    // should have one; allow missing only in explicit preview/demo mode.
    return demoModeEnabled();
  }
  try {
    const requestOrigin = new URL(request.url).origin;
    if (origin === requestOrigin) return true;
    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (configured && origin === new URL(configured).origin) return true;
    return false;
  } catch {
    return false;
  }
}

export function originRejected(requestId: string) {
  return NextResponse.json(
    { ok: false, error: "Request origin rad etildi", code: "origin_rejected", requestId },
    { status: 403, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } },
  );
}

/** Safe structured logger: metadata only; never request bodies/tokens/initData. */
export function securityLog(
  level: "info" | "warn" | "error",
  event: string,
  context: { requestId: string; userId?: number | null; ipKey?: string; code?: string },
) {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    requestId: context.requestId,
    userId: context.userId ?? null,
    ipKey: context.ipKey ?? null,
    code: context.code ?? null,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}
