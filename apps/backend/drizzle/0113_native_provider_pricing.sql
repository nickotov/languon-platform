CREATE TABLE "ai_credit_native_call_dispatches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"input_limit" integer NOT NULL,
	"output_limit" integer NOT NULL,
	"dispatched_at" timestamp with time zone NOT NULL,
	"provider_usage" jsonb,
	"provider_execution_facts" jsonb,
	"observed_at" timestamp with time zone,
	CONSTRAINT "ai_credit_native_call_limits" CHECK ("ai_credit_native_call_dispatches"."ordinal" between 1 and 5 and "ai_credit_native_call_dispatches"."input_limit">=0 and "ai_credit_native_call_dispatches"."output_limit">=1)
);
--> statement-breakpoint
ALTER TABLE "ai_operator_action_budgets" DROP CONSTRAINT "ai_operator_action_terminal";--> statement-breakpoint
ALTER TABLE "ai_operator_attempt_costs" DROP CONSTRAINT "ai_operator_attempt_terminal";--> statement-breakpoint
ALTER TABLE "ai_provider_price_revisions" DROP CONSTRAINT "ai_provider_price_meter";--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ALTER COLUMN "actual_cost_micros" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "text_ai_probes" ADD COLUMN "provider_usage" jsonb;--> statement-breakpoint
ALTER TABLE "text_ai_probes" ADD COLUMN "provider_execution_facts" jsonb;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "provider_usage" jsonb;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "provider_execution_facts" jsonb;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "provider_usage_bounds" jsonb;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "provider_usage" jsonb;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "provider_execution_facts" jsonb;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "provider_dispatch_witness" jsonb;--> statement-breakpoint
ALTER TABLE "ai_credit_native_call_dispatches" ADD CONSTRAINT "ai_credit_native_call_dispatches_attempt_id_ai_credit_action_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."ai_credit_action_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_native_call_ordinal" ON "ai_credit_native_call_dispatches" USING btree ("attempt_id","ordinal");--> statement-breakpoint
ALTER TABLE "ai_operator_action_budgets" ADD CONSTRAINT "ai_operator_action_terminal" CHECK (("ai_operator_action_budgets"."state"='active' and "ai_operator_action_budgets"."consumed_micros" is null and "ai_operator_action_budgets"."settled_at" is null) or ("ai_operator_action_budgets"."state"='settled' and "ai_operator_action_budgets"."consumed_micros" is not null and "ai_operator_action_budgets"."consumed_micros" >= 0 and "ai_operator_action_budgets"."settled_at" is not null));--> statement-breakpoint
ALTER TABLE "ai_operator_attempt_costs" ADD CONSTRAINT "ai_operator_attempt_terminal" CHECK (("ai_operator_attempt_costs"."settled_at" is null and "ai_operator_attempt_costs"."consumed_micros" is null and "ai_operator_attempt_costs"."measurement" is null) or ("ai_operator_attempt_costs"."settled_at" is not null and "ai_operator_attempt_costs"."consumed_micros" is not null and "ai_operator_attempt_costs"."measurement" is not null and "ai_operator_attempt_costs"."consumed_micros" >= 0 and "ai_operator_attempt_costs"."measurement" in ('measured','conservative')));--> statement-breakpoint
ALTER TABLE "ai_provider_price_revisions" ADD CONSTRAINT "ai_provider_price_meter" CHECK ("ai_provider_price_revisions"."meter" in ('text-tokens','speech-characters','speech-tokens'));