import { db } from "@/db";
import { auditLogs, securityEvents } from "@/db/schema";

const SAFE_FIELDS = new Set([
  "type",
  "amount",
  "currency",
  "date",
  "categoryId",
  "accountId",
  "toAccountId",
  "month",
  "direction",
  "certainty",
  "frequency",
  "isMandatory",
  "dueDay",
]);

/** Reduces a mutation body to a small, non-secret audit summary. */
export function safeAuditMetadata(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!SAFE_FIELDS.has(key)) continue;
    if (typeof value === "string") output[key] = value.slice(0, 64);
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (typeof value === "boolean" || value === null) output[key] = value;
  }
  return output;
}

export async function writeAudit(params: {
  userId?: number | null;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: number | null;
  outcome: "success" | "denied" | "failed";
  requestId: string;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      actorRole: params.actorRole ?? "USER",
      action: params.action.slice(0, 80),
      entity: params.entity.slice(0, 80),
      entityId: params.entityId ?? null,
      outcome: params.outcome,
      requestId: params.requestId,
      ipHash: params.ipHash ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    // Audit failure should surface loudly but must not leak payloads.
    console.error(JSON.stringify({ event: "audit_write_failed", requestId: params.requestId, error: String(error) }));
  }
}

export async function writeSecurityEvent(params: {
  userId?: number | null;
  event: string;
  severity?: "info" | "warning" | "critical";
  requestId: string;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(securityEvents).values({
      userId: params.userId ?? null,
      event: params.event.slice(0, 100),
      severity: params.severity ?? "warning",
      requestId: params.requestId,
      ipHash: params.ipHash ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "security_event_write_failed", requestId: params.requestId, error: String(error) }));
  }
}
