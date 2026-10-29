CREATE TABLE "conversation_block_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"base_branch_version" integer NOT NULL,
	"blocks" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_branch_version" integer,
	CONSTRAINT "conversation_block_proposals_turn_id_unique" UNIQUE("turn_id"),
	CONSTRAINT "conversation_block_proposals_version" CHECK ("conversation_block_proposals"."base_branch_version">0 and ("conversation_block_proposals"."applied_branch_version" is null or "conversation_block_proposals"."applied_branch_version">"conversation_block_proposals"."base_branch_version")),
	CONSTRAINT "conversation_block_proposals_applied" CHECK (("conversation_block_proposals"."applied_at" is null) = ("conversation_block_proposals"."applied_branch_version" is null))
);
--> statement-breakpoint
ALTER TABLE "conversation_block_proposals" ADD CONSTRAINT "conversation_block_proposals_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_block_proposals" ADD CONSTRAINT "conversation_block_proposals_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_block_proposals" ADD CONSTRAINT "conversation_block_proposals_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_block_proposals" ADD CONSTRAINT "conversation_block_proposals_branch_id_knowledge_working_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."knowledge_working_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_block_proposals_conversation_idx" ON "conversation_block_proposals" USING btree ("conversation_id","created_at");