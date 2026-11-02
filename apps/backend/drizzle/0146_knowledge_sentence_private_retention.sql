CREATE OR REPLACE FUNCTION languon_assert_knowledge_job_source(job_value uuid, kind_value text, actor_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j jsonb; binding_value jsonb; linked_value jsonb; requested_target_value text; current_block_value jsonb; projected_source jsonb; joined_source text; candidates_value jsonb; direction_value text; exercise_value jsonb;
BEGIN
 IF kind_value IN ('text-detection','text-translation') THEN
  SELECT to_jsonb(t) INTO j FROM public.texts_ai_jobs t WHERE id=job_value;
  IF j->>'external_source_kind' IS NULL THEN
   IF j->'input_payload'->'knowledgeSource' IS NOT NULL THEN RAISE EXCEPTION 'Knowledge text source cannot lose its parent tag' USING ERRCODE='23514'; END IF;
   RETURN;
  END IF;
  SELECT binding,requested_target_language INTO linked_value,requested_target_value FROM public.knowledge_text_job_sources WHERE job_id=job_value AND actor_id=actor_value AND note_id=(binding->>'noteId')::uuid AND block_id=(binding->>'blockId')::uuid;
  binding_value:=j->'input_payload'->'knowledgeSource';
  IF j->>'external_source_kind' IS DISTINCT FROM 'knowledge-block' OR j->>'job_kind' IS DISTINCT FROM 'text-translation' OR j->>'owner_id' IS DISTINCT FROM actor_value::text OR j->>'folder_id' IS NOT NULL OR j->>'text_id' IS NOT NULL OR linked_value IS NULL OR (j->>'execution_state' NOT IN ('completed','failed','cancelled') AND binding_value IS DISTINCT FROM linked_value) OR linked_value->'sourceSnapshot'->>'type' IS DISTINCT FROM 'bilingual-text' THEN RAISE EXCEPTION 'Knowledge translation requires its immutable source link' USING ERRCODE='23514'; END IF;
  IF requested_target_value IS NULL OR (j->'input_payload' IS NOT NULL AND j->'input_payload'<>'null'::jsonb AND j->'input_payload'->>'targetLanguage' IS DISTINCT FROM requested_target_value) THEN RAISE EXCEPTION 'Knowledge translation requires its immutable requested language' USING ERRCODE='23514'; END IF;
  IF j->>'execution_state' IN ('queued','running') THEN
   SELECT node->'attrs'->'block' INTO current_block_value FROM public.knowledge_notes n CROSS JOIN LATERAL jsonb_array_elements(n.body->'document'->'content') node WHERE n.id=(linked_value->>'noteId')::uuid AND node->>'type'='learningBlock' AND node->'attrs'->'block'->>'id'=linked_value->>'blockId';
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_block_value->'translations') translated WHERE lower(translated->>'language')=lower(requested_target_value)) THEN RAISE EXCEPTION 'Knowledge translation target already has prepared material' USING ERRCODE='23514'; END IF;
  END IF;
  IF j->'input_payload' IS NOT NULL AND j->'input_payload'<>'null'::jsonb THEN
   IF j->'input_payload'->>'kind' IS DISTINCT FROM 'text-translation' OR j->'input_payload'->>'sourceLanguage' IS DISTINCT FROM linked_value->'sourceSnapshot'->>'language' OR j->'input_payload'->>'folderId' IS NOT NULL OR j->'input_payload'->>'textId' IS NOT NULL OR jsonb_typeof(j->'input_payload'->'segments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Knowledge translation payload must belong to the pinned source' USING ERRCODE='23514'; END IF;
   SELECT jsonb_agg(jsonb_build_object('id',segment->'pairId','text',CASE WHEN ordinal=1 THEN segment->>'text' ELSE substring(segment->>'text' FROM 3) END) ORDER BY ordinal),string_agg(segment->>'text','' ORDER BY ordinal) INTO projected_source,joined_source FROM jsonb_array_elements(j->'input_payload'->'segments') WITH ORDINALITY s(segment,ordinal);
   IF projected_source IS DISTINCT FROM linked_value->'sourceSnapshot'->'segments' OR joined_source IS DISTINCT FROM j->'input_payload'->>'sourceText' OR EXISTS(SELECT 1 FROM jsonb_array_elements(j->'input_payload'->'segments') WITH ORDINALITY s(segment,ordinal) WHERE ordinal>1 AND left(segment->>'text',2)<>E'\n\n') THEN RAISE EXCEPTION 'Knowledge translation payload cannot substitute source text or segment identities' USING ERRCODE='23514'; END IF;
  END IF;
  binding_value:=linked_value;
 ELSIF kind_value IN ('sentence-generation','sentence-check') THEN
  SELECT to_jsonb(t) INTO j FROM public.sentence_ai_jobs t WHERE id=job_value;
  IF coalesce(j->>'source_kind','dictionary')='dictionary' THEN
   IF j->'knowledge_source' IS NOT NULL AND j->'knowledge_source'<>'null'::jsonb THEN RAISE EXCEPTION 'Dictionary sentence action cannot carry knowledge authority' USING ERRCODE='23514'; END IF;
   RETURN;
  END IF;
  IF coalesce(j->'knowledge_source','null'::jsonb)='null'::jsonb OR coalesce(j->'input_payload','null'::jsonb)='null'::jsonb THEN
   SELECT jsonb_build_object('knowledge_source',binding,'input_payload',input_payload,'source_exercise_id',source_exercise_id) INTO linked_value FROM public.knowledge_sentence_job_sources WHERE job_id=job_value AND actor_id=actor_value AND note_id=(binding->>'noteId')::uuid AND block_id=(binding->>'blockId')::uuid;
   IF linked_value IS NULL THEN RAISE EXCEPTION 'Knowledge sentence action requires its private retained source link' USING ERRCODE='23514'; END IF;
   j:=j || linked_value;
  END IF;
  binding_value:=j->'knowledge_source';
  IF j->>'source_kind' IS DISTINCT FROM 'knowledge-vocabulary' OR j->>'learner_id' IS DISTINCT FROM actor_value::text OR j->>'dictionary_id' IS NOT NULL OR j->>'source_note_id' IS DISTINCT FROM binding_value->>'noteId' OR binding_value IS NULL OR binding_value->'sourceSnapshot'->>'type' IS DISTINCT FROM 'vocabulary' THEN RAISE EXCEPTION 'Knowledge sentence action requires its private vocabulary source' USING ERRCODE='23514'; END IF;
  IF j->'input_payload' IS NOT NULL AND j->'input_payload'<>'null'::jsonb THEN
   IF kind_value='sentence-generation' THEN
    direction_value:=j->'input_payload'->>'direction';
    candidates_value:=j->'input_payload'->'candidates';
    IF j->'input_payload'->>'dictionaryId' IS NOT NULL OR j->'input_payload'->'knowledgeSource' IS DISTINCT FROM jsonb_build_object('noteId',binding_value->'noteId','blockId',binding_value->'blockId') OR direction_value IS NULL OR direction_value NOT IN ('source-to-target','target-to-source') OR jsonb_typeof(candidates_value) IS DISTINCT FROM 'array' OR jsonb_array_length(candidates_value) NOT BETWEEN 1 AND 12 OR (SELECT count(DISTINCT c->>'entryId') FROM jsonb_array_elements(candidates_value)c)<>jsonb_array_length(candidates_value) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(candidates_value)c WHERE c->>'entryId'=j->'input_payload'->>'priorityEntryId') THEN RAISE EXCEPTION 'Knowledge sentence generation requires its exact bounded vocabulary candidates' USING ERRCODE='23514'; END IF;
   ELSE
    SELECT to_jsonb(e) INTO exercise_value FROM public.knowledge_sentence_exercises e WHERE id=(j->>'source_exercise_id')::uuid AND actor_id=actor_value AND note_id=(binding_value->>'noteId')::uuid AND block_id=(binding_value->>'blockId')::uuid FOR SHARE;
    IF exercise_value IS NULL OR j->'input_payload'->>'exerciseId' IS DISTINCT FROM exercise_value->>'id' OR j->'input_payload'->>'sourceText' IS DISTINCT FROM exercise_value->'public_content'->>'sourceText' OR j->'input_payload'->>'referenceTranslation' IS DISTINCT FROM exercise_value->>'reference_translation' OR j->'input_payload'->>'sourceLanguage' IS DISTINCT FROM exercise_value->'public_content'->>'sourceLanguage' OR j->'input_payload'->>'targetLanguage' IS DISTINCT FROM exercise_value->'public_content'->>'targetLanguage' OR j->'input_payload'->'targets' IS DISTINCT FROM exercise_value->'provenance' THEN RAISE EXCEPTION 'Knowledge sentence feedback requires its private prepared exercise' USING ERRCODE='23514'; END IF;
    direction_value:=exercise_value->'public_content'->>'direction';
    candidates_value:=j->'input_payload'->'targets';
   END IF;
   IF j->'input_payload'->>'sourceLanguage' IS DISTINCT FROM binding_value->'sourceSnapshot'->>(CASE direction_value WHEN 'source-to-target' THEN 'language' ELSE 'translationLanguage' END) OR j->'input_payload'->>'targetLanguage' IS DISTINCT FROM binding_value->'sourceSnapshot'->>(CASE direction_value WHEN 'source-to-target' THEN 'translationLanguage' ELSE 'language' END) OR EXISTS(SELECT 1 FROM jsonb_array_elements(candidates_value) c WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(binding_value->'sourceSnapshot'->'entries') entry JOIN jsonb_array_elements(binding_value->'learningVersions') version_value ON version_value->>'entryId'=entry->>'id' WHERE c->>'entryId'=entry->>'id' AND (c->>'learningVersion')::integer=(version_value->>'epoch')::integer AND c->>'sourceText'=entry->>(CASE direction_value WHEN 'source-to-target' THEN 'term' ELSE 'translation' END) AND c->>'targetText'=entry->>(CASE direction_value WHEN 'source-to-target' THEN 'translation' ELSE 'term' END)
   )) THEN RAISE EXCEPTION 'Knowledge sentence payload cannot substitute vocabulary text, language or learning epochs' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE RETURN;
 END IF;
 PERFORM public.languon_assert_knowledge_learning_binding(binding_value,actor_value);
END $$;
REVOKE ALL ON FUNCTION languon_assert_knowledge_job_source(uuid,text,uuid) FROM PUBLIC;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_guard_knowledge_learning_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE old_value jsonb; new_value jsonb:=to_jsonb(NEW); private_source_value jsonb; actor_value uuid; kind_value text; erasure_value boolean:=false;
BEGIN
 actor_value:=coalesce(new_value->>'owner_id',new_value->>'learner_id')::uuid;
 kind_value:=new_value->>'job_kind';
 IF TG_OP='UPDATE' THEN
  old_value:=to_jsonb(OLD);
  IF new_value->>'source_kind'='knowledge-vocabulary' AND (coalesce(new_value->'knowledge_source','null'::jsonb)='null'::jsonb OR coalesce(old_value->'knowledge_source','null'::jsonb)='null'::jsonb) THEN
   SELECT jsonb_build_object('knowledge_source',binding,'source_exercise_id',source_exercise_id) INTO private_source_value FROM public.knowledge_sentence_job_sources WHERE job_id=NEW.id AND actor_id=actor_value;
   IF private_source_value IS NOT NULL THEN
    IF coalesce(new_value->'knowledge_source','null'::jsonb)='null'::jsonb THEN new_value:=new_value || private_source_value; END IF;
    IF coalesce(old_value->'knowledge_source','null'::jsonb)='null'::jsonb THEN old_value:=old_value || private_source_value; END IF;
   END IF;
  END IF;
  erasure_value:=old_value->>'source_kind'='knowledge-vocabulary' AND new_value->>'execution_state' IN ('completed','failed','cancelled') AND coalesce(new_value->'knowledge_source','null'::jsonb)='null'::jsonb AND coalesce(new_value->'input_payload','null'::jsonb)='null'::jsonb AND new_value->>'result_knowledge_exercise_id' IS NULL AND new_value->>'result_knowledge_attempt_id' IS NULL AND NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=(old_value->>'source_note_id')::uuid);
  IF new_value->'external_source_kind' IS DISTINCT FROM old_value->'external_source_kind' OR new_value->'source_kind' IS DISTINCT FROM old_value->'source_kind' OR new_value->'source_note_id' IS DISTINCT FROM old_value->'source_note_id' OR ((new_value->'knowledge_source' IS DISTINCT FROM old_value->'knowledge_source' OR new_value->'source_exercise_id' IS DISTINCT FROM old_value->'source_exercise_id') AND NOT coalesce(erasure_value,false)) THEN RAISE EXCEPTION 'Knowledge learning job source identities are immutable' USING ERRCODE='23514'; END IF;
  IF new_value->'input_payload' IS NOT NULL AND new_value->'input_payload'<>'null'::jsonb AND new_value->'input_payload'->'knowledgeSource' IS DISTINCT FROM old_value->'input_payload'->'knowledgeSource' THEN RAISE EXCEPTION 'Knowledge translation source identity is immutable' USING ERRCODE='23514'; END IF;
  IF new_value->>'execution_state'='completed' AND old_value->>'execution_state' IS DISTINCT FROM 'completed' THEN
   PERFORM public.languon_assert_knowledge_job_source(NEW.id,kind_value,actor_value);
   IF new_value->>'source_kind'='knowledge-vocabulary' THEN
    IF kind_value='sentence-generation' AND NOT EXISTS(SELECT 1 FROM public.knowledge_sentence_exercises e WHERE e.id=(new_value->>'result_knowledge_exercise_id')::uuid AND e.actor_id=actor_value AND e.note_id=(new_value->>'source_note_id')::uuid AND e.block_id=(new_value->'knowledge_source'->>'blockId')::uuid AND e.operation_id=NEW.id) THEN RAISE EXCEPTION 'Knowledge sentence publication requires its private generated exercise' USING ERRCODE='23514'; END IF;
    IF kind_value='sentence-check' AND NOT EXISTS(SELECT 1 FROM public.knowledge_sentence_attempts a WHERE a.id=(new_value->>'result_knowledge_attempt_id')::uuid AND a.actor_id=actor_value AND a.note_id=(new_value->>'source_note_id')::uuid AND a.block_id=(new_value->'knowledge_source'->>'blockId')::uuid AND a.exercise_id=(new_value->>'source_exercise_id')::uuid AND a.operation_id=NEW.id) THEN RAISE EXCEPTION 'Knowledge sentence feedback requires its private checked attempt' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
 ELSIF new_value->>'source_kind'='knowledge-vocabulary' THEN
  PERFORM public.languon_assert_knowledge_job_source(NEW.id,kind_value,actor_value);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_learning_job() FROM PUBLIC;

--> statement-breakpoint
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

--> statement-breakpoint
-- Preserve app-only provenance before terminal parent rows lose their private body.
-- Existing retained jobs were admitted by the same source/financial authority;
-- a revoked grant stays revoked when the app reads this retained link later.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.sentence_ai_jobs j JOIN public.knowledge_notes n ON n.id=j.source_note_id WHERE j.source_kind='knowledge-vocabulary' AND j.knowledge_source IS NOT NULL AND j.input_payload IS NOT NULL AND (
  j.dictionary_id IS NULL AND jsonb_typeof(j.knowledge_source)='object' AND jsonb_typeof(j.input_payload)='object' AND j.knowledge_source->>'kind'='knowledge-block' AND j.knowledge_source->>'actorId'=j.learner_id::text AND j.knowledge_source->>'noteId'=j.source_note_id::text AND j.knowledge_source->>'noteOwnerId'=n.owner_id::text AND j.knowledge_source->'sourceSnapshot'->>'type'='vocabulary' AND coalesce(j.knowledge_source->>'blockId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' AND ((j.job_kind='sentence-generation' AND j.source_exercise_id IS NULL AND j.input_payload->'knowledgeSource'->>'noteId'=j.source_note_id::text AND j.input_payload->'knowledgeSource'->>'blockId'=j.knowledge_source->>'blockId') OR (j.job_kind='sentence-check' AND j.source_exercise_id IS NOT NULL AND j.input_payload->>'exerciseId'=j.source_exercise_id::text))
 ) IS NOT TRUE) THEN RAISE EXCEPTION 'Cannot retain inconsistent predeployment sentence provenance' USING ERRCODE='23514'; END IF;
END $$;

INSERT INTO public.knowledge_sentence_job_sources(job_id,actor_id,note_id,block_id,source_exercise_id,binding,input_payload)
SELECT j.id,j.learner_id,j.source_note_id,(j.knowledge_source->>'blockId')::uuid,j.source_exercise_id,j.knowledge_source,j.input_payload
FROM public.sentence_ai_jobs j JOIN public.knowledge_notes n ON n.id=j.source_note_id
WHERE j.source_kind='knowledge-vocabulary' AND j.knowledge_source IS NOT NULL AND j.input_payload IS NOT NULL
ON CONFLICT(job_id) DO NOTHING;

CREATE OR REPLACE FUNCTION languon_guard_knowledge_sentence_source_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Private sentence provenance is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.sentence_ai_jobs WHERE id=OLD.job_id) OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=OLD.note_id) OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.actor_id) OR public.languon_operator_purge_authorized(OLD.actor_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Private sentence provenance requires source or account cleanup' USING ERRCODE='23514';
 END IF;
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=NEW.job_id;
 IF j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' OR j.learner_id IS DISTINCT FROM NEW.actor_id OR j.source_note_id IS DISTINCT FROM NEW.note_id OR j.source_exercise_id IS DISTINCT FROM NEW.source_exercise_id OR j.knowledge_source IS DISTINCT FROM NEW.binding OR j.input_payload IS DISTINCT FROM NEW.input_payload OR NEW.binding->>'blockId' IS DISTINCT FROM NEW.block_id::text THEN RAISE EXCEPTION 'Private sentence provenance must match exact admitted job input and authority' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_assert_knowledge_job_source(j.id,j.job_kind,j.learner_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_sentence_source_link() FROM PUBLIC;
CREATE TRIGGER knowledge_sentence_private_source_immutable BEFORE UPDATE OR DELETE ON public.knowledge_sentence_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_sentence_source_link();
CREATE TRIGGER knowledge_sentence_private_source_admission AFTER INSERT ON public.knowledge_sentence_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_sentence_source_link();

CREATE OR REPLACE FUNCTION languon_require_knowledge_sentence_source_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.sentence_ai_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.sentence_ai_jobs WHERE id=NEW.id;
 IF j.id IS NULL OR j.source_kind<>'knowledge-vocabulary' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.knowledge_sentence_job_sources s WHERE s.job_id=j.id AND s.actor_id=j.learner_id AND s.note_id=j.source_note_id) AND EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=j.source_note_id) AND EXISTS(SELECT 1 FROM public.users WHERE id=j.learner_id AND status='active') AND NOT public.languon_operator_purge_authorized(j.learner_id) THEN RAISE EXCEPTION 'Private sentence action requires its retained app-only source' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_require_knowledge_sentence_source_link() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER knowledge_sentence_private_source_required AFTER INSERT OR UPDATE ON public.sentence_ai_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_require_knowledge_sentence_source_link();

CREATE OR REPLACE FUNCTION languon_redact_terminal_knowledge_sentence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.source_kind='knowledge-vocabulary' AND NEW.execution_state IN ('completed','failed','cancelled') THEN
  NEW.input_payload:=NULL; NEW.knowledge_source:=NULL; NEW.source_exercise_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_redact_terminal_knowledge_sentence() FROM PUBLIC;
-- Run after the established BEFORE guards have inspected the complete active
-- input. Deferred publication checks resolve from the immutable private link.
CREATE TRIGGER zz_knowledge_sentence_private_redaction BEFORE UPDATE ON public.sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_redact_terminal_knowledge_sentence();
UPDATE public.sentence_ai_jobs SET input_payload=NULL,knowledge_source=NULL,source_exercise_id=NULL WHERE source_kind='knowledge-vocabulary' AND execution_state IN ('completed','failed','cancelled');

--> statement-breakpoint
-- Private learning/media erasure is callable only for the existing verified due account claim.
-- It grants no general table read or mutation authority to the restricted purge worker.
CREATE OR REPLACE FUNCTION languon_purge_knowledge_owner(owner_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 PERFORM public.languon_quiesce_knowledge_learning_for_purge(owner_value,worker_value,fence_value);
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
 DELETE FROM public.knowledge_sentence_next_receipts WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_sentence_job_sources WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_private_translations WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_text_job_sources WHERE actor_id=owner_value;
 DELETE FROM public.knowledge_workbooks WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_transcription_jobs WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_transcription_operation_receipts WHERE owner_id=owner_value;
 UPDATE public.knowledge_transcription_config_revisions SET created_by=NULL WHERE created_by=owner_value;
 DELETE FROM public.knowledge_notes WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_operation_receipts WHERE owner_id=owner_value;
 DELETE FROM public.knowledge_media_blobs b WHERE NOT EXISTS(SELECT 1 FROM public.knowledge_media_assets a WHERE a.blob_id=b.id);
END; $$;
REVOKE ALL ON FUNCTION languon_purge_knowledge_owner(uuid,text,integer) FROM PUBLIC;
