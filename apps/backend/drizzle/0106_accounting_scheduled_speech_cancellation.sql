-- Source: apps/backend/src/modules/speech/infrastructure/speech-accounting-guards.sql
-- SHA256: de7141736cb5365861389967e89da5e844d307fddd00d0e4564211e4a4731ea3
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
