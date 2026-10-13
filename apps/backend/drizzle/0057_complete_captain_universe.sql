ALTER TYPE "public"."admin_audit_action" ADD VALUE 'ai_model_price_published' BEFORE 'ai_credit_policy_updated';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'speech_recordings_deleted' BEFORE 'ai_credit_policy_updated';--> statement-breakpoint
ALTER TYPE "public"."ai_credit_measurement" ADD VALUE 'speech_success';--> statement-breakpoint
ALTER TYPE "public"."ai_credit_measurement" ADD VALUE 'speech_no_charge';--> statement-breakpoint
CREATE TABLE "speech_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"dictionary_id" uuid,
	"card_id" uuid,
	"exercise_id" uuid,
	"attempt_id" uuid,
	"operation_id" uuid NOT NULL,
	"source" jsonb NOT NULL,
	"source_revision" text NOT NULL,
	"recording_id" uuid NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speech_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recording_id" uuid NOT NULL,
	"canonical_key" text NOT NULL,
	"payer_id" uuid,
	"reservation_id" uuid,
	"rate_revision_id" uuid,
	"credits" bigint NOT NULL,
	"billing_state" text NOT NULL,
	"state" text NOT NULL,
	"task_id" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"next_poll_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"billing_deadline" timestamp with time zone NOT NULL,
	"recovery_deadline" timestamp with time zone NOT NULL,
	"error" text,
	CONSTRAINT "speech_jobs_state_check" CHECK ("speech_jobs"."state" in ('queued','submitting','processing','storing','submission_unknown','ready','failed')),
	CONSTRAINT "speech_jobs_billing_check" CHECK ("speech_jobs"."billing_state" in ('free','reserved','charged_success','released_no_charge'))
);
--> statement-breakpoint
CREATE TABLE "speech_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"source" jsonb NOT NULL,
	"source_revision" text NOT NULL,
	"canonical_key" text NOT NULL,
	"profile" jsonb NOT NULL,
	"rate_revision_id" uuid,
	"credits" bigint NOT NULL,
	"character_count" integer NOT NULL,
	"word_count" integer NOT NULL,
	"provisional" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"binding_id" uuid
);
--> statement-breakpoint
CREATE TABLE "speech_recordings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"canonical_key" text NOT NULL,
	"text" text NOT NULL,
	"language" text NOT NULL,
	"normalization_revision" text NOT NULL,
	"profile" jsonb NOT NULL,
	"state" text NOT NULL,
	"storage" jsonb NOT NULL,
	"checksum" text,
	"byte_length" integer,
	"duration_ms" integer,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_accessed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "speech_recordings_state_check" CHECK ("speech_recordings"."state" in ('pending','ready','deleting','deleted','failed'))
);
--> statement-breakpoint
CREATE TABLE "model_price_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"meter" text NOT NULL,
	"version" integer NOT NULL,
	"rates" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"reason" text NOT NULL,
	CONSTRAINT "model_price_revision_version_unique" UNIQUE("provider_id","model_id","version"),
	CONSTRAINT "model_price_revision_positive" CHECK ("model_price_revisions"."version" > 0),
	CONSTRAINT "model_price_meter_closed" CHECK ("model_price_revisions"."meter" in ('speech-characters', 'text-tokens')),
	CONSTRAINT "model_price_reason_bounded" CHECK (char_length("model_price_revisions"."reason") between 5 and 500)
);
--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" DROP CONSTRAINT "ai_credit_reservations_job_kind_closed";--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" DROP CONSTRAINT "ai_credit_reservations_terminal_state";--> statement-breakpoint
ALTER TABLE "speech_bindings" ADD CONSTRAINT "speech_bindings_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_bindings" ADD CONSTRAINT "speech_bindings_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_bindings" ADD CONSTRAINT "speech_bindings_card_id_dictionary_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."dictionary_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_bindings" ADD CONSTRAINT "speech_bindings_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_bindings" ADD CONSTRAINT "speech_bindings_attempt_id_sentence_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."sentence_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_bindings" ADD CONSTRAINT "speech_bindings_recording_id_speech_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."speech_recordings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_bindings" ADD CONSTRAINT "speech_bindings_job_id_speech_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."speech_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD CONSTRAINT "speech_jobs_recording_id_speech_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."speech_recordings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_quotes" ADD CONSTRAINT "speech_quotes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_quotes" ADD CONSTRAINT "speech_quotes_binding_id_speech_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."speech_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_price_revisions" ADD CONSTRAINT "model_price_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "speech_bindings_actor_operation_idx" ON "speech_bindings" USING btree ("actor_id","operation_id");--> statement-breakpoint
CREATE INDEX "speech_bindings_recording_idx" ON "speech_bindings" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "speech_jobs_claim_idx" ON "speech_jobs" USING btree ("state","next_poll_at");--> statement-breakpoint
CREATE UNIQUE INDEX "speech_jobs_single_flight_idx" ON "speech_jobs" USING btree ("canonical_key") WHERE "speech_jobs"."state" in ('queued','submitting','processing','storing','submission_unknown');--> statement-breakpoint
CREATE UNIQUE INDEX "speech_quotes_actor_operation_idx" ON "speech_quotes" USING btree ("actor_id","operation_id");--> statement-breakpoint
CREATE INDEX "speech_recordings_canonical_idx" ON "speech_recordings" USING btree ("canonical_key","state");--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_job_kind_closed" CHECK ("ai_credit_reservations"."job_kind" in ('dictionary-generation', 'sentence-generation', 'sentence-check', 'speech-generation'));--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_terminal_state" CHECK (("ai_credit_reservations"."state" = 'active' and "ai_credit_reservations"."settled_at" is null and "ai_credit_reservations"."measurement" is null and "ai_credit_reservations"."charged_credits" is null and "ai_credit_reservations"."measured_credits" is null) or ("ai_credit_reservations"."state" = 'released' and "ai_credit_reservations"."settled_at" is not null and "ai_credit_reservations"."measurement" is null and "ai_credit_reservations"."charged_credits" = 0 and "ai_credit_reservations"."measured_credits" is null) or ("ai_credit_reservations"."state" = 'settled' and "ai_credit_reservations"."settled_at" is not null and "ai_credit_reservations"."measurement" is not null and "ai_credit_reservations"."charged_credits" between 0 and 9007199254740991 and (("ai_credit_reservations"."measurement" = 'provider_reported' and "ai_credit_reservations"."measured_credits" between 0 and 9007199254740991) or ("ai_credit_reservations"."measurement" in ('estimated', 'unmetered', 'speech_success', 'speech_no_charge') and "ai_credit_reservations"."measured_credits" is null))));