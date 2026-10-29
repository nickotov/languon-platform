-- Saved learning material authorizes a private use, never an edit of its source.
CREATE OR REPLACE FUNCTION languon_assert_knowledge_learning_binding(binding_value jsonb, actor_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE n public.knowledge_notes%ROWTYPE; block_value jsonb; snapshot_value jsonb; grant_value jsonb; workbook_value uuid;
BEGIN
 IF binding_value IS NULL OR jsonb_typeof(binding_value)<>'object' OR octet_length(binding_value::text)>524288 OR binding_value->>'kind' IS DISTINCT FROM 'knowledge-block' OR binding_value->>'actorId' IS DISTINCT FROM actor_value::text OR NOT binding_value ?& ARRAY['noteId','noteOwnerId','blockId','sourceFingerprint','sourceSnapshot','grant'] THEN RAISE EXCEPTION 'A private learning action requires its pinned knowledge source' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor_value AND status='active') THEN RAISE EXCEPTION 'Knowledge learning actor is unavailable' USING ERRCODE='23514'; END IF;
 grant_value:=binding_value->'grant';
 IF grant_value->>'kind'='workbook' THEN
  workbook_value:=(grant_value->>'workbookId')::uuid;
  PERFORM 1 FROM public.knowledge_workbooks WHERE id=workbook_value AND owner_id=(binding_value->>'noteOwnerId')::uuid AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge workbook source is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.knowledge_workbook_shares WHERE workbook_id=workbook_value AND locator=grant_value->>'locator' AND key_digest=grant_value->>'digest' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge workbook grant is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.knowledge_workbook_notes WHERE workbook_id=workbook_value AND note_id=(binding_value->>'noteId')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge workbook membership is unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO n FROM public.knowledge_notes WHERE id=(binding_value->>'noteId')::uuid AND owner_id=(binding_value->>'noteOwnerId')::uuid AND status='saved' FOR SHARE;
 IF n.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=n.owner_id AND status='active') THEN RAISE EXCEPTION 'Knowledge learning source is unavailable' USING ERRCODE='23514'; END IF;
 IF grant_value='null'::jsonb THEN
  IF n.owner_id<>actor_value THEN RAISE EXCEPTION 'Knowledge learning source requires its live read grant' USING ERRCODE='23514'; END IF;
 ELSIF grant_value->>'kind'='note' THEN
  PERFORM 1 FROM public.knowledge_shares WHERE note_id=n.id AND locator=grant_value->>'locator' AND key_digest=grant_value->>'digest' AND version=(grant_value->>'version')::integer FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge note grant is unavailable' USING ERRCODE='23514'; END IF;
 ELSIF grant_value->>'kind' IS DISTINCT FROM 'workbook' THEN RAISE EXCEPTION 'Invalid knowledge learning grant' USING ERRCODE='23514';
 END IF;
 SELECT node->'attrs'->'block' INTO block_value FROM jsonb_array_elements(n.body->'document'->'content') node WHERE node->>'type'='learningBlock' AND node->'attrs'->'block'->>'id'=binding_value->>'blockId';
 IF block_value->>'type'='bilingual-text' THEN
  snapshot_value:=jsonb_build_object('type',block_value->'type','language',block_value->'language','segments',block_value->'segments');
 ELSIF block_value->>'type'='vocabulary' THEN
  snapshot_value:=jsonb_build_object('type',block_value->'type','language',block_value->'language','translationLanguage',block_value->'translationLanguage','entries',block_value->'entries');
 ELSE RAISE EXCEPTION 'Knowledge learning block is unavailable' USING ERRCODE='23514';
 END IF;
 IF snapshot_value IS DISTINCT FROM binding_value->'sourceSnapshot' THEN RAISE EXCEPTION 'Knowledge learning material changed' USING ERRCODE='23514'; END IF;
 IF block_value->>'type'='vocabulary' THEN
  IF jsonb_typeof(binding_value->'learningVersions') IS DISTINCT FROM 'array' OR jsonb_array_length(binding_value->'learningVersions')<>jsonb_array_length(block_value->'entries') OR (SELECT count(DISTINCT v->>'entryId') FROM jsonb_array_elements(binding_value->'learningVersions') v)<>jsonb_array_length(block_value->'entries') THEN RAISE EXCEPTION 'Knowledge vocabulary requires exact published entry epochs' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(block_value->'entries') entry WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(binding_value->'learningVersions') version_value JOIN public.knowledge_learning_epochs e ON e.note_id=n.id AND e.kind='vocabulary' AND e.block_id=(binding_value->>'blockId')::uuid AND e.item_id=(entry->>'id')::uuid AND e.active=true AND e.epoch=(version_value->>'epoch')::integer WHERE version_value->>'entryId'=entry->>'id'
  )) THEN RAISE EXCEPTION 'Knowledge vocabulary learning epoch changed' USING ERRCODE='23514'; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION languon_assert_knowledge_learning_binding(jsonb,uuid) FROM PUBLIC;

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

CREATE OR REPLACE FUNCTION languon_guard_knowledge_text_source_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Knowledge learning source links are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.texts_ai_jobs WHERE id=OLD.job_id) OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=OLD.note_id) OR public.languon_operator_purge_authorized(OLD.actor_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Knowledge learning source links require source or account cleanup' USING ERRCODE='23514';
 END IF;
 PERFORM public.languon_assert_knowledge_job_source(NEW.job_id,'text-translation',NEW.actor_id);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS knowledge_text_source_link_immutable ON public.knowledge_text_job_sources;
CREATE TRIGGER knowledge_text_source_link_immutable BEFORE UPDATE OR DELETE ON public.knowledge_text_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_text_source_link();
DROP TRIGGER IF EXISTS knowledge_text_source_link_admission ON public.knowledge_text_job_sources;
CREATE TRIGGER knowledge_text_source_link_admission AFTER INSERT ON public.knowledge_text_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_text_source_link();

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
DROP TRIGGER IF EXISTS knowledge_text_job_source_guard ON public.texts_ai_jobs;
CREATE TRIGGER knowledge_text_job_source_guard BEFORE UPDATE ON public.texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_learning_job();
DROP TRIGGER IF EXISTS knowledge_sentence_job_source_guard ON public.sentence_ai_jobs;
CREATE TRIGGER knowledge_sentence_job_source_guard BEFORE UPDATE ON public.sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_learning_job();
DROP TRIGGER IF EXISTS knowledge_sentence_job_source_admission ON public.sentence_ai_jobs;
CREATE TRIGGER knowledge_sentence_job_source_admission AFTER INSERT ON public.sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_learning_job();

-- Preserve the established token dispatch authority; add only its saved-source fence.
CREATE OR REPLACE FUNCTION languon_text_dispatch_execution(action_value uuid, job_value uuid, token_value text, worker_value text, fence_value bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text; row_value jsonb; execution_value jsonb; snapshot_value jsonb; owner_value uuid; table_value text; route_candidate jsonb; routing_value jsonb; dispatch_attempt integer; route_value text; configured_value jsonb; fingerprint_value text;
BEGIN
 SELECT a.owner_id,p.job_kind INTO owner_value,k FROM public.ai_credit_actions a JOIN public.ai_action_charging_policies p ON p.job_id=a.id AND p.owner_id=a.owner_id WHERE a.id=action_value AND a.state='active';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Dispatch requires its admitted action' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') THEN RAISE EXCEPTION 'Dispatch owner is inactive' USING ERRCODE='23514'; END IF;
 CASE k
  WHEN 'conversation-turn' THEN table_value:='conversation_turns';
  WHEN 'portrait-interview' THEN table_value:='learner_portrait_interview_operations';
  WHEN 'dictionary-generation' THEN table_value:='dictionary_generation_jobs';
  WHEN 'sentence-generation','sentence-check' THEN table_value:='sentence_ai_jobs';
  WHEN 'text-detection','text-translation' THEN table_value:='texts_ai_jobs';
  WHEN 'text-selection-card' THEN table_value:='dictionary_text_selection_jobs';
  ELSE RAISE EXCEPTION 'Unsupported dispatch feature' USING ERRCODE='23514';
 END CASE;
 PERFORM public.languon_assert_knowledge_job_source(job_value,k,owner_value);
 PERFORM public.languon_assert_private_sentence_dispatch(job_value);
 EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',table_value) INTO row_value USING job_value;
 IF row_value IS NULL OR coalesce(row_value->>'owner_id',row_value->>'learner_id') IS DISTINCT FROM owner_value::text THEN RAISE EXCEPTION 'Dispatch feature ownership mismatch' USING ERRCODE='23514'; END IF;
 IF k IN ('conversation-turn','portrait-interview') THEN
  IF job_value<>action_value OR coalesce(row_value->>'status',row_value->>'state')<>'running' OR token_value IS NULL OR row_value->>'lease_token' IS DISTINCT FROM token_value OR row_value->>'lease_until' IS NULL OR (row_value->>'lease_until')::timestamptz<=clock_timestamp() OR coalesce((row_value->>'cancel_requested')::boolean,false) THEN RAISE EXCEPTION 'Dispatch requires the current live lease' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'execution';
 ELSE
  IF row_value->>'execution_state'<>'running' OR worker_value IS NULL OR fence_value IS NULL OR row_value->>'worker_id' IS DISTINCT FROM worker_value OR (row_value->>'fencing_token')::bigint IS DISTINCT FROM fence_value OR row_value->>'lease_deadline' IS NULL OR (row_value->>'lease_deadline')::timestamptz<=clock_timestamp() OR row_value->>'cancellation_requested_at' IS NOT NULL THEN RAISE EXCEPTION 'Dispatch requires the current live worker fence' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'selected_execution_snapshot';
  IF job_value<>action_value THEN
   IF execution_value->>'actionParentId' IS DISTINCT FROM action_value::text OR NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions m JOIN public.sentence_preparation_children c ON c.preparation_id=m.preparation_id WHERE m.action_id=action_value AND c.job_id=job_value AND m.terminal_outcome IS NULL AND (m.selected_execution_snapshot-'actionParentId')=(execution_value-'actionParentId')) THEN RAISE EXCEPTION 'Preparation child has no admitted parent' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF execution_value->>'actionAccountingVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Dispatch requires immutable accounting execution' USING ERRCODE='23514'; END IF;
 snapshot_value:=coalesce(execution_value->'snapshot',execution_value);
 routing_value:=snapshot_value->'routingAuthority';
 IF routing_value IS NOT NULL THEN
  dispatch_attempt:=CASE WHEN k IN ('conversation-turn','portrait-interview') THEN
      1+(SELECT count(*) FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state='settled' AND successful=0)
      ELSE (row_value->>'attempt_count')::integer END;
  IF dispatch_attempt NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Automatic routing attempt allowance exhausted' USING ERRCODE='23514'; END IF;
  IF dispatch_attempt=2 THEN
   IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state='dispatched') THEN RAISE EXCEPTION 'Ambiguous upstream execution cannot be retried' USING ERRCODE='23514'; END IF;
   IF k='conversation-turn' AND EXISTS(SELECT 1 FROM public.conversation_messages WHERE turn_id=action_value AND role='assistant' AND content<>'') THEN RAISE EXCEPTION 'Visible output prevents automatic fallback' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT r.configuration INTO configured_value FROM public.text_ai_routing_state current_state JOIN public.text_ai_routing_revisions r ON r.id=current_state.active_revision_id WHERE current_state.id='global' FOR SHARE OF current_state;
  IF dispatch_attempt=1 AND k IN ('conversation-turn','portrait-interview') THEN
   -- Inline adapters were constructed before admission; never change their identity behind HTTP.
   route_candidate:=routing_value->'candidates'->0;
   IF configured_value IS NULL OR NOT (configured_value->'enabledRouteIds' ? (route_candidate->>'routeId')) OR NOT public.languon_text_ai_route_dispatch_allowed(route_candidate->>'routeId',routing_value->>'flowId',route_candidate->>'fingerprint',clock_timestamp()) THEN route_candidate:=NULL; END IF;
  ELSIF dispatch_attempt=2 AND k IN ('conversation-turn','portrait-interview') THEN
   route_candidate:=routing_value->'candidates'->1;
   IF configured_value IS NULL OR route_candidate IS NULL OR NOT (configured_value->'enabledRouteIds' ? (route_candidate->>'routeId')) OR NOT public.languon_text_ai_route_dispatch_allowed(route_candidate->>'routeId',routing_value->>'flowId',route_candidate->>'fingerprint',clock_timestamp()) THEN route_candidate:=NULL; END IF;
  ELSIF dispatch_attempt=1 THEN
   -- No provider has run: choose only among the alternatives pinned at admission.
   SELECT candidate INTO route_candidate FROM jsonb_array_elements(routing_value->'candidates') WITH ORDINALITY AS pinned(candidate,position)
   WHERE configured_value->'enabledRouteIds' ? (candidate->>'routeId')
    AND public.languon_text_ai_route_dispatch_allowed(candidate->>'routeId',routing_value->>'flowId',candidate->>'fingerprint',clock_timestamp())
   ORDER BY position LIMIT 1;
  ELSE
   SELECT candidate INTO route_candidate FROM jsonb_array_elements(routing_value->'candidates') WITH ORDINALITY AS pinned(candidate,position)
   WHERE NOT EXISTS(SELECT 1 FROM public.text_ai_route_dispatches d JOIN public.ai_credit_action_attempts a ON a.id=d.attempt_id WHERE a.action_id=action_value AND a.execution_job_id=job_value AND a.state='settled' AND a.successful=0 AND d.route_id=candidate->>'routeId')
    AND configured_value->'enabledRouteIds' ? (candidate->>'routeId')
    AND public.languon_text_ai_route_dispatch_allowed(candidate->>'routeId',routing_value->>'flowId',candidate->>'fingerprint',clock_timestamp())
   ORDER BY position LIMIT 1;
  END IF;
  IF route_candidate IS NULL THEN RAISE EXCEPTION 'Route excluded before dispatch' USING ERRCODE='23514'; END IF;
  IF (route_candidate->'snapshot'->>'perCallMaxInputTokens')::bigint<(snapshot_value->>'perCallMaxInputTokens')::bigint OR (route_candidate->'snapshot'->>'perCallMaxOutputTokens')::bigint<(snapshot_value->>'perCallMaxOutputTokens')::bigint THEN RAISE EXCEPTION 'Fallback cannot reduce confirmed allowance' USING ERRCODE='23514'; END IF;
  snapshot_value:=snapshot_value || (route_candidate->'snapshot') || jsonb_build_object('aggregateBudget',snapshot_value->'aggregateBudget','routingAuthority',routing_value);
  IF execution_value ? 'snapshot' THEN execution_value:=execution_value || jsonb_build_object('snapshot',snapshot_value,'providerPrice',route_candidate->'providerPrice');
  ELSE execution_value:=snapshot_value || jsonb_build_object('actionProviderPrice',route_candidate->'providerPrice'); END IF;
  execution_value:=execution_value || jsonb_build_object('routingDispatchAttempt',dispatch_attempt);

 END IF;

 RETURN execution_value || CASE WHEN k IN ('conversation-turn','portrait-interview') THEN '{}'::jsonb ELSE jsonb_build_object('dispatchJobAttempt',(row_value->>'attempt_count')::integer) END;
END $$;


-- BEFORE DELETE application participants have already fenced/settled each bound action.
-- The absent original note is the unforgeable authority for erasing its retained source snapshot.
CREATE OR REPLACE FUNCTION languon_erase_deleted_knowledge_sentence_sources() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.sentence_ai_jobs WHERE source_kind='knowledge-vocabulary' AND source_note_id=OLD.id AND execution_state NOT IN ('completed','failed','cancelled')) THEN RAISE EXCEPTION 'Knowledge source deletion requires settled private learning jobs' USING ERRCODE='23514'; END IF;
 UPDATE public.sentence_ai_jobs SET knowledge_source=NULL,input_payload=NULL,source_exercise_id=NULL,result_knowledge_exercise_id=NULL,result_knowledge_attempt_id=NULL WHERE source_kind='knowledge-vocabulary' AND source_note_id=OLD.id;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS knowledge_deleted_sentence_source_erasure ON public.knowledge_notes;
CREATE TRIGGER knowledge_deleted_sentence_source_erasure AFTER DELETE ON public.knowledge_notes FOR EACH ROW EXECUTE FUNCTION languon_erase_deleted_knowledge_sentence_sources();

-- Validation returning false uses a PL/pgSQL subtransaction, so a revoked grant
-- does not abort the worker's transaction before it can settle the admitted job.
CREATE OR REPLACE FUNCTION languon_knowledge_job_source_available(job_value uuid,kind_value text,actor_value uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_assert_knowledge_job_source(job_value,kind_value,actor_value);
 RETURN true;
EXCEPTION WHEN check_violation THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION languon_knowledge_job_source_available(uuid,text,uuid) FROM PUBLIC;
