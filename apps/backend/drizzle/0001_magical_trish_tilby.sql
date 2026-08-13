CREATE TYPE "public"."auth_passkey_device_type" AS ENUM('single_device', 'multi_device');--> statement-breakpoint
CREATE TYPE "public"."auth_security_event_outcome" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."auth_session_method" AS ENUM('email_verification', 'password', 'passkey');--> statement-breakpoint
CREATE TYPE "public"."auth_verification_purpose" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TABLE "auth_passkeys" (
	"backed_up" boolean NOT NULL,
	"canonical_name" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_device_type" "auth_passkey_device_type" NOT NULL,
	"credential_id" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"last_used_at" timestamp with time zone,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_handle" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_passkeys_name_length" CHECK (char_length("auth_passkeys"."name") between 1 and 80),
	CONSTRAINT "auth_passkeys_canonical_name" CHECK ("auth_passkeys"."name" = btrim("auth_passkeys"."name") and char_length("auth_passkeys"."canonical_name") between 1 and 80),
	CONSTRAINT "auth_passkeys_credential_id_format" CHECK (char_length("auth_passkeys"."credential_id") between 16 and 2048 and "auth_passkeys"."credential_id" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "auth_passkeys_public_key_format" CHECK (char_length("auth_passkeys"."public_key") between 16 and 8192 and "auth_passkeys"."public_key" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "auth_passkeys_user_handle_format" CHECK (char_length("auth_passkeys"."user_handle") between 16 and 128 and "auth_passkeys"."user_handle" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "auth_passkeys_counter_nonnegative" CHECK ("auth_passkeys"."counter" >= 0),
	CONSTRAINT "auth_passkeys_transports_known" CHECK ("auth_passkeys"."transports" <@ array['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']::text[]),
	CONSTRAINT "auth_passkeys_timestamps_ordered" CHECK ("auth_passkeys"."updated_at" >= "auth_passkeys"."created_at" and ("auth_passkeys"."last_used_at" is null or "auth_passkeys"."last_used_at" >= "auth_passkeys"."created_at") and ("auth_passkeys"."revoked_at" is null or "auth_passkeys"."revoked_at" >= "auth_passkeys"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "auth_security_events" (
	"correlation_id" text NOT NULL,
	"error_category" text,
	"event_type" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '180 days' NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "auth_security_event_outcome" NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	CONSTRAINT "auth_security_events_event_type_format" CHECK (char_length("auth_security_events"."event_type") between 2 and 64 and "auth_security_events"."event_type" ~ '^[a-z][a-z0-9_.-]+$'),
	CONSTRAINT "auth_security_events_error_category_format" CHECK ("auth_security_events"."error_category" is null or (char_length("auth_security_events"."error_category") between 2 and 64 and "auth_security_events"."error_category" ~ '^[a-z][a-z0-9_.-]+$')),
	CONSTRAINT "auth_security_events_correlation_id_length" CHECK (char_length("auth_security_events"."correlation_id") between 1 and 128),
	CONSTRAINT "auth_security_events_metadata_bounded" CHECK (octet_length("auth_security_events"."metadata"::text) <= 4096),
	CONSTRAINT "auth_security_events_retention_window" CHECK ("auth_security_events"."expires_at" > "auth_security_events"."occurred_at")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"authentication_method" "auth_session_method" NOT NULL,
	"client_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"family_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"last_used_at" timestamp with time zone,
	"predecessor_session_id" uuid,
	"refresh_token_digest" text NOT NULL,
	"replay_detected_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"rotated_at" timestamp with time zone,
	"rotated_to_session_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_sessions_digest_format" CHECK (char_length("auth_sessions"."refresh_token_digest") = 43 and "auth_sessions"."refresh_token_digest" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "auth_sessions_time_window" CHECK ("auth_sessions"."absolute_expires_at" > "auth_sessions"."created_at" and "auth_sessions"."authenticated_at" <= "auth_sessions"."created_at" and "auth_sessions"."updated_at" >= "auth_sessions"."created_at" and ("auth_sessions"."last_used_at" is null or "auth_sessions"."last_used_at" >= "auth_sessions"."created_at") and ("auth_sessions"."rotated_at" is null or "auth_sessions"."rotated_at" >= "auth_sessions"."created_at") and ("auth_sessions"."revoked_at" is null or "auth_sessions"."revoked_at" >= "auth_sessions"."created_at") and ("auth_sessions"."replay_detected_at" is null or "auth_sessions"."replay_detected_at" >= "auth_sessions"."created_at")),
	CONSTRAINT "auth_sessions_rotation_state" CHECK (("auth_sessions"."rotated_at" is null) = ("auth_sessions"."rotated_to_session_id" is null) and ("auth_sessions"."predecessor_session_id" is null or "auth_sessions"."predecessor_session_id" <> "auth_sessions"."id") and ("auth_sessions"."rotated_to_session_id" is null or "auth_sessions"."rotated_to_session_id" <> "auth_sessions"."id")),
	CONSTRAINT "auth_sessions_revocation_state" CHECK (("auth_sessions"."revoked_at" is null) = ("auth_sessions"."revocation_reason" is null) and ("auth_sessions"."revocation_reason" is null or char_length("auth_sessions"."revocation_reason") between 1 and 64) and ("auth_sessions"."replay_detected_at" is null or "auth_sessions"."revoked_at" is not null)),
	CONSTRAINT "auth_sessions_client_label_length" CHECK ("auth_sessions"."client_label" is null or char_length("auth_sessions"."client_label") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "auth_verification_challenges" (
	"attempts" integer DEFAULT 0 NOT NULL,
	"code_digest" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"flow_id" uuid PRIMARY KEY NOT NULL,
	"invalidated_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"purpose" "auth_verification_purpose" NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_verification_challenges_digest_format" CHECK (char_length("auth_verification_challenges"."code_digest") = 43 and "auth_verification_challenges"."code_digest" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "auth_verification_challenges_attempts_bounded" CHECK ("auth_verification_challenges"."max_attempts" = 5 and "auth_verification_challenges"."attempts" between 0 and "auth_verification_challenges"."max_attempts"),
	CONSTRAINT "auth_verification_challenges_sends_bounded" CHECK ("auth_verification_challenges"."send_count" between 1 and 5),
	CONSTRAINT "auth_verification_challenges_time_window" CHECK ("auth_verification_challenges"."expires_at" > "auth_verification_challenges"."created_at" and "auth_verification_challenges"."last_sent_at" >= "auth_verification_challenges"."created_at" and "auth_verification_challenges"."last_sent_at" < "auth_verification_challenges"."expires_at" and "auth_verification_challenges"."updated_at" >= "auth_verification_challenges"."created_at"),
	CONSTRAINT "auth_verification_challenges_terminal_state" CHECK (not ("auth_verification_challenges"."consumed_at" is not null and "auth_verification_challenges"."invalidated_at" is not null) and ("auth_verification_challenges"."consumed_at" is null or "auth_verification_challenges"."consumed_at" >= "auth_verification_challenges"."created_at") and ("auth_verification_challenges"."invalidated_at" is null or "auth_verification_challenges"."invalidated_at" >= "auth_verification_challenges"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "password_credentials" (
	"algorithm" text DEFAULT 'argon2id' NOT NULL,
	"algorithm_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"password_hash" text NOT NULL,
	"memory_cost_kib" integer NOT NULL,
	"parallelism" integer NOT NULL,
	"time_cost" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "password_credentials_argon2id_only" CHECK ("password_credentials"."algorithm" = 'argon2id' and "password_credentials"."password_hash" ~ '^\$argon2id\$'),
	CONSTRAINT "password_credentials_hash_length" CHECK (char_length("password_credentials"."password_hash") between 64 and 1024),
	CONSTRAINT "password_credentials_parameters_safe" CHECK ("password_credentials"."algorithm_version" > 0 and "password_credentials"."memory_cost_kib" >= 19456 and "password_credentials"."time_cost" >= 2 and "password_credentials"."parallelism" >= 1),
	CONSTRAINT "password_credentials_timestamps_ordered" CHECK ("password_credentials"."updated_at" >= "password_credentials"."created_at")
);
--> statement-breakpoint
ALTER TABLE "auth_passkeys" ADD CONSTRAINT "auth_passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_predecessor_session_id_auth_sessions_id_fk" FOREIGN KEY ("predecessor_session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_rotated_to_session_id_auth_sessions_id_fk" FOREIGN KEY ("rotated_to_session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_verification_challenges" ADD CONSTRAINT "auth_verification_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_passkeys_credential_id_unique" ON "auth_passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_passkeys_user_canonical_name_unique" ON "auth_passkeys" USING btree ("user_id","canonical_name");--> statement-breakpoint
CREATE INDEX "auth_passkeys_active_user_idx" ON "auth_passkeys" USING btree ("user_id") WHERE "auth_passkeys"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "auth_security_events_user_occurred_idx" ON "auth_security_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_security_events_expiry_idx" ON "auth_security_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_security_events_correlation_idx" ON "auth_security_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_digest_unique" ON "auth_sessions" USING btree ("refresh_token_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_predecessor_unique" ON "auth_sessions" USING btree ("predecessor_session_id") WHERE "auth_sessions"."predecessor_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_rotated_to_unique" ON "auth_sessions" USING btree ("rotated_to_session_id") WHERE "auth_sessions"."rotated_to_session_id" is not null;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_family_idx" ON "auth_sessions" USING btree ("user_id","family_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_active_user_idx" ON "auth_sessions" USING btree ("user_id","absolute_expires_at") WHERE "auth_sessions"."revoked_at" is null and "auth_sessions"."rotated_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_verification_challenges_one_active_user_purpose" ON "auth_verification_challenges" USING btree ("user_id","purpose") WHERE "auth_verification_challenges"."consumed_at" is null and "auth_verification_challenges"."invalidated_at" is null;--> statement-breakpoint
CREATE INDEX "auth_verification_challenges_email_purpose_idx" ON "auth_verification_challenges" USING btree ("email_id","purpose");--> statement-breakpoint
CREATE INDEX "auth_verification_challenges_expiry_idx" ON "auth_verification_challenges" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_id_user_id_unique" UNIQUE("id","user_id");