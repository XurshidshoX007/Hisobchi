-- Goals are financial records: archive them instead of destroying history.
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_active_idx" ON "goals" ("user_id", "is_deleted");
