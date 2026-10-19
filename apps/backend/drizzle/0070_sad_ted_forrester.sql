CREATE TABLE "knowledge_note_revisions" (
	"note_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_note_revisions_note_id_version_pk" PRIMARY KEY("note_id","version"),
	CONSTRAINT "knowledge_revisions_version_positive" CHECK ("knowledge_note_revisions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" jsonb NOT NULL,
	"categories" text[] NOT NULL,
	"studied_language" text NOT NULL,
	"explanation_language" text NOT NULL,
	"plain_text" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_notes_version_positive" CHECK ("knowledge_notes"."version" > 0),
	CONSTRAINT "knowledge_notes_title_length" CHECK (char_length("knowledge_notes"."title") between 1 and 200),
	CONSTRAINT "knowledge_notes_summary_length" CHECK (char_length("knowledge_notes"."summary") between 1 and 1000),
	CONSTRAINT "knowledge_notes_categories" CHECK (cardinality("knowledge_notes"."categories") between 1 and 7 and "knowledge_notes"."categories" <@ ARRAY['grammar','vocabulary','usage','pronunciation','etymology','culture','learning-tips']::text[]),
	CONSTRAINT "knowledge_notes_body_version" CHECK ("knowledge_notes"."body"->>'schemaVersion' = '1')
);
--> statement-breakpoint
CREATE TABLE "knowledge_operation_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"fingerprint" text NOT NULL,
	"note_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_receipts_operation_kind" CHECK ("knowledge_operation_receipts"."operation" in ('create','update','restore','delete')),
	CONSTRAINT "knowledge_receipts_version_positive" CHECK ("knowledge_operation_receipts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "conversation_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"target_note_id" uuid,
	"expected_note_version" integer,
	"content" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"publication_operation_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_memory" (
	"conversation_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb NOT NULL,
	"model_content" jsonb,
	"status" text NOT NULL,
	"source_version" text NOT NULL,
	"source_provenance" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_message_role_check" CHECK ("conversation_messages"."role" in ('user','assistant'))
);
--> statement-breakpoint
CREATE TABLE "conversation_settings" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"preferences" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"authority" jsonb NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"execution" jsonb NOT NULL,
	"failure_code" text,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"provider_dispatched" boolean DEFAULT false NOT NULL,
	"usage" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_turn_status_check" CHECK ("conversation_turns"."status" in ('queued','running','succeeded','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "conversation_chats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source" jsonb NOT NULL,
	"preferences" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_source_kind_check" CHECK ("conversation_chats"."source_kind" in ('dictionary','text','knowledge'))
);
--> statement-breakpoint
CREATE TABLE "conversation_provider_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"turn_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"purpose" text NOT NULL,
	"reservation_id" uuid NOT NULL,
	"state" text NOT NULL,
	"reserved_cost_micros" integer NOT NULL,
	"reserved_input_tokens" integer NOT NULL,
	"reserved_output_tokens" integer NOT NULL,
	"actual_cost_micros" integer DEFAULT 0 NOT NULL,
	"actual_input_tokens" integer DEFAULT 0 NOT NULL,
	"actual_output_tokens" integer DEFAULT 0 NOT NULL,
	"input_cost_micros_per_million_tokens" integer NOT NULL,
	"output_cost_micros_per_million_tokens" integer NOT NULL,
	"max_cost_micros_per_attempt" integer NOT NULL,
	"max_input_tokens_per_attempt" integer NOT NULL,
	"max_output_tokens_per_attempt" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "conversation_call_state_check" CHECK ("conversation_provider_calls"."state" in ('reserved','dispatched','settled')),
	CONSTRAINT "conversation_call_purpose_check" CHECK ("conversation_provider_calls"."purpose" in ('actor','observer','reflector')),
	CONSTRAINT "conversation_call_ordinal_check" CHECK ("conversation_provider_calls"."ordinal" between 1 and 5),
	CONSTRAINT "conversation_call_settlement_check" CHECK (("conversation_provider_calls"."state" = 'settled') = ("conversation_provider_calls"."settled_at" is not null)),
	CONSTRAINT "conversation_call_amounts_check" CHECK ("conversation_provider_calls"."reserved_cost_micros" >= 0 and "conversation_provider_calls"."reserved_input_tokens" >= 0 and "conversation_provider_calls"."reserved_output_tokens" >= 0 and "conversation_provider_calls"."actual_cost_micros" >= 0 and "conversation_provider_calls"."actual_input_tokens" >= 0 and "conversation_provider_calls"."actual_output_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge_note_revisions" ADD CONSTRAINT "knowledge_note_revisions_note_id_knowledge_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."knowledge_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_operation_receipts" ADD CONSTRAINT "knowledge_operation_receipts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_drafts" ADD CONSTRAINT "conversation_drafts_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memory" ADD CONSTRAINT "conversation_memory_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_settings" ADD CONSTRAINT "conversation_settings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversation_chats_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_chats" ADD CONSTRAINT "conversation_chats_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_notes_owner_updated_idx" ON "knowledge_notes" USING btree ("owner_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "knowledge_notes_owner_language_idx" ON "knowledge_notes" USING btree ("owner_id","studied_language");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_receipts_owner_operation_key" ON "knowledge_operation_receipts" USING btree ("owner_id","operation_id");--> statement-breakpoint
CREATE INDEX "knowledge_receipts_owner_idx" ON "knowledge_operation_receipts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "conversation_draft_idx" ON "conversation_drafts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_event_replay_idx" ON "conversation_events" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "conversation_event_expiry_idx" ON "conversation_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_memory_key_unique" ON "conversation_memory" USING btree ("conversation_id","key");--> statement-breakpoint
CREATE INDEX "conversation_history_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_turn_role_unique" ON "conversation_messages" USING btree ("turn_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_request_unique" ON "conversation_turns" USING btree ("conversation_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_one_active_turn" ON "conversation_turns" USING btree ("conversation_id") WHERE "conversation_turns"."status" in ('queued','running');--> statement-breakpoint
CREATE INDEX "conversation_queue_idx" ON "conversation_turns" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "conversation_source_idx" ON "conversation_chats" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "conversation_owner_source_idx" ON "conversation_chats" USING btree ("owner_id","source_kind","source_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_call_ordinal_unique" ON "conversation_provider_calls" USING btree ("turn_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_call_reservation_unique" ON "conversation_provider_calls" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "conversation_call_state_idx" ON "conversation_provider_calls" USING btree ("state","settled_at");--> statement-breakpoint
CREATE INDEX "conversation_call_owner_idx" ON "conversation_provider_calls" USING btree ("owner_id");