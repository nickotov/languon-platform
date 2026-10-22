CREATE TABLE "ai_credit_grant_balances" (
	"grant_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"remaining_credits" bigint NOT NULL,
	"reserved_credits" bigint DEFAULT 0 NOT NULL,
	"consumed_credits" bigint DEFAULT 0 NOT NULL,
	"removed_credits" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_credit_grant_balances_nonnegative" CHECK ("ai_credit_grant_balances"."remaining_credits" >= 0 and "ai_credit_grant_balances"."reserved_credits" >= 0 and "ai_credit_grant_balances"."consumed_credits" >= 0 and "ai_credit_grant_balances"."removed_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_credit_wallet_totals" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"reserved_credits" bigint DEFAULT 0 NOT NULL,
	"consumed_credits" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_credit_wallet_totals_nonnegative" CHECK ("ai_credit_wallet_totals"."reserved_credits" >= 0 and "ai_credit_wallet_totals"."consumed_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "portrait_interview_daily_admissions" (
	"owner_id" uuid NOT NULL,
	"utc_day" date NOT NULL,
	"admitted" integer NOT NULL,
	CONSTRAINT "portrait_interview_daily_admissions_owner_id_utc_day_pk" PRIMARY KEY("owner_id","utc_day"),
	CONSTRAINT "portrait_interview_daily_admissions_bound" CHECK ("portrait_interview_daily_admissions"."admitted" between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "ai_accounting_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider_id" text,
	"payment_id" uuid,
	"owner_id" uuid,
	"grant_id" uuid,
	"amount_usd_micros" bigint NOT NULL,
	"fee_usd_micros" bigint DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"data" jsonb NOT NULL,
	CONSTRAINT "ai_accounting_records_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ai_accounting_record_kind" CHECK ("ai_accounting_records"."kind" in ('payment','refund','provider_deposit','provider_balance','provider_bill')),
	CONSTRAINT "ai_accounting_record_amount" CHECK ("ai_accounting_records"."amount_usd_micros" >= 0 and "ai_accounting_records"."fee_usd_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_accounting_report_snapshots" (
	"key" text PRIMARY KEY NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"report" jsonb,
	CONSTRAINT "ai_accounting_report_period" CHECK ("ai_accounting_report_snapshots"."period_to" > "ai_accounting_report_snapshots"."period_from" and "ai_accounting_report_snapshots"."period_to" <= "ai_accounting_report_snapshots"."period_from" + interval '366 days')
);
--> statement-breakpoint
CREATE TABLE "ai_provider_expense_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_reference" text NOT NULL,
	"action_id" uuid NOT NULL,
	"cost_source" text NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"measurement" text NOT NULL,
	"amount_usd_micros" bigint,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_provider_expense_records_attempt_reference_unique" UNIQUE("attempt_reference"),
	CONSTRAINT "ai_provider_expense_cost_source" CHECK ("ai_provider_expense_records"."cost_source" in ('calculated','provider_reported','unknown') and (("ai_provider_expense_records"."cost_source" = 'unknown' and "ai_provider_expense_records"."amount_usd_micros" is null) or ("ai_provider_expense_records"."cost_source" <> 'unknown' and "ai_provider_expense_records"."amount_usd_micros" is not null))),
	CONSTRAINT "ai_provider_expense_measurement" CHECK ("ai_provider_expense_records"."measurement" in ('measured','estimated','unknown') and ("ai_provider_expense_records"."amount_usd_micros" is null or "ai_provider_expense_records"."amount_usd_micros" >= 0))
);
--> statement-breakpoint
CREATE TABLE "ai_credit_action_allocations" (
	"action_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"allocated_milli" bigint NOT NULL,
	"settled_milli" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_credit_action_allocations_action_id_grant_id_pk" PRIMARY KEY("action_id","grant_id"),
	CONSTRAINT "ai_credit_action_allocation_amount" CHECK ("ai_credit_action_allocations"."allocated_milli">0 and "ai_credit_action_allocations"."settled_milli" between 0 and "ai_credit_action_allocations"."allocated_milli")
);
--> statement-breakpoint
CREATE TABLE "ai_credit_action_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"purpose" text NOT NULL,
	"state" text NOT NULL,
	"input_limit" integer NOT NULL,
	"output_limit" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"successful" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "ai_credit_action_attempt_limits" CHECK ("ai_credit_action_attempts"."ordinal" between 1 and 5 and "ai_credit_action_attempts"."input_limit" >= 0 and "ai_credit_action_attempts"."output_limit" between 1 and 10000 and "ai_credit_action_attempts"."successful" in (0,1)),
	CONSTRAINT "ai_credit_action_attempt_meter" CHECK (("ai_credit_action_attempts"."input_tokens" is null and "ai_credit_action_attempts"."output_tokens" is null) or ("ai_credit_action_attempts"."input_tokens" between 0 and "ai_credit_action_attempts"."input_limit" and "ai_credit_action_attempts"."output_tokens" between 0 and "ai_credit_action_attempts"."output_limit")),
	CONSTRAINT "ai_credit_action_attempt_terminal" CHECK (("ai_credit_action_attempts"."state"='dispatched' and "ai_credit_action_attempts"."settled_at" is null) or ("ai_credit_action_attempts"."state"='settled' and "ai_credit_action_attempts"."settled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_credit_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"funding" text NOT NULL,
	"policy_version" integer NOT NULL,
	"tariff" jsonb NOT NULL,
	"state" text NOT NULL,
	"outcome" text,
	"held_milli" bigint NOT NULL,
	"charged_milli" bigint,
	"budget_milli" bigint NOT NULL,
	"output_limit" integer NOT NULL,
	"measurement" text,
	"created_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "ai_credit_action_states" CHECK ("ai_credit_actions"."state" in ('active','settled') and "ai_credit_actions"."funding" in ('customer','operator','unlimited')),
	CONSTRAINT "ai_credit_action_money" CHECK ("ai_credit_actions"."held_milli" >= 0 and "ai_credit_actions"."budget_milli" >= "ai_credit_actions"."held_milli" and "ai_credit_actions"."budget_milli" <= 9007199254740991 and ("ai_credit_actions"."funding" = 'customer' or "ai_credit_actions"."held_milli" = 0)),
	CONSTRAINT "ai_credit_action_output_limit" CHECK ("ai_credit_actions"."output_limit" between 1 and 10000),
	CONSTRAINT "ai_credit_action_terminal" CHECK (("ai_credit_actions"."state"='active' and "ai_credit_actions"."settled_at" is null and "ai_credit_actions"."charged_milli" is null and "ai_credit_actions"."outcome" is null and "ai_credit_actions"."measurement" is null) or ("ai_credit_actions"."state"='settled' and "ai_credit_actions"."settled_at" is not null and "ai_credit_actions"."outcome" in ('success','stopped','failure') and "ai_credit_actions"."measurement" in ('measured','unknown') and "ai_credit_actions"."charged_milli" between 0 and "ai_credit_actions"."held_milli" and ("ai_credit_actions"."outcome"<>'failure' or "ai_credit_actions"."charged_milli"=0)))
);
--> statement-breakpoint
CREATE TABLE "ai_action_charging_policies" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"job_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"policy" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_accounting_settings_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"default_max_credits_per_action" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"reason" text NOT NULL,
	CONSTRAINT "ai_accounting_settings_version_unique" UNIQUE("version"),
	CONSTRAINT "ai_accounting_settings_version_positive" CHECK ("ai_accounting_settings_revisions"."version">0),
	CONSTRAINT "ai_accounting_settings_reason_bounded" CHECK (char_length("ai_accounting_settings_revisions"."reason") between 5 and 500)
);
--> statement-breakpoint
CREATE TABLE "ai_capability_policy_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"version" integer NOT NULL,
	"funding" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"reason" text NOT NULL,
	CONSTRAINT "ai_capability_policy_version_unique" UNIQUE("capability","version"),
	CONSTRAINT "ai_capability_policy_version_positive" CHECK ("ai_capability_policy_revisions"."version">0),
	CONSTRAINT "ai_capability_policy_funding_closed" CHECK ("ai_capability_policy_revisions"."funding" in ('customer','operator')),
	CONSTRAINT "ai_capability_policy_capability_closed" CHECK ("ai_capability_policy_revisions"."capability" in ('portrait-interview','conversation','dictionary-generation','sentence-generation','text-translation','speech')),
	CONSTRAINT "ai_capability_policy_reason_bounded" CHECK (char_length("ai_capability_policy_revisions"."reason") between 5 and 500)
);
--> statement-breakpoint
ALTER TABLE "user_text_ai_preferences" ADD COLUMN "max_credits_per_action" text;--> statement-breakpoint
ALTER TABLE "ai_credit_grant_balances" ADD CONSTRAINT "ai_credit_grant_balances_grant_id_ai_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_credit_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_grant_balances" ADD CONSTRAINT "ai_credit_grant_balances_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_wallet_totals" ADD CONSTRAINT "ai_credit_wallet_totals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portrait_interview_daily_admissions" ADD CONSTRAINT "portrait_interview_daily_admissions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_accounting_records" ADD CONSTRAINT "ai_accounting_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_accounting_records" ADD CONSTRAINT "ai_accounting_records_grant_id_ai_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_credit_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_accounting_records" ADD CONSTRAINT "ai_accounting_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_action_allocations" ADD CONSTRAINT "ai_credit_action_allocations_action_id_ai_credit_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_credit_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_action_allocations" ADD CONSTRAINT "ai_credit_action_allocations_grant_id_ai_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_credit_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_action_attempts" ADD CONSTRAINT "ai_credit_action_attempts_action_id_ai_credit_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_credit_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_actions" ADD CONSTRAINT "ai_credit_actions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_accounting_settings_revisions" ADD CONSTRAINT "ai_accounting_settings_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_capability_policy_revisions" ADD CONSTRAINT "ai_capability_policy_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_credit_grant_balances_spendable_idx" ON "ai_credit_grant_balances" USING btree ("owner_id","expires_at","created_at","grant_id") WHERE "ai_credit_grant_balances"."remaining_credits" > 0;--> statement-breakpoint
CREATE INDEX "ai_accounting_records_time_idx" ON "ai_accounting_records" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ai_accounting_records_provider_time_idx" ON "ai_accounting_records" USING btree ("provider_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ai_accounting_records_payment_idx" ON "ai_accounting_records" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "ai_accounting_report_refresh_idx" ON "ai_accounting_report_snapshots" USING btree ("requested_at","generated_at");--> statement-breakpoint
CREATE INDEX "ai_provider_expense_provider_time_idx" ON "ai_provider_expense_records" USING btree ("provider_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_action_attempt_ordinal" ON "ai_credit_action_attempts" USING btree ("action_id","ordinal");--> statement-breakpoint
CREATE INDEX "ai_credit_action_owner_state_idx" ON "ai_credit_actions" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "ai_credit_action_recovery_idx" ON "ai_credit_actions" USING btree ("state","deadline_at");--> statement-breakpoint
ALTER TABLE "user_text_ai_preferences" ADD CONSTRAINT "user_text_ai_preferences_action_budget_valid" CHECK ("user_text_ai_preferences"."max_credits_per_action" is null or ("user_text_ai_preferences"."max_credits_per_action" ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,3})?$' and "user_text_ai_preferences"."max_credits_per_action"::numeric > 0));