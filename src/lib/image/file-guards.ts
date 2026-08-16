import { createHash } from "node:crypto";

/**
 * Pure file guards for Telegram image intake (§2, §24, §26, §27, §29).
 *
 * Kept dependency-free so the security rules (size caps, magic-byte sniffing,
 * duplicate fingerprints) can be unit-tested without Next.js, Telegram or a DB.
 */

export const MAX_IMAGE_BYTES = Number(process.env.IMAGE_MAX_BYTES ?? 5 * 1024 * 1024);

export type SupportedMime = "image/jpeg" | "image/png" | "image/webp";

/** Detects the real image type from magic bytes (never from the file name). */
export function sniffImageMime(buffer: Buffer): SupportedMime | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Declared Telegram document mime types we accept (PDF is a later phase). */
export function isSupportedDeclaredMime(mime: string | undefined | null): boolean {
  if (!mime) return false;
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime.toLowerCase());
}

/**
 * Stable fingerprint for duplicate protection (§24).
 * `file_unique_id` is stable per file across chats; the content hash also
 * catches a re-encoded re-upload of the same picture.
 */
export function imageFingerprint(fileUniqueId: string | null, contentHash: string): string {
  return createHash("sha256").update(`${fileUniqueId ?? ""}:${contentHash}`).digest("hex").slice(0, 48);
}

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width?: number;
  height?: number;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
};

/** Picks the largest photo size Telegram offers that is still within budget. */
export function pickPhotoSize(photos: TelegramPhotoSize[], maxBytes: number): TelegramPhotoSize | null {
  const sorted = [...photos].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0));
  return sorted.find((p) => (p.file_size ?? 0) <= maxBytes) ?? sorted[sorted.length - 1] ?? null;
}
