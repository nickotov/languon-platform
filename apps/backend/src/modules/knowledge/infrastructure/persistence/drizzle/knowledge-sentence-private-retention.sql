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
