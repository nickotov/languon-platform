-- Boundary-input secrets must not become durable capabilities. Expire old shared handles/quotes.
DELETE FROM speech_quotes WHERE source->'access' ? 'shareKey';
--> statement-breakpoint
DELETE FROM speech_bindings WHERE source->'access' ? 'shareKey';
--> statement-breakpoint
ALTER TABLE speech_quotes ADD CONSTRAINT speech_quote_no_raw_share_key CHECK (NOT(source->'access' ? 'shareKey'));
--> statement-breakpoint
ALTER TABLE speech_bindings ADD CONSTRAINT speech_binding_no_raw_share_key CHECK (NOT(source->'access' ? 'shareKey'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_speech_job_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capable boolean := coalesce(current_setting('languon.speech_worker_version',true),'')='1';
BEGIN
 IF TG_OP='INSERT' THEN
   NEW.created_at := clock_timestamp();
   NEW.next_poll_at := NEW.created_at;
   NEW.billing_deadline := NEW.created_at + interval '10 minutes';
   NEW.queue_deadline := NEW.created_at + interval '2 minutes';
   NEW.recovery_deadline := NEW.created_at + interval '24 hours';
   IF NEW.state <> 'queued' AND NOT capable THEN
     RAISE EXCEPTION 'Speech worker capability required' USING ERRCODE='42501';
   END IF;
   RETURN NEW;
 END IF;
 IF (NEW.canonical_key,NEW.recording_id,NEW.credits,NEW.rate_revision_id,NEW.eligibility_revision,NEW.estimated_cost_units)
    IS DISTINCT FROM (OLD.canonical_key,OLD.recording_id,OLD.credits,OLD.rate_revision_id,OLD.eligibility_revision,OLD.estimated_cost_units) THEN
   RAISE EXCEPTION 'Immutable speech admission' USING ERRCODE='23514';
 END IF;
 IF (NEW.state,NEW.task_id,NEW.lease_token,NEW.lease_expires_at) IS DISTINCT FROM (OLD.state,OLD.task_id,OLD.lease_token,OLD.lease_expires_at)
    AND NEW.state IN ('submitting','processing','storing','ready','submission_unknown') AND NOT capable THEN
   RAISE EXCEPTION 'Speech worker capability required' USING ERRCODE='42501';
 END IF;
 IF OLD.state='queued' AND NEW.state='submitting' AND OLD.queue_deadline<=clock_timestamp() THEN
   RAISE EXCEPTION 'Speech queue deadline expired' USING ERRCODE='23514';
 END IF;
 IF OLD.billing_state <> 'reserved' AND NEW.billing_state IS DISTINCT FROM OLD.billing_state THEN
   RAISE EXCEPTION 'Closed speech billing cannot reopen' USING ERRCODE='23514';
 END IF;
 IF OLD.billing_state='reserved' AND NEW.billing_state <> 'reserved' AND NOT EXISTS (
    SELECT 1 FROM ai_credit_reservations r WHERE r.id=coalesce(OLD.reservation_id,NEW.reservation_id) AND r.state='settled'
      AND ((NEW.billing_state='charged_success' AND r.measurement='speech_success') OR
           (NEW.billing_state IN ('free','released_no_charge') AND r.charged_credits=0))
 ) THEN
   RAISE EXCEPTION 'Speech billing requires settled reservation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER speech_job_transition_guard BEFORE INSERT OR UPDATE ON speech_jobs FOR EACH ROW EXECUTE FUNCTION enforce_speech_job_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_speech_recording_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capable boolean := coalesce(current_setting('languon.speech_worker_version',true),'')='1';
DECLARE administrator boolean := has_table_privilege(current_user,'public.admin_audit_events','INSERT');
BEGIN
 IF (NEW.canonical_key,NEW.language,NEW.profile,NEW.normalization_revision,NEW.created_at) IS DISTINCT FROM
    (OLD.canonical_key,OLD.language,OLD.profile,OLD.normalization_revision,OLD.created_at) THEN
   RAISE EXCEPTION 'Immutable speech recording' USING ERRCODE='23514';
 END IF;
 IF (NEW.storage->>'backend',NEW.storage->>'namespace',NEW.storage->>'key') IS DISTINCT FROM
    (OLD.storage->>'backend',OLD.storage->>'namespace',OLD.storage->>'key') THEN
   RAISE EXCEPTION 'Immutable speech object identity' USING ERRCODE='23514';
 END IF;
 IF OLD.state='ready' AND NEW.state NOT IN ('ready','deleting') THEN
   RAISE EXCEPTION 'Retained audio requires administrative deletion' USING ERRCODE='42501';
 END IF;
 IF OLD.state='ready' AND NEW.state='deleting' AND NOT administrator THEN
   RAISE EXCEPTION 'Retained audio requires administrative deletion' USING ERRCODE='42501';
 END IF;
 IF NEW.text IS DISTINCT FROM OLD.text AND NOT (
   NEW.text='' AND (
     (NEW.state IN ('deleting','deleted') AND (administrator OR (capable AND OLD.state IN ('failed','deleting')) OR
       (capable AND OLD.state='pending' AND NOT EXISTS(SELECT 1 FROM speech_jobs j WHERE j.recording_id=OLD.id AND j.state IN('queued','submitting','processing','storing','submission_unknown')))))
     OR (capable AND OLD.state='pending' AND NEW.state='pending' AND EXISTS(SELECT 1 FROM speech_jobs j WHERE j.recording_id=OLD.id AND j.state='submission_unknown' AND j.recovery_deadline<=clock_timestamp()))
   )
 ) THEN
   RAISE EXCEPTION 'Speech text may only be scrubbed by deletion or expired uncertainty' USING ERRCODE='42501';
 END IF;
 IF OLD.state='pending' AND NEW.state='ready' THEN
   IF NOT administrator AND NOT (capable AND EXISTS(SELECT 1 FROM speech_jobs j WHERE j.recording_id=OLD.id AND j.state='storing' AND j.lease_token IS NOT NULL AND j.lease_expires_at>clock_timestamp())) THEN
     RAISE EXCEPTION 'Speech publication requires a current worker lease' USING ERRCODE='42501';
   END IF;
   NEW.ready_at := clock_timestamp();
 END IF;
 IF OLD.state='ready' AND (NEW.storage,NEW.checksum,NEW.byte_length,NEW.duration_ms,NEW.ready_at) IS DISTINCT FROM (OLD.storage,OLD.checksum,OLD.byte_length,OLD.duration_ms,OLD.ready_at) THEN
   RAISE EXCEPTION 'Published speech bytes are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER speech_recording_transition_guard BEFORE UPDATE ON speech_recordings FOR EACH ROW EXECUTE FUNCTION enforce_speech_recording_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_model_pricing_worker_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.worker_id IS DISTINCT FROM NEW.worker_id AND NEW.worker_id IS NOT NULL AND NEW.selected_execution_snapshot->'creditPricing'->>'rateRevisionId' IS NOT NULL
    AND coalesce(current_setting('languon.model_pricing_revision',true),'') <> '1' THEN
   RAISE EXCEPTION 'Model pricing worker revision required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER dictionary_model_pricing_worker_guard BEFORE UPDATE ON dictionary_generation_jobs FOR EACH ROW EXECUTE FUNCTION enforce_model_pricing_worker_revision();
--> statement-breakpoint
CREATE TRIGGER sentence_model_pricing_worker_guard BEFORE UPDATE ON sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION enforce_model_pricing_worker_revision();
