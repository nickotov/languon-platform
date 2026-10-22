ALTER TABLE "ai_credit_admin_removal_allocations" DROP CONSTRAINT "ai_credit_admin_removal_allocations_positive";--> statement-breakpoint
ALTER TABLE "ai_credit_admin_removals" DROP CONSTRAINT "ai_credit_admin_removals_amount_bounded";--> statement-breakpoint
ALTER TABLE "ai_credit_grants" DROP CONSTRAINT "ai_credit_admin_grants_amount_bounded";--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "cache_read_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_credit_admin_removal_allocations" ADD CONSTRAINT "ai_credit_admin_removal_allocations_positive" CHECK ("ai_credit_admin_removal_allocations"."allocated_credits" between 1 and 1000000000000000);--> statement-breakpoint
ALTER TABLE "ai_credit_admin_removals" ADD CONSTRAINT "ai_credit_admin_removals_amount_bounded" CHECK ("ai_credit_admin_removals"."amount" between 1 and 1000000000000000);--> statement-breakpoint
ALTER TABLE "ai_credit_grants" ADD CONSTRAINT "ai_credit_admin_grants_amount_bounded" CHECK ("ai_credit_grants"."source" <> 'admin' or "ai_credit_grants"."amount" <= 1000000000000000);