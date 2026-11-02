-- The bounded worker can publish its own leased result, but cannot read private
-- overlays or mutate note content. The parent terminal/action constraint still
-- requires publication and financial settlement in the same transaction.
CREATE OR REPLACE FUNCTION languon_publish_private_knowledge_translation(job_value uuid,actor_value uuid,worker_value text,fence_value bigint,proposal_value jsonb,at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.texts_ai_jobs%ROWTYPE; s public.knowledge_text_job_sources%ROWTYPE; projected_value jsonb; source_value jsonb; expected_source text; projected_source jsonb;
BEGIN
 SELECT * INTO j FROM public.texts_ai_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.owner_id<>actor_value OR j.external_source_kind IS DISTINCT FROM 'knowledge-block' OR j.execution_state<>'completed' OR j.cancellation_requested_at IS NOT NULL OR j.completed_at IS DISTINCT FROM at_value OR j.result_payload IS DISTINCT FROM proposal_value OR NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts a JOIN public.ai_credit_actions c ON c.id=a.action_id WHERE a.execution_job_id=job_value AND a.action_id=job_value AND a.state='settled' AND a.successful=1 AND c.owner_id=actor_value AND c.state='settled' AND c.outcome='success' AND a.provider_dispatch_witness->>'worker'=worker_value AND a.provider_dispatch_witness->>'fence'=fence_value::text) THEN RAISE EXCEPTION 'Private translation publication requires its settled worker result' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_assert_knowledge_job_source(job_value,'text-translation',actor_value);
 SELECT * INTO s FROM public.knowledge_text_job_sources WHERE job_id=job_value AND actor_id=actor_value;
 IF s.job_id IS NULL OR jsonb_typeof(proposal_value) IS DISTINCT FROM 'object' OR octet_length(proposal_value::text)>1048576 OR proposal_value->>'id' IS DISTINCT FROM job_value::text OR proposal_value->>'sourceLanguage' IS DISTINCT FROM s.binding->'sourceSnapshot'->>'language' OR coalesce(proposal_value->'textId','null'::jsonb)<>'null'::jsonb OR coalesce(proposal_value->'expectedTextVersion','null'::jsonb)<>'null'::jsonb OR proposal_value->'alignment'->'editedPairIds' IS DISTINCT FROM '[]'::jsonb OR jsonb_typeof(proposal_value->'alignment'->'translation') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Private translation result must match its admitted source' USING ERRCODE='23514'; END IF;
 source_value:=s.binding->'sourceSnapshot'->'segments';
 SELECT string_agg(item->>'text','' ORDER BY position) INTO expected_source FROM jsonb_array_elements(source_value) WITH ORDINALITY rows(item,position);
 SELECT jsonb_agg(jsonb_build_object('id',item->'pairId','text',item->'text') ORDER BY position) INTO projected_source FROM jsonb_array_elements(proposal_value->'alignment'->'source') WITH ORDINALITY rows(item,position);
 IF proposal_value->>'sourceText' IS DISTINCT FROM expected_source OR projected_source IS DISTINCT FROM source_value THEN RAISE EXCEPTION 'Private translation cannot replace original passages' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(source_value)<>jsonb_array_length(proposal_value->'alignment'->'translation') OR jsonb_array_length(source_value) NOT BETWEEN 1 AND 500 OR (SELECT count(DISTINCT p->>'pairId') FROM jsonb_array_elements(proposal_value->'alignment'->'translation') p)<>jsonb_array_length(source_value) OR EXISTS(SELECT 1 FROM jsonb_array_elements(proposal_value->'alignment'->'translation') p WHERE jsonb_typeof(p->'text') IS DISTINCT FROM 'string' OR char_length(p->>'text')>80000) THEN RAISE EXCEPTION 'Private translation requires exact bounded aligned passages' USING ERRCODE='23514'; END IF;
 SELECT jsonb_agg(jsonb_build_object('sourceSegmentId',source_segment->'id','text',translated->'text') ORDER BY position) INTO projected_value
 FROM jsonb_array_elements(source_value) WITH ORDINALITY source_items(source_segment,position)
 JOIN jsonb_array_elements(proposal_value->'alignment'->'translation') translated ON translated->>'pairId'=source_segment->>'id';
 IF projected_value IS NULL OR jsonb_array_length(projected_value)<>jsonb_array_length(source_value) THEN RAISE EXCEPTION 'Private translation passages do not align to the original' USING ERRCODE='23514'; END IF;
 INSERT INTO public.knowledge_private_translations(actor_id,note_id,block_id,source_fingerprint,target_language,segments,updated_at)
 VALUES(actor_value,s.note_id,s.block_id,s.binding->>'sourceFingerprint',proposal_value->>'targetLanguage',projected_value,at_value)
 ON CONFLICT(actor_id,note_id,block_id,target_language) DO UPDATE SET source_fingerprint=EXCLUDED.source_fingerprint,segments=EXCLUDED.segments,updated_at=EXCLUDED.updated_at WHERE public.knowledge_private_translations.updated_at<=EXCLUDED.updated_at;
END $$;
REVOKE ALL ON FUNCTION languon_publish_private_knowledge_translation(uuid,uuid,text,bigint,jsonb,timestamptz) FROM PUBLIC;
