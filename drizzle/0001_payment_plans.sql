-- Payment plan model: one_time | recurring | term for recurring_expenses and
-- expected_incomes, plus Telegram batch draft support.
-- Backward compatible: existing rows are migrated in place, history untouched.

ALTER TABLE "pending_drafts" ADD COLUMN IF NOT EXISTS "batch_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_drafts_batch_idx" ON "pending_drafts" ("batch_id");
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "plan_type" text DEFAULT 'recurring' NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "installment_count" integer;
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "installments_paid" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "recurring_expenses" SET "plan_type" = 'one_time' WHERE "frequency" = 'once' AND "plan_type" = 'recurring';
--> statement-breakpoint
UPDATE "recurring_expenses" SET "start_date" = "next_due_date" WHERE "start_date" IS NULL;
--> statement-breakpoint
ALTER TABLE "recurring_expenses" DROP CONSTRAINT IF EXISTS "recurring_plan_type_check";
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_plan_type_check" CHECK ("recurring_expenses"."plan_type" in ('one_time', 'recurring', 'term'));
--> statement-breakpoint
ALTER TABLE "recurring_expenses" DROP CONSTRAINT IF EXISTS "recurring_term_check";
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_term_check" CHECK ("recurring_expenses"."plan_type" <> 'term' or ("recurring_expenses"."installment_count" > 0 and "recurring_expenses"."installments_paid" >= 0));
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD COLUMN IF NOT EXISTS "plan_type" text DEFAULT 'recurring' NOT NULL;
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD COLUMN IF NOT EXISTS "occurrence_count" integer;
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD COLUMN IF NOT EXISTS "occurrences_received" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "expected_incomes" SET "plan_type" = 'one_time' WHERE "frequency" = 'once' AND "plan_type" = 'recurring';
--> statement-breakpoint
ALTER TABLE "expected_incomes" DROP CONSTRAINT IF EXISTS "expected_plan_type_check";
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD CONSTRAINT "expected_plan_type_check" CHECK ("expected_incomes"."plan_type" in ('one_time', 'recurring', 'term'));
--> statement-breakpoint
ALTER TABLE "expected_incomes" DROP CONSTRAINT IF EXISTS "expected_term_check";
--> statement-breakpoint
ALTER TABLE "expected_incomes" ADD CONSTRAINT "expected_term_check" CHECK ("expected_incomes"."plan_type" <> 'term' or ("expected_incomes"."occurrence_count" > 0 and "expected_incomes"."occurrences_received" >= 0));
