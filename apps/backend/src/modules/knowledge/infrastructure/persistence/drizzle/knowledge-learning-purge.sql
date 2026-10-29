-- Only an active, due account deletion claim can stop these private jobs.
-- The scope includes the deleted learner's jobs on foreign notes and every
-- learner's jobs on notes owned by the deleted author. No arbitrary job/outcome
-- or provider meter is accepted from the restricted account worker.
CREATE OR REPLACE FUNCTION languon_quiesce_knowledge_learning_for_purge(owner_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target record; job_value jsonb; attempt_value record; dispatched_value boolean; at_value timestamptz:=clock_timestamp();
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 PERFORM set_config('languon.text_ai_capacity_revision','1',true);
 PERFORM set_config('languon.texts_capacity_revision','1',true);
 PERFORM set_config('languon.ai_credit_settlement_revision','1',true);
 FOR target IN
  SELECT j.id,j.owner_id AS actor_id,'texts_ai_jobs'::text AS table_name
  FROM public.texts_ai_jobs j JOIN public.knowledge_text_job_sources s ON s.job_id=j.id
  JOIN public.knowledge_notes n ON n.id=s.note_id
  WHERE j.external_source_kind='knowledge-block' AND (s.actor_id=owner_value OR n.owner_id=owner_value)
    AND (j.execution_state IN ('queued','running') OR j.provider_reservation_state='active')
  UNION ALL
  SELECT j.id,j.learner_id,'sentence_ai_jobs'::text
  FROM public.sentence_ai_jobs j JOIN public.knowledge_notes n ON n.id=j.source_note_id
  WHERE j.source_kind='knowledge-vocabulary' AND (j.learner_id=owner_value OR n.owner_id=owner_value)
    AND (j.execution_state IN ('queued','running') OR j.provider_reservation_state='active')
  ORDER BY actor_id,id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(target.actor_id::text,1920424381));
  PERFORM pg_advisory_xact_lock(1920424395);
  EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',target.table_name) INTO job_value USING target.id;
  IF job_value->>'execution_state' NOT IN ('queued','running') THEN
   RAISE EXCEPTION 'Terminal knowledge work must already have settled provider accounting' USING ERRCODE='23514';
  END IF;
  IF job_value->'selected_execution_snapshot'->>'actionAccountingVersion' IS DISTINCT FROM '1'
     OR job_value->'selected_execution_snapshot' ? 'actionParentId'
     OR NOT EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=target.id AND owner_id=target.actor_id AND state='active') THEN
   RAISE EXCEPTION 'Knowledge purge requires its independently admitted action' USING ERRCODE='23514';
  END IF;
  FOR attempt_value IN SELECT id FROM public.ai_credit_action_attempts WHERE action_id=target.id AND state='dispatched' ORDER BY ordinal FOR UPDATE LOOP
   -- Unknown in-flight consumption remains a conservative operator expense;
   -- revocation never charges the learner for an unusable result.
   PERFORM public.languon_settle_text_provider_attempt(attempt_value.id,false,NULL,NULL,NULL,NULL,at_value);
  END LOOP;
  dispatched_value:=job_value->>'ai_credit_provider_dispatched_at' IS NOT NULL;
  EXECUTE format('UPDATE public.%I SET execution_state=''cancelled'',worker_id=NULL,lease_deadline=NULL,heartbeat_at=NULL,fencing_token=fencing_token+1,cancellation_requested_at=$2,failure_category=''access_revoked'',completed_at=$2,updated_at=$2,
    provider_reservation_state=CASE WHEN $3 OR coalesce(provider_actual_cost_micros,0)>0 THEN ''settled'' ELSE ''released'' END,
    provider_reservation_settled_at=$2,
    provider_actual_input_tokens=coalesce(provider_actual_input_tokens,0)+CASE WHEN $3 THEN provider_max_input_tokens_per_attempt ELSE 0 END,
    provider_actual_output_tokens=coalesce(provider_actual_output_tokens,0)+CASE WHEN $3 THEN provider_max_output_tokens_per_attempt ELSE 0 END,
    provider_actual_cost_micros=coalesce(provider_actual_cost_micros,0)+CASE WHEN $3 THEN provider_max_cost_micros_per_attempt ELSE 0 END WHERE id=$1',target.table_name)
    USING target.id,at_value,dispatched_value;
  PERFORM public.languon_settle_credit_action(target.id,'failure',at_value);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION languon_quiesce_knowledge_learning_for_purge(uuid,text,integer) FROM PUBLIC;
