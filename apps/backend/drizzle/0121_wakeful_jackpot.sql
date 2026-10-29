CREATE TABLE "knowledge_speech_recordings" (
	"recording_id" uuid PRIMARY KEY NOT NULL,
	"note_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_speech_recordings" ADD CONSTRAINT "knowledge_speech_recordings_recording_id_speech_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."speech_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_speech_recordings" ADD CONSTRAINT "knowledge_speech_recordings_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_speech_recordings_note_idx" ON "knowledge_speech_recordings" USING btree ("note_id");