CREATE TYPE "public"."dictionary_generation_execution_state" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."dictionary_generation_review_state" AS ENUM('reviewable', 'accepted', 'discarded', 'expired');--> statement-breakpoint
CREATE TABLE "dictionary_generation_jobs" (
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"cancellation_requested_at" timestamp with time zone,
	"card_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"execution_state" "dictionary_generation_execution_state" DEFAULT 'queued' NOT NULL,
	"expected_card_version" integer,
	"expected_dictionary_version" integer NOT NULL,
	"expected_settings_version" integer NOT NULL,
	"failure_category" text,
	"fencing_token" bigint DEFAULT 0 NOT NULL,
	"format" text NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_payload" jsonb,
	"job_schema_version" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"lease_deadline" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"owner_id" uuid NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"progress_stage" text DEFAULT 'queued' NOT NULL,
	"proposal_schema_version" integer DEFAULT 1 NOT NULL,
	"request_fingerprint" text NOT NULL,
	"source_language_tag" text NOT NULL,
	"target_language_tag" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"worker_id" text,
	CONSTRAINT "dictionary_generation_jobs_format" CHECK (char_length("dictionary_generation_jobs"."format") between 3 and 64 and "dictionary_generation_jobs"."format" ~ '^[a-z][a-z0-9-]*:v[1-9][0-9]*$'),
	CONSTRAINT "dictionary_generation_jobs_kind" CHECK (char_length("dictionary_generation_jobs"."kind") between 3 and 32 and "dictionary_generation_jobs"."kind" ~ '^[a-z][a-z0-9-]*$'),
	CONSTRAINT "dictionary_generation_jobs_schema_versions" CHECK ("dictionary_generation_jobs"."job_schema_version" > 0 and "dictionary_generation_jobs"."proposal_schema_version" > 0),
	CONSTRAINT "dictionary_generation_jobs_positive_versions" CHECK ("dictionary_generation_jobs"."expected_dictionary_version" > 0 and "dictionary_generation_jobs"."expected_settings_version" > 0 and ("dictionary_generation_jobs"."expected_card_version" is null or "dictionary_generation_jobs"."expected_card_version" > 0)),
	CONSTRAINT "dictionary_generation_jobs_kind_card" CHECK (("dictionary_generation_jobs"."kind" = 'single-card' and "dictionary_generation_jobs"."card_id" is not null and "dictionary_generation_jobs"."expected_card_version" is not null) or "dictionary_generation_jobs"."kind" <> 'single-card'),
	CONSTRAINT "dictionary_generation_jobs_attempt_fence" CHECK ("dictionary_generation_jobs"."attempt_count" >= 0 and "dictionary_generation_jobs"."max_attempts" between 1 and 10 and "dictionary_generation_jobs"."attempt_count" <= "dictionary_generation_jobs"."max_attempts" and "dictionary_generation_jobs"."fencing_token" >= 0),
	CONSTRAINT "dictionary_generation_jobs_progress" CHECK ("dictionary_generation_jobs"."progress_percent" between 0 and 100 and "dictionary_generation_jobs"."progress_stage" in ('queued', 'generating', 'validating', 'review_ready', 'terminal')),
	CONSTRAINT "dictionary_generation_jobs_language_pair" CHECK (char_length("dictionary_generation_jobs"."source_language_tag") between 2 and 35 and char_length("dictionary_generation_jobs"."target_language_tag") between 2 and 35 and "dictionary_generation_jobs"."source_language_tag" <> "dictionary_generation_jobs"."target_language_tag"),
	CONSTRAINT "dictionary_generation_jobs_key_length" CHECK (char_length("dictionary_generation_jobs"."idempotency_key") between 16 and 128),
	CONSTRAINT "dictionary_generation_jobs_fingerprint_format" CHECK (char_length("dictionary_generation_jobs"."request_fingerprint") between 58 and 64 and "dictionary_generation_jobs"."request_fingerprint" ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "dictionary_generation_jobs_worker_length" CHECK ("dictionary_generation_jobs"."worker_id" is null or char_length("dictionary_generation_jobs"."worker_id") between 1 and 128),
	CONSTRAINT "dictionary_generation_jobs_failure_category" CHECK ("dictionary_generation_jobs"."failure_category" is null or ("dictionary_generation_jobs"."failure_category" ~ '^[a-z][a-z0-9_]{0,63}$')),
	CONSTRAINT "dictionary_generation_jobs_execution_lease" CHECK (("dictionary_generation_jobs"."execution_state" = 'running' and "dictionary_generation_jobs"."worker_id" is not null and "dictionary_generation_jobs"."lease_deadline" is not null and "dictionary_generation_jobs"."heartbeat_at" is not null) or ("dictionary_generation_jobs"."execution_state" <> 'running' and "dictionary_generation_jobs"."worker_id" is null and "dictionary_generation_jobs"."lease_deadline" is null and "dictionary_generation_jobs"."heartbeat_at" is null)),
	CONSTRAINT "dictionary_generation_jobs_completion" CHECK (("dictionary_generation_jobs"."execution_state" in ('completed', 'failed', 'cancelled', 'expired') and "dictionary_generation_jobs"."completed_at" is not null) or ("dictionary_generation_jobs"."execution_state" in ('queued', 'running') and "dictionary_generation_jobs"."completed_at" is null)),
	CONSTRAINT "dictionary_generation_jobs_timestamps" CHECK ("dictionary_generation_jobs"."updated_at" >= "dictionary_generation_jobs"."created_at" and "dictionary_generation_jobs"."next_attempt_at" >= "dictionary_generation_jobs"."created_at" and ("dictionary_generation_jobs"."completed_at" is null or "dictionary_generation_jobs"."completed_at" >= "dictionary_generation_jobs"."created_at") and ("dictionary_generation_jobs"."cancellation_requested_at" is null or "dictionary_generation_jobs"."cancellation_requested_at" >= "dictionary_generation_jobs"."created_at") and ("dictionary_generation_jobs"."heartbeat_at" is null or "dictionary_generation_jobs"."heartbeat_at" >= "dictionary_generation_jobs"."created_at") and ("dictionary_generation_jobs"."lease_deadline" is null or ("dictionary_generation_jobs"."heartbeat_at" is not null and "dictionary_generation_jobs"."lease_deadline" > "dictionary_generation_jobs"."heartbeat_at")))
);
--> statement-breakpoint
CREATE TABLE "dictionary_generation_proposals" (
	"accepted_candidate_fingerprint" text,
	"accepted_card_version" integer,
	"accepted_dictionary_version" integer,
	"accepted_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"job_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb,
	"review_state" "dictionary_generation_review_state" DEFAULT 'reviewable' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"terminal_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_generation_proposals_schema" CHECK ("dictionary_generation_proposals"."schema_version" = 1),
	CONSTRAINT "dictionary_generation_proposals_payload_state" CHECK (("dictionary_generation_proposals"."review_state" = 'reviewable' and "dictionary_generation_proposals"."payload" is not null and "dictionary_generation_proposals"."terminal_at" is null and "dictionary_generation_proposals"."accepted_candidate_fingerprint" is null and "dictionary_generation_proposals"."accepted_card_version" is null and "dictionary_generation_proposals"."accepted_dictionary_version" is null and "dictionary_generation_proposals"."accepted_revision_id" is null) or ("dictionary_generation_proposals"."review_state" = 'accepted' and "dictionary_generation_proposals"."payload" is null and "dictionary_generation_proposals"."terminal_at" is not null and "dictionary_generation_proposals"."accepted_candidate_fingerprint" is not null and "dictionary_generation_proposals"."accepted_card_version" is not null and "dictionary_generation_proposals"."accepted_dictionary_version" is not null and "dictionary_generation_proposals"."accepted_revision_id" is not null) or ("dictionary_generation_proposals"."review_state" in ('discarded', 'expired') and "dictionary_generation_proposals"."payload" is null and "dictionary_generation_proposals"."terminal_at" is not null and "dictionary_generation_proposals"."accepted_candidate_fingerprint" is null and "dictionary_generation_proposals"."accepted_card_version" is null and "dictionary_generation_proposals"."accepted_dictionary_version" is null and "dictionary_generation_proposals"."accepted_revision_id" is null)),
	CONSTRAINT "dictionary_generation_proposals_fingerprint_format" CHECK ("dictionary_generation_proposals"."accepted_candidate_fingerprint" is null or (char_length("dictionary_generation_proposals"."accepted_candidate_fingerprint") between 58 and 64 and "dictionary_generation_proposals"."accepted_candidate_fingerprint" ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$')),
	CONSTRAINT "dictionary_generation_proposals_timestamps" CHECK ("dictionary_generation_proposals"."expires_at" > "dictionary_generation_proposals"."created_at" and "dictionary_generation_proposals"."updated_at" >= "dictionary_generation_proposals"."created_at" and ("dictionary_generation_proposals"."terminal_at" is null or "dictionary_generation_proposals"."terminal_at" >= "dictionary_generation_proposals"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD CONSTRAINT "dictionary_generation_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD CONSTRAINT "dictionary_generation_jobs_dictionary_owner_fk" FOREIGN KEY ("dictionary_id","owner_id") REFERENCES "public"."dictionaries"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD CONSTRAINT "dictionary_generation_jobs_card_dictionary_fk" FOREIGN KEY ("card_id","dictionary_id") REFERENCES "public"."dictionary_cards"("id","dictionary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_proposals" ADD CONSTRAINT "dictionary_generation_proposals_accepted_revision_id_dictionary_card_revisions_id_fk" FOREIGN KEY ("accepted_revision_id") REFERENCES "public"."dictionary_card_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_proposals" ADD CONSTRAINT "dictionary_generation_proposals_job_id_dictionary_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."dictionary_generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_generation_jobs_owner_kind_key_unique" ON "dictionary_generation_jobs" USING btree ("owner_id","kind","idempotency_key");--> statement-breakpoint
CREATE INDEX "dictionary_generation_jobs_claim_idx" ON "dictionary_generation_jobs" USING btree ("execution_state","next_attempt_at","created_at","id");--> statement-breakpoint
CREATE INDEX "dictionary_generation_jobs_owner_state_idx" ON "dictionary_generation_jobs" USING btree ("owner_id","execution_state","created_at");--> statement-breakpoint
CREATE INDEX "dictionary_generation_jobs_card_created_idx" ON "dictionary_generation_jobs" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE INDEX "dictionary_generation_jobs_lease_idx" ON "dictionary_generation_jobs" USING btree ("lease_deadline") WHERE "dictionary_generation_jobs"."execution_state" = 'running';--> statement-breakpoint
CREATE INDEX "dictionary_generation_proposals_expiry_idx" ON "dictionary_generation_proposals" USING btree ("review_state","expires_at");--> statement-breakpoint
ALTER TABLE "dictionary_card_revisions" ADD CONSTRAINT "dictionary_card_revisions_accepted_generation_job_id_dictionary_generation_jobs_id_fk" FOREIGN KEY ("accepted_generation_job_id") REFERENCES "public"."dictionary_generation_jobs"("id") ON DELETE restrict ON UPDATE no action;