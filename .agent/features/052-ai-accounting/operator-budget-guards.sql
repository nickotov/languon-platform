-- A client-settable marker alone never authorizes anonymization or counter removal.
CREATE OR REPLACE FUNCTION languon_operator_purge_authorized(owner_value uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT current_setting('languon.ai_credit_purge_owner',true)=owner_value::text
    AND EXISTS(SELECT 1 FROM public.users u JOIN public.account_deletion_requests d ON d.user_id=u.id
      WHERE u.id=owner_value AND u.status='deletion_pending' AND d.state='running'
        AND d.purge_at<=clock_timestamp() AND d.lease_deadline>clock_timestamp()
        AND d.lease_worker_id IS NOT NULL AND d.fencing_token>0);
$$;
--> statement-breakpoint
-- All model, capability and revision cohorts share these UTC daily money counters.
CREATE OR REPLACE FUNCTION languon_operator_daily_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.scope='owner:'||current_setting('languon.ai_credit_purge_owner',true)
    AND languon_operator_purge_authorized(substring(OLD.scope from 7)::uuid)
    AND NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets a WHERE a.owner_id::text=current_setting('languon.ai_credit_purge_owner',true) AND a.state='active') THEN
    RETURN OLD;
  END IF;
  IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Operator daily totals may only change through action reservations'; END IF;
  IF TG_OP='UPDATE' AND (NEW.day<>OLD.day OR NEW.scope<>OLD.scope OR NEW.consumed_micros<OLD.consumed_micros) THEN
    RAISE EXCEPTION 'Operator daily totals are immutable apart from accounting deltas';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER languon_operator_daily_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_operator_daily_budgets
FOR EACH ROW EXECUTE FUNCTION languon_operator_daily_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_operator_action_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE budget_row record;
DECLARE action_usage bigint;
DECLARE settings_row public.ai_accounting_settings_revisions%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL
    AND languon_operator_purge_authorized(OLD.owner_id)
    AND (to_jsonb(NEW)-'owner_id')=(to_jsonb(OLD)-'owner_id') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.owner_id,OLD.owner_id)::text,1920424381));
  PERFORM pg_advisory_xact_lock(1920424395);
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operator action accounting must be retained'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO settings_row FROM public.ai_accounting_settings_revisions ORDER BY version DESC LIMIT 1;
    IF settings_row.id IS NULL OR settings_row.max_provider_cost_usd_per_action IS NULL
      OR settings_row.max_provider_cost_usd_per_account_day IS NULL OR settings_row.max_provider_cost_usd_per_day IS NULL
      OR NEW.reserved_micros>(settings_row.max_provider_cost_usd_per_action::numeric*1000000)::bigint
      OR NEW.owner_day_limit_micros IS DISTINCT FROM (settings_row.max_provider_cost_usd_per_account_day::numeric*1000000)::bigint
      OR NEW.global_day_limit_micros IS DISTINCT FROM (settings_row.max_provider_cost_usd_per_day::numeric*1000000)::bigint THEN
      RAISE EXCEPTION 'Operator authorization must use the current reviewed application limits' USING ERRCODE='23514';
    END IF;
    IF NEW.owner_id IS NULL OR NEW.day<>to_char(NEW.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') OR NEW.state<>'active'
      OR NEW.reserved_micros>NEW.owner_day_limit_micros OR NEW.reserved_micros>NEW.global_day_limit_micros THEN
      RAISE EXCEPTION 'Operator action authorization is invalid';
    END IF;
    INSERT INTO public.ai_operator_daily_budgets(day,scope) VALUES(NEW.day,'global'),(NEW.day,'owner:'||NEW.owner_id::text) ON CONFLICT DO NOTHING;
    SELECT * INTO budget_row FROM public.ai_operator_daily_budgets WHERE day=NEW.day AND scope='global' FOR UPDATE;
    IF budget_row.reserved_micros+budget_row.consumed_micros+NEW.reserved_micros>NEW.global_day_limit_micros THEN
      RAISE EXCEPTION 'Global operator daily allowance is exhausted';
    END IF;
    SELECT * INTO budget_row FROM public.ai_operator_daily_budgets WHERE day=NEW.day AND scope='owner:'||NEW.owner_id::text FOR UPDATE;
    IF budget_row.reserved_micros+budget_row.consumed_micros+NEW.reserved_micros>NEW.owner_day_limit_micros THEN
      RAISE EXCEPTION 'Account operator daily allowance is exhausted';
    END IF;
    UPDATE public.ai_operator_daily_budgets SET reserved_micros=reserved_micros+NEW.reserved_micros
      WHERE day=NEW.day AND scope IN ('global','owner:'||NEW.owner_id::text);
    RETURN NEW;
  END IF;
  IF OLD.state<>'active' OR NEW.state<>'settled' OR NEW.action_id<>OLD.action_id OR NEW.owner_id<>OLD.owner_id
    OR NEW.day<>OLD.day OR NEW.reserved_micros<>OLD.reserved_micros OR NEW.created_at<>OLD.created_at
    OR NEW.owner_day_limit_micros<>OLD.owner_day_limit_micros OR NEW.global_day_limit_micros<>OLD.global_day_limit_micros THEN
    RAISE EXCEPTION 'Operator action authorization and terminal outcome are immutable';
  END IF;
  SELECT coalesce(sum(coalesce(consumed_micros,reserved_micros)),0) INTO action_usage
    FROM public.ai_operator_attempt_costs WHERE action_id=NEW.action_id;
  IF action_usage<>NEW.consumed_micros OR action_usage>NEW.reserved_micros THEN RAISE EXCEPTION 'Operator action settlement is inconsistent'; END IF;
  UPDATE public.ai_operator_daily_budgets SET reserved_micros=reserved_micros-NEW.reserved_micros,consumed_micros=consumed_micros+NEW.consumed_micros
    WHERE day=NEW.day AND scope IN ('global','owner:'||NEW.owner_id::text) AND reserved_micros>=NEW.reserved_micros;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operator daily projection is inconsistent'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER languon_operator_action_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_operator_action_budgets
FOR EACH ROW EXECUTE FUNCTION languon_operator_action_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_operator_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_operator_action_budgets%ROWTYPE;
DECLARE used bigint;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operator attempt accounting must be retained'; END IF;
  SELECT * INTO action_row FROM public.ai_operator_action_budgets WHERE action_id=NEW.action_id FOR UPDATE;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider attempt has no active operator authorization'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT coalesce(sum(coalesce(consumed_micros,reserved_micros)),0) INTO used FROM public.ai_operator_attempt_costs WHERE action_id=NEW.action_id;
    IF NEW.settled_at IS NOT NULL OR NEW.consumed_micros IS NOT NULL OR used+NEW.reserved_micros>action_row.reserved_micros THEN
      RAISE EXCEPTION 'Provider attempt exceeds operator action authorization';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.settled_at IS NOT NULL OR NEW.settled_at IS NULL OR NEW.attempt_id<>OLD.attempt_id OR NEW.action_id<>OLD.action_id
    OR NEW.reserved_micros<>OLD.reserved_micros OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'Operator provider attempt accounting is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER languon_operator_attempt_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_operator_attempt_costs
FOR EACH ROW EXECUTE FUNCTION languon_operator_attempt_guard();

--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_operator_purge_authorized(uuid) FROM PUBLIC;
