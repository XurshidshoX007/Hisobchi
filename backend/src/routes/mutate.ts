import { createHash } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { runMutation, type MutateInput } from "@/lib/mutations";
import { buildAppState } from "@/lib/state";
import { resolveUser, updateUserSettings, verifyInitData } from "@/lib/user";
import { requireVerifiedIdentity } from "@/lib/env";
import { safeAuditMetadata, writeAudit, writeSecurityEvent } from "@/lib/audit";
import { PayloadTooLargeError, readJsonBody } from "@/lib/request-body";
import {
  checkRateLimit,
  isAllowedMutationOrigin,
  originRejected,
  rateLimitResponse,
  securityContext,
  securityLog,
  withSecurityHeaders,
} from "@/lib/security";

type Body = MutateInput & { settings?: Record<string, unknown> };
const IDEMPOTENT_ENTITIES = new Set([
  "transaction",
  "account",
  "category",
  "budget",
  "debt",
  "goal",
  "recurring",
  "expectedIncome",
]);

export async function POST(request: Request) {
  const sec = securityContext(request);
  let claimedIdempotency: { userId: number; key: string; scope: string } | null = null;
  try {
    const ipLimit = await checkRateLimit({ scope: "mutation-ip", identity: sec.ipKey, limit: 60, windowMs: 60_000 });
    if (!ipLimit.allowed) {
      const sample = await checkRateLimit({
        scope: "preauth-security-event-sample",
        identity: "rate_limit_mutation",
        limit: 30,
        windowMs: 60_000,
      });
      if (sample.allowed) {
        void writeSecurityEvent({ event: "rate_limit_mutation", requestId: sec.requestId, ipHash: sec.ipKey });
      }
      return rateLimitResponse(ipLimit.retryAfter, sec.requestId);
    }

    if (!isAllowedMutationOrigin(request)) {
      const sample = await checkRateLimit({
        scope: "preauth-security-event-sample",
        identity: "origin_rejected",
        limit: 30,
        windowMs: 60_000,
      });
      if (sample.allowed) {
        void writeSecurityEvent({ event: "origin_rejected", requestId: sec.requestId, ipHash: sec.ipKey, severity: "warning" });
      }
      return originRejected(sec.requestId);
    }

    let body: Body;
    try {
      body = await readJsonBody<Body>(request, 64 * 1024);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return withSecurityHeaders(
          Response.json({ ok: false, message: "Request juda katta", code: "payload_too_large" }, { status: 413 }),
          sec.requestId,
        );
      }
      if (error instanceof SyntaxError || error instanceof TypeError) {
        return withSecurityHeaders(
          Response.json({ ok: false, message: "Request formati noto'g'ri", code: "invalid_json" }, { status: 400 }),
          sec.requestId,
        );
      }
      throw error;
    }
    if (!body || typeof body.entity !== "string" || typeof body.action !== "string") {
      return withSecurityHeaders(
        Response.json({ ok: false, message: "Request formati noto'g'ri", code: "invalid_input" }, { status: 400 }),
        sec.requestId,
      );
    }

    // Never accept Telegram initData in the URL: reverse proxies and browser
    // history can retain query strings containing this bearer credential.
    const initData = request.headers.get("x-telegram-init-data");
    const identity = await verifyInitData(initData);
    const user = await resolveUser(identity ?? undefined);
    if (!user) {
      void writeSecurityEvent({ event: "auth_rejected_mutation", requestId: sec.requestId, ipHash: sec.ipKey });
      return withSecurityHeaders(
        Response.json({ ok: false, message: "Autentifikatsiya talab qilinadi", code: "unauthorized" }, { status: 401 }),
        sec.requestId,
      );
    }

    const userLimit = await checkRateLimit({ scope: "mutation-user", identity: String(user.id), limit: 45, windowMs: 60_000 });
    if (!userLimit.allowed) {
      void writeSecurityEvent({ userId: user.id, event: "rate_limit_mutation_user", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(userLimit.retryAfter, sec.requestId);
    }

    // Financial mutation idempotency. The client generates one key per user
    // action and reuses it on a network retry. Bind that key to the exact body
    // so a buggy/malicious client cannot reuse a completed key for another
    // amount/resource and receive a false success response.
    const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    if (IDEMPOTENT_ENTITIES.has(body.entity)) {
      const key = request.headers.get("idempotency-key");
      if (!key || !/^[a-zA-Z0-9_.:-]{8,128}$/.test(key)) {
        if (requireVerifiedIdentity()) {
          return withSecurityHeaders(
            Response.json({ ok: false, message: "Idempotency-Key talab qilinadi", code: "missing_idempotency_key" }, { status: 400 }),
            sec.requestId,
          );
        }
      } else {
        const scope = `${body.entity}:${body.action}`;
        const now = new Date();
        // The unique index otherwise makes `expiresAt` cosmetic: an expired row
        // would continue rejecting the key forever. Reclaim only this exact
        // user's expired key before attempting the atomic insert.
        await db
          .delete(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.userId, user.id),
              eq(idempotencyKeys.key, key),
              eq(idempotencyKeys.scope, scope),
              lte(idempotencyKeys.expiresAt, now),
            ),
          );
        const claimed = await db
          .insert(idempotencyKeys)
          .values({
            userId: user.id,
            key,
            scope,
            requestHash,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          })
          .onConflictDoNothing()
          .returning({ id: idempotencyKeys.id });
        if (!claimed[0]) {
          const existing = await db
            .select({
              status: idempotencyKeys.status,
              resultId: idempotencyKeys.resultId,
              requestHash: idempotencyKeys.requestHash,
            })
            .from(idempotencyKeys)
            .where(
              and(
                eq(idempotencyKeys.userId, user.id),
                eq(idempotencyKeys.key, key),
                eq(idempotencyKeys.scope, scope),
              ),
            )
            .limit(1);
          if (existing[0]?.requestHash && existing[0].requestHash !== requestHash) {
            void writeSecurityEvent({
              userId: user.id,
              event: "idempotency_key_payload_mismatch",
              severity: "warning",
              requestId: sec.requestId,
              ipHash: sec.ipKey,
              metadata: { scope },
            });
            return withSecurityHeaders(
              Response.json(
                {
                  ok: false,
                  message: "Idempotency-Key boshqa so'rov uchun ishlatilgan",
                  code: "idempotency_key_reused",
                },
                { status: 422 },
              ),
              sec.requestId,
            );
          }
          void writeSecurityEvent({
            userId: user.id,
            event: "duplicate_mutation_blocked",
            severity: "info",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { scope, status: existing[0]?.status ?? "unknown" },
          });
          if (existing[0]?.status === "completed") {
            // A retry after the original response was lost must learn that the
            // operation succeeded; returning 409 causes users to press again
            // with a fresh key and duplicate a financial write.
            return withSecurityHeaders(
              Response.json({
                ok: true,
                id: existing[0].resultId ?? undefined,
                idempotent: true,
                message: "So'rov avval muvaffaqiyatli bajarilgan",
                requestId: sec.requestId,
              }),
              sec.requestId,
            );
          }
          return withSecurityHeaders(
            Response.json(
              { ok: false, message: "So'rov hali qayta ishlanmoqda", code: "request_in_progress" },
              { status: 409, headers: { "Retry-After": "2" } },
            ),
            sec.requestId,
          );
        }
        claimedIdempotency = { userId: user.id, key, scope };
      }
    }

    if (body.entity === "settings") {
      const settingsResult = await updateUserSettings(user, body.settings ?? {});
      await writeAudit({
        userId: user.id,
        actorRole: user.role,
        action: "update",
        entity: "settings",
        outcome: settingsResult.ok ? "success" : "denied",
        requestId: sec.requestId,
        ipHash: sec.ipKey,
      });
      if (!settingsResult.ok) {
        return withSecurityHeaders(
          Response.json(
            { ok: false, message: settingsResult.message, code: "currency_change_requires_conversion" },
            { status: 409 },
          ),
          sec.requestId,
        );
      }
      const refreshed = (await resolveUser(identity ?? undefined)) ?? user;
      return withSecurityHeaders(
        Response.json({ ok: true, message: settingsResult.message, state: await buildAppState(refreshed) }),
        sec.requestId,
      );
    }

    const result = await runMutation(user, body);
    if (claimedIdempotency) {
      if (result.ok) {
        await db
          .update(idempotencyKeys)
          .set({ status: "completed", resultId: result.id ?? null })
          .where(
            and(
              eq(idempotencyKeys.userId, claimedIdempotency.userId),
              eq(idempotencyKeys.key, claimedIdempotency.key),
              eq(idempotencyKeys.scope, claimedIdempotency.scope),
            ),
          );
      } else {
        // Validation/business rejection is safe to retry with corrected data.
        await db
          .delete(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.userId, claimedIdempotency.userId),
              eq(idempotencyKeys.key, claimedIdempotency.key),
              eq(idempotencyKeys.scope, claimedIdempotency.scope),
            ),
          );
      }
    }

    await writeAudit({
      userId: user.id,
      actorRole: user.role,
      action: body.action,
      entity: body.entity,
      entityId: result.id ?? (typeof body.data?.id === "number" ? body.data.id : null),
      outcome: result.ok ? "success" : "denied",
      requestId: sec.requestId,
      ipHash: sec.ipKey,
      metadata: safeAuditMetadata(body.data),
    });

    const refreshed = (await resolveUser(identity ?? undefined)) ?? user;
    const state = await buildAppState(refreshed);
    return withSecurityHeaders(
      Response.json({ ...result, state, requestId: sec.requestId }, { status: result.ok ? 200 : 400 }),
      sec.requestId,
    );
  } catch {
    // Never delete an idempotency claim after an exception. The business
    // transaction may have COMMITted while its acknowledgement (or the later
    // state rebuild) failed. Releasing the key in that ambiguous window lets a
    // retry execute the same financial operation twice. A processing claim is
    // intentionally fail-safe and expires after the documented 24-hour window.
    securityLog("error", "mutation_error", {
      requestId: sec.requestId,
      ipKey: sec.ipKey,
      code: claimedIdempotency ? "internal_after_claim" : "internal",
    });
    return withSecurityHeaders(
      Response.json({ ok: false, message: "Server xatosi", code: "internal", requestId: sec.requestId }, { status: 500 }),
      sec.requestId,
    );
  }
}
