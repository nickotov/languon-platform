CREATE TABLE "knowledge_workbook_notes" (
	"note_id" uuid PRIMARY KEY NOT NULL,
	"workbook_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "knowledge_workbook_notes_position" CHECK ("knowledge_workbook_notes"."position" between 0 and 499)
);
--> statement-breakpoint
CREATE TABLE "knowledge_workbook_shares" (
	"workbook_id" uuid PRIMARY KEY NOT NULL,
	"locator" text NOT NULL,
	"key_digest" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_workbook_shares_locator_unique" UNIQUE("locator")
);
--> statement-breakpoint
CREATE TABLE "knowledge_workbooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_workbooks_version" CHECK ("knowledge_workbooks"."version">0),
	CONSTRAINT "knowledge_workbooks_title" CHECK (("knowledge_workbooks"."deleted_at" is not null and "knowledge_workbooks"."title"='') or ("knowledge_workbooks"."deleted_at" is null and char_length("knowledge_workbooks"."title") between 1 and 200))
);
--> statement-breakpoint
ALTER TABLE "knowledge_workbook_notes" ADD CONSTRAINT "knowledge_workbook_notes_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_workbook_notes" ADD CONSTRAINT "knowledge_workbook_notes_workbook_id_knowledge_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."knowledge_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_workbook_shares" ADD CONSTRAINT "knowledge_workbook_shares_workbook_id_knowledge_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."knowledge_workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_workbooks" ADD CONSTRAINT "knowledge_workbooks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_workbook_notes_order_idx" ON "knowledge_workbook_notes" USING btree ("workbook_id","position");--> statement-breakpoint
CREATE INDEX "knowledge_workbooks_owner_idx" ON "knowledge_workbooks" USING btree ("owner_id","updated_at");