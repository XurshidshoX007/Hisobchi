import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { telegramApi } from "../telegram";
import { telegramBotToken } from "../env";
import { MAX_IMAGE_BYTES, sniffImageMime, type SupportedMime } from "./file-guards";

export { MAX_IMAGE_BYTES, imageFingerprint, isSupportedDeclaredMime, pickPhotoSize, sniffImageMime } from "./file-guards";
export type { SupportedMime, TelegramDocument, TelegramPhotoSize } from "./file-guards";

/**
 * Telegram file handling + preprocessing (§2, §3, §27).
 *
 * Privacy rules enforced here:
 *   • the image is downloaded to a private temp file, never into app storage
 *   • the temp directory is deleted in a `finally`, success or failure
 *   • no image bytes, OCR text or file paths are ever logged
 *   • the declared extension/mime is NOT trusted — magic bytes decide
 */

export type DownloadedImage = {
  buffer: Buffer;
  mimeType: SupportedMime;
  bytes: number;
  /** sha256 of the *content*, used for duplicate protection (§24). */
  contentHash: string;
};

export type DownloadFailure = {
  ok: false;
  reason: "unconfigured" | "too_large" | "unsupported_type" | "download_failed" | "not_found";
};

type TelegramFile = { file_id: string; file_path?: string; file_size?: number };

export type DownloadTelegramImageResult = { ok: true; image: DownloadedImage } | DownloadFailure;

/** Injectable contract so the intake pipeline can be tested without Telegram. */
export type DownloadTelegramImage = (
  fileId: string,
  context: { requestId: string; userId: number | null },
) => Promise<DownloadTelegramImageResult>;

/**
 * file_id → getFile → temporary download → validated buffer.
 * The caller receives bytes in memory; nothing survives on disk.
 */
export async function downloadTelegramImage(
  fileId: string,
  context: { requestId: string; userId: number | null },
): Promise<DownloadTelegramImageResult> {
  const token = telegramBotToken();
  if (!token) return { ok: false, reason: "unconfigured" };

  const info = await telegramApi<TelegramFile>("getFile", { file_id: fileId }, context, { timeoutMs: 10_000 });
  if (!info.ok || !info.result?.file_path) return { ok: false, reason: "not_found" };
  if ((info.result.file_size ?? 0) > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };

  let workDir: string | null = null;
  try {
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`, {
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, reason: "download_failed" };
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };

    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };

    const mimeType = sniffImageMime(raw);
    if (!mimeType) return { ok: false, reason: "unsupported_type" };

    // Temporary processing only: the bytes touch disk exclusively inside a
    // private per-request directory that is removed below.
    workDir = await mkdtemp(join(tmpdir(), "hisobchi-img-"));
    const tempPath = join(workDir, `${randomUUID()}.bin`);
    await writeFile(tempPath, raw, { mode: 0o600 });

    const processed = await preprocessImage(raw, mimeType);
    return {
      ok: true,
      image: {
        buffer: processed.buffer,
        mimeType: processed.mimeType,
        bytes: processed.buffer.byteLength,
        contentHash: createHash("sha256").update(raw).digest("hex"),
      },
    };
  } catch {
    return { ok: false, reason: "download_failed" };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Best-effort preprocessing (§3): auto-orientation, downscale, contrast and
 * noise reduction. `sharp` is optional — when it is not installed the original
 * bytes are passed through so the feature degrades instead of breaking.
 */
export async function preprocessImage(
  buffer: Buffer,
  mimeType: SupportedMime,
): Promise<{ buffer: Buffer; mimeType: SupportedMime }> {
  try {
    const moduleName = "sharp";
    const sharpModule = (await import(/* webpackIgnore: true */ moduleName).catch(() => null)) as
      | { default?: (input: Buffer) => SharpLike }
      | null;
    const sharp = sharpModule?.default;
    if (!sharp) return { buffer, mimeType };
    const processed = await sharp(buffer)
      .rotate() // EXIF orientation correction
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .normalise() // contrast improvement
      .median(1) // light noise reduction
      .jpeg({ quality: 88 })
      .toBuffer();
    return { buffer: processed, mimeType: "image/jpeg" };
  } catch {
    return { buffer, mimeType };
  }
}

type SharpLike = {
  rotate: () => SharpLike;
  resize: (options: Record<string, unknown>) => SharpLike;
  normalise: () => SharpLike;
  median: (size: number) => SharpLike;
  jpeg: (options: Record<string, unknown>) => SharpLike;
  toBuffer: () => Promise<Buffer>;
};
