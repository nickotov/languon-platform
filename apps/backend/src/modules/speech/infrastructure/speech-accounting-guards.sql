-- Speech keeps its success-only customer hold, but every new clip has independent USD authorization.
CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.accounting_version,NEW.provider_price_snapshot,NEW.provider_character_count)
      IS DISTINCT FROM (OLD.accounting_version,OLD.provider_price_snapshot,OLD.provider_character_count) THEN
    RAISE EXCEPTION 'Speech provider accounting admission is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.provider_outcome IS NOT NULL AND NEW.provider_outcome IS DISTINCT FROM OLD.provider_outcome THEN RAISE EXCEPTION 'Speech provider outcome is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.provider_dispatched_at IS NOT NULL AND NEW.provider_dispatched_at IS DISTINCT FROM OLD.provider_dispatched_at THEN
    RAISE EXCEPTION 'Speech provider dispatch identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS speech_accounting_snapshot_guard ON speech_jobs;
CREATE TRIGGER speech_accounting_snapshot_guard BEFORE UPDATE ON speech_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_snapshot();

CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.speech_jobs WHERE id=NEW.id;
  IF NOT FOUND OR j.accounting_version<>1 THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id) THEN
    RAISE EXCEPTION 'Speech requires shared operator authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs a WHERE a.action_id=j.id AND a.attempt_id=j.id) THEN
    RAISE EXCEPTION 'Speech dispatch requires provider attempt authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('ready','failed','submission_unknown') THEN
    IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id AND b.state='settled') THEN
      RAISE EXCEPTION 'Terminal speech requires settled operator accounting' USING ERRCODE='23514';
    END IF;
    IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_provider_expense_records e WHERE e.action_id=j.id AND e.attempt_reference='speech:'||j.id::text) THEN
      RAISE EXCEPTION 'Terminal speech requires a provider expense fact' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS speech_accounting_authority_guard ON speech_jobs;
CREATE CONSTRAINT TRIGGER speech_accounting_authority_guard AFTER INSERT OR UPDATE ON speech_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_authority();

CREATE OR REPLACE FUNCTION languon_speech_provider_expense_identity(job_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; amount_value bigint;
BEGIN
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR j.provider_outcome IS NULL OR p.id IS NULL OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId' OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId' OR p.meter<>'speech-characters' OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.effective_at>j.created_at OR p.data->>'usdPer1000Characters' IS DISTINCT FROM j.provider_price_snapshot->>'usdPer1000Characters' THEN RAISE EXCEPTION 'Speech expense requires its dispatched reviewed provenance' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome='ready' THEN amount_value:=greatest(ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint,ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint);
 ELSIF j.provider_outcome='not_submitted' THEN amount_value:=0;
 ELSIF j.provider_outcome<>'unknown' THEN RAISE EXCEPTION 'Unknown speech provider outcome' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('sourceKind','speech-attempt','attemptReference','speech:'||j.id::text,'actionId',j.id,'providerId',p.provider_id,'modelId',p.model_id,'measurement',CASE j.provider_outcome WHEN 'ready' THEN 'estimated' WHEN 'not_submitted' THEN 'measured' ELSE 'unknown' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',j.provider_dispatched_at);
END $$;
REVOKE ALL ON FUNCTION languon_speech_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_speech_provider_expense(job_value uuid,outcome_value text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; e jsonb; f public.ai_provider_expense_records%ROWTYPE; o public.ai_operator_attempt_costs%ROWTYPE; b public.ai_operator_action_budgets%ROWTYPE; owner_value uuid; amount_value bigint;
BEGIN
 SELECT payer_id INTO owner_value FROM public.speech_jobs WHERE id=job_value;
 IF owner_value IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); END IF;
 PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NOT NULL AND j.accounting_version=1 AND j.provider_dispatched_at IS NULL AND outcome_value='not_submitted' AND (j.queue_deadline<=clock_timestamp() OR public.languon_operator_purge_authorized(j.payer_id)) THEN
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
   IF o.attempt_id IS NULL OR (amount_value IS NOT NULL AND amount_value>o.reserved_micros) THEN RAISE EXCEPTION 'Speech observation exceeds provider authorization' USING ERRCODE='23514'; END IF;
   IF o.settled_at IS NULL THEN UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(amount_value,reserved_micros),measurement=CASE WHEN amount_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=clock_timestamp() WHERE attempt_id=job_value;
   ELSIF o.consumed_micros IS DISTINCT FROM coalesce(amount_value,o.reserved_micros) THEN RAISE EXCEPTION 'Speech operator amount conflicts with provider fact' USING ERRCODE='23514'; END IF;
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=(SELECT coalesce(sum(consumed_micros),0) FROM public.ai_operator_attempt_costs WHERE action_id=job_value),settled_at=clock_timestamp() WHERE action_id=job_value;
 END IF;
 PERFORM public.languon_mark_accounting_reports_dirty();
 RETURN f.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_speech_provider_expense(uuid,text) FROM PUBLIC;

-- Retired owner-only entry is never an unfenced privilege escalation.
CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Speech purge requires its expected worker and fencing token' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_id_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended('actor:'||owner_id_value::text,1920424383));
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT s.* FROM public.speech_jobs s JOIN public.ai_operator_action_budgets b ON b.action_id=s.id WHERE s.payer_id=owner_id_value AND s.accounting_version=1 AND b.state='active' ORDER BY s.id FOR UPDATE OF s LOOP
   IF j.provider_dispatched_at IS NOT NULL THEN PERFORM public.languon_record_speech_provider_expense(j.id,coalesce(j.provider_outcome,'unknown'));
   ELSE UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id; END IF;
 END LOOP;
 PERFORM set_config('languon.speech_worker_version','1',true);
 WITH cancelled AS (UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=null,lease_expires_at=null WHERE payer_id=owner_id_value AND state='queued' RETURNING recording_id)
 UPDATE public.speech_recordings r SET state='deleting',text='',version=version+1 WHERE r.state='pending' AND EXISTS(SELECT 1 FROM cancelled c WHERE c.recording_id=r.id);
 FOR j IN SELECT s.* FROM public.speech_jobs s WHERE s.payer_id=owner_id_value ORDER BY s.id FOR UPDATE LOOP
   IF j.reservation_id IS NOT NULL AND j.billing_state='reserved' THEN PERFORM public.languon_settle_speech_customer(j.reservation_id,'failure'); END IF;
   UPDATE public.speech_jobs SET payer_id=NULL,reservation_id=NULL,billing_state=CASE WHEN billing_state='reserved' THEN 'released_no_charge' ELSE billing_state END WHERE id=j.id;
 END LOOP;
 DELETE FROM public.speech_quotes WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_bindings WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_daily_admission_counters WHERE scope='owner:'||owner_id_value::text;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid,text,integer) FROM PUBLIC;

-- API scheduling cancellation precedes the due purge lease. Dispatch remains
-- admitted: leave its owner, usage and USD authorization for the normal worker.
CREATE OR REPLACE FUNCTION languon_cancel_speech_for_scheduled_deletion(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,76021941));
 PERFORM 1 FROM public.users u JOIN public.account_deletion_requests d ON d.user_id=u.id WHERE u.id=owner_id_value AND u.status='deletion_pending' AND d.state='pending' AND d.scheduled_at<=clock_timestamp() FOR UPDATE OF u,d;
 IF NOT FOUND THEN RAISE EXCEPTION 'Speech scheduling cancellation requires its newly scheduled inactive account' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('actor:'||owner_id_value::text,1920424383));
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 PERFORM set_config('languon.speech_worker_version','1',true);
 FOR j IN SELECT * FROM public.speech_jobs WHERE payer_id=owner_id_value AND state='queued' AND provider_dispatched_at IS NULL ORDER BY id FOR UPDATE LOOP
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id AND state='active';
   UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=NULL,lease_expires_at=NULL WHERE id=j.id;
   UPDATE public.speech_recordings SET state='deleting',text='',version=version+1 WHERE id=j.recording_id AND state='pending';
   IF j.reservation_id IS NOT NULL AND j.billing_state='reserved' THEN PERFORM public.languon_settle_speech_customer(j.reservation_id,'failure'); END IF;
   UPDATE public.speech_jobs SET payer_id=NULL,reservation_id=NULL,billing_state=CASE WHEN billing_state='reserved' THEN 'released_no_charge' ELSE billing_state END WHERE id=j.id;
 END LOOP;
 DELETE FROM public.speech_quotes WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_bindings WHERE actor_id=owner_id_value;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_cancel_speech_for_scheduled_deletion(uuid) FROM PUBLIC;

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
