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
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION enforce_conversation_turn_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.status IN ('queued','running') OR OLD.lease_until>now()
      OR EXISTS(SELECT 1 FROM conversation_provider_calls WHERE turn_id=OLD.id AND state<>'settled')
      OR EXISTS(SELECT 1 FROM ai_credit_reservations WHERE job_id=OLD.id AND job_kind='conversation-turn' AND state='active') THEN
     RAISE EXCEPTION 'Conversation work must settle before erasure' USING ERRCODE='23514';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='INSERT' OR (NEW.status='running' AND (OLD.status<>'running' OR OLD.lease_token IS DISTINCT FROM NEW.lease_token)) THEN
   PERFORM pg_advisory_xact_lock(4312189072);
   IF current_setting('languon.conversation_capacity_revision',true) IS DISTINCT FROM '1'
      OR current_setting('languon.texts_capacity_revision',true) IS DISTINCT FROM '1'
      OR current_setting('languon.text_ai_capacity_revision',true) IS DISTINCT FROM '1' THEN
     RAISE EXCEPTION 'Conversation-capable transaction required' USING ERRCODE='55000';
   END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.status IN ('succeeded','failed','cancelled') AND NEW.status<>OLD.status THEN
     RAISE EXCEPTION 'Terminal conversation turns cannot restart' USING ERRCODE='23514';
   END IF;
   IF ROW(NEW.id,NEW.conversation_id,NEW.owner_id,NEW.request_id,NEW.request_fingerprint,NEW.authority,NEW.source_snapshot,NEW.execution,NEW.preferences,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.conversation_id,OLD.owner_id,OLD.request_id,OLD.request_fingerprint,OLD.authority,OLD.source_snapshot,OLD.execution,OLD.preferences,OLD.created_at) THEN
     RAISE EXCEPTION 'Conversation admission is immutable' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER conversation_turn_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON conversation_turns
 FOR EACH ROW EXECUTE FUNCTION enforce_conversation_turn_lifecycle();
--> statement-breakpoint
CREATE FUNCTION enforce_conversation_provider_call_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.state<>'settled' OR EXISTS(SELECT 1 FROM ai_credit_reservations WHERE id=OLD.reservation_id AND state='active') THEN
     RAISE EXCEPTION 'Active conversation reservation prevents erasure' USING ERRCODE='23514';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
   PERFORM pg_advisory_xact_lock(4312189072);
   IF current_setting('languon.conversation_capacity_revision',true) IS DISTINCT FROM '1' THEN
     RAISE EXCEPTION 'Conversation-capable reservation transaction required' USING ERRCODE='55000';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM conversation_turns WHERE id=NEW.turn_id AND owner_id=NEW.owner_id AND status IN ('queued','running')) THEN
     RAISE EXCEPTION 'Conversation provider call requires active owned turn' USING ERRCODE='23514';
   END IF;
 ELSE
   IF ROW(NEW.id,NEW.turn_id,NEW.owner_id,NEW.ordinal,NEW.purpose,NEW.reservation_id,NEW.reserved_cost_micros,NEW.reserved_input_tokens,NEW.reserved_output_tokens,
      NEW.input_cost_micros_per_million_tokens,NEW.output_cost_micros_per_million_tokens,NEW.max_cost_micros_per_attempt,NEW.max_input_tokens_per_attempt,NEW.max_output_tokens_per_attempt,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.turn_id,OLD.owner_id,OLD.ordinal,OLD.purpose,OLD.reservation_id,OLD.reserved_cost_micros,OLD.reserved_input_tokens,OLD.reserved_output_tokens,
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
CREATE TRIGGER conversation_provider_call_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON conversation_provider_calls
 FOR EACH ROW EXECUTE FUNCTION enforce_conversation_provider_call_lifecycle();
