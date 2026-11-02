ALTER TABLE "knowledge_transcription_config_revisions" ADD COLUMN "processing_credential_fingerprint" text;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_config_revisions" ADD COLUMN "data_sharing_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_config_revisions" ADD COLUMN "data_sharing_evidence" text;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_config_revisions" ADD COLUMN "data_sharing_attested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_transcription_jobs" ADD COLUMN "processing_credential_fingerprint" text;