ALTER TABLE "goal_contributions" ADD COLUMN "transaction_id" integer;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill only one-to-one legacy matches. A contribution was historically
-- written together with an expense whose note is "Maqsad: <goal name>". If
-- the expense is already soft-deleted, reverse the stale goal aggregate too.
-- Ambiguous duplicates are deliberately left untouched for manual review.
UPDATE "goal_contributions" AS gc
SET "transaction_id" = (
  SELECT t."id"
  FROM "transactions" AS t
  JOIN "goals" AS g ON g."id" = gc."goal_id"
  WHERE t."user_id" = gc."user_id"
    AND t."amount" = gc."amount"
    AND t."date" = gc."date"
    AND t."note" = 'Maqsad: ' || g."name"
  LIMIT 1
)
WHERE gc."transaction_id" IS NULL
  AND 1 = (
    SELECT count(*)
    FROM "transactions" AS t
    JOIN "goals" AS g ON g."id" = gc."goal_id"
    WHERE t."user_id" = gc."user_id"
      AND t."amount" = gc."amount"
      AND t."date" = gc."date"
      AND t."note" = 'Maqsad: ' || g."name"
  )
  AND 1 = (
    SELECT count(*)
    FROM "goal_contributions" AS same_gc
    JOIN "goals" AS same_goal ON same_goal."id" = same_gc."goal_id"
    WHERE same_gc."transaction_id" IS NULL
      AND same_gc."user_id" = gc."user_id"
      AND same_gc."amount" = gc."amount"
      AND same_gc."date" = gc."date"
      AND same_goal."name" = (SELECT g."name" FROM "goals" AS g WHERE g."id" = gc."goal_id")
  );--> statement-breakpoint
WITH revoked AS (
  SELECT gc."goal_id", gc."user_id", sum(gc."amount") AS "amount"
  FROM "goal_contributions" AS gc
  JOIN "transactions" AS t ON t."id" = gc."transaction_id"
  WHERE t."is_deleted" = true
  GROUP BY gc."goal_id", gc."user_id"
)
UPDATE "goals" AS g
SET
  "saved_amount" = greatest(0, g."saved_amount" - revoked."amount"),
  "status" = CASE
    WHEN greatest(0, g."saved_amount" - revoked."amount") >= g."target_amount" THEN 'reached'
    ELSE 'active'
  END
FROM revoked
WHERE g."id" = revoked."goal_id" AND g."user_id" = revoked."user_id";--> statement-breakpoint
DELETE FROM "goal_contributions" AS gc
USING "transactions" AS t
WHERE gc."transaction_id" = t."id" AND t."is_deleted" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_contrib_transaction_unique" ON "goal_contributions" USING btree ("transaction_id");
