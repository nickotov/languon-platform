-- Prepared private text must never remain in the worker-readable global queue.
ALTER TABLE public.knowledge_translation_publication_receipts ADD COLUMN result_payload jsonb;
ALTER TABLE public.knowledge_translation_publication_receipts ADD COLUMN retention_deadline timestamptz;
UPDATE public.knowledge_translation_publication_receipts r SET result_payload=CASE WHEN encode(sha256(convert_to(j.result_payload::text,'UTF8')),'hex')=r.result_digest THEN j.result_payload ELSE NULL END,retention_deadline=least(j.expires_at,r.published_at+interval '24 hours') FROM public.texts_ai_jobs j WHERE j.id=r.job_id;
ALTER TABLE public.knowledge_translation_publication_receipts ALTER COLUMN retention_deadline SET NOT NULL;
UPDATE public.texts_ai_jobs SET result_payload=NULL WHERE external_source_kind='knowledge-block' AND execution_state='completed' AND result_payload IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_guard_private_translation_terminal() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE trusted_value boolean:=current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID)); redaction_value boolean;
 mutable_value text[]:=ARRAY['execution_state','attempt_count','fencing_token','worker_id','lease_deadline','heartbeat_at','cancellation_requested_at','next_attempt_at','completed_at','updated_at','ai_credit_provider_dispatched_at','input_payload','result_payload','failure_category','provider_reservation_state','provider_reservation_settled_at','provider_actual_cost_micros','provider_actual_input_tokens','provider_actual_output_tokens'];
 terminal_mutable_value text[]:=ARRAY['updated_at','input_payload','result_payload'];
BEGIN
 IF OLD.external_source_kind IS DISTINCT FROM 'knowledge-block' THEN RETURN NEW; END IF;
 -- New columns default to immutable. Only explicit lifecycle fields may change;
 -- accounting definers and authenticated Apply add their own narrow allowance.
 IF trusted_value THEN
  mutable_value:=mutable_value||ARRAY['applied_text_id','ai_credit_accounted','ai_credit_reservation_id','ai_credit_policy_mode','ai_credit_pricing_revision','ai_credit_max_credits_per_attempt','ai_credit_input_credits_per_million_tokens','ai_credit_output_credits_per_million_tokens','provider_reservation_state','provider_reserved_attempts','provider_reserved_cost_micros','provider_reserved_input_tokens','provider_reserved_output_tokens','provider_reservation_settled_at','provider_actual_cost_micros','provider_actual_input_tokens','provider_actual_output_tokens'];
  terminal_mutable_value:=terminal_mutable_value||ARRAY['applied_text_id','cancellation_requested_at'];
 END IF;
 IF to_jsonb(NEW)-mutable_value IS DISTINCT FROM to_jsonb(OLD)-mutable_value THEN RAISE EXCEPTION 'Private translation admission, retention and identity are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.execution_state IN ('completed','failed','cancelled') AND to_jsonb(NEW)-terminal_mutable_value IS DISTINCT FROM to_jsonb(OLD)-terminal_mutable_value THEN RAISE EXCEPTION 'Private translation terminal facts are immutable' USING ERRCODE='23514'; END IF;
 redaction_value:=NEW.result_payload IS NULL AND NEW.execution_state=OLD.execution_state AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at AND (trusted_value OR OLD.expires_at<=clock_timestamp());
 IF OLD.execution_state IN ('completed','failed','cancelled') AND (NEW.execution_state IS DISTINCT FROM OLD.execution_state OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR (NEW.result_payload IS DISTINCT FROM OLD.result_payload AND NOT redaction_value)) THEN RAISE EXCEPTION 'Private translation terminal facts are immutable' USING ERRCODE='23514'; END IF;
 IF NOT trusted_value AND ((NEW.execution_state='completed' AND OLD.execution_state<>'completed') OR (NEW.result_payload IS NOT NULL AND NEW.result_payload IS DISTINCT FROM OLD.result_payload) OR (NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NEW.execution_state='completed')) THEN RAISE EXCEPTION 'Private translation completion requires its typed claim authority' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_private_translation_terminal() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_complete_private_knowledge_translation(job_value uuid,actor_value uuid,worker_value text,fence_value bigint,token_value uuid,proposal_value jsonb) RETURNS void
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
 IF s.job_id IS NULL OR s.requested_target_language IS NULL OR s.requested_target_language IS DISTINCT FROM j.input_payload->>'targetLanguage' OR jsonb_typeof(proposal_value) IS DISTINCT FROM 'object' OR NOT proposal_value ?& ARRAY['id','sourceText','sourceLanguage','targetLanguage','alignment','textId','expectedTextVersion'] OR proposal_value-ARRAY['id','sourceText','sourceLanguage','targetLanguage','alignment','textId','expectedTextVersion']<>'{}'::jsonb OR octet_length(proposal_value::text)>1048576 OR proposal_value->>'id' IS DISTINCT FROM j.id::text OR proposal_value->>'targetLanguage' IS DISTINCT FROM s.requested_target_language OR proposal_value->>'sourceLanguage' IS DISTINCT FROM s.binding->'sourceSnapshot'->>'language' OR proposal_value->>'sourceText' IS DISTINCT FROM j.input_payload->>'sourceText' OR proposal_value->'textId' IS DISTINCT FROM 'null'::jsonb OR proposal_value->'expectedTextVersion' IS DISTINCT FROM 'null'::jsonb OR jsonb_typeof(proposal_value->'alignment') IS DISTINCT FROM 'object' OR (proposal_value->'alignment')-ARRAY['source','translation','editedPairIds']<>'{}'::jsonb OR proposal_value->'alignment'->'editedPairIds' IS DISTINCT FROM '[]'::jsonb OR proposal_value->'alignment'->'source' IS DISTINCT FROM j.input_payload->'segments' OR jsonb_typeof(proposal_value->'alignment'->'translation') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Private translation result must match its immutable requested target and exact source' USING ERRCODE='23514'; END IF;
 source_value:=s.binding->'sourceSnapshot'->'segments';
 IF jsonb_array_length(source_value)<>jsonb_array_length(proposal_value->'alignment'->'translation') OR jsonb_array_length(source_value) NOT BETWEEN 1 AND 500 OR EXISTS(SELECT 1 FROM jsonb_array_elements(proposal_value->'alignment'->'translation') WITH ORDINALITY rows(p,position) WHERE jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['pairId','text']<>'{}'::jsonb OR p->>'pairId' IS DISTINCT FROM source_value->(position::integer-1)->>'id' OR jsonb_typeof(p->'text') IS DISTINCT FROM 'string' OR char_length(p->>'text')>80000) OR (SELECT coalesce(sum(char_length(p->>'text')),0) FROM jsonb_array_elements(proposal_value->'alignment'->'translation')p)>80000 THEN RAISE EXCEPTION 'Private translation requires exact bounded ordered passages' USING ERRCODE='23514'; END IF;
 SELECT jsonb_agg(jsonb_build_object('sourceSegmentId',source_segment->'id','text',CASE WHEN position>1 AND left(translated->>'text',2)=E'\n\n' THEN substring(translated->>'text' FROM 3) ELSE translated->>'text' END) ORDER BY position) INTO projected_value
 FROM jsonb_array_elements(source_value) WITH ORDINALITY source_items(source_segment,position)
 JOIN jsonb_array_elements(proposal_value->'alignment'->'translation') translated ON translated->>'pairId'=source_segment->>'id';
 digest_value:=encode(sha256(convert_to(proposal_value::text,'UTF8')),'hex');
 UPDATE public.knowledge_translation_completion_capabilities SET consumed_at=instant_value WHERE job_id=j.id;
 INSERT INTO public.knowledge_translation_publication_receipts(job_id,actor_id,note_id,block_id,source_fingerprint,target_language,result_digest,result_payload,retention_deadline,published_at) VALUES(j.id,actor_value,s.note_id,s.block_id,s.binding->>'sourceFingerprint',s.requested_target_language,digest_value,proposal_value,least(j.expires_at,instant_value+interval '24 hours'),instant_value);
 UPDATE public.texts_ai_jobs SET execution_state='completed',result_payload=NULL,input_payload=NULL,completed_at=instant_value,updated_at=instant_value,failure_category=NULL,worker_id=NULL,lease_deadline=NULL,heartbeat_at=NULL WHERE id=j.id;
 INSERT INTO public.knowledge_private_translations(actor_id,note_id,block_id,source_fingerprint,target_language,segments,updated_at)
 VALUES(actor_value,s.note_id,s.block_id,s.binding->>'sourceFingerprint',s.requested_target_language,projected_value,instant_value)
 ON CONFLICT(actor_id,note_id,block_id,target_language) DO UPDATE SET source_fingerprint=EXCLUDED.source_fingerprint,segments=EXCLUDED.segments,updated_at=EXCLUDED.updated_at WHERE public.knowledge_private_translations.updated_at<=EXCLUDED.updated_at;
END $$;
REVOKE ALL ON FUNCTION languon_complete_private_knowledge_translation(uuid,uuid,text,bigint,uuid,jsonb) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_cleanup_private_translation_results(limit_value integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE count_value integer;
BEGIN
 IF limit_value IS NULL OR limit_value NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid private translation cleanup bound' USING ERRCODE='23514'; END IF;
 UPDATE public.knowledge_translation_publication_receipts SET result_payload=NULL WHERE job_id IN (SELECT r.job_id FROM public.knowledge_translation_publication_receipts r WHERE r.result_payload IS NOT NULL AND r.retention_deadline<=clock_timestamp() ORDER BY r.retention_deadline LIMIT limit_value);
 GET DIAGNOSTICS count_value=ROW_COUNT;
 RETURN count_value;
END $$;
REVOKE ALL ON FUNCTION languon_cleanup_private_translation_results(integer) FROM PUBLIC;
