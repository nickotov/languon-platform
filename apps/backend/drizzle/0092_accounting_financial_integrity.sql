CREATE TABLE "ai_accounting_archived_purchase_movements" (
	"payment_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"credits_milli" bigint NOT NULL,
	"allocated_usd_micros" bigint NOT NULL,
	CONSTRAINT "ai_accounting_archived_purchase_movements_payment_id_occurred_at_kind_pk" PRIMARY KEY("payment_id","occurred_at","kind"),
	CONSTRAINT "ai_accounting_archived_movement" CHECK ("ai_accounting_archived_purchase_movements"."kind" in ('consumed','removed') and "ai_accounting_archived_purchase_movements"."credits_milli">0 and "ai_accounting_archived_purchase_movements"."allocated_usd_micros">=0)
);
--> statement-breakpoint
CREATE TABLE "ai_accounting_retired_purchase_lots" (
	"payment_id" uuid PRIMARY KEY NOT NULL,
	"retired_at" timestamp with time zone NOT NULL,
	"issued_milli" bigint NOT NULL,
	CONSTRAINT "ai_accounting_retired_issued" CHECK ("ai_accounting_retired_purchase_lots"."issued_milli">0)
);
--> statement-breakpoint
CREATE TABLE "ai_operator_action_budgets" (
	"action_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"day" text NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"consumed_micros" bigint,
	"owner_day_limit_micros" bigint NOT NULL,
	"global_day_limit_micros" bigint NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "ai_operator_action_amount" CHECK ("ai_operator_action_budgets"."reserved_micros" >= 0 and "ai_operator_action_budgets"."reserved_micros" <= 9007199254740991),
	CONSTRAINT "ai_operator_action_terminal" CHECK (("ai_operator_action_budgets"."state"='active' and "ai_operator_action_budgets"."consumed_micros" is null and "ai_operator_action_budgets"."settled_at" is null) or ("ai_operator_action_budgets"."state"='settled' and "ai_operator_action_budgets"."consumed_micros" between 0 and "ai_operator_action_budgets"."reserved_micros" and "ai_operator_action_budgets"."settled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_operator_attempt_costs" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"action_id" uuid NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"consumed_micros" bigint,
	"measurement" text,
	"created_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "ai_operator_attempt_nonnegative" CHECK ("ai_operator_attempt_costs"."reserved_micros" >= 0),
	CONSTRAINT "ai_operator_attempt_terminal" CHECK (("ai_operator_attempt_costs"."settled_at" is null and "ai_operator_attempt_costs"."consumed_micros" is null and "ai_operator_attempt_costs"."measurement" is null) or ("ai_operator_attempt_costs"."settled_at" is not null and "ai_operator_attempt_costs"."consumed_micros" between 0 and "ai_operator_attempt_costs"."reserved_micros" and "ai_operator_attempt_costs"."measurement" in ('measured','conservative')))
);
--> statement-breakpoint
CREATE TABLE "ai_operator_daily_budgets" (
	"day" text NOT NULL,
	"scope" text NOT NULL,
	"reserved_micros" bigint DEFAULT 0 NOT NULL,
	"consumed_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_operator_daily_budgets_day_scope_pk" PRIMARY KEY("day","scope"),
	CONSTRAINT "ai_operator_daily_nonnegative" CHECK ("ai_operator_daily_budgets"."reserved_micros" >= 0 and "ai_operator_daily_budgets"."consumed_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_credit_action_authorities" (
	"action_id" uuid PRIMARY KEY NOT NULL,
	"feature_owner_id" uuid NOT NULL,
	"job_kind" text NOT NULL,
	"terminal_state" text NOT NULL,
	"explicit_stop" boolean NOT NULL,
	"outcome" text NOT NULL,
	"attested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_credit_action_authority_outcome" CHECK ("ai_credit_action_authorities"."outcome" in ('success','stopped','failure'))
);
--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" ADD COLUMN "attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_accounting_archived_purchase_movements" ADD CONSTRAINT "ai_accounting_archived_purchase_movements_payment_id_ai_accounting_retired_purchase_lots_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."ai_accounting_retired_purchase_lots"("payment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_accounting_retired_purchase_lots" ADD CONSTRAINT "ai_accounting_retired_purchase_lots_payment_id_ai_accounting_records_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."ai_accounting_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_operator_attempt_costs" ADD CONSTRAINT "ai_operator_attempt_costs_action_id_ai_operator_action_budgets_action_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_operator_action_budgets"("action_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_action_authorities" ADD CONSTRAINT "ai_credit_action_authorities_action_id_ai_credit_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_credit_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_accounting_archived_time_idx" ON "ai_accounting_archived_purchase_movements" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ai_operator_action_owner_idx" ON "ai_operator_action_budgets" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "ai_operator_attempt_action_idx" ON "ai_operator_attempt_costs" USING btree ("action_id");--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" ADD CONSTRAINT "ai_provider_expense_records_attempt_id_ai_credit_action_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."ai_credit_action_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_accounting_records_owner_idx" ON "ai_accounting_records" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "ai_provider_expense_records" ADD CONSTRAINT "ai_provider_expense_records_attempt_id_unique" UNIQUE("attempt_id");--> statement-breakpoint
ALTER TABLE "ai_accounting_settings_revisions" ADD CONSTRAINT "ai_accounting_settings_operator_hierarchy" CHECK ((
            "ai_accounting_settings_revisions"."max_provider_cost_usd_per_action" is null and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_account_day" is null and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_day" is null
        ) or (
            "ai_accounting_settings_revisions"."max_provider_cost_usd_per_action" is not null and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_account_day" is not null and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_day" is not null
            and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_action" ~ '^(0|[1-9][0-9]{0,8})(.[0-9]{1,6})?$'
            and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_account_day" ~ '^(0|[1-9][0-9]{0,8})(.[0-9]{1,6})?$'
            and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_day" ~ '^(0|[1-9][0-9]{0,8})(.[0-9]{1,6})?$'
            and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_action"::numeric > 0
            and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_action"::numeric <= "ai_accounting_settings_revisions"."max_provider_cost_usd_per_account_day"::numeric
            and "ai_accounting_settings_revisions"."max_provider_cost_usd_per_account_day"::numeric <= "ai_accounting_settings_revisions"."max_provider_cost_usd_per_day"::numeric
        ));