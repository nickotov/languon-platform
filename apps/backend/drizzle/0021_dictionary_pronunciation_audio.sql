CREATE TABLE "dictionary_audio_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"field" text NOT NULL,
	"fingerprint" text NOT NULL,
	"storage" jsonb NOT NULL,
	"state" text NOT NULL,
	"checksum" text,
	"mime_type" text,
	"byte_length" integer,
	"writer_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dictionary_audio_asset_state" CHECK ("dictionary_audio_assets"."state" in ('pending','ready','deleting'))
);
--> statement-breakpoint
CREATE TABLE "dictionary_audio_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"field" text NOT NULL,
	"fingerprint" text NOT NULL,
	"job_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_audio_blobs" (
	"key" text NOT NULL,
	"namespace" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"checksum" text NOT NULL,
	CONSTRAINT "dictionary_audio_blobs_namespace_key_pk" PRIMARY KEY("namespace","key")
);
--> statement-breakpoint
CREATE TABLE "dictionary_audio_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"field" text NOT NULL,
	"fingerprint" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"text" text NOT NULL,
	"profile" jsonb NOT NULL,
	"state" text NOT NULL,
	"card_version" integer NOT NULL,
	"settings_version" integer NOT NULL,
	"task_id" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"next_poll_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"reserved_cost" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dictionary_audio_job_state" CHECK ("dictionary_audio_jobs"."state" in ('queued','submitting','waiting_provider','storing','ready','failed','cancelled','submission_unknown')),
	CONSTRAINT "dictionary_audio_job_field" CHECK ("dictionary_audio_jobs"."field" in ('source','translation','example','exampleTranslation')),
	CONSTRAINT "dictionary_audio_job_reserved_cost" CHECK ("dictionary_audio_jobs"."reserved_cost" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_audio_binding_content_unique" ON "dictionary_audio_bindings" USING btree ("owner_id","card_id","field","fingerprint");