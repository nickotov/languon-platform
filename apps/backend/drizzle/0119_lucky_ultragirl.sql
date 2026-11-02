CREATE TABLE "knowledge_learner_attempts" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"exercise_revision" text NOT NULL,
	"note_version" integer NOT NULL,
	"result" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_learner_attempts_actor_id_id_pk" PRIMARY KEY("actor_id","id"),
	CONSTRAINT "knowledge_learner_attempt_version" CHECK ("knowledge_learner_attempts"."note_version">0),
	CONSTRAINT "knowledge_learner_attempt_revision" CHECK ("knowledge_learner_attempts"."exercise_revision" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "knowledge_learner_completion_receipts" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb,
	"fingerprint" text NOT NULL,
	CONSTRAINT "knowledge_learner_completion_receipts_actor_id_id_pk" PRIMARY KEY("actor_id","id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_learner_completion" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "knowledge_learner_completion_actor_id_note_id_pk" PRIMARY KEY("actor_id","note_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_learner_events" (
	"actor_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_learner_events_actor_id_id_pk" PRIMARY KEY("actor_id","id")
);
--> statement-breakpoint
ALTER TABLE "knowledge_learner_attempts" ADD CONSTRAINT "knowledge_learner_attempts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_learner_attempts" ADD CONSTRAINT "knowledge_learner_attempts_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_learner_completion_receipts" ADD CONSTRAINT "knowledge_learner_completion_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_learner_completion_receipts" ADD CONSTRAINT "knowledge_learner_completion_receipts_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_learner_completion" ADD CONSTRAINT "knowledge_learner_completion_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_learner_completion" ADD CONSTRAINT "knowledge_learner_completion_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_learner_events" ADD CONSTRAINT "knowledge_learner_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_learner_events" ADD CONSTRAINT "knowledge_learner_events_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_learner_attempts_note_actor_idx" ON "knowledge_learner_attempts" USING btree ("note_id","actor_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_learner_events_note_actor_idx" ON "knowledge_learner_events" USING btree ("note_id","actor_id","created_at");