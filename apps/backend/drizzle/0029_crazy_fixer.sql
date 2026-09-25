CREATE TYPE "public"."ai_credit_grant_source" AS ENUM('admin', 'subscription', 'purchase', 'migration');--> statement-breakpoint
CREATE TYPE "public"."ai_credit_history_kind" AS ENUM('grant', 'admin_removal', 'reservation', 'settlement', 'release', 'policy_update');--> statement-breakpoint
CREATE TYPE "public"."ai_credit_measurement" AS ENUM('provider_reported', 'estimated', 'unmetered');--> statement-breakpoint
CREATE TYPE "public"."ai_credit_policy_mode" AS ENUM('limited', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."ai_credit_reservation_state" AS ENUM('active', 'settled', 'released');--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'ai_credit_policy_updated';--> statement-breakpoint
ALTER TYPE "public"."admin_audit_action" ADD VALUE 'ai_credits_adjusted';--> statement-breakpoint
CREATE TABLE "ai_credit_accounts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"management_version" integer DEFAULT 1 NOT NULL,
	"mode" "ai_credit_policy_mode" DEFAULT 'limited' NOT NULL,
	"unlimited_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "ai_credit_accounts_management_version_positive" CHECK ("ai_credit_accounts"."management_version" > 0),
	CONSTRAINT "ai_credit_accounts_unlimited_until_policy" CHECK ("ai_credit_accounts"."mode" = 'unlimited' or "ai_credit_accounts"."unlimited_until" is null),
	CONSTRAINT "ai_credit_accounts_updated_after_created" CHECK ("ai_credit_accounts"."updated_at" >= "ai_credit_accounts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "ai_credit_admin_removal_allocations" (
	"allocated_credits" bigint NOT NULL,
	"grant_id" uuid NOT NULL,
	"removal_id" uuid NOT NULL,
	CONSTRAINT "ai_credit_admin_removal_allocations_removal_id_grant_id_pk" PRIMARY KEY("removal_id","grant_id"),
	CONSTRAINT "ai_credit_admin_removal_allocations_positive" CHECK ("ai_credit_admin_removal_allocations"."allocated_credits" between 1 and 1000000000000)
);
--> statement-breakpoint
CREATE TABLE "ai_credit_admin_removals" (
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"source_reference" text NOT NULL,
	CONSTRAINT "ai_credit_admin_removals_amount_bounded" CHECK ("ai_credit_admin_removals"."amount" between 1 and 1000000000000),
	CONSTRAINT "ai_credit_admin_removals_reason_bounded" CHECK ("ai_credit_admin_removals"."reason" = btrim("ai_credit_admin_removals"."reason") and char_length("ai_credit_admin_removals"."reason") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "ai_credit_grants" (
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"source" "ai_credit_grant_source" NOT NULL,
	"source_reference" text NOT NULL,
	CONSTRAINT "ai_credit_grants_amount_bounded" CHECK ("ai_credit_grants"."amount" between 1 and 9007199254740991),
	CONSTRAINT "ai_credit_admin_grants_amount_bounded" CHECK ("ai_credit_grants"."source" <> 'admin' or "ai_credit_grants"."amount" <= 1000000000000),
	CONSTRAINT "ai_credit_grants_source_reference_bounded" CHECK ("ai_credit_grants"."source_reference" = btrim("ai_credit_grants"."source_reference") and char_length("ai_credit_grants"."source_reference") between 1 and 200),
	CONSTRAINT "ai_credit_grants_expiry_after_creation" CHECK ("ai_credit_grants"."expires_at" is null or "ai_credit_grants"."expires_at" > "ai_credit_grants"."created_at"),
	CONSTRAINT "ai_credit_purchase_grants_do_not_expire" CHECK ("ai_credit_grants"."source" <> 'purchase' or "ai_credit_grants"."expires_at" is null)
);
--> statement-breakpoint
CREATE TABLE "ai_credit_history" (
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"grant_source" "ai_credit_grant_source",
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "ai_credit_history_kind" NOT NULL,
	"measurement" "ai_credit_measurement",
	"owner_id" uuid NOT NULL,
	"reason" text,
	CONSTRAINT "ai_credit_history_amount_bounded" CHECK ("ai_credit_history"."amount" between -9007199254740991 and 9007199254740991),
	CONSTRAINT "ai_credit_history_reason_bounded" CHECK ("ai_credit_history"."reason" is null or ("ai_credit_history"."reason" = btrim("ai_credit_history"."reason") and char_length("ai_credit_history"."reason") between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "ai_credit_reservation_allocations" (
	"allocated_credits" bigint NOT NULL,
	"grant_id" uuid NOT NULL,
	"settled_credits" bigint DEFAULT 0 NOT NULL,
	"reservation_id" uuid NOT NULL,
	CONSTRAINT "ai_credit_reservation_allocations_reservation_id_grant_id_pk" PRIMARY KEY("reservation_id","grant_id"),
	CONSTRAINT "ai_credit_reservation_allocations_amount" CHECK ("ai_credit_reservation_allocations"."allocated_credits" between 1 and 9007199254740991 and "ai_credit_reservation_allocations"."settled_credits" >= 0 and "ai_credit_reservation_allocations"."settled_credits" <= "ai_credit_reservation_allocations"."allocated_credits")
);
--> statement-breakpoint
CREATE TABLE "ai_credit_reservations" (
	"attempt" integer NOT NULL,
	"charged_credits" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"measured_credits" bigint,
	"measurement" "ai_credit_measurement",
	"owner_id" uuid NOT NULL,
	"policy_mode" "ai_credit_policy_mode" NOT NULL,
	"reserved_credits" bigint NOT NULL,
	"settled_at" timestamp with time zone,
	"state" "ai_credit_reservation_state" DEFAULT 'active' NOT NULL,
	"unlimited_until" timestamp with time zone,
	CONSTRAINT "ai_credit_reservations_attempt_positive" CHECK ("ai_credit_reservations"."attempt" > 0),
	CONSTRAINT "ai_credit_reservations_reserved_nonnegative" CHECK ("ai_credit_reservations"."reserved_credits" between 0 and 9007199254740991),
	CONSTRAINT "ai_credit_reservations_policy_amount" CHECK (("ai_credit_reservations"."policy_mode" = 'unlimited' and "ai_credit_reservations"."reserved_credits" = 0) or ("ai_credit_reservations"."policy_mode" = 'limited' and "ai_credit_reservations"."reserved_credits" > 0)),
	CONSTRAINT "ai_credit_reservations_policy_expiry" CHECK ("ai_credit_reservations"."policy_mode" = 'unlimited' or "ai_credit_reservations"."unlimited_until" is null),
	CONSTRAINT "ai_credit_reservations_timestamps_ordered" CHECK (("ai_credit_reservations"."dispatched_at" is null or "ai_credit_reservations"."dispatched_at" >= "ai_credit_reservations"."created_at") and ("ai_credit_reservations"."settled_at" is null or "ai_credit_reservations"."settled_at" >= "ai_credit_reservations"."created_at") and ("ai_credit_reservations"."dispatched_at" is null or "ai_credit_reservations"."settled_at" is null or "ai_credit_reservations"."settled_at" >= "ai_credit_reservations"."dispatched_at")),
	CONSTRAINT "ai_credit_reservations_terminal_state" CHECK (("ai_credit_reservations"."state" = 'active' and "ai_credit_reservations"."settled_at" is null and "ai_credit_reservations"."measurement" is null and "ai_credit_reservations"."charged_credits" is null and "ai_credit_reservations"."measured_credits" is null) or ("ai_credit_reservations"."state" = 'released' and "ai_credit_reservations"."settled_at" is not null and "ai_credit_reservations"."measurement" is null and "ai_credit_reservations"."charged_credits" = 0 and "ai_credit_reservations"."measured_credits" is null) or ("ai_credit_reservations"."state" = 'settled' and "ai_credit_reservations"."settled_at" is not null and "ai_credit_reservations"."measurement" is not null and "ai_credit_reservations"."charged_credits" between 0 and 9007199254740991 and (("ai_credit_reservations"."measurement" = 'provider_reported' and "ai_credit_reservations"."measured_credits" between 0 and 9007199254740991) or ("ai_credit_reservations"."measurement" in ('estimated', 'unmetered') and "ai_credit_reservations"."measured_credits" is null))))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_version_positive";--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_accounted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_input_credits_per_million_tokens" integer;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_max_credits_per_attempt" integer;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_output_credits_per_million_tokens" integer;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_policy_mode" text;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_pricing_revision" integer;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_provider_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD COLUMN "ai_credit_reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_credit_accounts" ADD CONSTRAINT "ai_credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_admin_removal_allocations" ADD CONSTRAINT "ai_credit_admin_removal_allocations_grant_id_ai_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_credit_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_admin_removal_allocations" ADD CONSTRAINT "ai_credit_admin_removal_allocations_removal_id_ai_credit_admin_removals_id_fk" FOREIGN KEY ("removal_id") REFERENCES "public"."ai_credit_admin_removals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_admin_removals" ADD CONSTRAINT "ai_credit_admin_removals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_grants" ADD CONSTRAINT "ai_credit_grants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_history" ADD CONSTRAINT "ai_credit_history_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_reservation_allocations" ADD CONSTRAINT "ai_credit_reservation_allocations_grant_id_ai_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_credit_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_reservation_allocations" ADD CONSTRAINT "ai_credit_reservation_allocations_reservation_id_ai_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."ai_credit_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_credit_admin_removal_allocations_grant_idx" ON "ai_credit_admin_removal_allocations" USING btree ("grant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_admin_removals_source_reference_unique" ON "ai_credit_admin_removals" USING btree ("source_reference");--> statement-breakpoint
CREATE INDEX "ai_credit_admin_removals_owner_created_idx" ON "ai_credit_admin_removals" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_grants_source_reference_unique" ON "ai_credit_grants" USING btree ("source","source_reference");--> statement-breakpoint
CREATE INDEX "ai_credit_grants_owner_expiry_idx" ON "ai_credit_grants" USING btree ("owner_id","expires_at","created_at");--> statement-breakpoint
CREATE INDEX "ai_credit_history_owner_created_idx" ON "ai_credit_history" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ai_credit_reservation_allocations_grant_idx" ON "ai_credit_reservation_allocations" USING btree ("grant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_reservations_job_attempt_unique" ON "ai_credit_reservations" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "ai_credit_reservations_owner_state_idx" ON "ai_credit_reservations" USING btree ("owner_id","state");--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_version_positive" CHECK (("admin_audit_events"."before_version" is null or "admin_audit_events"."before_version" >= 0) and ("admin_audit_events"."after_version" is null or "admin_audit_events"."after_version" >= 0));--> statement-breakpoint
ALTER TABLE "dictionary_generation_jobs" ADD CONSTRAINT "dictionary_generation_jobs_ai_credit_state" CHECK (("dictionary_generation_jobs"."ai_credit_accounted" = false and "dictionary_generation_jobs"."ai_credit_input_credits_per_million_tokens" is null and "dictionary_generation_jobs"."ai_credit_max_credits_per_attempt" is null and "dictionary_generation_jobs"."ai_credit_output_credits_per_million_tokens" is null and "dictionary_generation_jobs"."ai_credit_policy_mode" is null and "dictionary_generation_jobs"."ai_credit_pricing_revision" is null and "dictionary_generation_jobs"."ai_credit_provider_dispatched_at" is null and "dictionary_generation_jobs"."ai_credit_reservation_id" is null) or ("dictionary_generation_jobs"."ai_credit_accounted" = true and "dictionary_generation_jobs"."ai_credit_input_credits_per_million_tokens" >= 0 and "dictionary_generation_jobs"."ai_credit_max_credits_per_attempt" > 0 and "dictionary_generation_jobs"."ai_credit_output_credits_per_million_tokens" >= 0 and "dictionary_generation_jobs"."ai_credit_pricing_revision" = 1 and (("dictionary_generation_jobs"."ai_credit_policy_mode" is null and "dictionary_generation_jobs"."ai_credit_reservation_id" is null and "dictionary_generation_jobs"."ai_credit_provider_dispatched_at" is null) or ("dictionary_generation_jobs"."ai_credit_policy_mode" in ('limited', 'unlimited') and ("dictionary_generation_jobs"."ai_credit_reservation_id" is not null or "dictionary_generation_jobs"."execution_state" in ('completed', 'failed', 'cancelled', 'expired'))))));