-- Existing unreleased private jobs retain a target pin where one is recoverable.
-- Completed jobs never acquire a new lease capability, so backfill is not publish authority.
DROP TRIGGER knowledge_text_source_link_immutable ON public.knowledge_text_job_sources;
UPDATE public.knowledge_text_job_sources s SET requested_target_language=coalesce(j.input_payload->>'targetLanguage',j.result_payload->>'targetLanguage') FROM public.texts_ai_jobs j WHERE j.id=s.job_id AND s.requested_target_language IS NULL;
CREATE TRIGGER knowledge_text_source_link_immutable BEFORE UPDATE OR DELETE ON public.knowledge_text_job_sources FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_text_source_link();
--> statement-breakpoint
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
-- A private result is authorized by a current claim capability, never a historical
-- witness or a worker-writable terminal row. These authority tables are SQL-only.
CREATE TABLE public.knowledge_translation_completion_capabilities (
 job_id uuid PRIMARY KEY REFERENCES public.texts_ai_jobs(id) ON DELETE CASCADE,
 worker_id text NOT NULL,fence bigint NOT NULL,token uuid NOT NULL,
 lease_deadline timestamptz NOT NULL,consumed_at timestamptz
);
CREATE TABLE public.knowledge_translation_publication_receipts (
 job_id uuid PRIMARY KEY REFERENCES public.texts_ai_jobs(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 note_id uuid NOT NULL REFERENCES public.knowledge_notes(id) ON DELETE CASCADE,
 block_id uuid NOT NULL,source_fingerprint text NOT NULL,target_language text NOT NULL,
 result_digest text NOT NULL,published_at timestamptz NOT NULL
);
REVOKE ALL ON public.knowledge_translation_completion_capabilities,public.knowledge_translation_publication_receipts FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_issue_private_translation_lease(job_value uuid,worker_value text,fence_value bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.texts_ai_jobs%ROWTYPE; token_value uuid:=gen_random_uuid(); instant_value timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.external_source_kind IS DISTINCT FROM 'knowledge-block' OR j.execution_state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=instant_value OR j.cancellation_requested_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.knowledge_translation_publication_receipts WHERE job_id=j.id) THEN RAISE EXCEPTION 'Private translation requires a fresh live claim' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_assert_knowledge_job_source(j.id,'text-translation',j.owner_id);
 INSERT INTO public.knowledge_translation_completion_capabilities(job_id,worker_id,fence,token,lease_deadline) VALUES(j.id,worker_value,fence_value,token_value,j.lease_deadline)
 ON CONFLICT(job_id) DO UPDATE SET worker_id=EXCLUDED.worker_id,fence=EXCLUDED.fence,token=EXCLUDED.token,lease_deadline=EXCLUDED.lease_deadline,consumed_at=NULL
 WHERE public.knowledge_translation_completion_capabilities.fence<EXCLUDED.fence AND public.knowledge_translation_completion_capabilities.consumed_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Private translation claim capability is issued once' USING ERRCODE='23514'; END IF;
 RETURN token_value;
END $$;
REVOKE ALL ON FUNCTION languon_issue_private_translation_lease(uuid,text,bigint) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_renew_private_translation_lease(job_value uuid,worker_value text,fence_value bigint,token_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.texts_ai_jobs%ROWTYPE; instant_value timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.execution_state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=instant_value OR j.cancellation_requested_at IS NOT NULL THEN RAISE EXCEPTION 'Private translation lease is unavailable' USING ERRCODE='23514'; END IF;
 UPDATE public.knowledge_translation_completion_capabilities SET lease_deadline=j.lease_deadline WHERE job_id=j.id AND worker_id=worker_value AND fence=fence_value AND token=token_value AND consumed_at IS NULL AND lease_deadline>instant_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'Private translation renewal requires its private claim capability' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION languon_renew_private_translation_lease(uuid,text,bigint,uuid) FROM PUBLIC;
--> statement-breakpoint
-- This trigger deliberately runs as invoker: direct worker writes retain their
-- restricted identity; the narrowly scoped completion definer runs as owner.
CREATE FUNCTION languon_guard_private_translation_terminal() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE trusted_value boolean:=current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID)); redaction_value boolean;
BEGIN
 IF OLD.external_source_kind IS DISTINCT FROM 'knowledge-block' THEN RETURN NEW; END IF;
 redaction_value:=NEW.result_payload IS NULL AND NEW.execution_state=OLD.execution_state AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at AND (trusted_value OR OLD.expires_at<=clock_timestamp());
 IF OLD.execution_state IN ('completed','failed','cancelled') AND (NEW.execution_state IS DISTINCT FROM OLD.execution_state OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR (NEW.result_payload IS DISTINCT FROM OLD.result_payload AND NOT redaction_value)) THEN RAISE EXCEPTION 'Private translation terminal facts are immutable' USING ERRCODE='23514'; END IF;
 IF NOT trusted_value AND ((NEW.execution_state='completed' AND OLD.execution_state<>'completed') OR (NEW.result_payload IS NOT NULL AND NEW.result_payload IS DISTINCT FROM OLD.result_payload) OR (NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NEW.execution_state='completed')) THEN RAISE EXCEPTION 'Private translation completion requires its typed claim authority' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_private_translation_terminal() FROM PUBLIC;
CREATE TRIGGER knowledge_translation_terminal_guard BEFORE UPDATE ON public.texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_private_translation_terminal();
--> statement-breakpoint
-- The old publication endpoint cannot turn terminal metadata into new authority.
CREATE OR REPLACE FUNCTION languon_publish_private_knowledge_translation(job_value uuid,actor_value uuid,worker_value text,fence_value bigint,proposal_value jsonb,at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Private translation publication requires one-shot completion authority' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_publish_private_knowledge_translation(uuid,uuid,text,bigint,jsonb,timestamptz) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_complete_private_knowledge_translation(job_value uuid,actor_value uuid,worker_value text,fence_value bigint,token_value uuid,proposal_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.texts_ai_jobs%ROWTYPE; s public.knowledge_text_job_sources%ROWTYPE; c public.knowledge_translation_completion_capabilities%ROWTYPE; projected_value jsonb; source_value jsonb; instant_value timestamptz; digest_value text;
BEGIN
 SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value FOR UPDATE;
 SELECT * INTO c FROM public.knowledge_translation_completion_capabilities WHERE job_id=job_value FOR UPDATE;
 instant_value:=clock_timestamp();
 IF j.id IS NULL OR j.owner_id IS DISTINCT FROM actor_value OR j.external_source_kind IS DISTINCT FROM 'knowledge-block' OR j.execution_state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=instant_value OR j.expires_at<=instant_value OR j.cancellation_requested_at IS NOT NULL OR c.job_id IS NULL OR c.worker_id IS DISTINCT FROM worker_value OR c.fence IS DISTINCT FROM fence_value OR c.token IS DISTINCT FROM token_value OR c.lease_deadline<=instant_value OR c.consumed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.knowledge_translation_publication_receipts WHERE job_id=j.id) THEN RAISE EXCEPTION 'Private translation completion requires its current one-shot claim capability' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts a JOIN public.ai_credit_actions action ON action.id=a.action_id WHERE a.execution_job_id=j.id AND a.action_id=j.id AND a.state='settled' AND a.successful=1 AND action.owner_id=actor_value AND action.state='settled' AND action.outcome='success' AND a.provider_dispatch_witness->>'jobId'=j.id::text AND a.provider_dispatch_witness->>'worker'=worker_value AND a.provider_dispatch_witness->>'fence'=fence_value::text) THEN RAISE EXCEPTION 'Private translation completion requires its settled current execution' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_assert_knowledge_job_source(j.id,'text-translation',actor_value);
 SELECT * INTO s FROM public.knowledge_text_job_sources WHERE job_id=j.id AND actor_id=actor_value;
 IF s.job_id IS NULL OR s.requested_target_language IS NULL OR s.requested_target_language IS DISTINCT FROM j.input_payload->>'targetLanguage' OR jsonb_typeof(proposal_value) IS DISTINCT FROM 'object' OR NOT proposal_value ?& ARRAY['id','sourceText','sourceLanguage','targetLanguage','alignment','textId','expectedTextVersion'] OR proposal_value-ARRAY['id','sourceText','sourceLanguage','targetLanguage','alignment','textId','expectedTextVersion']<>'{}'::jsonb OR octet_length(proposal_value::text)>1048576 OR proposal_value->>'id' IS DISTINCT FROM j.id::text OR proposal_value->>'targetLanguage' IS DISTINCT FROM s.requested_target_language OR proposal_value->>'sourceLanguage' IS DISTINCT FROM s.binding->'sourceSnapshot'->>'language' OR proposal_value->>'sourceText' IS DISTINCT FROM j.input_payload->>'sourceText' OR proposal_value->'textId' IS DISTINCT FROM 'null'::jsonb OR proposal_value->'expectedTextVersion' IS DISTINCT FROM 'null'::jsonb OR jsonb_typeof(proposal_value->'alignment') IS DISTINCT FROM 'object' OR proposal_value->'alignment'-ARRAY['source','translation','editedPairIds']<>'{}'::jsonb OR proposal_value->'alignment'->'editedPairIds' IS DISTINCT FROM '[]'::jsonb OR proposal_value->'alignment'->'source' IS DISTINCT FROM j.input_payload->'segments' OR jsonb_typeof(proposal_value->'alignment'->'translation') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Private translation result must match its immutable requested target and exact source' USING ERRCODE='23514'; END IF;
 source_value:=s.binding->'sourceSnapshot'->'segments';
 IF jsonb_array_length(source_value)<>jsonb_array_length(proposal_value->'alignment'->'translation') OR jsonb_array_length(source_value) NOT BETWEEN 1 AND 500 OR EXISTS(SELECT 1 FROM jsonb_array_elements(proposal_value->'alignment'->'translation') WITH ORDINALITY rows(p,position) WHERE jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['pairId','text']<>'{}'::jsonb OR p->>'pairId' IS DISTINCT FROM source_value->(position::integer-1)->>'id' OR jsonb_typeof(p->'text') IS DISTINCT FROM 'string' OR char_length(p->>'text')>80000) OR (SELECT coalesce(sum(char_length(p->>'text')),0) FROM jsonb_array_elements(proposal_value->'alignment'->'translation')p)>80000 THEN RAISE EXCEPTION 'Private translation requires exact bounded ordered passages' USING ERRCODE='23514'; END IF;
 SELECT jsonb_agg(jsonb_build_object('sourceSegmentId',source_segment->'id','text',CASE WHEN position>1 AND left(translated->>'text',2)=E'\n\n' THEN substring(translated->>'text' FROM 3) ELSE translated->>'text' END) ORDER BY position) INTO projected_value
 FROM jsonb_array_elements(source_value) WITH ORDINALITY source_items(source_segment,position)
 JOIN jsonb_array_elements(proposal_value->'alignment'->'translation') translated ON translated->>'pairId'=source_segment->>'id';
 digest_value:=encode(sha256(convert_to(proposal_value::text,'UTF8')),'hex');
 UPDATE public.knowledge_translation_completion_capabilities SET consumed_at=instant_value WHERE job_id=j.id;
 INSERT INTO public.knowledge_translation_publication_receipts(job_id,actor_id,note_id,block_id,source_fingerprint,target_language,result_digest,published_at) VALUES(j.id,actor_value,s.note_id,s.block_id,s.binding->>'sourceFingerprint',s.requested_target_language,digest_value,instant_value);
 UPDATE public.texts_ai_jobs SET execution_state='completed',result_payload=proposal_value,input_payload=NULL,completed_at=instant_value,updated_at=instant_value,failure_category=NULL,worker_id=NULL,lease_deadline=NULL,heartbeat_at=NULL WHERE id=j.id;
 INSERT INTO public.knowledge_private_translations(actor_id,note_id,block_id,source_fingerprint,target_language,segments,updated_at)
 VALUES(actor_value,s.note_id,s.block_id,s.binding->>'sourceFingerprint',s.requested_target_language,projected_value,instant_value)
 ON CONFLICT(actor_id,note_id,block_id,target_language) DO UPDATE SET source_fingerprint=EXCLUDED.source_fingerprint,segments=EXCLUDED.segments,updated_at=EXCLUDED.updated_at WHERE public.knowledge_private_translations.updated_at<=EXCLUDED.updated_at;
END $$;
REVOKE ALL ON FUNCTION languon_complete_private_knowledge_translation(uuid,uuid,text,bigint,uuid,jsonb) FROM PUBLIC;
