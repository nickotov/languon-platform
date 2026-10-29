-- Field authoring is source-bound, including draft-only values that cannot mutate the document.
CREATE OR REPLACE FUNCTION languon_assert_knowledge_field_action_source(job_value uuid,actor_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.texts_ai_jobs%ROWTYPE; s public.knowledge_field_job_sources%ROWTYPE; p jsonb;
BEGIN
 SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value;
 SELECT * INTO s FROM public.knowledge_field_job_sources WHERE job_id=job_value AND actor_id=actor_value;
 IF j.id IS NULL OR s.job_id IS NULL OR j.owner_id IS DISTINCT FROM actor_value OR j.external_source_kind IS DISTINCT FROM 'knowledge-field' OR j.format IS DISTINCT FROM 'text-translation:v4' OR j.job_kind IS DISTINCT FROM 'text-translation' OR j.folder_id IS NOT NULL OR j.text_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor_value AND status='active') OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes n JOIN public.knowledge_working_branches b ON b.note_id=n.id WHERE n.id=s.note_id AND n.owner_id=actor_value AND b.id=s.branch_id) THEN RAISE EXCEPTION 'Field action requires its owned note and working branch' USING ERRCODE='23514'; END IF;
 IF j.execution_state IN ('queued','running') AND j.input_payload IS NULL THEN RAISE EXCEPTION 'Field action captured input is unavailable' USING ERRCODE='23514'; END IF;
 IF j.input_payload IS NOT NULL THEN
  p:=j.input_payload->'knowledgeFieldAction';
  IF p IS NULL OR p->>'noteId' IS DISTINCT FROM s.note_id::text OR p->>'branchId' IS DISTINCT FROM s.branch_id::text OR p->>'blockId' IS DISTINCT FROM s.block_id::text OR p->>'operationId' IS DISTINCT FROM j.operation_id::text OR p->>'action' IS NULL OR p->>'action' NOT IN ('check','generate') OR p->'field'->>'kind' IS NULL OR p->'field'->>'kind' NOT IN ('vocabulary','bilingual-text') OR p->'field'->>'sourceText' IS DISTINCT FROM j.input_payload->>'sourceText' OR p->'field'->>'sourceLanguage' IS DISTINCT FROM j.input_payload->>'sourceLanguage' OR p->'field'->>'targetLanguage' IS DISTINCT FROM j.input_payload->>'targetLanguage' OR octet_length(p::text)>40000 THEN RAISE EXCEPTION 'Field action requires its immutable scoped input' USING ERRCODE='23514'; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION languon_assert_knowledge_field_action_source(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_assert_knowledge_text_action_source(job_value uuid,actor_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text;
BEGIN
 SELECT external_source_kind INTO k FROM public.texts_ai_jobs WHERE id=job_value AND owner_id=actor_value;
 IF k='knowledge-field' THEN PERFORM public.languon_assert_knowledge_field_action_source(job_value,actor_value);
 ELSIF k='knowledge-exercise' THEN PERFORM public.languon_assert_knowledge_exercise_action_source(job_value,actor_value);
 ELSE RAISE EXCEPTION 'Unsupported knowledge text action' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION languon_assert_knowledge_text_action_source(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_knowledge_field_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Field source bindings are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.texts_ai_jobs WHERE id=OLD.job_id) OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=OLD.note_id) OR NOT EXISTS(SELECT 1 FROM public.knowledge_working_branches WHERE id=OLD.branch_id) OR public.languon_operator_purge_authorized(OLD.actor_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Field source bindings require source cleanup' USING ERRCODE='23514';
 END IF;
 PERFORM public.languon_assert_knowledge_field_action_source(NEW.job_id,NEW.actor_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_field_source() FROM PUBLIC;
CREATE TRIGGER knowledge_field_source_immutable BEFORE UPDATE OR DELETE ON knowledge_field_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_field_source();
CREATE TRIGGER knowledge_field_source_admission AFTER INSERT ON knowledge_field_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_field_source();
