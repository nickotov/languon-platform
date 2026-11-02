-- Engineering review of fixed OpenAI multipart transcription only.
-- Source checked 2026-10-29: https://developers.openai.com/api/docs/guides/your-data.md
-- SHA25616e953514150dd5cbf2c599868ca14253c3b8d78cd7268e950a6f665418565ed
-- Endpoint table: trainingNo unlessorganizationoptsin; abuse/appstate retentionNone; ZDReligibleonly.
-- Global endpoint has no regional guarantee; no DPA/legal/provider approval is claimed.
CREATE OR REPLACE FUNCTION languon_approved_transcription_processing_revision() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 'openai-audio-transcriptions:2026-10-29'::text $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_approved_transcription_processing_revision() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_authorize_transcription_dispatch(job_value uuid, worker_value text, fence_value integer, checksum_value text, bytes_value integer, duration_value integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; a public.ai_credit_actions%ROWTYPE; c public.knowledge_transcription_config_revisions%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; m record; evaluated jsonb; instant_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); call_value uuid:=gen_random_uuid(); attempt_value uuid:=gen_random_uuid(); reserved_value bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Transcription job is unavailable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.owner_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=j.id FOR UPDATE;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 instant_value:=date_trunc('milliseconds',clock_timestamp());
 IF worker_value IS NULL OR fence_value IS NULL OR j.lease_deadline IS NULL OR j.state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=instant_value OR j.deadline_at<=instant_value OR j.cancellation_requested_at IS NOT NULL OR j.dispatched_at IS NOT NULL OR a.id IS NULL OR a.state<>'active' OR a.deadline_at<=instant_value OR a.usage_meter<>'audio-duration' OR a.audio_input_limit_milliseconds IS DISTINCT FROM j.source_duration_ms OR a.output_limit<>0 THEN RAISE EXCEPTION 'Transcription requires its original active duration allowance and live lease' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dictionary_ai_worker_observations WHERE worker_id=worker_value AND provider_id='openai' AND model_id='gpt-transcribe' AND adapter_revision='knowledge-transcription:v1' AND status='available' AND expires_at>instant_value AND text_ai_supported_formats @> '["knowledge-transcription:v1"]'::jsonb) THEN RAISE EXCEPTION 'A live compatible transcription executor is required' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.users WHERE id=j.owner_id AND status='active' FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'Transcription owner is unavailable' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.knowledge_notes WHERE id=j.note_id AND owner_id=j.owner_id FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'Transcription source is unavailable' USING ERRCODE='23514'; END IF;
 IF a.funding='customer' AND a.held_milli<j.maximum_credits_milli THEN RAISE EXCEPTION 'Transcription requires its complete customer hold' USING ERRCODE='23514'; END IF;
 SELECT b.checksum,octet_length(b.bytes) AS bytes,b.duration_ms INTO m FROM public.knowledge_media_assets g JOIN public.knowledge_media_blobs b ON b.id=g.blob_id WHERE g.id=j.asset_id AND g.note_id=j.note_id;
 IF NOT FOUND OR m.checksum IS DISTINCT FROM j.checksum OR checksum_value IS DISTINCT FROM j.checksum OR bytes_value IS DISTINCT FROM j.byte_length OR duration_value IS DISTINCT FROM j.source_duration_ms OR m.bytes IS DISTINCT FROM j.byte_length OR m.duration_ms IS DISTINCT FROM j.source_duration_ms THEN RAISE EXCEPTION 'Transcription input no longer matches its verified immutable source' USING ERRCODE='23514'; END IF;
 SELECT r.* INTO c FROM public.knowledge_transcription_state s JOIN public.knowledge_transcription_config_revisions r ON r.id=s.active_revision_id WHERE s.id='global' FOR SHARE OF s;
 IF c.processing_controls_revision IS NULL OR c.processing_controls_revision IS DISTINCT FROM j.processing_controls_revision OR c.processing_controls_revision IS DISTINCT FROM public.languon_approved_transcription_processing_revision() THEN RAISE EXCEPTION 'Private audio processing has not been approved for this release' USING ERRCODE='23514'; END IF;
 IF NOT c.data_sharing_disabled OR c.data_sharing_evidence IS NULL OR c.data_sharing_attested_at IS NULL OR c.data_sharing_attested_at+interval '30 days'<=instant_value OR c.processing_credential_fingerprint IS NULL OR c.processing_credential_fingerprint IS DISTINCT FROM j.processing_credential_fingerprint THEN RAISE EXCEPTION 'Current credential-bound organization data sharing attestation is required' USING ERRCODE='23514'; END IF;
 IF c.id IS DISTINCT FROM j.configuration_revision_id OR NOT c.enabled OR NOT c.billing_rules_verified OR c.billing_evidence IS NULL OR c.credits_per_minute IS NULL OR c.maximum_bytes<j.byte_length OR c.maximum_duration_ms<j.source_duration_ms OR a.tariff->>'audioCreditsPerMinute' IS DISTINCT FROM c.credits_per_minute THEN RAISE EXCEPTION 'Transcription configuration is not ready or changed' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=c.provider_price_revision_id;
 IF p.id IS NULL OR p.id IS DISTINCT FROM (j.provider_price_snapshot->>'id')::uuid OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.data->'nativeRules' IS DISTINCT FROM j.provider_price_snapshot->'nativeRules' OR p.provider_id<>'openai' OR p.model_id<>'gpt-transcribe' OR p.meter<>'audio-duration' OR NOT (p.data ? 'nativeRules') OR NOT public.languon_native_meter_compatible(p.data,'audio-duration') OR p.effective_at>j.created_at THEN RAISE EXCEPTION 'Transcription native price pin is unavailable' USING ERRCODE='23514'; END IF;
 evaluated:=public.languon_evaluate_provider_price(p.data,jsonb_build_object('endpointId','/v1/audio/transcriptions','dispatchedAt',to_char(instant_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'latestDispatchAt',to_char(date_trunc('milliseconds',a.deadline_at-interval '1 microsecond') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),jsonb_build_object('audioInputMilliseconds',j.source_duration_ms,'requests',1),'upper-bound');
 IF evaluated->>'status'<>'calculated' THEN RAISE EXCEPTION 'Transcription has no reviewed finite provider bound' USING ERRCODE='23514'; END IF;
 reserved_value:=(evaluated->>'amountUsdMicros')::bigint;
 IF reserved_value>c.maximum_provider_cost_micros OR NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE action_id=j.id AND state='active' AND reserved_micros>=reserved_value) OR EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=j.id) THEN RAISE EXCEPTION 'Transcription operational allowance is unavailable' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(attempt_id,action_id,reserved_micros,created_at) VALUES(attempt_value,j.id,reserved_value,instant_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,usage_meter,audio_input_limit_milliseconds,created_at,provider_dispatch_witness) VALUES(attempt_value,j.id,j.id,1,'answer','dispatched',jsonb_build_object('usageMeter','audio-duration','audioInputLimitMilliseconds',j.source_duration_ms,'maxCostMicrosPerAttempt',reserved_value),reserved_value,0,0,'audio-duration',j.source_duration_ms,instant_value,jsonb_build_object('jobId',j.id,'worker',worker_value,'fence',fence_value::text,'processingCredentialFingerprint',j.processing_credential_fingerprint));
 INSERT INTO public.ai_credit_native_call_dispatches(id,attempt_id,ordinal,input_limit,output_limit,call_kind,audio_input_limit_milliseconds,dispatched_at) VALUES(call_value,attempt_value,1,0,0,'audio-transcription',j.source_duration_ms,instant_value);
 UPDATE public.knowledge_transcription_jobs SET receipt_id=call_value,attempt_id=attempt_value,dispatched_at=instant_value,updated_at=instant_value WHERE id=j.id;
 RETURN jsonb_build_object('receiptId',call_value,'operationId',j.id,'noteId',j.note_id,'assetId',j.asset_id,'checksum',j.checksum,'providerId','openai','modelId','gpt-transcribe','providerPriceRevisionId',p.id,'customerTariffRevisionId',c.id,'processingControlsRevision',j.processing_controls_revision,'processingCredentialFingerprint',j.processing_credential_fingerprint,'usageMeter','audioInputMilliseconds','maximumBytes',j.byte_length,'maximumDurationMs',j.source_duration_ms,'expiresAt',to_char(least(j.lease_deadline,j.deadline_at,a.deadline_at,c.data_sharing_attested_at+interval '30 days') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;
REVOKE ALL ON FUNCTION languon_authorize_transcription_dispatch(uuid,text,integer,text,integer,integer) FROM PUBLIC;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_guard_transcription_processing_pin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.knowledge_transcription_config_revisions%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.knowledge_transcription_config_revisions WHERE id=NEW.configuration_revision_id;
 IF NEW.processing_controls_revision IS DISTINCT FROM c.processing_controls_revision OR NEW.processing_credential_fingerprint IS DISTINCT FROM c.processing_credential_fingerprint THEN
  RAISE EXCEPTION 'Transcription processing and credential pins must match their immutable configuration' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_guard_transcription_processing_pin() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_authorize_transcription_dispatch_fenced(job_value uuid,worker_value text,fence_value integer,token_value uuid,checksum_value text,bytes_value integer,duration_value integer,credential_fingerprint_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.knowledge_transcription_lease_capabilities WHERE job_id=job_value AND token=token_value AND worker_id=worker_value AND fence=fence_value) THEN RAISE EXCEPTION 'Transcription dispatch requires its private lease capability' USING ERRCODE='23514'; END IF;
 IF credential_fingerprint_value IS NULL OR NOT EXISTS(SELECT 1 FROM public.knowledge_transcription_jobs j JOIN public.knowledge_transcription_config_revisions c ON c.id=j.configuration_revision_id WHERE j.id=job_value AND j.processing_credential_fingerprint=credential_fingerprint_value AND c.processing_credential_fingerprint=credential_fingerprint_value AND c.data_sharing_disabled AND c.data_sharing_attested_at+interval '30 days'>clock_timestamp()) THEN RAISE EXCEPTION 'Transcription worker credentials differ from the organization attestation or it expired' USING ERRCODE='23514'; END IF;
 RETURN public.languon_authorize_transcription_dispatch(job_value,worker_value,fence_value,checksum_value,bytes_value,duration_value);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_authorize_transcription_dispatch_fenced(uuid,text,integer,uuid,text,integer,integer,text) FROM PUBLIC;
--> statement-breakpoint
-- Old installations cannot dispatch without supplying the current worker credential pin.
CREATE OR REPLACE FUNCTION languon_authorize_transcription_dispatch_fenced(job_value uuid,worker_value text,fence_value integer,token_value uuid,checksum_value text,bytes_value integer,duration_value integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Current transcription worker credential binding is required' USING ERRCODE='23514'; END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_authorize_transcription_dispatch_fenced(uuid,text,integer,uuid,text,integer,integer) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_guard_transcription_account_attestation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.data_sharing_disabled AND (NEW.data_sharing_evidence IS NULL OR char_length(NEW.data_sharing_evidence) NOT BETWEEN 5 AND 2000 OR NEW.data_sharing_attested_at IS NULL OR NEW.processing_credential_fingerprint IS NULL OR NEW.processing_credential_fingerprint !~ '^[a-f0-9]{64}$' OR NEW.data_sharing_attested_at IS DISTINCT FROM NEW.created_at) THEN RAISE EXCEPTION 'Organization data sharing attestation needs credential binding, timestamp and evidence' USING ERRCODE='23514'; END IF;
 IF NOT NEW.data_sharing_disabled AND (NEW.processing_credential_fingerprint IS NOT NULL OR NEW.data_sharing_attested_at IS NOT NULL) THEN RAISE EXCEPTION 'Unattested transcription configuration cannot retain credential approval' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_guard_transcription_account_attestation() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER knowledge_transcription_account_attestation BEFORE INSERT ON public.knowledge_transcription_config_revisions FOR EACH ROW EXECUTE FUNCTION languon_guard_transcription_account_attestation();
