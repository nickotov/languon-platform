-- Deferred output attestation survives terminal parent-body redaction.
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
 IF j.knowledge_source IS NULL THEN
  SELECT binding INTO j.knowledge_source FROM public.knowledge_sentence_job_sources WHERE job_id=j.id AND actor_id=j.learner_id AND note_id=j.source_note_id;
 END IF;
 IF j.execution_state<>'completed' OR j.learner_id IS DISTINCT FROM actor_value OR j.source_note_id IS DISTINCT FROM note_value OR j.knowledge_source->>'blockId' IS DISTINCT FROM block_value::text OR (TG_TABLE_NAME='knowledge_sentence_attempts' AND j.result_knowledge_attempt_id IS DISTINCT FROM result_value) OR (TG_TABLE_NAME<>'knowledge_sentence_attempts' AND j.result_knowledge_exercise_id IS DISTINCT FROM result_value) OR NOT EXISTS(SELECT 1 FROM public.ai_credit_actions a WHERE a.id=j.id AND a.owner_id=j.learner_id AND a.state='settled' AND a.outcome='success') THEN RAISE EXCEPTION 'Private sentence history requires atomic terminal publication and successful financial settlement' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_check_private_sentence_publication() FROM PUBLIC;
