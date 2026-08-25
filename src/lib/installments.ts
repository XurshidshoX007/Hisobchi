import { round2 } from "./money";

/**
 * Credit schedule installments — shared business logic.
 *
 * A credit is ONE `term` payment plan (`recurring_expenses`) whose schedule is
 * a set of irregular occurrences (each with its own date AND amount) stored in
 * `credit_installments`. This module keeps the pure rules for that model in
 * one place so the mutation layer, the forecast engine and duplicate
 * protection all agree:
 *
 *   1 kredit = 1 reja
 *   1 reja   = N ta installment
 *   installment = alohida sana + alohida summa
 */

export type CreditInstallmentLike = {
  date: string;
  amount: number;
  occurrenceNumber: number;
};

export type CreditInstallmentInput = {
  date: string;
  amount: number;
};

/**
 * Normalize a credit/merchant name for duplicate detection ONLY. Stored names
 * are never rewritten — this is a comparison key, not a display value.
 *
 *   "Anor Bank Krediti" / "anor bank kredit" / "AnorBank krediti" → "anorbank"
 *   "Anor kredit" → "anor"  (a genuinely different, shorter merchant name)
 */
export function normalizeCreditName(name: string): string {
  return name
    .toLocaleLowerCase("uz")
    .replace(/[’‘`ʻ´']/g, "")
    .replace(/[^a-zа-я0-9]/gi, "")
    .replace(/(krediti|kredit|nasiya|nasiye|rassrochka|rasrochka|qarz)$/, "");
}

/**
 * True when two credit schedules are effectively the same merchant + the same
 * set of (date, amount) installments. Used to warn about — and protect against
 * — accidentally double-sending the same credit schedule (§17). Never merges.
 */
export function creditSchedulesMatch(
  aName: string,
  aItems: Array<{ date: string; amount: number }>,
  bName: string,
  bItems: Array<{ date: string; amount: number }>,
): boolean {
  if (normalizeCreditName(aName) !== normalizeCreditName(bName)) return false;
  if (aItems.length !== bItems.length) return false;
  const key = (it: { date: string; amount: number }) => `${it.date}|${round2(it.amount)}`;
  const a = aItems.map(key).sort();
  const b = bItems.map(key).sort();
  return a.every((value, i) => value === b[i]);
}

/** Number of installments whose date appears in `paidDates`. */
export function paidInstallmentCount(installments: Array<{ date: string }>, paidDates: Set<string>): number {
  return installments.filter((i) => paidDates.has(i.date)).length;
}

/** First installment (by schedule order) whose date is not in `paidDates`. */
export function nextUnpaidInstallment(installments: Array<{ date: string }>, paidDates: Set<string>): { date: string } | undefined {
  return installments.find((i) => !paidDates.has(i.date));
}

/**
 * Parent-plan state transition after fulfilling the installment at
 * `payingDate` (the "To‘landi" press). Mirrors `advanceRecurringState` but
 * advances the cursor to the NEXT UNPAID INSTALLMENT instead of adding one
 * monthly period — credit dates are irregular by design (§6/§14).
 */
export function advanceCreditTerm(
  installments: Array<{ date: string }>,
  paidDates: Set<string>,
  payingDate: string,
): { installmentsPaid: number; nextDueDate: string; isActive: boolean; status: "active" | "completed" } {
  const after = new Set(paidDates);
  after.add(payingDate);
  const paid = paidInstallmentCount(installments, after);
  const next = nextUnpaidInstallment(installments, after);
  const finished = paid >= installments.length;
  return {
    installmentsPaid: paid,
    nextDueDate: next?.date ?? installments[installments.length - 1].date,
    isActive: !finished,
    status: finished ? "completed" : "active",
  };
}

/**
 * Parent-plan state transition after removing the fulfilment of one
 * installment (deleting a payment from History, §15). Mirrors
 * `revertRecurringState`: a cancelled/paused plan stays deactivated, a
 * completed plan reopens, and the counter + cursor are recomputed from the
 * installments still unpaid.
 */
export function revertCreditTerm(
  plan: { status?: string | null; installmentsPaid: number; installmentCount: number | null },
  installments: Array<{ date: string }>,
  paidDates: Set<string>,
): { installmentsPaid: number; nextDueDate: string; isActive?: boolean; status?: "active" } {
  const paid = paidInstallmentCount(installments, paidDates);
  const next = nextUnpaidInstallment(installments, paidDates);
  const userDeactivated = plan.status === "cancelled" || plan.status === "paused";
  const wasCompleted =
    !userDeactivated &&
    (plan.status === "completed" || (plan.installmentCount !== null && plan.installmentsPaid >= plan.installmentCount));
  return {
    installmentsPaid: paid,
    nextDueDate: next?.date ?? installments[installments.length - 1].date,
    ...(wasCompleted ? { isActive: true, status: "active" as const } : {}),
  };
}
