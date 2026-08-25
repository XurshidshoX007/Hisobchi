import { addDays, addMonths } from "./money";

/**
 * Shared PLAN ↔ REAL TRANSACTION ↔ RECONCILIATION engine.
 *
 * This module is the single source of truth for the state transitions a plan
 * (recurring expense or expected income) undergoes when one of its scheduled
 * occurrences is fulfilled (paid / received) or un-fulfilled (its real
 * transaction is deleted). Every mutation path — Mini App, Telegram bot,
 * history, plans, dashboard, analytics and cash-flow — goes through the same
 * functions so the lifecycle is symmetric and cannot drift between surfaces.
 */

export type OccurrenceIdentity = {
  /** The *scheduled* date of the occurrence (never the actual payment date). */
  plannedDate: string;
  /** 1-based sequence index of the occurrence within the plan schedule. */
  occurrenceNumber: number;
};

/** Plan lifecycle state. Semantically distinct from `isActive`:
 *  - active    → producing future occurrences
 *  - paused    → user paused (resumable)
 *  - cancelled → user cancelled/deleted (must NEVER be auto-reactivated)
 *  - completed → term/one_time finished its occurrences naturally
 */
export type PlanStatus = "active" | "paused" | "cancelled" | "completed";

export type PlanLike = {
  planType: string;
  frequency: string;
  nextDueDate: string;
  installmentsPaid: number;
  installmentCount: number | null;
  isActive: boolean;
  status?: PlanStatus | string | null;
  startDate?: string | null;
};

export type IncomePlanLike = {
  planType: string;
  frequency: string;
  expectedDate: string;
  occurrencesReceived: number;
  occurrenceCount: number | null;
  isActive: boolean;
  status?: PlanStatus | string | null;
  startDate?: string | null;
};

/**
 * Whether a plan was deactivated by explicit user intent (pause or cancel).
 * Such plans must never be silently reactivated by transaction-delete
 * reconciliation — only occurrence-level revert happens inside them.
 */
export function isUserDeactivated(status: PlanStatus | string | null | undefined): boolean {
  return status === "cancelled" || status === "paused";
}

/**
 * Toggle = pause / resume (active ↔ paused). It must NEVER wake up a
 * cancelled plan (§13) — cancellation is final until the explicit `restore`
 * action — nor re-open a completed term (its occurrences are exhausted).
 * Returns a user-facing error, or null when the toggle is allowed.
 */
export function togglePlanError(status: PlanStatus | string | null | undefined): string | null {
  if (status === "cancelled") {
    return "Bekor qilingan rejani faqat «Qayta faollashtirish» orqali yoqish mumkin";
  }
  if (status === "completed") {
    return "Yakunlangan rejani pauzaga o'tkazib bo'lmaydi";
  }
  return null;
}

/**
 * Restore is the ONLY way back from `cancelled` (§11). Paused plans resume
 * via toggle; completed plans stay final. Strictly typed so an accidental
 * reactivation path cannot be introduced elsewhere.
 */
export function canRestorePlan(status: PlanStatus | string | null | undefined): boolean {
  return status === "cancelled";
}

/**
 * Lifecycle after an ordinary Edit → Save (§11). An edit must never silently
 * change WHY a plan is inactive:
 *   - cancelled stays cancelled (only `restore` reactivates it);
 *   - a term whose installments are exhausted stays completed
 *     (explicitly raising `installmentCount` above `done` re-opens it — the
 *     Faol/Pauza form intent is then honoured);
 *   - a completed one-time plan has no counters and stays completed;
 *   - anything else honours the active/paused intent from the form.
 */
export function resolveEditLifecycle(args: {
  previousStatus: PlanStatus | string | null | undefined;
  planType: string;
  frequency: string;
  /** term: total scheduled occurrences after the edit; null otherwise */
  total: number | null;
  /** term: already fulfilled occurrences */
  done: number;
  nextIsActive: boolean;
}): { isActive: boolean; status: PlanStatus } {
  // A cancelled plan is never resurrected by Edit → Save.
  if (args.previousStatus === "cancelled") return { isActive: false, status: "cancelled" };
  const isOneTime = args.planType === "one_time" || args.frequency === "once";
  const termFinished = args.planType === "term" && args.total !== null && args.done >= args.total;
  if (termFinished) return { isActive: false, status: "completed" };
  if (args.previousStatus === "completed" && isOneTime) {
    return { isActive: false, status: "completed" };
  }
  return args.nextIsActive ? { isActive: true, status: "active" } : { isActive: false, status: "paused" };
}

/** Advance a date by the plan frequency (weekly/monthly/yearly). */
export function advancePeriod(date: string, frequency: string): string {
  if (frequency === "weekly") return addDays(date, 7);
  if (frequency === "yearly") return addMonths(date, 12);
  return addMonths(date, 1);
}

/** Rewind a date by `periods` steps of the plan frequency. */
export function rewindPeriod(date: string, frequency: string, periods: number): string {
  if (periods <= 0) return date;
  if (frequency === "weekly") return addDays(date, -7 * periods);
  if (frequency === "yearly") return addMonths(date, -12 * periods);
  return addMonths(date, -periods);
}

/**
 * The first occurrence of a schedule that is not in the past (§26).
 *
 * A plan that was paused/cancelled months ago keeps a stale `nextDueDate`.
 * Waking it up with that date would silently resurrect an overdue occurrence
 * that never happened, so a repeating schedule is rolled forward whole periods
 * until it lands on today or later. A one_time plan has no cadence to roll —
 * its single date is kept as-is and surfaces honestly as overdue.
 */
export function nextScheduleDate(
  plan: { planType?: string | null; frequency: string; cursor: string },
  today: string,
): string {
  if (plan.planType === "one_time" || plan.frequency === "once") return plan.cursor;
  if (plan.cursor >= today) return plan.cursor;
  let cursor = plan.cursor;
  let guard = 0;
  while (cursor < today && guard < 100_000) {
    cursor = advancePeriod(cursor, plan.frequency);
    guard += 1;
  }
  return cursor;
}

/**
 * Reactivation of a cancelled plan (§11/§26). Restore is never a blind flag
 * flip: the schedule is re-anchored to the next real occurrence so the plan
 * comes back with a date the user can actually pay, and the caller can preview
 * exactly that date before confirming.
 */
export function restoreRecurringState(
  plan: { planType: string; frequency: string; nextDueDate: string },
  today: string,
): { isActive: true; status: "active"; nextDueDate: string } {
  return {
    isActive: true,
    status: "active",
    nextDueDate: nextScheduleDate({ planType: plan.planType, frequency: plan.frequency, cursor: plan.nextDueDate }, today),
  };
}

/** Expected-income twin of {@link restoreRecurringState}. */
export function restoreIncomeState(
  plan: { planType: string; frequency: string; expectedDate: string },
  today: string,
): { isActive: true; status: "active"; expectedDate: string } {
  return {
    isActive: true,
    status: "active",
    expectedDate: nextScheduleDate({ planType: plan.planType, frequency: plan.frequency, cursor: plan.expectedDate }, today),
  };
}

/** 1-based index of `date` within the schedule seeded at `seedDate`. */
export function occurrenceIndexOf(seedDate: string, frequency: string, date: string): number {
  let n = 1;
  let cursor = seedDate;
  let guard = 0;
  while (cursor < date && guard < 100_000) {
    cursor = advancePeriod(cursor, frequency);
    n += 1;
    guard += 1;
  }
  return n;
}

/** Build the immutable occurrence identity for a plan fulfilment. */
export function occurrenceIdentity(
  plan: { startDate?: string | null; nextDueDate: string; frequency: string },
  plannedDate: string,
): OccurrenceIdentity {
  const seed = plan.startDate ?? plan.nextDueDate;
  return { plannedDate, occurrenceNumber: occurrenceIndexOf(seed, plan.frequency, plannedDate) };
}

/** State transition after fulfilling the occurrence whose planned date is `plannedDate`. */
export function advanceRecurringState(
  plan: PlanLike,
  plannedDate: string,
): { installmentsPaid?: number; nextDueDate?: string; isActive?: boolean; status?: PlanStatus } {
  if (plan.planType === "one_time" || plan.frequency === "once") {
    return { isActive: false, status: "completed" };
  }
  if (plan.planType === "term") {
    const paid = plan.installmentsPaid + 1;
    const finished = plan.installmentCount !== null && paid >= plan.installmentCount;
    return {
      installmentsPaid: paid,
      ...(finished
        ? { isActive: false, status: "completed" as const }
        : { nextDueDate: advancePeriod(plannedDate, plan.frequency) }),
    };
  }
  return { nextDueDate: advancePeriod(plannedDate, plan.frequency) };
}

/** Reverse transition after removing the fulfilment of the occurrence at `plannedDate`. */
export function revertRecurringState(
  plan: PlanLike,
  plannedDate: string,
): { installmentsPaid?: number; nextDueDate?: string; isActive?: boolean; status?: PlanStatus } {
  if (plan.planType === "one_time" || plan.frequency === "once") {
    // A cancelled/paused one-time plan stays deactivated — only a plan that
    // completed (or was still active) returns to active.
    return isUserDeactivated(plan.status) ? {} : { isActive: true, status: "active" };
  }
  if (plan.planType === "term") {
    // Explicit user deactivation (cancel/pause) wins over occurrence revert:
    // a cancelled plan must never be resurrected by deleting a payment.
    const wasCompleted =
      !isUserDeactivated(plan.status) &&
      (plan.status === "completed" || (plan.installmentCount !== null && plan.installmentsPaid >= plan.installmentCount));
    return {
      installmentsPaid: Math.max(0, plan.installmentsPaid - 1),
      nextDueDate: plannedDate,
      // Only auto-reactivate when the deleted fulfilment was what completed
      // the term; a plan the user paused/cancelled on purpose stays inactive.
      ...(wasCompleted ? { isActive: true, status: "active" as const } : {}),
    };
  }
  return { nextDueDate: plannedDate };
}

/** State transition after receiving the expected-income occurrence at `plannedDate`. */
export function advanceIncomeState(
  plan: IncomePlanLike,
  plannedDate: string,
): { occurrencesReceived?: number; expectedDate?: string; isActive?: boolean; status?: PlanStatus } {
  if (plan.planType === "one_time" || plan.frequency === "once") {
    return { isActive: false, status: "completed" };
  }
  if (plan.planType === "term") {
    const received = plan.occurrencesReceived + 1;
    const finished = plan.occurrenceCount !== null && received >= plan.occurrenceCount;
    return {
      occurrencesReceived: received,
      ...(finished
        ? { isActive: false, status: "completed" as const }
        : { expectedDate: advancePeriod(plannedDate, plan.frequency) }),
    };
  }
  return { expectedDate: advancePeriod(plannedDate, plan.frequency) };
}

/** Reverse transition after removing the received occurrence at `plannedDate`. */
export function revertIncomeState(
  plan: IncomePlanLike,
  plannedDate: string,
): { occurrencesReceived?: number; expectedDate?: string; isActive?: boolean; status?: PlanStatus } {
  if (plan.planType === "one_time" || plan.frequency === "once") {
    return isUserDeactivated(plan.status) ? {} : { isActive: true, status: "active" };
  }
  if (plan.planType === "term") {
    const wasCompleted =
      !isUserDeactivated(plan.status) &&
      (plan.status === "completed" || (plan.occurrenceCount !== null && plan.occurrencesReceived >= plan.occurrenceCount));
    return {
      occurrencesReceived: Math.max(0, plan.occurrencesReceived - 1),
      expectedDate: plannedDate,
      ...(wasCompleted ? { isActive: true, status: "active" as const } : {}),
    };
  }
  return { expectedDate: plannedDate };
}
