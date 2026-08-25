/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API bazasiz manzili (bo'sh = nisbiy /api proksi). */
  readonly VITE_API_URL?: string;
  /** Public bot username'i (@ siz). */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
