CREATE TABLE "conversation_listening_allowances" (
	"root_turn_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"remaining_credits" bigint NOT NULL,
	"remaining_provider_micros" bigint NOT NULL,
	CONSTRAINT "conversation_listening_allowance_nonnegative" CHECK ("conversation_listening_allowances"."remaining_credits" >= 0 and "conversation_listening_allowances"."remaining_provider_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "conversation_listening_allowances" ADD CONSTRAINT "conversation_listening_allowances_root_turn_id_conversation_turns_id_fk" FOREIGN KEY ("root_turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;