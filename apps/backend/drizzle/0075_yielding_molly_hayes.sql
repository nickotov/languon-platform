CREATE TABLE "knowledge_shares" (
	"note_id" uuid PRIMARY KEY NOT NULL,
	"locator" text NOT NULL,
	"key_digest" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_shares_locator_unique" UNIQUE("locator"),
	CONSTRAINT "knowledge_shares_version_positive" CHECK ("knowledge_shares"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_working_branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"note_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"base_published_version" integer DEFAULT 0 NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_working_branches_version_positive" CHECK ("knowledge_working_branches"."version" > 0),
	CONSTRAINT "knowledge_working_branches_base_nonnegative" CHECK ("knowledge_working_branches"."base_published_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge_notes" DROP CONSTRAINT "knowledge_notes_version_positive";--> statement-breakpoint
ALTER TABLE "knowledge_notes" DROP CONSTRAINT "knowledge_notes_title_length";--> statement-breakpoint
ALTER TABLE "knowledge_notes" DROP CONSTRAINT "knowledge_notes_summary_length";--> statement-breakpoint
ALTER TABLE "knowledge_notes" DROP CONSTRAINT "knowledge_notes_categories";--> statement-breakpoint
ALTER TABLE "knowledge_notes" ALTER COLUMN "studied_language" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_notes" ALTER COLUMN "explanation_language" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD COLUMN "status" text DEFAULT 'saved' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD COLUMN "preferred_branch_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD COLUMN "auto_title_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "editor_target" jsonb;--> statement-breakpoint
ALTER TABLE "conversation_chats" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "knowledge_shares" ADD CONSTRAINT "knowledge_shares_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_working_branches" ADD CONSTRAINT "knowledge_working_branches_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_working_branches_note_idx" ON "knowledge_working_branches" USING btree ("note_id","updated_at");--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_version_nonnegative" CHECK ("knowledge_notes"."version" >= 0);--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_status" CHECK ("knowledge_notes"."status" in ('draft','saved'));--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_status_version" CHECK (("knowledge_notes"."status" = 'draft' and "knowledge_notes"."version" = 0) or ("knowledge_notes"."status" = 'saved' and "knowledge_notes"."version" > 0));--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_title_length" CHECK (("knowledge_notes"."status" = 'draft' and char_length("knowledge_notes"."title") between 0 and 200) or ("knowledge_notes"."status" = 'saved' and char_length("knowledge_notes"."title") between 1 and 200));--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_summary_length" CHECK (char_length("knowledge_notes"."summary") between 0 and 1000);--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_categories" CHECK (cardinality("knowledge_notes"."categories") between 0 and 7 and "knowledge_notes"."categories" <@ ARRAY['grammar','vocabulary','usage','pronunciation','etymology','culture','learning-tips']::text[]);