-- Proposal erasure also runs on the conversation FK cascade; no excerpt survives its source.
CREATE OR REPLACE FUNCTION languon_erase_proposal_speech() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE recording_value uuid; retained_value uuid; erased_values uuid[];
BEGIN
 DELETE FROM public.speech_quotes q WHERE q.source->>'kind'='knowledge-snippet' AND q.source->'origin'->>'kind'='proposal' AND q.source->'origin'->>'proposalId'=OLD.id::text;
 WITH erased AS (
   DELETE FROM public.speech_bindings b WHERE b.source->>'kind'='knowledge-snippet' AND b.source->'origin'->>'kind'='proposal' AND b.source->'origin'->>'proposalId'=OLD.id::text RETURNING recording_id
 ) SELECT array_agg(DISTINCT recording_id) INTO erased_values FROM erased;
 FOREACH recording_value IN ARRAY coalesce(erased_values,'{}'::uuid[]) LOOP
   FOR retained_value IN SELECT id FROM public.speech_bindings WHERE recording_id=recording_value LOOP
     IF NOT public.languon_knowledge_speech_binding_available(retained_value) THEN DELETE FROM public.speech_bindings WHERE id=retained_value; END IF;
   END LOOP;
   IF NOT EXISTS(SELECT 1 FROM public.speech_bindings WHERE recording_id=recording_value) THEN
     UPDATE public.speech_recordings SET text='',state=CASE WHEN state='deleted' THEN state ELSE 'deleting' END,version=version+1 WHERE id=recording_value;
   END IF;
 END LOOP;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION languon_erase_proposal_speech() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_proposal_speech_erasure ON public.conversation_block_proposals;
CREATE TRIGGER knowledge_proposal_speech_erasure BEFORE DELETE ON public.conversation_block_proposals FOR EACH ROW EXECUTE FUNCTION languon_erase_proposal_speech();

CREATE INDEX IF NOT EXISTS speech_quotes_proposal_source_idx ON public.speech_quotes ((source->'origin'->>'proposalId')) WHERE source->>'kind'='knowledge-snippet' AND source->'origin'->>'kind'='proposal';
CREATE INDEX IF NOT EXISTS speech_bindings_proposal_source_idx ON public.speech_bindings ((source->'origin'->>'proposalId')) WHERE source->>'kind'='knowledge-snippet' AND source->'origin'->>'kind'='proposal';

