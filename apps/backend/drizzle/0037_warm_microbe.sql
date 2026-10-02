CREATE TABLE "flashcard_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "flashcard_attempts_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
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
	CONSTRAINT "flashcard_attempts_learner_operation_unique" UNIQUE("learner_id","operation_id"),
	CONSTRAINT "flashcard_attempts_learner_undo_operation_unique" UNIQUE("learner_id","undo_operation_id"),
	CONSTRAINT "flashcard_attempts_positive_versions" CHECK ("flashcard_attempts"."learning_version" > 0 and "flashcard_attempts"."round" > 0),
	CONSTRAINT "flashcard_attempts_rating_valid" CHECK ("flashcard_attempts"."rating" in ('known', 'again') and ("flashcard_attempts"."undo_rating" is null or "flashcard_attempts"."undo_rating" in ('known', 'again'))),
	CONSTRAINT "flashcard_attempts_undo_state" CHECK (("flashcard_attempts"."voided_at" is null) = ("flashcard_attempts"."undo_operation_id" is null))
);
--> statement-breakpoint
CREATE TABLE "flashcard_entry_progress" (
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"learning_version" integer NOT NULL,
	"rating" text NOT NULL,
	"latest_attempt_id" uuid NOT NULL,
	CONSTRAINT "flashcard_entry_progress_learner_id_entry_id_pk" PRIMARY KEY("learner_id","entry_id"),
	CONSTRAINT "flashcard_progress_version_positive" CHECK ("flashcard_entry_progress"."learning_version" > 0),
	CONSTRAINT "flashcard_progress_rating_valid" CHECK ("flashcard_entry_progress"."rating" in ('known', 'again'))
);
--> statement-breakpoint
CREATE TABLE "flashcard_preferences" (
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"configuration" jsonb NOT NULL,
	"shuffle" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "flashcard_preferences_learner_id_dictionary_id_pk" PRIMARY KEY("learner_id","dictionary_id"),
	CONSTRAINT "flashcard_preferences_version_positive" CHECK ("flashcard_preferences"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "dictionary_cards" ADD COLUMN "learning_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcard_attempts" ADD CONSTRAINT "flashcard_attempts_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_attempts" ADD CONSTRAINT "flashcard_attempts_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_attempts" ADD CONSTRAINT "flashcard_attempts_entry_dictionary_fk" FOREIGN KEY ("entry_id","dictionary_id") REFERENCES "public"."dictionary_cards"("id","dictionary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_entry_progress" ADD CONSTRAINT "flashcard_entry_progress_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_entry_progress" ADD CONSTRAINT "flashcard_entry_progress_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_entry_progress" ADD CONSTRAINT "flashcard_entry_progress_latest_attempt_id_flashcard_attempts_id_fk" FOREIGN KEY ("latest_attempt_id") REFERENCES "public"."flashcard_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_entry_progress" ADD CONSTRAINT "flashcard_progress_entry_dictionary_fk" FOREIGN KEY ("entry_id","dictionary_id") REFERENCES "public"."dictionary_cards"("id","dictionary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_preferences" ADD CONSTRAINT "flashcard_preferences_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_preferences" ADD CONSTRAINT "flashcard_preferences_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flashcard_attempts_entry_sequence_idx" ON "flashcard_attempts" USING btree ("learner_id","entry_id","sequence");--> statement-breakpoint
CREATE INDEX "flashcard_attempts_session_sequence_idx" ON "flashcard_attempts" USING btree ("learner_id","session_id","sequence");--> statement-breakpoint
CREATE INDEX "flashcard_progress_dictionary_learner_idx" ON "flashcard_entry_progress" USING btree ("dictionary_id","learner_id");--> statement-breakpoint
ALTER TABLE "dictionary_cards" ADD CONSTRAINT "dictionary_cards_learning_version_positive" CHECK ("dictionary_cards"."learning_version" > 0);