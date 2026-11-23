-- API-owned admissions and imports. Workers may only request the active frozen script.
CREATE TABLE public.listening_recording_preparations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES public.conversation_generation_runs(id) ON DELETE CASCADE,
    turn_id uuid NOT NULL REFERENCES public.conversation_turns(id) ON DELETE CASCADE,
    lease_token uuid NOT NULL,
    task_id text NOT NULL,
    scope jsonb,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','failed','ready')),
    due_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    claim_id uuid,
    failures integer NOT NULL DEFAULT 0,
    binding_id uuid,
    result jsonb,
    failure_code text,
    UNIQUE (turn_id,lease_token,task_id),
    CHECK ((state='ready')=(result IS NOT NULL) AND (state='failed')=(failure_code IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX listening_preparation_due_idx ON public.listening_recording_preparations(due_at,id) WHERE state='pending';
--> statement-breakpoint
CREATE FUNCTION public.languon_request_listening_recording(
    run_value uuid, revision_value integer, task_value text, turn_value uuid, lease_value uuid)
RETURNS TABLE(state text,binding_id uuid,result jsonb,failure_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    context_value record;
    task_spec jsonb;
    attempt_source_hash text;
    script_value jsonb;
BEGIN
    SELECT r.note_id, r.owner_id, t.source_snapshot, p.plan, p.unit_attempts INTO context_value
    FROM public.conversation_generation_runs r
    JOIN public.conversation_turns t ON t.id=r.active_turn_id AND t.conversation_id=r.conversation_id AND t.owner_id=r.owner_id
    JOIN public.conversation_generation_plan_revisions p ON p.run_id=r.id AND p.revision=r.revision
    JOIN public.conversation_chats c ON c.id=r.conversation_id AND c.owner_id=r.owner_id AND c.source_kind='knowledge'
      AND c.source_id=r.note_id AND c.source->>'view' IS DISTINCT FROM 'saved' AND NOT c.source ? 'shareKind'
    JOIN public.users u ON u.id=r.owner_id AND u.status='active'
    JOIN public.knowledge_notes n ON n.id=r.note_id AND n.owner_id=r.owner_id
    JOIN public.knowledge_working_branches b ON b.note_id=n.id AND b.id::text=t.source_snapshot->'blockTarget'->>'branchId'
    WHERE t.authority->>'sourceOwnerId'=t.owner_id::text AND r.id=run_value AND r.revision=revision_value AND r.state='running'
      AND t.id=turn_value AND t.lease_token=lease_value AND t.status='running'
      AND NOT t.cancel_requested AND t.lease_until>clock_timestamp();
    IF NOT FOUND THEN RETURN; END IF;
    SELECT task INTO task_spec FROM jsonb_array_elements(context_value.plan->'tasks') task
        WHERE task->>'id'=task_value AND task->>'kind'='audio';
    IF NOT FOUND THEN RETURN; END IF;
    SELECT item->>'sourceHash' INTO attempt_source_hash
        FROM jsonb_array_elements(context_value.unit_attempts) WITH ORDINALITY AS attempts(item,ord)
        WHERE item->>'taskId'=task_value AND item->>'turnId'=turn_value::text AND item->>'outcome'='started'
        ORDER BY ord DESC LIMIT 1;
    IF attempt_source_hash IS NULL THEN RETURN; END IF;
    SELECT item->'listeningScript' INTO script_value
        FROM jsonb_array_elements(context_value.unit_attempts) WITH ORDINALITY AS attempts(item,ord)
        WHERE item->>'taskId'=task_value AND item->>'sourceHash'=attempt_source_hash AND item ? 'listeningScript'
        ORDER BY ord LIMIT 1;
    IF script_value IS NULL THEN RETURN; END IF;

    INSERT INTO public.listening_recording_preparations(run_id,turn_id,lease_token,task_id,scope)
    VALUES(run_value,turn_value,lease_value,task_value,jsonb_build_object(
        'ownerId',context_value.owner_id,'noteId',context_value.note_id,
        'branchId',context_value.source_snapshot->'blockTarget'->>'branchId',
        'runId',run_value,'revision',revision_value,'taskId',task_value,'turnId',turn_value,
        'leaseToken',lease_value,'language',task_spec->>'language','utterances',script_value->'utterances'))
    ON CONFLICT (turn_id,lease_token,task_id) DO NOTHING;

    RETURN QUERY SELECT q.state,q.binding_id,q.result,q.failure_code FROM public.listening_recording_preparations q
        WHERE q.turn_id=turn_value AND q.lease_token=lease_value AND q.task_id=task_value AND q.run_id=run_value;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.languon_request_listening_recording(uuid,integer,text,uuid,uuid) FROM PUBLIC;
