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
        IF NEW.state = 'settled' AND NEW.dispatched_at IS NULL THEN
            RAISE EXCEPTION 'AI credit settled reservation must be dispatched'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.state = 'released' AND NEW.dispatched_at IS NOT NULL THEN
            RAISE EXCEPTION 'AI credit released reservation must be undispatched'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.state = 'settled' AND (
            (NEW.policy_mode = 'limited' AND (
                (NEW.measurement = 'estimated' AND (NEW.charged_credits <> NEW.reserved_credits OR NEW.measured_credits IS NOT NULL))
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
    ELSIF NEW.job_kind IN ('sentence-generation', 'sentence-check') THEN
        SELECT learner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt
        INTO job_owner, job_accounted, job_maximum
        FROM sentence_ai_jobs WHERE id = NEW.job_id AND job_kind = NEW.job_kind;
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
    ELSIF reservation_kind IN ('sentence-generation', 'sentence-check') THEN
        SELECT learner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt,
            attempt_count, max_attempts, ai_credit_policy_mode
        INTO job_owner, job_accounted, job_maximum, job_attempt_count,
            job_max_attempts, job_policy_mode
        FROM sentence_ai_jobs WHERE id = reservation_job AND job_kind = reservation_kind;
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
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_job_erasure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    typed_kind text;
BEGIN
    IF TG_TABLE_NAME = 'dictionary_generation_jobs' THEN
        typed_kind := 'dictionary-generation';
    ELSIF TG_TABLE_NAME = 'sentence_ai_jobs' THEN
        typed_kind := OLD.job_kind;
        IF typed_kind NOT IN ('sentence-generation', 'sentence-check') THEN
            RAISE EXCEPTION 'Unknown erased AI credit job kind' USING ERRCODE = '23514';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unknown erased AI credit job table' USING ERRCODE = '23514';
    END IF;
    -- Account purge deletes its credit reservations before private job content.
    -- Its owner-scoped ledger purge policy does not authorize orphan active rows.
    IF EXISTS (
        SELECT 1 FROM ai_credit_reservations
        WHERE job_id = OLD.id AND job_kind = typed_kind AND state = 'active'
    ) THEN
        RAISE EXCEPTION 'Active AI credit reservation prevents job erasure'
            USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dictionary_credit_job_erasure_guard
BEFORE DELETE ON dictionary_generation_jobs
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_job_erasure();
--> statement-breakpoint
CREATE TRIGGER sentence_credit_job_erasure_guard
BEFORE DELETE ON sentence_ai_jobs
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_job_erasure();
