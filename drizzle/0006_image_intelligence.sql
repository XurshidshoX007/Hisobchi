-- Telegram image / document finance intelligence (§24 duplicate protection).
--
-- `image_intakes` is an idempotency + audit table, NOT a second finance store:
-- confirmed money still lands exclusively in transactions / recurring_expenses
-- / expected_incomes / debts through the shared mutation engine.
--
-- It holds no image bytes, no OCR text and no amounts — only an irreversible
-- fingerprint of (Telegram file_unique_id : sha256(content)), so re-sending the
-- same picture cannot create duplicate financial records.
--
-- Data-safe and idempotent: creates one new table and its indexes.

CREATE TABLE IF NOT EXISTS "image_intakes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "fingerprint" text NOT NULL,
  "chat_id" bigint,
  "message_id" integer,
  "batch_id" text,
  "document_class" text,
  "entity_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'processing' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "image_intakes"
    ADD CONSTRAINT "image_intakes_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "image_intakes" DROP CONSTRAINT IF EXISTS "image_intakes_status_check";
--> statement-breakpoint
ALTER TABLE "image_intakes" ADD CONSTRAINT "image_intakes_status_check" CHECK ("image_intakes"."status" in ('processing', 'extracted', 'failed', 'rejected'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "image_intakes_user_fingerprint_key" ON "image_intakes" USING btree ("user_id","fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_intakes_batch_idx" ON "image_intakes" USING btree ("batch_id");
