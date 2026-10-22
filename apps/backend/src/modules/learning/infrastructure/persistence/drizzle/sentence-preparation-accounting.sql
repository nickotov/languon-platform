-- API creates an immutable parent authorization. A restricted worker may only
-- construct a child from that persisted parent and its captured batch fence.
CREATE OR REPLACE FUNCTION languon_admit_sentence_preparation_child(
    preparation_value uuid, batch_value uuid, fence_value bigint, at_value timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    preparation sentence_preparations%ROWTYPE;
    source_dictionary dictionaries%ROWTYPE;
    batch sentence_preparation_batches%ROWTYPE;
    mapping sentence_preparation_actions%ROWTYPE;
    action_row ai_credit_actions%ROWTYPE;
    snapshot jsonb; budget jsonb; pricing jsonb; candidates jsonb; payload jsonb;
    job_value uuid := gen_random_uuid(); version_value integer; input_limit integer;
    used_output bigint; used_input bigint; used_cost bigint; call_count integer; spent numeric;
    required_input numeric; required_output numeric; owner_queue bigint; global_queue bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(4312189072);
    SELECT * INTO preparation FROM sentence_preparations WHERE id=preparation_value;
    IF preparation.id IS NULL THEN RAISE EXCEPTION 'Preparation is unavailable' USING ERRCODE='55000'; END IF;
    -- Match API/claim actor -> source -> coordinator lock order even for direct role calls.
    PERFORM u.id FROM users u WHERE u.id IN (preparation.learner_id,
        (SELECT owner_id FROM dictionaries WHERE id=preparation.dictionary_id)) ORDER BY u.id FOR UPDATE;
    SELECT * INTO source_dictionary FROM dictionaries WHERE id=preparation.dictionary_id FOR SHARE;
    IF source_dictionary.id IS NULL OR source_dictionary.lifecycle<>'active'
        OR NOT EXISTS(SELECT 1 FROM users WHERE id=preparation.learner_id AND status='active')
        OR NOT EXISTS(SELECT 1 FROM users WHERE id=source_dictionary.owner_id AND status='active')
        OR NOT coalesce((preparation.authority->>'kind'='owner' AND source_dictionary.owner_id=preparation.learner_id)
            OR (preparation.authority->>'kind'='shared' AND source_dictionary.visibility='unlisted'
                AND source_dictionary.share_locator=preparation.authority->>'shareId'
                AND source_dictionary.share_key_digest=preparation.authority->>'keyDigest'),false)
        THEN RAISE EXCEPTION 'Preparation access is no longer active' USING ERRCODE='55000'; END IF;
    SELECT * INTO preparation FROM sentence_preparations WHERE id=preparation_value FOR UPDATE;
    IF preparation.id IS NULL OR preparation.coordinator_fence IS DISTINCT FROM fence_value
        OR preparation.state NOT IN ('queued','running') OR preparation.mode='review-only'
        OR preparation.active_job_id IS NOT NULL OR preparation.current_action_id IS NULL THEN
        RAISE EXCEPTION 'Preparation coordinator fence is no longer active' USING ERRCODE='55000';
    END IF;
    SELECT * INTO batch FROM sentence_preparation_batches
        WHERE id=batch_value AND preparation_id=preparation.id FOR UPDATE;
    SELECT * INTO mapping FROM sentence_preparation_actions
        WHERE action_id=preparation.current_action_id AND preparation_id=preparation.id;
    SELECT * INTO action_row FROM ai_credit_actions WHERE id=mapping.action_id FOR UPDATE;
    IF batch.id IS NULL OR mapping.action_id IS NULL OR mapping.terminal_outcome IS NOT NULL
        OR action_row.owner_id IS DISTINCT FROM preparation.learner_id OR action_row.state<>'active'
        OR action_row.deadline_at<=greatest(at_value,clock_timestamp()) THEN RETURN NULL; END IF;
    SELECT coalesce(jsonb_agg(entry.value ORDER BY entry.ordinality),'[]'::jsonb) INTO candidates
    FROM (SELECT e.value,e.ordinality FROM jsonb_array_elements(batch.entries) WITH ORDINALITY e(value,ordinality)
        WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(batch.manifest) m
            WHERE (m->'entryIds') ? (e.value->>'entryId')) ORDER BY e.ordinality LIMIT 12) entry;
    IF jsonb_array_length(candidates)=0 THEN RETURN NULL; END IF;
    snapshot := mapping.selected_execution_snapshot || jsonb_build_object('actionParentId',action_row.id);
    budget := snapshot->'aggregateBudget'; pricing := snapshot->'creditPricing';
    IF snapshot->>'preparationFormat' NOT IN ('sentence-preparation:v1','sentence-preparation:v2')
        OR snapshot->>'preparationFormat' IS NULL THEN
        RAISE EXCEPTION 'Pinned preparation format is unavailable' USING ERRCODE='23514'; END IF;
    version_value := CASE WHEN snapshot->>'preparationFormat'='sentence-preparation:v2' THEN 2 ELSE 1 END;
    payload := jsonb_build_object('schemaVersion',1,'generationPolicyVersion',version_value,
        'dictionaryId',preparation.dictionary_id,'direction',preparation.direction,
        'sourceLanguage',preparation.source_language,'targetLanguage',preparation.target_language,
        'priorityEntryId',candidates->0->>'entryId','candidates',candidates);
    input_limit := least((budget->>'maxInputTokensPerAttempt')::integer,octet_length(payload::text)+8192);
    SELECT count(*),coalesce(sum(coalesce(output_tokens,output_limit)),0),
        coalesce(sum(coalesce(t.input_tokens,t.input_limit)),0),
        coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),
        coalesce(sum(CASE WHEN state='dispatched' OR (successful=1 AND EXISTS(SELECT 1 FROM sentence_ai_jobs eligible WHERE eligible.id=t.execution_job_id AND eligible.execution_state='completed' AND eligible.result_exercise_id IS NOT NULL)) THEN
            (coalesce(t.input_tokens,t.input_limit)-coalesce(cache_read_tokens,0)) * (action_row.tariff->>'inputCreditsPerMillionTokens')::numeric
            +coalesce(cache_read_tokens,0)*coalesce((action_row.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(action_row.tariff->>'inputCreditsPerMillionTokens')::numeric)
            +coalesce(output_tokens,output_limit)*(action_row.tariff->>'outputCreditsPerMillionTokens')::numeric ELSE 0 END),0)
    INTO call_count,used_output,used_input,used_cost,spent FROM ai_credit_action_attempts t WHERE t.action_id=action_row.id;
    required_input := greatest((action_row.tariff->>'inputCreditsPerMillionTokens')::numeric,
        coalesce((action_row.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,0))*input_limit;
    required_output := (action_row.tariff->>'outputCreditsPerMillionTokens')::numeric;
    IF call_count>=5 OR used_output>=action_row.output_limit
        OR used_input+input_limit>(budget->>'maxInputTokensPerAttempt')::bigint
        OR used_cost+ceil((input_limit*(budget->>'inputCostMicrosPerMillionTokens')::numeric
            +(budget->>'outputCostMicrosPerMillionTokens')::numeric)/1000000)>(budget->>'maxCostMicrosPerAttempt')::bigint
        OR (action_row.funding='customer' AND spent+required_input+required_output>action_row.held_milli*1000::numeric)
        OR EXISTS(SELECT 1 FROM ai_credit_action_attempts WHERE action_id=action_row.id AND state='dispatched')
        THEN RETURN NULL; END IF;
    SELECT coalesce(queued+running,0) INTO global_queue FROM text_ai_capacity_queue_totals WHERE scope='global';
    SELECT coalesce(queued+running,0) INTO owner_queue FROM text_ai_capacity_queue_totals WHERE scope=preparation.learner_id::text;
    IF coalesce(global_queue,0)>=coalesce((snapshot->'preparationQueueLimits'->>'global')::integer,1000)
        OR coalesce(owner_queue,0)>=coalesce((snapshot->'preparationQueueLimits'->>'learner')::integer,5) THEN
        RAISE EXCEPTION 'Preparation queue capacity unavailable' USING ERRCODE='54000'; END IF;
    PERFORM set_config('languon.model_pricing_revision','1',true);
    PERFORM set_config('languon.learning_execution_revision','1',true);
    PERFORM set_config('languon.text_ai_selection_revision','1',true);
    PERFORM set_config('languon.ai_credit_settlement_revision','1',true);
    PERFORM set_config('languon.text_ai_capacity_revision','1',true);
    INSERT INTO sentence_ai_jobs(id,learner_id,dictionary_id,job_kind,format,direction,authority,operation_id,session_id,
        request_fingerprint,input_payload,selected_execution_snapshot,selected_execution_version,execution_revision_id,
        max_attempts,created_at,updated_at,next_attempt_at,
        provider_input_cost_micros_per_million_tokens,provider_output_cost_micros_per_million_tokens,
        provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt,
        provider_reservation_state,provider_reserved_attempts,provider_reserved_cost_micros,provider_reserved_input_tokens,provider_reserved_output_tokens,
        ai_credit_accounted,ai_credit_input_credits_per_million_tokens,ai_credit_output_credits_per_million_tokens,
        ai_credit_max_credits_per_attempt,ai_credit_pricing_revision)
    VALUES(job_value,preparation.learner_id,preparation.dictionary_id,'sentence-generation','sentence-preparation:v'||version_value,
        preparation.direction,preparation.authority,job_value,preparation.id,
        md5(preparation.id::text||batch.id::text||fence_value::text),payload,snapshot,1,mapping.execution_revision_id,
        CASE WHEN EXISTS(SELECT 1 FROM ai_credit_action_attempts prior JOIN sentence_ai_jobs old ON old.id=prior.execution_job_id WHERE prior.action_id=action_row.id AND old.attempt_count>1) THEN 1 ELSE 2 END,at_value,at_value,at_value,
        (budget->>'inputCostMicrosPerMillionTokens')::integer,(budget->>'outputCostMicrosPerMillionTokens')::integer,
        (budget->>'maxCostMicrosPerAttempt')::integer,(budget->>'maxInputTokensPerAttempt')::integer,(budget->>'maxOutputTokensPerAttempt')::integer,
        'active',1,(budget->>'maxCostMicrosPerAttempt')::integer,(budget->>'maxInputTokensPerAttempt')::integer,(budget->>'maxOutputTokensPerAttempt')::integer,
        false,(pricing->>'inputCreditsPerMillionTokens')::numeric,(pricing->>'outputCreditsPerMillionTokens')::numeric,
        (pricing->>'maxCreditsPerAttempt')::bigint,(pricing->>'revision')::integer);
    INSERT INTO sentence_job_entries(job_id,dictionary_id,entry_id,learning_version)
        SELECT job_value,preparation.dictionary_id,(e->>'entryId')::uuid,(e->>'learningVersion')::integer
        FROM jsonb_array_elements(candidates) e;
    INSERT INTO sentence_preparation_children(job_id,preparation_id,batch_id) VALUES(job_value,preparation.id,batch.id);
    UPDATE sentence_preparations SET active_job_id=job_value,state='running',pause_reason=NULL,
        coordinator_fence=coordinator_fence+1,updated_at=at_value WHERE id=preparation.id;
    RETURN job_value;
END; $$;
REVOKE ALL ON FUNCTION languon_admit_sentence_preparation_child(uuid,uuid,bigint,timestamptz) FROM PUBLIC;
