-- Plan lifecycle integrity: enforce the status domain at the database level.
--
-- 0004_plan_lifecycle introduced the `status` column (active | paused |
-- cancelled | completed) on recurring_expenses and expected_incomes together
-- with the legacy backfill (inactive → paused), but deferred the CHECK
-- constraints that the Drizzle schema already declares
-- (`recurring_status_check`, `expected_status_check`). Applying them closes
-- the gap so an invalid lifecycle value can never be written, no matter
-- which client (Mini App, Telegram bot, ad-hoc SQL) performs the write.
--
-- Data-safe and idempotent: no row is modified. The new lifecycle rules
-- (cancel is final, toggle never wakes up cancelled/completed, restore is
-- explicit) are enforced in src/lib/reconciliation.ts + src/lib/mutations.ts;
-- existing legitimate values ('active'/'paused' from the 0004 backfill,
-- 'cancelled'/'completed' from mutations) all satisfy the constraint.

ALTER TABLE "recurring_expenses" DROP CONSTRAINT IF EXISTS "recurring_status_check";
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_status_check" CHECK ("recurring_expenses"."status" in ('active', 'paused', 'cancelled', 'completed'));
--> statement-breakpoint
ALTER TABLE "expected_incomes" DROP CONSTRAINT IF EXISTS "expected_status_check";
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD CONSTRAINT "expected_status_check" CHECK ("expected_incomes"."status" in ('active', 'paused', 'cancelled', 'completed'));
