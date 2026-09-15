ALTER TYPE "public"."admin_audit_action" ADD VALUE 'user_deletion_cancelled' BEFORE 'access_denied';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_unique" ON "users" USING btree ("handle");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_format" CHECK ("users"."handle" is null or "users"."handle" ~ '^[a-z0-9_]{3,30}$');