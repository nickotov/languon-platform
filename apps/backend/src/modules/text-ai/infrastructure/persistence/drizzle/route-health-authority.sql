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
