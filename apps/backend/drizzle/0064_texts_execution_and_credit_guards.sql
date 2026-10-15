-- Extend closed typed work; retain existing text/speech accounting semantics.
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    job_owner uuid;
    job_accounted boolean;
    job_maximum bigint;
    first_policy text;
    first_expiry timestamptz;
    first_owner uuid;
    allocation_reserved bigint;
    allocation_settled bigint;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id
            OR NEW.job_kind IS DISTINCT FROM OLD.job_kind
            OR NEW.job_id IS DISTINCT FROM OLD.job_id
            OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.attempt IS DISTINCT FROM OLD.attempt
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
            OR NEW.policy_mode IS DISTINCT FROM OLD.policy_mode
            OR NEW.unlimited_until IS DISTINCT FROM OLD.unlimited_until
            OR NEW.reserved_credits IS DISTINCT FROM OLD.reserved_credits THEN
            RAISE EXCEPTION 'AI credit reservation identity and policy are immutable'
                USING ERRCODE = '55000';
        END IF;
        IF OLD.state <> 'active' AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'Terminal AI credit reservation is immutable'
                USING ERRCODE = '55000';
        END IF;
        IF OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at THEN
            RAISE EXCEPTION 'AI credit dispatch marker is immutable'
                USING ERRCODE = '55000';
        END IF;
        IF NEW.charged_credits IS NOT NULL AND NEW.charged_credits > NEW.reserved_credits THEN
            RAISE EXCEPTION 'AI credit charge exceeds its reservation'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.state = 'settled' AND NEW.dispatched_at IS NULL AND NEW.measurement <> 'speech_no_charge' THEN
            RAISE EXCEPTION 'AI credit settled reservation must be dispatched'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.state = 'released' AND NEW.dispatched_at IS NOT NULL THEN
            RAISE EXCEPTION 'AI credit released reservation must be undispatched'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.state = 'settled' AND NEW.job_kind <> 'speech-generation' AND (
            (NEW.policy_mode = 'limited' AND (
                (NEW.measurement = 'estimated' AND (NEW.charged_credits <> CASE WHEN NEW.policy_mode = 'unlimited' THEN 0 ELSE NEW.reserved_credits END OR NEW.measured_credits IS NOT NULL))
                OR (NEW.measurement = 'provider_reported' AND (NEW.measured_credits IS NULL OR NEW.charged_credits <> NEW.measured_credits))
                OR NEW.measurement = 'unmetered'
            ))
            OR (NEW.policy_mode = 'unlimited' AND (
                NEW.charged_credits <> 0
                OR NEW.measurement = 'estimated'
                OR (NEW.measurement = 'provider_reported' AND NEW.measured_credits IS NULL)
                OR (NEW.measurement = 'unmetered' AND NEW.measured_credits IS NOT NULL)
            ))
        ) THEN
            RAISE EXCEPTION 'AI credit settlement semantics are inconsistent'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.measurement IN ('speech_success', 'speech_no_charge') AND NEW.job_kind <> 'speech-generation' THEN
            RAISE EXCEPTION 'Speech measurement requires speech job' USING ERRCODE = '23514';
        END IF;
        IF NEW.job_kind = 'speech-generation' AND NEW.state = 'settled' THEN
            IF NEW.measured_credits IS NOT NULL OR NEW.measurement NOT IN ('speech_success','speech_no_charge')
                OR (NEW.measurement = 'speech_no_charge' AND NEW.charged_credits <> 0)
                OR (NEW.measurement = 'speech_success' AND NEW.charged_credits <> CASE WHEN NEW.policy_mode = 'unlimited' THEN 0 ELSE NEW.reserved_credits END) THEN
                RAISE EXCEPTION 'Speech success-only settlement is inconsistent' USING ERRCODE = '23514';
            END IF;
            IF NEW.measurement = 'speech_success' AND NOT EXISTS (
                SELECT 1 FROM speech_jobs j JOIN speech_recordings r ON r.id = j.recording_id
                WHERE j.id = NEW.job_id AND j.payer_id = NEW.owner_id AND r.state = 'ready' AND r.ready_at IS NOT NULL AND r.ready_at < j.billing_deadline AND clock_timestamp() < j.billing_deadline
                    AND NEW.settled_at < j.billing_deadline
            ) THEN
                RAISE EXCEPTION 'Speech charge requires published audio before billing deadline' USING ERRCODE = '23514';
            END IF;
        END IF;
        IF NEW.state IN ('settled', 'released') THEN
            SELECT coalesce(sum(allocated_credits), 0), coalesce(sum(settled_credits), 0)
            INTO allocation_reserved, allocation_settled
            FROM ai_credit_reservation_allocations
            WHERE reservation_id = NEW.id;
            IF allocation_reserved <> NEW.reserved_credits
                OR (NEW.state = 'settled' AND allocation_settled <> NEW.charged_credits)
                OR (NEW.state = 'released' AND allocation_settled <> 0) THEN
                RAISE EXCEPTION 'AI credit reservation settlement does not match its allocations'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.job_kind = 'dictionary-generation' THEN
        SELECT owner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt
        INTO job_owner, job_accounted, job_maximum
        FROM dictionary_generation_jobs WHERE id = NEW.job_id;
    ELSIF NEW.job_kind = 'speech-generation' THEN
        SELECT payer_id, billing_state = 'reserved', credits INTO job_owner, job_accounted, job_maximum FROM speech_jobs WHERE id = NEW.job_id;
        IF NEW.attempt <> 1 THEN RAISE EXCEPTION 'Speech reservations cannot retry' USING ERRCODE = '23514'; END IF;
    ELSIF NEW.job_kind IN ('sentence-generation', 'sentence-check') THEN
        SELECT learner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt
        INTO job_owner, job_accounted, job_maximum
        FROM sentence_ai_jobs WHERE id = NEW.job_id AND job_kind = NEW.job_kind;
    ELSIF NEW.job_kind IN ('text-detection','text-translation') THEN
        SELECT owner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt INTO job_owner, job_accounted, job_maximum FROM texts_ai_jobs WHERE id=NEW.job_id AND job_kind=NEW.job_kind;
    ELSIF NEW.job_kind='text-selection-card' THEN
        SELECT owner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt INTO job_owner, job_accounted, job_maximum FROM dictionary_text_selection_jobs WHERE id=NEW.job_id;
    ELSE
        RAISE EXCEPTION 'Unknown AI credit job kind' USING ERRCODE = '23514';
    END IF;
    IF NEW.attempt > 1 THEN
        SELECT policy_mode::text, unlimited_until, owner_id
        INTO first_policy, first_expiry, first_owner
        FROM ai_credit_reservations
        WHERE job_id = NEW.job_id AND job_kind = NEW.job_kind AND attempt = 1;
        IF first_owner IS DISTINCT FROM NEW.owner_id
            OR first_policy IS DISTINCT FROM NEW.policy_mode::text
            OR first_expiry IS DISTINCT FROM NEW.unlimited_until THEN
            RAISE EXCEPTION 'AI credit retry must retain its typed admission policy'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    IF job_owner IS NULL OR job_owner <> NEW.owner_id OR job_accounted IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'AI credit reservation must belong to its accounted job owner'
            USING ERRCODE = '23514';
    END IF;
    IF (NEW.policy_mode = 'limited' AND NEW.reserved_credits <> job_maximum)
        OR (NEW.policy_mode = 'unlimited' AND NEW.reserved_credits <> 0) THEN
        RAISE EXCEPTION 'AI credit reservation does not match pinned job pricing'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION languon_ai_credit_validate_reservation_allocation_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    reservation_id_value uuid;
    reservation_mode text;
    reservation_state text;
    reservation_reserved bigint;
    reservation_charged bigint;
    reservation_attempt integer;
    reservation_job uuid;
    reservation_kind text;
    reservation_owner uuid;
    job_owner uuid;
    job_accounted boolean;
    job_maximum bigint;
    job_attempt_count integer;
    job_max_attempts integer;
    job_policy_mode text;
    allocation_reserved bigint;
    allocation_settled bigint;
BEGIN
    reservation_id_value := coalesce(
        (to_jsonb(NEW)->>'reservation_id')::uuid,
        (to_jsonb(NEW)->>'id')::uuid
    );
    SELECT policy_mode::text, state::text, reserved_credits,
        charged_credits, attempt, job_id, job_kind, owner_id
    INTO reservation_mode, reservation_state, reservation_reserved,
        reservation_charged, reservation_attempt, reservation_job,
        reservation_kind, reservation_owner
    FROM ai_credit_reservations WHERE id = reservation_id_value;
    IF reservation_mode IS NULL THEN
        RETURN NULL;
    END IF;
    IF reservation_kind = 'dictionary-generation' THEN
        SELECT owner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt,
            attempt_count, max_attempts, ai_credit_policy_mode
        INTO job_owner, job_accounted, job_maximum, job_attempt_count,
            job_max_attempts, job_policy_mode
        FROM dictionary_generation_jobs WHERE id = reservation_job;
    ELSIF reservation_kind = 'speech-generation' THEN
        SELECT payer_id, reservation_id IS NOT NULL, credits, 1, 1, reservation_mode INTO job_owner, job_accounted, job_maximum, job_attempt_count, job_max_attempts, job_policy_mode FROM speech_jobs WHERE id = reservation_job;
    ELSIF reservation_kind IN ('sentence-generation', 'sentence-check') THEN
        SELECT learner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt,
            attempt_count, max_attempts, ai_credit_policy_mode
        INTO job_owner, job_accounted, job_maximum, job_attempt_count,
            job_max_attempts, job_policy_mode
        FROM sentence_ai_jobs WHERE id = reservation_job AND job_kind = reservation_kind;
    ELSIF reservation_kind IN ('text-detection','text-translation') THEN
        SELECT owner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt, attempt_count, max_attempts, ai_credit_policy_mode INTO job_owner, job_accounted, job_maximum, job_attempt_count, job_max_attempts, job_policy_mode FROM texts_ai_jobs WHERE id=reservation_job AND job_kind=reservation_kind;
    ELSIF reservation_kind='text-selection-card' THEN
        SELECT owner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt, attempt_count, max_attempts, ai_credit_policy_mode INTO job_owner, job_accounted, job_maximum, job_attempt_count, job_max_attempts, job_policy_mode FROM dictionary_text_selection_jobs WHERE id=reservation_job;
    ELSE
        RAISE EXCEPTION 'Unknown AI credit job kind' USING ERRCODE = '23514';
    END IF;
    IF job_owner IS NULL THEN
        -- Privacy erasure removes private job content but retains terminal ledgers.
        -- Allocation totals must still validate below when job content is gone.
        IF reservation_state = 'active' THEN
            RAISE EXCEPTION 'Active AI credit reservation requires its typed job'
                USING ERRCODE = '23514';
        END IF;
    ELSIF job_owner IS DISTINCT FROM reservation_owner
        OR job_accounted IS DISTINCT FROM true
        OR reservation_attempt > job_max_attempts
        OR reservation_attempt > greatest(1, job_attempt_count)
        OR job_policy_mode IS DISTINCT FROM reservation_mode
        OR (reservation_mode = 'limited' AND reservation_reserved IS DISTINCT FROM job_maximum) THEN
        RAISE EXCEPTION 'AI credit reservation typed job lifecycle is inconsistent'
            USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(sum(allocated_credits), 0), coalesce(sum(settled_credits), 0)
    INTO allocation_reserved, allocation_settled
    FROM ai_credit_reservation_allocations
    WHERE reservation_id = reservation_id_value;
    IF (reservation_mode = 'limited' AND allocation_reserved <> reservation_reserved)
        OR (reservation_mode = 'unlimited' AND (allocation_reserved <> 0 OR reservation_reserved <> 0))
        OR (reservation_state = 'settled' AND allocation_settled <> reservation_charged)
        OR (reservation_state <> 'settled' AND allocation_settled <> 0)
        OR reservation_charged > reservation_reserved THEN
        RAISE EXCEPTION 'AI credit reservation allocation totals or lifecycle are inconsistent'
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;

--> statement-breakpoint
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
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_text_ai_job_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM ai_credit_reservations WHERE job_id=NEW.id)
 OR EXISTS(SELECT 1 FROM dictionary_generation_provider_usage_archive WHERE id=NEW.id)
 OR (TG_TABLE_NAME<>'dictionary_generation_jobs' AND EXISTS(SELECT 1 FROM dictionary_generation_jobs WHERE id=NEW.id))
 OR (TG_TABLE_NAME<>'sentence_ai_jobs' AND EXISTS(SELECT 1 FROM sentence_ai_jobs WHERE id=NEW.id))
 OR (TG_TABLE_NAME<>'texts_ai_jobs' AND EXISTS(SELECT 1 FROM texts_ai_jobs WHERE id=NEW.id))
 OR (TG_TABLE_NAME<>'dictionary_text_selection_jobs' AND EXISTS(SELECT 1 FROM dictionary_text_selection_jobs WHERE id=NEW.id))
 OR (TG_TABLE_NAME<>'speech_jobs' AND EXISTS(SELECT 1 FROM speech_jobs WHERE id=NEW.id)) THEN
 RAISE EXCEPTION 'Text AI identity collides with retained work' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_texts_execution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text; a jsonb; b jsonb;
BEGIN
 a:=to_jsonb(NEW);
 IF NEW.selected_execution_version IS DISTINCT FROM 1 OR NEW.selected_execution_snapshot IS NULL
 OR jsonb_typeof(NEW.selected_execution_snapshot)<>'object' OR NEW.execution_revision_id IS NULL THEN
 RAISE EXCEPTION 'Texts requires selected execution' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
 b:=to_jsonb(OLD);
 FOREACH k IN ARRAY ARRAY['id','owner_id','folder_id','text_id','expected_text_version','operation_id','request_fingerprint','request_hash','job_kind','format','selected_execution_version','selected_execution_snapshot','execution_revision_id','max_attempts','ai_credit_accounted','ai_credit_policy_mode','ai_credit_unlimited_until','ai_credit_max_credits_per_attempt','ai_credit_input_credits_per_million_tokens','ai_credit_output_credits_per_million_tokens','ai_credit_pricing_revision','provider_input_cost_micros_per_million_tokens','provider_output_cost_micros_per_million_tokens','provider_max_cost_micros_per_attempt','provider_max_input_tokens_per_attempt','provider_max_output_tokens_per_attempt','created_at','expires_at','confirm_duplicate'] LOOP
 IF (a->k) IS DISTINCT FROM (b->k) THEN RAISE EXCEPTION 'Texts admission immutable' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['input_payload','source_authority','target'] LOOP
 IF (a->k) IS DISTINCT FROM (b->k) AND NOT ((a->k)='null'::jsonb AND NEW.execution_state IN ('completed','failed','cancelled')) THEN
 RAISE EXCEPTION 'Texts input may only be redacted after execution' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF OLD.execution_state IN ('completed','failed','cancelled') AND NEW.execution_state<>OLD.execution_state THEN
 RAISE EXCEPTION 'Terminal Texts work cannot restart' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='INSERT' OR (NEW.execution_state='running' AND (OLD.execution_state<>'running' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id OR NEW.fencing_token IS DISTINCT FROM OLD.fencing_token)) THEN
 IF current_setting('languon.texts_execution_revision',true) IS DISTINCT FROM '1'
 OR current_setting('languon.texts_capacity_revision',true) IS DISTINCT FROM '1'
 OR current_setting('languon.text_ai_selection_revision',true) IS DISTINCT FROM '1'
 OR current_setting('languon.ai_credit_settlement_revision',true) IS DISTINCT FROM '1' THEN
 RAISE EXCEPTION 'Texts-capable accounting transaction required' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_job_erasure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE typed_kind text;
BEGIN
 IF TG_TABLE_NAME='dictionary_generation_jobs' THEN typed_kind:='dictionary-generation';
 ELSIF TG_TABLE_NAME IN ('sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs') THEN typed_kind:=OLD.job_kind;
 ELSE RAISE EXCEPTION 'Unknown erased AI credit job table' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM ai_credit_reservations WHERE job_id=OLD.id AND job_kind=typed_kind AND state='active') THEN
 RAISE EXCEPTION 'Active AI credits prevent job erasure' USING ERRCODE='23514'; END IF;
 RETURN OLD;
END; $$;
--> statement-breakpoint
CREATE TRIGGER texts_ai_jobs_identity_guard BEFORE INSERT ON texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION enforce_text_ai_job_identity();
--> statement-breakpoint
CREATE TRIGGER texts_ai_jobs_execution_guard BEFORE INSERT OR UPDATE ON texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION enforce_texts_execution();
--> statement-breakpoint
CREATE TRIGGER texts_ai_jobs_capacity_guard BEFORE INSERT OR UPDATE ON texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION enforce_shared_text_ai_capacity();
--> statement-breakpoint
CREATE TRIGGER texts_ai_jobs_provider_erasure_guard BEFORE DELETE ON texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION prevent_active_sentence_provider_erasure();
--> statement-breakpoint
CREATE TRIGGER texts_ai_jobs_credit_erasure_guard BEFORE DELETE ON texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_job_erasure();
--> statement-breakpoint
CREATE TRIGGER dictionary_text_selection_jobs_identity_guard BEFORE INSERT ON dictionary_text_selection_jobs FOR EACH ROW EXECUTE FUNCTION enforce_text_ai_job_identity();
--> statement-breakpoint
CREATE TRIGGER dictionary_text_selection_jobs_execution_guard BEFORE INSERT OR UPDATE ON dictionary_text_selection_jobs FOR EACH ROW EXECUTE FUNCTION enforce_texts_execution();
--> statement-breakpoint
CREATE TRIGGER dictionary_text_selection_jobs_capacity_guard BEFORE INSERT OR UPDATE ON dictionary_text_selection_jobs FOR EACH ROW EXECUTE FUNCTION enforce_shared_text_ai_capacity();
--> statement-breakpoint
CREATE TRIGGER dictionary_text_selection_jobs_provider_erasure_guard BEFORE DELETE ON dictionary_text_selection_jobs FOR EACH ROW EXECUTE FUNCTION prevent_active_sentence_provider_erasure();
--> statement-breakpoint
CREATE TRIGGER dictionary_text_selection_jobs_credit_erasure_guard BEFORE DELETE ON dictionary_text_selection_jobs FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_job_erasure();
--> statement-breakpoint
CREATE TRIGGER sentence_texts_capacity_guard BEFORE INSERT OR UPDATE ON sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION enforce_shared_text_ai_capacity();
--> statement-breakpoint
CREATE TRIGGER speech_texts_identity_guard BEFORE INSERT ON speech_jobs FOR EACH ROW EXECUTE FUNCTION enforce_text_ai_job_identity();
