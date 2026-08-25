import { db } from "@/db";
import { auditLogs, securityEvents } from "@/db/schema";
import { safeErrorDiagnostic } from "./error-diagnostics";

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
    // Audit failure must be visible but must never serialize a database error
    // message: Drizzle/pg messages may include SQL, parameters or a connection
    // URL. Railway's process log is the independent fallback when Postgres is
    // the dependency that failed.
    console.error(
      JSON.stringify({
        event: "audit_write_failed",
        requestId: params.requestId,
        ...safeErrorDiagnostic(error),
      }),
    );
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
    // Security logging is fail-open for the business operation and falls back
    // to the process log. Emit classification only, never the raw DB message.
    console.error(
      JSON.stringify({
        event: "security_event_write_failed",
        requestId: params.requestId,
        ...safeErrorDiagnostic(error),
      }),
    );
  }
}
