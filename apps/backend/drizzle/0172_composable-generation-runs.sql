CREATE TABLE "conversation_generation_plan_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_generation_plan_revisions" (
	"run_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"plan" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"artifact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_generation_plan_revisions_run_id_revision_pk" PRIMARY KEY("run_id","revision")
);
--> statement-breakpoint
CREATE TABLE "conversation_generation_run_actions" (
	"proposal_id" uuid,
	"turn_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_generation_run_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"turn_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"batch_key" text NOT NULL,
	"artifact" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_generation_run_mutations" (
	"run_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_generation_run_mutations_run_id_request_id_pk" PRIMARY KEY("run_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_generation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"state" text NOT NULL,
	"pause_reason" text,
	"active_turn_id" uuid,
	"proposal_id" uuid,
	"source_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_generation_runs_revision_positive" CHECK ("conversation_generation_runs"."revision" > 0),
	CONSTRAINT "conversation_generation_runs_state" CHECK ("conversation_generation_runs"."state" in ('running','paused','completed','discarded'))
);
--> statement-breakpoint
CREATE TABLE "ai_credit_action_series" (
	"action_id" uuid PRIMARY KEY NOT NULL,
	"series_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_credit_series_totals" (
	"series_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"numerator" numeric(40, 0) DEFAULT '0' NOT NULL,
	"charged_milli" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_credit_series_totals_amount" CHECK ("ai_credit_series_totals"."numerator" >= 0 and "ai_credit_series_totals"."charged_milli" >= 0 and "ai_credit_series_totals"."charged_milli" = ceil("ai_credit_series_totals"."numerator"/1000000))
);
--> statement-breakpoint
CREATE TABLE "ai_credit_structured_call_validations" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"validation_id" text NOT NULL,
	"accepted" boolean,
	"created_at" timestamp with time zone NOT NULL,
	"validated_at" timestamp with time zone,
	CONSTRAINT "ai_credit_structured_validation_state" CHECK (("ai_credit_structured_call_validations"."accepted" is null and "ai_credit_structured_call_validations"."validated_at" is null) or ("ai_credit_structured_call_validations"."accepted" is not null and "ai_credit_structured_call_validations"."validated_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "conversation_block_proposals" RENAME TO "conversation_content_proposals";--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" RENAME COLUMN "blocks" TO "body";--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" DROP CONSTRAINT "conversation_block_proposals_version";--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" DROP CONSTRAINT "conversation_block_proposals_applied";--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" DROP CONSTRAINT "conversation_block_proposals_conversation_id_conversation_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" DROP CONSTRAINT "conversation_block_proposals_turn_id_conversation_turns_id_fk";
--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" DROP CONSTRAINT "conversation_block_proposals_note_id_knowledge_notes_id_fk";
--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" DROP CONSTRAINT "conversation_block_proposals_branch_id_knowledge_working_branches_id_fk";
--> statement-breakpoint
DROP INDEX "conversation_block_proposals_turn_target_unique";--> statement-breakpoint
DROP INDEX "conversation_block_proposals_conversation_idx";--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD COLUMN "generation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_generation_plan_candidates" ADD CONSTRAINT "conversation_generation_plan_candidates_run_id_conversation_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."conversation_generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_plan_revisions" ADD CONSTRAINT "conversation_generation_plan_revisions_run_id_conversation_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."conversation_generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_run_actions" ADD CONSTRAINT "conversation_generation_run_actions_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_run_actions" ADD CONSTRAINT "conversation_generation_run_actions_run_id_conversation_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."conversation_generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_run_artifacts" ADD CONSTRAINT "conversation_generation_run_artifacts_run_id_conversation_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."conversation_generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_run_artifacts" ADD CONSTRAINT "conversation_generation_run_artifacts_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_run_mutations" ADD CONSTRAINT "conversation_generation_run_mutations_run_id_conversation_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."conversation_generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_runs" ADD CONSTRAINT "conversation_generation_runs_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_runs" ADD CONSTRAINT "conversation_generation_runs_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_generation_runs" ADD CONSTRAINT "conversation_generation_runs_active_turn_id_conversation_turns_id_fk" FOREIGN KEY ("active_turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_action_series" ADD CONSTRAINT "ai_credit_action_series_action_id_ai_credit_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_credit_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_action_series" ADD CONSTRAINT "ai_credit_action_series_series_id_ai_credit_series_totals_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."ai_credit_series_totals"("series_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_action_series" ADD CONSTRAINT "ai_credit_action_series_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_series_totals" ADD CONSTRAINT "ai_credit_series_totals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_structured_call_validations" ADD CONSTRAINT "ai_credit_structured_call_validations_attempt_id_ai_credit_action_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."ai_credit_action_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_generation_actions_run_idx" ON "conversation_generation_run_actions" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_generation_artifact_batch_unique" ON "conversation_generation_run_artifacts" USING btree ("run_id","revision","batch_key");--> statement-breakpoint
CREATE INDEX "conversation_generation_runs_conversation_idx" ON "conversation_generation_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_generation_runs_active_turn_unique" ON "conversation_generation_runs" USING btree ("active_turn_id");--> statement-breakpoint
CREATE INDEX "ai_credit_action_series_series_idx" ON "ai_credit_action_series" USING btree ("series_id");--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" ADD CONSTRAINT "conversation_content_proposals_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" ADD CONSTRAINT "conversation_content_proposals_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" ADD CONSTRAINT "conversation_content_proposals_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" ADD CONSTRAINT "conversation_content_proposals_branch_id_knowledge_working_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."knowledge_working_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_content_proposals_turn_target_unique" ON "conversation_content_proposals" USING btree ("turn_id",coalesce("target_block_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "conversation_content_proposals_conversation_idx" ON "conversation_content_proposals" USING btree ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" ADD CONSTRAINT "conversation_content_proposals_version" CHECK ("conversation_content_proposals"."base_branch_version">0 and ("conversation_content_proposals"."applied_branch_version" is null or "conversation_content_proposals"."applied_branch_version">"conversation_content_proposals"."base_branch_version"));--> statement-breakpoint
ALTER TABLE "conversation_content_proposals" ADD CONSTRAINT "conversation_content_proposals_applied" CHECK (("conversation_content_proposals"."applied_at" is null) = ("conversation_content_proposals"."applied_branch_version" is null));