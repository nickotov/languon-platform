-- A worker receives one leased source action, never table-wide learner history.
CREATE OR REPLACE FUNCTION languon_knowledge_sentence_publication_job(job_value uuid, worker_value text, fence_value bigint, kind_value text)
RETURNS public.sentence_ai_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' OR j.job_kind IS DISTINCT FROM kind_value OR j.execution_state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline IS NULL OR j.lease_deadline<=clock_timestamp() OR j.cancellation_requested_at IS NOT NULL OR j.ai_credit_provider_dispatched_at IS NULL OR j.result_knowledge_exercise_id IS NOT NULL OR j.result_knowledge_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'Knowledge sentence publication requires its unconsumed dispatched worker fence' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts a WHERE a.action_id=j.id AND a.execution_job_id=j.id AND a.state='dispatched' AND a.purpose='answer') THEN RAISE EXCEPTION 'Knowledge sentence publication requires its financial dispatch witness' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_assert_knowledge_job_source(j.id,j.job_kind,j.learner_id);
 RETURN j;
END $$;
REVOKE ALL ON FUNCTION languon_knowledge_sentence_publication_job(uuid,text,bigint,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_publish_knowledge_sentence_generation(job_value uuid,worker_value text,fence_value bigint,content_value jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE; result_value uuid:=gen_random_uuid(); target_value jsonb; public_value jsonb; at_value timestamptz:=clock_timestamp();
BEGIN
 j:=public.languon_knowledge_sentence_publication_job(job_value,worker_value,fence_value,'sentence-generation');
 IF NOT public.languon_validate_knowledge_sentence_content(content_value,(j.input_payload->>'generationPolicyVersion')::integer) THEN RAISE EXCEPTION 'Invalid nested knowledge sentence output' USING ERRCODE='23514'; END IF;
 IF content_value IS NULL OR jsonb_typeof(content_value)<>'object' OR octet_length(content_value::text)>131072 OR jsonb_typeof(content_value->'sourceText') IS DISTINCT FROM 'string' OR char_length(content_value->>'sourceText') NOT BETWEEN 1 AND 1000 OR jsonb_typeof(content_value->'referenceTranslation') IS DISTINCT FROM 'string' OR char_length(content_value->>'referenceTranslation') NOT BETWEEN 1 AND 4000 OR jsonb_typeof(content_value->'segments') IS DISTINCT FROM 'array' OR jsonb_array_length(content_value->'segments') NOT BETWEEN 1 AND 256 OR jsonb_typeof(content_value->'hints') IS DISTINCT FROM 'array' OR jsonb_array_length(content_value->'hints') NOT BETWEEN 1 AND 43 OR jsonb_typeof(content_value->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(content_value->'targets') NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid bounded knowledge sentence output' USING ERRCODE='23514'; END IF;
 IF (SELECT count(DISTINCT t->>'entryId') FROM jsonb_array_elements(content_value->'targets') t)<>jsonb_array_length(content_value->'targets') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(content_value->'targets') t WHERE t->>'entryId'=j.input_payload->>'priorityEntryId') THEN RAISE EXCEPTION 'Knowledge sentence output requires its exact priority target' USING ERRCODE='23514'; END IF;
 FOR target_value IN SELECT value FROM jsonb_array_elements(content_value->'targets') LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.input_payload->'candidates') c WHERE c=target_value) THEN RAISE EXCEPTION 'Knowledge sentence output cannot substitute admitted vocabulary provenance' USING ERRCODE='23514'; END IF;
 END LOOP;
 public_value:=jsonb_build_object('id',result_value,'dictionaryId',NULL,'knowledgeSource',jsonb_build_object('noteId',j.source_note_id,'blockId',j.knowledge_source->'blockId'),'direction',j.direction,'sourceLanguage',j.input_payload->'sourceLanguage','targetLanguage',j.input_payload->'targetLanguage','sourceText',content_value->'sourceText','segments',content_value->'segments','hints',content_value->'hints','generationPolicyVersion',j.input_payload->'generationPolicyVersion','createdAt',to_char(at_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 INSERT INTO public.knowledge_sentence_exercises(id,actor_id,note_id,block_id,operation_id,public_content,reference_translation,provenance,created_at) VALUES(result_value,j.learner_id,j.source_note_id,(j.knowledge_source->>'blockId')::uuid,j.id,public_value,content_value->>'referenceTranslation',content_value->'targets',at_value);
 INSERT INTO public.knowledge_sentence_exposures(actor_id,note_id,block_id,exercise_id,created_at) VALUES(j.learner_id,j.source_note_id,(j.knowledge_source->>'blockId')::uuid,result_value,at_value);
 UPDATE public.sentence_ai_jobs SET result_knowledge_exercise_id=result_value WHERE id=j.id;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION languon_publish_knowledge_sentence_generation(uuid,text,bigint,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_publish_knowledge_sentence_check(job_value uuid,worker_value text,fence_value bigint,feedback_value jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE; result_value uuid:=gen_random_uuid(); at_value timestamptz:=clock_timestamp();
BEGIN
 j:=public.languon_knowledge_sentence_publication_job(job_value,worker_value,fence_value,'sentence-check');
 IF NOT public.languon_validate_knowledge_sentence_feedback(feedback_value,j.input_payload->>'answer') THEN RAISE EXCEPTION 'Invalid nested knowledge sentence feedback' USING ERRCODE='23514'; END IF;
 IF feedback_value IS NULL OR jsonb_typeof(feedback_value)<>'object' OR octet_length(feedback_value::text)>131072 OR jsonb_typeof(feedback_value->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(feedback_value->'targets')<>jsonb_array_length(j.input_payload->'targets') OR EXISTS(SELECT 1 FROM jsonb_array_elements(feedback_value->'targets') t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.input_payload->'targets') expected WHERE expected->>'entryId'=t->>'entryId')) OR (SELECT count(DISTINCT t->>'entryId') FROM jsonb_array_elements(feedback_value->'targets') t)<>jsonb_array_length(feedback_value->'targets') THEN RAISE EXCEPTION 'Knowledge sentence feedback must refer to its immutable exercise targets' USING ERRCODE='23514'; END IF;
 INSERT INTO public.knowledge_sentence_attempts(id,actor_id,note_id,block_id,exercise_id,operation_id,session_id,answer,explanation_language,revealed_hint_ids,reference_revealed,feedback,created_at) VALUES(result_value,j.learner_id,j.source_note_id,(j.knowledge_source->>'blockId')::uuid,j.source_exercise_id,j.id,j.session_id,j.input_payload->>'answer',j.input_payload->>'explanationLanguage',j.input_payload->'revealedHintIds',j.reference_revealed,feedback_value,at_value);
 UPDATE public.sentence_ai_jobs SET result_knowledge_attempt_id=result_value WHERE id=j.id;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION languon_publish_knowledge_sentence_check(uuid,text,bigint,jsonb) FROM PUBLIC;

-- A definer publication is provisional inside the existing worker transaction.
-- It cannot commit private history without completed output and settled finances.
CREATE OR REPLACE FUNCTION languon_check_private_sentence_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE operation_value uuid; result_value uuid; actor_value uuid; note_value uuid; block_value uuid; j public.sentence_ai_jobs%ROWTYPE; e public.knowledge_sentence_exercises%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='knowledge_sentence_exposures' THEN
  SELECT * INTO e FROM public.knowledge_sentence_exercises WHERE id=NEW.exercise_id;
  operation_value:=e.operation_id; result_value:=e.id; actor_value:=NEW.actor_id; note_value:=NEW.note_id; block_value:=NEW.block_id;
 ELSE operation_value:=NEW.operation_id;result_value:=NEW.id;actor_value:=NEW.actor_id;note_value:=NEW.note_id;block_value:=NEW.block_id;
 END IF;
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=operation_value AND source_kind='knowledge-vocabulary';
 IF j.id IS NULL THEN RETURN NEW; END IF;
 IF j.execution_state<>'completed' OR j.learner_id IS DISTINCT FROM actor_value OR j.source_note_id IS DISTINCT FROM note_value OR j.knowledge_source->>'blockId' IS DISTINCT FROM block_value::text OR (TG_TABLE_NAME='knowledge_sentence_attempts' AND j.result_knowledge_attempt_id IS DISTINCT FROM result_value) OR (TG_TABLE_NAME<>'knowledge_sentence_attempts' AND j.result_knowledge_exercise_id IS DISTINCT FROM result_value) OR NOT EXISTS(SELECT 1 FROM public.ai_credit_actions a WHERE a.id=j.id AND a.owner_id=j.learner_id AND a.state='settled' AND a.outcome='success') THEN RAISE EXCEPTION 'Private sentence history requires atomic terminal publication and successful financial settlement' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_check_private_sentence_publication() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_sentence_exercise_publication ON public.knowledge_sentence_exercises;
CREATE CONSTRAINT TRIGGER knowledge_sentence_exercise_publication AFTER INSERT ON public.knowledge_sentence_exercises DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_check_private_sentence_publication();
DROP TRIGGER IF EXISTS knowledge_sentence_attempt_publication ON public.knowledge_sentence_attempts;
CREATE CONSTRAINT TRIGGER knowledge_sentence_attempt_publication AFTER INSERT ON public.knowledge_sentence_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_check_private_sentence_publication();
DROP TRIGGER IF EXISTS knowledge_sentence_exposure_publication ON public.knowledge_sentence_exposures;
CREATE CONSTRAINT TRIGGER knowledge_sentence_exposure_publication AFTER INSERT ON public.knowledge_sentence_exposures DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_check_private_sentence_publication();
