CREATE TABLE "knowledge_sentence_job_sources" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"source_exercise_id" uuid,
	"binding" jsonb NOT NULL,
	"input_payload" jsonb NOT NULL,
	CONSTRAINT "knowledge_sentence_job_sources_binding" CHECK ("knowledge_sentence_job_sources"."binding"->>'kind'='knowledge-block' and "knowledge_sentence_job_sources"."binding"->>'actorId'="knowledge_sentence_job_sources"."actor_id"::text and "knowledge_sentence_job_sources"."binding"->>'noteId'="knowledge_sentence_job_sources"."note_id"::text and "knowledge_sentence_job_sources"."binding"->>'blockId'="knowledge_sentence_job_sources"."block_id"::text and "knowledge_sentence_job_sources"."binding"->'sourceSnapshot'->>'type'='vocabulary'),
	CONSTRAINT "knowledge_sentence_job_sources_input" CHECK (jsonb_typeof("knowledge_sentence_job_sources"."input_payload")='object' and octet_length("knowledge_sentence_job_sources"."input_payload"::text)<=524288 and octet_length("knowledge_sentence_job_sources"."binding"::text)<=524288)
);
--> statement-breakpoint
ALTER TABLE "knowledge_sentence_job_sources" ADD CONSTRAINT "knowledge_sentence_job_sources_job_id_sentence_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sentence_ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_job_sources" ADD CONSTRAINT "knowledge_sentence_job_sources_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_job_sources" ADD CONSTRAINT "knowledge_sentence_job_sources_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_sentence_job_sources_note_idx" ON "knowledge_sentence_job_sources" USING btree ("note_id","actor_id");