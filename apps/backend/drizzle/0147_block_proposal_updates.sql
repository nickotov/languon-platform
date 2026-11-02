ALTER TABLE "conversation_block_proposals" ADD COLUMN "target_block_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_block_proposals" ADD COLUMN "target_snapshot" jsonb;