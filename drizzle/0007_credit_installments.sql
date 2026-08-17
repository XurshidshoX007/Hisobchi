-- Credit schedule installments (1 kredit = 1 term plan, 1 plan = N installment).
--
-- A credit parsed from a Telegram message is stored as ONE `term` plan in
-- recurring_expenses; each installment is a separate row here with its OWN
-- date and amount (both may be irregular). These rows are schedule
-- occurrences, not plans: the Mini App renders a single card with a progress
-- bar, never one card per installment.
--
-- The `paid` state is deliberately NOT a column here — it is derived from the
-- real transactions that fulfil each occurrence (transactions.recurring_id +
-- planned_date), the same reconciliation rule the whole product already uses,
-- so deleting a payment from History un-pays exactly that installment.

CREATE TABLE IF NOT EXISTS "credit_installments" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "plan_id" integer NOT NULL REFERENCES "recurring_expenses"("id") ON DELETE cascade,
  "occurrence_number" integer NOT NULL,
  "date" date NOT NULL,
  "amount" numeric(18,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_installments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "credit_installments_occurrence_check" CHECK ("occurrence_number" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_installments_plan_idx" ON "credit_installments" ("plan_id", "occurrence_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_installments_user_idx" ON "credit_installments" ("user_id");
