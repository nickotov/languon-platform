ALTER TABLE "sentence_next_receipts" DROP CONSTRAINT "sentence_next_receipts_outcome";--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ALTER COLUMN "configuration" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "sentence_ai_jobs_dictionary_idx" ON "sentence_ai_jobs" USING btree ("dictionary_id");--> statement-breakpoint
CREATE INDEX "sentence_ai_jobs_revision_idx" ON "sentence_ai_jobs" USING btree ("execution_revision_id");--> statement-breakpoint
CREATE INDEX "sentence_ai_jobs_result_exercise_idx" ON "sentence_ai_jobs" USING btree ("result_exercise_id");--> statement-breakpoint
CREATE INDEX "sentence_ai_jobs_result_attempt_idx" ON "sentence_ai_jobs" USING btree ("result_attempt_id");--> statement-breakpoint
CREATE INDEX "sentence_attempts_dictionary_idx" ON "sentence_attempts" USING btree ("dictionary_id");--> statement-breakpoint
CREATE INDEX "sentence_attempts_exercise_fk_idx" ON "sentence_attempts" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "sentence_entry_coverage_entry_idx" ON "sentence_entry_coverage" USING btree ("entry_id","dictionary_id");--> statement-breakpoint
CREATE INDEX "sentence_exercises_creator_idx" ON "sentence_exercises" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "sentence_exposures_exercise_idx" ON "sentence_exposures" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "sentence_next_receipts_dictionary_idx" ON "sentence_next_receipts" USING btree ("dictionary_id");--> statement-breakpoint
CREATE INDEX "sentence_next_receipts_exercise_idx" ON "sentence_next_receipts" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "sentence_next_receipts_job_idx" ON "sentence_next_receipts" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "sentence_next_receipts" ADD CONSTRAINT "sentence_next_receipts_outcome" CHECK (("sentence_next_receipts"."invalidated_at" is null and "sentence_next_receipts"."configuration" is not null and num_nonnulls("sentence_next_receipts"."exercise_id","sentence_next_receipts"."job_id","sentence_next_receipts"."empty_reason")=1) or ("sentence_next_receipts"."invalidated_at" is not null and num_nonnulls("sentence_next_receipts"."exercise_id","sentence_next_receipts"."job_id","sentence_next_receipts"."empty_reason")=0));