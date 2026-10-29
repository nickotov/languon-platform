-- Canonical typed duration authority. Existing text/speech paths keep their prior semantics.
CREATE OR REPLACE FUNCTION languon_guard_action_charging_policy() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_capability text; published ai_capability_policy_revisions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF public.languon_operator_purge_authorized(OLD.owner_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Admitted charging policies cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'Admitted charging policies are immutable' USING ERRCODE='23514';
  END IF;
  expected_capability := CASE NEW.job_kind
    WHEN 'portrait-interview' THEN 'portrait-interview'
    WHEN 'conversation-turn' THEN 'conversation'
    WHEN 'knowledge-transcription' THEN 'speech'
    WHEN 'speech-generation' THEN 'speech'
    WHEN 'dictionary-generation' THEN 'dictionary-generation'
    WHEN 'sentence-generation' THEN 'sentence-generation'
    WHEN 'sentence-check' THEN 'sentence-generation'
    WHEN 'text-detection' THEN 'text-translation'
    WHEN 'text-translation' THEN 'text-translation'
    WHEN 'text-selection-card' THEN 'text-translation' END;
  IF expected_capability IS NULL OR NEW.policy->>'capability' IS DISTINCT FROM expected_capability
     OR NEW.policy - ARRAY['capability','version','revisionId','funding','updatedAt'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Action capability snapshot mismatch' USING ERRCODE='23514';
  END IF;
  IF (NEW.policy->>'version')::integer IS DISTINCT FROM
     (SELECT coalesce(max(version),0) FROM ai_capability_policy_revisions WHERE capability=expected_capability) THEN
    RAISE EXCEPTION 'New action requires the currently published charging policy' USING ERRCODE='23514';
  END IF;
  IF NEW.policy->>'version'='0' THEN
    IF NEW.policy->'revisionId' IS DISTINCT FROM 'null'::jsonb
       OR NEW.policy->'updatedAt' IS DISTINCT FROM 'null'::jsonb
       OR NEW.policy->>'funding' IS DISTINCT FROM (CASE WHEN expected_capability='portrait-interview' THEN 'operator' ELSE 'customer' END) THEN
      RAISE EXCEPTION 'Invalid initial charging policy' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO published FROM ai_capability_policy_revisions
      WHERE id=(NEW.policy->>'revisionId')::uuid AND capability=expected_capability;
    IF published.id IS NULL OR published.version::text IS DISTINCT FROM NEW.policy->>'version'
       OR published.funding IS DISTINCT FROM NEW.policy->>'funding'
       OR published.created_at IS DISTINCT FROM (NEW.policy->>'updatedAt')::timestamptz THEN
      RAISE EXCEPTION 'Charging policy provenance mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION languon_ai_credit_feature_authority(action_id_value uuid, kind_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_value uuid; state_value text; explicit_stop_value boolean := false;
BEGIN
    CASE kind_value
    WHEN 'dictionary-generation' THEN
        SELECT owner_id,execution_state::text,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM dictionary_generation_jobs WHERE id=action_id_value;
    WHEN 'sentence-generation','sentence-check' THEN
        SELECT learner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM sentence_ai_jobs WHERE id=action_id_value AND job_kind=kind_value;
        IF owner_value IS NULL AND kind_value='sentence-generation' THEN
            SELECT p.learner_id,
                CASE m.terminal_outcome WHEN 'success' THEN 'completed' WHEN 'stopped' THEN 'cancelled' WHEN 'failure' THEN 'failed' ELSE 'running' END,
                m.terminal_outcome='stopped' AND EXISTS(SELECT 1 FROM sentence_preparation_commands c
                    WHERE c.preparation_id=p.id AND c.learner_id=p.learner_id AND c.action='stop' AND c.authorization_action_id=m.action_id)
            INTO owner_value,state_value,explicit_stop_value
            FROM sentence_preparation_actions m JOIN sentence_preparations p ON p.id=m.preparation_id
            WHERE m.action_id=action_id_value;
        END IF;
    WHEN 'text-detection','text-translation' THEN
        SELECT owner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM texts_ai_jobs WHERE id=action_id_value AND job_kind=kind_value;
    WHEN 'text-selection-card' THEN
        SELECT owner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM dictionary_text_selection_jobs WHERE id=action_id_value;
    WHEN 'conversation-turn' THEN
        SELECT owner_id,status,cancel_requested AND failure_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM conversation_turns WHERE id=action_id_value;
    WHEN 'portrait-interview' THEN
        SELECT owner_id,state,cancel_requested AND error_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM learner_portrait_interview_operations WHERE id=action_id_value;
    WHEN 'knowledge-transcription' THEN
        SELECT owner_id,state,cancellation_requested_at IS NOT NULL AND failure_code='explicit_stop' INTO owner_value,state_value,explicit_stop_value FROM knowledge_transcription_jobs WHERE id=action_id_value;
    WHEN 'speech-generation' THEN
        SELECT payer_id,state,false INTO owner_value,state_value,explicit_stop_value FROM speech_jobs WHERE id=action_id_value;
    ELSE RAISE EXCEPTION 'Unknown action feature kind' USING ERRCODE='23514';
    END CASE;
    IF owner_value IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('ownerId',owner_value,'state',state_value,'explicitStop',coalesce(explicit_stop_value,false),'jobKind',kind_value);
END; $$;

CREATE OR REPLACE FUNCTION languon_transcription_feature_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_ai_credit_record_feature_authority(NEW.id,'knowledge-transcription');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS knowledge_transcription_action_authority ON public.knowledge_transcription_jobs;
CREATE TRIGGER knowledge_transcription_action_authority AFTER INSERT OR UPDATE ON public.knowledge_transcription_jobs FOR EACH ROW EXECUTE FUNCTION languon_transcription_feature_authority();

CREATE OR REPLACE FUNCTION languon_authorize_transcription_dispatch(job_value uuid, worker_value text, fence_value integer, checksum_value text, bytes_value integer, duration_value integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; a public.ai_credit_actions%ROWTYPE; c public.knowledge_transcription_config_revisions%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; m record; evaluated jsonb; instant_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); call_value uuid:=gen_random_uuid(); attempt_value uuid:=gen_random_uuid(); reserved_value bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Transcription job is unavailable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.owner_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=j.id FOR UPDATE;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 instant_value:=date_trunc('milliseconds',clock_timestamp());
 IF worker_value IS NULL OR fence_value IS NULL OR j.lease_deadline IS NULL OR j.state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=instant_value OR j.deadline_at<=instant_value OR j.cancellation_requested_at IS NOT NULL OR j.dispatched_at IS NOT NULL OR a.id IS NULL OR a.state<>'active' OR a.deadline_at<=instant_value OR a.usage_meter<>'audio-duration' OR a.audio_input_limit_milliseconds IS DISTINCT FROM j.source_duration_ms OR a.output_limit<>0 THEN RAISE EXCEPTION 'Transcription requires its original active duration allowance and live lease' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dictionary_ai_worker_observations WHERE worker_id=worker_value AND provider_id='openai' AND model_id='gpt-transcribe' AND adapter_revision='knowledge-transcription:v1' AND status='available' AND expires_at>instant_value AND text_ai_supported_formats @> '["knowledge-transcription:v1"]'::jsonb) THEN RAISE EXCEPTION 'A live compatible transcription executor is required' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.users WHERE id=j.owner_id AND status='active' FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'Transcription owner is unavailable' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.knowledge_notes WHERE id=j.note_id AND owner_id=j.owner_id FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'Transcription source is unavailable' USING ERRCODE='23514'; END IF;
 IF a.funding='customer' AND a.held_milli<j.maximum_credits_milli THEN RAISE EXCEPTION 'Transcription requires its complete customer hold' USING ERRCODE='23514'; END IF;
 SELECT b.checksum,octet_length(b.bytes) AS bytes,b.duration_ms INTO m FROM public.knowledge_media_assets g JOIN public.knowledge_media_blobs b ON b.id=g.blob_id WHERE g.id=j.asset_id AND g.note_id=j.note_id;
 IF NOT FOUND OR m.checksum IS DISTINCT FROM j.checksum OR checksum_value IS DISTINCT FROM j.checksum OR bytes_value IS DISTINCT FROM j.byte_length OR duration_value IS DISTINCT FROM j.source_duration_ms OR m.bytes IS DISTINCT FROM j.byte_length OR m.duration_ms IS DISTINCT FROM j.source_duration_ms THEN RAISE EXCEPTION 'Transcription input no longer matches its verified immutable source' USING ERRCODE='23514'; END IF;
 SELECT r.* INTO c FROM public.knowledge_transcription_state s JOIN public.knowledge_transcription_config_revisions r ON r.id=s.active_revision_id WHERE s.id='global' FOR SHARE OF s;
 IF c.processing_controls_revision IS NULL OR c.processing_controls_revision IS DISTINCT FROM j.processing_controls_revision OR c.processing_controls_revision IS DISTINCT FROM public.languon_approved_transcription_processing_revision() THEN RAISE EXCEPTION 'Private audio processing has not been approved for this release' USING ERRCODE='23514'; END IF;
 IF NOT c.data_sharing_disabled OR c.data_sharing_evidence IS NULL OR c.data_sharing_attested_at IS NULL OR c.data_sharing_attested_at+interval '30 days'<=instant_value OR c.processing_credential_fingerprint IS NULL OR c.processing_credential_fingerprint IS DISTINCT FROM j.processing_credential_fingerprint THEN RAISE EXCEPTION 'Current credential-bound organization data sharing attestation is required' USING ERRCODE='23514'; END IF;
 IF c.id IS DISTINCT FROM j.configuration_revision_id OR NOT c.enabled OR NOT c.billing_rules_verified OR c.billing_evidence IS NULL OR c.credits_per_minute IS NULL OR c.maximum_bytes<j.byte_length OR c.maximum_duration_ms<j.source_duration_ms OR a.tariff->>'audioCreditsPerMinute' IS DISTINCT FROM c.credits_per_minute THEN RAISE EXCEPTION 'Transcription configuration is not ready or changed' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=c.provider_price_revision_id;
 IF p.id IS NULL OR p.id IS DISTINCT FROM (j.provider_price_snapshot->>'id')::uuid OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.data->'nativeRules' IS DISTINCT FROM j.provider_price_snapshot->'nativeRules' OR p.provider_id<>'openai' OR p.model_id<>'gpt-transcribe' OR p.meter<>'audio-duration' OR NOT (p.data ? 'nativeRules') OR NOT public.languon_native_meter_compatible(p.data,'audio-duration') OR p.effective_at>j.created_at THEN RAISE EXCEPTION 'Transcription native price pin is unavailable' USING ERRCODE='23514'; END IF;
 evaluated:=public.languon_evaluate_provider_price(p.data,jsonb_build_object('endpointId','/v1/audio/transcriptions','dispatchedAt',to_char(instant_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'latestDispatchAt',to_char(date_trunc('milliseconds',a.deadline_at-interval '1 microsecond') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),jsonb_build_object('audioInputMilliseconds',j.source_duration_ms,'requests',1),'upper-bound');
 IF evaluated->>'status'<>'calculated' THEN RAISE EXCEPTION 'Transcription has no reviewed finite provider bound' USING ERRCODE='23514'; END IF;
 reserved_value:=(evaluated->>'amountUsdMicros')::bigint;
 IF reserved_value>c.maximum_provider_cost_micros OR NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE action_id=j.id AND state='active' AND reserved_micros>=reserved_value) OR EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=j.id) THEN RAISE EXCEPTION 'Transcription operational allowance is unavailable' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(attempt_id,action_id,reserved_micros,created_at) VALUES(attempt_value,j.id,reserved_value,instant_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,usage_meter,audio_input_limit_milliseconds,created_at,provider_dispatch_witness) VALUES(attempt_value,j.id,j.id,1,'answer','dispatched',jsonb_build_object('usageMeter','audio-duration','audioInputLimitMilliseconds',j.source_duration_ms,'maxCostMicrosPerAttempt',reserved_value),reserved_value,0,0,'audio-duration',j.source_duration_ms,instant_value,jsonb_build_object('jobId',j.id,'worker',worker_value,'fence',fence_value::text,'processingCredentialFingerprint',j.processing_credential_fingerprint));
 INSERT INTO public.ai_credit_native_call_dispatches(id,attempt_id,ordinal,input_limit,output_limit,call_kind,audio_input_limit_milliseconds,dispatched_at) VALUES(call_value,attempt_value,1,0,0,'audio-transcription',j.source_duration_ms,instant_value);
 UPDATE public.knowledge_transcription_jobs SET receipt_id=call_value,attempt_id=attempt_value,dispatched_at=instant_value,updated_at=instant_value WHERE id=j.id;
 RETURN jsonb_build_object('receiptId',call_value,'operationId',j.id,'noteId',j.note_id,'assetId',j.asset_id,'checksum',j.checksum,'providerId','openai','modelId','gpt-transcribe','providerPriceRevisionId',p.id,'customerTariffRevisionId',c.id,'processingControlsRevision',j.processing_controls_revision,'processingCredentialFingerprint',j.processing_credential_fingerprint,'usageMeter','audioInputMilliseconds','maximumBytes',j.byte_length,'maximumDurationMs',j.source_duration_ms,'expiresAt',to_char(least(j.lease_deadline,j.deadline_at,a.deadline_at,c.data_sharing_attested_at+interval '30 days') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;
REVOKE ALL ON FUNCTION languon_authorize_transcription_dispatch(uuid,text,integer,text,integer,integer) FROM PUBLIC;

-- Only a typed transcription result may attach duration observations to its issued receipt.
CREATE OR REPLACE FUNCTION languon_observe_transcription_call(job_value uuid, receipt_value uuid, duration_value bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; r public.ai_credit_native_call_dispatches%ROWTYPE; u jsonb;
BEGIN
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 SELECT * INTO r FROM public.ai_credit_native_call_dispatches WHERE id=receipt_value FOR UPDATE;
 IF j.id IS NULL OR r.id IS NULL OR j.receipt_id IS DISTINCT FROM r.id OR j.attempt_id IS DISTINCT FROM r.attempt_id OR r.call_kind<>'audio-transcription' THEN RAISE EXCEPTION 'Transcription observation requires its issued duration receipt' USING ERRCODE='23514'; END IF;
 IF duration_value IS NOT NULL AND (duration_value<0 OR duration_value>9007199254740991) THEN RAISE EXCEPTION 'Invalid reported transcription duration' USING ERRCODE='23514'; END IF;
 u:=jsonb_build_object('requests',1)||CASE WHEN duration_value IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('audioInputMilliseconds',duration_value) END;
 IF r.observed_at IS NOT NULL THEN
  IF r.provider_usage IS DISTINCT FROM u THEN RAISE EXCEPTION 'Transcription observation replay differs' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 UPDATE public.ai_credit_native_call_dispatches SET provider_usage=u,provider_execution_facts=jsonb_build_object('endpointId','/v1/audio/transcriptions'),observed_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION languon_observe_transcription_call(uuid,uuid,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_transcription_provider_expense_identity(attempt_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public.ai_credit_action_attempts%ROWTYPE; j public.knowledge_transcription_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; evaluated jsonb; amount_value bigint;
BEGIN
 SELECT * INTO t FROM public.ai_credit_action_attempts WHERE id=attempt_value;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=t.execution_job_id;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF t.id IS NULL OR t.state<>'settled' OR j.attempt_id IS DISTINCT FROM t.id OR t.usage_meter<>'audio-duration' OR p.id IS NULL OR p.meter<>'audio-duration' OR p.provider_id<>'openai' OR p.model_id<>'gpt-transcribe' OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.data->'nativeRules' IS DISTINCT FROM j.provider_price_snapshot->'nativeRules' THEN RAISE EXCEPTION 'Transcription expense requires immutable duration provenance' USING ERRCODE='23514'; END IF;
 evaluated:=public.languon_native_parent_expense(p.data,t.id,t.provider_usage->'calls');
 IF evaluated->>'status'='calculated' THEN amount_value:=(evaluated->>'amountUsdMicros')::bigint; END IF;
 RETURN jsonb_build_object('attemptId',t.id,'actionId',j.id,'attemptReference','knowledge-transcription:'||t.id::text,'sourceKind','transcription-attempt','providerId',p.provider_id,'modelId',p.model_id,'measurement',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'measured' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',t.created_at);
END $$;
REVOKE ALL ON FUNCTION languon_transcription_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_transcription_attempt(job_value uuid, successful_value boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; t public.ai_credit_action_attempts%ROWTYPE; e jsonb; f public.ai_provider_expense_records%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 IF j.attempt_id IS NULL THEN RETURN; END IF;
 SELECT * INTO t FROM public.ai_credit_action_attempts WHERE id=j.attempt_id FOR UPDATE;
 IF t.id IS NULL OR t.usage_meter<>'audio-duration' OR t.execution_job_id IS DISTINCT FROM j.id THEN RAISE EXCEPTION 'Transcription attempt is unavailable' USING ERRCODE='23514'; END IF;
 IF t.state='settled' THEN RETURN; END IF;
 IF successful_value AND (j.state<>'completed' OR j.result IS NULL OR j.receipt_id IS NULL OR j.result->>'receiptId' IS DISTINCT FROM j.receipt_id::text) THEN RAISE EXCEPTION 'Transcription success requires the validated published result' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_credit_action_attempts SET state='settled',successful=CASE WHEN successful_value THEN 1 ELSE 0 END,provider_usage=jsonb_build_object('calls',public.languon_native_parent_calls(t.id)),settled_at=clock_timestamp() WHERE id=t.id;
 e:=public.languon_transcription_provider_expense_identity(t.id);
 INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_id,action_id,attempt_reference,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at) VALUES(gen_random_uuid(),'transcription-attempt',t.id,j.id,e->>'attemptReference',e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',(e->>'amountUsdMicros')::bigint,t.created_at) ON CONFLICT(attempt_reference) DO NOTHING;
 SELECT * INTO f FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
 IF f.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR f.source_kind<>'transcription-attempt' OR f.attempt_id IS DISTINCT FROM t.id THEN RAISE EXCEPTION 'Transcription expense replay differs' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_credit_action_attempts SET actual_cost_micros=f.amount_usd_micros WHERE id=t.id;
 UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(f.amount_usd_micros,reserved_micros),measurement=CASE WHEN f.amount_usd_micros IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=clock_timestamp() WHERE attempt_id=t.id AND settled_at IS NULL;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_settle_transcription_attempt(uuid,boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ai_credit_action_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE;
DECLARE count_calls integer;
DECLARE output_used bigint;
BEGIN
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.actual_cost_micros IS NOT DISTINCT FROM ((CASE WHEN OLD.usage_meter='audio-duration' THEN public.languon_transcription_provider_expense_identity(OLD.id) ELSE public.languon_text_provider_expense_identity(OLD.id) END)->>'amountUsdMicros')::bigint
     AND (to_jsonb(NEW)-'actual_cost_micros')=(to_jsonb(OLD)-'actual_cost_micros') THEN RETURN NEW; END IF;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider dispatch requires active action authorization'; END IF;
  IF NEW.usage_meter IS DISTINCT FROM action_row.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM action_row.audio_input_limit_milliseconds THEN RAISE EXCEPTION 'Attempt dimensions must match the parent action'; END IF;
  IF NEW.usage_meter='audio-duration' AND (NEW.input_tokens IS NOT NULL OR NEW.output_tokens IS NOT NULL OR NEW.input_limit<>0 OR NEW.output_limit<>0) THEN RAISE EXCEPTION 'Duration observations cannot be interpreted as tokens'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'dispatched' OR NEW.state<>'settled' OR
      NEW.id<>OLD.id OR NEW.action_id<>OLD.action_id OR NEW.execution_job_id IS DISTINCT FROM OLD.execution_job_id OR NEW.ordinal<>OLD.ordinal OR NEW.purpose<>OLD.purpose
      OR NEW.usage_meter IS DISTINCT FROM OLD.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM OLD.audio_input_limit_milliseconds OR NEW.input_limit<>OLD.input_limit OR NEW.output_limit<>OLD.output_limit OR NEW.budget<>OLD.budget
      OR NEW.reserved_cost_micros<>OLD.reserved_cost_micros OR NEW.created_at<>OLD.created_at OR NEW.provider_dispatch_witness IS DISTINCT FROM OLD.provider_dispatch_witness THEN
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

CREATE OR REPLACE FUNCTION ai_credit_action_settlement_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE lot record;
BEGIN
  IF OLD.state<>'active' THEN RAISE EXCEPTION 'Settled actions are immutable'; END IF;
  IF NEW.usage_meter IS DISTINCT FROM OLD.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM OLD.audio_input_limit_milliseconds OR NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.capability<>OLD.capability OR NEW.funding<>OLD.funding
    OR NEW.policy_version<>OLD.policy_version OR NEW.tariff<>OLD.tariff OR NEW.held_milli<>OLD.held_milli
    OR NEW.budget_milli<>OLD.budget_milli OR NEW.output_limit<>OLD.output_limit
    OR NEW.created_at<>OLD.created_at OR NEW.deadline_at<>OLD.deadline_at THEN
      RAISE EXCEPTION 'Action authorization is immutable';
  END IF;
  IF NEW.state='settled' THEN
    IF (SELECT coalesce(sum(allocated_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.id)<>NEW.held_milli
      OR (SELECT coalesce(sum(settled_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.id)<>NEW.charged_milli THEN
      RAISE EXCEPTION 'Action allocations do not match settlement';
    END IF;
    FOR lot IN SELECT * FROM public.ai_credit_action_allocations WHERE action_id=NEW.id LOOP
      UPDATE public.ai_credit_grant_balances SET remaining_credits=remaining_credits+lot.allocated_milli-lot.settled_milli,
        reserved_credits=reserved_credits-lot.allocated_milli, consumed_credits=consumed_credits+lot.settled_milli
        WHERE grant_id=lot.grant_id AND owner_id=NEW.owner_id AND reserved_credits>=lot.allocated_milli;
      IF NOT FOUND THEN RAISE EXCEPTION 'Action grant projection is inconsistent'; END IF;
    END LOOP;
    UPDATE public.ai_credit_wallet_totals SET reserved_credits=reserved_credits-NEW.held_milli,
      consumed_credits=consumed_credits+NEW.charged_milli WHERE owner_id=NEW.owner_id AND reserved_credits>=NEW.held_milli;
    IF NEW.held_milli>0 AND NOT FOUND THEN RAISE EXCEPTION 'Action wallet projection is inconsistent'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION languon_guard_transcription_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.created_by IS NULL AND OLD.created_by IS NOT NULL AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') AND public.languon_operator_purge_authorized(OLD.created_by) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.created_by IS NULL AND OLD.created_by IS NOT NULL AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.created_by) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Transcription configuration revisions are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS knowledge_transcription_configuration_immutable ON public.knowledge_transcription_config_revisions;
CREATE TRIGGER knowledge_transcription_configuration_immutable BEFORE UPDATE OR DELETE ON public.knowledge_transcription_config_revisions FOR EACH ROW EXECUTE FUNCTION languon_guard_transcription_configuration();

-- Note deletion settles holds before its ordinary cascading removal of private job payloads.
CREATE OR REPLACE FUNCTION languon_cancel_note_transcriptions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.owner_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT * FROM public.knowledge_transcription_jobs WHERE note_id=OLD.id AND state IN ('queued','running') ORDER BY id FOR UPDATE LOOP
  UPDATE public.knowledge_transcription_jobs SET state='failed',result=NULL,failure_code='source_deleted',cancellation_requested_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id;
  PERFORM public.languon_settle_transcription_attempt(j.id,false);
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=j.id AND state='active') THEN PERFORM public.languon_settle_credit_action(j.id,'failure',clock_timestamp()); END IF;
 END LOOP;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS knowledge_note_transcription_erasure ON public.knowledge_notes;
CREATE TRIGGER knowledge_note_transcription_erasure BEFORE DELETE ON public.knowledge_notes FOR EACH ROW EXECUTE FUNCTION languon_cancel_note_transcriptions();

CREATE OR REPLACE FUNCTION languon_guard_transcription_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.knowledge_transcription_config_revisions%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; a public.ai_credit_actions%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['state','maximum_credits_milli','deadline_at','worker_id','fencing_token','lease_deadline','cancellation_requested_at','receipt_id','attempt_id','dispatched_at','observed_audio_input_ms','result','failure_code','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','maximum_credits_milli','deadline_at','worker_id','fencing_token','lease_deadline','cancellation_requested_at','receipt_id','attempt_id','dispatched_at','observed_audio_input_ms','result','failure_code','updated_at']) THEN RAISE EXCEPTION 'Transcription source and configuration identities are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state IN ('completed','failed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Terminal transcription output is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state<>'confirmation-required' AND (NEW.maximum_credits_milli IS DISTINCT FROM OLD.maximum_credits_milli OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at) THEN RAISE EXCEPTION 'Confirmed transcription spending allowance is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.dispatched_at IS NOT NULL AND (NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at OR NEW.receipt_id IS DISTINCT FROM OLD.receipt_id OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id) THEN RAISE EXCEPTION 'Transcription dispatch identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.state='running' THEN
   IF NEW.worker_id IS NULL OR NEW.lease_deadline IS NULL OR NEW.lease_deadline>NEW.deadline_at OR NEW.lease_deadline<=clock_timestamp() OR NOT ((OLD.state='queued' AND NEW.fencing_token=OLD.fencing_token+1) OR (OLD.state='running' AND NEW.worker_id IS NOT DISTINCT FROM OLD.worker_id AND NEW.fencing_token=OLD.fencing_token)) THEN RAISE EXCEPTION 'Transcription requires a current fenced lease' USING ERRCODE='23514'; END IF;
  ELSIF NEW.state IN ('completed','failed','cancelled') THEN
   IF NEW.state='completed' AND (OLD.state<>'running' OR OLD.lease_deadline<=clock_timestamp() OR NEW.deadline_at<=clock_timestamp() OR NEW.cancellation_requested_at IS NOT NULL OR NEW.receipt_id IS NULL OR NEW.result->>'receiptId' IS DISTINCT FROM NEW.receipt_id::text OR jsonb_typeof(NEW.result->'text') IS DISTINCT FROM 'string' OR char_length(NEW.result->>'text') NOT BETWEEN 1 AND 80000 OR octet_length(NEW.result::text)>524288 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.owner_id AND status='active') OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=NEW.note_id AND owner_id=NEW.owner_id) OR NOT EXISTS(SELECT 1 FROM public.knowledge_media_assets g JOIN public.knowledge_media_blobs b ON b.id=g.blob_id WHERE g.id=NEW.asset_id AND g.note_id=NEW.note_id AND b.checksum=NEW.checksum AND b.duration_ms=NEW.source_duration_ms AND octet_length(b.bytes)=NEW.byte_length)) THEN RAISE EXCEPTION 'Transcription publication requires live source, lease and validated text' USING ERRCODE='23514'; END IF;
  ELSIF NOT ((OLD.state='confirmation-required' AND NEW.state IN ('confirmation-required','queued')) OR (OLD.state='queued' AND NEW.state='queued' AND NEW.cancellation_requested_at IS NOT NULL)) THEN RAISE EXCEPTION 'Invalid transcription lifecycle transition' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.state NOT IN ('confirmation-required','queued') OR NEW.receipt_id IS NOT NULL OR NEW.dispatched_at IS NOT NULL OR NEW.attempt_id IS NOT NULL OR NEW.result IS NOT NULL OR NEW.fencing_token<>0 THEN RAISE EXCEPTION 'New transcription must be undispatched work' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO c FROM public.knowledge_transcription_config_revisions WHERE id=NEW.configuration_revision_id;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(NEW.provider_price_snapshot->>'id')::uuid;
 IF c.id IS NULL OR p.id IS NULL OR c.provider_price_revision_id IS DISTINCT FROM p.id OR p.version IS DISTINCT FROM (NEW.provider_price_snapshot->>'version')::integer OR p.data->'nativeRules' IS DISTINCT FROM NEW.provider_price_snapshot->'nativeRules' OR c.credits_per_minute IS NULL OR p.meter<>'audio-duration' OR p.provider_id<>'openai' OR p.model_id<>'gpt-transcribe' THEN RAISE EXCEPTION 'Transcription requires immutable native price and customer tariff pins' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS knowledge_transcription_job_guard ON public.knowledge_transcription_jobs;
CREATE TRIGGER knowledge_transcription_job_guard BEFORE INSERT OR UPDATE ON public.knowledge_transcription_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_transcription_job();

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_action_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pin ai_action_charging_policies%ROWTYPE; account_mode text; unlimited_expiry timestamptz; effective_unlimited boolean; duration_job public.knowledge_transcription_jobs%ROWTYPE; duration_config public.knowledge_transcription_config_revisions%ROWTYPE; duration_max bigint;
BEGIN
    SELECT * INTO pin FROM ai_action_charging_policies WHERE job_id=NEW.id;
    IF pin.job_id IS NULL OR pin.owner_id IS DISTINCT FROM NEW.owner_id
        OR pin.policy->>'capability' IS DISTINCT FROM NEW.capability
        OR (pin.policy->>'version')::integer IS DISTINCT FROM NEW.policy_version
        OR NEW.created_at<pin.created_at OR NEW.state<>'active' THEN
        RAISE EXCEPTION 'Action admission requires its immutable owned charging policy' USING ERRCODE='23514';
    END IF;
    IF pin.policy->>'funding'='operator' THEN
        IF NEW.funding<>'operator' OR NEW.held_milli<>0 THEN
            RAISE EXCEPTION 'Operator action cannot charge customer credits' USING ERRCODE='23514';
        END IF;
    ELSIF pin.policy->>'funding'='customer' THEN
        SELECT mode::text,unlimited_until INTO account_mode,unlimited_expiry FROM ai_credit_accounts WHERE user_id=NEW.owner_id;
        effective_unlimited := coalesce(account_mode='unlimited' AND (unlimited_expiry IS NULL OR unlimited_expiry>NEW.created_at),false);
        IF effective_unlimited AND (NEW.funding<>'unlimited' OR NEW.held_milli<>0) THEN
            RAISE EXCEPTION 'Unlimited entitlement must preserve finite customer grants' USING ERRCODE='23514';
        ELSIF NOT effective_unlimited AND (NEW.funding<>'customer' OR (NEW.held_milli=0 AND NOT coalesce((
            (NEW.tariff->>'inputCreditsPerMillionTokens')::numeric=0
            AND coalesce((NEW.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(NEW.tariff->>'inputCreditsPerMillionTokens')::numeric)=0
            AND (NEW.tariff->>'outputCreditsPerMillionTokens')::numeric=0),false))) THEN
            RAISE EXCEPTION 'Customer action requires its finite credit hold' USING ERRCODE='23514';
        END IF;
    ELSE RAISE EXCEPTION 'Invalid pinned action funding' USING ERRCODE='23514'; END IF;
    IF NEW.usage_meter='audio-duration' THEN
        SELECT * INTO duration_job FROM public.knowledge_transcription_jobs WHERE id=NEW.id;
        SELECT * INTO duration_config FROM public.knowledge_transcription_config_revisions WHERE id=duration_job.configuration_revision_id;
        IF pin.job_kind<>'knowledge-transcription' OR NEW.capability<>'speech' OR duration_job.id IS NULL OR duration_job.owner_id IS DISTINCT FROM NEW.owner_id OR duration_job.state<>'queued' OR duration_config.id IS NULL OR duration_config.credits_per_minute IS NULL OR NEW.tariff->>'audioCreditsPerMinute' IS DISTINCT FROM duration_config.credits_per_minute OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM duration_job.source_duration_ms OR NEW.output_limit<>0 OR NEW.tariff->>'inputCreditsPerMillionTokens' IS DISTINCT FROM '0' OR NEW.tariff->>'outputCreditsPerMillionTokens' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Duration action admission requires its typed source and exact tariff' USING ERRCODE='23514'; END IF;
        duration_max:=ceil(duration_job.source_duration_ms::numeric*duration_config.credits_per_minute::numeric*1000/60000)::bigint;
        IF (NEW.funding='customer' AND (NEW.held_milli<>duration_max OR NEW.budget_milli<>duration_max OR duration_job.maximum_credits_milli<>duration_max)) OR (NEW.funding<>'customer' AND (NEW.budget_milli<>0 OR duration_job.maximum_credits_milli<>0)) THEN RAISE EXCEPTION 'Duration action hold must equal the confirmed source tariff' USING ERRCODE='23514'; END IF;
    ELSIF NEW.tariff ? 'audioCreditsPerMinute' THEN RAISE EXCEPTION 'Audio tariffs cannot enter token actions' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION languon_cancel_owner_transcriptions(owner_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT * FROM public.knowledge_transcription_jobs WHERE owner_id=owner_value AND state IN ('queued','running') ORDER BY id FOR UPDATE LOOP
  UPDATE public.knowledge_transcription_jobs SET state='failed',result=NULL,failure_code='owner_deleted',cancellation_requested_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id;
  PERFORM public.languon_settle_transcription_attempt(j.id,false);
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=j.id AND state='active') THEN PERFORM public.languon_settle_credit_action(j.id,'failure',clock_timestamp()); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION languon_cancel_owner_transcriptions(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_action_charging_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE job_owner uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ai_action_charging_policies WHERE job_id=NEW.job_id) THEN RETURN NULL; END IF;
  CASE NEW.job_kind
    WHEN 'dictionary-generation' THEN SELECT owner_id INTO job_owner FROM dictionary_generation_jobs WHERE id=NEW.job_id;
    WHEN 'knowledge-transcription' THEN SELECT owner_id INTO job_owner FROM knowledge_transcription_jobs WHERE id=NEW.job_id;
    WHEN 'speech-generation' THEN SELECT payer_id INTO job_owner FROM speech_jobs WHERE id=NEW.job_id;
    WHEN 'sentence-generation','sentence-check' THEN SELECT learner_id INTO job_owner FROM sentence_ai_jobs WHERE id=NEW.job_id AND job_kind=NEW.job_kind;
      IF job_owner IS NULL AND NEW.job_kind='sentence-generation' THEN SELECT p.learner_id INTO job_owner FROM sentence_preparation_actions m JOIN sentence_preparations p ON p.id=m.preparation_id WHERE m.action_id=NEW.job_id; END IF;
    WHEN 'text-detection','text-translation' THEN SELECT owner_id INTO job_owner FROM texts_ai_jobs WHERE id=NEW.job_id AND job_kind=NEW.job_kind;
    WHEN 'text-selection-card' THEN SELECT owner_id INTO job_owner FROM dictionary_text_selection_jobs WHERE id=NEW.job_id;
    WHEN 'portrait-interview' THEN SELECT owner_id INTO job_owner FROM learner_portrait_interview_operations WHERE id=NEW.job_id;
    WHEN 'conversation-turn' THEN SELECT owner_id INTO job_owner FROM conversation_turns WHERE id=NEW.job_id;
    ELSE RAISE EXCEPTION 'Unknown charging policy action' USING ERRCODE='23514';
  END CASE;
  IF job_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Charging policy requires its owned feature action' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
