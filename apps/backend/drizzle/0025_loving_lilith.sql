ALTER TYPE "public"."admin_audit_action" ADD VALUE 'ai_settings_updated';--> statement-breakpoint
CREATE TABLE "dictionary_ai_configuration_revisions" (
	"catalog_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "dictionary_ai_configuration_revisions_version_unique" UNIQUE("version"),
	CONSTRAINT "dictionary_ai_configuration_revisions_version_positive" CHECK ("dictionary_ai_configuration_revisions"."version" > 0),
	CONSTRAINT "dictionary_ai_configuration_revisions_snapshot_object" CHECK (jsonb_typeof("dictionary_ai_configuration_revisions"."catalog_snapshot") = 'object' and octet_length("dictionary_ai_configuration_revisions"."catalog_snapshot"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "dictionary_ai_configuration" (
	"active_revision_id" uuid,
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dictionary_ai_configuration_singleton" CHECK ("dictionary_ai_configuration"."id" = 'global'),
	CONSTRAINT "dictionary_ai_configuration_version_nonnegative" CHECK ("dictionary_ai_configuration"."version" >= 0),
	CONSTRAINT "dictionary_ai_configuration_revision_pair" CHECK (("dictionary_ai_configuration"."version" = 0 and "dictionary_ai_configuration"."active_revision_id" is null) or ("dictionary_ai_configuration"."version" > 0 and "dictionary_ai_configuration"."active_revision_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "execution_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "dictionary_ai_configuration_revisions" ADD CONSTRAINT "dictionary_ai_configuration_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_ai_configuration" ADD CONSTRAINT "dictionary_ai_configuration_active_revision_id_dictionary_ai_configuration_revisions_id_fk" FOREIGN KEY ("active_revision_id") REFERENCES "public"."dictionary_ai_configuration_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD CONSTRAINT "dictionary_generation_jobs_execution_revision_id_dictionary_ai_configuration_revisions_id_fk" FOREIGN KEY ("execution_revision_id") REFERENCES "public"."dictionary_ai_configuration_revisions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION "enforce_dictionary_ai_worker_routing_capability"() RETURNS trigger AS $$
BEGIN
	IF OLD."execution_state" = 'queued'
		AND NEW."execution_state" = 'running'
		AND OLD."execution_revision_id" IS NOT NULL
		AND current_setting('languon.dictionary_ai_routing_revision', true) IS DISTINCT FROM '1'
	THEN
		RETURN NULL;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "dictionary_ai_worker_routing_capability"
BEFORE UPDATE OF "execution_state" ON "dictionary_generation_jobs"
FOR EACH ROW EXECUTE FUNCTION "enforce_dictionary_ai_worker_routing_capability"();
