CREATE TABLE "knowledge_learning_epochs" (
	"note_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"block_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"epoch" integer NOT NULL,
	"semantic_fingerprint" text NOT NULL,
	"active" boolean NOT NULL,
	"last_published_version" integer NOT NULL,
	CONSTRAINT "knowledge_learning_epochs_note_id_kind_block_id_item_id_pk" PRIMARY KEY("note_id","kind","block_id","item_id"),
	CONSTRAINT "knowledge_learning_epochs_kind" CHECK ("knowledge_learning_epochs"."kind" in ('exercise','vocabulary')),
	CONSTRAINT "knowledge_learning_epochs_epoch_positive" CHECK ("knowledge_learning_epochs"."epoch" > 0),
	CONSTRAINT "knowledge_learning_epochs_published_positive" CHECK ("knowledge_learning_epochs"."last_published_version" > 0),
	CONSTRAINT "knowledge_learning_epochs_fingerprint" CHECK ("knowledge_learning_epochs"."semantic_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "knowledge_learning_epochs" ADD CONSTRAINT "knowledge_learning_epochs_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_learning_epochs_active_note_idx" ON "knowledge_learning_epochs" USING btree ("note_id") WHERE "knowledge_learning_epochs"."active";