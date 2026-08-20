CREATE TYPE "public"."admin_audit_action" AS ENUM('membership_granted', 'membership_revoked', 'user_disabled', 'user_restored', 'access_denied');--> statement-breakpoint
CREATE TYPE "public"."admin_audit_outcome" AS ENUM('success', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."admin_membership_role" AS ENUM('owner');--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"action" "admin_audit_action" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"after_status" "user_status",
	"after_version" integer,
	"before_status" "user_status",
	"before_version" integer,
	"correlation_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "admin_audit_outcome" NOT NULL,
	"reason" text,
	"target_user_id" uuid,
	CONSTRAINT "admin_audit_events_reason_length" CHECK ("admin_audit_events"."reason" is null or char_length("admin_audit_events"."reason") between 5 and 500),
	CONSTRAINT "admin_audit_events_version_positive" CHECK (("admin_audit_events"."before_version" is null or "admin_audit_events"."before_version" > 0) and ("admin_audit_events"."after_version" is null or "admin_audit_events"."after_version" > 0)),
	CONSTRAINT "admin_audit_events_expiry_after_occurrence" CHECK ("admin_audit_events"."expires_at" > "admin_audit_events"."occurred_at"),
	CONSTRAINT "admin_audit_events_metadata_bounded" CHECK (jsonb_typeof("admin_audit_events"."metadata") = 'object' and octet_length("admin_audit_events"."metadata"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "admin_memberships" (
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"grant_reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" text,
	"role" "admin_membership_role" DEFAULT 'owner' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "admin_memberships_reason_length" CHECK (char_length("admin_memberships"."grant_reason") between 5 and 500 and ("admin_memberships"."revoke_reason" is null or char_length("admin_memberships"."revoke_reason") between 5 and 500)),
	CONSTRAINT "admin_memberships_time_order" CHECK ("admin_memberships"."updated_at" >= "admin_memberships"."granted_at" and ("admin_memberships"."revoked_at" is null or "admin_memberships"."revoked_at" >= "admin_memberships"."granted_at")),
	CONSTRAINT "admin_memberships_revocation_pair" CHECK (("admin_memberships"."revoked_at" is null) = ("admin_memberships"."revoked_by_user_id" is null) and ("admin_memberships"."revoked_at" is null) = ("admin_memberships"."revoke_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_audit_events_correlation_unique" ON "admin_audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_occurred_idx" ON "admin_audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_occurred_idx" ON "admin_audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "admin_audit_events_target_occurred_idx" ON "admin_audit_events" USING btree ("target_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "admin_audit_events_expiry_idx" ON "admin_audit_events" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_memberships_one_active_per_user" ON "admin_memberships" USING btree ("user_id") WHERE "admin_memberships"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "admin_memberships_active_role_idx" ON "admin_memberships" USING btree ("role","granted_at") WHERE "admin_memberships"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "admin_memberships_user_history_idx" ON "admin_memberships" USING btree ("user_id","granted_at");