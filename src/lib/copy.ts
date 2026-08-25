/**
 * ONE TERMINOLOGY DICTIONARY for every user-facing surface.
 *
 * Mini App and the Telegram bot speak the SAME Uzbek vocabulary: one concept →
 * one term. This module is pure copy — no finance logic, no formatting rules,
 * no state. Technical identifiers (`safeToSpend`, `occurrence`, `baseAmount`,
 * `installmentCount`, `recurring`) stay in the code; only the labels below are
 * ever shown to a user.
 *
 * Casing rule (§18): terms are stored in sentence case. Uppercase is a
 * TYPOGRAPHY decision made by the component (`uppercase` utility), never a
 * second spelling of the same word.
 *
 * Apostrophes: always the typographic ‘ (o‘, g‘).
 */

/* ============================ Core finance terms ============================ */

export const TERMS = {
  balance: "Balans",
  income: "Daromad",
  expense: "Xarajat",
  net: "Sof",
  forecast: "Prognoz",
  expectedIncome: "Kutilayotgan daromad",
  cashFlow: "Pul oqimi",
  payment: "To‘lov",
  plan: "Reja",
  debt: "Qarzdorlik",
  history: "Tarix",
  filter: "Filtr",
  total: "Jami",
  /** Safe-to-Spend → the user-facing Uzbek label. `safeToSpend` stays in code. */
  safeToSpend: "Sarflash mumkin",
  transfer: "Transfer",
} as const;

/* ============================ Transaction direction ============================ */

export type TxDirection = "income" | "expense" | "transfer";

/** One direction vocabulary for forms, lists, the FAB, the bot and toasts. */
export const TX_LABEL: Record<TxDirection, string> = {
  income: TERMS.income,
  expense: TERMS.expense,
  transfer: TERMS.transfer,
};

export const TX_LABEL_LOWER: Record<TxDirection, string> = {
  income: "daromad",
  expense: "xarajat",
  transfer: "transfer",
};

export function txLabel(type: string): string {
  return TX_LABEL[type as TxDirection] ?? TX_LABEL.expense;
}

/* ============================ Status vocabulary ============================ */

/**
 * §9: never mix “Kutilmoqda / Kutilyapti / Pending” inside one product.
 * Plan lifecycle keeps its own four words (Faol / Pauza / Yakunlangan /
 * Bekor qilingan) — they are states of a PLAN, not of a payment.
 */
export const STATUS_LABEL = {
  pending: "Kutilmoqda",
  completed: "Bajarilgan",
  paid: "To‘langan",
  cancelled: "Bekor qilingan",
  failed: "Xatolik",
  processing: "Qayta ishlanmoqda",
} as const;

/** Plan cadence — the technical `planType` never reaches the screen. */
export const PLAN_TYPE_LABEL = {
  one_time: "Bir martalik",
  recurring: "Doimiy",
  term: "Muddatli",
} as const;

/* ============================ System states ============================ */

export const LOADING = {
  default: "Yuklanmoqda…",
  saving: "Saqlanmoqda…",
  analyzing: "Tahlil qilinmoqda…",
  deleting: "O‘chirilmoqda…",
} as const;

export const ERRORS = {
  load: "Ma’lumotlar yuklanmadi. Qayta urinib ko‘ring.",
  save: "Saqlab bo‘lmadi. Qayta urinib ko‘ring.",
  connection: "Ulanish yo‘q. Internetni tekshirib, qayta urinib ko‘ring.",
  busy: "Oldingi amal saqlanmoqda…",
} as const;
