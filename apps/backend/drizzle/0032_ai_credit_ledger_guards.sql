CREATE OR REPLACE FUNCTION languon_ai_credit_guard_immutable_owner_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'AI credit immutable row cannot be updated'
            USING ERRCODE = '55000';
    END IF;
    IF current_setting('languon.ai_credit_purge_owner', true) IS DISTINCT FROM OLD.owner_id::text THEN
        RAISE EXCEPTION 'AI credit immutable row can only be deleted by account purge'
            USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER ai_credit_grants_immutable
BEFORE UPDATE OR DELETE ON ai_credit_grants
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_immutable_owner_row();

CREATE TRIGGER ai_credit_history_append_only
BEFORE UPDATE OR DELETE ON ai_credit_history
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_immutable_owner_row();

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
    allocation_reserved bigint;
    allocation_settled bigint;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id
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

    SELECT owner_id, ai_credit_accounted, ai_credit_max_credits_per_attempt
    INTO job_owner, job_accounted, job_maximum
    FROM dictionary_generation_jobs
    WHERE id = NEW.job_id;
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

CREATE TRIGGER ai_credit_reservations_guard
BEFORE INSERT OR UPDATE ON ai_credit_reservations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_reservation();

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_reservation_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    grant_owner uuid;
    grant_amount bigint;
    reservation_owner uuid;
    reservation_state text;
    spent bigint;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
        OR NEW.grant_id IS DISTINCT FROM OLD.grant_id
        OR NEW.allocated_credits IS DISTINCT FROM OLD.allocated_credits
    ) THEN
        RAISE EXCEPTION 'AI credit allocation identity and amount are immutable'
            USING ERRCODE = '55000';
    END IF;
    SELECT owner_id, amount INTO grant_owner, grant_amount
    FROM ai_credit_grants WHERE id = NEW.grant_id FOR UPDATE;
    SELECT owner_id, state::text INTO reservation_owner, reservation_state
    FROM ai_credit_reservations WHERE id = NEW.reservation_id;
    IF grant_owner IS NULL OR reservation_owner IS NULL OR grant_owner <> reservation_owner THEN
        RAISE EXCEPTION 'AI credit allocation owners must match'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND reservation_state <> 'active' THEN
        RAISE EXCEPTION 'AI credit terminal reservation allocations are immutable'
            USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT
            coalesce((SELECT sum(allocated_credits) FROM ai_credit_admin_removal_allocations WHERE grant_id = NEW.grant_id), 0)
            + coalesce((
                SELECT sum(CASE WHEN r.state = 'active' THEN a.allocated_credits ELSE a.settled_credits END)
                FROM ai_credit_reservation_allocations a
                JOIN ai_credit_reservations r ON r.id = a.reservation_id
                WHERE a.grant_id = NEW.grant_id
            ), 0)
        INTO spent;
        IF spent + NEW.allocated_credits > grant_amount THEN
            RAISE EXCEPTION 'AI credit allocation exceeds grant balance'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

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
    SELECT r.policy_mode::text, r.state::text, r.reserved_credits,
        r.charged_credits, r.attempt, j.attempt_count, j.max_attempts,
        j.ai_credit_policy_mode
    INTO reservation_mode, reservation_state, reservation_reserved,
        reservation_charged, reservation_attempt, job_attempt_count,
        job_max_attempts, job_policy_mode
    FROM ai_credit_reservations r
    JOIN dictionary_generation_jobs j ON j.id = r.job_id
    WHERE r.id = reservation_id_value;
    IF reservation_mode IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT coalesce(sum(allocated_credits), 0), coalesce(sum(settled_credits), 0)
    INTO allocation_reserved, allocation_settled
    FROM ai_credit_reservation_allocations
    WHERE reservation_id = reservation_id_value;
    IF (reservation_mode = 'limited' AND allocation_reserved <> reservation_reserved)
        OR (reservation_mode = 'unlimited' AND (allocation_reserved <> 0 OR reservation_reserved <> 0))
        OR (reservation_state = 'settled' AND allocation_settled <> reservation_charged)
        OR (reservation_state <> 'settled' AND allocation_settled <> 0)
        OR reservation_charged > reservation_reserved
        OR reservation_attempt > job_max_attempts
        OR reservation_attempt > greatest(1, job_attempt_count)
        OR job_policy_mode IS DISTINCT FROM reservation_mode THEN
        RAISE EXCEPTION 'AI credit reservation allocation totals or lifecycle are inconsistent'
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER ai_credit_reservation_allocations_guard
BEFORE INSERT OR UPDATE ON ai_credit_reservation_allocations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_reservation_allocation();

CREATE CONSTRAINT TRIGGER ai_credit_reservations_allocation_total
AFTER INSERT OR UPDATE ON ai_credit_reservations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION languon_ai_credit_validate_reservation_allocation_total();

CREATE CONSTRAINT TRIGGER ai_credit_reservation_allocations_total
AFTER INSERT OR UPDATE ON ai_credit_reservation_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION languon_ai_credit_validate_reservation_allocation_total();

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_admin_removal_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    grant_owner uuid;
    grant_amount bigint;
    removal_owner uuid;
    spent bigint;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'AI credit admin removal allocation is immutable'
            USING ERRCODE = '55000';
    END IF;
    SELECT owner_id, amount INTO grant_owner, grant_amount
    FROM ai_credit_grants WHERE id = NEW.grant_id FOR UPDATE;
    SELECT owner_id INTO removal_owner
    FROM ai_credit_admin_removals WHERE id = NEW.removal_id;
    IF grant_owner IS NULL OR removal_owner IS NULL OR grant_owner <> removal_owner THEN
        RAISE EXCEPTION 'AI credit admin removal allocation owners must match'
            USING ERRCODE = '23514';
    END IF;
    SELECT
        coalesce((SELECT sum(allocated_credits) FROM ai_credit_admin_removal_allocations WHERE grant_id = NEW.grant_id), 0)
        + coalesce((
            SELECT sum(CASE WHEN r.state = 'active' THEN a.allocated_credits ELSE a.settled_credits END)
            FROM ai_credit_reservation_allocations a
            JOIN ai_credit_reservations r ON r.id = a.reservation_id
            WHERE a.grant_id = NEW.grant_id
        ), 0)
    INTO spent;
    IF spent + NEW.allocated_credits > grant_amount THEN
        RAISE EXCEPTION 'AI credit admin removal exceeds grant balance'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER ai_credit_admin_removal_allocations_guard
BEFORE INSERT OR UPDATE ON ai_credit_admin_removal_allocations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_admin_removal_allocation();
