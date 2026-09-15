CREATE TYPE "public"."account_deletion_state" AS ENUM('pending', 'running', 'cancelled', 'complete');--> statement-breakpoint
ALTER TYPE "public"."user_status" ADD VALUE 'deletion_pending';--> statement-breakpoint
ALTER TYPE "public"."user_status" ADD VALUE 'purged';--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"fencing_token" integer DEFAULT 0 NOT NULL,
	"lease_deadline" timestamp with time zone,
	"lease_worker_id" text,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"purge_at" timestamp with time zone NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"state" "account_deletion_state" DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "account_deletion_attempt_count_nonnegative" CHECK ("account_deletion_requests"."attempt_count" >= 0),
	CONSTRAINT "account_deletion_fencing_token_nonnegative" CHECK ("account_deletion_requests"."fencing_token" >= 0),
	CONSTRAINT "account_deletion_deadline" CHECK ("account_deletion_requests"."purge_at" > "account_deletion_requests"."scheduled_at" and "account_deletion_requests"."next_attempt_at" >= "account_deletion_requests"."purge_at"),
	CONSTRAINT "account_deletion_lease_shape" CHECK (("account_deletion_requests"."state" = 'running' and "account_deletion_requests"."lease_deadline" is not null and "account_deletion_requests"."lease_worker_id" is not null) or ("account_deletion_requests"."state" <> 'running' and "account_deletion_requests"."lease_deadline" is null and "account_deletion_requests"."lease_worker_id" is null)),
	CONSTRAINT "account_deletion_completion_shape" CHECK (("account_deletion_requests"."state" = 'complete' and "account_deletion_requests"."completed_at" is not null) or ("account_deletion_requests"."state" <> 'complete' and "account_deletion_requests"."completed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_due_idx" ON "account_deletion_requests" USING btree ("state","next_attempt_at","user_id");--> statement-breakpoint
CREATE INDEX "account_deletion_lease_idx" ON "account_deletion_requests" USING btree ("state","lease_deadline");