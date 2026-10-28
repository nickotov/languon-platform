-- Known native-provider overruns are incurred facts, never new spending permission.
CREATE OR REPLACE FUNCTION languon_native_overrun_authorized(attempt_value uuid, amount_value bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.ai_provider_expense_records f
  JOIN public.text_ai_route_dispatches d ON d.attempt_id=f.attempt_id
  JOIN public.ai_provider_price_revisions p ON p.id=(d.provider_price->>'id')::uuid
  WHERE f.attempt_id=attempt_value AND f.source_kind='text-attempt' AND f.cost_source='calculated' AND f.amount_usd_micros=amount_value AND p.data ? 'nativeRules'
 ) OR EXISTS(
  SELECT 1 FROM public.ai_provider_expense_records f JOIN public.speech_jobs j ON j.id=f.action_id
  JOIN public.ai_provider_price_revisions p ON p.id=(j.provider_price_snapshot->>'id')::uuid
  WHERE f.action_id=attempt_value AND f.source_kind='speech-attempt' AND f.cost_source='calculated' AND f.amount_usd_micros=amount_value AND p.data ? 'nativeRules'
 );
$$;
REVOKE ALL ON FUNCTION languon_native_overrun_authorized(uuid,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_operator_action_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE budget_row record;
DECLARE action_usage bigint;
DECLARE settings_row public.ai_accounting_settings_revisions%ROWTYPE;
DECLARE excess_value bigint;
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
    SELECT coalesce(sum(greatest(t.consumed_micros-t.reserved_micros,0)),0) INTO excess_value FROM public.ai_operator_attempt_costs t JOIN public.ai_operator_action_budgets b ON b.action_id=t.action_id WHERE b.day=NEW.day AND b.state='active';
    IF budget_row.reserved_micros+budget_row.consumed_micros+excess_value+NEW.reserved_micros>NEW.global_day_limit_micros THEN
      RAISE EXCEPTION 'Global operator daily allowance is exhausted';
    END IF;
    SELECT * INTO budget_row FROM public.ai_operator_daily_budgets WHERE day=NEW.day AND scope='owner:'||NEW.owner_id::text FOR UPDATE;
    SELECT coalesce(sum(greatest(t.consumed_micros-t.reserved_micros,0)),0) INTO excess_value FROM public.ai_operator_attempt_costs t JOIN public.ai_operator_action_budgets b ON b.action_id=t.action_id WHERE b.day=NEW.day AND b.owner_id=NEW.owner_id AND b.state='active';
    IF budget_row.reserved_micros+budget_row.consumed_micros+excess_value+NEW.reserved_micros>NEW.owner_day_limit_micros THEN
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
  IF action_usage<>NEW.consumed_micros OR (action_usage>NEW.reserved_micros AND EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs t WHERE t.action_id=NEW.action_id AND t.consumed_micros>t.reserved_micros AND NOT public.languon_native_overrun_authorized(t.attempt_id,t.consumed_micros))) THEN RAISE EXCEPTION 'Operator action settlement is inconsistent'; END IF;
  UPDATE public.ai_operator_daily_budgets SET reserved_micros=reserved_micros-NEW.reserved_micros,consumed_micros=consumed_micros+NEW.consumed_micros
    WHERE day=NEW.day AND scope IN ('global','owner:'||NEW.owner_id::text) AND reserved_micros>=NEW.reserved_micros;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operator daily projection is inconsistent'; END IF;
  RETURN NEW;
END $$;

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
  IF NEW.consumed_micros>NEW.reserved_micros AND (NEW.measurement<>'measured' OR NOT public.languon_native_overrun_authorized(NEW.attempt_id,NEW.consumed_micros)) THEN RAISE EXCEPTION 'Overrun requires its immutable native expense fact' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
