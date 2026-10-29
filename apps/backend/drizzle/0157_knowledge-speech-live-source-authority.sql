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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_record_speech_provider_expense(job_value uuid,outcome_value text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; e jsonb; f public.ai_provider_expense_records%ROWTYPE; o public.ai_operator_attempt_costs%ROWTYPE; b public.ai_operator_action_budgets%ROWTYPE; owner_value uuid; amount_value bigint;
BEGIN
 SELECT payer_id INTO owner_value FROM public.speech_jobs WHERE id=job_value;
 IF owner_value IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); END IF;
 PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NOT NULL AND j.accounting_version=1 AND j.provider_dispatched_at IS NULL AND outcome_value='not_submitted' AND (j.queue_deadline<=clock_timestamp() OR public.languon_operator_purge_authorized(j.payer_id) OR (current_setting('languon.speech_worker_version',true)='1' AND EXISTS(SELECT 1 FROM public.knowledge_speech_recordings k WHERE k.recording_id=j.recording_id) AND public.languon_speech_knowledge_source_state(j.id,NULL)='unavailable')) THEN
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id AND state='active'; RETURN NULL;
 END IF;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR outcome_value NOT IN ('ready','unknown','not_submitted') THEN RAISE EXCEPTION 'Unbound speech provider observation' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NOT NULL AND j.provider_outcome<>outcome_value THEN RAISE EXCEPTION 'Speech provider observation replay conflicts with first outcome' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NULL THEN
   IF j.payer_id IS NULL THEN RAISE EXCEPTION 'Erased speech cannot create new provider facts' USING ERRCODE='23514'; END IF;
   IF outcome_value='ready' AND (j.state<>'storing' OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND checksum IS NOT NULL AND byte_length>0)) THEN RAISE EXCEPTION 'Ready expense requires acknowledged synthesis output' USING ERRCODE='23514'; END IF;
   IF outcome_value='not_submitted' AND (j.state<>'submitting' OR j.task_id IS NOT NULL OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Zero speech expense requires a live unsubmitted operation' USING ERRCODE='23514'; END IF;
   IF outcome_value='unknown' AND j.state NOT IN ('submitting','processing','storing','submission_unknown','failed') THEN RAISE EXCEPTION 'Unknown speech expense requires dispatched work' USING ERRCODE='23514'; END IF;
   UPDATE public.speech_jobs SET provider_outcome=outcome_value WHERE id=job_value;
 END IF;
 e:=public.languon_speech_provider_expense_identity(job_value); amount_value:=(e->>'amountUsdMicros')::bigint;
 INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_reference,action_id,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
 VALUES(gen_random_uuid(),'speech-attempt',e->>'attemptReference',job_value,e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',amount_value,(e->>'occurredAt')::timestamptz) ON CONFLICT(attempt_reference) DO NOTHING;
 SELECT * INTO f FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
 IF f.source_kind<>'speech-attempt' OR f.attempt_id IS NOT NULL OR f.action_id<>job_value OR f.provider_id IS DISTINCT FROM e->>'providerId' OR f.model_id IS DISTINCT FROM e->>'modelId' OR f.amount_usd_micros IS DISTINCT FROM amount_value OR f.measurement IS DISTINCT FROM e->>'measurement' OR f.cost_source IS DISTINCT FROM e->>'costSource' OR f.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN RAISE EXCEPTION 'Speech expense conflicts with authoritative fact' USING ERRCODE='23514'; END IF;
 SELECT * INTO b FROM public.ai_operator_action_budgets WHERE action_id=job_value FOR UPDATE;
 IF b.state='active' THEN
   SELECT * INTO o FROM public.ai_operator_attempt_costs WHERE attempt_id=job_value AND action_id=job_value FOR UPDATE;
   IF o.attempt_id IS NULL OR (amount_value IS NOT NULL AND amount_value>o.reserved_micros AND NOT (j.provider_price_snapshot ? 'nativeRules')) THEN RAISE EXCEPTION 'Speech observation exceeds provider authorization' USING ERRCODE='23514'; END IF;
   IF o.settled_at IS NULL THEN UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(amount_value,reserved_micros),measurement=CASE WHEN amount_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=clock_timestamp() WHERE attempt_id=job_value;
   ELSIF o.consumed_micros IS DISTINCT FROM coalesce(amount_value,o.reserved_micros) THEN RAISE EXCEPTION 'Speech operator amount conflicts with provider fact' USING ERRCODE='23514'; END IF;
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=(SELECT coalesce(sum(consumed_micros),0) FROM public.ai_operator_attempt_costs WHERE action_id=job_value),settled_at=clock_timestamp() WHERE action_id=job_value;
 END IF;
 PERFORM public.languon_mark_accounting_reports_dirty();
 RETURN f.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_speech_provider_expense(uuid,text) FROM PUBLIC;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_settle_speech_customer(reservation_value uuid,outcome_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.ai_credit_reservations%ROWTYPE; j public.speech_jobs%ROWTYPE; owner_value uuid; charged bigint:=0; released bigint; measurement_value public.ai_credit_measurement; now_value timestamptz:=clock_timestamp();
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_reservations WHERE id=reservation_value AND job_kind='speech-generation';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Speech billing requires its owned reservation' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO r FROM public.ai_credit_reservations WHERE id=reservation_value FOR UPDATE;
 SELECT * INTO j FROM public.speech_jobs WHERE id=r.job_id AND payer_id=r.owner_id AND reservation_id=r.id FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Speech billing has no authoritative job' USING ERRCODE='23514'; END IF;
 IF r.state='settled' THEN RETURN jsonb_build_object('chargedCredits',r.charged_credits::text,'releasedCredits',(r.reserved_credits-r.charged_credits)::text,'measurement',r.measurement); END IF;
 IF r.state<>'active' THEN RAISE EXCEPTION 'Speech billing reservation is not active' USING ERRCODE='23514'; END IF;
 IF outcome_value='success' THEN
   IF EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=j.recording_id) AND public.languon_speech_knowledge_source_state(j.id,j.lease_token)<>'available' THEN RAISE EXCEPTION 'Live knowledge source required for customer speech success' USING ERRCODE='23514'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND state='ready' AND ready_at IS NOT NULL) THEN RAISE EXCEPTION 'Speech billing requires published output' USING ERRCODE='23514'; END IF;
   IF r.policy_mode='limited' AND EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') AND now_value<j.billing_deadline AND EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND ready_at<j.billing_deadline) THEN charged:=r.reserved_credits; END IF;
 ELSIF outcome_value='deadline' THEN
   IF NOT(now_value>=j.billing_deadline OR (j.state='queued' AND now_value>=j.queue_deadline)) THEN RAISE EXCEPTION 'Speech deadline has not expired' USING ERRCODE='23514'; END IF;
 ELSIF outcome_value='failure' THEN
   IF j.state<>'failed' AND NOT public.languon_operator_purge_authorized(owner_value) THEN RAISE EXCEPTION 'Speech release requires durable failure or checked purge' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Unknown speech billing outcome' USING ERRCODE='23514'; END IF;
 measurement_value:=CASE WHEN charged>0 THEN 'speech_success'::public.ai_credit_measurement ELSE 'speech_no_charge'::public.ai_credit_measurement END;
 IF charged>0 THEN UPDATE public.ai_credit_reservation_allocations SET settled_credits=allocated_credits WHERE reservation_id=r.id; END IF;
 UPDATE public.ai_credit_reservations SET state='settled',charged_credits=charged,measured_credits=NULL,measurement=measurement_value,settled_at=now_value WHERE id=r.id;
 INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,measurement,created_at) VALUES(gen_random_uuid(),owner_value,'settlement',-charged,measurement_value,now_value);
 released:=r.reserved_credits-charged;
 IF released>0 THEN INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,created_at) VALUES(gen_random_uuid(),owner_value,'release',released,now_value); END IF;
 RETURN jsonb_build_object('chargedCredits',charged::text,'releasedCredits',released::text,'measurement',measurement_value);
END $$;
REVOKE ALL ON FUNCTION languon_settle_speech_customer(uuid,text) FROM PUBLIC;
