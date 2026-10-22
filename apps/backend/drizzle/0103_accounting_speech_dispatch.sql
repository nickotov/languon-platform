-- Forward-only checked paid speech dispatch marker.
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql
-- SHA256: b93dda1f4ad937c01e55b58567b165861482a99815bb6562a45214b448de43c2
CREATE OR REPLACE FUNCTION languon_admit_speech_provider_attempt(job_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; maximum_value bigint;
BEGIN
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.state<>'queued' OR j.provider_dispatched_at IS NOT NULL OR j.queue_deadline<=clock_timestamp() OR j.billing_deadline<=clock_timestamp() OR j.payer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.payer_id AND status='active') THEN RAISE EXCEPTION 'Speech dispatch requires its prepared queued job' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.payer_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF p.id IS NULL OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.meter<>'speech-characters' OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId' OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId' OR p.effective_at>j.created_at THEN RAISE EXCEPTION 'Speech reviewed rate is missing' USING ERRCODE='23514'; END IF;
 maximum_value:=ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint;
 IF maximum_value IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE action_id=j.id AND owner_id=j.payer_id AND state='active' AND reserved_micros>=maximum_value) THEN RAISE EXCEPTION 'Speech operator authorization is missing' USING ERRCODE='23514'; END IF;
 IF j.reservation_id IS NOT NULL THEN
  UPDATE public.ai_credit_reservations SET dispatched_at=coalesce(dispatched_at,clock_timestamp())
    WHERE id=j.reservation_id AND job_id=j.id AND job_kind='speech-generation' AND owner_id=j.payer_id AND state='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Speech dispatch requires its existing customer authorization' USING ERRCODE='23514'; END IF;
 ELSIF j.billing_state='reserved' THEN RAISE EXCEPTION 'Paid speech has no customer authorization' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(j.id,j.id,maximum_value,clock_timestamp());
END $$;
