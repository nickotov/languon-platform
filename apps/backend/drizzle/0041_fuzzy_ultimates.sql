CREATE TABLE "user_text_ai_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'auto' NOT NULL,
	"model_id" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_text_ai_preferences_selection_valid" CHECK (("user_text_ai_preferences"."mode" = 'auto' and "user_text_ai_preferences"."model_id" is null) or ("user_text_ai_preferences"."mode" = 'explicit' and "user_text_ai_preferences"."model_id" is not null and char_length("user_text_ai_preferences"."model_id") between 1 and 160)),
	CONSTRAINT "user_text_ai_preferences_version_nonnegative" CHECK ("user_text_ai_preferences"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dictionary_ai_worker_observations" ADD COLUMN "text_ai_selection_revision" integer;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "selected_execution_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "selected_execution_version" integer;--> statement-breakpoint
ALTER TABLE "user_text_ai_preferences" ADD CONSTRAINT "user_text_ai_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD CONSTRAINT "dictionary_generation_jobs_selected_execution_pair" CHECK (("dictionary_generation_jobs"."selected_execution_version" is null and "dictionary_generation_jobs"."selected_execution_snapshot" is null) or ("dictionary_generation_jobs"."selected_execution_version" = 1 and "dictionary_generation_jobs"."selected_execution_snapshot" is not null and "dictionary_generation_jobs"."execution_revision_id" is not null));