CREATE TABLE "sentence_preparation_actions" (
	"action_id" uuid PRIMARY KEY NOT NULL,
	"preparation_id" uuid NOT NULL,
	"selected_execution_snapshot" jsonb NOT NULL,
	"execution_revision_id" uuid NOT NULL,
	"terminal_outcome" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sentence_preparation_actions_outcome" CHECK ("sentence_preparation_actions"."terminal_outcome" is null or "sentence_preparation_actions"."terminal_outcome" in ('success','stopped','failure'))
);
--> statement-breakpoint
ALTER TABLE "sentence_preparation_commands" ADD COLUMN "authorization_action_id" uuid;--> statement-breakpoint
ALTER TABLE "sentence_preparations" ADD COLUMN "current_action_id" uuid;--> statement-breakpoint
ALTER TABLE "sentence_preparations" ADD COLUMN "coordinator_fence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "provider_outcome" text;--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" ADD COLUMN "source_kind" text DEFAULT 'legacy-unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD COLUMN "execution_job_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_preparation_actions" ADD CONSTRAINT "sentence_preparation_actions_action_id_ai_credit_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_credit_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_actions" ADD CONSTRAINT "sentence_preparation_actions_preparation_id_sentence_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."sentence_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_actions" ADD CONSTRAINT "sentence_preparation_actions_execution_revision_id_dictionary_ai_configuration_revisions_id_fk" FOREIGN KEY ("execution_revision_id") REFERENCES "public"."dictionary_ai_configuration_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sentence_preparation_actions_parent_idx" ON "sentence_preparation_actions" USING btree ("preparation_id");--> statement-breakpoint
ALTER TABLE "sentence_preparation_commands" ADD CONSTRAINT "sentence_preparation_commands_authorization_action_id_ai_credit_actions_id_fk" FOREIGN KEY ("authorization_action_id") REFERENCES "public"."ai_credit_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparations" ADD CONSTRAINT "sentence_preparations_current_action_id_ai_credit_actions_id_fk" FOREIGN KEY ("current_action_id") REFERENCES "public"."ai_credit_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD CONSTRAINT "speech_jobs_provider_outcome" CHECK ("speech_jobs"."provider_outcome" is null or "speech_jobs"."provider_outcome" in ('ready','not_submitted','unknown'));--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" ADD CONSTRAINT "ai_provider_expense_source_kind" CHECK ("ai_provider_expense_records"."source_kind" in ('text-attempt','speech-attempt','legacy-unverified'));