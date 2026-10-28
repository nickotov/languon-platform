-- A native SDK call owns an immutable DB-clock receipt; callers cannot choose its pricing instant.
CREATE OR REPLACE FUNCTION languon_authorize_native_text_call(attempt_value uuid, input_value integer, output_value integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; action_row public.ai_credit_actions%ROWTYPE; witness jsonb; k text; table_value text; feature jsonb; receipt public.text_ai_route_dispatches%ROWTYPE; pin public.ai_provider_price_revisions%ROWTYPE; clock_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); counted integer; used_input bigint; used_output bigint; call_value uuid:=gen_random_uuid(); selected jsonb; check_value jsonb; prior public.ai_credit_native_call_dispatches%ROWTYPE; prior_cost bigint; known_n numeric:=0; known_d numeric:=1; part_n numeric; part_d numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT c.* INTO action_row FROM public.ai_credit_actions c JOIN public.ai_credit_action_attempts t ON t.action_id=c.id WHERE t.id=attempt_value;
 IF action_row.id IS NULL OR action_row.state<>'active' OR action_row.deadline_at<=clock_value THEN RAISE EXCEPTION 'Native call requires its active parent action' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(action_row.owner_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value FOR UPDATE;
 SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=a.action_id FOR UPDATE;
 clock_value:=date_trunc('milliseconds',clock_timestamp());
 IF action_row.id IS NULL OR action_row.state<>'active' OR action_row.deadline_at<=clock_value THEN RAISE EXCEPTION 'Native parent authority expired while waiting' USING ERRCODE='23514'; END IF;
 IF a.state<>'dispatched' OR input_value IS NULL OR input_value<0 OR output_value IS NULL OR output_value<1 OR a.provider_dispatch_witness IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=action_row.owner_id AND status='active') THEN RAISE EXCEPTION 'Native call requires an admitted dispatched attempt' USING ERRCODE='23514'; END IF;
 SELECT * INTO receipt FROM public.text_ai_route_dispatches WHERE attempt_id=a.id;
 SELECT * INTO pin FROM public.ai_provider_price_revisions WHERE id=(receipt.provider_price->>'id')::uuid;
 IF pin.id IS NULL OR NOT pin.data ? 'nativeRules' OR pin.version IS DISTINCT FROM (receipt.provider_price->>'version')::integer OR pin.provider_id IS DISTINCT FROM receipt.snapshot->>'providerId' OR pin.model_id IS DISTINCT FROM receipt.snapshot->>'modelId' THEN RAISE EXCEPTION 'Native call requires its immutable native pin' USING ERRCODE='23514'; END IF;
 witness:=a.provider_dispatch_witness;
 IF witness->>'jobId' IS DISTINCT FROM a.execution_job_id::text THEN RAISE EXCEPTION 'Native call witness mismatch' USING ERRCODE='23514'; END IF;
 SELECT job_kind INTO k FROM public.ai_action_charging_policies WHERE job_id=a.action_id;
 CASE k
  WHEN 'conversation-turn' THEN table_value:='conversation_turns';
  WHEN 'portrait-interview' THEN table_value:='learner_portrait_interview_operations';
  WHEN 'dictionary-generation' THEN table_value:='dictionary_generation_jobs';
  WHEN 'sentence-generation','sentence-check' THEN table_value:='sentence_ai_jobs';
  WHEN 'text-detection','text-translation' THEN table_value:='texts_ai_jobs';
  WHEN 'text-selection-card' THEN table_value:='dictionary_text_selection_jobs';
  ELSE RAISE EXCEPTION 'Native call has no supported typed feature' USING ERRCODE='23514';
 END CASE;
 EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',table_value) INTO feature USING a.execution_job_id;
 IF feature IS NULL OR coalesce(feature->>'owner_id',feature->>'learner_id') IS DISTINCT FROM action_row.owner_id::text THEN RAISE EXCEPTION 'Native call feature ownership mismatch' USING ERRCODE='23514'; END IF;
 IF k IN ('conversation-turn','portrait-interview') THEN
  IF coalesce(feature->>'status',feature->>'state')<>'running' OR witness->>'token' IS NULL OR feature->>'lease_token' IS DISTINCT FROM witness->>'token' OR feature->>'lease_until' IS NULL OR (feature->>'lease_until')::timestamptz<=clock_value OR coalesce((feature->>'cancel_requested')::boolean,false) THEN RAISE EXCEPTION 'Native call requires its original live lease' USING ERRCODE='23514'; END IF;
 ELSE
  IF feature->>'execution_state'<>'running' OR witness->>'worker' IS NULL OR witness->>'fence' IS NULL OR feature->>'worker_id' IS DISTINCT FROM witness->>'worker' OR feature->>'fencing_token' IS DISTINCT FROM witness->>'fence' OR feature->>'lease_deadline' IS NULL OR (feature->>'lease_deadline')::timestamptz<=clock_value OR feature->>'cancellation_requested_at' IS NOT NULL THEN RAISE EXCEPTION 'Native call requires its original live worker fence' USING ERRCODE='23514'; END IF;
 END IF;
 IF receipt.snapshot ? 'routingAuthority' THEN
  SELECT candidate INTO selected FROM jsonb_array_elements(receipt.snapshot->'routingAuthority'->'candidates') candidate WHERE candidate->>'routeId'=receipt.route_id;
  IF selected IS NULL OR NOT EXISTS(SELECT 1 FROM public.text_ai_routing_state s JOIN public.text_ai_routing_revisions r ON r.id=s.active_revision_id WHERE s.id='global' AND r.configuration->'enabledRouteIds' ? receipt.route_id) OR NOT public.languon_text_ai_route_dispatch_allowed(receipt.route_id,receipt.snapshot->'routingAuthority'->>'flowId',selected->>'fingerprint',clock_value) THEN RAISE EXCEPTION 'Native route excluded before HTTP dispatch' USING ERRCODE='23514'; END IF;
 END IF;
 counted:=0; used_input:=0; used_output:=0;
 FOR prior IN SELECT * FROM public.ai_credit_native_call_dispatches WHERE attempt_id=attempt_value ORDER BY ordinal LOOP
  counted:=counted+1;
  check_value:=public.languon_evaluate_provider_price(pin.data,coalesce(prior.provider_execution_facts,'{}'::jsonb)||jsonb_build_object('dispatchedAt',to_char(prior.dispatched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),coalesce(prior.provider_usage,jsonb_build_object('requests',1)),'actual');
  IF check_value->>'status'='calculated' THEN
   prior_cost:=(check_value->>'amountUsdMicros')::bigint;
   used_input:=used_input+coalesce((prior.provider_usage->>'inputTokens')::bigint,prior.input_limit);
   used_output:=used_output+coalesce((prior.provider_usage->>'outputTokens')::bigint,prior.output_limit);
  ELSE
   -- Missing financial evidence keeps the complete issued bounds reserved.
   used_input:=used_input+prior.input_limit; used_output:=used_output+prior.output_limit;
   check_value:=public.languon_native_text_reservation(pin.data,jsonb_build_object('dispatchedAt',to_char(prior.dispatched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),prior.input_limit,prior.output_limit,1);
   IF check_value->>'status'<>'calculated' THEN RAISE EXCEPTION 'Prior native call has no finite reservation' USING ERRCODE='23514'; END IF;
   prior_cost:=(check_value->>'amountUsdMicros')::bigint;
  END IF;
  part_n:=(check_value->>'usdNumerator')::numeric; part_d:=(check_value->>'usdDenominator')::numeric;
  known_n:=known_n*part_d+part_n*known_d; known_d:=known_d*part_d;
 END LOOP;
 IF counted>=5 OR used_input+input_value>a.input_limit OR used_output+output_value>a.output_limit THEN RAISE EXCEPTION 'Native calls exceed the parent envelope' USING ERRCODE='23514'; END IF;
 check_value:=public.languon_native_text_reservation(pin.data,jsonb_build_object('dispatchedAt',to_char(clock_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'latestDispatchAt',to_char((date_trunc('milliseconds',action_row.deadline_at-interval '1 microsecond')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),(a.input_limit-used_input)::integer,(a.output_limit-used_output)::integer,5-counted);
 IF check_value->>'status'<>'calculated' OR div((known_n*(check_value->>'usdDenominator')::numeric+(check_value->>'usdNumerator')::numeric*known_d)*1000000+known_d*(check_value->>'usdDenominator')::numeric-1,known_d*(check_value->>'usdDenominator')::numeric)>a.reserved_cost_micros THEN RAISE EXCEPTION 'Native rate changed outside its reserved dispatch bound' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_credit_native_call_dispatches(id,attempt_id,ordinal,input_limit,output_limit,dispatched_at) VALUES(call_value,attempt_value,counted+1,input_value,output_value,clock_value);
 RETURN jsonb_build_object('callId',call_value,'dispatchedAt',to_char(clock_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;
REVOKE ALL ON FUNCTION languon_authorize_native_text_call(uuid,integer,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_observe_native_text_call(call_value uuid, observations_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.ai_credit_native_call_dispatches%ROWTYPE; a public.ai_credit_action_attempts%ROWTYPE; usage_value jsonb; facts_value jsonb; k text; val jsonb; n numeric; pin public.ai_provider_price_revisions%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.ai_credit_native_call_dispatches WHERE id=call_value;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Native observation has no issued dispatch receipt' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=r.attempt_id;
 PERFORM pg_advisory_xact_lock(hashtextextended((SELECT owner_id::text FROM public.ai_credit_actions WHERE id=a.action_id),1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO r FROM public.ai_credit_native_call_dispatches WHERE id=call_value FOR UPDATE;
 IF NOT public.languon_native_object(observations_value,ARRAY['usage','execution']) OR NOT observations_value ? 'usage' OR octet_length(observations_value::text)>16384 THEN RAISE EXCEPTION 'Invalid native observation' USING ERRCODE='23514'; END IF;
 usage_value:=observations_value->'usage'; facts_value:=coalesce(observations_value->'execution','{}'::jsonb);
 SELECT p.* INTO pin FROM public.text_ai_route_dispatches d JOIN public.ai_provider_price_revisions p ON p.id=(d.provider_price->>'id')::uuid AND p.version=(d.provider_price->>'version')::integer WHERE d.attempt_id=r.attempt_id;
 IF pin.id IS NULL OR (usage_value ? 'providerCostUsd' AND pin.provider_id<>'openrouter') OR (usage_value ? 'providerCreditsConsumed' AND (pin.provider_id<>'kie' OR pin.data->'nativeRules'->>'reportedCreditUsdPerCredit' IS NULL)) THEN RAISE EXCEPTION 'Reported monetary evidence is not supported by this immutable provider pin' USING ERRCODE='23514'; END IF;
 IF NOT public.languon_native_object(usage_value,ARRAY['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','characters','requests','providerCreditsConsumed','providerCostUsd']) OR NOT usage_value ? 'requests' OR NOT public.languon_native_object(facts_value,ARRAY['endpointId','serviceTier']) THEN RAISE EXCEPTION 'Invalid native observation fields' USING ERRCODE='23514'; END IF;
 FOR k,val IN SELECT * FROM jsonb_each(usage_value) LOOP
  IF k IN ('providerCreditsConsumed','providerCostUsd') THEN IF jsonb_typeof(val)<>'string' THEN RAISE EXCEPTION 'Invalid reported amount' USING ERRCODE='23514'; END IF; PERFORM public.languon_native_decimal(val#>>'{}');
  ELSE n:=public.languon_native_count(val); END IF;
 END LOOP;
 IF (usage_value->>'requests')::numeric NOT IN (0,1) OR coalesce((usage_value->>'inputTokens')::numeric,0)>r.input_limit OR coalesce((usage_value->>'outputTokens')::numeric,0)>r.output_limit OR (usage_value ? 'inputTokens' AND coalesce((usage_value->>'cacheReadTokens')::numeric,0)+coalesce((usage_value->>'cacheWriteTokens')::numeric,0)>(usage_value->>'inputTokens')::numeric) THEN RAISE EXCEPTION 'Native observation exceeds its issued envelope' USING ERRCODE='23514'; END IF;
 FOR k,val IN SELECT * FROM jsonb_each(facts_value) LOOP IF jsonb_typeof(val)<>'string' OR length(btrim(val#>>'{}')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid native execution selector' USING ERRCODE='23514'; END IF; END LOOP;
 IF r.observed_at IS NOT NULL THEN
  IF r.provider_usage IS DISTINCT FROM usage_value OR r.provider_execution_facts IS DISTINCT FROM facts_value THEN RAISE EXCEPTION 'Native observation replay differs' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 -- Late financial observations remain useful for reconciliation; they never mutate a frozen parent expense.
 UPDATE public.ai_credit_native_call_dispatches SET provider_usage=usage_value,provider_execution_facts=facts_value,observed_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION languon_observe_native_text_call(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_parent_calls(attempt_value uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('callId',id,'usage',coalesce(provider_usage,jsonb_build_object('requests',1)),'execution',coalesce(provider_execution_facts,'{}'::jsonb)||jsonb_build_object('dispatchedAt',to_char(dispatched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) ORDER BY ordinal),'[]'::jsonb)
 FROM public.ai_credit_native_call_dispatches WHERE attempt_id=attempt_value;
$$;
REVOKE ALL ON FUNCTION languon_native_parent_calls(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_parent_expense(price_data jsonb, attempt_value uuid, frozen_calls jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE call_value jsonb; receipt public.ai_credit_native_call_dispatches%ROWTYPE; result_value jsonb; n numeric:=0; d numeric:=1; part_n numeric; part_d numeric; ids uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF frozen_calls IS NULL OR jsonb_typeof(frozen_calls)<>'array' OR jsonb_array_length(frozen_calls)>5 OR jsonb_array_length(frozen_calls)<>(SELECT count(*) FROM public.ai_credit_native_call_dispatches WHERE attempt_id=attempt_value) THEN RAISE EXCEPTION 'Native parent receipt set is incomplete'; END IF;
 IF jsonb_array_length(frozen_calls)=0 THEN RETURN jsonb_build_object('status','calculated','amountUsdMicros','0'); END IF;
 FOR call_value IN SELECT value FROM jsonb_array_elements(frozen_calls) LOOP
  IF NOT public.languon_native_object(call_value,ARRAY['callId','usage','execution']) OR NOT call_value ?& ARRAY['callId','usage','execution'] OR (call_value->>'callId')::uuid=ANY(ids) THEN RAISE EXCEPTION 'Invalid native parent call'; END IF;
  ids:=array_append(ids,(call_value->>'callId')::uuid);
  SELECT * INTO receipt FROM public.ai_credit_native_call_dispatches WHERE id=(call_value->>'callId')::uuid AND attempt_id=attempt_value;
  IF receipt.id IS NULL OR (call_value->'execution'->>'dispatchedAt')::timestamptz IS DISTINCT FROM receipt.dispatched_at THEN RAISE EXCEPTION 'Native call has no matching DB clock receipt'; END IF;
  result_value:=public.languon_evaluate_provider_price(price_data,call_value->'execution',call_value->'usage','actual');
  IF result_value->>'status'<>'calculated' THEN RETURN result_value; END IF;
  part_n:=(result_value->>'usdNumerator')::numeric; part_d:=(result_value->>'usdDenominator')::numeric;
  n:=n*part_d+part_n*d; d:=d*part_d;
 END LOOP;
 IF div(n*1000000+d-1,d)>9223372036854775807 THEN RAISE EXCEPTION 'Native parent monetary amount exceeds supported storage'; END IF;
 RETURN jsonb_build_object('status','calculated','amountUsdMicros',div(n*1000000+d-1,d)::text);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','unknown','reason','Native call receipt or metering evidence is incomplete.');
END $$;
REVOKE ALL ON FUNCTION languon_native_parent_expense(jsonb,uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_native_call_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id) THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.observed_at IS NULL AND NEW.observed_at IS NOT NULL AND NEW.provider_usage IS NOT NULL AND (to_jsonb(NEW)-ARRAY['provider_usage','provider_execution_facts','observed_at'])=(to_jsonb(OLD)-ARRAY['provider_usage','provider_execution_facts','observed_at']) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Native provider dispatch receipts are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS ai_credit_native_call_receipt_guard ON public.ai_credit_native_call_dispatches;
CREATE TRIGGER ai_credit_native_call_receipt_guard BEFORE UPDATE OR DELETE ON public.ai_credit_native_call_dispatches FOR EACH ROW EXECUTE FUNCTION languon_guard_native_call_receipt();
