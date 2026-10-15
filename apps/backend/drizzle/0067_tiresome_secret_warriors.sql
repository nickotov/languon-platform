ALTER TABLE "texts" ADD CONSTRAINT "texts_id_owner_unique" UNIQUE("id","owner_id");--> statement-breakpoint
ALTER TABLE "text_shares" ADD CONSTRAINT "text_shares_version_check" CHECK ("text_shares"."version">0);--> statement-breakpoint
ALTER TABLE "text_shares" ADD CONSTRAINT "text_shares_digest_check" CHECK ("text_shares"."key_digest" ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$');