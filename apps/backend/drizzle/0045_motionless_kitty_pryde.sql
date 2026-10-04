CREATE TABLE "sentence_ai_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"job_kind" text NOT NULL,
	"format" text NOT NULL,
	"direction" text NOT NULL,
	"authority" jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"input_payload" jsonb NOT NULL,
	"execution_state" text DEFAULT 'queued' NOT NULL,
	"failure_category" text,
	"result_exercise_id" uuid,
	"result_attempt_id" uuid,
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
	CONSTRAINT "sentence_ai_jobs_operation_unique" UNIQUE("learner_id","operation_id"),
	CONSTRAINT "sentence_ai_jobs_kind_format" CHECK (("sentence_ai_jobs"."job_kind"='sentence-generation' and "sentence_ai_jobs"."format"='sentence-generation:v1') or ("sentence_ai_jobs"."job_kind"='sentence-check' and "sentence_ai_jobs"."format"='sentence-check:v1')),
	CONSTRAINT "sentence_ai_jobs_execution_versions" CHECK ("sentence_ai_jobs"."selected_execution_version"=1 and "sentence_ai_jobs"."attempt_count">=0 and "sentence_ai_jobs"."max_attempts">0 and "sentence_ai_jobs"."fencing_token">=0),
	CONSTRAINT "sentence_ai_jobs_lease" CHECK (("sentence_ai_jobs"."execution_state"='running' and "sentence_ai_jobs"."worker_id" is not null and "sentence_ai_jobs"."lease_deadline" is not null and "sentence_ai_jobs"."heartbeat_at" is not null) or ("sentence_ai_jobs"."execution_state"<>'running' and "sentence_ai_jobs"."worker_id" is null and "sentence_ai_jobs"."lease_deadline" is null and "sentence_ai_jobs"."heartbeat_at" is null)),
	CONSTRAINT "sentence_ai_jobs_state" CHECK ("sentence_ai_jobs"."execution_state" in ('queued','running','completed','failed','cancelled') and (("sentence_ai_jobs"."execution_state" in ('completed','failed','cancelled'))=("sentence_ai_jobs"."completed_at" is not null)))
);
--> statement-breakpoint
CREATE TABLE "sentence_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"explanation_language" text NOT NULL,
	"revealed_hint_ids" jsonb NOT NULL,
	"feedback" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_attempts_operation_unique" UNIQUE("learner_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "sentence_entry_coverage" (
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"learning_version" integer NOT NULL,
	"exposure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sentence_entry_coverage_learner_id_entry_id_direction_learning_version_pk" PRIMARY KEY("learner_id","entry_id","direction","learning_version"),
	CONSTRAINT "sentence_entry_coverage_counts" CHECK ("sentence_entry_coverage"."learning_version">0 and "sentence_entry_coverage"."exposure_count">=0)
);
--> statement-breakpoint
CREATE TABLE "sentence_exercise_entries" (
	"exercise_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"learning_version" integer NOT NULL,
	"source_text" text NOT NULL,
	"target_text" text NOT NULL,
	CONSTRAINT "sentence_exercise_entries_exercise_id_entry_id_pk" PRIMARY KEY("exercise_id","entry_id"),
	CONSTRAINT "sentence_exercise_entries_version" CHECK ("sentence_exercise_entries"."learning_version">0)
);
--> statement-breakpoint
CREATE TABLE "sentence_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"shared" boolean NOT NULL,
	"public_content" jsonb NOT NULL,
	"reference_translation" text NOT NULL,
	"generation_policy_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_exercises_direction" CHECK ("sentence_exercises"."direction" in ('source-to-target','target-to-source'))
);
--> statement-breakpoint
CREATE TABLE "sentence_exposures" (
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_exposures_learner_id_exercise_id_pk" PRIMARY KEY("learner_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "sentence_job_entries" (
	"job_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"learning_version" integer NOT NULL,
	CONSTRAINT "sentence_job_entries_job_id_entry_id_pk" PRIMARY KEY("job_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "sentence_next_receipts" (
	"learner_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"exercise_id" uuid,
	"job_id" uuid,
	"empty_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_next_receipts_learner_id_operation_id_pk" PRIMARY KEY("learner_id","operation_id"),
	CONSTRAINT "sentence_next_receipts_outcome" CHECK (num_nonnulls("sentence_next_receipts"."exercise_id","sentence_next_receipts"."job_id","sentence_next_receipts"."empty_reason")=1)
);
--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" ADD COLUMN "job_kind" text DEFAULT 'dictionary-generation' NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_ai_worker_observations" ADD COLUMN "text_ai_capacity_revision" integer;--> statement-breakpoint
ALTER TABLE "dictionary_ai_worker_observations" ADD COLUMN "learning_execution_revision" integer;--> statement-breakpoint
ALTER TABLE "dictionary_ai_worker_observations" ADD COLUMN "credit_settlement_revision" integer;--> statement-breakpoint
ALTER TABLE "dictionary_generation_provider_usage_archive" ADD COLUMN "job_kind" text DEFAULT 'dictionary-generation' NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD CONSTRAINT "sentence_ai_jobs_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD CONSTRAINT "sentence_ai_jobs_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD CONSTRAINT "sentence_ai_jobs_result_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("result_exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD CONSTRAINT "sentence_ai_jobs_result_attempt_id_sentence_attempts_id_fk" FOREIGN KEY ("result_attempt_id") REFERENCES "public"."sentence_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD CONSTRAINT "sentence_ai_jobs_execution_revision_id_dictionary_ai_configuration_revisions_id_fk" FOREIGN KEY ("execution_revision_id") REFERENCES "public"."dictionary_ai_configuration_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_attempts" ADD CONSTRAINT "sentence_attempts_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_attempts" ADD CONSTRAINT "sentence_attempts_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_attempts" ADD CONSTRAINT "sentence_attempts_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_entry_coverage" ADD CONSTRAINT "sentence_entry_coverage_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_entry_coverage" ADD CONSTRAINT "sentence_entry_coverage_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_entry_coverage" ADD CONSTRAINT "sentence_entry_coverage_entry_id_dictionary_id_dictionary_cards_id_dictionary_id_fk" FOREIGN KEY ("entry_id","dictionary_id") REFERENCES "public"."dictionary_cards"("id","dictionary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exercise_entries" ADD CONSTRAINT "sentence_exercise_entries_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exercise_entries" ADD CONSTRAINT "sentence_exercise_entries_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exercise_entries" ADD CONSTRAINT "sentence_exercise_entries_entry_id_dictionary_id_dictionary_cards_id_dictionary_id_fk" FOREIGN KEY ("entry_id","dictionary_id") REFERENCES "public"."dictionary_cards"("id","dictionary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exercises" ADD CONSTRAINT "sentence_exercises_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exercises" ADD CONSTRAINT "sentence_exercises_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exposures" ADD CONSTRAINT "sentence_exposures_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exposures" ADD CONSTRAINT "sentence_exposures_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_exposures" ADD CONSTRAINT "sentence_exposures_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_job_entries" ADD CONSTRAINT "sentence_job_entries_job_id_sentence_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sentence_ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_job_entries" ADD CONSTRAINT "sentence_job_entries_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_job_entries" ADD CONSTRAINT "sentence_job_entries_entry_id_dictionary_id_dictionary_cards_id_dictionary_id_fk" FOREIGN KEY ("entry_id","dictionary_id") REFERENCES "public"."dictionary_cards"("id","dictionary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_job_id_sentence_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sentence_ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sentence_ai_jobs_queue_idx" ON "sentence_ai_jobs" USING btree ("execution_state","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "sentence_ai_jobs_learner_idx" ON "sentence_ai_jobs" USING btree ("learner_id","execution_state");--> statement-breakpoint
CREATE INDEX "sentence_attempts_history_idx" ON "sentence_attempts" USING btree ("learner_id","dictionary_id","created_at","id");--> statement-breakpoint
CREATE INDEX "sentence_attempts_exercise_idx" ON "sentence_attempts" USING btree ("learner_id","exercise_id");--> statement-breakpoint
CREATE INDEX "sentence_entry_coverage_dictionary_idx" ON "sentence_entry_coverage" USING btree ("dictionary_id","learner_id");--> statement-breakpoint
CREATE INDEX "sentence_exercise_entries_entry_idx" ON "sentence_exercise_entries" USING btree ("dictionary_id","entry_id");--> statement-breakpoint
CREATE INDEX "sentence_exercises_pool_idx" ON "sentence_exercises" USING btree ("dictionary_id","direction","created_at","id");--> statement-breakpoint
CREATE INDEX "sentence_exposures_dictionary_idx" ON "sentence_exposures" USING btree ("dictionary_id");--> statement-breakpoint
CREATE INDEX "sentence_job_entries_entry_idx" ON "sentence_job_entries" USING btree ("dictionary_id","entry_id");--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_job_kind_closed" CHECK ("ai_credit_reservations"."job_kind" in ('dictionary-generation', 'sentence-generation', 'sentence-check'));--> statement-breakpoint
ALTER TABLE "dictionary_generation_provider_usage_archive" ADD CONSTRAINT "text_ai_usage_archive_kind" CHECK ("dictionary_generation_provider_usage_archive"."job_kind" in ('dictionary-generation', 'sentence-generation', 'sentence-check'));