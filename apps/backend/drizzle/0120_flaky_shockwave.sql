CREATE TABLE "knowledge_media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"note_id" uuid NOT NULL,
	"blob_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_media_blobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"checksum" text NOT NULL,
	"duration_ms" integer NOT NULL,
	CONSTRAINT "knowledge_media_blob_size" CHECK (octet_length("knowledge_media_blobs"."bytes") between 1 and 5242880),
	CONSTRAINT "knowledge_media_blob_duration" CHECK ("knowledge_media_blobs"."duration_ms" between 1 and 1800000),
	CONSTRAINT "knowledge_media_blob_type" CHECK ("knowledge_media_blobs"."mime_type" in ('audio/wav','audio/mpeg'))
);
--> statement-breakpoint
ALTER TABLE "knowledge_media_assets" ADD CONSTRAINT "knowledge_media_assets_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_media_assets" ADD CONSTRAINT "knowledge_media_assets_blob_id_knowledge_media_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."knowledge_media_blobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_media_assets_note_idx" ON "knowledge_media_assets" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "knowledge_media_assets_blob_idx" ON "knowledge_media_assets" USING btree ("blob_id");