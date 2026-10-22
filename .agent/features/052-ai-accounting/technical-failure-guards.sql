-- Apply only after technical_failure enum addition has committed and the
-- generated reservation state constraint accepts the new truthful provenance.
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
        IF NEW.state = 'settled' AND NEW.dispatched_at IS NULL AND NEW.measurement NOT IN ('speech_no_charge','technical_failure') THEN
            RAISE EXCEPTION 'AI credit settled reservation must be dispatched'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.state = 'released' AND NEW.dispatched_at IS NOT NULL THEN
            RAISE EXCEPTION 'AI credit released reservation must be undispatched'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.state = 'settled' AND NEW.measurement = 'technical_failure'
            AND (NEW.charged_credits <> 0 OR NEW.measured_credits IS NOT NULL) THEN
            RAISE EXCEPTION 'Technical failure releases customer hold without claiming measured usage' USING ERRCODE='23514';
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
    ELSIF NEW.job_kind='portrait-interview' THEN
        IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1' THEN
            RAISE EXCEPTION 'Portrait-capable credit transaction required' USING ERRCODE='55000';
        END IF;
        SELECT owner_id, true,
            languon_portrait_credit_maximum(NEW.job_id, NEW.owner_id, NEW.id, NEW.attempt)
        INTO job_owner, job_accounted, job_maximum
        FROM learner_portrait_interview_operations WHERE id=NEW.job_id AND state IN ('queued','running');
        IF EXISTS(select 1 from learner_portrait_interview_operations where id=NEW.job_id and execution->>'interviewCreditsBypass'='true')
          AND (NEW.policy_mode<>'unlimited' OR NEW.reserved_credits<>0) THEN
          RAISE EXCEPTION 'Free interview requires zero charge policy' USING ERRCODE='23514';
        END IF;
    ELSIF NEW.job_kind='conversation-turn' THEN
        IF current_setting('languon.conversation_capacity_revision',true) IS DISTINCT FROM '1' THEN
            RAISE EXCEPTION 'Conversation-capable credit transaction required' USING ERRCODE='55000';
        END IF;
        SELECT owner_id, true,
            languon_conversation_credit_maximum(NEW.job_id, NEW.owner_id, NEW.id, NEW.attempt)
        INTO job_owner, job_accounted, job_maximum
        FROM conversation_turns WHERE id=NEW.job_id AND status IN ('queued','running');
    ELSE
        RAISE EXCEPTION 'Unknown AI credit job kind' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM ai_action_charging_policies p
        WHERE p.job_id = NEW.job_id AND p.job_kind = NEW.job_kind
            AND p.owner_id = NEW.owner_id AND p.policy->>'funding' = 'operator'
    ) AND (NEW.policy_mode <> 'unlimited' OR NEW.reserved_credits <> 0) THEN
        RAISE EXCEPTION 'Operator-funded action requires zero customer hold' USING ERRCODE = '23514';
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
