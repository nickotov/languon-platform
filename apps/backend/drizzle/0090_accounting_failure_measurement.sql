ALTER TYPE "public"."ai_credit_measurement" ADD VALUE 'technical_failure';--> statement-breakpoint
ALTER TABLE "ai_accounting_report_snapshots" ADD COLUMN "change_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_accounting_report_snapshots" ADD COLUMN "computed_version" bigint DEFAULT -1 NOT NULL;