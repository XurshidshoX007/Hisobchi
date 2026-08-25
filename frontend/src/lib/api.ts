/**
 * Backend API manzili va klient muhit o'zgaruvchilari.
 *
 * Default: API_BASE bo'sh satr — fetch chaqiruvlari nisbiy (`/api/...`) bo'lib
 * qoladi:
 *  - Ishlab chiqishda Vite dev-server `/api` ni backendga proksi qiladi.
 *  - Produksiyada nginx `/api` ni backend service'ga proksi qiladi.
 *  - Agar frontend va backend turli domenlarda to'g'ridan-to'g'ri
 *    bog'lansa: `VITE_API_URL=https://api.example.com` beriladi.
 *
 `import.meta.env` Vite build'da statik almashtiriladi; tsx/test muhitida
 * esa mavjud emas — shuning uchun xavfsiz (undefined-ga chidamli) o'qish.
 */

const meta = import.meta as unknown as { env?: Record<string, string | boolean | undefined> };
const env = meta.env ?? {};

export const API_BASE: string = (
  typeof env.VITE_API_URL === "string" ? env.VITE_API_URL : ""
).replace(/\/+$/, "");

/** Vite dev rejimimi (tsx/test muhitida false). */
export const IS_DEV: boolean = env.DEV === true || env.MODE === "development";

/** Public bot username'i (@ siz) — BotFather'dan. */
export const BOT_USERNAME: string | undefined =
  typeof env.VITE_TELEGRAM_BOT_USERNAME === "string" && env.VITE_TELEGRAM_BOT_USERNAME.length > 0
    ? env.VITE_TELEGRAM_BOT_USERNAME
    : undefined;
