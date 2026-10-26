-- Source: src/modules/text-ai/infrastructure/persistence/drizzle/probe-expense-authority.sql
-- SHA256: 14e293d9157baa4f7f9e5233900b2866814e18d6607299e9b3d6d5b0a7194ea2
-- Probe provenance is operator-only and never creates a learner action or wallet hold.
CREATE OR REPLACE FUNCTION languon_probe_provider_expense_identity(probe_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.text_ai_probes%ROWTYPE; rate public.ai_provider_price_revisions%ROWTYPE; expected_value bigint; numerator numeric;
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
  IF p.measurement<>'unknown' AND p.input_tokens IS NOT NULL AND p.output_tokens IS NOT NULL
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
  RETURN jsonb_build_object('actionId',p.id,'attemptReference','admin-probe:'||p.id::text,'sourceKind','admin-probe','providerId',p.provider_id,'modelId',p.model_id,'measurement',p.measurement,'costSource',CASE WHEN p.cost_micros IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',p.cost_micros::text,'occurredAt',p.started_at);
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
  IF (to_jsonb(NEW)-ARRAY['state','failure','cost_micros','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','measurement','elapsed_ms','first_output_ms','completed_at','evidence_expires_at'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','failure','cost_micros','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','measurement','elapsed_ms','first_output_ms','completed_at','evidence_expires_at']) THEN
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

--> statement-breakpoint

-- Source: src/modules/text-ai/infrastructure/persistence/drizzle/route-health-authority.sql
-- SHA256: 5c173d808631fed787d9f6c94f4bf56405ecc2dd27f311b1174a4b190914ab1a
-- Observations contain only bounded classifications. No prompts, bodies, keys or customer data.
-- Retire the previous broad assertion-only overload even if worker grants have not yet been reapplied.
CREATE OR REPLACE FUNCTION languon_record_text_ai_route_health(event_value uuid,route_value text,provider_value text,flow_value text,fingerprint_value text,reason_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Runtime health requires an admitted attempt and live execution witness' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_record_text_ai_route_health(uuid,text,text,text,text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_text_ai_route_health(event_value uuid,attempt_value uuid,job_value uuid,token_value text,worker_value text,fence_value bigint,reason_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; receipt public.text_ai_route_dispatches%ROWTYPE; k text; owner_value uuid; table_value text; feature_value jsonb; route_value text; provider_value text; flow_value text; fingerprint_value text; existing public.text_ai_route_health_events%ROWTYPE;
BEGIN
 IF event_value IS NULL OR attempt_value IS NULL OR job_value IS NULL OR reason_value IS NULL OR reason_value NOT IN ('model_retired','model_unavailable','authorization_failed','invalid_output','request_rejected','schema_incompatible','rate_limited','provider_credits_exhausted','provider_unavailable') THEN
   RAISE EXCEPTION 'Invalid runtime health observation' USING ERRCODE='23514';
 END IF;
 SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value;
 SELECT * INTO receipt FROM public.text_ai_route_dispatches WHERE attempt_id=attempt_value;
 SELECT c.owner_id,p.job_kind INTO owner_value,k FROM public.ai_credit_actions c JOIN public.ai_action_charging_policies p ON p.job_id=c.id AND p.owner_id=c.owner_id WHERE c.id=a.action_id AND c.state='active';
 IF a.id IS NULL OR a.state<>'dispatched' OR a.execution_job_id IS DISTINCT FROM job_value OR receipt.attempt_id IS NULL OR owner_value IS NULL THEN RAISE EXCEPTION 'Health observation requires its active admitted dispatch' USING ERRCODE='23514'; END IF;
 CASE k
   WHEN 'conversation-turn' THEN table_value:='conversation_turns';
   WHEN 'portrait-interview' THEN table_value:='learner_portrait_interview_operations';
   WHEN 'dictionary-generation' THEN table_value:='dictionary_generation_jobs';
   WHEN 'sentence-generation','sentence-check' THEN table_value:='sentence_ai_jobs';
   WHEN 'text-detection','text-translation' THEN table_value:='texts_ai_jobs';
   WHEN 'text-selection-card' THEN table_value:='dictionary_text_selection_jobs';
   ELSE RAISE EXCEPTION 'Unsupported health dispatch feature' USING ERRCODE='23514';
 END CASE;
 EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',table_value) INTO feature_value USING job_value;
 IF feature_value IS NULL OR coalesce(feature_value->>'owner_id',feature_value->>'learner_id') IS DISTINCT FROM owner_value::text THEN RAISE EXCEPTION 'Health dispatch ownership mismatch' USING ERRCODE='23514'; END IF;
 IF k IN ('conversation-turn','portrait-interview') THEN
   IF job_value<>a.action_id OR coalesce(feature_value->>'status',feature_value->>'state')<>'running' OR token_value IS NULL OR feature_value->>'lease_token' IS DISTINCT FROM token_value OR feature_value->>'lease_until' IS NULL OR (feature_value->>'lease_until')::timestamptz<=clock_timestamp() OR coalesce((feature_value->>'cancel_requested')::boolean,false) THEN RAISE EXCEPTION 'Health observation requires current live lease' USING ERRCODE='23514'; END IF;
 ELSE
   IF feature_value->>'execution_state'<>'running' OR worker_value IS NULL OR fence_value IS NULL OR feature_value->>'worker_id' IS DISTINCT FROM worker_value OR (feature_value->>'fencing_token')::bigint IS DISTINCT FROM fence_value OR feature_value->>'lease_deadline' IS NULL OR (feature_value->>'lease_deadline')::timestamptz<=clock_timestamp() OR feature_value->>'cancellation_requested_at' IS NOT NULL THEN RAISE EXCEPTION 'Health observation requires current worker fence' USING ERRCODE='23514'; END IF;
 END IF;
 route_value:=receipt.route_id; provider_value:=receipt.snapshot->>'providerId'; flow_value:=receipt.snapshot->'routingAuthority'->>'flowId';
 SELECT candidate->>'fingerprint' INTO fingerprint_value FROM jsonb_array_elements(receipt.snapshot->'routingAuthority'->'candidates') candidate WHERE candidate->>'routeId'=route_value LIMIT 1;
 IF flow_value IS NULL OR fingerprint_value IS NULL OR fingerprint_value!~'^[a-f0-9]{64}$' OR route_value IS DISTINCT FROM provider_value||'/'||(receipt.snapshot->>'modelId') THEN RAISE EXCEPTION 'Health observation requires immutable reviewed route identity' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(route_value,1920424421));
 SELECT * INTO existing FROM public.text_ai_route_health_events WHERE attempt_id=attempt_value;
 IF existing.id IS NOT NULL THEN
   IF existing.reason<>reason_value THEN RAISE EXCEPTION 'Runtime health replay differs from original observation' USING ERRCODE='23514'; END IF;
   RETURN;
 END IF;
 INSERT INTO public.text_ai_route_health_events(id,attempt_id,route_id,provider_id,flow_id,fingerprint,reason,observed_at)
 VALUES(event_value,attempt_value,route_value,provider_value,flow_value,fingerprint_value,reason_value,clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION languon_record_text_ai_route_health(uuid,uuid,uuid,text,text,bigint,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_text_ai_health_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Route health observations are append-only' USING ERRCODE='23514'; END $$;
DROP TRIGGER IF EXISTS text_ai_health_event_guard ON public.text_ai_route_health_events;
CREATE TRIGGER text_ai_health_event_guard BEFORE UPDATE OR DELETE ON public.text_ai_route_health_events FOR EACH ROW EXECUTE FUNCTION languon_guard_text_ai_health_event();

-- Both the application and fenced worker dispatch use this exact gate. Every history lookup is indexed.
CREATE OR REPLACE FUNCTION languon_text_ai_route_dispatch_allowed(route_value text,flow_value text,fingerprint_value text,at_value timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE passed_at timestamptz; transient_at timestamptz; probe_transient_at timestamptz; provider_value text:=split_part(route_value,'/',1);
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(route_value,1920424421));
 SELECT started_at INTO passed_at FROM public.text_ai_probes
 WHERE route_id=route_value AND flow_id=flow_value AND fingerprint=fingerprint_value AND state='passed' AND kind='flow'
 ORDER BY started_at DESC NULLS LAST LIMIT 1;
 IF passed_at IS NULL THEN RETURN false; END IF;
 -- Hard failures remain excluded until a later manual check; a newer timeout cannot clear them.
 IF EXISTS(SELECT 1 FROM public.text_ai_probes WHERE route_id=route_value AND state='failed' AND failure IN ('model_retired','authorization_failed') AND started_at>passed_at)
   OR EXISTS(SELECT 1 FROM public.text_ai_probes WHERE route_id=route_value AND flow_id=flow_value AND state='failed' AND failure='invalid_output' AND started_at>passed_at)
   OR EXISTS(SELECT 1 FROM public.text_ai_probes WHERE provider_id=provider_value AND state='failed' AND failure='authorization_failed' AND started_at>passed_at)
   OR EXISTS(SELECT 1 FROM public.text_ai_route_health_events WHERE route_id=route_value AND reason IN ('model_retired','model_unavailable') AND observed_at>passed_at)
   OR EXISTS(SELECT 1 FROM public.text_ai_route_health_events WHERE route_id=route_value AND flow_id=flow_value AND reason='schema_incompatible' AND observed_at>passed_at)
   OR EXISTS(SELECT 1 FROM public.text_ai_route_health_events WHERE provider_id=provider_value AND reason='authorization_failed' AND observed_at>passed_at)
 THEN RETURN false; END IF;
 SELECT completed_at INTO probe_transient_at FROM public.text_ai_probes WHERE route_id=route_value AND state='failed' AND failure<>'budget_insufficient' AND started_at>passed_at ORDER BY started_at DESC NULLS LAST LIMIT 1;
 SELECT observed_at INTO transient_at FROM public.text_ai_route_health_events WHERE route_id=route_value AND reason IN ('provider_unavailable','rate_limited','provider_credits_exhausted') AND observed_at>passed_at ORDER BY observed_at DESC NULLS LAST LIMIT 1;
 RETURN (probe_transient_at IS NULL OR probe_transient_at<=at_value-interval '60 seconds') AND (transient_at IS NULL OR transient_at<=at_value-interval '60 seconds');
END $$;
REVOKE ALL ON FUNCTION languon_text_ai_route_dispatch_allowed(text,text,text,timestamptz) FROM PUBLIC;

--> statement-breakpoint

-- Source: src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql
-- SHA256: f7ce2ca4be892877ad2c9c7f7a455afc155af01d1db1a874bdccf54ca1e3b47f
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
DECLARE k text; row_value jsonb; execution_value jsonb; snapshot_value jsonb; owner_value uuid; table_value text; route_candidate jsonb; routing_value jsonb; dispatch_attempt integer; route_value text; configured_value jsonb; fingerprint_value text;
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
 snapshot_value:=coalesce(execution_value->'snapshot',execution_value);
 routing_value:=snapshot_value->'routingAuthority';
 IF routing_value IS NOT NULL THEN
  dispatch_attempt:=CASE WHEN k IN ('conversation-turn','portrait-interview') THEN
      1+(SELECT count(*) FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state='settled' AND successful=0)
      ELSE (row_value->>'attempt_count')::integer END;
  IF dispatch_attempt NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Automatic routing attempt allowance exhausted' USING ERRCODE='23514'; END IF;
  IF dispatch_attempt=2 THEN
   IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state='dispatched') THEN RAISE EXCEPTION 'Ambiguous upstream execution cannot be retried' USING ERRCODE='23514'; END IF;
   IF k='conversation-turn' AND EXISTS(SELECT 1 FROM public.conversation_messages WHERE turn_id=action_value AND role='assistant' AND content<>'') THEN RAISE EXCEPTION 'Visible output prevents automatic fallback' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT r.configuration INTO configured_value FROM public.text_ai_routing_state current_state JOIN public.text_ai_routing_revisions r ON r.id=current_state.active_revision_id WHERE current_state.id='global' FOR SHARE OF current_state;
  IF dispatch_attempt=1 AND k IN ('conversation-turn','portrait-interview') THEN
   -- Inline adapters were constructed before admission; never change their identity behind HTTP.
   route_candidate:=routing_value->'candidates'->0;
   IF configured_value IS NULL OR NOT (configured_value->'enabledRouteIds' ? (route_candidate->>'routeId')) OR NOT public.languon_text_ai_route_dispatch_allowed(route_candidate->>'routeId',routing_value->>'flowId',route_candidate->>'fingerprint',clock_timestamp()) THEN route_candidate:=NULL; END IF;
  ELSIF dispatch_attempt=2 AND k IN ('conversation-turn','portrait-interview') THEN
   route_candidate:=routing_value->'candidates'->1;
   IF configured_value IS NULL OR route_candidate IS NULL OR NOT (configured_value->'enabledRouteIds' ? (route_candidate->>'routeId')) OR NOT public.languon_text_ai_route_dispatch_allowed(route_candidate->>'routeId',routing_value->>'flowId',route_candidate->>'fingerprint',clock_timestamp()) THEN route_candidate:=NULL; END IF;
  ELSIF dispatch_attempt=1 THEN
   -- No provider has run: choose only among the alternatives pinned at admission.
   SELECT candidate INTO route_candidate FROM jsonb_array_elements(routing_value->'candidates') WITH ORDINALITY AS pinned(candidate,position)
   WHERE configured_value->'enabledRouteIds' ? (candidate->>'routeId')
    AND public.languon_text_ai_route_dispatch_allowed(candidate->>'routeId',routing_value->>'flowId',candidate->>'fingerprint',clock_timestamp())
   ORDER BY position LIMIT 1;
  ELSE
   SELECT candidate INTO route_candidate FROM jsonb_array_elements(routing_value->'candidates') WITH ORDINALITY AS pinned(candidate,position)
   WHERE NOT EXISTS(SELECT 1 FROM public.text_ai_route_dispatches d JOIN public.ai_credit_action_attempts a ON a.id=d.attempt_id WHERE a.action_id=action_value AND a.execution_job_id=job_value AND a.state='settled' AND a.successful=0 AND d.route_id=candidate->>'routeId')
    AND configured_value->'enabledRouteIds' ? (candidate->>'routeId')
    AND public.languon_text_ai_route_dispatch_allowed(candidate->>'routeId',routing_value->>'flowId',candidate->>'fingerprint',clock_timestamp())
   ORDER BY position LIMIT 1;
  END IF;
  IF route_candidate IS NULL THEN RAISE EXCEPTION 'Route excluded before dispatch' USING ERRCODE='23514'; END IF;
  IF (route_candidate->'snapshot'->>'perCallMaxInputTokens')::bigint<(snapshot_value->>'perCallMaxInputTokens')::bigint OR (route_candidate->'snapshot'->>'perCallMaxOutputTokens')::bigint<(snapshot_value->>'perCallMaxOutputTokens')::bigint THEN RAISE EXCEPTION 'Fallback cannot reduce confirmed allowance' USING ERRCODE='23514'; END IF;
  snapshot_value:=snapshot_value || (route_candidate->'snapshot') || jsonb_build_object('aggregateBudget',snapshot_value->'aggregateBudget','routingAuthority',routing_value);
  IF execution_value ? 'snapshot' THEN execution_value:=execution_value || jsonb_build_object('snapshot',snapshot_value,'providerPrice',route_candidate->'providerPrice');
  ELSE execution_value:=snapshot_value || jsonb_build_object('actionProviderPrice',route_candidate->'providerPrice'); END IF;
  execution_value:=execution_value || jsonb_build_object('routingDispatchAttempt',dispatch_attempt);

 END IF;

 RETURN execution_value || CASE WHEN k IN ('conversation-turn','portrait-interview') THEN '{}'::jsonb ELSE jsonb_build_object('dispatchJobAttempt',(row_value->>'attempt_count')::integer) END;
END $$;
REVOKE ALL ON FUNCTION languon_text_dispatch_execution(uuid,uuid,text,text,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_admit_text_provider_attempt(action_value uuid, call_value uuid, purpose_value text, input_value integer, output_value integer, job_value uuid, token_value text, worker_value text, fence_value bigint, at_value timestamptz) RETURNS public.ai_credit_action_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; e jsonb; s jsonb; b jsonb; p public.ai_provider_price_revisions%ROWTYPE; price_value jsonb; result public.ai_credit_action_attempts%ROWTYPE; used_output bigint; used_input bigint; used_cost bigint; reserved_value bigint; available_cost bigint; affordable bigint; spent numeric; input_rate numeric; output_rate numeric; credit_input numeric; credit_output numeric; confirmed_output bigint; minimum_value bigint; call_available bigint; count_value integer; support_count integer; answer_count integer; owner_value uuid; kind_value text; dispatch_value timestamptz:=date_trunc('milliseconds',clock_timestamp());
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
 minimum_value:=ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint;
 IF p.provider_id='evolink' AND minimum_value<=0 THEN RAISE EXCEPTION 'Reviewed provider minimum per request is required' USING ERRCODE='23514'; END IF;
 input_rate:=greatest((p.data->>'inputUsdPerMillionTokens')::numeric,coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0),coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0))*1000000;
 output_rate:=(p.data->>'outputUsdPerMillionTokens')::numeric*1000000;
 b:=b||jsonb_build_object('inputCostMicrosPerMillionTokens',input_rate::bigint,'outputCostMicrosPerMillionTokens',output_rate::bigint);
 IF NOT public.languon_text_dispatch_capacity_allows(owner_value,b) THEN RAISE EXCEPTION 'Provider operational capacity is unavailable' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(*) FILTER(WHERE purpose<>'answer'),count(*) FILTER(WHERE purpose='answer'),coalesce(sum(coalesce(output_tokens,CASE WHEN EXISTS(SELECT 1 FROM public.text_ai_route_health_events rejection WHERE rejection.attempt_id=ai_credit_action_attempts.id AND rejection.reason IN ('authorization_failed','provider_credits_exhausted','rate_limited','model_retired','model_unavailable')) THEN 0 ELSE output_limit END)),0),coalesce(sum(coalesce(input_tokens,input_limit)),0),coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),coalesce(sum(CASE WHEN purpose='answer' AND (state='dispatched' OR (successful=1 AND (
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
 available_cost:=call_available-ceil(input_value*input_rate/1000000)::bigint;
 IF available_cost IS NULL OR available_cost<0 THEN affordable:=0; ELSIF output_rate>0 THEN affordable:=least(affordable,floor(available_cost::numeric*1000000/output_rate)); END IF;
 IF coalesce((e->>'routingDispatchAttempt')::integer,(e->>'dispatchJobAttempt')::integer,1)=2 AND affordable<confirmed_output THEN RAISE EXCEPTION 'Fallback cannot reduce confirmed allowance' USING ERRCODE='23514'; END IF;
 IF affordable<1 THEN RAISE EXCEPTION 'Action affordable output allowance exhausted' USING ERRCODE='23514'; END IF;
 reserved_value:=greatest(minimum_value,ceil(input_value*input_rate/1000000)::bigint+ceil(affordable*output_rate/1000000)::bigint);
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(action_value,call_value,reserved_value,dispatch_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,created_at) VALUES(call_value,action_value,job_value,count_value+1,purpose_value,'dispatched',b,reserved_value,input_value,affordable,dispatch_value) RETURNING * INTO result;
 INSERT INTO public.text_ai_route_dispatches(attempt_id,route_id,snapshot,provider_price,created_at)
 VALUES(call_value,(s->>'providerId')||'/'||(s->>'modelId'),s,price_value,dispatch_value);
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
 maximum_value:=greatest(ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint,ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint);
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

-- Keep the independent insert guard aligned with bounded known-rejection operational output.
CREATE OR REPLACE FUNCTION ai_credit_action_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE;
DECLARE count_calls integer;
DECLARE output_used bigint;
BEGIN
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.actual_cost_micros IS NOT DISTINCT FROM (public.languon_text_provider_expense_identity(OLD.id)->>'amountUsdMicros')::bigint
     AND (to_jsonb(NEW)-'actual_cost_micros')=(to_jsonb(OLD)-'actual_cost_micros') THEN RETURN NEW; END IF;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider dispatch requires active action authorization'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'dispatched' OR NEW.state<>'settled' OR
      NEW.id<>OLD.id OR NEW.action_id<>OLD.action_id OR NEW.execution_job_id IS DISTINCT FROM OLD.execution_job_id OR NEW.ordinal<>OLD.ordinal OR NEW.purpose<>OLD.purpose
      OR NEW.input_limit<>OLD.input_limit OR NEW.output_limit<>OLD.output_limit OR NEW.budget<>OLD.budget
      OR NEW.reserved_cost_micros<>OLD.reserved_cost_micros OR NEW.created_at<>OLD.created_at THEN
      RAISE EXCEPTION 'Provider attempt identity and final usage are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs o JOIN public.ai_operator_action_budgets a ON a.action_id=o.action_id
    WHERE o.attempt_id=NEW.id AND o.action_id=NEW.action_id AND a.state='active' AND o.settled_at IS NULL AND o.reserved_micros>=NEW.reserved_cost_micros) THEN
    RAISE EXCEPTION 'Provider dispatch requires acknowledged operator cost authorization';
  END IF;
  IF NEW.created_at>=action_row.deadline_at OR NEW.state<>'dispatched' OR NEW.input_tokens IS NOT NULL OR NEW.output_tokens IS NOT NULL THEN
    RAISE EXCEPTION 'Provider dispatch is outside admitted execution';
  END IF;
  IF action_row.funding='customer' AND
    (SELECT coalesce(sum(allocated_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.action_id)<>action_row.held_milli THEN
    RAISE EXCEPTION 'Provider dispatch requires fully allocated action hold';
  END IF;
  SELECT count(*),coalesce(sum(coalesce(output_tokens,CASE WHEN EXISTS(SELECT 1 FROM public.text_ai_route_health_events rejection WHERE rejection.attempt_id=ai_credit_action_attempts.id AND rejection.reason IN ('authorization_failed','provider_credits_exhausted','rate_limited','model_retired','model_unavailable')) THEN 0 ELSE output_limit END)),0) INTO count_calls,output_used
    FROM public.ai_credit_action_attempts WHERE action_id=NEW.action_id;
  IF NEW.ordinal<>count_calls+1 OR count_calls>=5 OR output_used+NEW.output_limit>action_row.output_limit THEN
    RAISE EXCEPTION 'Provider dispatch exceeds admitted action limits';
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint

-- Source: src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql
-- SHA256: 1dc59e81fe8af177469f393f7f140e5f1a68c1b0a0bc11608ededd652bab51cf
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

--> statement-breakpoint

-- Source: src/modules/speech/infrastructure/speech-accounting-guards.sql
-- SHA256: 2bb8c09d6b695ef088431e22b924aec6e8cd8689427c774b1a1ef79c2342fe7d
-- Speech keeps its success-only customer hold, but every new clip has independent USD authorization.
CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.accounting_version,NEW.provider_price_snapshot,NEW.provider_character_count)
      IS DISTINCT FROM (OLD.accounting_version,OLD.provider_price_snapshot,OLD.provider_character_count) THEN
    RAISE EXCEPTION 'Speech provider accounting admission is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.provider_outcome IS NOT NULL AND NEW.provider_outcome IS DISTINCT FROM OLD.provider_outcome THEN RAISE EXCEPTION 'Speech provider outcome is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.provider_dispatched_at IS NOT NULL AND NEW.provider_dispatched_at IS DISTINCT FROM OLD.provider_dispatched_at THEN
    RAISE EXCEPTION 'Speech provider dispatch identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS speech_accounting_snapshot_guard ON speech_jobs;
CREATE TRIGGER speech_accounting_snapshot_guard BEFORE UPDATE ON speech_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_snapshot();

CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.speech_jobs WHERE id=NEW.id;
  IF NOT FOUND OR j.accounting_version<>1 THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id) THEN
    RAISE EXCEPTION 'Speech requires shared operator authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs a WHERE a.action_id=j.id AND a.attempt_id=j.id) THEN
    RAISE EXCEPTION 'Speech dispatch requires provider attempt authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('ready','failed','submission_unknown') THEN
    IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id AND b.state='settled') THEN
      RAISE EXCEPTION 'Terminal speech requires settled operator accounting' USING ERRCODE='23514';
    END IF;
    IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_provider_expense_records e WHERE e.action_id=j.id AND e.attempt_reference='speech:'||j.id::text) THEN
      RAISE EXCEPTION 'Terminal speech requires a provider expense fact' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS speech_accounting_authority_guard ON speech_jobs;
CREATE CONSTRAINT TRIGGER speech_accounting_authority_guard AFTER INSERT OR UPDATE ON speech_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_authority();

CREATE OR REPLACE FUNCTION languon_speech_provider_expense_identity(job_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; amount_value bigint;
BEGIN
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR j.provider_outcome IS NULL OR p.id IS NULL OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId' OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId' OR p.meter<>'speech-characters' OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.effective_at>j.created_at OR p.data->>'usdPer1000Characters' IS DISTINCT FROM j.provider_price_snapshot->>'usdPer1000Characters' THEN RAISE EXCEPTION 'Speech expense requires its dispatched reviewed provenance' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome='ready' THEN amount_value:=greatest(ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint,ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint);
 ELSIF j.provider_outcome='not_submitted' THEN amount_value:=0;
 ELSIF j.provider_outcome<>'unknown' THEN RAISE EXCEPTION 'Unknown speech provider outcome' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('sourceKind','speech-attempt','attemptReference','speech:'||j.id::text,'actionId',j.id,'providerId',p.provider_id,'modelId',p.model_id,'measurement',CASE j.provider_outcome WHEN 'ready' THEN 'estimated' WHEN 'not_submitted' THEN 'measured' ELSE 'unknown' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',j.provider_dispatched_at);
END $$;
REVOKE ALL ON FUNCTION languon_speech_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_speech_provider_expense(job_value uuid,outcome_value text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; e jsonb; f public.ai_provider_expense_records%ROWTYPE; o public.ai_operator_attempt_costs%ROWTYPE; b public.ai_operator_action_budgets%ROWTYPE; owner_value uuid; amount_value bigint;
BEGIN
 SELECT payer_id INTO owner_value FROM public.speech_jobs WHERE id=job_value;
 IF owner_value IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); END IF;
 PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NOT NULL AND j.accounting_version=1 AND j.provider_dispatched_at IS NULL AND outcome_value='not_submitted' AND (j.queue_deadline<=clock_timestamp() OR public.languon_operator_purge_authorized(j.payer_id)) THEN
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id AND state='active'; RETURN NULL;
 END IF;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR outcome_value NOT IN ('ready','unknown','not_submitted') THEN RAISE EXCEPTION 'Unbound speech provider observation' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NOT NULL AND j.provider_outcome<>outcome_value THEN RAISE EXCEPTION 'Speech provider observation replay conflicts with first outcome' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NULL THEN
   IF j.payer_id IS NULL THEN RAISE EXCEPTION 'Erased speech cannot create new provider facts' USING ERRCODE='23514'; END IF;
   IF outcome_value='ready' AND (j.state<>'storing' OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND checksum IS NOT NULL AND byte_length>0)) THEN RAISE EXCEPTION 'Ready expense requires acknowledged synthesis output' USING ERRCODE='23514'; END IF;
   IF outcome_value='not_submitted' AND (j.state<>'submitting' OR j.task_id IS NOT NULL OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Zero speech expense requires a live unsubmitted operation' USING ERRCODE='23514'; END IF;
   IF outcome_value='unknown' AND j.state NOT IN ('submitting','processing','storing','submission_unknown','failed') THEN RAISE EXCEPTION 'Unknown speech expense requires dispatched work' USING ERRCODE='23514'; END IF;
   UPDATE public.speech_jobs SET provider_outcome=outcome_value WHERE id=job_value;
 END IF;
 e:=public.languon_speech_provider_expense_identity(job_value); amount_value:=(e->>'amountUsdMicros')::bigint;
 INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_reference,action_id,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
 VALUES(gen_random_uuid(),'speech-attempt',e->>'attemptReference',job_value,e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',amount_value,(e->>'occurredAt')::timestamptz) ON CONFLICT(attempt_reference) DO NOTHING;
 SELECT * INTO f FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
 IF f.source_kind<>'speech-attempt' OR f.attempt_id IS NOT NULL OR f.action_id<>job_value OR f.provider_id IS DISTINCT FROM e->>'providerId' OR f.model_id IS DISTINCT FROM e->>'modelId' OR f.amount_usd_micros IS DISTINCT FROM amount_value OR f.measurement IS DISTINCT FROM e->>'measurement' OR f.cost_source IS DISTINCT FROM e->>'costSource' OR f.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN RAISE EXCEPTION 'Speech expense conflicts with authoritative fact' USING ERRCODE='23514'; END IF;
 SELECT * INTO b FROM public.ai_operator_action_budgets WHERE action_id=job_value FOR UPDATE;
 IF b.state='active' THEN
   SELECT * INTO o FROM public.ai_operator_attempt_costs WHERE attempt_id=job_value AND action_id=job_value FOR UPDATE;
   IF o.attempt_id IS NULL OR (amount_value IS NOT NULL AND amount_value>o.reserved_micros) THEN RAISE EXCEPTION 'Speech observation exceeds provider authorization' USING ERRCODE='23514'; END IF;
   IF o.settled_at IS NULL THEN UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(amount_value,reserved_micros),measurement=CASE WHEN amount_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=clock_timestamp() WHERE attempt_id=job_value;
   ELSIF o.consumed_micros IS DISTINCT FROM coalesce(amount_value,o.reserved_micros) THEN RAISE EXCEPTION 'Speech operator amount conflicts with provider fact' USING ERRCODE='23514'; END IF;
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=(SELECT coalesce(sum(consumed_micros),0) FROM public.ai_operator_attempt_costs WHERE action_id=job_value),settled_at=clock_timestamp() WHERE action_id=job_value;
 END IF;
 PERFORM public.languon_mark_accounting_reports_dirty();
 RETURN f.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_speech_provider_expense(uuid,text) FROM PUBLIC;

-- Retired owner-only entry is never an unfenced privilege escalation.
CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Speech purge requires its expected worker and fencing token' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid) FROM PUBLIC;

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

-- API scheduling cancellation precedes the due purge lease. Dispatch remains
-- admitted: leave its owner, usage and USD authorization for the normal worker.
CREATE OR REPLACE FUNCTION languon_cancel_speech_for_scheduled_deletion(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,76021941));
 PERFORM 1 FROM public.users u JOIN public.account_deletion_requests d ON d.user_id=u.id WHERE u.id=owner_id_value AND u.status='deletion_pending' AND d.state='pending' AND d.scheduled_at<=clock_timestamp() FOR UPDATE OF u,d;
 IF NOT FOUND THEN RAISE EXCEPTION 'Speech scheduling cancellation requires its newly scheduled inactive account' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('actor:'||owner_id_value::text,1920424383));
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 PERFORM set_config('languon.speech_worker_version','1',true);
 FOR j IN SELECT * FROM public.speech_jobs WHERE payer_id=owner_id_value AND state='queued' AND provider_dispatched_at IS NULL ORDER BY id FOR UPDATE LOOP
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id AND state='active';
   UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=NULL,lease_expires_at=NULL WHERE id=j.id;
   UPDATE public.speech_recordings SET state='deleting',text='',version=version+1 WHERE id=j.recording_id AND state='pending';
   IF j.reservation_id IS NOT NULL AND j.billing_state='reserved' THEN PERFORM public.languon_settle_speech_customer(j.reservation_id,'failure'); END IF;
   UPDATE public.speech_jobs SET payer_id=NULL,reservation_id=NULL,billing_state=CASE WHEN billing_state='reserved' THEN 'released_no_charge' ELSE billing_state END WHERE id=j.id;
 END LOOP;
 DELETE FROM public.speech_quotes WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_bindings WHERE actor_id=owner_id_value;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_cancel_speech_for_scheduled_deletion(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_speech_customer(reservation_value uuid,outcome_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.ai_credit_reservations%ROWTYPE; j public.speech_jobs%ROWTYPE; owner_value uuid; charged bigint:=0; released bigint; measurement_value public.ai_credit_measurement; now_value timestamptz:=clock_timestamp();
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_reservations WHERE id=reservation_value AND job_kind='speech-generation';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Speech billing requires its owned reservation' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO r FROM public.ai_credit_reservations WHERE id=reservation_value FOR UPDATE;
 SELECT * INTO j FROM public.speech_jobs WHERE id=r.job_id AND payer_id=r.owner_id AND reservation_id=r.id FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Speech billing has no authoritative job' USING ERRCODE='23514'; END IF;
 IF r.state='settled' THEN RETURN jsonb_build_object('chargedCredits',r.charged_credits::text,'releasedCredits',(r.reserved_credits-r.charged_credits)::text,'measurement',r.measurement); END IF;
 IF r.state<>'active' THEN RAISE EXCEPTION 'Speech billing reservation is not active' USING ERRCODE='23514'; END IF;
 IF outcome_value='success' THEN
   IF NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND state='ready' AND ready_at IS NOT NULL) THEN RAISE EXCEPTION 'Speech billing requires published output' USING ERRCODE='23514'; END IF;
   IF r.policy_mode='limited' AND EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') AND now_value<j.billing_deadline AND EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND ready_at<j.billing_deadline) THEN charged:=r.reserved_credits; END IF;
 ELSIF outcome_value='deadline' THEN
   IF NOT(now_value>=j.billing_deadline OR (j.state='queued' AND now_value>=j.queue_deadline)) THEN RAISE EXCEPTION 'Speech deadline has not expired' USING ERRCODE='23514'; END IF;
 ELSIF outcome_value='failure' THEN
   IF j.state<>'failed' AND NOT public.languon_operator_purge_authorized(owner_value) THEN RAISE EXCEPTION 'Speech release requires durable failure or checked purge' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Unknown speech billing outcome' USING ERRCODE='23514'; END IF;
 measurement_value:=CASE WHEN charged>0 THEN 'speech_success'::public.ai_credit_measurement ELSE 'speech_no_charge'::public.ai_credit_measurement END;
 IF charged>0 THEN UPDATE public.ai_credit_reservation_allocations SET settled_credits=allocated_credits WHERE reservation_id=r.id; END IF;
 UPDATE public.ai_credit_reservations SET state='settled',charged_credits=charged,measured_credits=NULL,measurement=measurement_value,settled_at=now_value WHERE id=r.id;
 INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,measurement,created_at) VALUES(gen_random_uuid(),owner_value,'settlement',-charged,measurement_value,now_value);
 released:=r.reserved_credits-charged;
 IF released>0 THEN INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,created_at) VALUES(gen_random_uuid(),owner_value,'release',released,now_value); END IF;
 RETURN jsonb_build_object('chargedCredits',charged::text,'releasedCredits',released::text,'measurement',measurement_value);
END $$;
REVOKE ALL ON FUNCTION languon_settle_speech_customer(uuid,text) FROM PUBLIC;

--> statement-breakpoint

-- Source: src/modules/text-ai/infrastructure/persistence/drizzle/routing-dispatch-guards.sql
-- SHA256: 4882b6f0860a69887aaf73d37089f9005d56decd68a700293bc9b273cf598b5a
-- Immutable per-call model/price provenance is installed after the routing schema.
CREATE OR REPLACE FUNCTION languon_guard_text_ai_route_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; k text; e jsonb; s jsonb; candidate jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id) THEN RAISE EXCEPTION 'Route dispatch receipt is immutable' USING ERRCODE='55000'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Route dispatch receipt is immutable' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=NEW.attempt_id;
 IF a.id IS NULL OR a.state<>'dispatched' OR NEW.created_at IS DISTINCT FROM a.created_at THEN RAISE EXCEPTION 'Route receipt requires its admitted provider attempt' USING ERRCODE='23514'; END IF;
 SELECT job_kind INTO k FROM public.ai_action_charging_policies WHERE job_id=a.action_id;
 CASE k
  WHEN 'conversation-turn' THEN SELECT execution INTO e FROM public.conversation_turns WHERE id=a.execution_job_id;
  WHEN 'portrait-interview' THEN SELECT execution INTO e FROM public.learner_portrait_interview_operations WHERE id=a.execution_job_id;
  WHEN 'dictionary-generation' THEN SELECT selected_execution_snapshot INTO e FROM public.dictionary_generation_jobs WHERE id=a.execution_job_id;
  WHEN 'sentence-generation','sentence-check' THEN SELECT selected_execution_snapshot INTO e FROM public.sentence_ai_jobs WHERE id=a.execution_job_id;
  WHEN 'text-detection','text-translation' THEN SELECT selected_execution_snapshot INTO e FROM public.texts_ai_jobs WHERE id=a.execution_job_id;
  WHEN 'text-selection-card' THEN SELECT selected_execution_snapshot INTO e FROM public.dictionary_text_selection_jobs WHERE id=a.execution_job_id;
  ELSE RAISE EXCEPTION 'Route receipt has no typed provenance' USING ERRCODE='23514';
 END CASE;
 s:=coalesce(e->'snapshot',e);
 IF NEW.route_id IS DISTINCT FROM (NEW.snapshot->>'providerId')||'/'||(NEW.snapshot->>'modelId') THEN RAISE EXCEPTION 'Route receipt identity mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.snapshot->>'providerId'=s->>'providerId' AND NEW.snapshot->>'modelId'=s->>'modelId' THEN
  IF NEW.provider_price IS DISTINCT FROM coalesce(e->'providerPrice',e->'actionProviderPrice') THEN RAISE EXCEPTION 'Route receipt changes the admitted provider price' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT value INTO candidate FROM jsonb_array_elements(s->'routingAuthority'->'candidates') WHERE value->>'routeId'=NEW.route_id;
  IF candidate IS NULL OR NEW.provider_price IS DISTINCT FROM candidate->'providerPrice' OR NOT NEW.snapshot @> ((candidate->'snapshot')-'aggregateBudget') THEN RAISE EXCEPTION 'Route receipt uses an unauthorized alternative' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_text_ai_route_dispatch() FROM PUBLIC;
CREATE OR REPLACE TRIGGER text_ai_route_dispatch_immutable BEFORE INSERT OR UPDATE OR DELETE ON text_ai_route_dispatches FOR EACH ROW EXECUTE FUNCTION languon_guard_text_ai_route_dispatch();

CREATE OR REPLACE FUNCTION languon_guard_text_ai_routing_revision() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published routing revisions are immutable' USING ERRCODE='55000'; END $$;
CREATE OR REPLACE TRIGGER text_ai_routing_revision_immutable BEFORE UPDATE OR DELETE ON text_ai_routing_revisions FOR EACH ROW EXECUTE FUNCTION languon_guard_text_ai_routing_revision();
