ALTER TYPE "public"."admin_audit_action" ADD VALUE 'sentence_personally_archived';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'sentence_personally_restored';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'sentence_globally_archived';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'sentence_globally_restored';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'sentence_permanently_deleted';--> statement-breakpoint
CREATE TABLE "sentence_global_visibility" (
	"exercise_id" uuid PRIMARY KEY NOT NULL,
	"archived_at" timestamp with time zone,
	"actor_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sentence_global_visibility_version" CHECK ("sentence_global_visibility"."version">0)
);
--> statement-breakpoint
CREATE TABLE "sentence_library_receipts" (
	"actor_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"affected_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sentence_library_receipts_actor_id_operation_id_pk" PRIMARY KEY("actor_id","operation_id"),
	CONSTRAINT "sentence_library_receipts_count" CHECK ("sentence_library_receipts"."affected_count">=0)
);
--> statement-breakpoint
CREATE TABLE "sentence_library_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"scope" text NOT NULL,
	"items" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentence_personal_visibility" (
	"learner_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"actor_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sentence_personal_visibility_learner_id_exercise_id_pk" PRIMARY KEY("learner_id","exercise_id"),
	CONSTRAINT "sentence_personal_visibility_version" CHECK ("sentence_personal_visibility"."version">0)
);
--> statement-breakpoint
CREATE TABLE "sentence_preparation_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"preparation_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"entries" jsonb NOT NULL,
	"manifest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "sentence_preparation_batches_order_unique" UNIQUE("preparation_id","ordinal"),
	CONSTRAINT "sentence_preparation_batches_bound" CHECK (jsonb_array_length("sentence_preparation_batches"."entries") between 1 and 100 and jsonb_array_length("sentence_preparation_batches"."manifest")<=100)
);
--> statement-breakpoint
CREATE TABLE "sentence_preparation_children" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"preparation_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentence_preparation_commands" (
	"learner_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"preparation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sentence_preparation_commands_learner_id_operation_id_pk" PRIMARY KEY("learner_id","operation_id")
);
--> statement-breakpoint
CREATE TABLE "sentence_preparations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"authority" jsonb NOT NULL,
	"direction" text NOT NULL,
	"mode" text NOT NULL,
	"source_language" text NOT NULL,
	"target_language" text NOT NULL,
	"state" text NOT NULL,
	"pause_reason" text,
	"active_job_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sentence_preparations_operation_unique" UNIQUE("learner_id","operation_id"),
	CONSTRAINT "sentence_preparations_state" CHECK ("sentence_preparations"."state" in ('queued','running','stopping','paused','completed','failed'))
);
--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" DROP CONSTRAINT "sentence_ai_jobs_kind_format";--> statement-breakpoint
ALTER TABLE "sentence_global_visibility" ADD CONSTRAINT "sentence_global_visibility_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_global_visibility" ADD CONSTRAINT "sentence_global_visibility_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_library_receipts" ADD CONSTRAINT "sentence_library_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_library_receipts" ADD CONSTRAINT "sentence_library_receipts_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_library_receipts" ADD CONSTRAINT "sentence_library_receipts_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_library_snapshots" ADD CONSTRAINT "sentence_library_snapshots_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_library_snapshots" ADD CONSTRAINT "sentence_library_snapshots_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_library_snapshots" ADD CONSTRAINT "sentence_library_snapshots_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_personal_visibility" ADD CONSTRAINT "sentence_personal_visibility_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_personal_visibility" ADD CONSTRAINT "sentence_personal_visibility_exercise_id_sentence_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."sentence_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_personal_visibility" ADD CONSTRAINT "sentence_personal_visibility_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_batches" ADD CONSTRAINT "sentence_preparation_batches_preparation_id_sentence_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."sentence_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_children" ADD CONSTRAINT "sentence_preparation_children_job_id_sentence_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sentence_ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_children" ADD CONSTRAINT "sentence_preparation_children_preparation_id_sentence_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."sentence_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_children" ADD CONSTRAINT "sentence_preparation_children_batch_id_sentence_preparation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."sentence_preparation_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_commands" ADD CONSTRAINT "sentence_preparation_commands_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparation_commands" ADD CONSTRAINT "sentence_preparation_commands_preparation_id_sentence_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."sentence_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparations" ADD CONSTRAINT "sentence_preparations_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparations" ADD CONSTRAINT "sentence_preparations_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_preparations" ADD CONSTRAINT "sentence_preparations_active_job_id_sentence_ai_jobs_id_fk" FOREIGN KEY ("active_job_id") REFERENCES "public"."sentence_ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sentence_library_snapshots_expiry_idx" ON "sentence_library_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sentence_personal_visibility_exercise_idx" ON "sentence_personal_visibility" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "sentence_preparation_children_preparation_idx" ON "sentence_preparation_children" USING btree ("preparation_id");--> statement-breakpoint
CREATE INDEX "sentence_preparation_children_batch_idx" ON "sentence_preparation_children" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "sentence_preparations_queue_idx" ON "sentence_preparations" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "sentence_preparations_dictionary_idx" ON "sentence_preparations" USING btree ("dictionary_id");--> statement-breakpoint
ALTER TABLE "sentence_ai_jobs" ADD CONSTRAINT "sentence_ai_jobs_kind_format" CHECK ((("sentence_ai_jobs"."job_kind"='sentence-generation' and (("sentence_ai_jobs"."format" in ('sentence-generation:v1','sentence-preparation:v1') and "sentence_ai_jobs"."input_payload"->>'generationPolicyVersion'='1') or ("sentence_ai_jobs"."format" in ('sentence-generation:v2','sentence-preparation:v2') and "sentence_ai_jobs"."input_payload"->>'generationPolicyVersion'='2'))) or ("sentence_ai_jobs"."job_kind"='sentence-check' and "sentence_ai_jobs"."format"='sentence-check:v1')) is true);