-- Append after generated projection table DDL. Migration runner holds the schema
-- migration lock; additionally block concurrent ledger writes during backfill.
LOCK TABLE ai_credit_grants, ai_credit_reservations,
    ai_credit_reservation_allocations, ai_credit_admin_removals,
    ai_credit_admin_removal_allocations IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
INSERT INTO ai_credit_grant_balances
    (grant_id, owner_id, created_at, expires_at, remaining_credits,
     reserved_credits, consumed_credits, removed_credits)
SELECT g.id, g.owner_id, g.created_at, g.expires_at,
    g.amount - coalesce(r.reserved, 0) - coalesce(r.consumed, 0) - coalesce(m.removed, 0),
    coalesce(r.reserved, 0), coalesce(r.consumed, 0), coalesce(m.removed, 0)
FROM ai_credit_grants g
LEFT JOIN (
    SELECT a.grant_id,
        sum(CASE WHEN r.state = 'active' THEN a.allocated_credits ELSE 0 END) reserved,
        sum(CASE WHEN r.state = 'settled' THEN a.settled_credits ELSE 0 END) consumed
    FROM ai_credit_reservation_allocations a
    JOIN ai_credit_reservations r ON r.id = a.reservation_id
    GROUP BY a.grant_id
) r ON r.grant_id = g.id
LEFT JOIN (
    SELECT grant_id, sum(allocated_credits) removed
    FROM ai_credit_admin_removal_allocations GROUP BY grant_id
) m ON m.grant_id = g.id;
--> statement-breakpoint
INSERT INTO ai_credit_wallet_totals (owner_id, reserved_credits, consumed_credits)
SELECT owner_id,
    coalesce(sum(CASE WHEN state = 'active' THEN reserved_credits ELSE 0 END), 0),
    coalesce(sum(charged_credits), 0)
FROM ai_credit_reservations GROUP BY owner_id;
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_project_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO ai_credit_grant_balances
        (grant_id, owner_id, created_at, expires_at, remaining_credits)
    VALUES (NEW.id, NEW.owner_id, NEW.created_at, NEW.expires_at, NEW.amount);
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_grants_project AFTER INSERT ON ai_credit_grants
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_project_grant();
--> statement-breakpoint
-- Allocation insertion is itself the atomic conditional debit. No scan of prior
-- reservations/removals is needed, including for direct SQL writers.
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_reservation_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
    reservation_owner uuid;
    reservation_state text;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
        OR NEW.grant_id IS DISTINCT FROM OLD.grant_id
        OR NEW.allocated_credits IS DISTINCT FROM OLD.allocated_credits
    ) THEN
        RAISE EXCEPTION 'AI credit allocation identity and amount are immutable' USING ERRCODE = '55000';
    END IF;
    SELECT owner_id, state::text INTO reservation_owner, reservation_state
    FROM ai_credit_reservations WHERE id = NEW.reservation_id FOR UPDATE;
    IF reservation_owner IS NULL OR reservation_state <> 'active' THEN
        RAISE EXCEPTION 'AI credit allocations require an active reservation' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.settled_credits <> 0 THEN
            RAISE EXCEPTION 'AI credit new allocation must be unsettled' USING ERRCODE = '23514';
        END IF;
        UPDATE ai_credit_grant_balances
        SET remaining_credits = remaining_credits - NEW.allocated_credits,
            reserved_credits = reserved_credits + NEW.allocated_credits
        WHERE grant_id = NEW.grant_id AND owner_id = reservation_owner
            AND remaining_credits >= NEW.allocated_credits;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'AI credit allocation exceeds grant balance or owners differ' USING ERRCODE = '23514';
        END IF;
    ELSIF NOT EXISTS (
        SELECT 1 FROM ai_credit_grant_balances
        WHERE grant_id = NEW.grant_id AND owner_id = reservation_owner
    ) THEN
        RAISE EXCEPTION 'AI credit allocation owners must match' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_admin_removal_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE removal_owner uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'AI credit admin removal allocation is immutable' USING ERRCODE = '55000';
    END IF;
    SELECT owner_id INTO removal_owner FROM ai_credit_admin_removals WHERE id = NEW.removal_id;
    UPDATE ai_credit_grant_balances
    SET remaining_credits = remaining_credits - NEW.allocated_credits,
        removed_credits = removed_credits + NEW.allocated_credits
    WHERE grant_id = NEW.grant_id AND owner_id = removal_owner
        AND remaining_credits >= NEW.allocated_credits;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AI credit removal exceeds grant balance or owners differ' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_project_reservation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.state <> 'active' THEN
            RAISE EXCEPTION 'AI credit new reservation must be active' USING ERRCODE = '23514';
        END IF;
        INSERT INTO ai_credit_wallet_totals (owner_id, reserved_credits, consumed_credits)
        VALUES (NEW.owner_id, NEW.reserved_credits, 0)
        ON CONFLICT (owner_id) DO UPDATE SET reserved_credits =
            ai_credit_wallet_totals.reserved_credits + excluded.reserved_credits;
    ELSIF OLD.state = 'active' AND NEW.state <> 'active' THEN
        -- Only allocations belonging to this reservation are visited. A release
        -- after lot expiry restores the lot, but expiry still excludes it from
        -- spendable queries. Settlement remains possible after expiry.
        UPDATE ai_credit_grant_balances b
        SET remaining_credits = b.remaining_credits + a.allocated_credits -
                CASE WHEN NEW.state = 'settled' THEN a.settled_credits ELSE 0 END,
            reserved_credits = b.reserved_credits - a.allocated_credits,
            consumed_credits = b.consumed_credits +
                CASE WHEN NEW.state = 'settled' THEN a.settled_credits ELSE 0 END
        FROM ai_credit_reservation_allocations a
        WHERE a.reservation_id = NEW.id AND b.grant_id = a.grant_id;
        UPDATE ai_credit_wallet_totals
        SET reserved_credits = reserved_credits - NEW.reserved_credits,
            consumed_credits = consumed_credits + coalesce(NEW.charged_credits, 0)
        WHERE owner_id = NEW.owner_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'AI credit wallet projection is missing' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_reservations_project AFTER INSERT OR UPDATE ON ai_credit_reservations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_project_reservation();
--> statement-breakpoint
-- Prevent silent projection divergence through ledger deletion. Account purge
-- explicitly removes the complete owner ledger and projections together.
CREATE TRIGGER ai_credit_reservations_delete_guard BEFORE DELETE ON ai_credit_reservations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_immutable_owner_row();
--> statement-breakpoint
CREATE TRIGGER ai_credit_admin_removals_immutable BEFORE UPDATE OR DELETE ON ai_credit_admin_removals
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_immutable_owner_row();
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_guard_allocation_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE allocation_owner uuid;
BEGIN
    SELECT owner_id INTO allocation_owner FROM ai_credit_grant_balances WHERE grant_id = OLD.grant_id;
    IF allocation_owner IS NULL OR NOT public.languon_operator_purge_authorized(allocation_owner) THEN
        RAISE EXCEPTION 'AI credit allocations can only be deleted by account purge' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_reservation_allocations_delete_guard BEFORE DELETE ON ai_credit_reservation_allocations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_allocation_delete();
--> statement-breakpoint
CREATE TRIGGER ai_credit_admin_removal_allocations_delete_guard BEFORE DELETE ON ai_credit_admin_removal_allocations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_allocation_delete();
--> statement-breakpoint
-- Projection rows accept changes only nested within ledger triggers; grant
-- conservation and copied expiry/owner metadata are checked on every mutation.
CREATE FUNCTION languon_ai_credit_guard_projection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE grant_row ai_credit_grants%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF NOT public.languon_operator_purge_authorized(OLD.owner_id) THEN
            RAISE EXCEPTION 'AI credit projections can only be deleted by account purge' USING ERRCODE = '55000';
        END IF;
        RETURN OLD;
    END IF;
    IF pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION 'AI credit projections must be changed through ledger operations' USING ERRCODE = '55000';
    END IF;
    IF TG_TABLE_NAME = 'ai_credit_grant_balances' THEN
        SELECT * INTO grant_row FROM ai_credit_grants WHERE id = NEW.grant_id;
        IF grant_row.id IS NULL OR NEW.owner_id IS DISTINCT FROM grant_row.owner_id
            OR NEW.created_at IS DISTINCT FROM grant_row.created_at
            OR NEW.expires_at IS DISTINCT FROM grant_row.expires_at
            OR NEW.remaining_credits + NEW.reserved_credits + NEW.consumed_credits + NEW.removed_credits <> grant_row.amount THEN
            RAISE EXCEPTION 'AI credit grant projection violates conservation' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_grant_balances_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_credit_grant_balances
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_projection();
--> statement-breakpoint
CREATE TRIGGER ai_credit_wallet_totals_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_credit_wallet_totals
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_projection();
