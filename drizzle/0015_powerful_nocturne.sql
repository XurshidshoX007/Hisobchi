ALTER TABLE "credit_installments" ADD COLUMN "principal_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "credit_installments" ADD COLUMN "interest_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "credit_installments" ADD COLUMN "fee_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN "credit_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "credit_principal_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "credit_interest_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "credit_fee_amount" numeric(18, 2);