-- Apply after generated capacity-schema DDL. The migration backfill executes
-- through the same transactional delta functions as runtime writes.
CREATE FUNCTION languon_text_ai_queue_delta(scope_value text, queued_delta bigint, running_delta bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF queued_delta < 0 OR running_delta < 0 THEN
        UPDATE text_ai_capacity_queue_totals SET queued=queued+queued_delta, running=running+running_delta
        WHERE scope=scope_value;
        IF NOT FOUND THEN RAISE EXCEPTION 'Missing queue capacity projection' USING ERRCODE='23514'; END IF;
        DELETE FROM text_ai_capacity_queue_totals WHERE scope=scope_value AND queued=0 AND running=0;
    ELSE
        INSERT INTO text_ai_capacity_queue_totals(scope,queued,running) VALUES(scope_value,queued_delta,running_delta)
        ON CONFLICT(scope) DO UPDATE SET queued=text_ai_capacity_queue_totals.queued+excluded.queued,
            running=text_ai_capacity_queue_totals.running+excluded.running;
    END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_project_job(source_value text, row_value jsonb, deleting boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    old_row text_ai_capacity_jobs%ROWTYPE;
    row_id uuid := (row_value->>'id')::uuid;
    row_state text := coalesce(row_value->>'execution_state', row_value->>'status', row_value->>'state');
    row_owner uuid := coalesce(row_value->>'owner_id', row_value->>'learner_id')::uuid;
    row_kind text;
    row_created timestamptz := (row_value->>'created_at')::timestamptz;
    row_next timestamptz := coalesce(row_value->>'next_attempt_at', row_value->>'created_at')::timestamptz;
    row_runnable boolean;
BEGIN
    row_kind := CASE source_value
        WHEN 'dictionary_generation_jobs' THEN 'dictionary-generation'
        WHEN 'conversation_turns' THEN 'conversation-turn'
        WHEN 'learner_portrait_interview_operations' THEN 'portrait-interview'
        WHEN 'dictionary_text_selection_jobs' THEN 'text-selection-card'
        ELSE row_value->>'job_kind' END;
    row_runnable := CASE WHEN source_value = 'dictionary_generation_jobs'
        THEN row_value->'input_payload'->>'awaitingUpload' IS DISTINCT FROM 'true'
        ELSE coalesce((row_value->>'cancel_requested')::boolean, false) = false END;
    SELECT * INTO old_row FROM text_ai_capacity_jobs WHERE source = source_value AND id = row_id FOR UPDATE;
    IF NOT deleting AND row_state IN ('queued','running') AND old_row.id IS NOT NULL
        AND old_row.owner_id = row_owner AND old_row.job_kind = row_kind
        AND old_row.state = row_state AND old_row.created_at = row_created
        AND old_row.next_attempt_at = row_next AND old_row.runnable = row_runnable THEN RETURN; END IF;
    IF old_row.id IS NOT NULL THEN
        PERFORM languon_text_ai_queue_delta('global', -(old_row.state='queued')::integer, -(old_row.state='running')::integer);
        PERFORM languon_text_ai_queue_delta(old_row.owner_id::text, -(old_row.state='queued')::integer, -(old_row.state='running')::integer);
        DELETE FROM text_ai_capacity_jobs WHERE source = source_value AND id = row_id;
    END IF;
    IF NOT deleting AND row_state IN ('queued','running') THEN
        INSERT INTO text_ai_capacity_jobs(source,id,owner_id,job_kind,state,created_at,next_attempt_at,runnable)
        VALUES(source_value,row_id,row_owner,row_kind,row_state,row_created,row_next,row_runnable);
        PERFORM languon_text_ai_queue_delta('global', (row_state='queued')::integer, (row_state='running')::integer);
        PERFORM languon_text_ai_queue_delta(row_owner::text, (row_state='queued')::integer, (row_state='running')::integer);
    END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_project_job_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM languon_text_ai_project_job(TG_TABLE_NAME, CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END, TG_OP='DELETE');
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_usage_delta(usage_row text_ai_capacity_provider_usage, direction_value integer)
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
CREATE FUNCTION languon_text_ai_project_provider(source_value text, row_value jsonb, deleting boolean)
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
CREATE FUNCTION languon_text_ai_project_provider_trigger() RETURNS trigger
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
DO $$
DECLARE table_value text; row_value jsonb;
BEGIN
    FOREACH table_value IN ARRAY ARRAY['dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs','conversation_turns','learner_portrait_interview_operations'] LOOP
        EXECUTE format('LOCK TABLE %I IN SHARE ROW EXCLUSIVE MODE',table_value);
        FOR row_value IN EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE %I IN (''queued'',''running'')',table_value,CASE WHEN table_value='conversation_turns' THEN 'status' WHEN table_value='learner_portrait_interview_operations' THEN 'state' ELSE 'execution_state' END) LOOP
            PERFORM languon_text_ai_project_job(table_value,row_value,false);
        END LOOP;
        EXECUTE format('CREATE TRIGGER text_ai_capacity_job_projection AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION languon_text_ai_project_job_trigger()',table_value);
    END LOOP;
    FOREACH table_value IN ARRAY ARRAY['dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs','conversation_provider_calls','learner_portrait_interview_provider_calls','ai_credit_action_attempts','dictionary_generation_provider_usage_archive'] LOOP
        EXECUTE format('LOCK TABLE %I IN SHARE ROW EXCLUSIVE MODE',table_value);
        FOR row_value IN EXECUTE format('SELECT to_jsonb(t) FROM %I t',table_value) LOOP
            PERFORM languon_text_ai_project_provider(table_value,row_value,false);
        END LOOP;
        EXECUTE format('CREATE TRIGGER text_ai_capacity_provider_projection AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION languon_text_ai_project_provider_trigger()',table_value);
    END LOOP;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION languon_text_ai_has_capacity_overlap(kinds text[], at_value timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT EXISTS(SELECT 1 FROM text_ai_capacity_jobs WHERE job_kind=ANY(kinds))
        OR EXISTS(SELECT 1 FROM text_ai_capacity_provider_usage WHERE job_kind=ANY(kinds)
            AND (state='active' OR (state='settled' AND settled_at>at_value-interval '24 hours'
                AND (cost>0 OR input_tokens>0 OR output_tokens>0))));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_shared_text_ai_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  increases boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    increases := NEW.execution_state IN ('queued','running') OR NEW.provider_reservation_state = 'active';
  ELSE
    increases :=
      (NEW.execution_state IN ('queued','running') AND OLD.execution_state NOT IN ('queued','running'))
      OR (NEW.execution_state = 'running' AND
          (OLD.execution_state <> 'running' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id OR NEW.fencing_token > OLD.fencing_token))
      OR (NEW.provider_reservation_state = 'active' AND
          (OLD.provider_reservation_state <> 'active'
           OR NEW.provider_reserved_cost_micros > OLD.provider_reserved_cost_micros
           OR NEW.provider_reserved_input_tokens > OLD.provider_reserved_input_tokens
           OR NEW.provider_reserved_output_tokens > OLD.provider_reserved_output_tokens
           OR coalesce((to_jsonb(NEW)->>'provider_reserved_attempts')::integer,0) > coalesce((to_jsonb(OLD)->>'provider_reserved_attempts')::integer,0)));
  END IF;
  IF NOT increases THEN RETURN NEW; END IF;
  -- Acquiring before reading overlap serializes old admission-first and sentence-first orders.
  PERFORM pg_advisory_xact_lock(4312189072);
  IF current_setting('languon.text_ai_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['sentence-generation','sentence-check'],now()) THEN
    RAISE EXCEPTION 'Shared text AI-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  IF current_setting('languon.texts_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['text-detection','text-translation','text-selection-card'],now()) THEN
    RAISE EXCEPTION 'Texts-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  IF current_setting('languon.conversation_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['conversation-turn'],now()) THEN
    RAISE EXCEPTION 'Conversation-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['portrait-interview'],now()) THEN
    RAISE EXCEPTION 'Portrait-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_portrait_capacity_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NOT (NEW.status='running' AND (OLD.status<>'running' OR NEW.lease_token IS DISTINCT FROM OLD.lease_token)) THEN RETURN NEW; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(4312189072);
 IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1'
    AND languon_text_ai_has_capacity_overlap(ARRAY['portrait-interview'],now()) THEN
   RAISE EXCEPTION 'Portrait-capable capacity transaction required' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_queue_delta(text,bigint,bigint) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_project_job(text,jsonb,boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_usage_delta(text_ai_capacity_provider_usage,integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_project_provider(text,jsonb,boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_guard_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth()<2 THEN
        RAISE EXCEPTION 'Capacity projections must be maintained through source records' USING ERRCODE='55000';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
--> statement-breakpoint
DO $$
DECLARE table_value text;
BEGIN
    FOREACH table_value IN ARRAY ARRAY['text_ai_capacity_jobs','text_ai_capacity_queue_totals','text_ai_capacity_provider_usage','text_ai_capacity_active_totals','text_ai_capacity_settled_buckets'] LOOP
        EXECUTE format('CREATE TRIGGER text_ai_capacity_projection_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION languon_text_ai_guard_projection()',table_value);
    END LOOP;
END; $$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_cleanup_capacity(at_value timestamptz, batch_limit integer DEFAULT 1000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    candidate record;
    usage_row text_ai_capacity_provider_usage%ROWTYPE;
    removed integer := 0;
    cutoff timestamptz := least(at_value,clock_timestamp())-interval '24 hours';
    previous_marker text := current_setting('languon.text_ai_capacity_maintenance',true);
BEGIN
    IF batch_limit<1 OR batch_limit>10000 THEN RAISE EXCEPTION 'Invalid capacity cleanup batch limit'; END IF;
    PERFORM pg_advisory_xact_lock(4312189072);
    PERFORM set_config('languon.text_ai_capacity_maintenance','1',true);
    FOR candidate IN SELECT id,job_kind FROM text_ai_capacity_provider_usage
        WHERE state='settled' AND settled_at<=cutoff ORDER BY settled_at LIMIT batch_limit LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(candidate.id::text,4312189074));
        SELECT * INTO usage_row FROM text_ai_capacity_provider_usage
            WHERE id=candidate.id AND job_kind=candidate.job_kind AND state='settled' AND settled_at<=cutoff FOR UPDATE;
        IF usage_row.id IS NOT NULL THEN
            PERFORM languon_text_ai_usage_delta(usage_row,-1);
            DELETE FROM text_ai_capacity_provider_usage WHERE id=usage_row.id AND job_kind=usage_row.job_kind;
            removed := removed+1;
        END IF;
    END LOOP;
    PERFORM set_config('languon.text_ai_capacity_maintenance',coalesce(previous_marker,''),true);
    RETURN removed;
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_cleanup_capacity(timestamptz,integer) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_text_ai_guard_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth()<2 AND current_setting('languon.text_ai_capacity_maintenance',true) IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'Capacity projections must be maintained through source records' USING ERRCODE='55000';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
