ALTER TABLE "dictionary_text_selection_jobs" ALTER COLUMN "selected_execution_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD COLUMN "selected_execution_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD COLUMN "execution_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD COLUMN "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD COLUMN "ai_credit_pricing_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD COLUMN "provider_reserved_cost_micros" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD COLUMN "provider_reserved_input_tokens" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_text_selection_jobs" ADD COLUMN "provider_reserved_output_tokens" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "texts" ADD CONSTRAINT "texts_folder_owner_fk" FOREIGN KEY ("folder_id","owner_id") REFERENCES "public"."text_folders"("id","owner_id") ON DELETE no action ON UPDATE no action;