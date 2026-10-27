CREATE TABLE "admin_mcp_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_mcp_audit_bounded" CHECK (octet_length("admin_mcp_audit_events"."metadata"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "admin_mcp_previews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"target" text NOT NULL,
	"current" jsonb NOT NULL,
	"proposed" jsonb NOT NULL,
	"expected_version" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "admin_mcp_previews_expiry_bounded" CHECK ("admin_mcp_previews"."expires_at" > "admin_mcp_previews"."created_at" and "admin_mcp_previews"."expires_at" <= "admin_mcp_previews"."created_at" + interval '5 minutes')
);
--> statement-breakpoint
CREATE TABLE "admin_mcp_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"preview_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_mcp_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"state" text NOT NULL,
	"reserved_units" bigint NOT NULL,
	"settled_units" bigint,
	"created_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "admin_mcp_reservations_amounts" CHECK ("admin_mcp_reservations"."reserved_units" > 0 and ("admin_mcp_reservations"."settled_units" is null or "admin_mcp_reservations"."settled_units" >= 0))
);
--> statement-breakpoint
CREATE TABLE "admin_mcp_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"limits" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_mcp_tokens_expiry_bounded" CHECK ("admin_mcp_tokens"."expires_at" > "admin_mcp_tokens"."created_at" and "admin_mcp_tokens"."expires_at" <= "admin_mcp_tokens"."created_at" + interval '90 days'),
	CONSTRAINT "admin_mcp_tokens_hash_format" CHECK ("admin_mcp_tokens"."secret_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "admin_mcp_audit_events" ADD CONSTRAINT "admin_mcp_audit_events_token_id_admin_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."admin_mcp_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mcp_audit_events" ADD CONSTRAINT "admin_mcp_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mcp_previews" ADD CONSTRAINT "admin_mcp_previews_token_id_admin_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."admin_mcp_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mcp_receipts" ADD CONSTRAINT "admin_mcp_receipts_token_id_admin_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."admin_mcp_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mcp_receipts" ADD CONSTRAINT "admin_mcp_receipts_preview_id_admin_mcp_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."admin_mcp_previews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mcp_reservations" ADD CONSTRAINT "admin_mcp_reservations_token_id_admin_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."admin_mcp_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mcp_tokens" ADD CONSTRAINT "admin_mcp_tokens_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_mcp_audit_events_expiry_idx" ON "admin_mcp_audit_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_mcp_audit_events_token_idx" ON "admin_mcp_audit_events" USING btree ("token_id","occurred_at");--> statement-breakpoint
CREATE INDEX "admin_mcp_previews_expiry_idx" ON "admin_mcp_previews" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mcp_receipts_key_unique" ON "admin_mcp_receipts" USING btree ("token_id","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mcp_receipts_preview_unique" ON "admin_mcp_receipts" USING btree ("preview_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mcp_reservations_key_unique" ON "admin_mcp_reservations" USING btree ("token_id","operation_key");--> statement-breakpoint
CREATE INDEX "admin_mcp_reservations_day_idx" ON "admin_mcp_reservations" USING btree ("token_id","kind","day");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mcp_tokens_secret_hash_unique" ON "admin_mcp_tokens" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "admin_mcp_tokens_owner_idx" ON "admin_mcp_tokens" USING btree ("owner_user_id");