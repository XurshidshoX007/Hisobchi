/**
 * Converts an unknown failure into metadata that is safe to emit to production
 * logs. Error messages are deliberately excluded: database/client errors can
 * contain SQL text, connection URLs, parameters or user data.
 */
export function safeErrorDiagnostic(error: unknown): { errorName: string; errorCode: string | null } {
  if (!error || typeof error !== "object") {
    return { errorName: typeof error, errorCode: null };
  }

  const candidate = error as { name?: unknown; code?: unknown };
  const errorName =
    typeof candidate.name === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(candidate.name)
      ? candidate.name
      : "Error";
  const rawCode = candidate.code;
  const errorCode =
    (typeof rawCode === "string" || typeof rawCode === "number") &&
    /^[A-Za-z0-9_.:-]{1,40}$/.test(String(rawCode))
      ? String(rawCode)
      : null;

  return { errorName, errorCode };
}
