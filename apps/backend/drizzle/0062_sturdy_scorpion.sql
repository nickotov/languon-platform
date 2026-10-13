ALTER TABLE "speech_jobs" ADD COLUMN "estimated_cost_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "queue_deadline" timestamp with time zone DEFAULT clock_timestamp() + interval '2 minutes' NOT NULL;--> statement-breakpoint
ALTER TABLE "speech_recordings" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD CONSTRAINT "speech_jobs_estimated_cost_nonnegative" CHECK ("speech_jobs"."estimated_cost_units" >= 0);