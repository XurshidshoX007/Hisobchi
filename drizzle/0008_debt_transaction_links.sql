-- Link debt-owned ledger rows back to the debt module so edits/payments stay
-- reconciled with History instead of leaving stale +/− transactions behind.

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "debt_id" integer REFERENCES "debts"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "debt_payment_id" integer REFERENCES "debt_payments"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_debt_idx" ON "transactions" ("user_id", "debt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_debt_payment_idx" ON "transactions" ("user_id", "debt_payment_id");
--> statement-breakpoint
-- Safe legacy adoption for opening debt movements created before debt_id
-- existed. We adopt only one-to-one matches, so two identical old debts do not
-- get linked to the wrong transaction.
WITH candidates AS (
  SELECT
    t."id" AS transaction_id,
    d."id" AS debt_id,
    count(*) OVER (PARTITION BY t."id") AS debt_matches,
    count(*) OVER (PARTITION BY d."id") AS transaction_matches
  FROM "transactions" t
  JOIN "debts" d
    ON d."user_id" = t."user_id"
   AND d."is_deleted" = false
   AND d."amount" = t."amount"
   AND t."debt_id" IS NULL
   AND t."debt_payment_id" IS NULL
   AND t."is_deleted" = false
   AND t."source" = 'miniapp'
   AND (
     (d."direction" = 'i_owe' AND t."type" = 'income' AND t."note" = 'Qarz olindi: ' || d."person_name") OR
     (d."direction" = 'owed_to_me' AND t."type" = 'expense' AND t."note" = 'Qarz berildi: ' || d."person_name")
   )
)
UPDATE "transactions" t
SET "debt_id" = c."debt_id"
FROM candidates c
WHERE t."id" = c."transaction_id"
  AND c."debt_matches" = 1
  AND c."transaction_matches" = 1;
