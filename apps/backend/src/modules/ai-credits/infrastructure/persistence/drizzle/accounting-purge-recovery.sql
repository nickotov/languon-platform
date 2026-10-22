-- Purge credentials can observe no arbitrary usage, choose no outcome, and
-- recover only the terminal interview belonging to their current deletion claim.
CREATE OR REPLACE FUNCTION languon_recover_purge_interview_action(owner_value uuid,worker_value text,fence_value integer,operation_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE; operation_row public.learner_portrait_interview_operations%ROWTYPE; attempt_row record; outcome_value text;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=operation_value AND owner_id=owner_value FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.ai_action_charging_policies WHERE job_id=operation_value AND owner_id=owner_value AND job_kind='portrait-interview') THEN RAISE EXCEPTION 'Purge recovery requires its owned admitted interview action' USING ERRCODE='23514'; END IF;
 SELECT * INTO operation_row FROM public.learner_portrait_interview_operations WHERE id=operation_value AND owner_id=owner_value FOR UPDATE;
 IF NOT FOUND OR operation_row.state IN ('queued','running') OR operation_row.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Purge recovery requires a terminal unfenced interview' USING ERRCODE='23514'; END IF;
 outcome_value:=public.languon_ai_credit_expected_outcome(public.languon_ai_credit_feature_authority(operation_value,'portrait-interview'));
 IF outcome_value IS NULL OR outcome_value NOT IN ('success','stopped','failure') THEN RAISE EXCEPTION 'Purge recovery has no authoritative terminal outcome' USING ERRCODE='23514'; END IF;
 IF action_row.state='settled' THEN RETURN; END IF;
 FOR attempt_row IN SELECT id FROM public.ai_credit_action_attempts WHERE action_id=operation_value AND state='dispatched' ORDER BY ordinal FOR UPDATE LOOP
   PERFORM public.languon_settle_text_provider_attempt(attempt_row.id,false,NULL,NULL,NULL,NULL,clock_timestamp());
 END LOOP;
 PERFORM public.languon_settle_credit_action(operation_value,outcome_value,clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION languon_recover_purge_interview_action(uuid,text,integer,uuid) FROM PUBLIC;
