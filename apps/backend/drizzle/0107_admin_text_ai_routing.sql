CREATE TABLE "text_ai_route_health_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid,
	"route_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"reason" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "text_ai_route_health_events_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "text_ai_health_reason" CHECK ("text_ai_route_health_events"."reason" in ('model_retired','model_unavailable','authorization_failed','invalid_output','request_rejected','schema_incompatible','rate_limited','provider_credits_exhausted','provider_unavailable')),
	CONSTRAINT "text_ai_health_fingerprint" CHECK ("text_ai_route_health_events"."fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "text_ai_routing_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "text_ai_routing_revisions_version_unique" UNIQUE("version"),
	CONSTRAINT "text_ai_routing_revisions_version_positive" CHECK ("text_ai_routing_revisions"."version" > 0),
	CONSTRAINT "text_ai_routing_revisions_configuration_bounded" CHECK (jsonb_typeof("text_ai_routing_revisions"."configuration") = 'object' and octet_length("text_ai_routing_revisions"."configuration"::text) <= 65536),
	CONSTRAINT "text_ai_routing_revisions_reason_bounded" CHECK (char_length("text_ai_routing_revisions"."reason") between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "text_ai_routing_state" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"active_revision_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "text_ai_routing_state_singleton" CHECK ("text_ai_routing_state"."id" = 'global')
);
--> statement-breakpoint
CREATE TABLE "text_ai_probe_recoveries" (
	"probe_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"recovered_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "text_ai_probe_recovery_reason" CHECK (char_length("text_ai_probe_recoveries"."reason") between 10 and 500)
);
--> statement-breakpoint
CREATE TABLE "text_ai_probes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"route_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"kind" text NOT NULL,
	"flow_id" text,
	"fingerprint" text NOT NULL,
	"state" text NOT NULL,
	"failure" text,
	"evidence_hours" integer NOT NULL,
	"day" text NOT NULL,
	"maximum_micros" bigint NOT NULL,
	"cost_micros" bigint,
	"price" jsonb NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"measurement" text DEFAULT 'unknown' NOT NULL,
	"elapsed_ms" integer,
	"first_output_ms" integer,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"evidence_expires_at" timestamp with time zone,
	CONSTRAINT "text_ai_probe_state" CHECK ("text_ai_probes"."state" in ('running','passed','failed')),
	CONSTRAINT "text_ai_probe_kind" CHECK ("text_ai_probes"."kind" in ('quick','flow') and ("text_ai_probes"."kind" <> 'flow' or "text_ai_probes"."flow_id" is not null)),
	CONSTRAINT "text_ai_probe_cost" CHECK ("text_ai_probes"."maximum_micros">0 and ("text_ai_probes"."cost_micros" is null or ("text_ai_probes"."cost_micros">=0 and "text_ai_probes"."cost_micros"<="text_ai_probes"."maximum_micros"))),
	CONSTRAINT "text_ai_probe_usage" CHECK (("text_ai_probes"."input_tokens" is null or "text_ai_probes"."input_tokens">=0) and ("text_ai_probes"."output_tokens" is null or "text_ai_probes"."output_tokens">=0)),
	CONSTRAINT "text_ai_probe_completion" CHECK (("text_ai_probes"."state"='running' and "text_ai_probes"."completed_at" is null) or ("text_ai_probes"."state"<>'running' and "text_ai_probes"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "text_ai_route_dispatches" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"provider_price" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" DROP CONSTRAINT "ai_provider_expense_source_kind";--> statement-breakpoint
ALTER TABLE "text_ai_routing_revisions" ADD CONSTRAINT "text_ai_routing_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_ai_routing_state" ADD CONSTRAINT "text_ai_routing_state_active_revision_id_text_ai_routing_revisions_id_fk" FOREIGN KEY ("active_revision_id") REFERENCES "public"."text_ai_routing_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_ai_probe_recoveries" ADD CONSTRAINT "text_ai_probe_recoveries_probe_id_text_ai_probes_id_fk" FOREIGN KEY ("probe_id") REFERENCES "public"."text_ai_probes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_ai_probe_recoveries" ADD CONSTRAINT "text_ai_probe_recoveries_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_ai_probes" ADD CONSTRAINT "text_ai_probes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_ai_route_dispatches" ADD CONSTRAINT "text_ai_route_dispatches_attempt_id_ai_credit_action_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."ai_credit_action_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "text_ai_health_route_reason_idx" ON "text_ai_route_health_events" USING btree ("route_id","reason","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "text_ai_health_flow_schema_idx" ON "text_ai_route_health_events" USING btree ("route_id","flow_id","observed_at" DESC NULLS LAST) WHERE "text_ai_route_health_events"."reason"='schema_incompatible';--> statement-breakpoint
CREATE INDEX "text_ai_health_provider_auth_idx" ON "text_ai_route_health_events" USING btree ("provider_id","observed_at" DESC NULLS LAST) WHERE "text_ai_route_health_events"."reason"='authorization_failed';--> statement-breakpoint
CREATE INDEX "text_ai_health_transient_idx" ON "text_ai_route_health_events" USING btree ("route_id","observed_at" DESC NULLS LAST) WHERE "text_ai_route_health_events"."reason" in ('provider_unavailable','rate_limited','provider_credits_exhausted');--> statement-breakpoint
CREATE INDEX "text_ai_health_route_latest_idx" ON "text_ai_route_health_events" USING btree ("route_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "text_ai_probes_day_idx" ON "text_ai_probes" USING btree ("day");--> statement-breakpoint
CREATE INDEX "text_ai_probe_passed_flow_idx" ON "text_ai_probes" USING btree ("route_id","flow_id","fingerprint","started_at" DESC NULLS LAST) WHERE "text_ai_probes"."state"='passed' and "text_ai_probes"."kind"='flow';--> statement-breakpoint
CREATE INDEX "text_ai_probe_flow_latest_idx" ON "text_ai_probes" USING btree ("route_id","flow_id","started_at" DESC NULLS LAST) WHERE "text_ai_probes"."kind"='flow';--> statement-breakpoint
CREATE INDEX "text_ai_probe_failed_route_idx" ON "text_ai_probes" USING btree ("route_id","started_at" DESC NULLS LAST) WHERE "text_ai_probes"."state"='failed' and "text_ai_probes"."failure"<>'budget_insufficient';--> statement-breakpoint
CREATE INDEX "text_ai_probe_failed_hard_idx" ON "text_ai_probes" USING btree ("route_id","failure","started_at" DESC NULLS LAST) WHERE "text_ai_probes"."state"='failed' and "text_ai_probes"."failure" in ('model_retired','authorization_failed','invalid_output');--> statement-breakpoint
CREATE INDEX "text_ai_probe_failed_schema_idx" ON "text_ai_probes" USING btree ("route_id","flow_id","started_at" DESC NULLS LAST) WHERE "text_ai_probes"."state"='failed' and "text_ai_probes"."failure"='invalid_output';--> statement-breakpoint
CREATE INDEX "text_ai_probe_failed_auth_idx" ON "text_ai_probes" USING btree ("provider_id","started_at" DESC NULLS LAST) WHERE "text_ai_probes"."state"='failed' and "text_ai_probes"."failure"='authorization_failed';--> statement-breakpoint
CREATE INDEX "text_ai_probes_route_idx" ON "text_ai_probes" USING btree ("route_id","started_at");--> statement-breakpoint
CREATE INDEX "text_ai_probes_provider_idx" ON "text_ai_probes" USING btree ("provider_id","state");--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" ADD CONSTRAINT "ai_provider_expense_source_kind" CHECK ("ai_provider_expense_records"."source_kind" in ('text-attempt','speech-attempt','admin-probe','legacy-unverified'));