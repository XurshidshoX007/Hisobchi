import { imageIntelligenceEnabled, visionProviderConfigured } from "../env";
import { IMAGE_DISABLED_TEXT, IMAGE_SERVICE_UNAVAILABLE_TEXT } from "./ux";

/**
 * The single gate in front of image processing (§12, §33).
 *
 * Pure and dependency-light so every branch is unit-testable, and so there is
 * exactly ONE place that decides whether a photo is processed. The feature
 * flag is never bypassed and never hardcoded; the provider requirement is
 * never bypassed either.
 *
 * Crucially, "flag off" and "provider missing" are DIFFERENT outcomes:
 * telling a user the feature is disabled when the operator simply forgot the
 * API key hides a production incident behind a product message.
 */
export type ImageAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "feature_disabled" | "provider_unconfigured";
      /** Message to send to the Telegram user. */
      text: string;
      /** Audit action name (§32 monitoring). Never carries secrets. */
      event: string;
      outcome: "denied" | "failed";
    };

export type ImageAccessOptions = {
  /** Injected in tests. Production reads the real environment. */
  featureEnabled?: (telegramId: number) => boolean;
  providerConfigured?: () => boolean;
};

export function imageAccessDecision(telegramId: number, options: ImageAccessOptions = {}): ImageAccessDecision {
  const featureEnabled = options.featureEnabled ?? imageIntelligenceEnabled;
  const providerConfigured = options.providerConfigured ?? visionProviderConfigured;

  if (!featureEnabled(telegramId)) {
    return {
      allowed: false,
      reason: "feature_disabled",
      text: IMAGE_DISABLED_TEXT,
      event: "image_rejected",
      outcome: "denied",
    };
  }
  if (!providerConfigured()) {
    return {
      allowed: false,
      reason: "provider_unconfigured",
      text: IMAGE_SERVICE_UNAVAILABLE_TEXT,
      event: "image_provider_unconfigured",
      outcome: "failed",
    };
  }
  return { allowed: true };
}
