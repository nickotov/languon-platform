CREATE TABLE "ai_credit_action_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"authorization_fingerprint" text NOT NULL,
	"held_milli" bigint NOT NULL,
	"output_allowance" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_credit_action_quote_allowance" CHECK ("ai_credit_action_quotes"."held_milli">0 and "ai_credit_action_quotes"."output_allowance" between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "ai_provider_price_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"meter" text NOT NULL,
	"version" integer NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"data" jsonb NOT NULL,
	CONSTRAINT "ai_provider_price_revision_version" UNIQUE("provider_id","model_id","meter","version"),
	CONSTRAINT "ai_provider_price_version_positive" CHECK ("ai_provider_price_revisions"."version">0),
	CONSTRAINT "ai_provider_price_meter" CHECK ("ai_provider_price_revisions"."meter" in ('text-tokens','speech-characters'))
);
--> statement-breakpoint
CREATE TABLE "text_ai_capacity_active_totals" (
	"scope" text NOT NULL,
	"cohort" text NOT NULL,
	"cost" bigint NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	CONSTRAINT "text_ai_capacity_active_totals_scope_cohort_pk" PRIMARY KEY("scope","cohort"),
	CONSTRAINT "text_ai_capacity_active_nonnegative" CHECK ("text_ai_capacity_active_totals"."cost" >= 0 and "text_ai_capacity_active_totals"."input_tokens" >= 0 and "text_ai_capacity_active_totals"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "text_ai_capacity_jobs" (
	"source" text NOT NULL,
	"id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"job_kind" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"runnable" boolean NOT NULL,
	CONSTRAINT "text_ai_capacity_jobs_source_id_pk" PRIMARY KEY("source","id")
);
--> statement-breakpoint
CREATE TABLE "text_ai_capacity_provider_usage" (
	"id" uuid NOT NULL,
	"job_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"cohort" text NOT NULL,
	"state" text NOT NULL,
	"cost" bigint NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"settled_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "text_ai_capacity_provider_usage_id_job_kind_pk" PRIMARY KEY("id","job_kind"),
	CONSTRAINT "text_ai_capacity_usage_nonnegative" CHECK ("text_ai_capacity_provider_usage"."cost" >= 0 and "text_ai_capacity_provider_usage"."input_tokens" >= 0 and "text_ai_capacity_provider_usage"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "text_ai_capacity_queue_totals" (
	"scope" text PRIMARY KEY NOT NULL,
	"queued" bigint NOT NULL,
	"running" bigint NOT NULL,
	CONSTRAINT "text_ai_capacity_queue_nonnegative" CHECK ("text_ai_capacity_queue_totals"."queued" >= 0 and "text_ai_capacity_queue_totals"."running" >= 0)
);
--> statement-breakpoint
CREATE TABLE "text_ai_capacity_settled_buckets" (
	"scope" text NOT NULL,
	"cohort" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"cost" bigint NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	CONSTRAINT "text_ai_capacity_settled_buckets_scope_cohort_minute_pk" PRIMARY KEY("scope","cohort","minute"),
	CONSTRAINT "text_ai_capacity_settled_nonnegative" CHECK ("text_ai_capacity_settled_buckets"."cost" >= 0 and "text_ai_capacity_settled_buckets"."input_tokens" >= 0 and "text_ai_capacity_settled_buckets"."output_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "portrait_interview_daily_admissions" DROP CONSTRAINT "portrait_interview_daily_admissions_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ALTER COLUMN "ai_credit_input_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ALTER COLUMN "ai_credit_max_credits_per_attempt" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ALTER COLUMN "ai_credit_output_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ALTER COLUMN "ai_credit_max_credits_per_attempt" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ALTER COLUMN "ai_credit_input_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ALTER COLUMN "ai_credit_output_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ALTER COLUMN "ai_credit_max_credits_per_attempt" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ALTER COLUMN "ai_credit_input_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ALTER COLUMN "ai_credit_output_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ALTER COLUMN "ai_credit_max_credits_per_attempt" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ALTER COLUMN "ai_credit_input_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ALTER COLUMN "ai_credit_output_credits_per_million_tokens" SET DATA TYPE numeric(18, 3);--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "budget" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "reserved_cost_micros" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "actual_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "ai_credit_action_quotes" ADD CONSTRAINT "ai_credit_action_quotes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_price_revisions" ADD CONSTRAINT "ai_provider_price_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_action_quote_request" ON "ai_credit_action_quotes" USING btree ("owner_id","conversation_id","request_id");--> statement-breakpoint
CREATE INDEX "ai_credit_action_quote_expiry" ON "ai_credit_action_quotes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_provider_price_effective_idx" ON "ai_provider_price_revisions" USING btree ("provider_id","model_id","meter","effective_at");--> statement-breakpoint
CREATE INDEX "text_ai_capacity_jobs_runnable_idx" ON "text_ai_capacity_jobs" USING btree ("next_attempt_at","created_at") WHERE "text_ai_capacity_jobs"."state" = 'queued' and "text_ai_capacity_jobs"."runnable";--> statement-breakpoint
CREATE INDEX "text_ai_capacity_jobs_kind_idx" ON "text_ai_capacity_jobs" USING btree ("job_kind");--> statement-breakpoint
CREATE INDEX "text_ai_capacity_usage_boundary_idx" ON "text_ai_capacity_provider_usage" USING btree ("cohort","settled_at","owner_id") WHERE "text_ai_capacity_provider_usage"."state" = 'settled';--> statement-breakpoint
CREATE INDEX "text_ai_capacity_usage_cleanup_idx" ON "text_ai_capacity_provider_usage" USING btree ("settled_at") WHERE "text_ai_capacity_provider_usage"."state" = 'settled';--> statement-breakpoint
CREATE INDEX "text_ai_capacity_usage_overlap_idx" ON "text_ai_capacity_provider_usage" USING btree ("job_kind","state","settled_at");--> statement-breakpoint
ALTER TABLE "portrait_interview_daily_admissions" ADD CONSTRAINT "portrait_interview_daily_admissions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_credit_action_allocation_grant_idx" ON "ai_credit_action_allocations" USING btree ("grant_id");