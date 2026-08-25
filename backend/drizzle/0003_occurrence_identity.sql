-- Occurrence identity for plan ↔ transaction reconciliation.
--
-- A real transaction that fulfils a payment plan occurrence (recurring
-- expense) or an expected-income occurrence must remember WHICH scheduled
-- occurrence it satisfied, independent of the *actual* transaction date.
-- This makes "delete a payment from history" reversibly restore the exact
-- planned occurrence (early payments included) instead of relying on
-- `parentId + transaction date`, which breaks when a payment is made early,
-- edited, or duplicated.
--
-- Backward compatible: existing rows are preserved; existing plan-linked
-- transactions are back-filled with `planned_date = date` (their previous
-- implicit identity), so historical reconciliation behaviour is unchanged.

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "planned_date" date;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "occurrence_number" integer;
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement-breakpoint
UPDATE "expected_incomes" SET "start_date" = "expected_date" WHERE "start_date" IS NULL;
--> statement-breakpoint
UPDATE "transactions"
   SET "planned_date" = "date"
 WHERE "planned_date" IS NULL
   AND ("recurring_id" IS NOT NULL OR "expected_income_id" IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_recurring_plan_idx" ON "transactions" ("recurring_id", "planned_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_income_plan_idx" ON "transactions" ("expected_income_id", "planned_date");
