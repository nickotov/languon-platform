DROP INDEX "admin_audit_events_correlation_unique";--> statement-breakpoint
CREATE INDEX "admin_audit_events_correlation_idx" ON "admin_audit_events" USING btree ("correlation_id");