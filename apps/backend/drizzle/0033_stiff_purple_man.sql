CREATE TABLE "dictionary_deletion_receipts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result_payload" jsonb NOT NULL,
	"target_kind" text NOT NULL,
	CONSTRAINT "dictionary_deletion_receipts_key_length" CHECK (char_length("dictionary_deletion_receipts"."idempotency_key") between 16 and 128),
	CONSTRAINT "dictionary_deletion_receipts_fingerprint_format" CHECK (char_length("dictionary_deletion_receipts"."request_fingerprint") between 58 and 64 and "dictionary_deletion_receipts"."request_fingerprint" ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "dictionary_deletion_receipts_target_kind" CHECK ("dictionary_deletion_receipts"."target_kind" in ('dictionary', 'card')),
	CONSTRAINT "dictionary_deletion_receipts_result" CHECK (jsonb_typeof("dictionary_deletion_receipts"."result_payload") = 'object' and octet_length("dictionary_deletion_receipts"."result_payload"::text) <= 1024)
);
--> statement-breakpoint
CREATE TABLE "dictionary_generation_provider_usage_archive" (
	"actual_cost_micros" integer NOT NULL,
	"actual_input_tokens" integer NOT NULL,
	"actual_output_tokens" integer NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"input_cost_micros_per_million_tokens" integer NOT NULL,
	"max_cost_micros_per_attempt" integer NOT NULL,
	"max_input_tokens_per_attempt" integer NOT NULL,
	"max_output_tokens_per_attempt" integer NOT NULL,
	"output_cost_micros_per_million_tokens" integer NOT NULL,
	"owner_id" uuid NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dictionary_generation_provider_usage_archive_nonnegative" CHECK ("dictionary_generation_provider_usage_archive"."actual_cost_micros" >= 0 and "dictionary_generation_provider_usage_archive"."actual_input_tokens" >= 0 and "dictionary_generation_provider_usage_archive"."actual_output_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dictionary_idempotency_keys" DROP CONSTRAINT "dictionary_idempotency_keys_state_result";--> statement-breakpoint
ALTER TABLE "dictionary_deletion_receipts" ADD CONSTRAINT "dictionary_deletion_receipts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_provider_usage_archive" ADD CONSTRAINT "dictionary_generation_provider_usage_archive_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_deletion_receipts_owner_kind_key_unique" ON "dictionary_deletion_receipts" USING btree ("owner_id","target_kind","idempotency_key");--> statement-breakpoint
CREATE INDEX "dictionary_deletion_receipts_expiry_idx" ON "dictionary_deletion_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "dictionary_generation_provider_usage_archive_budget_idx" ON "dictionary_generation_provider_usage_archive" USING btree ("settled_at","owner_id");--> statement-breakpoint
ALTER TABLE "dictionary_idempotency_keys" ADD CONSTRAINT "dictionary_idempotency_keys_state_result" CHECK (("dictionary_idempotency_keys"."state" = 'in_progress' and "dictionary_idempotency_keys"."completed_at" is null and "dictionary_idempotency_keys"."result_dictionary_id" is null and "dictionary_idempotency_keys"."result_payload" is null) or ("dictionary_idempotency_keys"."state" = 'completed' and "dictionary_idempotency_keys"."completed_at" is not null and (("dictionary_idempotency_keys"."result_dictionary_id" is null and "dictionary_idempotency_keys"."result_payload" is null) or ("dictionary_idempotency_keys"."result_dictionary_id" is not null and (("dictionary_idempotency_keys"."operation" in ('create', 'fork') and "dictionary_idempotency_keys"."result_payload" is null) or ("dictionary_idempotency_keys"."operation" = 'bulk_commit' and "dictionary_idempotency_keys"."result_payload" is not null and jsonb_typeof("dictionary_idempotency_keys"."result_payload") = 'object' and jsonb_typeof("dictionary_idempotency_keys"."result_payload"->'dictionary') = 'object' and octet_length("dictionary_idempotency_keys"."result_payload"::text) <= 4194304 and (("dictionary_idempotency_keys"."result_payload"->>'mode' = 'deterministic' and jsonb_typeof("dictionary_idempotency_keys"."result_payload"->'cards') = 'array' and jsonb_typeof("dictionary_idempotency_keys"."result_payload"->'warnings') = 'array') or ("dictionary_idempotency_keys"."result_payload"->>'mode' = 'ai' and jsonb_typeof("dictionary_idempotency_keys"."result_payload"->'job') = 'object'))))))));