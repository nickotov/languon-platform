CREATE TABLE "text_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "text_folders_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "text_folders_version_check" CHECK ("text_folders"."version">0),
	CONSTRAINT "text_folders_lifecycle_check" CHECK ("text_folders"."lifecycle" in ('active','archived'))
);
--> statement-breakpoint
CREATE TABLE "text_idempotency" (
	"owner_id" uuid NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "text_idempotency_owner_key_unique" UNIQUE("owner_id","key")
);
--> statement-breakpoint
CREATE TABLE "text_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"text_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "text_revisions_version_unique" UNIQUE("text_id","version")
);
--> statement-breakpoint
CREATE TABLE "text_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"locator" text NOT NULL,
	"key_digest" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "text_shares_resource_unique" UNIQUE("kind","resource_id"),
	CONSTRAINT "text_shares_locator_unique" UNIQUE("locator"),
	CONSTRAINT "text_shares_kind_check" CHECK ("text_shares"."kind" in ('text','folder'))
);
--> statement-breakpoint
CREATE TABLE "texts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_language" text NOT NULL,
	"target_language" text NOT NULL,
	"source_text" text NOT NULL,
	"alignment" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "texts_version_check" CHECK ("texts"."version">0),
	CONSTRAINT "texts_languages_check" CHECK ("texts"."source_language" <> "texts"."target_language"),
	CONSTRAINT "texts_lifecycle_check" CHECK ("texts"."lifecycle" in ('active','archived')),
	CONSTRAINT "texts_source_length_check" CHECK (char_length("texts"."source_text") <= 20000),
	CONSTRAINT "texts_status_check" CHECK (("texts"."status" = 'draft' and "texts"."alignment" is null) or ("texts"."status" in ('translated','edited') and "texts"."alignment" is not null))
);
--> statement-breakpoint
CREATE TABLE "texts_ai_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"text_id" uuid,
	"expected_text_version" integer,
	"applied_text_id" uuid,
	"operation_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"job_kind" text NOT NULL,
	"format" text NOT NULL,
	"execution_state" text DEFAULT 'queued' NOT NULL,
	"input_payload" jsonb,
	"result_payload" jsonb,
	"failure_category" text,
	"expires_at" timestamp with time zone NOT NULL,
	"selected_execution_snapshot" jsonb NOT NULL,
	"selected_execution_version" integer DEFAULT 1 NOT NULL,
	"execution_revision_id" uuid NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"fencing_token" bigint DEFAULT 0 NOT NULL,
	"worker_id" text,
	"lease_deadline" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"cancellation_requested_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_credit_accounted" boolean DEFAULT false NOT NULL,
	"ai_credit_reservation_id" uuid,
	"ai_credit_provider_dispatched_at" timestamp with time zone,
	"ai_credit_policy_mode" text,
	"ai_credit_pricing_revision" integer,
	"ai_credit_max_credits_per_attempt" integer,
	"ai_credit_input_credits_per_million_tokens" integer,
	"ai_credit_output_credits_per_million_tokens" integer,
	"provider_input_cost_micros_per_million_tokens" integer DEFAULT 0 NOT NULL,
	"provider_output_cost_micros_per_million_tokens" integer DEFAULT 0 NOT NULL,
	"provider_max_cost_micros_per_attempt" integer NOT NULL,
	"provider_max_input_tokens_per_attempt" integer NOT NULL,
	"provider_max_output_tokens_per_attempt" integer NOT NULL,
	"provider_reservation_state" text DEFAULT 'released' NOT NULL,
	"provider_reserved_attempts" integer DEFAULT 0 NOT NULL,
	"provider_reserved_cost_micros" integer DEFAULT 0 NOT NULL,
	"provider_reserved_input_tokens" integer DEFAULT 0 NOT NULL,
	"provider_reserved_output_tokens" integer DEFAULT 0 NOT NULL,
	"provider_reservation_settled_at" timestamp with time zone,
	"provider_actual_cost_micros" integer,
	"provider_actual_input_tokens" integer,
	"provider_actual_output_tokens" integer,
	CONSTRAINT "texts_ai_jobs_operation_unique" UNIQUE("owner_id","operation_id"),
	CONSTRAINT "texts_ai_jobs_kind_format" CHECK ("texts_ai_jobs"."format"="texts_ai_jobs"."job_kind"||':v1' and "texts_ai_jobs"."job_kind" in ('text-detection','text-translation')),
	CONSTRAINT "texts_ai_jobs_versions" CHECK ("texts_ai_jobs"."selected_execution_version"=1 and "texts_ai_jobs"."attempt_count">=0 and "texts_ai_jobs"."max_attempts">0 and "texts_ai_jobs"."fencing_token">=0 and (("texts_ai_jobs"."text_id" is null and "texts_ai_jobs"."expected_text_version" is null) or ("texts_ai_jobs"."text_id" is not null and "texts_ai_jobs"."expected_text_version">0))),
	CONSTRAINT "texts_ai_jobs_lease" CHECK (("texts_ai_jobs"."execution_state"='running' and "texts_ai_jobs"."worker_id" is not null and "texts_ai_jobs"."lease_deadline" is not null and "texts_ai_jobs"."heartbeat_at" is not null) or ("texts_ai_jobs"."execution_state"<>'running' and "texts_ai_jobs"."worker_id" is null and "texts_ai_jobs"."lease_deadline" is null and "texts_ai_jobs"."heartbeat_at" is null)),
	CONSTRAINT "texts_ai_jobs_state" CHECK ("texts_ai_jobs"."execution_state" in ('queued','running','completed','failed','cancelled') and (("texts_ai_jobs"."execution_state" in ('completed','failed','cancelled'))=("texts_ai_jobs"."completed_at" is not null)))
);
--> statement-breakpoint
CREATE TABLE "dictionary_text_selection_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"job_kind" text DEFAULT 'text-selection-card' NOT NULL,
	"format" text DEFAULT 'text-selection-card:v1' NOT NULL,
	"execution_state" text DEFAULT 'queued' NOT NULL,
	"input_payload" jsonb,
	"source_authority" jsonb,
	"target" jsonb,
	"confirm_duplicate" boolean DEFAULT false NOT NULL,
	"dictionary_id" uuid,
	"card_id" uuid,
	"failure_code" text,
	"selected_execution_snapshot" jsonb,
	"provider_input_cost_micros_per_million_tokens" integer NOT NULL,
	"provider_output_cost_micros_per_million_tokens" integer NOT NULL,
	"provider_max_cost_micros_per_attempt" integer NOT NULL,
	"provider_max_input_tokens_per_attempt" integer NOT NULL,
	"provider_max_output_tokens_per_attempt" integer NOT NULL,
	"provider_reservation_state" text DEFAULT 'active' NOT NULL,
	"provider_reservation_settled_at" timestamp with time zone,
	"provider_actual_cost_micros" integer DEFAULT 0 NOT NULL,
	"provider_actual_input_tokens" integer DEFAULT 0 NOT NULL,
	"provider_actual_output_tokens" integer DEFAULT 0 NOT NULL,
	"ai_credit_accounted" boolean DEFAULT false NOT NULL,
	"ai_credit_reservation_id" uuid,
	"ai_credit_policy_mode" text,
	"ai_credit_max_credits_per_attempt" integer,
	"ai_credit_input_credits_per_million_tokens" integer,
	"ai_credit_output_credits_per_million_tokens" integer,
	"ai_credit_provider_dispatched_at" timestamp with time zone,
	"worker_id" text,
	"fencing_token" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_deadline" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancellation_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dictionary_text_selection_states" CHECK ("dictionary_text_selection_jobs"."execution_state" in ('queued','running','completed','failed','cancelled')),
	CONSTRAINT "dictionary_text_selection_fixed_kind" CHECK ("dictionary_text_selection_jobs"."job_kind"='text-selection-card' and "dictionary_text_selection_jobs"."format"='text-selection-card:v1'),
	CONSTRAINT "dictionary_text_selection_transient_input" CHECK (("dictionary_text_selection_jobs"."execution_state" in ('queued','running') and "dictionary_text_selection_jobs"."input_payload" is not null and "dictionary_text_selection_jobs"."source_authority" is not null and "dictionary_text_selection_jobs"."target" is not null) or ("dictionary_text_selection_jobs"."execution_state" in ('completed','failed','cancelled') and "dictionary_text_selection_jobs"."input_payload" is null and "dictionary_text_selection_jobs"."source_authority" is null and "dictionary_text_selection_jobs"."target" is null))
);
--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" DROP CONSTRAINT "ai_credit_reservations_job_kind_closed";--> statement-breakpoint
ALTER TABLE "dictionary_generation_provider_usage_archive" DROP CONSTRAINT "text_ai_usage_archive_kind";--> statement-breakpoint
ALTER TABLE "dictionary_ai_worker_observations" ADD COLUMN "texts_capacity_revision" integer;--> statement-breakpoint
ALTER TABLE "dictionary_ai_worker_observations" ADD COLUMN "texts_execution_revision" integer;--> statement-breakpoint
ALTER TABLE "text_folders" ADD CONSTRAINT "text_folders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_idempotency" ADD CONSTRAINT "text_idempotency_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_revisions" ADD CONSTRAINT "text_revisions_text_id_texts_id_fk" FOREIGN KEY ("text_id") REFERENCES "public"."texts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_revisions" ADD CONSTRAINT "text_revisions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_shares" ADD CONSTRAINT "text_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "texts" ADD CONSTRAINT "texts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "texts" ADD CONSTRAINT "texts_folder_id_text_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."text_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_folder_id_text_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."text_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_text_id_texts_id_fk" FOREIGN KEY ("text_id") REFERENCES "public"."texts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_applied_text_id_texts_id_fk" FOREIGN KEY ("applied_text_id") REFERENCES "public"."texts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_execution_revision_id_dictionary_ai_configuration_revisions_id_fk" FOREIGN KEY ("execution_revision_id") REFERENCES "public"."dictionary_ai_configuration_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD CONSTRAINT "dictionary_text_selection_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "text_folders_owner_idx" ON "text_folders" USING btree ("owner_id","lifecycle","id");--> statement-breakpoint
CREATE INDEX "texts_owner_folder_idx" ON "texts" USING btree ("owner_id","folder_id","lifecycle","id");--> statement-breakpoint
CREATE INDEX "texts_ai_jobs_owner_idx" ON "texts_ai_jobs" USING btree ("owner_id","execution_state");--> statement-breakpoint
CREATE INDEX "texts_ai_jobs_folder_idx" ON "texts_ai_jobs" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "texts_ai_jobs_text_idx" ON "texts_ai_jobs" USING btree ("text_id");--> statement-breakpoint
CREATE INDEX "texts_ai_jobs_applied_text_idx" ON "texts_ai_jobs" USING btree ("applied_text_id");--> statement-breakpoint
CREATE INDEX "texts_ai_jobs_revision_idx" ON "texts_ai_jobs" USING btree ("execution_revision_id");--> statement-breakpoint
CREATE INDEX "texts_ai_jobs_queue_idx" ON "texts_ai_jobs" USING btree ("execution_state","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "texts_ai_jobs_expiry_idx" ON "texts_ai_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_text_selection_operation_unique" ON "dictionary_text_selection_jobs" USING btree ("owner_id","operation_id");--> statement-breakpoint
CREATE INDEX "dictionary_text_selection_queue_idx" ON "dictionary_text_selection_jobs" USING btree ("execution_state","next_attempt_at");--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_job_kind_closed" CHECK ("ai_credit_reservations"."job_kind" in ('dictionary-generation', 'sentence-generation', 'sentence-check', 'speech-generation', 'text-detection', 'text-translation', 'text-selection-card'));--> statement-breakpoint
ALTER TABLE "dictionary_generation_provider_usage_archive" ADD CONSTRAINT "text_ai_usage_archive_kind" CHECK ("dictionary_generation_provider_usage_archive"."job_kind" in ('dictionary-generation', 'sentence-generation', 'sentence-check', 'text-detection', 'text-translation', 'text-selection-card'));