-- Compact operational capacity complements the cross-provider USD authorization.
CREATE OR REPLACE FUNCTION languon_text_dispatch_capacity_allows(owner_value uuid, budget_value jsonb, reserved_cost bigint, reserved_input bigint, reserved_output bigint) RETURNS boolean
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
 ) SELECT coalesce(bool_and(active_cost+reserved_cost<=cost*active_limit AND active_input+reserved_input<=input_tokens*active_limit AND active_output+reserved_output<=output_tokens*active_limit AND settled_cost+active_cost+reserved_cost<=cost*daily_limit AND settled_input+active_input+reserved_input<=input_tokens*daily_limit AND settled_output+active_output+reserved_output<=output_tokens*daily_limit),false) FROM usage;
$$;
REVOKE ALL ON FUNCTION languon_text_dispatch_capacity_allows(uuid,jsonb,bigint,bigint,bigint) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_admit_text_provider_attempt(action_value uuid, call_value uuid, purpose_value text, input_value integer, output_value integer, job_value uuid, token_value text, worker_value text, fence_value bigint, at_value timestamptz) RETURNS public.ai_credit_action_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; e jsonb; s jsonb; b jsonb; p public.ai_provider_price_revisions%ROWTYPE; price_value jsonb; result public.ai_credit_action_attempts%ROWTYPE; used_output bigint; used_input bigint; used_cost bigint; reserved_value bigint; available_cost bigint; affordable bigint; spent numeric; input_rate numeric; output_rate numeric; credit_input numeric; credit_output numeric; confirmed_output bigint; minimum_value bigint; call_available bigint; count_value integer; support_count integer; answer_count integer; owner_value uuid; kind_value text; dispatch_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); native_value jsonb; low_value integer; high_value integer; middle_value integer; native_facts jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT ca.owner_id,policy_row.job_kind INTO owner_value,kind_value FROM public.ai_credit_actions ca JOIN public.ai_action_charging_policies policy_row ON policy_row.job_id=ca.id WHERE ca.id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 IF a.state<>'active' OR a.deadline_at<=clock_timestamp() OR input_value IS NULL OR input_value<0 OR output_value IS NULL OR output_value<1 OR purpose_value NOT IN ('answer','observation','reflection') THEN RAISE EXCEPTION 'Action execution allowance is unavailable' USING ERRCODE='23514'; END IF;
 native_facts:=jsonb_build_object('dispatchedAt',to_char(dispatch_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'latestDispatchAt',to_char((date_trunc('milliseconds',a.deadline_at-interval '1 microsecond')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 e:=public.languon_text_dispatch_execution(action_value,job_value,token_value,worker_value,fence_value);
 IF kind_value='portrait-interview' AND purpose_value<>'answer' THEN RAISE EXCEPTION 'Interview only authorizes answer calls' USING ERRCODE='23514'; END IF;
 s:=coalesce(e->'snapshot',e); b:=coalesce(e->'budget',s->'aggregateBudget'); price_value:=coalesce(e->'providerPrice',e->'actionProviderPrice');
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(price_value->>'id')::uuid;
 IF p.id IS NULL OR p.provider_id IS DISTINCT FROM s->>'providerId' OR p.model_id IS DISTINCT FROM s->>'modelId' OR p.meter<>'text-tokens' OR p.version IS DISTINCT FROM (price_value->>'version')::integer OR p.effective_at>a.created_at OR (NOT p.data ? 'nativeRules' AND (p.data->>'inputUsdPerMillionTokens' IS NULL OR p.data->>'outputUsdPerMillionTokens' IS NULL)) THEN RAISE EXCEPTION 'Dispatch requires its reviewed immutable provider rate' USING ERRCODE='23514'; END IF;
 IF p.data ? 'nativeRules' THEN
  native_value:=public.languon_native_text_reservation(p.data,native_facts,1000000,0,5);
  IF native_value->>'status'<>'calculated' THEN RAISE EXCEPTION 'Native input allowance is unavailable' USING ERRCODE='23514'; END IF;
  input_rate:=(native_value->>'amountUsdMicros')::numeric;
  native_value:=public.languon_native_text_reservation(p.data,native_facts,0,1000000,5);
  IF native_value->>'status'<>'calculated' THEN RAISE EXCEPTION 'Native output allowance is unavailable' USING ERRCODE='23514'; END IF;
  output_rate:=(native_value->>'amountUsdMicros')::numeric;
  native_value:=public.languon_native_text_reservation(p.data,native_facts,0,0,5);
  IF native_value->>'status'<>'calculated' OR input_rate>2147483647 OR output_rate>2147483647 THEN RAISE EXCEPTION 'Native provider allowance exceeds execution meter' USING ERRCODE='23514'; END IF;
  minimum_value:=(native_value->>'amountUsdMicros')::bigint;
  b:=b||jsonb_build_object('nativeProviderPrice',price_value,'nativeExecutionFacts',native_facts,'nativeMaxCalls',5,'inputCostMicrosPerMillionTokens',input_rate::bigint,'outputCostMicrosPerMillionTokens',output_rate::bigint);
 ELSE
 minimum_value:=ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint;
 IF p.provider_id='evolink' AND minimum_value<=0 THEN RAISE EXCEPTION 'Reviewed provider minimum per request is required' USING ERRCODE='23514'; END IF;
 input_rate:=greatest((p.data->>'inputUsdPerMillionTokens')::numeric,coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0),coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0))*1000000;
 output_rate:=(p.data->>'outputUsdPerMillionTokens')::numeric*1000000;
 b:=b||jsonb_build_object('inputCostMicrosPerMillionTokens',input_rate::bigint,'outputCostMicrosPerMillionTokens',output_rate::bigint);
 END IF;
 SELECT count(*),count(*) FILTER(WHERE purpose<>'answer'),count(*) FILTER(WHERE purpose='answer'),coalesce(sum(coalesce(output_tokens,CASE WHEN EXISTS(SELECT 1 FROM public.text_ai_route_health_events rejection WHERE rejection.attempt_id=ai_credit_action_attempts.id AND rejection.reason IN ('authorization_failed','provider_credits_exhausted','rate_limited','model_retired','model_unavailable')) THEN 0 ELSE output_limit END)),0),coalesce(sum(coalesce(input_tokens,input_limit)),0),coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),coalesce(sum(CASE WHEN purpose='answer' AND (state='dispatched' OR (successful=1 AND NOT EXISTS(SELECT 1 FROM public.ai_credit_structured_call_validations v WHERE v.attempt_id=ai_credit_action_attempts.id AND v.accepted=false) AND (
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
 IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=call_value) OR count_value>=5 OR (purpose_value<>'answer' AND (support_count>=4 OR (SELECT count(*) FROM public.ai_credit_action_attempts prior JOIN public.text_ai_route_dispatches receipt ON receipt.attempt_id=prior.id WHERE prior.action_id=action_value AND prior.purpose<>'answer' AND receipt.route_id=(s->>'providerId')||'/'||(s->>'modelId'))>=2)) OR (purpose_value='answer' AND kind_value='portrait-interview' AND answer_count>=2) THEN RAISE EXCEPTION 'Action call limit reached or dispatch replayed' USING ERRCODE='23514'; END IF;
 affordable:=least(output_value,a.output_limit-used_output,(b->>'maxOutputTokensPerAttempt')::bigint-used_output,coalesce((s->>'perCallMaxOutputTokens')::bigint,10000),coalesce((e->>'interviewOutputTokenLimit')::bigint,10000));
 confirmed_output:=affordable;
 IF input_value>least(coalesce((s->>'perCallMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'admittedMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'interviewInputTokenLimit')::bigint,(b->>'maxInputTokensPerAttempt')::bigint)) OR used_input+input_value>(b->>'maxInputTokensPerAttempt')::bigint THEN RAISE EXCEPTION 'Action input execution allowance exceeded' USING ERRCODE='23514'; END IF;
 IF a.funding='customer' AND purpose_value='answer' THEN
  credit_input:=greatest((a.tariff->>'inputCreditsPerMillionTokens')::numeric,coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric))*1000;
  credit_output:=(a.tariff->>'outputCreditsPerMillionTokens')::numeric*1000;
  IF a.held_milli::numeric*1000000-spent-input_value*credit_input<0 THEN affordable:=0; ELSIF credit_output>0 THEN affordable:=least(affordable,floor((a.held_milli::numeric*1000000-spent-input_value*credit_input)/credit_output)); END IF;
 END IF;
 SELECT reserved_micros-coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0) INTO available_cost FROM public.ai_operator_action_budgets WHERE action_id=action_value AND state='active' FOR UPDATE;
 call_available:=least(available_cost,(b->>'maxCostMicrosPerAttempt')::bigint-used_cost);
 IF call_available<minimum_value THEN RAISE EXCEPTION 'Provider request minimum exceeds operator allowance' USING ERRCODE='23514'; END IF;
 IF p.data ? 'nativeRules' THEN
  low_value:=0; high_value:=greatest(0,affordable)::integer;
  WHILE low_value<high_value LOOP
   middle_value:=low_value+(high_value-low_value+1)/2;
   native_value:=public.languon_native_text_reservation(p.data,native_facts,input_value,middle_value,5);
   IF native_value->>'status'='calculated' AND (native_value->>'amountUsdMicros')::numeric<=call_available THEN low_value:=middle_value; ELSE high_value:=middle_value-1; END IF;
  END LOOP;
  affordable:=low_value;
 ELSE
 available_cost:=call_available-ceil(input_value*input_rate/1000000)::bigint;
 IF available_cost IS NULL OR available_cost<0 THEN affordable:=0; ELSIF output_rate>0 THEN affordable:=least(affordable,floor(available_cost::numeric*1000000/output_rate)); END IF;
 END IF;
 IF coalesce((e->>'routingDispatchAttempt')::integer,(e->>'dispatchJobAttempt')::integer,1)=2 AND affordable<confirmed_output THEN RAISE EXCEPTION 'Fallback cannot reduce confirmed allowance' USING ERRCODE='23514'; END IF;
 IF affordable<1 THEN RAISE EXCEPTION 'Action affordable output allowance exhausted' USING ERRCODE='23514'; END IF;
 IF p.data ? 'nativeRules' THEN native_value:=public.languon_native_text_reservation(p.data,native_facts,input_value,affordable::integer,5); reserved_value:=(native_value->>'amountUsdMicros')::bigint; ELSE reserved_value:=greatest(minimum_value,ceil(input_value*input_rate/1000000)::bigint+ceil(affordable*output_rate/1000000)::bigint); END IF;
 -- Test the exact conversation reservation that will be inserted below. The capacity lock
 -- spans this check and both inserts, including their active-usage projection triggers.
 IF NOT public.languon_text_dispatch_capacity_allows(owner_value,b,
    CASE WHEN kind_value='conversation-turn' THEN reserved_value ELSE (b->>'maxCostMicrosPerAttempt')::bigint END,
    CASE WHEN kind_value='conversation-turn' THEN input_value ELSE (b->>'maxInputTokensPerAttempt')::bigint END,
    CASE WHEN kind_value='conversation-turn' THEN affordable ELSE (b->>'maxOutputTokensPerAttempt')::bigint END)
 THEN RAISE EXCEPTION 'Provider operational capacity is unavailable' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(action_value,call_value,reserved_value,dispatch_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,created_at,provider_dispatch_witness) VALUES(call_value,action_value,job_value,count_value+1,purpose_value,'dispatched',b,reserved_value,input_value,affordable,dispatch_value,jsonb_build_object('jobId',job_value,'token',token_value,'worker',worker_value,'fence',fence_value::text)) RETURNING * INTO result;
 INSERT INTO public.text_ai_route_dispatches(attempt_id,route_id,snapshot,provider_price,created_at)
 VALUES(call_value,(s->>'providerId')||'/'||(s->>'modelId'),s,price_value,dispatch_value);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION languon_admit_text_provider_attempt(uuid,uuid,text,integer,integer,uuid,text,text,bigint,timestamptz) FROM PUBLIC;
--> statement-breakpoint
DROP FUNCTION languon_text_dispatch_capacity_allows(uuid,jsonb);
