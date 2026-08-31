CREATE TABLE "quick_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"category_id" integer,
	"account_id" integer,
	"icon" text DEFAULT 'transport' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_expenses_amount_check" CHECK ("quick_expenses"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "quick_expenses" ADD CONSTRAINT "quick_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_expenses" ADD CONSTRAINT "quick_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_expenses" ADD CONSTRAINT "quick_expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quick_expenses_user_idx" ON "quick_expenses" USING btree ("user_id","is_active","sort_order");