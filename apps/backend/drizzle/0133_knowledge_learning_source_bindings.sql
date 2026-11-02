CREATE TABLE "knowledge_sentence_next_receipts" (
	"actor_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_sentence_next_receipts_actor_id_operation_id_pk" PRIMARY KEY("actor_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_private_translations" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"source_fingerprint" text NOT NULL,
	"target_language" text NOT NULL,
	"segments" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_private_translations_actor_id_note_id_block_id_target_language_pk" PRIMARY KEY("actor_id","note_id","block_id","target_language"),
	CONSTRAINT "knowledge_private_translation_fingerprint" CHECK ("knowledge_private_translations"."source_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "knowledge_private_translation_segments" CHECK (jsonb_typeof("knowledge_private_translations"."segments")='array' and jsonb_array_length("knowledge_private_translations"."segments") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "knowledge_text_job_sources" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"binding" jsonb NOT NULL,
	CONSTRAINT "knowledge_text_job_sources_binding" CHECK ("knowledge_text_job_sources"."binding"->>'kind'='knowledge-block' and "knowledge_text_job_sources"."binding"->>'actorId'="knowledge_text_job_sources"."actor_id"::text and "knowledge_text_job_sources"."binding"->>'noteId'="knowledge_text_job_sources"."note_id"::text and "knowledge_text_job_sources"."binding"->>'blockId'="knowledge_text_job_sources"."block_id"::text and "knowledge_text_job_sources"."binding"->'sourceSnapshot'->>'type'='bilingual-text')
);
--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ALTER COLUMN "dictionary_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ALTER COLUMN "input_payload" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD COLUMN "source_kind" text DEFAULT 'dictionary' NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD COLUMN "source_note_id" uuid;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD COLUMN "source_exercise_id" uuid;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD COLUMN "knowledge_source" jsonb;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD COLUMN "result_knowledge_exercise_id" uuid;--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD COLUMN "result_knowledge_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD COLUMN "external_source_kind" text;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_config_revisions" ADD COLUMN "processing_controls_revision" text;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_jobs" ADD COLUMN "processing_controls_revision" text;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_next_receipts" ADD CONSTRAINT "knowledge_sentence_next_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_next_receipts" ADD CONSTRAINT "knowledge_sentence_next_receipts_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_private_translations" ADD CONSTRAINT "knowledge_private_translations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_private_translations" ADD CONSTRAINT "knowledge_private_translations_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_text_job_sources" ADD CONSTRAINT "knowledge_text_job_sources_job_id_texts_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."texts_ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_text_job_sources" ADD CONSTRAINT "knowledge_text_job_sources_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_text_job_sources" ADD CONSTRAINT "knowledge_text_job_sources_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_sentence_next_note" ON "knowledge_sentence_next_receipts" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_text_job_sources_note_idx" ON "knowledge_text_job_sources" USING btree ("note_id","actor_id");--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_external_source" CHECK ("texts_ai_jobs"."external_source_kind" is null or ("texts_ai_jobs"."external_source_kind"='knowledge-block' and "texts_ai_jobs"."job_kind"='text-translation' and "texts_ai_jobs"."folder_id" is null and "texts_ai_jobs"."text_id" is null));