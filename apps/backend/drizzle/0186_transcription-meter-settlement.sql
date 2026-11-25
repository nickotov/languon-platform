-- Restore audio meter identity and immutable dimensions in the shared attempt guard.
-- The attempt/output limits retain bounded known-rejection handling for text generation.
CREATE OR REPLACE FUNCTION ai_credit_action_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE;
DECLARE count_calls integer;
DECLARE output_used bigint;
BEGIN
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.actual_cost_micros IS NOT DISTINCT FROM ((CASE WHEN OLD.usage_meter='audio-duration' THEN public.languon_transcription_provider_expense_identity(OLD.id) ELSE public.languon_text_provider_expense_identity(OLD.id) END)->>'amountUsdMicros')::bigint
     AND (to_jsonb(NEW)-'actual_cost_micros')=(to_jsonb(OLD)-'actual_cost_micros') THEN RETURN NEW; END IF;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider dispatch requires active action authorization'; END IF;
  IF NEW.usage_meter IS DISTINCT FROM action_row.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM action_row.audio_input_limit_milliseconds THEN RAISE EXCEPTION 'Attempt dimensions must match the parent action'; END IF;
  IF NEW.usage_meter='audio-duration' AND (NEW.input_tokens IS NOT NULL OR NEW.output_tokens IS NOT NULL OR NEW.input_limit<>0 OR NEW.output_limit<>0) THEN RAISE EXCEPTION 'Duration observations cannot be interpreted as tokens'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'dispatched' OR NEW.state<>'settled' OR
      NEW.id<>OLD.id OR NEW.action_id<>OLD.action_id OR NEW.execution_job_id IS DISTINCT FROM OLD.execution_job_id OR NEW.ordinal<>OLD.ordinal OR NEW.purpose<>OLD.purpose
      OR NEW.usage_meter IS DISTINCT FROM OLD.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM OLD.audio_input_limit_milliseconds OR NEW.input_limit<>OLD.input_limit OR NEW.output_limit<>OLD.output_limit OR NEW.budget<>OLD.budget
      OR NEW.reserved_cost_micros<>OLD.reserved_cost_micros OR NEW.created_at<>OLD.created_at OR NEW.provider_dispatch_witness IS DISTINCT FROM OLD.provider_dispatch_witness THEN
      RAISE EXCEPTION 'Provider attempt identity and final usage are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs o JOIN public.ai_operator_action_budgets a ON a.action_id=o.action_id
    WHERE o.attempt_id=NEW.id AND o.action_id=NEW.action_id AND a.state='active' AND o.settled_at IS NULL AND o.reserved_micros>=NEW.reserved_cost_micros) THEN
    RAISE EXCEPTION 'Provider dispatch requires acknowledged operator cost authorization';
  END IF;
  IF NEW.created_at>=action_row.deadline_at OR NEW.state<>'dispatched' OR NEW.input_tokens IS NOT NULL OR NEW.output_tokens IS NOT NULL THEN
    RAISE EXCEPTION 'Provider dispatch is outside admitted execution';
  END IF;
  IF action_row.funding='customer' AND
    (SELECT coalesce(sum(allocated_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.action_id)<>action_row.held_milli THEN
    RAISE EXCEPTION 'Provider dispatch requires fully allocated action hold';
  END IF;
  SELECT count(*),coalesce(sum(coalesce(output_tokens,CASE WHEN EXISTS(SELECT 1 FROM public.text_ai_route_health_events rejection WHERE rejection.attempt_id=ai_credit_action_attempts.id AND rejection.reason IN ('authorization_failed','provider_credits_exhausted','rate_limited','model_retired','model_unavailable')) THEN 0 ELSE output_limit END)),0) INTO count_calls,output_used
    FROM public.ai_credit_action_attempts WHERE action_id=NEW.action_id;
  IF NEW.ordinal<>count_calls+1 OR count_calls>=5 OR output_used+NEW.output_limit>action_row.output_limit THEN
    RAISE EXCEPTION 'Provider dispatch exceeds admitted action limits';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_finish_transcription(job_value uuid,worker_value text,fence_value integer,token_value uuid,result_value jsonb,failure_value text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; t public.ai_credit_action_attempts%ROWTYPE; owner_value uuid; instant_value timestamptz; duration_value bigint; reported_seconds numeric; succeeded boolean:=false; stopped boolean; outcome_value text;
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
   IF jsonb_typeof(result_value->'usage') IS DISTINCT FROM 'object' OR (result_value->'usage')-ARRAY['type','seconds']<>'{}'::jsonb OR result_value->'usage'->>'type' IS DISTINCT FROM 'duration' OR jsonb_typeof(result_value->'usage'->'seconds') IS DISTINCT FROM 'number' OR (result_value->'usage'->>'seconds')::numeric<0 THEN RAISE EXCEPTION 'Invalid duration observation' USING ERRCODE='23514'; END IF;
   reported_seconds := (result_value->'usage'->>'seconds')::numeric;
   -- Only exact, safe integer milliseconds are evidence of operator usage.
   -- A valid transcript can still be published when its duration is unknown.
   IF reported_seconds <= 9007199254740.991 AND trunc(reported_seconds, 3) = reported_seconds THEN
    duration_value := (reported_seconds * 1000)::bigint;
   END IF;
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
