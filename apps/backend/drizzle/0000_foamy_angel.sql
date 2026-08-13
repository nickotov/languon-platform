CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "user_emails" (
	"canonical_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "user_emails_email_length" CHECK (char_length("user_emails"."email") between 3 and 320),
	CONSTRAINT "user_emails_canonical_email_length" CHECK (char_length("user_emails"."canonical_email") between 3 and 320),
	CONSTRAINT "user_emails_canonical_matches_email" CHECK ("user_emails"."canonical_email" = lower(btrim("user_emails"."email")))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_version_positive" CHECK ("users"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_canonical_email_unique" ON "user_emails" USING btree ("canonical_email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_one_primary_per_user" ON "user_emails" USING btree ("user_id") WHERE "user_emails"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "user_emails_user_id_idx" ON "user_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");