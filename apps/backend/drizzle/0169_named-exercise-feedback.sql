-- Generated from the canonical reviewed exercise-evaluation-source.sql publication function.
CREATE OR REPLACE FUNCTION languon_publish_knowledge_exercise_evaluation(job_value uuid,worker_value text,fence_value bigint,result_value jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    j public.texts_ai_jobs%ROWTYPE;
    s public.knowledge_exercise_evaluation_job_sources%ROWTYPE;
    a public.knowledge_learner_attempts%ROWTYPE;
    evaluation_value jsonb;
    attempt_value jsonb;
    criterion_value jsonb;
    correction_value jsonb;
    dimension_values text[]:=ARRAY[]::text[];
    criterion_states text[]:=ARRAY[]::text[];
    expected_dimensions text[];
    at_value timestamptz:=clock_timestamp();
BEGIN
    SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value FOR UPDATE;
    IF j.id IS NULL
        OR j.external_source_kind IS DISTINCT FROM 'knowledge-exercise'
        OR j.format IS DISTINCT FROM 'text-translation:v4'
        OR j.execution_state IS DISTINCT FROM 'running'
        OR j.worker_id IS DISTINCT FROM worker_value
        OR j.fencing_token IS DISTINCT FROM fence_value
        OR j.lease_deadline<=at_value
        OR j.expires_at<=at_value
        OR j.cancellation_requested_at IS NOT NULL THEN
        RAISE EXCEPTION 'Exercise feedback requires its live fenced job' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts provider_attempt JOIN public.ai_credit_actions action ON action.id=provider_attempt.action_id WHERE provider_attempt.execution_job_id=j.id AND provider_attempt.action_id=j.id AND provider_attempt.state='settled' AND provider_attempt.successful=1 AND action.owner_id=j.owner_id AND action.state='settled' AND action.outcome='success' AND provider_attempt.provider_dispatch_witness->>'jobId'=j.id::text AND provider_attempt.provider_dispatch_witness->>'worker'=worker_value AND provider_attempt.provider_dispatch_witness->>'fence'=fence_value::text) THEN
        RAISE EXCEPTION 'Exercise feedback requires its settled current provider execution' USING ERRCODE='23514';
    END IF;
    PERFORM public.languon_assert_knowledge_exercise_action_source(j.id,j.owner_id);
    SELECT * INTO s FROM public.knowledge_exercise_evaluation_job_sources WHERE job_id=j.id AND actor_id=j.owner_id FOR UPDATE;
    IF s.job_id IS NULL
        OR s.attempt_result IS NOT NULL
        OR jsonb_typeof(result_value) IS DISTINCT FROM 'object'
        OR NOT result_value ?& ARRAY['status','feedback','validAlternative']
        OR result_value-ARRAY['status','feedback','validAlternative','criteria','corrections','suggestedAnswer']<>'{}'::jsonb
        OR jsonb_typeof(result_value->'status') IS DISTINCT FROM 'string'
        OR result_value->>'status' NOT IN ('correct','partially-correct','incorrect','unable-to-assess')
        OR jsonb_typeof(result_value->'feedback') IS DISTINCT FROM 'string'
        OR length(btrim(result_value->>'feedback')) NOT BETWEEN 1 AND 2000
        OR NOT (result_value->>'feedback' ~ '[^[:space:]]')
        OR jsonb_typeof(result_value->'validAlternative') IS DISTINCT FROM 'boolean'
        OR (result_value->>'validAlternative'='true' AND result_value->>'status'<>'correct') THEN
        RAISE EXCEPTION 'Invalid or already published exercise feedback' USING ERRCODE='23514';
    END IF;
    IF result_value ? 'criteria' THEN
        IF jsonb_typeof(result_value->'criteria') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Exercise feedback criteria must be an array' USING ERRCODE='23514';
        END IF;
        IF jsonb_array_length(result_value->'criteria') NOT BETWEEN 2 AND 4 THEN
            RAISE EXCEPTION 'Exercise feedback criteria are not bounded' USING ERRCODE='23514';
        END IF;
        FOR criterion_value IN SELECT value FROM jsonb_array_elements(result_value->'criteria') LOOP
            IF jsonb_typeof(criterion_value) IS DISTINCT FROM 'object'
                OR NOT criterion_value ?& ARRAY['dimension','status','feedback']
                OR criterion_value-ARRAY['dimension','status','feedback']<>'{}'::jsonb
                OR jsonb_typeof(criterion_value->'dimension') IS DISTINCT FROM 'string'
                OR criterion_value->>'dimension' NOT IN ('task-completion','meaning','target-use','evidence')
                OR criterion_value->>'dimension'=ANY(dimension_values)
                OR jsonb_typeof(criterion_value->'status') IS DISTINCT FROM 'string'
                OR criterion_value->>'status' NOT IN ('met','partially-met','not-met','unable-to-assess')
                OR jsonb_typeof(criterion_value->'feedback') IS DISTINCT FROM 'string'
                OR length(criterion_value->>'feedback') NOT BETWEEN 1 AND 2000
                OR NOT (criterion_value->>'feedback' ~ '[^[:space:]]') THEN
                RAISE EXCEPTION 'Invalid exercise feedback criterion' USING ERRCODE='23514';
            END IF;
            dimension_values:=array_append(dimension_values,criterion_value->>'dimension');
            criterion_states:=array_append(criterion_states,criterion_value->>'status');
        END LOOP;
        IF NOT dimension_values @> ARRAY['task-completion','meaning']
            OR (result_value->>'status'='correct' AND EXISTS(SELECT 1 FROM unnest(criterion_states) state WHERE state<>'met'))
            OR (result_value->>'status'='incorrect' AND NOT 'not-met'=ANY(criterion_states))
            OR (result_value->>'status'='partially-correct' AND (NOT EXISTS(SELECT 1 FROM unnest(criterion_states) state WHERE state IN ('met','partially-met')) OR NOT EXISTS(SELECT 1 FROM unnest(criterion_states) state WHERE state<>'met')))
            OR (result_value->>'status'='unable-to-assess' AND NOT 'unable-to-assess'=ANY(criterion_states))
            OR (result_value->>'status'<>'unable-to-assess' AND 'unable-to-assess'=ANY(criterion_states)) THEN
            RAISE EXCEPTION 'Exercise criteria contradict their overall result' USING ERRCODE='23514';
        END IF;
    END IF;
    IF result_value ? 'corrections' THEN
        IF jsonb_typeof(result_value->'corrections') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Exercise corrections must be an array' USING ERRCODE='23514';
        END IF;
        IF jsonb_array_length(result_value->'corrections')>2 THEN
            RAISE EXCEPTION 'Exercise feedback has too many corrections' USING ERRCODE='23514';
        END IF;
        FOR correction_value IN SELECT value FROM jsonb_array_elements(result_value->'corrections') LOOP
            IF jsonb_typeof(correction_value) IS DISTINCT FROM 'string'
                OR length(correction_value#>>'{}') NOT BETWEEN 1 AND 2000
                OR NOT (correction_value#>>'{}' ~ '[^[:space:]]') THEN
                RAISE EXCEPTION 'Invalid exercise correction' USING ERRCODE='23514';
            END IF;
        END LOOP;
    END IF;
    IF result_value ? 'suggestedAnswer' AND (
        jsonb_typeof(result_value->'suggestedAnswer') IS DISTINCT FROM 'string'
        OR length(result_value->>'suggestedAnswer') NOT BETWEEN 1 AND 2000
        OR NOT (result_value->>'suggestedAnswer' ~ '[^[:space:]]')
    ) THEN
        RAISE EXCEPTION 'Invalid exercise suggested answer' USING ERRCODE='23514';
    END IF;
    IF s.input->'exercise' ? 'semantics' THEN
        expected_dimensions:=ARRAY['task-completion','meaning'];
        IF s.input#>'{exercise,semantics,checking,rubric,criteria}' IS NOT NULL THEN
            SELECT array_agg(value->>'dimension') INTO expected_dimensions
                FROM jsonb_array_elements(s.input#>'{exercise,semantics,checking,rubric,criteria}');
        ELSIF left(s.input#>>'{exercise,semantics,activity,id}',1) IN ('V','G') THEN
            expected_dimensions:=array_append(expected_dimensions,'target-use');
        ELSIF left(s.input#>>'{exercise,semantics,activity,id}',1)='R' THEN
            expected_dimensions:=array_append(expected_dimensions,'evidence');
        END IF;
        IF NOT result_value ?& ARRAY['criteria','corrections']
            OR NOT dimension_values @> expected_dimensions
            OR NOT expected_dimensions @> dimension_values
            OR (result_value->>'status' IN ('incorrect','partially-correct') AND jsonb_array_length(result_value->'corrections')=0) THEN
            RAISE EXCEPTION 'Named exercise feedback requires its exact rubric and actionable corrections' USING ERRCODE='23514';
        END IF;
    END IF;
    SELECT * INTO a FROM public.knowledge_learner_attempts WHERE actor_id=j.owner_id AND note_id=s.note_id AND id=s.attempt_id FOR UPDATE;
    IF a.id IS NULL
        OR a.exercise_revision IS DISTINCT FROM s.input->>'exerciseRevision'
        OR a.result->'answer' IS DISTINCT FROM s.input->'answer' THEN
        RAISE EXCEPTION 'Exercise feedback cannot replace another private attempt' USING ERRCODE='23514';
    END IF;
    IF j.lease_deadline<=clock_timestamp()
        OR j.expires_at<=clock_timestamp() THEN
        RAISE EXCEPTION 'Exercise feedback lease expired while waiting for source locks' USING ERRCODE='23514';
    END IF;
    evaluation_value:=jsonb_build_object('status',result_value->'status','method','ai','feedback',result_value->'feedback');
    evaluation_value:=evaluation_value||(result_value-ARRAY['status','feedback','validAlternative']);
    IF result_value->>'status'='correct' THEN
        evaluation_value:=evaluation_value||jsonb_build_object('validAlternative',result_value->'validAlternative');
    END IF;
    attempt_value:=jsonb_set(a.result,'{evaluation}',evaluation_value);
    UPDATE public.knowledge_learner_attempts SET result=attempt_value WHERE actor_id=j.owner_id AND id=s.attempt_id AND note_id=s.note_id;
    UPDATE public.knowledge_exercise_evaluation_job_sources SET attempt_result=attempt_value WHERE job_id=j.id;
    RETURN attempt_value;
END $$;
REVOKE ALL ON FUNCTION languon_publish_knowledge_exercise_evaluation(uuid,text,bigint,jsonb) FROM PUBLIC;
