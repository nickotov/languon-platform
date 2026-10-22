-- Forward overrides after initial0089; preserve installed triggers and counters.
CREATE OR REPLACE FUNCTION languon_text_ai_usage_delta(usage_row text_ai_capacity_provider_usage, direction_value integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE scope_value text;
BEGIN
    -- Zero-valued source records still identify active overlap, but never own a
    -- counter contribution. Multiple zero records must not depend on an empty
    -- aggregate row remaining present after another record is removed.
    IF usage_row.cost=0 AND usage_row.input_tokens=0 AND usage_row.output_tokens=0 THEN RETURN; END IF;
    FOREACH scope_value IN ARRAY ARRAY['global', usage_row.owner_id::text] LOOP
        IF direction_value < 0 THEN
            IF usage_row.state='active' THEN
                UPDATE text_ai_capacity_active_totals SET cost=cost-usage_row.cost,
                    input_tokens=input_tokens-usage_row.input_tokens, output_tokens=output_tokens-usage_row.output_tokens
                WHERE scope=scope_value AND cohort=usage_row.cohort;
            ELSE
                UPDATE text_ai_capacity_settled_buckets SET cost=cost-usage_row.cost,
                    input_tokens=input_tokens-usage_row.input_tokens, output_tokens=output_tokens-usage_row.output_tokens
                WHERE scope=scope_value AND cohort=usage_row.cohort AND minute=date_trunc('minute',usage_row.settled_at);
            END IF;
            IF NOT FOUND THEN RAISE EXCEPTION 'Missing provider capacity projection' USING ERRCODE='23514'; END IF;
            DELETE FROM text_ai_capacity_active_totals WHERE scope=scope_value AND cohort=usage_row.cohort AND cost=0 AND input_tokens=0 AND output_tokens=0;
            DELETE FROM text_ai_capacity_settled_buckets WHERE scope=scope_value AND cohort=usage_row.cohort AND minute=date_trunc('minute',usage_row.settled_at) AND cost=0 AND input_tokens=0 AND output_tokens=0;
        ELSIF usage_row.state = 'active' THEN
            INSERT INTO text_ai_capacity_active_totals(scope,cohort,cost,input_tokens,output_tokens)
            VALUES(scope_value,usage_row.cohort,direction_value*usage_row.cost,direction_value*usage_row.input_tokens,direction_value*usage_row.output_tokens)
            ON CONFLICT(scope,cohort) DO UPDATE SET
                cost=text_ai_capacity_active_totals.cost+excluded.cost,
                input_tokens=text_ai_capacity_active_totals.input_tokens+excluded.input_tokens,
                output_tokens=text_ai_capacity_active_totals.output_tokens+excluded.output_tokens;
        ELSE
            INSERT INTO text_ai_capacity_settled_buckets(scope,cohort,minute,cost,input_tokens,output_tokens)
            VALUES(scope_value,usage_row.cohort,date_trunc('minute',usage_row.settled_at),direction_value*usage_row.cost,direction_value*usage_row.input_tokens,direction_value*usage_row.output_tokens)
            ON CONFLICT(scope,cohort,minute) DO UPDATE SET
                cost=text_ai_capacity_settled_buckets.cost+excluded.cost,
                input_tokens=text_ai_capacity_settled_buckets.input_tokens+excluded.input_tokens,
                output_tokens=text_ai_capacity_settled_buckets.output_tokens+excluded.output_tokens;
        END IF;
    END LOOP;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_text_ai_project_provider(source_value text, row_value jsonb, deleting boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    old_row text_ai_capacity_provider_usage%ROWTYPE;
    new_row text_ai_capacity_provider_usage%ROWTYPE;
    archive_row jsonb;
    live_row jsonb;
    live_table text;
    budget_row jsonb;
    call_row boolean := source_value IN ('conversation_provider_calls','learner_portrait_interview_provider_calls');
    action_row boolean := source_value='ai_credit_action_attempts';
    archive_source boolean := source_value='dictionary_generation_provider_usage_archive';
    row_state text;
    action_capability text;
    ignore_source boolean := false;
BEGIN
    new_row.id := (row_value->>'id')::uuid;
    IF action_row THEN
        SELECT capability INTO action_capability FROM ai_credit_actions WHERE id=(row_value->>'action_id')::uuid;
        IF action_capability IS NULL THEN
            IF NOT deleting THEN RAISE EXCEPTION 'Action provider usage requires its parent action' USING ERRCODE='23514'; END IF;
            -- Parent deletion cascades after the parent becomes invisible. The
            -- existing numerical row retains the pinned kind; expired rows may
            -- already have been compacted and need no further delta.
            SELECT job_kind INTO new_row.job_kind FROM text_ai_capacity_provider_usage WHERE id=new_row.id;
            IF new_row.job_kind IS NULL THEN RETURN; END IF;
        ELSE
            new_row.job_kind := CASE action_capability
                WHEN 'conversation' THEN 'conversation-turn'
                WHEN 'portrait-interview' THEN 'portrait-interview'
                WHEN 'dictionary-generation' THEN 'dictionary-generation'
                WHEN 'sentence-generation' THEN 'sentence-generation'
                WHEN 'text-translation' THEN 'text-translation'
                WHEN 'speech' THEN 'speech-generation'
                ELSE NULL END;
            IF new_row.job_kind IS NULL THEN RAISE EXCEPTION 'Unknown action capacity capability' USING ERRCODE='23514'; END IF;
        END IF;
    ELSE
    new_row.job_kind := CASE source_value
        WHEN 'dictionary_generation_jobs' THEN 'dictionary-generation'
        WHEN 'conversation_provider_calls' THEN 'conversation-turn'
        WHEN 'learner_portrait_interview_provider_calls' THEN 'portrait-interview'
        WHEN 'dictionary_text_selection_jobs' THEN 'text-selection-card'
        ELSE row_value->>'job_kind' END;
    END IF;
    -- Versioned feature jobs retain provider lifecycle fields for their own
    -- state machine, while generic attempts alone own numerical capacity.
    ignore_source := coalesce(source_value IN ('dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs')
        AND row_value->'selected_execution_snapshot'->>'actionAccountingVersion'='1',false)
        OR (archive_source AND EXISTS(SELECT 1 FROM ai_credit_actions WHERE id=new_row.id));
    IF ignore_source THEN deleting := true; END IF;
    -- Only provider-bearing job tables reach this function. Guard same-id live
    -- and archival updates with one lock, retaining one numerical contribution.
    PERFORM pg_advisory_xact_lock(hashtextextended(new_row.id::text,4312189074));
    SELECT * INTO old_row FROM text_ai_capacity_provider_usage WHERE id=new_row.id AND job_kind=new_row.job_kind FOR UPDATE;
    IF NOT ignore_source THEN
    IF archive_source AND deleting THEN
        live_table := CASE new_row.job_kind
            WHEN 'dictionary-generation' THEN 'dictionary_generation_jobs'
            WHEN 'sentence-generation' THEN 'sentence_ai_jobs'
            WHEN 'sentence-check' THEN 'sentence_ai_jobs'
            WHEN 'text-detection' THEN 'texts_ai_jobs'
            WHEN 'text-translation' THEN 'texts_ai_jobs'
            WHEN 'text-selection-card' THEN 'dictionary_text_selection_jobs'
            WHEN 'conversation-turn' THEN 'conversation_provider_calls'
            WHEN 'portrait-interview' THEN 'learner_portrait_interview_provider_calls' END;
        IF live_table IS NOT NULL THEN
            EXECUTE format('select to_jsonb(t) from %I t where id=$1',live_table) INTO live_row USING new_row.id;
        END IF;
        IF live_row IS NOT NULL THEN
            PERFORM languon_text_ai_project_provider(live_table,live_row,false);
            RETURN;
        END IF;
    ELSIF NOT archive_source THEN
        SELECT to_jsonb(a) INTO archive_row FROM dictionary_generation_provider_usage_archive a
        WHERE a.id=new_row.id AND a.job_kind=new_row.job_kind;
        IF archive_row IS NOT NULL AND (deleting OR coalesce(row_value->>'provider_reservation_state',row_value->>'state')='settled') THEN
            PERFORM languon_text_ai_project_provider('dictionary_generation_provider_usage_archive',archive_row,false);
            RETURN;
        END IF;
    END IF;
    END IF;
    IF NOT deleting THEN
        IF action_row THEN
            SELECT owner_id INTO new_row.owner_id FROM ai_credit_actions WHERE id=(row_value->>'action_id')::uuid;
            budget_row := row_value->'budget';
            new_row.cohort := concat_ws(':',budget_row->>'inputCostMicrosPerMillionTokens',budget_row->>'outputCostMicrosPerMillionTokens',budget_row->>'maxCostMicrosPerAttempt',budget_row->>'maxInputTokensPerAttempt',budget_row->>'maxOutputTokensPerAttempt');
            row_state := CASE WHEN row_value->>'settled_at' IS NULL THEN 'active' ELSE 'settled' END;
            new_row.cost := CASE WHEN row_state='active' THEN (row_value->>'reserved_cost_micros')::bigint ELSE coalesce((row_value->>'actual_cost_micros')::bigint,(row_value->>'reserved_cost_micros')::bigint) END;
            new_row.input_tokens := CASE WHEN row_state='active' THEN (row_value->>'input_limit')::bigint ELSE coalesce((row_value->>'input_tokens')::bigint,(row_value->>'input_limit')::bigint) END;
            new_row.output_tokens := CASE WHEN row_state='active' THEN (row_value->>'output_limit')::bigint ELSE coalesce((row_value->>'output_tokens')::bigint,(row_value->>'output_limit')::bigint) END;
            new_row.settled_at := (row_value->>'settled_at')::timestamptz;
        ELSE
            new_row.owner_id := coalesce(row_value->>'owner_id',row_value->>'learner_id')::uuid;
            row_state := CASE WHEN archive_source THEN 'settled'
                WHEN call_row THEN CASE WHEN row_value->>'state'='settled' THEN 'settled' ELSE 'active' END
                ELSE row_value->>'provider_reservation_state' END;
            IF call_row OR archive_source THEN
                new_row.cohort := concat_ws(':',row_value->>'input_cost_micros_per_million_tokens',row_value->>'output_cost_micros_per_million_tokens',row_value->>'max_cost_micros_per_attempt',row_value->>'max_input_tokens_per_attempt',row_value->>'max_output_tokens_per_attempt');
                new_row.cost := coalesce((row_value->>CASE WHEN row_state='active' THEN 'reserved_cost_micros' ELSE 'actual_cost_micros' END)::bigint,0);
                new_row.input_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'reserved_input_tokens' ELSE 'actual_input_tokens' END)::bigint,0);
                new_row.output_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'reserved_output_tokens' ELSE 'actual_output_tokens' END)::bigint,0);
                new_row.settled_at := (row_value->>'settled_at')::timestamptz;
            ELSE
                new_row.cohort := concat_ws(':',row_value->>'provider_input_cost_micros_per_million_tokens',row_value->>'provider_output_cost_micros_per_million_tokens',row_value->>'provider_max_cost_micros_per_attempt',row_value->>'provider_max_input_tokens_per_attempt',row_value->>'provider_max_output_tokens_per_attempt');
                new_row.cost := coalesce((row_value->>CASE WHEN row_state='active' THEN 'provider_reserved_cost_micros' ELSE 'provider_actual_cost_micros' END)::bigint,0);
                new_row.input_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'provider_reserved_input_tokens' ELSE 'provider_actual_input_tokens' END)::bigint,0);
                new_row.output_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'provider_reserved_output_tokens' ELSE 'provider_actual_output_tokens' END)::bigint,0);
                new_row.settled_at := (row_value->>'provider_reservation_settled_at')::timestamptz;
            END IF;
        END IF;
        new_row.state := row_state;
        new_row.archived := archive_source;
        IF row_state NOT IN ('active','settled') OR row_state IS NULL THEN deleting := true; END IF;
        IF row_state='settled' AND new_row.settled_at IS NULL THEN
            RAISE EXCEPTION 'Settled provider usage requires settlement timestamp' USING ERRCODE='23514';
        END IF;
    END IF;
    IF NOT deleting AND old_row IS NOT DISTINCT FROM new_row THEN RETURN; END IF;
    IF old_row.id IS NOT NULL THEN
        PERFORM languon_text_ai_usage_delta(old_row,-1);
        DELETE FROM text_ai_capacity_provider_usage WHERE id=old_row.id AND job_kind=old_row.job_kind;
    END IF;
    IF NOT deleting THEN
        INSERT INTO text_ai_capacity_provider_usage SELECT (new_row).*;
        PERFORM languon_text_ai_usage_delta(new_row,1);
    END IF;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_text_ai_project_provider_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP='UPDATE' AND ((to_jsonb(OLD)->>'id') IS DISTINCT FROM (to_jsonb(NEW)->>'id')
        OR (to_jsonb(OLD)->>'job_kind') IS DISTINCT FROM (to_jsonb(NEW)->>'job_kind')) THEN
        PERFORM languon_text_ai_project_provider(TG_TABLE_NAME,to_jsonb(OLD),true);
    END IF;
    PERFORM languon_text_ai_project_provider(TG_TABLE_NAME, CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END, TG_OP='DELETE');
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

--> statement-breakpoint
-- Old bootstrap may have materialized empty totals for all-zero source rows.
-- They no longer represent any contribution after the delta short-circuit.
DO $$
DECLARE
    previous_marker text := current_setting('languon.text_ai_capacity_maintenance',true);
    candidate record;
    old_usage text_ai_capacity_provider_usage%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(4312189072);
    PERFORM set_config('languon.text_ai_capacity_maintenance','1',true);
    -- Drop historical job-level summaries for whole-action jobs. Their generic
    -- attempts have distinct identities and remain the sole capacity authority,
    -- including after the private job has been archived or erased.
    FOR candidate IN SELECT u.id,u.job_kind FROM text_ai_capacity_provider_usage u
        JOIN ai_credit_actions a ON a.id=u.id LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(candidate.id::text,4312189074));
        SELECT * INTO old_usage FROM text_ai_capacity_provider_usage
            WHERE id=candidate.id AND job_kind=candidate.job_kind FOR UPDATE;
        IF old_usage.id IS NOT NULL THEN
            PERFORM languon_text_ai_usage_delta(old_usage,-1);
            DELETE FROM text_ai_capacity_provider_usage WHERE id=candidate.id AND job_kind=candidate.job_kind;
        END IF;
    END LOOP;
    -- Repair already-projected portrait action attempts from the old bootstrap;
    -- move their contribution instead of retaining a second conversation row.
    FOR candidate IN SELECT t.id, to_jsonb(t) AS payload FROM ai_credit_action_attempts t
        JOIN ai_credit_actions a ON a.id=t.action_id
        JOIN text_ai_capacity_provider_usage u ON u.id=t.id AND u.job_kind='conversation-turn'
        WHERE a.capability='portrait-interview' LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(candidate.id::text,4312189074));
        SELECT * INTO old_usage FROM text_ai_capacity_provider_usage
            WHERE id=candidate.id AND job_kind='conversation-turn' FOR UPDATE;
        IF old_usage.id IS NOT NULL THEN
            PERFORM languon_text_ai_usage_delta(old_usage,-1);
            DELETE FROM text_ai_capacity_provider_usage WHERE id=candidate.id AND job_kind='conversation-turn';
        END IF;
        PERFORM languon_text_ai_project_provider('ai_credit_action_attempts',candidate.payload,false);
    END LOOP;
    DELETE FROM text_ai_capacity_active_totals WHERE cost=0 AND input_tokens=0 AND output_tokens=0;
    DELETE FROM text_ai_capacity_settled_buckets WHERE cost=0 AND input_tokens=0 AND output_tokens=0;
    PERFORM set_config('languon.text_ai_capacity_maintenance',coalesce(previous_marker,''),true);
END; $$;
