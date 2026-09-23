CREATE TABLE "dictionary_ai_worker_observations" (
	"adapter_revision" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"model_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "dictionary_ai_worker_observations_identity_bounded" CHECK (char_length("dictionary_ai_worker_observations"."id") between 3 and 128 and char_length("dictionary_ai_worker_observations"."provider_id") between 1 and 64 and char_length("dictionary_ai_worker_observations"."model_id") between 1 and 128 and char_length("dictionary_ai_worker_observations"."adapter_revision") between 1 and 128),
	CONSTRAINT "dictionary_ai_worker_observations_status_valid" CHECK ("dictionary_ai_worker_observations"."status" in ('available', 'unavailable')),
	CONSTRAINT "dictionary_ai_worker_observations_message_bounded" CHECK (char_length("dictionary_ai_worker_observations"."message") between 1 and 300),
	CONSTRAINT "dictionary_ai_worker_observations_expiry_ordered" CHECK ("dictionary_ai_worker_observations"."expires_at" > "dictionary_ai_worker_observations"."checked_at")
);
--> statement-breakpoint
CREATE INDEX "dictionary_ai_worker_observations_provider_idx" ON "dictionary_ai_worker_observations" USING btree ("provider_id","checked_at");
