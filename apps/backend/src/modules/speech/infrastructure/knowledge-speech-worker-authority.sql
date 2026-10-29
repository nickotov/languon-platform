-- Private knowledge source checks expose booleans only; execution workers never read document bodies.
CREATE OR REPLACE FUNCTION languon_knowledge_speech_binding_available(binding_value uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.speech_bindings%ROWTYPE; s jsonb; origin_value jsonb; note_value public.knowledge_notes%ROWTYPE;
 owner_value uuid; branch_value public.knowledge_working_branches%ROWTYPE; grant_value public.knowledge_workbook_shares%ROWTYPE;
 workbook_value public.knowledge_workbooks%ROWTYPE; proposal_value public.conversation_block_proposals%ROWTYPE; chat_value public.conversation_chats%ROWTYPE;
BEGIN
 SELECT * INTO b FROM public.speech_bindings WHERE id=binding_value;
 IF b.id IS NULL THEN RETURN false; END IF;
 s:=b.source; origin_value:=s->'origin';
 IF s->>'kind' NOT IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft') THEN RETURN false; END IF;
 SELECT owner_id INTO owner_value FROM public.knowledge_notes WHERE id=(s->>'noteId')::uuid;
 IF owner_value IS NULL THEN RETURN false; END IF;
 -- Source actors precede source aggregates, and both precede accounting/job locks.
 PERFORM 1 FROM public.users WHERE id IN (b.actor_id,owner_value) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=b.actor_id AND status='active') OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') THEN RETURN false; END IF;
 IF s->>'kind'='knowledge-snippet' AND origin_value->>'kind'='saved' AND origin_value->'access'->>'kind'='workbook' THEN
   SELECT * INTO grant_value FROM public.knowledge_workbook_shares WHERE locator=origin_value->'access'->>'locator' AND key_digest=origin_value->'access'->>'keyDigest';
   IF grant_value.workbook_id IS NULL THEN RETURN false; END IF;
   SELECT * INTO workbook_value FROM public.knowledge_workbooks WHERE id=grant_value.workbook_id AND owner_id=owner_value AND deleted_at IS NULL FOR SHARE;
   IF workbook_value.id IS NULL THEN RETURN false; END IF;
   PERFORM 1 FROM public.knowledge_workbook_shares WHERE workbook_id=workbook_value.id AND locator=origin_value->'access'->>'locator' AND key_digest=origin_value->'access'->>'keyDigest' FOR SHARE;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.knowledge_workbook_notes WHERE workbook_id=workbook_value.id AND note_id=(s->>'noteId')::uuid) THEN RETURN false; END IF;
 END IF;
 SELECT * INTO note_value FROM public.knowledge_notes WHERE id=(s->>'noteId')::uuid AND owner_id=owner_value FOR SHARE;
 IF note_value.id IS NULL THEN RETURN false; END IF;
 IF s->>'kind'='knowledge-snippet' AND origin_value->>'kind'='saved' THEN
   IF note_value.status<>'saved' OR note_value.version IS DISTINCT FROM (origin_value->>'expectedNoteVersion')::integer THEN RETURN false; END IF;
   IF origin_value->'access'->>'kind'='note' THEN
     PERFORM 1 FROM public.knowledge_shares WHERE note_id=note_value.id AND locator=origin_value->'access'->>'locator' AND key_digest=origin_value->'access'->>'keyDigest' FOR SHARE;
     IF NOT FOUND THEN RETURN false; END IF;
   ELSIF origin_value->'access'->>'kind'='workbook' THEN
     IF workbook_value.id IS NULL THEN RETURN false; END IF;
   ELSIF b.actor_id<>note_value.owner_id THEN RETURN false;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(note_value.body->'document'->'content','[]'::jsonb)) node WHERE node->'attrs'->'block'->>'id'=s->>'blockId') THEN RETURN false; END IF;
 ELSIF s->>'kind'='knowledge-snippet' AND origin_value->>'kind'='proposal' THEN
   IF b.actor_id<>note_value.owner_id THEN RETURN false; END IF;
   SELECT * INTO chat_value FROM public.conversation_chats WHERE id=(origin_value->>'conversationId')::uuid AND owner_id=b.actor_id AND source_kind='knowledge' AND source_id=note_value.id FOR SHARE;
   IF chat_value.id IS NULL OR chat_value.source->>'shareLocator' IS NOT NULL OR chat_value.source->>'view'='saved' THEN RETURN false; END IF;
   SELECT * INTO proposal_value FROM public.conversation_block_proposals WHERE id=(origin_value->>'proposalId')::uuid AND conversation_id=chat_value.id AND note_id=note_value.id FOR SHARE;
   IF proposal_value.id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(proposal_value.blocks) block WHERE block->>'id'=s->>'blockId') THEN RETURN false; END IF;
 ELSE
   IF b.actor_id<>note_value.owner_id THEN RETURN false; END IF;
   SELECT * INTO branch_value FROM public.knowledge_working_branches WHERE id=coalesce((s->>'branchId')::uuid,(origin_value->>'branchId')::uuid) AND note_id=note_value.id FOR SHARE;
   IF branch_value.id IS NULL THEN RETURN false; END IF;
   IF s->>'kind'<>'knowledge-audio-draft' THEN
     IF branch_value.version IS DISTINCT FROM coalesce((s->>'expectedBranchVersion')::integer,(origin_value->>'expectedBranchVersion')::integer) THEN RETURN false; END IF;
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(branch_value.content->'body'->'document'->'content','[]'::jsonb)) node WHERE node->'attrs'->'block'->>'id'=s->>'blockId') THEN RETURN false; END IF;
   END IF;
 END IF;
 -- The source locks keep discard/revocation behind this publication transaction.
 PERFORM 1 FROM public.speech_bindings WHERE id=b.id AND actor_id=b.actor_id AND source=b.source AND source_revision=b.source_revision FOR SHARE;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION languon_knowledge_speech_binding_available(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_speech_knowledge_source_state(job_value uuid,lease_value uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; binding_value uuid;
BEGIN
 IF current_setting('languon.speech_worker_version',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Speech worker capability required' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value;
 IF j.id IS NULL THEN RETURN 'unavailable'; END IF;
 IF j.source_binding_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=j.recording_id) THEN RETURN 'legacy'; END IF;
 IF lease_value IS NOT NULL AND (j.lease_token IS DISTINCT FROM lease_value OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) THEN RETURN 'unavailable'; END IF;
 SELECT id INTO binding_value FROM public.speech_bindings WHERE id=j.source_binding_id AND job_id=j.id AND actor_id=j.payer_id;
 IF binding_value IS NULL OR NOT public.languon_knowledge_speech_binding_available(binding_value) THEN RETURN 'unavailable'; END IF;
 RETURN 'available';
END $$;
REVOKE ALL ON FUNCTION languon_speech_knowledge_source_state(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_cleanup_knowledge_speech_quotes(batch_value integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE removed_value integer;
BEGIN
 IF current_setting('languon.speech_worker_version',true) IS DISTINCT FROM '1' OR batch_value NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Bounded speech worker cleanup required' USING ERRCODE='42501'; END IF;
 DELETE FROM public.speech_quotes WHERE id IN (
   SELECT id FROM public.speech_quotes WHERE expires_at<=clock_timestamp() AND source->>'kind' IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft') ORDER BY expires_at,id LIMIT batch_value FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS removed_value=ROW_COUNT;
 RETURN removed_value;
END $$;
REVOKE ALL ON FUNCTION languon_cleanup_knowledge_speech_quotes(integer) FROM PUBLIC;

-- Branch erasure removes source excerpts without cancelling or rewriting financial/provider facts.
CREATE OR REPLACE FUNCTION languon_erase_branch_speech() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE recording_value uuid; retained_value uuid; erased_values uuid[];
BEGIN
 DELETE FROM public.speech_quotes q WHERE q.source->>'noteId'=OLD.note_id::text AND (
   q.source->>'branchId'=OLD.id::text OR q.source->'origin'->>'branchId'=OLD.id::text OR
   (q.source->'origin'->>'kind'='proposal' AND EXISTS(SELECT 1 FROM public.conversation_block_proposals p WHERE p.id::text=q.source->'origin'->>'proposalId' AND p.branch_id=OLD.id))
 );
 WITH erased AS (
   DELETE FROM public.speech_bindings b WHERE b.source->>'noteId'=OLD.note_id::text AND (
     b.source->>'branchId'=OLD.id::text OR b.source->'origin'->>'branchId'=OLD.id::text OR
     (b.source->'origin'->>'kind'='proposal' AND EXISTS(SELECT 1 FROM public.conversation_block_proposals p WHERE p.id::text=b.source->'origin'->>'proposalId' AND p.branch_id=OLD.id))
   ) RETURNING recording_id
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
REVOKE ALL ON FUNCTION languon_erase_branch_speech() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_branch_speech_erasure ON public.knowledge_working_branches;
CREATE TRIGGER knowledge_branch_speech_erasure BEFORE DELETE ON public.knowledge_working_branches FOR EACH ROW EXECUTE FUNCTION languon_erase_branch_speech();

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

CREATE INDEX IF NOT EXISTS speech_quotes_knowledge_source_idx ON public.speech_quotes ((source->>'noteId'),(coalesce(source->>'branchId',source->'origin'->>'branchId'))) WHERE source->>'kind' IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft');
CREATE INDEX IF NOT EXISTS speech_bindings_knowledge_source_idx ON public.speech_bindings ((source->>'noteId'),(coalesce(source->>'branchId',source->'origin'->>'branchId'))) WHERE source->>'kind' IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft');

CREATE OR REPLACE FUNCTION languon_guard_knowledge_speech_payer_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.source_binding_id IS NOT DISTINCT FROM OLD.source_binding_id THEN RETURN NEW; END IF;
 IF OLD.source_binding_id IS NOT NULL THEN
   RAISE EXCEPTION 'Original knowledge speech payer binding is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.source_binding_id IS NULL THEN RETURN NEW; END IF;
 IF OLD.state<>'queued' OR OLD.provider_dispatched_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=OLD.recording_id) OR NOT EXISTS(SELECT 1 FROM public.speech_bindings WHERE id=NEW.source_binding_id AND job_id=OLD.id AND actor_id=OLD.payer_id) THEN RAISE EXCEPTION 'Knowledge speech requires its original admitted payer binding' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_speech_payer_binding() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_speech_payer_binding_guard ON public.speech_jobs;
CREATE TRIGGER knowledge_speech_payer_binding_guard BEFORE UPDATE OF source_binding_id ON public.speech_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_speech_payer_binding();

CREATE OR REPLACE FUNCTION languon_guard_knowledge_speech_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE job_value uuid; lease_value uuid;
BEGIN
 IF OLD.state='pending' AND NEW.state='ready' AND EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=OLD.id) THEN
   SELECT id,lease_token INTO job_value,lease_value FROM public.speech_jobs WHERE recording_id=OLD.id AND state='storing' AND lease_expires_at>clock_timestamp();
   IF job_value IS NULL OR public.languon_speech_knowledge_source_state(job_value,lease_value)<>'available' THEN RAISE EXCEPTION 'Live knowledge source required for speech publication' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_speech_publication() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_speech_publication_guard ON public.speech_recordings;
CREATE TRIGGER knowledge_speech_publication_guard BEFORE UPDATE ON public.speech_recordings FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_speech_publication();
