export type WebhookFailure = {
  code: "invalid_json" | "internal";
  /** Telegram must retry every internal/dependency failure. */
  status: 200 | 500;
};

/**
 * Malformed JSON is a poison update and receives 200 so it is not retried
 * forever. Every other failure — including a database failure before an
 * update-id claim exists — receives 500 and remains retriable.
 */
export function classifyWebhookFailure(error: unknown): WebhookFailure {
  return error instanceof SyntaxError
    ? { code: "invalid_json", status: 200 }
    : { code: "internal", status: 500 };
}
