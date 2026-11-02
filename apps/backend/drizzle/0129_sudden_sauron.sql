CREATE TABLE "knowledge_vocabulary_attempts" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_vocabulary_attempts_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entry_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"learning_version" integer NOT NULL,
	"rating" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"undo_operation_id" uuid,
	"undo_rating" text,
	CONSTRAINT "knowledge_vocabulary_attempt_operation" UNIQUE("actor_id","operation_id"),
	CONSTRAINT "knowledge_vocabulary_undo_operation" UNIQUE("actor_id","undo_operation_id"),
	CONSTRAINT "knowledge_vocabulary_attempt_version" CHECK ("knowledge_vocabulary_attempts"."learning_version">0 and "knowledge_vocabulary_attempts"."round">0),
	CONSTRAINT "knowledge_vocabulary_attempt_rating" CHECK ("knowledge_vocabulary_attempts"."rating" in ('known','again') and ("knowledge_vocabulary_attempts"."undo_rating" is null or "knowledge_vocabulary_attempts"."undo_rating" in ('known','again')))
);
--> statement-breakpoint
CREATE TABLE "knowledge_vocabulary_preferences" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"configuration" jsonb NOT NULL,
	"shuffle" boolean NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "knowledge_vocabulary_preferences_actor_id_note_id_block_id_pk" PRIMARY KEY("actor_id","note_id","block_id"),
	CONSTRAINT "knowledge_vocabulary_preferences_version" CHECK ("knowledge_vocabulary_preferences"."version">0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_vocabulary_progress" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"learning_version" integer NOT NULL,
	"rating" text NOT NULL,
	"latest_attempt_id" uuid NOT NULL,
	CONSTRAINT "knowledge_vocabulary_progress_actor_id_note_id_block_id_entry_id_pk" PRIMARY KEY("actor_id","note_id","block_id","entry_id"),
	CONSTRAINT "knowledge_vocabulary_progress_version" CHECK ("knowledge_vocabulary_progress"."learning_version">0),
	CONSTRAINT "knowledge_vocabulary_progress_rating" CHECK ("knowledge_vocabulary_progress"."rating" in ('known','again'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_sentence_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"explanation_language" text NOT NULL,
	"revealed_hint_ids" jsonb NOT NULL,
	"reference_revealed" boolean NOT NULL,
	"feedback" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sentence_attempts_operation" UNIQUE("actor_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_sentence_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"public_content" jsonb NOT NULL,
	"reference_translation" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sentence_exercises_operation" UNIQUE("actor_id","operation_id"),
	CONSTRAINT "knowledge_sentence_exercises_source_shape" CHECK (("knowledge_sentence_exercises"."public_content"->>'dictionaryId' is null and "knowledge_sentence_exercises"."public_content"->'knowledgeSource'->>'noteId'="knowledge_sentence_exercises"."note_id"::text and "knowledge_sentence_exercises"."public_content"->'knowledgeSource'->>'blockId'="knowledge_sentence_exercises"."block_id"::text) is true)
);
--> statement-breakpoint
CREATE TABLE "knowledge_sentence_exposures" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sentence_exposures_actor_id_exercise_id_pk" PRIMARY KEY("actor_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_sentence_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sentence_reviews_operation" UNIQUE("actor_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "knowledge_vocabulary_attempts" ADD CONSTRAINT "knowledge_vocabulary_attempts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_vocabulary_attempts" ADD CONSTRAINT "knowledge_vocabulary_attempts_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_vocabulary_preferences" ADD CONSTRAINT "knowledge_vocabulary_preferences_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_vocabulary_preferences" ADD CONSTRAINT "knowledge_vocabulary_preferences_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_vocabulary_progress" ADD CONSTRAINT "knowledge_vocabulary_progress_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_vocabulary_progress" ADD CONSTRAINT "knowledge_vocabulary_progress_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_vocabulary_progress" ADD CONSTRAINT "knowledge_vocabulary_progress_latest_attempt_id_knowledge_vocabulary_attempts_id_fk" FOREIGN KEY ("latest_attempt_id") REFERENCES "public"."knowledge_vocabulary_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_attempts" ADD CONSTRAINT "knowledge_sentence_attempts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_attempts" ADD CONSTRAINT "knowledge_sentence_attempts_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_attempts" ADD CONSTRAINT "knowledge_sentence_attempts_exercise_id_knowledge_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."knowledge_sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_exercises" ADD CONSTRAINT "knowledge_sentence_exercises_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_exercises" ADD CONSTRAINT "knowledge_sentence_exercises_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_exposures" ADD CONSTRAINT "knowledge_sentence_exposures_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_exposures" ADD CONSTRAINT "knowledge_sentence_exposures_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_exposures" ADD CONSTRAINT "knowledge_sentence_exposures_exercise_id_knowledge_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."knowledge_sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_reviews" ADD CONSTRAINT "knowledge_sentence_reviews_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_reviews" ADD CONSTRAINT "knowledge_sentence_reviews_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sentence_reviews" ADD CONSTRAINT "knowledge_sentence_reviews_exercise_id_knowledge_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."knowledge_sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_vocabulary_attempt_source_idx" ON "knowledge_vocabulary_attempts" USING btree ("note_id","block_id","entry_id","actor_id");--> statement-breakpoint
CREATE INDEX "knowledge_vocabulary_attempt_session_idx" ON "knowledge_vocabulary_attempts" USING btree ("actor_id","session_id","sequence");--> statement-breakpoint
CREATE INDEX "knowledge_vocabulary_preferences_note_idx" ON "knowledge_vocabulary_preferences" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_vocabulary_progress_note_idx" ON "knowledge_vocabulary_progress" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_attempts_note" ON "knowledge_sentence_attempts" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_attempts_exercise" ON "knowledge_sentence_attempts" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_attempts_history" ON "knowledge_sentence_attempts" USING btree ("actor_id","note_id","block_id","created_at","id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_exercises_note" ON "knowledge_sentence_exercises" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_exercises_source" ON "knowledge_sentence_exercises" USING btree ("actor_id","note_id","block_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_exposures_note" ON "knowledge_sentence_exposures" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_exposures_exercise" ON "knowledge_sentence_exposures" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_reviews_note" ON "knowledge_sentence_reviews" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_sentence_reviews_exercise" ON "knowledge_sentence_reviews" USING btree ("exercise_id");