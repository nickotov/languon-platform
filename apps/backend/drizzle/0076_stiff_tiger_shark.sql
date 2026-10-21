CREATE TABLE "learner_portrait_interview_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"interview_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"version" integer NOT NULL,
	"state" text NOT NULL,
	"input" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"execution" jsonb NOT NULL,
	"result" jsonb,
	"error_code" text,
	"idempotency_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "portrait_operations_state_check" CHECK ("learner_portrait_interview_operations"."state" in ('queued','running','succeeded','failed','cancelled')),
	CONSTRAINT "portrait_operations_versions_check" CHECK ("learner_portrait_interview_operations"."version" >= 0 and "learner_portrait_interview_operations"."generation" >= 0),
	CONSTRAINT "portrait_operations_context_size" CHECK (octet_length("learner_portrait_interview_operations"."context"::text) <= 150000)
);
--> statement-breakpoint
CREATE TABLE "learner_portrait_interviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"context" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "portrait_interviews_context_size" CHECK (octet_length("learner_portrait_interviews"."context"::text) <= 150000)
);
--> statement-breakpoint
CREATE TABLE "learner_portraits" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"version" integer NOT NULL,
	"generation" integer NOT NULL,
	"draft_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "learner_portraits_versions_check" CHECK ("learner_portraits"."version" >= 0 and "learner_portraits"."generation" >= 0 and ("learner_portraits"."state"->>'version')::integer = "learner_portraits"."version" and ("learner_portraits"."state"->>'generation')::integer = "learner_portraits"."generation"),
	CONSTRAINT "learner_portraits_state_size_check" CHECK (octet_length("learner_portraits"."state"::text) <= 100000)
);
--> statement-breakpoint
CREATE TABLE "learner_portrait_interview_provider_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"purpose" text NOT NULL,
	"reservation_id" uuid NOT NULL,
	"state" text NOT NULL,
	"reserved_cost_micros" integer NOT NULL,
	"reserved_input_tokens" integer NOT NULL,
	"reserved_output_tokens" integer NOT NULL,
	"actual_cost_micros" integer DEFAULT 0 NOT NULL,
	"actual_input_tokens" integer DEFAULT 0 NOT NULL,
	"actual_output_tokens" integer DEFAULT 0 NOT NULL,
	"input_cost_micros_per_million_tokens" integer NOT NULL,
	"output_cost_micros_per_million_tokens" integer NOT NULL,
	"max_cost_micros_per_attempt" integer NOT NULL,
	"max_input_tokens_per_attempt" integer NOT NULL,
	"max_output_tokens_per_attempt" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "portrait_interview_call_state_check" CHECK ("learner_portrait_interview_provider_calls"."state" in ('reserved','dispatched','settled')),
	CONSTRAINT "portrait_interview_call_purpose_check" CHECK ("learner_portrait_interview_provider_calls"."purpose" in ('actor')),
	CONSTRAINT "portrait_interview_call_ordinal_check" CHECK ("learner_portrait_interview_provider_calls"."ordinal" between 1 and 5),
	CONSTRAINT "portrait_interview_call_settlement_check" CHECK (("learner_portrait_interview_provider_calls"."state" = 'settled') = ("learner_portrait_interview_provider_calls"."settled_at" is not null)),
	CONSTRAINT "portrait_interview_call_amounts_check" CHECK ("learner_portrait_interview_provider_calls"."reserved_cost_micros" >= 0 and "learner_portrait_interview_provider_calls"."reserved_input_tokens" >= 0 and "learner_portrait_interview_provider_calls"."reserved_output_tokens" >= 0 and "learner_portrait_interview_provider_calls"."actual_cost_micros" >= 0 and "learner_portrait_interview_provider_calls"."actual_input_tokens" >= 0 and "learner_portrait_interview_provider_calls"."actual_output_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" DROP CONSTRAINT "ai_credit_reservations_job_kind_closed";--> statement-breakpoint
ALTER TABLE "dictionary_generation_provider_usage_archive" DROP CONSTRAINT "text_ai_usage_archive_kind";--> statement-breakpoint
ALTER TABLE "learner_portrait_interview_operations" ADD CONSTRAINT "learner_portrait_interview_operations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_portrait_interviews" ADD CONSTRAINT "learner_portrait_interviews_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_portraits" ADD CONSTRAINT "learner_portraits_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portrait_operations_idempotency_unique" ON "learner_portrait_interview_operations" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "portrait_operations_active_owner_unique" ON "learner_portrait_interview_operations" USING btree ("owner_id") WHERE "learner_portrait_interview_operations"."state" in ('queued','running');--> statement-breakpoint
CREATE INDEX "portrait_operations_claim_idx" ON "learner_portrait_interview_operations" USING btree ("state","lease_until","created_at");--> statement-breakpoint
CREATE INDEX "portrait_operations_interview_idx" ON "learner_portrait_interview_operations" USING btree ("interview_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portrait_interviews_owner_unique" ON "learner_portrait_interviews" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "portrait_interviews_expiry_idx" ON "learner_portrait_interviews" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "learner_portraits_expiry_idx" ON "learner_portraits" USING btree ("draft_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portrait_interview_call_ordinal_unique" ON "learner_portrait_interview_provider_calls" USING btree ("operation_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "portrait_interview_call_reservation_unique" ON "learner_portrait_interview_provider_calls" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "portrait_interview_call_state_idx" ON "learner_portrait_interview_provider_calls" USING btree ("state","settled_at");--> statement-breakpoint
CREATE INDEX "portrait_interview_call_owner_idx" ON "learner_portrait_interview_provider_calls" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_job_kind_closed" CHECK ("ai_credit_reservations"."job_kind" in ('dictionary-generation', 'sentence-generation', 'sentence-check', 'speech-generation', 'text-detection', 'text-translation', 'text-selection-card', 'conversation-turn', 'portrait-interview'));--> statement-breakpoint
ALTER TABLE "dictionary_generation_provider_usage_archive" ADD CONSTRAINT "text_ai_usage_archive_kind" CHECK ("dictionary_generation_provider_usage_archive"."job_kind" in ('dictionary-generation', 'sentence-generation', 'sentence-check', 'text-detection', 'text-translation', 'text-selection-card', 'conversation-turn', 'portrait-interview'));