ALTER TABLE "users" ADD COLUMN "locale_confirmed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users"
SET "locale_confirmed_at" = COALESCE("created_at", now())
WHERE "locale_confirmed_at" IS NULL;
