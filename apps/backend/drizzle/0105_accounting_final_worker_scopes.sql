-- Forward-only scoped worker financial authority.
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql
-- SHA256: dca391f00cd4a0509a7db6c27c35099ddd411bc53a789eabff3fcf25212acf17
-- Compact operational capacity complements the cross-provider USD authorization.
CREATE OR REPLACE FUNCTION languon_text_dispatch_capacity_allows(owner_value uuid, budget_value jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH limits AS (
  SELECT (budget_value->>'maxCostMicrosPerAttempt')::numeric AS cost,
    (budget_value->>'maxInputTokensPerAttempt')::numeric AS input_tokens,
    (budget_value->>'maxOutputTokensPerAttempt')::numeric AS output_tokens,
    concat_ws(':',budget_value->>'inputCostMicrosPerMillionTokens',budget_value->>'outputCostMicrosPerMillionTokens',budget_value->>'maxCostMicrosPerAttempt',budget_value->>'maxInputTokensPerAttempt',budget_value->>'maxOutputTokensPerAttempt') AS cohort,
    clock_timestamp()-interval '24 hours' AS cutoff
 ), scopes AS (SELECT 'global'::text AS scope,10 AS active_limit,20 AS daily_limit UNION ALL SELECT owner_value::text,3,3),
 usage AS (
  SELECT s.scope,s.active_limit,s.daily_limit,l.cost,l.input_tokens,l.output_tokens,
   coalesce(a.cost,0) AS active_cost,coalesce(a.input_tokens,0) AS active_input,coalesce(a.output_tokens,0) AS active_output,
   coalesce((SELECT sum(b.cost) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.cost) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_cost,
   coalesce((SELECT sum(b.input_tokens) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.input_tokens) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_input,
   coalesce((SELECT sum(b.output_tokens) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.output_tokens) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_output
  FROM scopes s CROSS JOIN limits l LEFT JOIN public.text_ai_capacity_active_totals a ON a.scope=s.scope AND a.cohort=l.cohort
 ) SELECT coalesce(bool_and(active_cost+cost<=cost*active_limit AND active_input+input_tokens<=input_tokens*active_limit AND active_output+output_tokens<=output_tokens*active_limit AND settled_cost+active_cost+cost<=cost*daily_limit AND settled_input+active_input+input_tokens<=input_tokens*daily_limit AND settled_output+active_output+output_tokens<=output_tokens*daily_limit),false) FROM usage;
$$;
REVOKE ALL ON FUNCTION languon_text_dispatch_capacity_allows(uuid,jsonb) FROM PUBLIC;

-- Financial mutations exposed to execution workers are tied to API-owned work.
-- The witness is a claimed typed lease, never a mutable session setting.
CREATE OR REPLACE FUNCTION languon_text_dispatch_execution(action_value uuid, job_value uuid, token_value text, worker_value text, fence_value bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text; row_value jsonb; execution_value jsonb; snapshot_value jsonb; owner_value uuid; table_value text;
BEGIN
 SELECT a.owner_id,p.job_kind INTO owner_value,k FROM public.ai_credit_actions a JOIN public.ai_action_charging_policies p ON p.job_id=a.id AND p.owner_id=a.owner_id WHERE a.id=action_value AND a.state='active';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Dispatch requires its admitted action' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') THEN RAISE EXCEPTION 'Dispatch owner is inactive' USING ERRCODE='23514'; END IF;
 CASE k
  WHEN 'conversation-turn' THEN table_value:='conversation_turns';
  WHEN 'portrait-interview' THEN table_value:='learner_portrait_interview_operations';
  WHEN 'dictionary-generation' THEN table_value:='dictionary_generation_jobs';
  WHEN 'sentence-generation','sentence-check' THEN table_value:='sentence_ai_jobs';
  WHEN 'text-detection','text-translation' THEN table_value:='texts_ai_jobs';
  WHEN 'text-selection-card' THEN table_value:='dictionary_text_selection_jobs';
  ELSE RAISE EXCEPTION 'Unsupported dispatch feature' USING ERRCODE='23514';
 END CASE;
 EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',table_value) INTO row_value USING job_value;
 IF row_value IS NULL OR coalesce(row_value->>'owner_id',row_value->>'learner_id') IS DISTINCT FROM owner_value::text THEN RAISE EXCEPTION 'Dispatch feature ownership mismatch' USING ERRCODE='23514'; END IF;
 IF k IN ('conversation-turn','portrait-interview') THEN
  IF job_value<>action_value OR coalesce(row_value->>'status',row_value->>'state')<>'running' OR token_value IS NULL OR row_value->>'lease_token' IS DISTINCT FROM token_value OR row_value->>'lease_until' IS NULL OR (row_value->>'lease_until')::timestamptz<=clock_timestamp() OR coalesce((row_value->>'cancel_requested')::boolean,false) THEN RAISE EXCEPTION 'Dispatch requires the current live lease' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'execution';
 ELSE
  IF row_value->>'execution_state'<>'running' OR worker_value IS NULL OR fence_value IS NULL OR row_value->>'worker_id' IS DISTINCT FROM worker_value OR (row_value->>'fencing_token')::bigint IS DISTINCT FROM fence_value OR row_value->>'lease_deadline' IS NULL OR (row_value->>'lease_deadline')::timestamptz<=clock_timestamp() OR row_value->>'cancellation_requested_at' IS NOT NULL THEN RAISE EXCEPTION 'Dispatch requires the current live worker fence' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'selected_execution_snapshot';
  IF job_value<>action_value THEN
   IF execution_value->>'actionParentId' IS DISTINCT FROM action_value::text OR NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions m JOIN public.sentence_preparation_children c ON c.preparation_id=m.preparation_id WHERE m.action_id=action_value AND c.job_id=job_value AND m.terminal_outcome IS NULL AND (m.selected_execution_snapshot-'actionParentId')=(execution_value-'actionParentId')) THEN RAISE EXCEPTION 'Preparation child has no admitted parent' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF execution_value->>'actionAccountingVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Dispatch requires immutable accounting execution' USING ERRCODE='23514'; END IF;
 RETURN execution_value || CASE WHEN k IN ('conversation-turn','portrait-interview') THEN '{}'::jsonb ELSE jsonb_build_object('dispatchJobAttempt',(row_value->>'attempt_count')::integer) END;
END $$;
REVOKE ALL ON FUNCTION languon_text_dispatch_execution(uuid,uuid,text,text,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_admit_text_provider_attempt(action_value uuid, call_value uuid, purpose_value text, input_value integer, output_value integer, job_value uuid, token_value text, worker_value text, fence_value bigint, at_value timestamptz) RETURNS public.ai_credit_action_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; e jsonb; s jsonb; b jsonb; p public.ai_provider_price_revisions%ROWTYPE; price_value jsonb; result public.ai_credit_action_attempts%ROWTYPE; used_output bigint; used_input bigint; used_cost bigint; reserved_value bigint; available_cost bigint; affordable bigint; spent numeric; input_rate numeric; output_rate numeric; credit_input numeric; credit_output numeric; count_value integer; support_count integer; answer_count integer; owner_value uuid; kind_value text; dispatch_value timestamptz:=date_trunc('milliseconds',clock_timestamp());
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT ca.owner_id,policy_row.job_kind INTO owner_value,kind_value FROM public.ai_credit_actions ca JOIN public.ai_action_charging_policies policy_row ON policy_row.job_id=ca.id WHERE ca.id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 IF a.state<>'active' OR a.deadline_at<=clock_timestamp() OR input_value IS NULL OR input_value<0 OR output_value IS NULL OR output_value<1 OR purpose_value NOT IN ('answer','observation','reflection') THEN RAISE EXCEPTION 'Action execution allowance is unavailable' USING ERRCODE='23514'; END IF;
 e:=public.languon_text_dispatch_execution(action_value,job_value,token_value,worker_value,fence_value);
 IF kind_value='portrait-interview' AND purpose_value<>'answer' THEN RAISE EXCEPTION 'Interview only authorizes answer calls' USING ERRCODE='23514'; END IF;
 s:=coalesce(e->'snapshot',e); b:=coalesce(e->'budget',s->'aggregateBudget'); price_value:=coalesce(e->'providerPrice',e->'actionProviderPrice');
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(price_value->>'id')::uuid;
 IF p.id IS NULL OR p.provider_id IS DISTINCT FROM s->>'providerId' OR p.model_id IS DISTINCT FROM s->>'modelId' OR p.meter<>'text-tokens' OR p.version IS DISTINCT FROM (price_value->>'version')::integer OR p.effective_at>a.created_at OR p.data->>'inputUsdPerMillionTokens' IS NULL OR p.data->>'outputUsdPerMillionTokens' IS NULL THEN RAISE EXCEPTION 'Dispatch requires its reviewed immutable provider rate' USING ERRCODE='23514'; END IF;
 input_rate:=greatest((p.data->>'inputUsdPerMillionTokens')::numeric,coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0),coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0))*1000000;
 output_rate:=(p.data->>'outputUsdPerMillionTokens')::numeric*1000000;
 b:=b||jsonb_build_object('inputCostMicrosPerMillionTokens',input_rate::bigint,'outputCostMicrosPerMillionTokens',output_rate::bigint);
 IF NOT public.languon_text_dispatch_capacity_allows(owner_value,b) THEN RAISE EXCEPTION 'Provider operational capacity is unavailable' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(*) FILTER(WHERE purpose<>'answer'),count(*) FILTER(WHERE purpose='answer'),coalesce(sum(coalesce(output_tokens,output_limit)),0),coalesce(sum(coalesce(input_tokens,input_limit)),0),coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),coalesce(sum(CASE WHEN purpose='answer' AND (state='dispatched' OR (successful=1 AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value)
   OR EXISTS(SELECT 1 FROM public.sentence_ai_jobs j WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
  ))) THEN
  (coalesce(input_tokens,input_limit)-CASE WHEN state='dispatched' THEN 0 ELSE coalesce(cache_read_tokens,0) END)*CASE WHEN state='dispatched' THEN greatest((a.tariff->>'inputCreditsPerMillionTokens')::numeric,coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)) ELSE (a.tariff->>'inputCreditsPerMillionTokens')::numeric END
  +CASE WHEN state='dispatched' THEN 0 ELSE coalesce(cache_read_tokens,0) END*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)
  +coalesce(output_tokens,output_limit)*(a.tariff->>'outputCreditsPerMillionTokens')::numeric ELSE 0 END),0)*1000
 INTO count_value,support_count,answer_count,used_output,used_input,used_cost,spent FROM public.ai_credit_action_attempts WHERE action_id=action_value;
 IF purpose_value='answer' AND EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND state='dispatched') THEN RAISE EXCEPTION 'Ambiguous running provider answer cannot be retried' USING ERRCODE='23514'; END IF;
 IF purpose_value='answer' AND kind_value='conversation-turn' AND (SELECT count(*) FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND state='settled' AND successful=0)>=2 THEN RAISE EXCEPTION 'Conversation automatic retry allowance is exhausted' USING ERRCODE='23514'; END IF;
 IF e ? 'dispatchJobAttempt' THEN
  IF (e->>'dispatchJobAttempt')::integer NOT BETWEEN 1 AND 2
    OR (SELECT count(*)+1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND execution_job_id=job_value)<>(e->>'dispatchJobAttempt')::integer
    OR ((e->>'dispatchJobAttempt')::integer>1 AND (SELECT count(*)-count(DISTINCT execution_job_id) FROM public.ai_credit_action_attempts WHERE action_id=action_value)>=1) THEN RAISE EXCEPTION 'Typed feature attempt or retry authorization exhausted' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=call_value) OR count_value>=5 OR (purpose_value<>'answer' AND support_count>=2) OR (purpose_value='answer' AND kind_value='portrait-interview' AND answer_count>=2) THEN RAISE EXCEPTION 'Action call limit reached or dispatch replayed' USING ERRCODE='23514'; END IF;
 affordable:=least(output_value,a.output_limit-used_output,(b->>'maxOutputTokensPerAttempt')::bigint-used_output,coalesce((s->>'perCallMaxOutputTokens')::bigint,10000),coalesce((e->>'interviewOutputTokenLimit')::bigint,10000));
 IF input_value>least(coalesce((s->>'perCallMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'admittedMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'interviewInputTokenLimit')::bigint,(b->>'maxInputTokensPerAttempt')::bigint)) OR used_input+input_value>(b->>'maxInputTokensPerAttempt')::bigint THEN RAISE EXCEPTION 'Action input execution allowance exceeded' USING ERRCODE='23514'; END IF;
 IF a.funding='customer' AND purpose_value='answer' THEN
  credit_input:=greatest((a.tariff->>'inputCreditsPerMillionTokens')::numeric,coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric))*1000;
  credit_output:=(a.tariff->>'outputCreditsPerMillionTokens')::numeric*1000;
  IF a.held_milli::numeric*1000000-spent-input_value*credit_input<0 THEN affordable:=0; ELSIF credit_output>0 THEN affordable:=least(affordable,floor((a.held_milli::numeric*1000000-spent-input_value*credit_input)/credit_output)); END IF;
 END IF;
 SELECT reserved_micros-coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0) INTO available_cost FROM public.ai_operator_action_budgets WHERE action_id=action_value AND state='active' FOR UPDATE;
 available_cost:=least(available_cost,(b->>'maxCostMicrosPerAttempt')::bigint-used_cost)-ceil(input_value*input_rate/1000000)::bigint;
 IF available_cost IS NULL OR available_cost<0 THEN affordable:=0; ELSIF output_rate>0 THEN affordable:=least(affordable,floor(available_cost::numeric*1000000/output_rate)); END IF;
 IF affordable<1 THEN RAISE EXCEPTION 'Action affordable output allowance exhausted' USING ERRCODE='23514'; END IF;
 reserved_value:=ceil(input_value*input_rate/1000000)::bigint+ceil(affordable*output_rate/1000000)::bigint;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(action_value,call_value,reserved_value,dispatch_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,created_at) VALUES(call_value,action_value,job_value,count_value+1,purpose_value,'dispatched',b,reserved_value,input_value,affordable,dispatch_value) RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION languon_admit_text_provider_attempt(uuid,uuid,text,integer,integer,uuid,text,text,bigint,timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_credit_action(action_value uuid, outcome_value text, at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; owner_value uuid; numerator numeric; charge_value bigint; remaining bigint; consumed bigint; lot record; measurement_value text; kind_value text; feature_value jsonb; expected_value text; settled_value timestamptz:=clock_timestamp();
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_actions WHERE id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 IF a.state='settled' THEN IF a.outcome IS DISTINCT FROM outcome_value THEN RAISE EXCEPTION 'Action settlement replay differs' USING ERRCODE='23514'; END IF; RETURN; END IF;
 IF outcome_value IS NULL OR outcome_value NOT IN ('success','stopped','failure') OR EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state<>'settled') THEN RAISE EXCEPTION 'Action settlement requires settled observations' USING ERRCODE='23514'; END IF;
 SELECT job_kind INTO kind_value FROM public.ai_action_charging_policies WHERE job_id=action_value;
 feature_value:=public.languon_ai_credit_feature_authority(action_value,kind_value); expected_value:=public.languon_ai_credit_expected_outcome(feature_value);
 IF feature_value IS NULL OR (expected_value IS NOT NULL AND expected_value<>outcome_value) THEN RAISE EXCEPTION 'Action outcome conflicts with its typed feature' USING ERRCODE='23514'; END IF;
 -- Callers publish their validated terminal feature in this same transaction.
 -- Deferred mandatory feature authority rejects any missing/mismatched publication.
 SELECT coalesce(sum((input_tokens-coalesce(cache_read_tokens,0))*(a.tariff->>'inputCreditsPerMillionTokens')::numeric+coalesce(cache_read_tokens,0)*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)+output_tokens*(a.tariff->>'outputCreditsPerMillionTokens')::numeric),0)*1000 INTO numerator FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND successful=1 AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND outcome_value<>'failure' AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value) OR EXISTS(
     SELECT 1 FROM public.sentence_ai_jobs j JOIN public.sentence_preparation_children c ON c.job_id=j.id
       JOIN public.sentence_preparation_actions m ON m.preparation_id=c.preparation_id AND m.action_id=action_value
     WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.selected_execution_snapshot->>'actionParentId'=action_value::text
       AND ((j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
         OR (outcome_value='stopped' AND j.execution_state='cancelled' AND j.cancellation_requested_at IS NOT NULL AND j.failure_category='explicit_stop'))
   ));
 charge_value:=CASE WHEN a.funding='customer' THEN least(a.held_milli,ceil(numerator/1000000)::bigint) ELSE 0 END;
 remaining:=charge_value;
 FOR lot IN SELECT * FROM public.ai_credit_action_allocations WHERE action_id=action_value ORDER BY grant_id FOR UPDATE LOOP
  consumed:=least(remaining,lot.allocated_milli); UPDATE public.ai_credit_action_allocations SET settled_milli=consumed WHERE action_id=action_value AND grant_id=lot.grant_id; remaining:=remaining-consumed;
 END LOOP;
 IF remaining<>0 THEN RAISE EXCEPTION 'Action hold allocations are inconsistent' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_operator_attempt_costs SET consumed_micros=reserved_micros,measurement='conservative',settled_at=clock_timestamp() WHERE action_id=action_value AND settled_at IS NULL;
 UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0),settled_at=clock_timestamp() WHERE action_id=action_value AND state='active';
 SELECT CASE WHEN bool_and(input_tokens IS NOT NULL AND output_tokens IS NOT NULL) IS DISTINCT FROM false THEN 'measured' ELSE 'unknown' END INTO measurement_value FROM public.ai_credit_action_attempts WHERE action_id=action_value;
 UPDATE public.ai_credit_actions SET state='settled',outcome=outcome_value,charged_milli=charge_value,measurement=measurement_value,settled_at=settled_value WHERE id=action_value;
 INSERT INTO public.ai_credit_history(id,owner_id,amount,kind,measurement,created_at) VALUES(gen_random_uuid(),owner_value,-charge_value,'settlement',CASE WHEN charge_value>0 THEN 'provider_reported'::public.ai_credit_measurement ELSE NULL END,settled_value);
 IF a.held_milli>charge_value THEN INSERT INTO public.ai_credit_history(id,owner_id,amount,kind,created_at) VALUES(gen_random_uuid(),owner_value,a.held_milli-charge_value,'release',settled_value); END IF;
END $$;
REVOKE ALL ON FUNCTION languon_settle_credit_action(uuid,text,timestamptz) FROM PUBLIC;

-- Speech is indivisible and uses only its API-pinned character count/rate.
-- Retire the previous unfenced overload even if a role script was not reapplied.
CREATE OR REPLACE FUNCTION languon_admit_speech_provider_attempt(job_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Speech dispatch requires the current live lease witness' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_admit_speech_provider_attempt(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_admit_speech_provider_attempt(job_value uuid, lease_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; maximum_value bigint; owner_value uuid;
BEGIN
 SELECT payer_id INTO owner_value FROM public.speech_jobs WHERE id=job_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Prepared speech owner is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.state<>'submitting' OR lease_value IS NULL OR j.lease_token IS DISTINCT FROM lease_value OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() OR j.task_id IS NOT NULL OR j.provider_dispatched_at IS NOT NULL OR j.queue_deadline<=clock_timestamp() OR j.billing_deadline<=clock_timestamp() OR j.payer_id IS DISTINCT FROM owner_value OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.payer_id AND status='active') THEN RAISE EXCEPTION 'Speech dispatch requires its prepared queued job' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF p.id IS NULL OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.meter<>'speech-characters' OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId' OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId' OR p.effective_at>j.created_at THEN RAISE EXCEPTION 'Speech reviewed rate is missing' USING ERRCODE='23514'; END IF;
 maximum_value:=ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint;
 IF maximum_value IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE action_id=j.id AND owner_id=j.payer_id AND state='active' AND reserved_micros>=maximum_value) THEN RAISE EXCEPTION 'Speech operator authorization is missing' USING ERRCODE='23514'; END IF;
 IF j.reservation_id IS NOT NULL THEN
  UPDATE public.ai_credit_reservations SET dispatched_at=coalesce(dispatched_at,clock_timestamp())
    WHERE id=j.reservation_id AND job_id=j.id AND job_kind='speech-generation' AND owner_id=j.payer_id AND state='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Speech dispatch requires its existing customer authorization' USING ERRCODE='23514'; END IF;
 ELSIF j.billing_state='reserved' THEN RAISE EXCEPTION 'Paid speech has no customer authorization' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(j.id,j.id,maximum_value,clock_timestamp());
 UPDATE public.speech_jobs SET provider_dispatched_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION languon_admit_speech_provider_attempt(uuid,uuid) FROM PUBLIC;

-- Execution workers cannot alter current admission counters or choose the cutoff.
CREATE OR REPLACE FUNCTION languon_cleanup_speech_admission_counters(batch_value integer DEFAULT 1000) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE removed_value integer;
BEGIN
 IF batch_value IS NULL OR batch_value<1 OR batch_value>1000 THEN RAISE EXCEPTION 'Speech quota cleanup batch must be between 1 and 1000' USING ERRCODE='23514'; END IF;
 WITH expired AS (
  SELECT day,scope FROM public.speech_daily_admission_counters
   WHERE day<((clock_timestamp() AT TIME ZONE 'UTC')-interval '7 days')::date::text
   ORDER BY day,scope LIMIT batch_value FOR UPDATE SKIP LOCKED
 ) DELETE FROM public.speech_daily_admission_counters c USING expired e WHERE c.day=e.day AND c.scope=e.scope;
 GET DIAGNOSTICS removed_value=ROW_COUNT;
 RETURN removed_value;
END $$;
REVOKE ALL ON FUNCTION languon_cleanup_speech_admission_counters(integer) FROM PUBLIC;
--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-purge-recovery.sql
-- SHA256: 0e9b09463cefcb3d9c36620ca32ac2e1016a57d0752484f6340816dd71ee2a0c
-- Purge credentials can observe no arbitrary usage, choose no outcome, and
-- recover only the terminal interview belonging to their current deletion claim.
CREATE OR REPLACE FUNCTION languon_recover_purge_interview_action(owner_value uuid,worker_value text,fence_value integer,operation_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE; operation_row public.learner_portrait_interview_operations%ROWTYPE; attempt_row record; outcome_value text;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=operation_value AND owner_id=owner_value FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.ai_action_charging_policies WHERE job_id=operation_value AND owner_id=owner_value AND job_kind='portrait-interview') THEN RAISE EXCEPTION 'Purge recovery requires its owned admitted interview action' USING ERRCODE='23514'; END IF;
 SELECT * INTO operation_row FROM public.learner_portrait_interview_operations WHERE id=operation_value AND owner_id=owner_value FOR UPDATE;
 IF NOT FOUND OR operation_row.state IN ('queued','running') OR operation_row.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Purge recovery requires a terminal unfenced interview' USING ERRCODE='23514'; END IF;
 outcome_value:=public.languon_ai_credit_expected_outcome(public.languon_ai_credit_feature_authority(operation_value,'portrait-interview'));
 IF outcome_value IS NULL OR outcome_value NOT IN ('success','stopped','failure') THEN RAISE EXCEPTION 'Purge recovery has no authoritative terminal outcome' USING ERRCODE='23514'; END IF;
 IF action_row.state='settled' THEN RETURN; END IF;
 FOR attempt_row IN SELECT id FROM public.ai_credit_action_attempts WHERE action_id=operation_value AND state='dispatched' ORDER BY ordinal FOR UPDATE LOOP
   PERFORM public.languon_settle_text_provider_attempt(attempt_row.id,false,NULL,NULL,NULL,NULL,clock_timestamp());
 END LOOP;
 PERFORM public.languon_settle_credit_action(operation_value,outcome_value,clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION languon_recover_purge_interview_action(uuid,text,integer,uuid) FROM PUBLIC;
--> statement-breakpoint
-- Source: apps/backend/src/modules/speech/infrastructure/speech-accounting-guards.sql (fenced purge function)
-- SHA256: 11c954bbf9da0f9a4b7f20d0fcdcb08b2ef6ddde3f4210fccb5128cbcdf860b6
CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_id_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended('actor:'||owner_id_value::text,1920424383));
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT s.* FROM public.speech_jobs s JOIN public.ai_operator_action_budgets b ON b.action_id=s.id WHERE s.payer_id=owner_id_value AND s.accounting_version=1 AND b.state='active' ORDER BY s.id FOR UPDATE OF s LOOP
   IF j.provider_dispatched_at IS NOT NULL THEN PERFORM public.languon_record_speech_provider_expense(j.id,coalesce(j.provider_outcome,'unknown'));
   ELSE UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id; END IF;
 END LOOP;
 PERFORM set_config('languon.speech_worker_version','1',true);
 WITH cancelled AS (UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=null,lease_expires_at=null WHERE payer_id=owner_id_value AND state='queued' RETURNING recording_id)
 UPDATE public.speech_recordings r SET state='deleting',text='',version=version+1 WHERE r.state='pending' AND EXISTS(SELECT 1 FROM cancelled c WHERE c.recording_id=r.id);
 FOR j IN SELECT s.* FROM public.speech_jobs s WHERE s.payer_id=owner_id_value ORDER BY s.id FOR UPDATE LOOP
   IF j.reservation_id IS NOT NULL AND j.billing_state='reserved' THEN PERFORM public.languon_settle_speech_customer(j.reservation_id,'failure'); END IF;
   UPDATE public.speech_jobs SET payer_id=NULL,reservation_id=NULL,billing_state=CASE WHEN billing_state='reserved' THEN 'released_no_charge' ELSE billing_state END WHERE id=j.id;
 END LOOP;
 DELETE FROM public.speech_quotes WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_bindings WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_daily_admission_counters WHERE scope='owner:'||owner_id_value::text;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid,text,integer) FROM PUBLIC;
