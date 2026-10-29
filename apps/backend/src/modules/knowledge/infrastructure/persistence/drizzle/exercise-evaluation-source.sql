-- Source authority for a private saved-note answer check, including shared readers.
CREATE OR REPLACE FUNCTION languon_assert_knowledge_exercise_action_source(job_value uuid,actor_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.texts_ai_jobs%ROWTYPE; s public.knowledge_exercise_evaluation_job_sources%ROWTYPE; n public.knowledge_notes%ROWTYPE; a public.knowledge_learner_attempts%ROWTYPE; pinned jsonb; grant_value jsonb; workbook_value uuid;
BEGIN
 SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value AND owner_id=actor_value;
 SELECT * INTO s FROM public.knowledge_exercise_evaluation_job_sources WHERE job_id=job_value AND actor_id=actor_value;
 IF j.id IS NULL OR j.external_source_kind IS DISTINCT FROM 'knowledge-exercise' OR j.job_kind IS DISTINCT FROM 'text-translation' OR j.folder_id IS NOT NULL OR j.text_id IS NOT NULL OR s.job_id IS NULL THEN RAISE EXCEPTION 'Exercise evaluation requires its private source link' USING ERRCODE='23514'; END IF;
 pinned:=s.input;
 IF pinned->>'noteId' IS DISTINCT FROM s.note_id::text OR pinned->>'attemptId' IS DISTINCT FROM s.attempt_id::text OR (j.execution_state IN ('queued','running') AND j.input_payload->'knowledgeExerciseEvaluation' IS DISTINCT FROM pinned) OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor_value AND status='active') THEN RAISE EXCEPTION 'Exercise evaluation source identity is unavailable' USING ERRCODE='23514'; END IF;
 grant_value:=pinned->'grant';
 IF grant_value->>'kind'='workbook' THEN
  workbook_value:=(grant_value->>'workbookId')::uuid;
  PERFORM 1 FROM public.knowledge_workbooks WHERE id=workbook_value AND owner_id=(pinned->>'noteOwnerId')::uuid AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercise workbook source is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.knowledge_workbook_shares WHERE workbook_id=workbook_value AND locator=grant_value->>'locator' AND key_digest=grant_value->>'digest' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercise workbook grant is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.knowledge_workbook_notes WHERE workbook_id=workbook_value AND note_id=s.note_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercise workbook membership is unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO n FROM public.knowledge_notes WHERE id=s.note_id AND owner_id=(pinned->>'noteOwnerId')::uuid AND status='saved' FOR SHARE;
 IF n.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=n.owner_id AND status='active') THEN RAISE EXCEPTION 'Exercise note source is unavailable' USING ERRCODE='23514'; END IF;
 IF grant_value='null'::jsonb THEN
  IF n.owner_id<>actor_value THEN RAISE EXCEPTION 'Exercise evaluation requires its live shared access' USING ERRCODE='23514'; END IF;
 ELSIF grant_value->>'kind'='note' THEN
  PERFORM 1 FROM public.knowledge_shares WHERE note_id=n.id AND locator=grant_value->>'locator' AND key_digest=grant_value->>'digest' AND version=(grant_value->>'version')::integer FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercise note grant is unavailable' USING ERRCODE='23514'; END IF;
 ELSIF grant_value->>'kind' IS DISTINCT FROM 'workbook' THEN RAISE EXCEPTION 'Invalid exercise source grant' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM public.knowledge_learner_attempts WHERE actor_id=actor_value AND note_id=s.note_id AND id=s.attempt_id FOR SHARE;
 IF a.id IS NULL OR a.exercise_id::text IS DISTINCT FROM pinned->>'exerciseId' OR a.exercise_revision IS DISTINCT FROM pinned->>'exerciseRevision' OR a.result->'answer' IS DISTINCT FROM pinned->'answer' OR NOT EXISTS(SELECT 1 FROM public.knowledge_learning_epochs e WHERE e.note_id=n.id AND e.kind='exercise' AND e.block_id=a.exercise_id AND e.item_id=a.exercise_id AND e.active AND e.epoch=(pinned->>'learningEpoch')::integer AND e.semantic_fingerprint=pinned->>'semanticFingerprint') THEN RAISE EXCEPTION 'Exercise answer or published learning epoch changed' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION languon_assert_knowledge_exercise_action_source(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
-- Workers can publish only this job's checked answer after its own successful fenced settlement.
CREATE OR REPLACE FUNCTION languon_publish_knowledge_exercise_evaluation(job_value uuid,worker_value text,fence_value bigint,result_value jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.texts_ai_jobs%ROWTYPE; s public.knowledge_exercise_evaluation_job_sources%ROWTYPE; a public.knowledge_learner_attempts%ROWTYPE; evaluation_value jsonb; attempt_value jsonb; at_value timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.external_source_kind IS DISTINCT FROM 'knowledge-exercise' OR j.format IS DISTINCT FROM 'text-translation:v4' OR j.execution_state IS DISTINCT FROM 'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=at_value OR j.expires_at<=at_value OR j.cancellation_requested_at IS NOT NULL THEN RAISE EXCEPTION 'Exercise feedback requires its live fenced job' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts provider_attempt JOIN public.ai_credit_actions action ON action.id=provider_attempt.action_id WHERE provider_attempt.execution_job_id=j.id AND provider_attempt.action_id=j.id AND provider_attempt.state='settled' AND provider_attempt.successful=1 AND action.owner_id=j.owner_id AND action.state='settled' AND action.outcome='success' AND provider_attempt.provider_dispatch_witness->>'jobId'=j.id::text AND provider_attempt.provider_dispatch_witness->>'worker'=worker_value AND provider_attempt.provider_dispatch_witness->>'fence'=fence_value::text) THEN RAISE EXCEPTION 'Exercise feedback requires its settled current provider execution' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_assert_knowledge_exercise_action_source(j.id,j.owner_id);
 SELECT * INTO s FROM public.knowledge_exercise_evaluation_job_sources WHERE job_id=j.id AND actor_id=j.owner_id FOR UPDATE;
 IF s.job_id IS NULL OR s.attempt_result IS NOT NULL OR jsonb_typeof(result_value) IS DISTINCT FROM 'object' OR NOT result_value ?& ARRAY['status','feedback','validAlternative'] OR result_value-ARRAY['status','feedback','validAlternative']<>'{}'::jsonb OR jsonb_typeof(result_value->'status') IS DISTINCT FROM 'string' OR result_value->>'status' NOT IN ('correct','incorrect') OR jsonb_typeof(result_value->'feedback') IS DISTINCT FROM 'string' OR length(btrim(result_value->>'feedback')) NOT BETWEEN 1 AND 2000 OR jsonb_typeof(result_value->'validAlternative') IS DISTINCT FROM 'boolean' OR (result_value->>'validAlternative'='true' AND result_value->>'status'<>'correct') THEN RAISE EXCEPTION 'Invalid or already published exercise feedback' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM public.knowledge_learner_attempts WHERE actor_id=j.owner_id AND note_id=s.note_id AND id=s.attempt_id FOR UPDATE;
 IF a.id IS NULL OR a.exercise_revision IS DISTINCT FROM s.input->>'exerciseRevision' OR a.result->'answer' IS DISTINCT FROM s.input->'answer' THEN RAISE EXCEPTION 'Exercise feedback cannot replace another private attempt' USING ERRCODE='23514'; END IF;
 IF j.lease_deadline<=clock_timestamp() OR j.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Exercise feedback lease expired while waiting for source locks' USING ERRCODE='23514'; END IF;
 evaluation_value:=jsonb_build_object('status',result_value->'status','method','ai','feedback',result_value->'feedback');
 IF result_value->>'status'='correct' THEN evaluation_value:=evaluation_value||jsonb_build_object('validAlternative',result_value->'validAlternative'); END IF;
 attempt_value:=jsonb_set(a.result,'{evaluation}',evaluation_value);
 UPDATE public.knowledge_learner_attempts SET result=attempt_value WHERE actor_id=j.owner_id AND id=s.attempt_id AND note_id=s.note_id;
 UPDATE public.knowledge_exercise_evaluation_job_sources SET attempt_result=attempt_value WHERE job_id=j.id;
 RETURN attempt_value;
END $$;
REVOKE ALL ON FUNCTION languon_publish_knowledge_exercise_evaluation(uuid,text,bigint,jsonb) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_guard_knowledge_exercise_evaluation_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE trusted_value boolean:=current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID));
BEGIN
 IF TG_OP='UPDATE' THEN
  IF to_jsonb(NEW)-'attempt_result' IS DISTINCT FROM to_jsonb(OLD)-'attempt_result' OR NOT trusted_value OR OLD.attempt_result IS NOT NULL OR NEW.attempt_result IS NULL THEN RAISE EXCEPTION 'Exercise source identity is immutable and publication is fenced' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.texts_ai_jobs WHERE id=OLD.job_id) OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=OLD.note_id) OR public.languon_operator_purge_authorized(OLD.actor_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Exercise evaluation source requires source or account cleanup' USING ERRCODE='23514';
 END IF;
 PERFORM public.languon_assert_knowledge_exercise_action_source(NEW.job_id,NEW.actor_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_exercise_evaluation_source() FROM PUBLIC;
CREATE TRIGGER knowledge_exercise_evaluation_source_admission AFTER INSERT ON public.knowledge_exercise_evaluation_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_exercise_evaluation_source();
CREATE TRIGGER knowledge_exercise_evaluation_source_guard BEFORE UPDATE OR DELETE ON public.knowledge_exercise_evaluation_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_exercise_evaluation_source();
