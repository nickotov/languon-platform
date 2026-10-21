-- Existing work may drain on old binaries. New admission/claim/reservation work
-- must count conversation calls until their rolling numerical usage ages out.
CREATE OR REPLACE FUNCTION enforce_shared_text_ai_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  increases boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    increases := NEW.execution_state IN ('queued','running') OR NEW.provider_reservation_state = 'active';
  ELSE
    increases :=
      (NEW.execution_state IN ('queued','running') AND OLD.execution_state NOT IN ('queued','running'))
      OR (NEW.execution_state = 'running' AND
          (OLD.execution_state <> 'running' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id OR NEW.fencing_token > OLD.fencing_token))
      OR (NEW.provider_reservation_state = 'active' AND
          (OLD.provider_reservation_state <> 'active'
           OR NEW.provider_reserved_cost_micros > OLD.provider_reserved_cost_micros
           OR NEW.provider_reserved_input_tokens > OLD.provider_reserved_input_tokens
           OR NEW.provider_reserved_output_tokens > OLD.provider_reserved_output_tokens
           OR coalesce((to_jsonb(NEW)->>'provider_reserved_attempts')::integer,0) > coalesce((to_jsonb(OLD)->>'provider_reserved_attempts')::integer,0)));
  END IF;
  IF NOT increases THEN RETURN NEW; END IF;
  -- Acquiring before reading overlap serializes old admission-first and sentence-first orders.
  PERFORM pg_advisory_xact_lock(4312189072);
  IF current_setting('languon.text_ai_capacity_revision', true) IS DISTINCT FROM '1'
     AND EXISTS (
       SELECT 1 FROM sentence_ai_jobs WHERE execution_state IN ('queued','running')
          OR provider_reservation_state = 'active'
          OR (provider_reservation_state='settled' AND provider_reservation_settled_at > now()-interval '24 hours'
              AND (provider_actual_cost_micros > 0 OR provider_actual_input_tokens > 0 OR provider_actual_output_tokens > 0))
       UNION ALL
       SELECT 1 FROM dictionary_generation_provider_usage_archive
         WHERE job_kind IN ('sentence-generation','sentence-check')
          AND settled_at > now()-interval '24 hours'
          AND (actual_cost_micros > 0 OR actual_input_tokens > 0 OR actual_output_tokens > 0)
     ) THEN
    RAISE EXCEPTION 'Shared text AI capacity capability is required during sentence usage overlap' USING ERRCODE='55000';
  END IF;
  IF current_setting('languon.texts_capacity_revision',true) IS DISTINCT FROM '1' AND EXISTS (
       SELECT 1 FROM texts_ai_jobs WHERE execution_state IN ('queued','running') OR provider_reservation_state='active'
         OR (provider_reservation_settled_at>now()-interval '24 hours' AND (provider_actual_cost_micros>0 OR provider_actual_input_tokens>0 OR provider_actual_output_tokens>0))
       UNION ALL SELECT 1 FROM dictionary_text_selection_jobs WHERE execution_state IN ('queued','running') OR provider_reservation_state='active'
         OR (provider_reservation_settled_at>now()-interval '24 hours' AND (provider_actual_cost_micros>0 OR provider_actual_input_tokens>0 OR provider_actual_output_tokens>0))
       UNION ALL SELECT 1 FROM dictionary_generation_provider_usage_archive
         WHERE job_kind IN ('text-detection','text-translation','text-selection-card') AND settled_at>now()-interval '24 hours'
           AND (actual_cost_micros>0 OR actual_input_tokens>0 OR actual_output_tokens>0)
  ) THEN RAISE EXCEPTION 'Texts-capable capacity transaction required' USING ERRCODE='55000'; END IF;
  IF current_setting('languon.conversation_capacity_revision',true) IS DISTINCT FROM '1' AND EXISTS (
    SELECT 1 FROM conversation_turns WHERE status IN ('queued','running')
    UNION ALL SELECT 1 FROM conversation_provider_calls WHERE state<>'settled'
      OR (settled_at>now()-interval '24 hours' AND (actual_cost_micros>0 OR actual_input_tokens>0 OR actual_output_tokens>0))
    UNION ALL SELECT 1 FROM dictionary_generation_provider_usage_archive WHERE job_kind='conversation-turn'
      AND settled_at>now()-interval '24 hours' AND (actual_cost_micros>0 OR actual_input_tokens>0 OR actual_output_tokens>0)
  ) THEN RAISE EXCEPTION 'Conversation-capable capacity transaction required' USING ERRCODE='55000'; END IF;
  IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1' AND EXISTS (
    SELECT 1 FROM learner_portrait_interview_operations WHERE state IN ('queued','running')
    UNION ALL SELECT 1 FROM learner_portrait_interview_provider_calls WHERE state<>'settled'
      OR (settled_at>now()-interval '24 hours' AND (actual_cost_micros>0 OR actual_input_tokens>0 OR actual_output_tokens>0))
    UNION ALL SELECT 1 FROM dictionary_generation_provider_usage_archive WHERE job_kind='portrait-interview'
      AND settled_at>now()-interval '24 hours' AND (actual_cost_micros>0 OR actual_input_tokens>0 OR actual_output_tokens>0)
  ) THEN RAISE EXCEPTION 'Portrait-capable capacity transaction required' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END;
$$;


--> statement-breakpoint
CREATE FUNCTION enforce_portrait_provider_call_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.state<>'settled' OR EXISTS(SELECT 1 FROM ai_credit_reservations WHERE id=OLD.reservation_id AND state='active') THEN
     RAISE EXCEPTION 'Active conversation reservation prevents erasure' USING ERRCODE='23514';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
   PERFORM pg_advisory_xact_lock(4312189072);
   IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1' THEN
     RAISE EXCEPTION 'Conversation-capable reservation transaction required' USING ERRCODE='55000';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM learner_portrait_interview_operations WHERE id=NEW.operation_id AND owner_id=NEW.owner_id AND state IN ('queued','running')) THEN
     RAISE EXCEPTION 'Conversation provider call requires active owned turn' USING ERRCODE='23514';
   END IF;
 ELSE
   IF ROW(NEW.id,NEW.operation_id,NEW.owner_id,NEW.ordinal,NEW.purpose,NEW.reservation_id,NEW.reserved_cost_micros,NEW.reserved_input_tokens,NEW.reserved_output_tokens,
      NEW.input_cost_micros_per_million_tokens,NEW.output_cost_micros_per_million_tokens,NEW.max_cost_micros_per_attempt,NEW.max_input_tokens_per_attempt,NEW.max_output_tokens_per_attempt,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.operation_id,OLD.owner_id,OLD.ordinal,OLD.purpose,OLD.reservation_id,OLD.reserved_cost_micros,OLD.reserved_input_tokens,OLD.reserved_output_tokens,
      OLD.input_cost_micros_per_million_tokens,OLD.output_cost_micros_per_million_tokens,OLD.max_cost_micros_per_attempt,OLD.max_input_tokens_per_attempt,OLD.max_output_tokens_per_attempt,OLD.created_at) THEN
     RAISE EXCEPTION 'Conversation provider reservation is immutable' USING ERRCODE='23514';
   END IF;
   IF (OLD.state='settled' AND NEW IS DISTINCT FROM OLD) OR (OLD.state='dispatched' AND NEW.state='reserved') THEN
     RAISE EXCEPTION 'Conversation provider call cannot restart or resettle' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER portrait_provider_call_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON learner_portrait_interview_provider_calls
 FOR EACH ROW EXECUTE FUNCTION enforce_portrait_provider_call_lifecycle();

--> statement-breakpoint
CREATE FUNCTION enforce_portrait_operation_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.state IN ('queued','running') OR OLD.lease_until>now()
     OR EXISTS(SELECT 1 FROM learner_portrait_interview_provider_calls WHERE operation_id=OLD.id AND state<>'settled')
     OR EXISTS(SELECT 1 FROM ai_credit_reservations WHERE job_id=OLD.id AND job_kind='portrait-interview' AND state='active') THEN
     RAISE EXCEPTION 'Interview work must settle before erasure' USING ERRCODE='23514';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='INSERT' OR (NEW.state='running' AND OLD.lease_token IS DISTINCT FROM NEW.lease_token) THEN
   PERFORM pg_advisory_xact_lock(4312189072);
   IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1' THEN
     RAISE EXCEPTION 'Portrait-capable transaction required' USING ERRCODE='55000';
   END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.fingerprint IS DISTINCT FROM OLD.fingerprint AND NOT (
       NEW.cancel_requested=true AND NEW.fingerprint='erased'
       AND NEW.input='{"kind":"skip","topic":"update"}'::jsonb
       AND NEW.context='{"locale":"en","approvedItems":null,"draftItems":null,"messages":[],"completedTopics":[]}'::jsonb
       AND NEW.result IS NULL
   ) THEN RAISE EXCEPTION 'Interview fingerprint can only be erased with its content' USING ERRCODE='23514'; END IF;
   IF OLD.state IN ('succeeded','failed','cancelled') AND NEW.state<>OLD.state THEN
     RAISE EXCEPTION 'Terminal interview cannot restart' USING ERRCODE='23514';
   END IF;
   IF ROW(NEW.id,NEW.owner_id,NEW.interview_id,NEW.generation,NEW.version,NEW.idempotency_key,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.interview_id,OLD.generation,OLD.version,OLD.idempotency_key,OLD.created_at)
     OR (OLD.execution<>'{}'::jsonb AND NEW.execution IS DISTINCT FROM OLD.execution) THEN
     RAISE EXCEPTION 'Interview admission is immutable' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER portrait_operation_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON learner_portrait_interview_operations
 FOR EACH ROW EXECUTE FUNCTION enforce_portrait_operation_lifecycle();
--> statement-breakpoint
CREATE FUNCTION enforce_conversation_portrait_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.portrait_context IS NOT NULL AND (jsonb_typeof(NEW.portrait_context)<>'object' OR octet_length(NEW.portrait_context::text)>100000) THEN
   RAISE EXCEPTION 'Invalid conversation portrait snapshot' USING ERRCODE='23514';
 END IF;
 IF NEW.status NOT IN ('queued','running') AND NEW.portrait_context IS NOT NULL THEN
   RAISE EXCEPTION 'Terminal conversation must erase portrait snapshot' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND NEW.portrait_context IS DISTINCT FROM OLD.portrait_context AND
    NOT (NEW.status NOT IN ('queued','running') AND NEW.portrait_context IS NULL) THEN
   RAISE EXCEPTION 'Active portrait snapshot is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER conversation_portrait_snapshot_guard BEFORE INSERT OR UPDATE ON conversation_turns
 FOR EACH ROW EXECUTE FUNCTION enforce_conversation_portrait_snapshot();
--> statement-breakpoint
CREATE FUNCTION enforce_portrait_capacity_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NOT (NEW.status='running' AND (OLD.status<>'running' OR NEW.lease_token IS DISTINCT FROM OLD.lease_token)) THEN RETURN NEW; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(4312189072);
 IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1' AND EXISTS (
   SELECT 1 FROM learner_portrait_interview_operations WHERE state IN ('queued','running')
   UNION ALL SELECT 1 FROM learner_portrait_interview_provider_calls WHERE state<>'settled'
      OR (settled_at>now()-interval '24 hours' AND (actual_cost_micros>0 OR actual_input_tokens>0 OR actual_output_tokens>0))
   UNION ALL SELECT 1 FROM dictionary_generation_provider_usage_archive WHERE job_kind='portrait-interview'
      AND settled_at>now()-interval '24 hours' AND (actual_cost_micros>0 OR actual_input_tokens>0 OR actual_output_tokens>0)
 ) THEN RAISE EXCEPTION 'Portrait-capable capacity transaction required' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER conversation_portrait_capacity_overlap_guard BEFORE INSERT OR UPDATE ON conversation_turns
 FOR EACH ROW EXECUTE FUNCTION enforce_portrait_capacity_overlap();
--> statement-breakpoint
CREATE TRIGGER conversation_call_portrait_capacity_overlap_guard BEFORE INSERT ON conversation_provider_calls
 FOR EACH ROW EXECUTE FUNCTION enforce_portrait_capacity_overlap();
