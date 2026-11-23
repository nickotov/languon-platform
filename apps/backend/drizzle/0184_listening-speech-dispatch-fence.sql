CREATE OR REPLACE FUNCTION languon_speech_knowledge_source_state(job_value uuid,lease_value uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    j public.speech_jobs%ROWTYPE;
    binding_value uuid;
BEGIN
    IF current_setting('languon.speech_worker_version',true) IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'Speech worker capability required' USING ERRCODE='42501';
    END IF;
    SELECT * INTO j FROM public.speech_jobs WHERE id=job_value;
    IF j.id IS NULL THEN
        RETURN 'unavailable';
    END IF;
    IF j.source_binding_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=j.recording_id) THEN
        RETURN 'legacy';
    END IF;
    IF lease_value IS NOT NULL AND (j.lease_token IS DISTINCT FROM lease_value OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) THEN
        RETURN 'unavailable';
    END IF;
    SELECT id INTO binding_value FROM public.speech_bindings WHERE id=j.source_binding_id AND job_id=j.id AND actor_id=j.payer_id;
    IF binding_value IS NULL
        OR NOT public.languon_knowledge_speech_binding_available(binding_value) THEN
        RETURN 'unavailable';
    END IF;
    -- Stop and expiry revoke undelivered delegated dispatches. Existing provider
    -- acknowledgements still settle normally through the speech recovery machinery.
    IF j.state IN ('queued','submitting') AND EXISTS (
        SELECT 1 FROM public.speech_bindings b WHERE b.id=binding_value AND b.source ? 'listening'
    ) AND NOT EXISTS (
        SELECT 1 FROM public.speech_bindings b
        JOIN public.conversation_generation_runs r ON r.id=(b.source->'listening'->>'runId')::uuid
        JOIN public.conversation_turns t ON t.id=r.active_turn_id
        JOIN public.conversation_listening_allowances a ON a.root_turn_id=(r.automation->>'rootActionId')::uuid
        JOIN public.ai_credit_actions budget ON budget.id=a.root_turn_id AND budget.owner_id=b.actor_id
        WHERE b.id=binding_value AND r.state='running' AND r.owner_id=b.actor_id
          AND budget.deadline_at>clock_timestamp() AND budget.created_at+interval '15 minutes'>clock_timestamp()
          AND a.owner_id=b.actor_id AND a.conversation_id=r.conversation_id AND a.note_id=r.note_id
          AND a.branch_id=(b.source->>'branchId')::uuid
          AND a.root_turn_id=(b.source->'listening'->>'rootTurnId')::uuid
          AND r.revision=(b.source->'listening'->>'revision')::integer
          AND (r.automation->>'expiresAt')::timestamptz>clock_timestamp()
          AND t.status='running' AND NOT t.cancel_requested AND t.lease_until>clock_timestamp()
          FOR SHARE OF t,r
    ) THEN
        RETURN 'unavailable';
    END IF;
    RETURN 'available';
END $$;
REVOKE ALL ON FUNCTION languon_speech_knowledge_source_state(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
-- Return only settled customer charges. The payer binding identifies each admitted
-- job exactly once, including recordings reused by other clips in the same lesson.
CREATE OR REPLACE FUNCTION public.languon_listening_charged_milli(run_value uuid,owner_value uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
    SELECT coalesce(sum(w.charged_credits),0)::bigint
    FROM public.conversation_generation_runs r
    JOIN public.speech_bindings b ON b.actor_id=r.owner_id AND b.source->>'noteId'=r.note_id::text
        AND b.source->>'kind'='knowledge-audio-draft' AND b.source->'listening'->>'runId'=r.id::text
    JOIN public.speech_jobs j ON j.source_binding_id=b.id AND j.payer_id=r.owner_id
    JOIN public.ai_credit_reservations w ON w.id=j.reservation_id AND w.owner_id=r.owner_id
    WHERE r.id=run_value AND r.owner_id=owner_value AND w.state='settled';
$$;
REVOKE ALL ON FUNCTION public.languon_listening_charged_milli(uuid,uuid) FROM PUBLIC;
