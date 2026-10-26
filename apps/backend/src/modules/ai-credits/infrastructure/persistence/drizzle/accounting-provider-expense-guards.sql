-- Numerical provenance is resolved behind this seam; worker callers cannot select arbitrary rates.
CREATE OR REPLACE FUNCTION languon_text_provider_expense_identity(attempt_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; k text; execution_value jsonb; snapshot_value jsonb; price_value jsonb; p public.ai_provider_price_revisions%ROWTYPE; provider_value text; model_value text; amount_value bigint; numerator numeric; ref text;
BEGIN
  SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value;
  IF NOT FOUND OR a.state<>'settled' THEN RAISE EXCEPTION 'Expense requires its settled authoritative attempt' USING ERRCODE='23514'; END IF;
  SELECT job_kind INTO k FROM public.ai_action_charging_policies WHERE job_id=a.action_id;
  CASE k
    WHEN 'conversation-turn' THEN SELECT execution INTO execution_value FROM public.conversation_turns WHERE id=a.action_id; ref:='conversation:';
    WHEN 'portrait-interview' THEN SELECT execution INTO execution_value FROM public.learner_portrait_interview_operations WHERE id=a.action_id; ref:='interview:';
    WHEN 'dictionary-generation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.dictionary_generation_jobs WHERE id=a.action_id; ref:='legacy:';
    WHEN 'sentence-preparation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_preparation_actions WHERE action_id=a.action_id; ref:='legacy:';
    WHEN 'sentence-generation','sentence-check' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_ai_jobs WHERE id=a.action_id; IF execution_value IS NULL THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_preparation_actions WHERE action_id=a.action_id; END IF; ref:='legacy:';
    WHEN 'text-detection','text-translation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.texts_ai_jobs WHERE id=a.action_id; ref:='legacy:';
    WHEN 'text-selection-card' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.dictionary_text_selection_jobs WHERE id=a.action_id; ref:='legacy:';
    ELSE RAISE EXCEPTION 'Expense has no typed feature provenance' USING ERRCODE='23514';
  END CASE;
  snapshot_value:=coalesce(execution_value->'snapshot',execution_value);
  price_value:=coalesce(execution_value->'providerPrice',execution_value->'actionProviderPrice');
  IF EXISTS(SELECT 1 FROM public.text_ai_route_dispatches WHERE attempt_id=attempt_value) THEN
    SELECT snapshot,provider_price INTO snapshot_value,price_value FROM public.text_ai_route_dispatches WHERE attempt_id=attempt_value;
  END IF;
  provider_value:=snapshot_value->>'providerId'; model_value:=snapshot_value->>'modelId';
  SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(price_value->>'id')::uuid;
  IF execution_value->>'actionAccountingVersion' IS DISTINCT FROM '1' OR p.id IS NULL OR p.provider_id IS DISTINCT FROM provider_value OR p.model_id IS DISTINCT FROM model_value OR p.meter<>'text-tokens' OR p.version IS DISTINCT FROM (price_value->>'version')::integer OR p.effective_at>a.created_at THEN
    RAISE EXCEPTION 'Expense requires its immutable reviewed provider pin' USING ERRCODE='23514';
  END IF;
  IF a.input_tokens IS NOT NULL AND a.output_tokens IS NOT NULL THEN
    IF a.input_tokens<0 OR a.output_tokens<0 OR a.input_tokens>a.input_limit OR a.output_tokens>a.output_limit OR coalesce(a.cache_read_tokens,0)+coalesce(a.cache_write_tokens,0)>a.input_tokens THEN RAISE EXCEPTION 'Expense meters exceed admitted attempt' USING ERRCODE='23514'; END IF;
    IF p.data->>'inputUsdPerMillionTokens' IS NOT NULL AND p.data->>'outputUsdPerMillionTokens' IS NOT NULL
       AND (coalesce(a.cache_read_tokens,0)=0 OR p.data->>'cacheReadUsdPerMillionTokens' IS NOT NULL)
       AND (coalesce(a.cache_write_tokens,0)=0 OR p.data->>'cacheWriteUsdPerMillionTokens' IS NOT NULL) THEN
      numerator:=(a.input_tokens-coalesce(a.cache_read_tokens,0)-coalesce(a.cache_write_tokens,0))*(p.data->>'inputUsdPerMillionTokens')::numeric
        +a.output_tokens*(p.data->>'outputUsdPerMillionTokens')::numeric
        +coalesce(a.cache_read_tokens,0)*coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0)
        +coalesce(a.cache_write_tokens,0)*coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0);
      amount_value:=greatest(ceil(numerator)::bigint,CASE WHEN a.input_tokens+a.output_tokens>0 THEN ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint ELSE 0 END); -- USD/token-million * micro-USD/USD cancels exactly.
    END IF;
  END IF;
  RETURN jsonb_build_object('attemptId',a.id,'actionId',a.action_id,'attemptReference',ref||a.id::text,'sourceKind','text-attempt','providerId',provider_value,'modelId',model_value,'measurement',CASE WHEN a.input_tokens IS NOT NULL AND a.output_tokens IS NOT NULL THEN 'measured' ELSE 'unknown' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',a.created_at);
END $$;
REVOKE ALL ON FUNCTION languon_text_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_text_provider_expense(attempt_value uuid, assertion_value jsonb DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb; found_row public.ai_provider_expense_records%ROWTYPE; owner_value uuid;
BEGIN
  SELECT c.owner_id INTO owner_value FROM public.ai_credit_action_attempts t JOIN public.ai_credit_actions c ON c.id=t.action_id WHERE t.id=attempt_value;
  IF owner_value IS NULL THEN RAISE EXCEPTION 'Expense attempt is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
  e:=public.languon_text_provider_expense_identity(attempt_value);
  IF assertion_value IS NOT NULL AND (
    assertion_value->>'attemptId' IS DISTINCT FROM e->>'attemptId' OR assertion_value->>'actionId' IS DISTINCT FROM e->>'actionId'
    OR assertion_value->>'attemptReference' IS DISTINCT FROM e->>'attemptReference' OR assertion_value->>'providerId' IS DISTINCT FROM e->>'providerId'
    OR assertion_value->>'modelId' IS DISTINCT FROM e->>'modelId' OR assertion_value->>'measurement' IS DISTINCT FROM e->>'measurement'
    OR assertion_value->>'costSource' IS DISTINCT FROM e->>'costSource' OR assertion_value->>'amountUsdMicros' IS DISTINCT FROM e->>'amountUsdMicros'
    OR (assertion_value->>'occurredAt')::timestamptz IS DISTINCT FROM (e->>'occurredAt')::timestamptz) THEN
    RAISE EXCEPTION 'Provider expense assertion conflicts with authoritative fact' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_id,action_id,attempt_reference,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
    VALUES(gen_random_uuid(),'text-attempt',attempt_value,(e->>'actionId')::uuid,e->>'attemptReference',e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',(e->>'amountUsdMicros')::bigint,(e->>'occurredAt')::timestamptz) ON CONFLICT(attempt_reference) DO NOTHING;
  SELECT * INTO found_row FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
  IF found_row.source_kind<>'text-attempt' OR found_row.attempt_id IS DISTINCT FROM attempt_value OR found_row.action_id IS DISTINCT FROM (e->>'actionId')::uuid OR found_row.provider_id IS DISTINCT FROM e->>'providerId' OR found_row.model_id IS DISTINCT FROM e->>'modelId' OR found_row.measurement IS DISTINCT FROM e->>'measurement' OR found_row.cost_source IS DISTINCT FROM e->>'costSource' OR found_row.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR found_row.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN
    RAISE EXCEPTION 'Provider expense fact conflicts with immutable authority' USING ERRCODE='23514';
  END IF;
  PERFORM public.languon_mark_accounting_reports_dirty();
  RETURN found_row.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_text_provider_expense(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_text_provider_attempt(attempt_value uuid, successful_value boolean, input_value integer, output_value integer, read_value integer, write_value integer, at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; owner_value uuid; e jsonb; cost_value bigint; o public.ai_operator_attempt_costs%ROWTYPE; settled_value timestamptz:=date_trunc('milliseconds',clock_timestamp());
BEGIN
  SELECT c.owner_id INTO owner_value FROM public.ai_credit_action_attempts t JOIN public.ai_credit_actions c ON c.id=t.action_id WHERE t.id=attempt_value;
  IF owner_value IS NULL THEN RAISE EXCEPTION 'Provider attempt is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
  SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value FOR UPDATE;
  IF a.state='settled' THEN
    IF (a.input_tokens,a.output_tokens,a.cache_read_tokens,a.cache_write_tokens,a.successful) IS DISTINCT FROM (input_value,output_value,read_value,write_value,CASE WHEN successful_value AND input_value IS NOT NULL AND output_value IS NOT NULL THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Provider attempt replay differs from immutable usage' USING ERRCODE='23514'; END IF;
    PERFORM public.languon_record_text_provider_expense(attempt_value,NULL); RETURN;
  END IF;
  IF (input_value IS NULL) IS DISTINCT FROM (output_value IS NULL) OR input_value<0 OR output_value<0 OR input_value>a.input_limit OR output_value>a.output_limit OR coalesce(read_value,0)<0 OR coalesce(write_value,0)<0 OR coalesce(read_value,0)+coalesce(write_value,0)>input_value THEN RAISE EXCEPTION 'Invalid provider usage meters' USING ERRCODE='23514'; END IF;
  -- The trigger validates immutable identity; price accounting is derived after these trusted meters persist.
  UPDATE public.ai_credit_action_attempts SET state='settled',input_tokens=input_value,output_tokens=output_value,cache_read_tokens=read_value,cache_write_tokens=write_value,successful=CASE WHEN successful_value AND input_value IS NOT NULL THEN 1 ELSE 0 END,actual_cost_micros=NULL,settled_at=settled_value WHERE id=attempt_value;
  e:=public.languon_text_provider_expense_identity(attempt_value); cost_value:=(e->>'amountUsdMicros')::bigint;
  UPDATE public.ai_credit_action_attempts SET actual_cost_micros=cost_value WHERE id=attempt_value AND actual_cost_micros IS DISTINCT FROM cost_value;
  SELECT * INTO o FROM public.ai_operator_attempt_costs WHERE attempt_id=attempt_value AND action_id=a.action_id FOR UPDATE;
  IF o.attempt_id IS NULL OR (cost_value IS NOT NULL AND cost_value>o.reserved_micros) THEN RAISE EXCEPTION 'Provider cost exceeds its authoritative reservation' USING ERRCODE='23514'; END IF;
  UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(cost_value,reserved_micros),measurement=CASE WHEN cost_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=settled_value WHERE attempt_id=attempt_value AND settled_at IS NULL;
  PERFORM public.languon_record_text_provider_expense(attempt_value,NULL);
END $$;
REVOKE ALL ON FUNCTION languon_settle_text_provider_attempt(uuid,boolean,integer,integer,integer,integer,timestamptz) FROM PUBLIC;

-- Append-only financial facts accept only exact closed numerical provenance.
CREATE OR REPLACE FUNCTION languon_guard_provider_expense_fact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.source_kind='text-attempt' AND NEW.attempt_id IS NOT NULL THEN e:=public.languon_text_provider_expense_identity(NEW.attempt_id);
    ELSIF NEW.source_kind='speech-attempt' AND NEW.attempt_id IS NULL THEN e:=public.languon_speech_provider_expense_identity(NEW.action_id);
    ELSIF NEW.source_kind='admin-probe' AND NEW.attempt_id IS NULL THEN e:=public.languon_probe_provider_expense_identity(NEW.action_id);
    ELSE RAISE EXCEPTION 'Unbound provider expense facts are forbidden' USING ERRCODE='23514'; END IF;
    IF NEW.action_id IS DISTINCT FROM (e->>'actionId')::uuid OR NEW.attempt_reference IS DISTINCT FROM e->>'attemptReference' OR NEW.provider_id IS DISTINCT FROM e->>'providerId' OR NEW.model_id IS DISTINCT FROM e->>'modelId' OR NEW.measurement IS DISTINCT FROM e->>'measurement' OR NEW.cost_source IS DISTINCT FROM e->>'costSource' OR NEW.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR NEW.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN RAISE EXCEPTION 'Provider expense does not match authoritative provenance' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS NULL AND (to_jsonb(NEW)-'attempt_id')=(to_jsonb(OLD)-'attempt_id') AND NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id) AND public.languon_operator_purge_authorized(nullif(current_setting('languon.ai_credit_purge_owner',true),'')::uuid) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Provider expense facts are immutable' USING ERRCODE='23514';
END $$;
