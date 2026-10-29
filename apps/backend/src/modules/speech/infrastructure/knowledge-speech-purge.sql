-- Invoked only after the established speech-accounting purge under the same due lease.
CREATE OR REPLACE FUNCTION languon_purge_private_knowledge_speech(owner_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE recording_ids uuid[];
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 SELECT array_agg(k.recording_id) INTO recording_ids FROM public.knowledge_speech_recordings k JOIN public.knowledge_notes n ON n.id=k.note_id WHERE n.owner_id=owner_value;
 IF recording_ids IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.speech_jobs j WHERE j.recording_id=ANY(recording_ids) AND (j.reservation_id IS NOT NULL OR j.billing_state='reserved'))
 OR EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b JOIN public.speech_jobs j ON j.id=b.action_id WHERE j.recording_id=ANY(recording_ids) AND b.state='active') THEN
  RAISE EXCEPTION 'Private narration requires finalized speech accounting' USING ERRCODE='23514';
 END IF;
 PERFORM set_config('languon.speech_worker_version','1',true);
 UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=NULL,lease_expires_at=NULL WHERE recording_id=ANY(recording_ids) AND state NOT IN ('ready','failed');
 UPDATE public.speech_recordings SET text='',state='deleting',deleted_at=clock_timestamp(),version=version+1 WHERE id=ANY(recording_ids) AND state<>'deleted';
 DELETE FROM public.speech_quotes q WHERE q.source->>'kind'='knowledge-block' AND q.source->>'noteId' IN (SELECT n.id::text FROM public.knowledge_notes n WHERE n.owner_id=owner_value);
 DELETE FROM public.speech_bindings WHERE recording_id=ANY(recording_ids);
 DELETE FROM public.knowledge_speech_recordings WHERE recording_id=ANY(recording_ids);
END; $$;
REVOKE ALL ON FUNCTION languon_purge_private_knowledge_speech(uuid,text,integer) FROM PUBLIC;
