CREATE TABLE "sentence_manual_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_manual_reviews_operation_unique" UNIQUE("learner_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD COLUMN "reference_revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_attempts" ADD COLUMN "reference_revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_manual_reviews" ADD CONSTRAINT "sentence_manual_reviews_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_manual_reviews" ADD CONSTRAINT "sentence_manual_reviews_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_manual_reviews" ADD CONSTRAINT "sentence_manual_reviews_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sentence_manual_reviews_dictionary_idx" ON "sentence_manual_reviews" USING btree ("dictionary_id");--> statement-breakpoint
CREATE INDEX "sentence_manual_reviews_exercise_idx" ON "sentence_manual_reviews" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "sentence_manual_reviews_history_idx" ON "sentence_manual_reviews" USING btree ("learner_id","dictionary_id","created_at","id");--> statement-breakpoint
CREATE INDEX "sentence_manual_reviews_session_idx" ON "sentence_manual_reviews" USING btree ("learner_id","exercise_id","session_id");