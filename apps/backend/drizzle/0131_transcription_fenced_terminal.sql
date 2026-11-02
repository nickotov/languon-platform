-- Worker credentials may claim/renew a lease and finish only through fenced authority.
-- Publication and financial settlement are one indivisible transaction.
CREATE CONSTRAINT TRIGGER ai_credit_feature_action_authority
AFTER INSERT OR UPDATE ON public.knowledge_transcription_jobs
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.languon_ai_credit_feature_authority_constraint();
--> statement-breakpoint
CREATE TABLE public.knowledge_transcription_lease_capabilities (
 job_id uuid PRIMARY KEY REFERENCES public.knowledge_transcription_jobs(id) ON DELETE CASCADE,
 token uuid NOT NULL, worker_id text NOT NULL, fence integer NOT NULL
);
REVOKE ALL ON public.knowledge_transcription_lease_capabilities FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_claim_transcription(job_value uuid, worker_value text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; instant_value timestamptz:=clock_timestamp(); token_value uuid:=gen_random_uuid();
BEGIN
 IF worker_value IS NULL OR length(btrim(worker_value)) NOT BETWEEN 1 AND 200 THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.state<>'queued' OR j.deadline_at<=instant_value THEN RETURN NULL; END IF;
 UPDATE public.knowledge_transcription_jobs SET state='running',worker_id=worker_value,fencing_token=j.fencing_token+1,lease_deadline=least(instant_value+interval '60 seconds',j.deadline_at),updated_at=instant_value WHERE id=j.id;
 INSERT INTO public.knowledge_transcription_lease_capabilities(job_id,token,worker_id,fence) VALUES(j.id,token_value,worker_value,j.fencing_token+1) ON CONFLICT(job_id) DO UPDATE SET token=EXCLUDED.token,worker_id=EXCLUDED.worker_id,fence=EXCLUDED.fence;
 RETURN token_value;
END $$;
REVOKE ALL ON FUNCTION languon_claim_transcription(uuid,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_heartbeat_transcription(job_value uuid,worker_value text,fence_value integer,token_value uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; instant_value timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.knowledge_transcription_lease_capabilities WHERE job_id=job_value AND token=token_value AND worker_id=worker_value AND fence=fence_value) THEN RETURN false; END IF;
 IF j.id IS NULL OR j.state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=instant_value OR j.deadline_at<=instant_value OR j.cancellation_requested_at IS NOT NULL THEN RETURN false; END IF;
 UPDATE public.knowledge_transcription_jobs SET lease_deadline=least(instant_value+interval '60 seconds',j.deadline_at),updated_at=instant_value WHERE id=j.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION languon_heartbeat_transcription(uuid,text,integer,uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_finish_transcription(job_value uuid,worker_value text,fence_value integer,token_value uuid,result_value jsonb,failure_value text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; t public.ai_credit_action_attempts%ROWTYPE; owner_value uuid; instant_value timestamptz; duration_value bigint; succeeded boolean:=false; stopped boolean; outcome_value text;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT owner_id INTO owner_value FROM public.knowledge_transcription_jobs WHERE id=job_value;
 IF owner_value IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 PERFORM 1 FROM public.ai_credit_actions WHERE id=job_value FOR UPDATE;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 instant_value:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.knowledge_transcription_lease_capabilities WHERE job_id=job_value AND token=token_value AND worker_id=worker_value AND fence=fence_value) THEN RETURN false; END IF;
 IF worker_value IS NULL OR fence_value IS NULL OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value THEN RETURN false; END IF;
 IF result_value IS NOT NULL THEN
  SELECT * INTO t FROM public.ai_credit_action_attempts WHERE id=j.attempt_id;
  -- Immutable dispatch witness permits the original executor's late cost observation,
  -- even after cancellation, but never grants permission to republish content.
  IF t.id IS NULL OR t.provider_dispatch_witness->>'jobId' IS DISTINCT FROM j.id::text OR t.provider_dispatch_witness->>'worker' IS DISTINCT FROM worker_value OR t.provider_dispatch_witness->>'fence' IS DISTINCT FROM fence_value::text OR result_value->>'receiptId' IS DISTINCT FROM j.receipt_id::text THEN RAISE EXCEPTION 'Transcription result requires its fenced issued receipt' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(result_value) IS DISTINCT FROM 'object' OR result_value-ARRAY['receiptId','text','languages','usage']<>'{}'::jsonb OR jsonb_typeof(result_value->'text') IS DISTINCT FROM 'string' OR length(btrim(result_value->>'text')) NOT BETWEEN 1 AND 80000 OR octet_length(result_value::text)>524288 OR jsonb_typeof(result_value->'languages') IS DISTINCT FROM 'array' OR jsonb_array_length(result_value->'languages')>16 OR (result_value->>'text') !~ '[^[:space:]]' THEN RAISE EXCEPTION 'Invalid transcription result' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'languages') language_value WHERE jsonb_typeof(language_value) IS DISTINCT FROM 'string' OR length(language_value #>> '{}') NOT BETWEEN 2 AND 35 OR (language_value #>> '{}') !~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$') THEN RAISE EXCEPTION 'Invalid transcript language' USING ERRCODE='23514'; END IF;
  IF result_value->'usage' IS DISTINCT FROM 'null'::jsonb THEN
   IF jsonb_typeof(result_value->'usage') IS DISTINCT FROM 'object' OR (result_value->'usage')-ARRAY['type','seconds']<>'{}'::jsonb OR result_value->'usage'->>'type' IS DISTINCT FROM 'duration' OR jsonb_typeof(result_value->'usage'->'seconds') IS DISTINCT FROM 'number' OR (result_value->'usage'->>'seconds')::numeric<0 OR (result_value->'usage'->>'seconds')::numeric>9007199254740.991 THEN RAISE EXCEPTION 'Invalid duration observation' USING ERRCODE='23514'; END IF;
   duration_value:=ceil((result_value->'usage'->>'seconds')::numeric*1000)::bigint;
  END IF;
  PERFORM public.languon_observe_transcription_call(j.id,j.receipt_id,duration_value);
 END IF;
 IF j.state NOT IN ('queued','running') THEN RETURN false; END IF;
 succeeded:=result_value IS NOT NULL AND failure_value IS NULL AND j.state='running' AND j.lease_deadline>instant_value AND j.deadline_at>instant_value AND j.cancellation_requested_at IS NULL AND EXISTS(SELECT 1 FROM public.users WHERE id=j.owner_id AND status='active') AND EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=j.note_id AND owner_id=j.owner_id) AND EXISTS(SELECT 1 FROM public.knowledge_media_assets g JOIN public.knowledge_media_blobs b ON b.id=g.blob_id WHERE g.id=j.asset_id AND g.note_id=j.note_id AND b.checksum=j.checksum AND b.duration_ms=j.source_duration_ms AND octet_length(b.bytes)=j.byte_length);
 stopped:=j.cancellation_requested_at IS NOT NULL AND j.failure_code='explicit_stop';
 outcome_value:=CASE WHEN succeeded THEN 'success' WHEN stopped THEN 'stopped' ELSE 'failure' END;
 UPDATE public.knowledge_transcription_jobs SET state=CASE WHEN succeeded THEN 'completed' WHEN stopped THEN 'cancelled' ELSE 'failed' END,result=CASE WHEN succeeded THEN result_value ELSE NULL END,observed_audio_input_ms=duration_value,failure_code=CASE WHEN succeeded THEN NULL WHEN stopped THEN 'explicit_stop' ELSE coalesce(failure_value,'transcription_failed') END,updated_at=instant_value WHERE id=j.id;
 PERFORM public.languon_settle_transcription_attempt(j.id,succeeded);
 PERFORM public.languon_settle_credit_action(j.id,outcome_value,instant_value);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION languon_finish_transcription(uuid,text,integer,uuid,jsonb,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_recover_transcription(job_value uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; owner_value uuid; instant_value timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT owner_id INTO owner_value FROM public.knowledge_transcription_jobs WHERE id=job_value;
 IF owner_value IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 PERFORM 1 FROM public.ai_credit_actions WHERE id=job_value FOR UPDATE;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 instant_value:=clock_timestamp();
 IF j.state NOT IN ('queued','running') OR (j.deadline_at>instant_value AND (j.state<>'running' OR j.lease_deadline>instant_value)) THEN RETURN false; END IF;
 UPDATE public.knowledge_transcription_jobs SET state='failed',result=NULL,failure_code='execution_expired',updated_at=instant_value WHERE id=j.id;
 PERFORM public.languon_settle_transcription_attempt(j.id,false);
 PERFORM public.languon_settle_credit_action(j.id,'failure',instant_value);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION languon_recover_transcription(uuid) FROM PUBLIC;

--> statement-breakpoint
CREATE FUNCTION languon_authorize_transcription_dispatch_fenced(job_value uuid,worker_value text,fence_value integer,token_value uuid,checksum_value text,bytes_value integer,duration_value integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.knowledge_transcription_lease_capabilities WHERE job_id=job_value AND token=token_value AND worker_id=worker_value AND fence=fence_value) THEN RAISE EXCEPTION 'Transcription dispatch requires its private lease capability' USING ERRCODE='23514'; END IF;
 RETURN public.languon_authorize_transcription_dispatch(job_value,worker_value,fence_value,checksum_value,bytes_value,duration_value);
END $$;
REVOKE ALL ON FUNCTION languon_authorize_transcription_dispatch_fenced(uuid,text,integer,uuid,text,integer,integer) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_read_transcription_audio_fenced(job_value uuid,worker_value text,fence_value integer,token_value uuid)
RETURNS TABLE(bytes bytea,mime_type text,duration_ms integer,checksum text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT a.* FROM public.languon_read_transcription_audio(job_value,worker_value,fence_value) a
 WHERE EXISTS(SELECT 1 FROM public.knowledge_transcription_lease_capabilities c WHERE c.job_id=job_value AND c.token=token_value AND c.worker_id=worker_value AND c.fence=fence_value);
$$;
REVOKE ALL ON FUNCTION languon_read_transcription_audio_fenced(uuid,text,integer,uuid) FROM PUBLIC;
