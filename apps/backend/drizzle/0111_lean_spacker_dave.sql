ALTER TABLE "admin_mcp_audit_events" ADD COLUMN "outcome" text DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_mcp_reservations" ADD COLUMN "result" jsonb;--> statement-breakpoint
CREATE INDEX "admin_mcp_audit_events_actor_idx" ON "admin_mcp_audit_events" USING btree ("actor_user_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "ai_provider_expense_action_time_idx" ON "ai_provider_expense_records" USING btree ("action_id","occurred_at","id");