-- Probe provenance is operator-only and never creates a learner action or wallet hold.
CREATE OR REPLACE FUNCTION languon_probe_provider_expense_identity(probe_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.text_ai_probes%ROWTYPE; rate public.ai_provider_price_revisions%ROWTYPE; expected_value bigint; numerator numeric; native_result jsonb; usage_value jsonb;
BEGIN
  SELECT * INTO p FROM public.text_ai_probes WHERE id=probe_value;
  IF p.id IS NULL OR p.state='running' OR p.completed_at IS NULL THEN
    RAISE EXCEPTION 'Probe expense requires completed authoritative probe' USING ERRCODE='23514';
  END IF;
  IF coalesce(p.input_tokens,0)<0 OR coalesce(p.output_tokens,0)<0 OR coalesce(p.cache_read_tokens,0)<0 OR coalesce(p.cache_write_tokens,0)<0 OR coalesce(p.cache_read_tokens,0)+coalesce(p.cache_write_tokens,0)>coalesce(p.input_tokens,0) THEN
    RAISE EXCEPTION 'Invalid probe usage meters' USING ERRCODE='23514';
  END IF;
  SELECT * INTO rate FROM public.ai_provider_price_revisions WHERE id=(p.price->>'id')::uuid;
  IF rate.id IS NULL OR rate.provider_id<>p.provider_id OR rate.model_id<>p.model_id OR rate.meter<>'text-tokens' OR rate.effective_at>p.started_at OR rate.version<>(p.price->>'version')::integer THEN
    RAISE EXCEPTION 'Probe expense requires reviewed price pin' USING ERRCODE='23514';
  END IF;
  IF rate.data ? 'nativeRules' THEN
    IF (p.provider_usage ? 'providerCostUsd' AND rate.provider_id<>'openrouter') OR (p.provider_usage ? 'providerCreditsConsumed' AND (rate.provider_id<>'kie' OR rate.data->'nativeRules'->>'reportedCreditUsdPerCredit' IS NULL)) THEN RAISE EXCEPTION 'Foreign reported probe monetary evidence' USING ERRCODE='23514'; END IF;
    usage_value:=coalesce(p.provider_usage,'{}'::jsonb)||jsonb_build_object('requests',1);
    IF p.input_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('inputTokens',p.input_tokens); END IF;
    IF p.output_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('outputTokens',p.output_tokens); END IF;
    IF p.cache_read_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('cacheReadTokens',p.cache_read_tokens); END IF;
    IF p.cache_write_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('cacheWriteTokens',p.cache_write_tokens); END IF;
    native_result:=public.languon_evaluate_provider_price(rate.data,coalesce(p.provider_execution_facts,'{}'::jsonb)||jsonb_build_object('dispatchedAt',to_char(p.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),usage_value,'actual');
    IF native_result->>'status'='calculated' THEN expected_value:=(native_result->>'amountUsdMicros')::bigint; END IF;
    IF p.failure='budget_insufficient' AND p.input_tokens=0 AND p.output_tokens=0 THEN expected_value:=0; END IF;
  ELSIF p.measurement<>'unknown' AND p.input_tokens IS NOT NULL AND p.output_tokens IS NOT NULL
    AND coalesce(p.cache_read_tokens,0)+coalesce(p.cache_write_tokens,0)<=p.input_tokens
    AND (coalesce(p.cache_read_tokens,0)=0 OR rate.data->>'cacheReadUsdPerMillionTokens' IS NOT NULL)
    AND (coalesce(p.cache_write_tokens,0)=0 OR rate.data->>'cacheWriteUsdPerMillionTokens' IS NOT NULL) THEN
    numerator:=(p.input_tokens-coalesce(p.cache_read_tokens,0)-coalesce(p.cache_write_tokens,0))*(rate.data->>'inputUsdPerMillionTokens')::numeric
      +p.output_tokens*(rate.data->>'outputUsdPerMillionTokens')::numeric
      +coalesce(p.cache_read_tokens,0)*coalesce((rate.data->>'cacheReadUsdPerMillionTokens')::numeric,0)
      +coalesce(p.cache_write_tokens,0)*coalesce((rate.data->>'cacheWriteUsdPerMillionTokens')::numeric,0);
    expected_value:=CASE WHEN p.failure='budget_insufficient' AND p.input_tokens=0 AND p.output_tokens=0 THEN 0 ELSE greatest(ceil(numerator)::bigint,ceil(coalesce((rate.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint) END;
    IF expected_value>p.maximum_micros THEN expected_value:=NULL; END IF;
  END IF;
  IF p.cost_micros IS DISTINCT FROM expected_value THEN RAISE EXCEPTION 'Probe cost differs from authoritative meters' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('actionId',p.id,'attemptReference','admin-probe:'||p.id::text,'sourceKind','admin-probe','providerId',p.provider_id,'modelId',p.model_id,'measurement',CASE WHEN rate.data ? 'nativeRules' AND expected_value IS NOT NULL THEN 'measured' ELSE p.measurement END,'costSource',CASE WHEN p.cost_micros IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',p.cost_micros::text,'occurredAt',p.started_at);
END $$;
REVOKE ALL ON FUNCTION languon_probe_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_probe_provider_expense(probe_value uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb; result_value uuid;
BEGIN
  e:=public.languon_probe_provider_expense_identity(probe_value);
  INSERT INTO public.ai_provider_expense_records(id,source_kind,action_id,attempt_reference,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
  VALUES(gen_random_uuid(),'admin-probe',probe_value,e->>'attemptReference',e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',(e->>'amountUsdMicros')::bigint,(e->>'occurredAt')::timestamptz)
  ON CONFLICT(attempt_reference) DO NOTHING;
  SELECT id INTO result_value FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
  PERFORM public.languon_mark_accounting_reports_dirty();
  RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION languon_record_probe_provider_expense(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_probe_fact() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Probe expense provenance is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL AND (to_jsonb(NEW)-'actor_id')=(to_jsonb(OLD)-'actor_id') AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.actor_id) THEN RETURN NEW; END IF;
  IF OLD.state<>'running' THEN
    RAISE EXCEPTION 'Completed probe facts are immutable' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['state','failure','cost_micros','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','measurement','elapsed_ms','first_output_ms','completed_at','evidence_expires_at','provider_usage','provider_execution_facts'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','failure','cost_micros','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','measurement','elapsed_ms','first_output_ms','completed_at','evidence_expires_at','provider_usage','provider_execution_facts']) THEN
    RAISE EXCEPTION 'Probe authorization cannot change at settlement' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS text_ai_probe_fact_guard ON public.text_ai_probes;
CREATE TRIGGER text_ai_probe_fact_guard BEFORE UPDATE OR DELETE ON public.text_ai_probes FOR EACH ROW EXECUTE FUNCTION languon_guard_probe_fact();

CREATE OR REPLACE FUNCTION languon_guard_probe_recovery() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL AND (to_jsonb(NEW)-'actor_id')=(to_jsonb(OLD)-'actor_id') AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.actor_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Probe recovery attestations are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS text_ai_probe_recovery_guard ON public.text_ai_probe_recoveries;
CREATE TRIGGER text_ai_probe_recovery_guard BEFORE UPDATE OR DELETE ON public.text_ai_probe_recoveries FOR EACH ROW EXECUTE FUNCTION languon_guard_probe_recovery();

-- Retaining incurred native expense never expands the reservation or publishes a passed probe.
-- The AFTER guard reads the just-persisted immutable pin and observations through the same
-- authoritative identity used by append-only expense records; callers cannot choose a cost.
CREATE OR REPLACE FUNCTION languon_guard_native_probe_overrun() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.cost_micros>NEW.maximum_micros THEN
  IF NEW.state<>'failed' OR NEW.completed_at IS NULL OR NOT coalesce(jsonb_typeof(NEW.price->'nativeRules')='object',false) THEN RAISE EXCEPTION 'Probe overrun requires failed native evidence' USING ERRCODE='23514'; END IF;
  PERFORM public.languon_probe_provider_expense_identity(NEW.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_native_probe_overrun() FROM PUBLIC;
DROP TRIGGER IF EXISTS text_ai_native_probe_overrun_guard ON public.text_ai_probes;
CREATE TRIGGER text_ai_native_probe_overrun_guard AFTER INSERT OR UPDATE ON public.text_ai_probes FOR EACH ROW EXECUTE FUNCTION languon_guard_native_probe_overrun();
