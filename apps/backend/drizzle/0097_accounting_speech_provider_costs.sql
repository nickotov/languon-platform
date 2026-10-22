CREATE TABLE "speech_daily_admission_counters" (
	"day" text NOT NULL,
	"scope" text NOT NULL,
	"free_count" integer DEFAULT 0 NOT NULL,
	"estimated_units" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "speech_daily_admission_counters_day_scope_pk" PRIMARY KEY("day","scope"),
	CONSTRAINT "speech_daily_admission_nonnegative" CHECK ("speech_daily_admission_counters"."free_count">=0 and "speech_daily_admission_counters"."estimated_units">=0)
);
--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "accounting_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "provider_price_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "provider_character_count" integer;--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD COLUMN "provider_dispatched_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "speech_jobs_active_owner_idx" ON "speech_jobs" USING btree ("payer_id","state") WHERE "speech_jobs"."state" in ('queued','submitting','processing','storing','submission_unknown');--> statement-breakpoint
CREATE INDEX "speech_jobs_active_lease_idx" ON "speech_jobs" USING btree ("state","lease_expires_at") WHERE "speech_jobs"."state" in ('submitting','processing','storing');--> statement-breakpoint
ALTER TABLE "speech_jobs" ADD CONSTRAINT "speech_jobs_accounting_snapshot" CHECK ("speech_jobs"."accounting_version"=0 or ("speech_jobs"."accounting_version"=1 and "speech_jobs"."provider_price_snapshot" is not null and "speech_jobs"."provider_character_count">0));