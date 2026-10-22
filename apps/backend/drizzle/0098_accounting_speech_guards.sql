-- Speech keeps its success-only customer hold, but every new clip has independent USD authorization.
CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.accounting_version,NEW.provider_price_snapshot,NEW.provider_character_count)
      IS DISTINCT FROM (OLD.accounting_version,OLD.provider_price_snapshot,OLD.provider_character_count) THEN
    RAISE EXCEPTION 'Speech provider accounting admission is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.provider_dispatched_at IS NOT NULL AND NEW.provider_dispatched_at IS DISTINCT FROM OLD.provider_dispatched_at THEN
    RAISE EXCEPTION 'Speech provider dispatch identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER speech_accounting_snapshot_guard BEFORE UPDATE ON speech_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_snapshot();

CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
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
CREATE CONSTRAINT TRIGGER speech_accounting_authority_guard AFTER INSERT OR UPDATE ON speech_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_authority();

-- The purge principal may close anonymous numerical authorizations, without gaining financial JSON reads.
CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,76021941));
  PERFORM 1 FROM public.users u JOIN public.account_deletion_requests r ON r.user_id=u.id
    WHERE u.id=owner_id_value AND u.status='deletion_pending' AND r.state='running'
      AND r.purge_at<=clock_timestamp() AND r.lease_deadline>clock_timestamp() FOR UPDATE OF r,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Speech accounting purge requires an active due deletion lease' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381));
  PERFORM pg_advisory_xact_lock(1920424395);
  FOR j IN SELECT s.* FROM public.speech_jobs s JOIN public.ai_operator_action_budgets b ON b.action_id=s.id WHERE s.payer_id=owner_id_value AND s.accounting_version=1 AND b.state='active' ORDER BY s.id FOR UPDATE OF s LOOP
    IF j.provider_dispatched_at IS NOT NULL THEN
      INSERT INTO public.ai_provider_expense_records(id,attempt_reference,action_id,cost_source,provider_id,model_id,measurement,amount_usd_micros,occurred_at)
        VALUES(gen_random_uuid(),'speech:'||j.id::text,j.id,'unknown',j.provider_price_snapshot->>'providerId',j.provider_price_snapshot->>'modelId','unknown',null,j.provider_dispatched_at) ON CONFLICT(attempt_reference) DO NOTHING;
      UPDATE public.ai_operator_attempt_costs SET consumed_micros=reserved_micros,measurement='conservative',settled_at=clock_timestamp() WHERE action_id=j.id AND settled_at IS NULL;
    END IF;
    UPDATE public.ai_operator_action_budgets b SET state='settled',consumed_micros=(SELECT coalesce(sum(a.consumed_micros),0) FROM public.ai_operator_attempt_costs a WHERE a.action_id=j.id),settled_at=clock_timestamp() WHERE b.action_id=j.id;
  END LOOP;
  PERFORM set_config('languon.speech_worker_version','1',true);
  WITH cancelled AS (
    UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=null,lease_expires_at=null
      WHERE payer_id=owner_id_value AND state='queued' RETURNING recording_id
  ) UPDATE public.speech_recordings r SET state='deleting',text='',version=version+1
      WHERE r.state='pending' AND EXISTS(SELECT 1 FROM cancelled c WHERE c.recording_id=r.id);
  DELETE FROM public.speech_daily_admission_counters WHERE scope='owner:'||owner_id_value::text;
  PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid) FROM PUBLIC;
