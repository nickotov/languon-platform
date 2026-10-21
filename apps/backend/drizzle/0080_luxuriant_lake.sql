CREATE TABLE "navigation_resources" (
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"last_opened_at" timestamp with time zone,
	"pinned_at" timestamp with time zone,
	CONSTRAINT "navigation_resources_owner_id_kind_resource_id_pk" PRIMARY KEY("owner_id","kind","resource_id"),
	CONSTRAINT "navigation_resources_kind_check" CHECK ("navigation_resources"."kind" in ('dictionary','text','knowledge'))
);
--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" DROP CONSTRAINT "texts_ai_jobs_kind_format";--> statement-breakpoint
ALTER TABLE "texts" ALTER COLUMN "folder_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ALTER COLUMN "folder_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "navigation_resources" ADD CONSTRAINT "navigation_resources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "navigation_resources_owner_recent_idx" ON "navigation_resources" USING btree ("owner_id","last_opened_at");--> statement-breakpoint
CREATE INDEX "navigation_resources_owner_pin_idx" ON "navigation_resources" USING btree ("owner_id","kind","pinned_at");--> statement-breakpoint
ALTER TABLE "texts_ai_jobs" ADD CONSTRAINT "texts_ai_jobs_kind_format" CHECK (("texts_ai_jobs"."job_kind"='text-detection' and "texts_ai_jobs"."format" in ('text-detection:v1','text-detection:v2')) or ("texts_ai_jobs"."job_kind"='text-translation' and "texts_ai_jobs"."format" in ('text-translation:v1','text-translation:v2','text-translation:v3')));