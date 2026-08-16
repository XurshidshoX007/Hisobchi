-- Plan lifecycle semantics: separate "cancelled by user" from "paused" and
-- "completed term". `is_active` stays the "produces future occurrences" flag
-- consumed by the forecast, while the new `status` records *why* a plan is
-- inactive. This is what lets transaction-delete reconciliation reactivate a
-- completed plan but never a user-cancelled one.
--
-- Backward compatible: existing rows default to 'active'. Rows that were
-- already inactive under the old single-flag model are mapped to 'paused'
-- (the resumable interpretation) — they can be re-labelled via the UI.

ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
UPDATE "recurring_expenses"
   SET "status" = 'paused'
 WHERE "status" = 'active'
   AND "is_active" = false;
--> statement-breakpoint
UPDATE "expected_incomes"
   SET "status" = 'paused'
 WHERE "status" = 'active'
   AND "is_active" = false;
