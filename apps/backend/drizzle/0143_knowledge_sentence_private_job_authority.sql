-- Metadata preserves the established dictionary engine while hiding private
-- Knowledge input from queue enumeration, including completed and failed jobs.
CREATE OR REPLACE VIEW public.sentence_worker_jobs WITH (security_barrier=true) AS
 SELECT id,
 learner_id,
 dictionary_id,
 source_kind,
 case when source_kind='dictionary' then source_note_id else null::uuid end AS source_note_id,
 case when source_kind='dictionary' then source_exercise_id else null::uuid end AS source_exercise_id,
 case when source_kind='dictionary' then knowledge_source else null::jsonb end AS knowledge_source,
 case when source_kind='dictionary' then result_knowledge_exercise_id else null::uuid end AS result_knowledge_exercise_id,
 case when source_kind='dictionary' then result_knowledge_attempt_id else null::uuid end AS result_knowledge_attempt_id,
 job_kind,
 format,
 direction,
 CASE WHEN source_kind='dictionary' THEN authority ELSE '{"kind":"owner"}'::jsonb END AS authority,
 case when source_kind='dictionary' then operation_id else null::uuid end AS operation_id,
 case when source_kind='dictionary' then session_id else null::uuid end AS session_id,
 case when source_kind='dictionary' then request_fingerprint else null::text end AS request_fingerprint,
 case when source_kind='dictionary' then reference_revealed else false end AS reference_revealed,
 case when source_kind='dictionary' then input_payload else null::jsonb end AS input_payload,
 execution_state,
 failure_category,
 result_exercise_id,
 result_attempt_id,
 selected_execution_snapshot,
 selected_execution_version,
 execution_revision_id,
 attempt_count,
 max_attempts,
 fencing_token,
 worker_id,
 lease_deadline,
 heartbeat_at,
 cancellation_requested_at,
 next_attempt_at,
 completed_at,
 created_at,
 updated_at,
 ai_credit_accounted,
 ai_credit_reservation_id,
 ai_credit_provider_dispatched_at,
 ai_credit_policy_mode,
 ai_credit_pricing_revision,
 ai_credit_max_credits_per_attempt,
 ai_credit_input_credits_per_million_tokens,
 ai_credit_output_credits_per_million_tokens,
 provider_input_cost_micros_per_million_tokens,
 provider_output_cost_micros_per_million_tokens,
 provider_max_cost_micros_per_attempt,
 provider_max_input_tokens_per_attempt,
 provider_max_output_tokens_per_attempt,
 provider_reservation_state,
 provider_reserved_attempts,
 provider_reserved_cost_micros,
 provider_reserved_input_tokens,
 provider_reserved_output_tokens,
 provider_reservation_settled_at,
 provider_actual_cost_micros,
 provider_actual_input_tokens,
 provider_actual_output_tokens
 FROM public.sentence_ai_jobs WHERE source_kind='dictionary' OR execution_state IN ('queued','running');
CREATE TABLE IF NOT EXISTS knowledge_sentence_worker_leases (
 job_id uuid PRIMARY KEY REFERENCES sentence_ai_jobs(id) ON DELETE CASCADE,
 worker_id text NOT NULL,
 fencing_token bigint NOT NULL,
 capability_digest text,
 operation_kind text NOT NULL CHECK(operation_kind IN ('lease','recovery')),
 authorized_pid integer NOT NULL,
 authorized_txid bigint NOT NULL
);
REVOKE ALL ON TABLE knowledge_sentence_worker_leases FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_sentence_worker_context(job_value uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT c.operation_kind FROM public.knowledge_sentence_worker_leases c JOIN public.sentence_ai_jobs j ON j.id=c.job_id WHERE c.job_id=job_value AND c.authorized_pid=pg_backend_pid() AND c.authorized_txid=txid_current() AND c.worker_id=coalesce(j.worker_id,'') AND c.fencing_token=j.fencing_token
$$;
REVOKE ALL ON FUNCTION languon_sentence_worker_context(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_claim_private_sentence_job(job_value uuid,worker_value text,lease_ms integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE; capability_value text:=gen_random_uuid()::text||gen_random_uuid()::text;
BEGIN
 IF worker_value IS NULL OR char_length(worker_value) NOT BETWEEN 1 AND 200 OR lease_ms NOT BETWEEN 1000 AND 300000 THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' OR j.execution_state<>'queued' OR j.next_attempt_at>clock_timestamp() OR j.cancellation_requested_at IS NOT NULL OR j.attempt_count>=j.max_attempts OR NOT EXISTS(SELECT 1 FROM public.ai_credit_actions a WHERE a.id=j.id AND a.owner_id=j.learner_id AND a.state='active') THEN RETURN NULL; END IF;
 IF NOT public.languon_knowledge_job_source_available(j.id,j.job_kind,j.learner_id) THEN RETURN NULL; END IF;
 UPDATE public.sentence_ai_jobs SET provider_reservation_state=CASE WHEN j.attempt_count>0 THEN 'active' ELSE j.provider_reservation_state END,provider_reserved_attempts=CASE WHEN j.attempt_count>0 THEN j.provider_reserved_attempts+1 ELSE j.provider_reserved_attempts END,provider_reserved_cost_micros=CASE WHEN j.attempt_count>0 THEN coalesce(j.provider_actual_cost_micros,0)+j.provider_max_cost_micros_per_attempt ELSE j.provider_reserved_cost_micros END,provider_reserved_input_tokens=CASE WHEN j.attempt_count>0 THEN coalesce(j.provider_actual_input_tokens,0)+j.provider_max_input_tokens_per_attempt ELSE j.provider_reserved_input_tokens END,provider_reserved_output_tokens=CASE WHEN j.attempt_count>0 THEN coalesce(j.provider_actual_output_tokens,0)+j.provider_max_output_tokens_per_attempt ELSE j.provider_reserved_output_tokens END,provider_reservation_settled_at=CASE WHEN j.attempt_count>0 THEN NULL ELSE j.provider_reservation_settled_at END,execution_state='running',worker_id=worker_value,fencing_token=j.fencing_token+1,attempt_count=j.attempt_count+1,lease_deadline=clock_timestamp()+lease_ms*interval '1 millisecond',heartbeat_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id;
 INSERT INTO public.knowledge_sentence_worker_leases(job_id,worker_id,fencing_token,capability_digest,operation_kind,authorized_pid,authorized_txid) VALUES(j.id,worker_value,j.fencing_token+1,encode(sha256(convert_to(capability_value,'UTF8')),'hex'),'lease',pg_backend_pid(),txid_current()) ON CONFLICT(job_id) DO UPDATE SET worker_id=EXCLUDED.worker_id,fencing_token=EXCLUDED.fencing_token,capability_digest=EXCLUDED.capability_digest,operation_kind='lease',authorized_pid=EXCLUDED.authorized_pid,authorized_txid=EXCLUDED.authorized_txid;
 RETURN jsonb_build_object('inputPayload',j.input_payload,'knowledgeSource',j.knowledge_source,'sourceExerciseId',j.source_exercise_id,'capability',capability_value);
END $$;
REVOKE ALL ON FUNCTION languon_claim_private_sentence_job(uuid,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_read_private_sentence_job(job_value uuid,worker_value text,fence_value bigint,capability_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE; available_value boolean;
BEGIN
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=job_value FOR UPDATE;
 IF capability_value IS NULL OR char_length(capability_value)<>72 OR j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' OR j.execution_state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline IS NULL OR j.lease_deadline<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM public.knowledge_sentence_worker_leases c WHERE c.job_id=j.id AND c.worker_id=worker_value AND c.fencing_token=fence_value AND c.capability_digest=encode(sha256(convert_to(capability_value,'UTF8')),'hex')) THEN RETURN NULL; END IF;
 available_value:=j.cancellation_requested_at IS NULL AND public.languon_knowledge_job_source_available(j.id,j.job_kind,j.learner_id);
 UPDATE public.knowledge_sentence_worker_leases SET authorized_pid=pg_backend_pid(),authorized_txid=txid_current(),operation_kind=CASE WHEN available_value THEN 'lease' ELSE 'recovery' END WHERE job_id=j.id;
 RETURN jsonb_build_object('inputPayload',CASE WHEN available_value THEN j.input_payload ELSE NULL END,'knowledgeSource',CASE WHEN available_value THEN j.knowledge_source ELSE NULL END,'sourceExerciseId',CASE WHEN available_value THEN j.source_exercise_id ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION languon_read_private_sentence_job(uuid,text,bigint,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_recover_private_sentence_job(job_value uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' OR NOT ((j.execution_state='running' AND j.lease_deadline<=clock_timestamp()) OR (j.execution_state='queued' AND (j.cancellation_requested_at IS NOT NULL OR NOT public.languon_knowledge_job_source_available(j.id,j.job_kind,j.learner_id)))) THEN RETURN false; END IF;
 INSERT INTO public.knowledge_sentence_worker_leases(job_id,worker_id,fencing_token,operation_kind,authorized_pid,authorized_txid) VALUES(j.id,coalesce(j.worker_id,''),j.fencing_token,'recovery',pg_backend_pid(),txid_current()) ON CONFLICT(job_id) DO UPDATE SET worker_id=EXCLUDED.worker_id,fencing_token=EXCLUDED.fencing_token,capability_digest=NULL,operation_kind='recovery',authorized_pid=EXCLUDED.authorized_pid,authorized_txid=EXCLUDED.authorized_txid;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION languon_recover_private_sentence_job(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_private_sentence_worker_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_value name; mode_value text; old_value jsonb:=to_jsonb(OLD); new_value jsonb:=to_jsonb(NEW); mutable_keys text[]:=ARRAY['execution_state','failure_category','worker_id','lease_deadline','heartbeat_at','next_attempt_at','completed_at','updated_at','ai_credit_reservation_id','ai_credit_provider_dispatched_at','provider_reservation_state','provider_reserved_attempts','provider_reserved_cost_micros','provider_reserved_input_tokens','provider_reserved_output_tokens','provider_reservation_settled_at','provider_actual_cost_micros','provider_actual_input_tokens','provider_actual_output_tokens'];
BEGIN
 IF OLD.source_kind<>'knowledge-vocabulary' THEN RETURN NEW; END IF;
 SELECT pg_get_userbyid(relowner) INTO owner_value FROM pg_class WHERE oid=TG_RELID;
 -- The invoker is the actual statement executor. A restricted role cannot SET
 -- ROLE to the relation owner; trusted definers execute their own narrow writes.
 IF current_user=owner_value OR pg_has_role(current_user,owner_value,'USAGE') THEN RETURN NEW; END IF;
 mode_value:=public.languon_sentence_worker_context(OLD.id);
 IF mode_value IS NULL THEN RAISE EXCEPTION 'Knowledge sentence mutation requires its private worker capability' USING ERRCODE='42501'; END IF;
 IF NEW.execution_state IN ('completed','failed','cancelled') AND NEW.input_payload IS NULL AND NEW.knowledge_source IS NULL AND NEW.source_exercise_id IS NULL THEN old_value:=old_value-ARRAY['input_payload','knowledge_source','source_exercise_id'];new_value:=new_value-ARRAY['input_payload','knowledge_source','source_exercise_id']; END IF;
 IF OLD.provider_reservation_state IS DISTINCT FROM NEW.provider_reservation_state OR OLD.provider_reserved_attempts IS DISTINCT FROM NEW.provider_reserved_attempts OR OLD.provider_reserved_cost_micros IS DISTINCT FROM NEW.provider_reserved_cost_micros OR OLD.provider_reserved_input_tokens IS DISTINCT FROM NEW.provider_reserved_input_tokens OR OLD.provider_reserved_output_tokens IS DISTINCT FROM NEW.provider_reserved_output_tokens OR OLD.provider_reservation_settled_at IS DISTINCT FROM NEW.provider_reservation_settled_at OR OLD.provider_actual_cost_micros IS DISTINCT FROM NEW.provider_actual_cost_micros OR OLD.provider_actual_input_tokens IS DISTINCT FROM NEW.provider_actual_input_tokens OR OLD.provider_actual_output_tokens IS DISTINCT FROM NEW.provider_actual_output_tokens THEN RAISE EXCEPTION 'Private sentence accounting facts require canonical settlement synchronization' USING ERRCODE='42501'; END IF;
 IF (old_value-mutable_keys) IS DISTINCT FROM (new_value-mutable_keys) OR (NEW.worker_id IS DISTINCT FROM OLD.worker_id AND NEW.worker_id IS NOT NULL) OR (NEW.execution_state='running' AND OLD.execution_state<>'running') THEN RAISE EXCEPTION 'Knowledge sentence admission and publication fields are immutable to workers' USING ERRCODE='42501'; END IF;
 IF mode_value='lease' AND (OLD.execution_state<>'running' OR OLD.lease_deadline<=clock_timestamp()) THEN RAISE EXCEPTION 'Private sentence worker lease expired' USING ERRCODE='23514'; END IF;
 IF mode_value='recovery' AND ((NEW.execution_state NOT IN ('failed','cancelled') AND NEW.execution_state<>OLD.execution_state AND NOT (NEW.execution_state='queued' AND OLD.execution_state='running' AND OLD.lease_deadline<=clock_timestamp() AND OLD.ai_credit_provider_dispatched_at IS NULL)) OR (NEW.lease_deadline IS DISTINCT FROM OLD.lease_deadline AND NEW.lease_deadline IS NOT NULL) OR (NEW.provider_reservation_state='active' AND NEW.provider_reservation_state IS DISTINCT FROM OLD.provider_reservation_state)) THEN RAISE EXCEPTION 'Private sentence recovery can only retire failed or undispatched expired work' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_private_sentence_worker_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_sentence_worker_mutation ON public.sentence_ai_jobs;
CREATE TRIGGER knowledge_sentence_worker_mutation BEFORE UPDATE ON public.sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_private_sentence_worker_mutation();

CREATE OR REPLACE FUNCTION languon_clear_private_sentence_worker_lease() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.source_kind='knowledge-vocabulary' AND NEW.execution_state<>'running' THEN DELETE FROM public.knowledge_sentence_worker_leases WHERE job_id=NEW.id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_clear_private_sentence_worker_lease() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_sentence_worker_lease_cleanup ON public.sentence_ai_jobs;
CREATE TRIGGER knowledge_sentence_worker_lease_cleanup AFTER UPDATE ON public.sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_clear_private_sentence_worker_lease();

CREATE OR REPLACE FUNCTION languon_assert_private_sentence_dispatch(job_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.sentence_ai_jobs WHERE id=job_value AND source_kind='knowledge-vocabulary') AND public.languon_sentence_worker_context(job_value) IS DISTINCT FROM 'lease' THEN RAISE EXCEPTION 'Private sentence dispatch requires its current secret lease capability' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION languon_assert_private_sentence_dispatch(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_knowledge_sentence_publication_job(job_value uuid, worker_value text, fence_value bigint, kind_value text)
RETURNS public.sentence_ai_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE;
BEGIN
 PERFORM public.languon_assert_private_sentence_dispatch(job_value);
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' OR j.job_kind IS DISTINCT FROM kind_value OR j.execution_state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline IS NULL OR j.lease_deadline<=clock_timestamp() OR j.cancellation_requested_at IS NOT NULL OR j.ai_credit_provider_dispatched_at IS NULL OR j.result_knowledge_exercise_id IS NOT NULL OR j.result_knowledge_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'Knowledge sentence publication requires its unconsumed dispatched worker fence' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts a WHERE a.action_id=j.id AND a.execution_job_id=j.id AND a.state='dispatched' AND a.purpose='answer') THEN RAISE EXCEPTION 'Knowledge sentence publication requires its financial dispatch witness' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_assert_knowledge_job_source(j.id,j.job_kind,j.learner_id);
 RETURN j;
END $$;
REVOKE ALL ON FUNCTION languon_knowledge_sentence_publication_job(uuid,text,bigint,text) FROM PUBLIC;

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
 PERFORM public.languon_assert_knowledge_job_source(job_value,k,owner_value);
 PERFORM public.languon_assert_private_sentence_dispatch(job_value);
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

CREATE OR REPLACE FUNCTION languon_sync_private_sentence_accounting(job_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE; input_value bigint;output_value bigint;cost_value bigint;
BEGIN
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' OR (public.languon_sentence_worker_context(j.id) IS NULL AND NOT EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=j.id AND owner_id=j.learner_id AND state='settled')) THEN RAISE EXCEPTION 'Private sentence accounting requires its settled action or current worker authority' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=j.id AND state<>'settled') THEN RAISE EXCEPTION 'Private sentence accounting cannot synchronize an unsettled provider attempt' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(coalesce(input_tokens,input_limit)),0),coalesce(sum(coalesce(output_tokens,output_limit)),0),coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0) INTO input_value,output_value,cost_value FROM public.ai_credit_action_attempts WHERE action_id=j.id;
 UPDATE public.sentence_ai_jobs SET provider_reservation_state=CASE WHEN j.ai_credit_provider_dispatched_at IS NOT NULL OR cost_value>0 THEN 'settled' ELSE 'released' END,provider_reservation_settled_at=clock_timestamp(),provider_actual_input_tokens=input_value::integer,provider_actual_output_tokens=output_value::integer,provider_actual_cost_micros=cost_value::integer WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION languon_sync_private_sentence_accounting(uuid) FROM PUBLIC;
