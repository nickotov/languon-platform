CREATE TYPE "public"."dictionary_card_authorship" AS ENUM('human', 'ai-generated', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."dictionary_card_mutation_kind" AS ENUM('manual_create', 'manual_edit', 'deterministic_import', 'ai_create', 'ai_proposal_accept', 'fork');--> statement-breakpoint
CREATE TYPE "public"."dictionary_enablement" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."dictionary_idempotency_operation" AS ENUM('create', 'fork', 'bulk_commit');--> statement-breakpoint
CREATE TYPE "public"."dictionary_idempotency_state" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."dictionary_language_role" AS ENUM('source', 'target');--> statement-breakpoint
CREATE TYPE "public"."dictionary_lifecycle" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."dictionary_transcription_notation" AS ENUM('ipa', 'romanization', 'custom');--> statement-breakpoint
CREATE TYPE "public"."dictionary_visibility" AS ENUM('private', 'unlisted');--> statement-breakpoint
CREATE TABLE "dictionaries" (
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"lifecycle" "dictionary_lifecycle" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"share_key_digest" text,
	"share_key_rotated_at" timestamp with time zone,
	"share_key_version" integer,
	"share_locator" text,
	"source_dictionary_id" uuid,
	"source_language_tag" text NOT NULL,
	"target_language_tag" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"visibility" "dictionary_visibility" DEFAULT 'private' NOT NULL,
	CONSTRAINT "dictionaries_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "dictionaries_name_length" CHECK ("dictionaries"."name" = btrim("dictionaries"."name") and char_length("dictionaries"."name") between 1 and 120),
	CONSTRAINT "dictionaries_description_length" CHECK ("dictionaries"."description" is null or ("dictionaries"."description" = btrim("dictionaries"."description") and char_length("dictionaries"."description") between 1 and 2000)),
	CONSTRAINT "dictionaries_language_tags_bounded" CHECK (char_length("dictionaries"."source_language_tag") between 2 and 35 and char_length("dictionaries"."target_language_tag") between 2 and 35 and "dictionaries"."source_language_tag" !~ '\s' and "dictionaries"."target_language_tag" !~ '\s'),
	CONSTRAINT "dictionaries_language_pair_distinct" CHECK ("dictionaries"."source_language_tag" <> "dictionaries"."target_language_tag"),
	CONSTRAINT "dictionaries_version_positive" CHECK ("dictionaries"."version" > 0),
	CONSTRAINT "dictionaries_archive_state" CHECK (("dictionaries"."lifecycle" = 'archived') = ("dictionaries"."archived_at" is not null) and ("dictionaries"."archived_at" is null or "dictionaries"."archived_at" >= "dictionaries"."created_at") and ("dictionaries"."lifecycle" = 'active' or "dictionaries"."visibility" = 'private')),
	CONSTRAINT "dictionaries_share_state" CHECK (("dictionaries"."visibility" = 'private' and "dictionaries"."share_locator" is null and "dictionaries"."share_key_digest" is null and "dictionaries"."share_key_version" is null and "dictionaries"."share_key_rotated_at" is null) or ("dictionaries"."visibility" = 'unlisted' and "dictionaries"."lifecycle" = 'active' and "dictionaries"."share_locator" is not null and "dictionaries"."share_key_digest" is not null and "dictionaries"."share_key_version" > 0 and "dictionaries"."share_key_rotated_at" is not null)),
	CONSTRAINT "dictionaries_share_locator_format" CHECK ("dictionaries"."share_locator" is null or (char_length("dictionaries"."share_locator") between 22 and 64 and "dictionaries"."share_locator" ~ '^[A-Za-z0-9_-]+$')),
	CONSTRAINT "dictionaries_share_digest_format" CHECK ("dictionaries"."share_key_digest" is null or (char_length("dictionaries"."share_key_digest") between 58 and 64 and "dictionaries"."share_key_digest" ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$')),
	CONSTRAINT "dictionaries_source_not_self" CHECK ("dictionaries"."source_dictionary_id" is null or "dictionaries"."source_dictionary_id" <> "dictionaries"."id"),
	CONSTRAINT "dictionaries_timestamps_ordered" CHECK ("dictionaries"."updated_at" >= "dictionaries"."created_at" and ("dictionaries"."share_key_rotated_at" is null or "dictionaries"."share_key_rotated_at" >= "dictionaries"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "dictionary_card_revisions" (
	"accepted_generation_job_id" uuid,
	"actor_user_id" uuid,
	"authorship" "dictionary_card_authorship" NOT NULL,
	"card_id" uuid NOT NULL,
	"card_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"mutation_kind" "dictionary_card_mutation_kind" NOT NULL,
	"revision_number" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"settings_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "dictionary_card_revisions_card_revision_unique" UNIQUE("card_id","revision_number"),
	CONSTRAINT "dictionary_card_revisions_card_version_unique" UNIQUE("card_id","card_version"),
	CONSTRAINT "dictionary_card_revisions_positive_versions" CHECK ("dictionary_card_revisions"."revision_number" > 0 and "dictionary_card_revisions"."card_version" > 0 and "dictionary_card_revisions"."settings_version" > 0 and "dictionary_card_revisions"."schema_version" = 1)
);
--> statement-breakpoint
CREATE TABLE "dictionary_cards" (
	"archived_at" timestamp with time zone,
	"authorship" "dictionary_card_authorship" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"custom_notation_label_override" text,
	"definition" text,
	"definition_enabled_override" "dictionary_enablement",
	"definition_language_role_override" "dictionary_language_role",
	"dictionary_id" uuid NOT NULL,
	"example" text,
	"example_enabled_override" "dictionary_enablement",
	"example_language_role_override" "dictionary_language_role",
	"example_translation" text,
	"example_translation_enabled_override" "dictionary_enablement",
	"id" uuid PRIMARY KEY NOT NULL,
	"lifecycle" "dictionary_lifecycle" DEFAULT 'active' NOT NULL,
	"normalized_source" text NOT NULL,
	"sort_key" bigint NOT NULL,
	"source" text NOT NULL,
	"transcription" text,
	"transcription_enabled_override" "dictionary_enablement",
	"transcription_notation_override" "dictionary_transcription_notation",
	"translation" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "dictionary_cards_id_dictionary_unique" UNIQUE("id","dictionary_id"),
	CONSTRAINT "dictionary_cards_required_values_length" CHECK ("dictionary_cards"."source" = btrim("dictionary_cards"."source") and char_length("dictionary_cards"."source") between 1 and 200 and "dictionary_cards"."translation" = btrim("dictionary_cards"."translation") and char_length("dictionary_cards"."translation") between 1 and 200),
	CONSTRAINT "dictionary_cards_normalized_source_length" CHECK ("dictionary_cards"."normalized_source" = btrim("dictionary_cards"."normalized_source") and char_length("dictionary_cards"."normalized_source") between 1 and 200),
	CONSTRAINT "dictionary_cards_short_optional_values_length" CHECK (("dictionary_cards"."transcription" is null or char_length("dictionary_cards"."transcription") between 1 and 200) and ("dictionary_cards"."custom_notation_label_override" is null or ("dictionary_cards"."custom_notation_label_override" = btrim("dictionary_cards"."custom_notation_label_override") and char_length("dictionary_cards"."custom_notation_label_override") between 1 and 40))),
	CONSTRAINT "dictionary_cards_long_optional_values_length" CHECK (("dictionary_cards"."definition" is null or char_length("dictionary_cards"."definition") between 1 and 2000) and ("dictionary_cards"."example" is null or char_length("dictionary_cards"."example") between 1 and 2000) and ("dictionary_cards"."example_translation" is null or char_length("dictionary_cards"."example_translation") between 1 and 2000)),
	CONSTRAINT "dictionary_cards_sort_key_positive" CHECK ("dictionary_cards"."sort_key" > 0),
	CONSTRAINT "dictionary_cards_version_positive" CHECK ("dictionary_cards"."version" > 0),
	CONSTRAINT "dictionary_cards_archive_state" CHECK (("dictionary_cards"."lifecycle" = 'archived') = ("dictionary_cards"."archived_at" is not null) and ("dictionary_cards"."archived_at" is null or "dictionary_cards"."archived_at" >= "dictionary_cards"."created_at")),
	CONSTRAINT "dictionary_cards_timestamps_ordered" CHECK ("dictionary_cards"."updated_at" >= "dictionary_cards"."created_at")
);
--> statement-breakpoint
CREATE TABLE "dictionary_idempotency_keys" (
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" "dictionary_idempotency_operation" NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result_dictionary_id" uuid,
	"state" "dictionary_idempotency_state" DEFAULT 'in_progress' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_idempotency_keys_key_length" CHECK (char_length("dictionary_idempotency_keys"."idempotency_key") between 16 and 128),
	CONSTRAINT "dictionary_idempotency_keys_fingerprint_format" CHECK (char_length("dictionary_idempotency_keys"."request_fingerprint") between 58 and 64 and "dictionary_idempotency_keys"."request_fingerprint" ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "dictionary_idempotency_keys_state_result" CHECK (("dictionary_idempotency_keys"."state" = 'in_progress' and "dictionary_idempotency_keys"."completed_at" is null and "dictionary_idempotency_keys"."result_dictionary_id" is null) or ("dictionary_idempotency_keys"."state" = 'completed' and "dictionary_idempotency_keys"."completed_at" is not null and "dictionary_idempotency_keys"."result_dictionary_id" is not null)),
	CONSTRAINT "dictionary_idempotency_keys_timestamps_ordered" CHECK ("dictionary_idempotency_keys"."expires_at" > "dictionary_idempotency_keys"."created_at" and "dictionary_idempotency_keys"."updated_at" >= "dictionary_idempotency_keys"."created_at" and ("dictionary_idempotency_keys"."completed_at" is null or "dictionary_idempotency_keys"."completed_at" >= "dictionary_idempotency_keys"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "dictionary_settings" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"custom_notation_label" text,
	"definition_enabled" boolean DEFAULT false NOT NULL,
	"definition_language_role" "dictionary_language_role" DEFAULT 'source' NOT NULL,
	"dictionary_id" uuid PRIMARY KEY NOT NULL,
	"example_enabled" boolean DEFAULT true NOT NULL,
	"example_language_role" "dictionary_language_role" DEFAULT 'source' NOT NULL,
	"example_translation_enabled" boolean DEFAULT true NOT NULL,
	"transcription_enabled" boolean DEFAULT false NOT NULL,
	"transcription_notation" "dictionary_transcription_notation" DEFAULT 'ipa' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "dictionary_settings_custom_label_length" CHECK ("dictionary_settings"."custom_notation_label" is null or ("dictionary_settings"."custom_notation_label" = btrim("dictionary_settings"."custom_notation_label") and char_length("dictionary_settings"."custom_notation_label") between 1 and 40)),
	CONSTRAINT "dictionary_settings_custom_label_required" CHECK (not ("dictionary_settings"."transcription_enabled" = true and "dictionary_settings"."transcription_notation" = 'custom' and "dictionary_settings"."custom_notation_label" is null)),
	CONSTRAINT "dictionary_settings_version_positive" CHECK ("dictionary_settings"."version" > 0),
	CONSTRAINT "dictionary_settings_timestamps_ordered" CHECK ("dictionary_settings"."updated_at" >= "dictionary_settings"."created_at")
);
--> statement-breakpoint
ALTER TABLE "dictionaries" ADD CONSTRAINT "dictionaries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionaries" ADD CONSTRAINT "dictionaries_source_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("source_dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_card_revisions" ADD CONSTRAINT "dictionary_card_revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_card_revisions" ADD CONSTRAINT "dictionary_card_revisions_card_dictionary_fk" FOREIGN KEY ("card_id","dictionary_id") REFERENCES "public"."dictionary_cards"("id","dictionary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_cards" ADD CONSTRAINT "dictionary_cards_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_idempotency_keys" ADD CONSTRAINT "dictionary_idempotency_keys_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_idempotency_keys" ADD CONSTRAINT "dictionary_idempotency_keys_result_owner_fk" FOREIGN KEY ("result_dictionary_id","owner_id") REFERENCES "public"."dictionaries"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_settings" ADD CONSTRAINT "dictionary_settings_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dictionaries_share_locator_unique" ON "dictionaries" USING btree ("share_locator") WHERE "dictionaries"."share_locator" is not null;--> statement-breakpoint
CREATE INDEX "dictionaries_share_digest_idx" ON "dictionaries" USING btree ("share_key_digest") WHERE "dictionaries"."share_key_digest" is not null;--> statement-breakpoint
CREATE INDEX "dictionaries_owner_lifecycle_updated_idx" ON "dictionaries" USING btree ("owner_id","lifecycle","updated_at","id");--> statement-breakpoint
CREATE INDEX "dictionaries_source_dictionary_idx" ON "dictionaries" USING btree ("source_dictionary_id") WHERE "dictionaries"."source_dictionary_id" is not null;--> statement-breakpoint
CREATE INDEX "dictionary_card_revisions_dictionary_created_idx" ON "dictionary_card_revisions" USING btree ("dictionary_id","created_at","id");--> statement-breakpoint
CREATE INDEX "dictionary_card_revisions_generation_job_idx" ON "dictionary_card_revisions" USING btree ("accepted_generation_job_id") WHERE "dictionary_card_revisions"."accepted_generation_job_id" is not null;--> statement-breakpoint
CREATE INDEX "dictionary_cards_active_order_idx" ON "dictionary_cards" USING btree ("dictionary_id","sort_key","id") WHERE "dictionary_cards"."lifecycle" = 'active';--> statement-breakpoint
CREATE INDEX "dictionary_cards_lifecycle_order_idx" ON "dictionary_cards" USING btree ("dictionary_id","lifecycle","sort_key","id");--> statement-breakpoint
CREATE INDEX "dictionary_cards_normalized_source_idx" ON "dictionary_cards" USING btree ("dictionary_id","normalized_source","id");--> statement-breakpoint
CREATE INDEX "dictionary_cards_search_idx" ON "dictionary_cards" USING gin (to_tsvector('simple', coalesce("source", '') || ' ' || coalesce("translation", '') || ' ' || coalesce("definition", '') || ' ' || coalesce("example", '')));--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_idempotency_keys_owner_operation_key_unique" ON "dictionary_idempotency_keys" USING btree ("owner_id","operation","idempotency_key");--> statement-breakpoint
CREATE INDEX "dictionary_idempotency_keys_expiry_idx" ON "dictionary_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "dictionary_idempotency_keys_result_dictionary_idx" ON "dictionary_idempotency_keys" USING btree ("result_dictionary_id") WHERE "dictionary_idempotency_keys"."result_dictionary_id" is not null;