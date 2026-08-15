import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { runMutation, type MutateInput } from "@/lib/mutations";
import { buildAppState } from "@/lib/state";
import { resolveUser, updateUserSettings, verifyInitData } from "@/lib/user";
import { requireVerifiedIdentity } from "@/lib/env";
import { safeAuditMetadata, writeAudit, writeSecurityEvent } from "@/lib/audit";
import {
  checkRateLimit,
  isAllowedMutationOrigin,
  originRejected,
  rateLimitResponse,
  securityContext,
  securityLog,
  withSecurityHeaders,
} from "@/lib/security";

export const dynamic = "force-dynamic";

type Body = MutateInput & { settings?: Record<string, unknown> };
const IDEMPOTENT_ENTITIES = new Set(["transaction", "debt", "goal", "recurring", "expectedIncome"]);

export async function POST(request: Request) {
  const sec = securityContext(request);
  let claimedIdempotency: { userId: number; key: string; scope: string } | null = null;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 64 * 1024) {
      return withSecurityHeaders(
        NextResponse.json({ ok: false, message: "Request juda katta", code: "payload_too_large" }, { status: 413 }),
        sec.requestId,
      );
    }

    if (!isAllowedMutationOrigin(request)) {
      void writeSecurityEvent({ event: "origin_rejected", requestId: sec.requestId, ipHash: sec.ipKey, severity: "warning" });
      return originRejected(sec.requestId);
    }

    const ipLimit = await checkRateLimit({ scope: "mutation-ip", identity: sec.ipKey, limit: 60, windowMs: 60_000 });
    if (!ipLimit.allowed) {
      void writeSecurityEvent({ event: "rate_limit_mutation", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(ipLimit.retryAfter, sec.requestId);
    }

    const body = (await request.json()) as Body;
    if (!body || typeof body.entity !== "string" || typeof body.action !== "string") {
      return withSecurityHeaders(
        NextResponse.json({ ok: false, message: "Request formati noto'g'ri", code: "invalid_input" }, { status: 400 }),
        sec.requestId,
      );
    }

    const url = new URL(request.url);
    const initData = request.headers.get("x-telegram-init-data") ?? url.searchParams.get("init_data") ?? null;
    const identity = await verifyInitData(initData);
    const user = await resolveUser(identity ?? undefined);
    if (!user) {
      void writeSecurityEvent({ event: "auth_rejected_mutation", requestId: sec.requestId, ipHash: sec.ipKey });
      return withSecurityHeaders(
        NextResponse.json({ ok: false, message: "Autentifikatsiya talab qilinadi", code: "unauthorized" }, { status: 401 }),
        sec.requestId,
      );
    }

    const userLimit = await checkRateLimit({ scope: "mutation-user", identity: String(user.id), limit: 45, windowMs: 60_000 });
    if (!userLimit.allowed) {
      void writeSecurityEvent({ userId: user.id, event: "rate_limit_mutation_user", requestId: sec.requestId, ipHash: sec.ipKey });
      return rateLimitResponse(userLimit.retryAfter, sec.requestId);
    }

    // Financial mutation idempotency. The client generates one key per user
    // action and reuses it on a network retry.
    if (IDEMPOTENT_ENTITIES.has(body.entity)) {
      const key = request.headers.get("idempotency-key");
      if (!key || !/^[a-zA-Z0-9_.:-]{8,128}$/.test(key)) {
        if (requireVerifiedIdentity()) {
          return withSecurityHeaders(
            NextResponse.json({ ok: false, message: "Idempotency-Key talab qilinadi", code: "missing_idempotency_key" }, { status: 400 }),
            sec.requestId,
          );
        }
      } else {
        const scope = `${body.entity}:${body.action}`;
        const claimed = await db
          .insert(idempotencyKeys)
          .values({ userId: user.id, key, scope, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
          .onConflictDoNothing()
          .returning({ id: idempotencyKeys.id });
        if (!claimed[0]) {
          void writeSecurityEvent({
            userId: user.id,
            event: "duplicate_mutation_blocked",
            severity: "info",
            requestId: sec.requestId,
            ipHash: sec.ipKey,
            metadata: { scope },
          });
          return withSecurityHeaders(
            NextResponse.json(
              { ok: false, message: "Bu so'rov avval qabul qilingan", code: "duplicate_request" },
              { status: 409 },
            ),
            sec.requestId,
          );
        }
        claimedIdempotency = { userId: user.id, key, scope };
      }
    }

    if (body.entity === "settings") {
      await updateUserSettings(user.id, body.settings ?? {});
      const refreshed = (await resolveUser(identity ?? undefined)) ?? user;
      await writeAudit({
        userId: user.id,
        actorRole: user.role,
        action: "update",
        entity: "settings",
        outcome: "success",
        requestId: sec.requestId,
        ipHash: sec.ipKey,
      });
      return withSecurityHeaders(
        NextResponse.json({ ok: true, message: "Sozlamalar saqlandi", state: await buildAppState(refreshed) }),
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
      NextResponse.json({ ...result, state, requestId: sec.requestId }, { status: result.ok ? 200 : 400 }),
      sec.requestId,
    );
  } catch (error) {
    if (claimedIdempotency) {
      await db
        .delete(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, claimedIdempotency.userId),
            eq(idempotencyKeys.key, claimedIdempotency.key),
            eq(idempotencyKeys.scope, claimedIdempotency.scope),
          ),
        )
        .catch(() => undefined);
    }
    securityLog("error", "mutation_error", { requestId: sec.requestId, ipKey: sec.ipKey, code: "internal" });
    return withSecurityHeaders(
      NextResponse.json({ ok: false, message: "Server xatosi", code: "internal", requestId: sec.requestId }, { status: 500 }),
      sec.requestId,
    );
  }
}
