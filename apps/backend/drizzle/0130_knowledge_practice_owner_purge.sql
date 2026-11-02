-- Private learning/media erasure is callable only for the existing verified due account claim.
-- It grants no general table read or mutation authority to the restricted purge worker.
CREATE OR REPLACE FUNCTION languon_purge_knowledge_owner(owner_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 PERFORM public.languon_cancel_owner_transcriptions(owner_value);
 -- Narration expense/refunds must be finalized before its private text inventory is erased.
 PERFORM public.languon_purge_private_knowledge_speech(owner_value,worker_value,fence_value);
 DELETE FROM public.knowledge_learner_attempts WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_learner_events WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_learner_completion WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_learner_completion_receipts WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_vocabulary_preferences WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_vocabulary_attempts WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_vocabulary_progress WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_sentence_exercises WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_sentence_attempts WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_sentence_reviews WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_sentence_exposures WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_workbooks WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_transcription_jobs WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_transcription_operation_receipts WHERE owner_id=owner_value;
 UPDATE public.knowledge_transcription_config_revisions SET created_by=NULL WHERE created_by=owner_value;
 DELETE FROM public.knowledge_notes WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_operation_receipts WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_media_blobs b WHERE NOT EXISTS(SELECT 1 FROM public.knowledge_media_assets a WHERE a.blob_id=b.id);
END; $$;
REVOKE ALL ON FUNCTION languon_purge_knowledge_owner(uuid,text,integer) FROM PUBLIC;
