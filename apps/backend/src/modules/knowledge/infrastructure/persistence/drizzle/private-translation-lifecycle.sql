-- Terminal action metadata survives; source excerpts and results do not.
CREATE OR REPLACE FUNCTION languon_erase_deleted_knowledge_translations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_WHEN='BEFORE' THEN
  IF EXISTS(SELECT 1 FROM public.knowledge_text_job_sources s JOIN public.texts_ai_jobs j ON j.id=s.job_id WHERE s.note_id=OLD.id AND (j.execution_state IN ('queued','running') OR j.provider_reservation_state='active')) THEN RAISE EXCEPTION 'Knowledge deletion requires settled private translations' USING ERRCODE='23514'; END IF;
  UPDATE public.texts_ai_jobs SET input_payload=NULL,result_payload=NULL WHERE id IN (SELECT job_id FROM public.knowledge_text_job_sources WHERE note_id=OLD.id);
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION languon_erase_deleted_knowledge_translations() FROM PUBLIC;
CREATE TRIGGER knowledge_deleted_translation_erasure BEFORE DELETE ON public.knowledge_notes FOR EACH ROW EXECUTE FUNCTION languon_erase_deleted_knowledge_translations();
