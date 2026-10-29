CREATE TABLE "knowledge_field_job_sources" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"block_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_exercise_evaluation_job_sources" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"attempt_result" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_exercise_evaluation_source_identity" CHECK ("knowledge_exercise_evaluation_job_sources"."input"->>'noteId'="knowledge_exercise_evaluation_job_sources"."note_id"::text and "knowledge_exercise_evaluation_job_sources"."input"->>'attemptId'="knowledge_exercise_evaluation_job_sources"."attempt_id"::text)
);
--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" DROP CONSTRAINT "texts_ai_jobs_external_source";--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" DROP CONSTRAINT "texts_ai_jobs_kind_format";--> statement-breakpoint
ALTER TABLE "knowledge_field_job_sources" ADD CONSTRAINT "knowledge_field_job_sources_job_id_texts_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."texts_ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_field_job_sources" ADD CONSTRAINT "knowledge_field_job_sources_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_field_job_sources" ADD CONSTRAINT "knowledge_field_job_sources_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_field_job_sources" ADD CONSTRAINT "knowledge_field_job_sources_branch_id_knowledge_working_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."knowledge_working_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_exercise_evaluation_job_sources" ADD CONSTRAINT "knowledge_exercise_evaluation_job_sources_job_id_texts_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."texts_ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_exercise_evaluation_job_sources" ADD CONSTRAINT "knowledge_exercise_evaluation_job_sources_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_exercise_evaluation_job_sources" ADD CONSTRAINT "knowledge_exercise_evaluation_job_sources_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_field_job_sources_note_idx" ON "knowledge_field_job_sources" USING btree ("note_id","actor_id");--> statement-breakpoint
CREATE INDEX "knowledge_exercise_evaluation_source_note_idx" ON "knowledge_exercise_evaluation_job_sources" USING btree ("note_id","actor_id");--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_external_source" CHECK ("texts_ai_jobs"."external_source_kind" is null or ("texts_ai_jobs"."external_source_kind" in ('knowledge-block','knowledge-field','knowledge-exercise') and "texts_ai_jobs"."job_kind"='text-translation' and "texts_ai_jobs"."folder_id" is null and "texts_ai_jobs"."text_id" is null));--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_kind_format" CHECK (("texts_ai_jobs"."job_kind"='text-detection' and "texts_ai_jobs"."format" in ('text-detection:v1','text-detection:v2')) or ("texts_ai_jobs"."job_kind"='text-translation' and "texts_ai_jobs"."format" in ('text-translation:v1','text-translation:v2','text-translation:v3','text-translation:v4')));