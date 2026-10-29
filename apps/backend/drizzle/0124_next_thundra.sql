CREATE TABLE "knowledge_transcription_config_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider_price_revision_id" uuid,
	"credits_per_minute" text,
	"maximum_duration_ms" integer NOT NULL,
	"maximum_bytes" integer NOT NULL,
	"maximum_provider_cost_micros" integer NOT NULL,
	"billing_rules_verified" boolean DEFAULT false NOT NULL,
	"billing_evidence" text,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "knowledge_transcription_config_revisions_version_unique" UNIQUE("version"),
	CONSTRAINT "knowledge_transcription_config_limits" CHECK ("knowledge_transcription_config_revisions"."version">0 and "knowledge_transcription_config_revisions"."maximum_duration_ms" between 1 and 1800000 and "knowledge_transcription_config_revisions"."maximum_bytes" between 1 and 5242880 and "knowledge_transcription_config_revisions"."maximum_provider_cost_micros">0),
	CONSTRAINT "knowledge_transcription_config_credit_rate" CHECK ("knowledge_transcription_config_revisions"."credits_per_minute" is null or "knowledge_transcription_config_revisions"."credits_per_minute" ~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,3})?$'),
	CONSTRAINT "knowledge_transcription_config_enable" CHECK (not "knowledge_transcription_config_revisions"."enabled" or ("knowledge_transcription_config_revisions"."provider_price_revision_id" is not null and "knowledge_transcription_config_revisions"."credits_per_minute" is not null and "knowledge_transcription_config_revisions"."billing_rules_verified" and "knowledge_transcription_config_revisions"."billing_evidence" is not null and char_length("knowledge_transcription_config_revisions"."billing_evidence") between 5 and 2000)),
	CONSTRAINT "knowledge_transcription_config_reason" CHECK (char_length("knowledge_transcription_config_revisions"."reason") between 5 and 500)
);
--> statement-breakpoint
CREATE TABLE "knowledge_transcription_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"checksum" text NOT NULL,
	"languages" jsonb NOT NULL,
	"configuration_revision_id" uuid NOT NULL,
	"provider_price_snapshot" jsonb NOT NULL,
	"source_duration_ms" integer NOT NULL,
	"byte_length" integer NOT NULL,
	"maximum_credits_milli" bigint NOT NULL,
	"state" text NOT NULL,
	"worker_id" text,
	"fencing_token" integer DEFAULT 0 NOT NULL,
	"lease_deadline" timestamp with time zone,
	"deadline_at" timestamp with time zone NOT NULL,
	"cancellation_requested_at" timestamp with time zone,
	"receipt_id" uuid,
	"attempt_id" uuid,
	"dispatched_at" timestamp with time zone,
	"observed_audio_input_ms" bigint,
	"result" jsonb,
	"failure_code" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_transcription_job_state" CHECK ("knowledge_transcription_jobs"."state" in ('confirmation-required','queued','running','completed','failed','cancelled')),
	CONSTRAINT "knowledge_transcription_job_source_bounds" CHECK ("knowledge_transcription_jobs"."source_duration_ms" between 1 and 1800000 and "knowledge_transcription_jobs"."byte_length" between 1 and 5242880 and "knowledge_transcription_jobs"."maximum_credits_milli" between 0 and 9007199254740991 and "knowledge_transcription_jobs"."fencing_token">=0),
	CONSTRAINT "knowledge_transcription_job_result" CHECK (("knowledge_transcription_jobs"."state"='completed' and "knowledge_transcription_jobs"."result" is not null) or ("knowledge_transcription_jobs"."state"<>'completed' and "knowledge_transcription_jobs"."result" is null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_transcription_operation_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"note_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_transcription_owner_receipt" UNIQUE("owner_id","id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_transcription_state" (
	"id" text PRIMARY KEY NOT NULL,
	"active_revision_id" uuid NOT NULL,
	CONSTRAINT "knowledge_transcription_state_singleton" CHECK ("knowledge_transcription_state"."id"='global')
);
--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" DROP CONSTRAINT "ai_provider_expense_source_kind";--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" DROP CONSTRAINT "ai_credit_action_attempt_limits";--> statement-breakpoint
ALTER TABLE "ai_credit_actions" DROP CONSTRAINT "ai_credit_action_output_limit";--> statement-breakpoint
ALTER TABLE "ai_credit_native_call_dispatches" DROP CONSTRAINT "ai_credit_native_call_limits";--> statement-breakpoint
ALTER TABLE "ai_provider_price_revisions" DROP CONSTRAINT "ai_provider_price_meter";--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "usage_meter" text DEFAULT 'text-tokens' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "audio_input_limit_milliseconds" integer;--> statement-breakpoint
ALTER TABLE "ai_credit_actions" ADD COLUMN "usage_meter" text DEFAULT 'text-tokens' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credit_actions" ADD COLUMN "audio_input_limit_milliseconds" integer;--> statement-breakpoint
ALTER TABLE "ai_credit_native_call_dispatches" ADD COLUMN "call_kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credit_native_call_dispatches" ADD COLUMN "audio_input_limit_milliseconds" integer;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_config_revisions" ADD CONSTRAINT "knowledge_transcription_config_revisions_provider_price_revision_id_ai_provider_price_revisions_id_fk" FOREIGN KEY ("provider_price_revision_id") REFERENCES "public"."ai_provider_price_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_config_revisions" ADD CONSTRAINT "knowledge_transcription_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_jobs" ADD CONSTRAINT "knowledge_transcription_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_jobs" ADD CONSTRAINT "knowledge_transcription_jobs_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_jobs" ADD CONSTRAINT "knowledge_transcription_jobs_configuration_revision_id_knowledge_transcription_config_revisions_id_fk" FOREIGN KEY ("configuration_revision_id") REFERENCES "public"."knowledge_transcription_config_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_operation_receipts" ADD CONSTRAINT "knowledge_transcription_operation_receipts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_state" ADD CONSTRAINT "knowledge_transcription_state_active_revision_id_knowledge_transcription_config_revisions_id_fk" FOREIGN KEY ("active_revision_id") REFERENCES "public"."knowledge_transcription_config_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_transcription_queue_idx" ON "knowledge_transcription_jobs" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_transcription_note_idx" ON "knowledge_transcription_jobs" USING btree ("note_id","owner_id");--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" ADD CONSTRAINT "ai_provider_expense_source_kind" CHECK ("ai_provider_expense_records"."source_kind" in ('text-attempt','speech-attempt','transcription-attempt','admin-probe','legacy-unverified'));--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD CONSTRAINT "ai_credit_action_attempt_limits" CHECK ("ai_credit_action_attempts"."ordinal" between 1 and 5 and "ai_credit_action_attempts"."input_limit" >= 0 and "ai_credit_action_attempts"."successful" in (0,1) and (("ai_credit_action_attempts"."usage_meter"='text-tokens' and "ai_credit_action_attempts"."output_limit" between 1 and 10000 and "ai_credit_action_attempts"."audio_input_limit_milliseconds" is null) or ("ai_credit_action_attempts"."usage_meter"='audio-duration' and "ai_credit_action_attempts"."input_limit"=0 and "ai_credit_action_attempts"."output_limit"=0 and "ai_credit_action_attempts"."audio_input_limit_milliseconds" is not null and "ai_credit_action_attempts"."audio_input_limit_milliseconds" between 1 and 1800000)));--> statement-breakpoint
ALTER TABLE "ai_credit_actions" ADD CONSTRAINT "ai_credit_action_output_limit" CHECK (("ai_credit_actions"."usage_meter"='text-tokens' and "ai_credit_actions"."output_limit" between 1 and 10000 and "ai_credit_actions"."audio_input_limit_milliseconds" is null) or ("ai_credit_actions"."usage_meter"='audio-duration' and "ai_credit_actions"."output_limit"=0 and "ai_credit_actions"."audio_input_limit_milliseconds" is not null and "ai_credit_actions"."audio_input_limit_milliseconds" between 1 and 1800000));--> statement-breakpoint
ALTER TABLE "ai_credit_native_call_dispatches" ADD CONSTRAINT "ai_credit_native_call_limits" CHECK ("ai_credit_native_call_dispatches"."ordinal" between 1 and 5 and "ai_credit_native_call_dispatches"."input_limit">=0 and "ai_credit_native_call_dispatches"."output_limit">=0 and (("ai_credit_native_call_dispatches"."call_kind"='text' and "ai_credit_native_call_dispatches"."output_limit">=1 and "ai_credit_native_call_dispatches"."audio_input_limit_milliseconds" is null) or ("ai_credit_native_call_dispatches"."call_kind"='audio-transcription' and "ai_credit_native_call_dispatches"."audio_input_limit_milliseconds" is not null and "ai_credit_native_call_dispatches"."audio_input_limit_milliseconds" between 1 and 1800000 and "ai_credit_native_call_dispatches"."input_limit"=0 and "ai_credit_native_call_dispatches"."output_limit"=0)));--> statement-breakpoint
ALTER TABLE "ai_provider_price_revisions" ADD CONSTRAINT "ai_provider_price_meter" CHECK ("ai_provider_price_revisions"."meter" in ('text-tokens','speech-characters','speech-tokens','audio-duration'));