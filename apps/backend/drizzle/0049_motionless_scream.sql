ALTER TABLE "sentence_next_receipts" DROP CONSTRAINT "sentence_next_receipts_outcome";--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" DROP CONSTRAINT "sentence_next_receipts_exercise_id_sentence_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" DROP CONSTRAINT "sentence_next_receipts_job_id_sentence_ai_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD COLUMN "invalidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_job_id_sentence_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sentence_ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_outcome" CHECK (("sentence_next_receipts"."invalidated_at" is null and num_nonnulls("sentence_next_receipts"."exercise_id","sentence_next_receipts"."job_id","sentence_next_receipts"."empty_reason")=1) or ("sentence_next_receipts"."invalidated_at" is not null and num_nonnulls("sentence_next_receipts"."exercise_id","sentence_next_receipts"."job_id","sentence_next_receipts"."empty_reason")=0));