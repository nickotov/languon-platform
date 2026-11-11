CREATE TABLE "conversation_dictionary_snippets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"title" text NOT NULL,
	"cards" jsonb NOT NULL,
	"generation_context" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_dictionary_snippets_title" CHECK (char_length("conversation_dictionary_snippets"."title") between 1 and 200),
	CONSTRAINT "conversation_dictionary_snippets_cards" CHECK (jsonb_typeof("conversation_dictionary_snippets"."cards") = 'array' and jsonb_array_length("conversation_dictionary_snippets"."cards") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "dictionary_chat_snippet_applications" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"snippet_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_dictionary_snippets" ADD CONSTRAINT "conversation_dictionary_snippets_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_dictionary_snippets" ADD CONSTRAINT "conversation_dictionary_snippets_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_dictionary_snippets" ADD CONSTRAINT "conversation_dictionary_snippets_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_chat_snippet_applications" ADD CONSTRAINT "dictionary_chat_snippet_applications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_chat_snippet_applications" ADD CONSTRAINT "dictionary_chat_snippet_applications_snippet_id_conversation_dictionary_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."conversation_dictionary_snippets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_dictionary_snippets_chat_created_idx" ON "conversation_dictionary_snippets" USING btree ("conversation_id","created_at");