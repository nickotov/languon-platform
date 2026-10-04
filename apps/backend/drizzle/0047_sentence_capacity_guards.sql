-- New code takes the same lock as legacy dictionary admissions before any row locks.
-- Guard only increases: legacy completions/cancellations/heartbeat remain drainable.
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
           OR NEW.provider_reserved_attempts > OLD.provider_reserved_attempts));
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
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dictionary_generation_shared_capacity_guard
BEFORE INSERT OR UPDATE ON dictionary_generation_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_shared_text_ai_capacity();
