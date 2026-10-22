-- Installed after report snapshot version columns. Never invoke during admission.
-- Manual/expense adapters invoke this transactionally after their fact insert.
-- Wallet projection invokes it only for consumed/removal deltas, never hold/release.
CREATE OR REPLACE FUNCTION languon_mark_accounting_reports_dirty() RETURNS void
LANGUAGE sql SET search_path=pg_catalog,public,pg_temp AS $$
  WITH locked AS MATERIALIZED (
    SELECT key FROM public.ai_accounting_report_snapshots ORDER BY key FOR UPDATE
  )
  UPDATE public.ai_accounting_report_snapshots target
  SET change_version=target.change_version+1
  FROM locked WHERE target.key=locked.key;
$$;
--> statement-breakpoint
-- Minimal authority for the dedicated purge role: no SELECT privilege on cash-record JSON.
-- Application coordinator already validates its lease/fence and holds request/user locks.
CREATE OR REPLACE FUNCTION languon_anonymize_accounting_owner(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,76021941));
  PERFORM 1 FROM public.users u JOIN public.account_deletion_requests r ON r.user_id=u.id
    WHERE u.id=owner_id_value AND u.status='deletion_pending' AND r.state='running'
      AND r.purge_at<=clock_timestamp() AND r.lease_deadline>clock_timestamp()
    FOR UPDATE OF r,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting purge requires an active due deletion lease' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381));
  PERFORM set_config('languon.ai_credit_purge_owner',owner_id_value::text,true);
  IF EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE owner_id=owner_id_value AND state<>'settled') THEN
    RAISE EXCEPTION 'Operator work is not quiescent for account purge' USING ERRCODE='23514';
  END IF;
  UPDATE public.ai_operator_action_budgets SET owner_id=null WHERE owner_id=owner_id_value;
  DELETE FROM public.ai_operator_daily_budgets WHERE scope='owner:'||owner_id_value::text;
  insert into public.ai_accounting_retired_purchase_lots(payment_id,retired_at,issued_milli) select p.id,clock_timestamp(),g.amount from public.ai_accounting_records p join public.ai_credit_grants g on g.id=p.grant_id where p.kind='payment' and p.owner_id=owner_id_value on conflict do nothing;
  with purchase_allocations as (select x.grant_id, x.allocated_credits, x.settled_credits, q.created_at, q.settled_at, q.state::text as state from public.ai_credit_reservation_allocations x join public.ai_credit_reservations q on q.id=x.reservation_id union all select x.grant_id, x.allocated_milli as allocated_credits, x.settled_milli as settled_credits, q.created_at, q.settled_at, q.state from public.ai_credit_action_allocations x join public.ai_credit_actions q on q.id=x.action_id), grouped as (select p.id payment_id,a.settled_at occurred_at,sum(a.settled_credits) credits,p.amount_usd_micros,g.amount issued from public.ai_accounting_records p join public.ai_credit_grants g on g.id=p.grant_id join purchase_allocations a on a.grant_id=g.id where p.owner_id=owner_id_value and a.settled_at is not null and a.settled_credits>0 group by p.id,a.settled_at,p.amount_usd_micros,g.amount), cumulative as (select *,sum(credits) over(partition by payment_id order by occurred_at) running from grouped) insert into public.ai_accounting_archived_purchase_movements(payment_id,occurred_at,kind,credits_milli,allocated_usd_micros) select payment_id,occurred_at,'consumed',credits,trunc(amount_usd_micros::numeric*running/issued)-trunc(amount_usd_micros::numeric*(running-credits)/issued) from cumulative on conflict do nothing;
  insert into public.ai_accounting_archived_purchase_movements(payment_id,occurred_at,kind,credits_milli,allocated_usd_micros) select p.id,r.created_at,'removed',sum(a.allocated_credits),0 from public.ai_accounting_records p join public.ai_credit_admin_removal_allocations a on a.grant_id=p.grant_id join public.ai_credit_admin_removals r on r.id=a.removal_id where p.owner_id=owner_id_value group by p.id,r.created_at on conflict do nothing;
  update public.ai_accounting_records set owner_id=null, data=(data || jsonb_build_object('reference','redacted','reason','Account removed')) || case when kind='payment' then jsonb_build_object('ownerId','00000000-0000-0000-0000-000000000000') else '{}'::jsonb end where owner_id=owner_id_value;
  UPDATE public.ai_accounting_records SET created_by=null WHERE created_by=owner_id_value;
  UPDATE public.ai_provider_price_revisions SET created_by=null WHERE created_by=owner_id_value;
  PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_anonymize_accounting_owner(uuid) FROM PUBLIC;
--> statement-breakpoint
-- Provider expense facts are append-only financial facts; request reconciliation is a separate record.
CREATE OR REPLACE FUNCTION languon_guard_provider_expense_fact() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts a WHERE a.id=NEW.attempt_id AND a.action_id=NEW.action_id AND a.state='settled') THEN
      RAISE EXCEPTION 'Provider expense requires its settled owned attempt' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  -- Deleting a private action attempt unlinks, but never destroys, its anonymous financial fact.
  IF TG_OP='UPDATE' AND OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS NULL
     AND (to_jsonb(NEW)-'attempt_id')=(to_jsonb(OLD)-'attempt_id')
     AND NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id)
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Provider expense facts are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER ai_provider_expense_immutable_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_provider_expense_records
FOR EACH ROW EXECUTE FUNCTION languon_guard_provider_expense_fact();
--> statement-breakpoint
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
--> statement-breakpoint
-- Accounting authorization is bound to immutable capability policy and an
-- owned typed feature job. Source payloads never leave this security-definer seam.
CREATE FUNCTION languon_ai_credit_feature_authority(action_id_value uuid, kind_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_value uuid; state_value text; explicit_stop_value boolean := false;
BEGIN
    CASE kind_value
    WHEN 'dictionary-generation' THEN
        SELECT owner_id,execution_state::text,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM dictionary_generation_jobs WHERE id=action_id_value;
    WHEN 'sentence-generation','sentence-check' THEN
        SELECT learner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM sentence_ai_jobs WHERE id=action_id_value AND job_kind=kind_value;
    WHEN 'text-detection','text-translation' THEN
        SELECT owner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM texts_ai_jobs WHERE id=action_id_value AND job_kind=kind_value;
    WHEN 'text-selection-card' THEN
        SELECT owner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM dictionary_text_selection_jobs WHERE id=action_id_value;
    WHEN 'conversation-turn' THEN
        SELECT owner_id,status,cancel_requested AND failure_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM conversation_turns WHERE id=action_id_value;
    WHEN 'portrait-interview' THEN
        SELECT owner_id,state,cancel_requested AND error_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM learner_portrait_interview_operations WHERE id=action_id_value;
    WHEN 'speech-generation' THEN
        SELECT payer_id,state,false INTO owner_value,state_value,explicit_stop_value FROM speech_jobs WHERE id=action_id_value;
    ELSE RAISE EXCEPTION 'Unknown action feature kind' USING ERRCODE='23514';
    END CASE;
    IF owner_value IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('ownerId',owner_value,'state',state_value,'explicitStop',coalesce(explicit_stop_value,false),'jobKind',kind_value);
END; $$;
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_guard_action_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pin ai_action_charging_policies%ROWTYPE; account_mode text; unlimited_expiry timestamptz; effective_unlimited boolean;
BEGIN
    SELECT * INTO pin FROM ai_action_charging_policies WHERE job_id=NEW.id;
    IF pin.job_id IS NULL OR pin.owner_id IS DISTINCT FROM NEW.owner_id
        OR pin.policy->>'capability' IS DISTINCT FROM NEW.capability
        OR (pin.policy->>'version')::integer IS DISTINCT FROM NEW.policy_version
        OR NEW.created_at<pin.created_at OR NEW.state<>'active' THEN
        RAISE EXCEPTION 'Action admission requires its immutable owned charging policy' USING ERRCODE='23514';
    END IF;
    IF pin.policy->>'funding'='operator' THEN
        IF NEW.funding<>'operator' OR NEW.held_milli<>0 THEN
            RAISE EXCEPTION 'Operator action cannot charge customer credits' USING ERRCODE='23514';
        END IF;
    ELSIF pin.policy->>'funding'='customer' THEN
        SELECT mode::text,unlimited_until INTO account_mode,unlimited_expiry FROM ai_credit_accounts WHERE user_id=NEW.owner_id;
        effective_unlimited := coalesce(account_mode='unlimited' AND (unlimited_expiry IS NULL OR unlimited_expiry>NEW.created_at),false);
        IF effective_unlimited AND (NEW.funding<>'unlimited' OR NEW.held_milli<>0) THEN
            RAISE EXCEPTION 'Unlimited entitlement must preserve finite customer grants' USING ERRCODE='23514';
        ELSIF NOT effective_unlimited AND (NEW.funding<>'customer' OR (NEW.held_milli=0 AND NOT (
            (NEW.tariff->>'inputCreditsPerMillionTokens')::numeric=0
            AND coalesce((NEW.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(NEW.tariff->>'inputCreditsPerMillionTokens')::numeric)=0
            AND (NEW.tariff->>'outputCreditsPerMillionTokens')::numeric=0))) THEN
            RAISE EXCEPTION 'Customer action requires its finite credit hold' USING ERRCODE='23514';
        END IF;
    ELSE RAISE EXCEPTION 'Invalid pinned action funding' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_action_admission_authority BEFORE INSERT ON ai_credit_actions
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_action_admission();
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_expected_outcome(feature_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
    SELECT CASE WHEN feature_value->>'state' IN ('completed','succeeded','ready') THEN 'success'
        WHEN feature_value->>'state'='cancelled' AND (feature_value->>'explicitStop')::boolean THEN 'stopped'
        WHEN feature_value->>'state' IN ('failed','cancelled','expired') THEN 'failure' ELSE NULL END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_guard_authority_proof() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row ai_credit_actions%ROWTYPE; pin ai_action_charging_policies%ROWTYPE; feature_value jsonb;
BEGIN
    IF TG_OP='DELETE' THEN
        IF EXISTS(SELECT 1 FROM ai_credit_actions WHERE id=OLD.action_id) THEN
            RAISE EXCEPTION 'Action terminal proof can only be removed by parent cascade' USING ERRCODE='55000';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP='UPDATE' OR pg_trigger_depth()<2 THEN
        RAISE EXCEPTION 'Action terminal proof is immutable and trigger-owned' USING ERRCODE='55000';
    END IF;
    SELECT * INTO action_row FROM ai_credit_actions WHERE id=NEW.action_id;
    SELECT * INTO pin FROM ai_action_charging_policies WHERE job_id=NEW.action_id;
    feature_value := languon_ai_credit_feature_authority(NEW.action_id,NEW.job_kind);
    IF action_row.id IS NULL OR pin.job_id IS NULL OR feature_value IS NULL
        OR pin.job_kind IS DISTINCT FROM NEW.job_kind
        OR action_row.owner_id IS DISTINCT FROM NEW.feature_owner_id
        OR pin.owner_id IS DISTINCT FROM NEW.feature_owner_id
        OR feature_value->>'ownerId' IS DISTINCT FROM NEW.feature_owner_id::text
        OR feature_value->>'state' IS DISTINCT FROM NEW.terminal_state
        OR (feature_value->>'explicitStop')::boolean IS DISTINCT FROM NEW.explicit_stop
        OR languon_ai_credit_expected_outcome(feature_value) IS DISTINCT FROM NEW.outcome
        OR (action_row.state='settled' AND action_row.outcome IS DISTINCT FROM NEW.outcome) THEN
        RAISE EXCEPTION 'Action terminal proof requires the actual owned feature outcome' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_action_authority_immutable BEFORE INSERT OR UPDATE OR DELETE ON ai_credit_action_authorities
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_authority_proof();
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_record_feature_authority(action_id_value uuid,kind_value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row ai_credit_actions%ROWTYPE; feature_value jsonb; expected_outcome text; proof ai_credit_action_authorities%ROWTYPE; pin ai_action_charging_policies%ROWTYPE;
BEGIN
    SELECT * INTO action_row FROM ai_credit_actions WHERE id=action_id_value;
    IF action_row.id IS NULL THEN RETURN; END IF;
    SELECT * INTO pin FROM ai_action_charging_policies WHERE job_id=action_id_value;
    IF pin.job_id IS NULL OR pin.job_kind IS DISTINCT FROM kind_value
        OR pin.owner_id IS DISTINCT FROM action_row.owner_id
        OR pin.policy->>'capability' IS DISTINCT FROM action_row.capability THEN
        RAISE EXCEPTION 'Feature kind does not match its owned action admission' USING ERRCODE='23514';
    END IF;
    feature_value := languon_ai_credit_feature_authority(action_id_value,kind_value);
    IF feature_value IS NULL OR feature_value->>'ownerId' IS DISTINCT FROM action_row.owner_id::text THEN
        RAISE EXCEPTION 'Action requires its owned typed feature' USING ERRCODE='23514';
    END IF;
    expected_outcome := languon_ai_credit_expected_outcome(feature_value);
    SELECT * INTO proof FROM ai_credit_action_authorities WHERE action_id=action_id_value;
    IF proof.action_id IS NOT NULL THEN
        -- Numeric terminal proof preserves the original stop marker if private
        -- failure metadata is subsequently redacted. State/ownership cannot change.
        IF proof.feature_owner_id IS DISTINCT FROM action_row.owner_id OR proof.job_kind IS DISTINCT FROM kind_value
            OR proof.terminal_state IS DISTINCT FROM feature_value->>'state'
            OR (action_row.state='settled' AND proof.outcome IS DISTINCT FROM action_row.outcome) THEN
            RAISE EXCEPTION 'Feature terminal authority cannot be rewritten' USING ERRCODE='23514';
        END IF;
        RETURN;
    END IF;
    IF expected_outcome IS NOT NULL THEN
        INSERT INTO ai_credit_action_authorities(action_id,feature_owner_id,job_kind,terminal_state,explicit_stop,outcome,attested_at)
        VALUES(action_id_value,action_row.owner_id,kind_value,feature_value->>'state',
            (feature_value->>'explicitStop')::boolean,expected_outcome,clock_timestamp());
    END IF;
END; $$;
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_feature_authority_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE kind_value text; id_value uuid; action_row ai_credit_actions%ROWTYPE;
BEGIN
    id_value := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
    SELECT * INTO action_row FROM ai_credit_actions WHERE id=id_value;
    IF action_row.id IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
    kind_value := CASE TG_TABLE_NAME
        WHEN 'dictionary_generation_jobs' THEN 'dictionary-generation'
        WHEN 'dictionary_text_selection_jobs' THEN 'text-selection-card'
        WHEN 'conversation_turns' THEN 'conversation-turn'
        WHEN 'learner_portrait_interview_operations' THEN 'portrait-interview'
        WHEN 'speech_jobs' THEN 'speech-generation'
        ELSE CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD)->>'job_kind' ELSE to_jsonb(NEW)->>'job_kind' END END;
    IF TG_OP='DELETE' AND action_row.state<>'settled' THEN
        RAISE EXCEPTION 'Active action must settle before private feature erasure' USING ERRCODE='23514';
    END IF;
    PERFORM languon_ai_credit_record_feature_authority(id_value,kind_value);
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
--> statement-breakpoint
DO $$ DECLARE table_value text;
BEGIN
    FOREACH table_value IN ARRAY ARRAY['dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs','conversation_turns','learner_portrait_interview_operations','speech_jobs'] LOOP
        EXECUTE format('CREATE TRIGGER ai_credit_feature_terminal_authority AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_feature_authority_trigger()',table_value);
        EXECUTE format('CREATE TRIGGER ai_credit_feature_erasure_authority BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_feature_authority_trigger()',table_value);
    END LOOP;
END; $$;
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_assert_action_authority(action_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row ai_credit_actions%ROWTYPE; pin ai_action_charging_policies%ROWTYPE;
    proof ai_credit_action_authorities%ROWTYPE; feature_value jsonb;
BEGIN
    SELECT * INTO action_row FROM ai_credit_actions WHERE id=action_id_value;
    IF action_row.id IS NULL THEN RETURN; END IF; -- Complete-account purge removed the entire aggregate.
    SELECT * INTO pin FROM ai_action_charging_policies WHERE job_id=action_id_value;
    IF pin.job_id IS NULL OR pin.owner_id IS DISTINCT FROM action_row.owner_id
        OR pin.policy->>'capability' IS DISTINCT FROM action_row.capability
        OR (pin.policy->>'version')::integer IS DISTINCT FROM action_row.policy_version
        OR ((pin.policy->>'funding'='operator') IS DISTINCT FROM (action_row.funding='operator')) THEN
        RAISE EXCEPTION 'Action must retain its immutable capability and funding authority' USING ERRCODE='23514';
    END IF;
    feature_value := languon_ai_credit_feature_authority(action_id_value,pin.job_kind);
    SELECT * INTO proof FROM ai_credit_action_authorities WHERE action_id=action_id_value;
    IF action_row.state='active' THEN
        IF feature_value IS NULL OR feature_value->>'ownerId' IS DISTINCT FROM action_row.owner_id::text
            OR languon_ai_credit_expected_outcome(feature_value) IS NOT NULL OR proof.action_id IS NOT NULL THEN
            RAISE EXCEPTION 'Active action requires its live owned feature work' USING ERRCODE='23514';
        END IF;
    ELSE
        IF action_row.outcome IS NULL OR action_row.measurement IS NULL OR action_row.charged_milli IS NULL OR action_row.settled_at IS NULL THEN
            RAISE EXCEPTION 'Settled action requires complete terminal measurement' USING ERRCODE='23514';
        END IF;
        IF proof.action_id IS NULL OR proof.feature_owner_id IS DISTINCT FROM action_row.owner_id
            OR proof.job_kind IS DISTINCT FROM pin.job_kind OR proof.outcome IS DISTINCT FROM action_row.outcome
            OR (feature_value IS NOT NULL AND (feature_value->>'ownerId' IS DISTINCT FROM proof.feature_owner_id::text
                OR feature_value->>'state' IS DISTINCT FROM proof.terminal_state)) THEN
            RAISE EXCEPTION 'Action settlement requires immutable authoritative feature outcome' USING ERRCODE='23514';
        END IF;
        IF EXISTS(SELECT 1 FROM ai_credit_action_attempts WHERE action_id=action_id_value AND state<>'settled') THEN
            RAISE EXCEPTION 'Every provider attempt must settle before its action' USING ERRCODE='23514';
        END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM ai_credit_action_attempts t
        LEFT JOIN ai_provider_expense_records e ON e.attempt_id=t.id
        WHERE t.action_id=action_id_value AND t.state='settled'
            AND (e.id IS NULL OR e.action_id IS DISTINCT FROM action_id_value)) THEN
        RAISE EXCEPTION 'Settled provider attempt requires exactly one immutable attributed expense' USING ERRCODE='23514';
    END IF;
END; $$;
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_action_authority_constraint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE id_value uuid;
BEGIN
    id_value := CASE WHEN TG_TABLE_NAME='ai_credit_actions' THEN (to_jsonb(NEW)->>'id')::uuid
        WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'action_id')::uuid ELSE (to_jsonb(NEW)->>'action_id')::uuid END;
    PERFORM languon_ai_credit_assert_action_authority(id_value);
    RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ai_credit_actions_authority AFTER INSERT OR UPDATE ON ai_credit_actions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_action_authority_constraint();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ai_credit_attempts_authority AFTER INSERT OR UPDATE ON ai_credit_action_attempts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_action_authority_constraint();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ai_credit_expense_authority AFTER INSERT OR UPDATE OR DELETE ON ai_provider_expense_records
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_action_authority_constraint();
--> statement-breakpoint
CREATE FUNCTION languon_ai_credit_feature_authority_constraint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM languon_ai_credit_assert_action_authority(NEW.id);
    RETURN NULL;
END; $$;
--> statement-breakpoint
DO $$ DECLARE table_value text;
BEGIN
    FOREACH table_value IN ARRAY ARRAY['dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs','conversation_turns','learner_portrait_interview_operations','speech_jobs'] LOOP
        EXECUTE format('CREATE CONSTRAINT TRIGGER ai_credit_feature_action_authority AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_feature_authority_constraint()',table_value);
    END LOOP;
END; $$;
--> statement-breakpoint
-- Bootstrap only provable existing terminal rows. Existing absent/invalid proofs
-- fail closed instead of inventing an historical success or stop authorization.
DO $$ DECLARE action_value record;
BEGIN
    FOR action_value IN SELECT a.id,p.job_kind FROM ai_credit_actions a JOIN ai_action_charging_policies p ON p.job_id=a.id LOOP
        -- The insertion guard requires a nested trigger context, so route existing
        -- terminal features through their normal no-content-change update below.
        CASE action_value.job_kind
            WHEN 'dictionary-generation' THEN UPDATE dictionary_generation_jobs SET updated_at=updated_at WHERE id=action_value.id;
            WHEN 'sentence-generation','sentence-check' THEN UPDATE sentence_ai_jobs SET updated_at=updated_at WHERE id=action_value.id;
            WHEN 'text-detection','text-translation' THEN UPDATE texts_ai_jobs SET updated_at=updated_at WHERE id=action_value.id;
            WHEN 'text-selection-card' THEN UPDATE dictionary_text_selection_jobs SET updated_at=updated_at WHERE id=action_value.id;
            WHEN 'conversation-turn' THEN UPDATE conversation_turns SET updated_at=updated_at WHERE id=action_value.id;
            WHEN 'portrait-interview' THEN UPDATE learner_portrait_interview_operations SET updated_at=updated_at WHERE id=action_value.id;
            WHEN 'speech-generation' THEN UPDATE speech_jobs SET state=state WHERE id=action_value.id;
        END CASE;
        PERFORM languon_ai_credit_assert_action_authority(action_value.id);
    END LOOP;
    IF EXISTS(SELECT 1 FROM ai_credit_actions a LEFT JOIN ai_action_charging_policies p ON p.job_id=a.id WHERE p.job_id IS NULL) THEN
        RAISE EXCEPTION 'Existing action has no immutable charging authority' USING ERRCODE='23514';
    END IF;
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_ai_credit_feature_authority(uuid,text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_ai_credit_expected_outcome(jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_ai_credit_record_feature_authority(uuid,text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_ai_credit_assert_action_authority(uuid) FROM PUBLIC;
--> statement-breakpoint
-- New feature jobs retain their own ownership, fencing, capacity and terminal validators.
-- Versioned snapshots opt into whole-action accounting; original reservations remain guarded.
CREATE OR REPLACE FUNCTION guard_legacy_action_accounting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row_data jsonb; snapshot jsonb; action_row public.ai_credit_actions%ROWTYPE;
DECLARE job_owner uuid; kind text; expected_capability text; pin public.ai_action_charging_policies%ROWTYPE;
BEGIN
  -- Constraint triggers read final transaction state, after validated result publication and settlement.
  EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1', TG_TABLE_NAME) INTO row_data USING NEW.id;
  IF row_data IS NULL THEN RETURN NEW; END IF;
  snapshot:=row_data->'selected_execution_snapshot';
  IF snapshot->>'actionAccountingVersion' IS DISTINCT FROM '1' THEN RETURN NEW; END IF;
  job_owner:=coalesce(row_data->>'owner_id',row_data->>'learner_id')::uuid;
  kind:=CASE WHEN TG_TABLE_NAME='dictionary_generation_jobs' THEN 'dictionary-generation'
    WHEN TG_TABLE_NAME='dictionary_text_selection_jobs' THEN 'text-selection-card' ELSE row_data->>'job_kind' END;
  expected_capability:=CASE WHEN kind='dictionary-generation' THEN 'dictionary-generation'
    WHEN kind IN ('sentence-generation','sentence-check') THEN 'sentence-generation' ELSE 'text-translation' END;
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.id;
  SELECT * INTO pin FROM public.ai_action_charging_policies WHERE job_id=NEW.id;
  IF action_row.id IS NULL OR action_row.owner_id<>job_owner OR action_row.capability<>expected_capability
    OR row_data->>'ai_credit_accounted'<>'false' OR row_data->>'ai_credit_reservation_id' IS NOT NULL
    OR action_row.funding IS DISTINCT FROM snapshot->>'actionFunding'
    OR action_row.budget_milli IS DISTINCT FROM (snapshot->>'actionBudgetMilli')::bigint
    OR action_row.policy_version IS DISTINCT FROM (snapshot->>'actionPolicyVersion')::integer
    OR action_row.output_limit<>10000 OR (row_data->>'max_attempts')::integer>2
    OR pin.job_id IS NULL OR pin.owner_id<>job_owner OR pin.job_kind<>kind
    OR (pin.policy->>'version')::integer<>action_row.policy_version
    OR ((pin.policy->>'funding'='operator') IS DISTINCT FROM (action_row.funding='operator'))
    OR action_row.tariff->>'inputCreditsPerMillionTokens' IS DISTINCT FROM snapshot->'creditPricing'->>'inputCreditsPerMillionTokens'
    OR action_row.tariff->>'outputCreditsPerMillionTokens' IS DISTINCT FROM snapshot->'creditPricing'->>'outputCreditsPerMillionTokens'
    OR action_row.tariff->>'cachedInputCreditsPerMillionTokens' IS DISTINCT FROM snapshot->'creditPricing'->>'cachedInputCreditsPerMillionTokens'
    OR snapshot->'actionProviderPrice' IS NULL OR snapshot->'actionProviderPrice'='null'::jsonb
    OR NOT EXISTS(SELECT 1 FROM public.ai_provider_price_revisions p
      WHERE p.id=(snapshot->'actionProviderPrice'->>'id')::uuid
        AND p.provider_id=snapshot->>'providerId' AND p.model_id=snapshot->>'modelId'
        AND p.meter='text-tokens' AND p.effective_at<=action_row.created_at
        AND p.version=(snapshot->'actionProviderPrice'->>'version')::integer
        AND p.data @> jsonb_build_object(
          'inputUsdPerMillionTokens',snapshot->'actionProviderPrice'->'inputUsdPerMillionTokens',
          'outputUsdPerMillionTokens',snapshot->'actionProviderPrice'->'outputUsdPerMillionTokens',
          'cacheReadUsdPerMillionTokens',snapshot->'actionProviderPrice'->'cacheReadUsdPerMillionTokens',
          'cacheWriteUsdPerMillionTokens',snapshot->'actionProviderPrice'->'cacheWriteUsdPerMillionTokens')) THEN
    RAISE EXCEPTION 'Feature action authorization does not match immutable admission' USING ERRCODE='23514';
  END IF;
  IF row_data->>'execution_state'='running' AND NOT EXISTS(
    SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=NEW.id AND ordinal=(row_data->>'attempt_count')::integer
  ) THEN
    RAISE EXCEPTION 'Running feature attempt requires durable action allowance' USING ERRCODE='23514';
  END IF;
  IF row_data->>'execution_state' IN ('completed','failed','cancelled','expired') THEN
    IF action_row.state<>'settled'
      OR (row_data->>'execution_state'='completed' AND action_row.outcome IS DISTINCT FROM 'success')
      OR (row_data->>'execution_state' IN ('failed','expired') AND action_row.outcome IS DISTINCT FROM 'failure')
      OR (row_data->>'execution_state'='cancelled' AND (action_row.outcome IS NULL OR action_row.outcome NOT IN ('failure','stopped'))) THEN
      RAISE EXCEPTION 'Feature terminal result requires matching action settlement' USING ERRCODE='23514';
    END IF;
  ELSIF action_row.state<>'active' THEN
    RAISE EXCEPTION 'Live feature work requires an active action' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER dictionary_generation_action_guard AFTER INSERT OR UPDATE ON dictionary_generation_jobs
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_accounting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sentence_action_guard AFTER INSERT OR UPDATE ON sentence_ai_jobs
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_accounting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER texts_action_guard AFTER INSERT OR UPDATE ON texts_ai_jobs
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_accounting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER selection_action_guard AFTER INSERT OR UPDATE ON dictionary_text_selection_jobs
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_accounting();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_legacy_action_erasure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=OLD.id AND state='active') THEN
    RAISE EXCEPTION 'An active action prevents feature job erasure' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER dictionary_generation_action_erasure BEFORE DELETE ON dictionary_generation_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_erasure();
--> statement-breakpoint
CREATE TRIGGER sentence_action_erasure BEFORE DELETE ON sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_erasure();
--> statement-breakpoint
CREATE TRIGGER texts_action_erasure BEFORE DELETE ON texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_erasure();
--> statement-breakpoint
CREATE TRIGGER selection_action_erasure BEFORE DELETE ON dictionary_text_selection_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_erasure();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_legacy_action_worker_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.selected_execution_snapshot->>'actionAccountingVersion'='1'
    AND NEW.execution_state='running'
    AND (TG_OP='INSERT' OR OLD.execution_state IS DISTINCT FROM 'running' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id)
    AND current_setting('languon.ai_credit_settlement_revision',true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Action-accounted feature work requires a capable accounting worker' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER dictionary_generation_action_worker BEFORE INSERT OR UPDATE ON dictionary_generation_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_worker_revision();
--> statement-breakpoint
CREATE TRIGGER sentence_action_worker BEFORE INSERT OR UPDATE ON sentence_ai_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_worker_revision();
--> statement-breakpoint
CREATE TRIGGER texts_action_worker BEFORE INSERT OR UPDATE ON texts_ai_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_worker_revision();
--> statement-breakpoint
CREATE TRIGGER selection_action_worker BEFORE INSERT OR UPDATE ON dictionary_text_selection_jobs FOR EACH ROW EXECUTE FUNCTION guard_legacy_action_worker_revision();
--> statement-breakpoint
-- A client-settable marker alone never authorizes anonymization or counter removal.
CREATE OR REPLACE FUNCTION languon_operator_purge_authorized(owner_value uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT current_setting('languon.ai_credit_purge_owner',true)=owner_value::text
    AND EXISTS(SELECT 1 FROM public.users u JOIN public.account_deletion_requests d ON d.user_id=u.id
      WHERE u.id=owner_value AND u.status='deletion_pending' AND d.state='running'
        AND d.purge_at<=clock_timestamp() AND d.lease_deadline>clock_timestamp()
        AND d.lease_worker_id IS NOT NULL AND d.fencing_token>0);
$$;
--> statement-breakpoint
-- All model, capability and revision cohorts share these UTC daily money counters.
CREATE OR REPLACE FUNCTION languon_operator_daily_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.scope='owner:'||current_setting('languon.ai_credit_purge_owner',true)
    AND languon_operator_purge_authorized(substring(OLD.scope from 7)::uuid)
    AND NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets a WHERE a.owner_id::text=current_setting('languon.ai_credit_purge_owner',true) AND a.state='active') THEN
    RETURN OLD;
  END IF;
  IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Operator daily totals may only change through action reservations'; END IF;
  IF TG_OP='UPDATE' AND (NEW.day<>OLD.day OR NEW.scope<>OLD.scope OR NEW.consumed_micros<OLD.consumed_micros) THEN
    RAISE EXCEPTION 'Operator daily totals are immutable apart from accounting deltas';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER languon_operator_daily_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_operator_daily_budgets
FOR EACH ROW EXECUTE FUNCTION languon_operator_daily_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_operator_action_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE budget_row record;
DECLARE action_usage bigint;
BEGIN
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL
    AND languon_operator_purge_authorized(OLD.owner_id)
    AND (to_jsonb(NEW)-'owner_id')=(to_jsonb(OLD)-'owner_id') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.owner_id,OLD.owner_id)::text,1920424381));
  PERFORM pg_advisory_xact_lock(1920424395);
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operator action accounting must be retained'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.owner_id IS NULL OR NEW.day<>to_char(NEW.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') OR NEW.state<>'active'
      OR NEW.reserved_micros>NEW.owner_day_limit_micros OR NEW.reserved_micros>NEW.global_day_limit_micros THEN
      RAISE EXCEPTION 'Operator action authorization is invalid';
    END IF;
    INSERT INTO public.ai_operator_daily_budgets(day,scope) VALUES(NEW.day,'global'),(NEW.day,'owner:'||NEW.owner_id::text) ON CONFLICT DO NOTHING;
    SELECT * INTO budget_row FROM public.ai_operator_daily_budgets WHERE day=NEW.day AND scope='global' FOR UPDATE;
    IF budget_row.reserved_micros+budget_row.consumed_micros+NEW.reserved_micros>NEW.global_day_limit_micros THEN
      RAISE EXCEPTION 'Global operator daily allowance is exhausted';
    END IF;
    SELECT * INTO budget_row FROM public.ai_operator_daily_budgets WHERE day=NEW.day AND scope='owner:'||NEW.owner_id::text FOR UPDATE;
    IF budget_row.reserved_micros+budget_row.consumed_micros+NEW.reserved_micros>NEW.owner_day_limit_micros THEN
      RAISE EXCEPTION 'Account operator daily allowance is exhausted';
    END IF;
    UPDATE public.ai_operator_daily_budgets SET reserved_micros=reserved_micros+NEW.reserved_micros
      WHERE day=NEW.day AND scope IN ('global','owner:'||NEW.owner_id::text);
    RETURN NEW;
  END IF;
  IF OLD.state<>'active' OR NEW.state<>'settled' OR NEW.action_id<>OLD.action_id OR NEW.owner_id<>OLD.owner_id
    OR NEW.day<>OLD.day OR NEW.reserved_micros<>OLD.reserved_micros OR NEW.created_at<>OLD.created_at
    OR NEW.owner_day_limit_micros<>OLD.owner_day_limit_micros OR NEW.global_day_limit_micros<>OLD.global_day_limit_micros THEN
    RAISE EXCEPTION 'Operator action authorization and terminal outcome are immutable';
  END IF;
  SELECT coalesce(sum(coalesce(consumed_micros,reserved_micros)),0) INTO action_usage
    FROM public.ai_operator_attempt_costs WHERE action_id=NEW.action_id;
  IF action_usage<>NEW.consumed_micros OR action_usage>NEW.reserved_micros THEN RAISE EXCEPTION 'Operator action settlement is inconsistent'; END IF;
  UPDATE public.ai_operator_daily_budgets SET reserved_micros=reserved_micros-NEW.reserved_micros,consumed_micros=consumed_micros+NEW.consumed_micros
    WHERE day=NEW.day AND scope IN ('global','owner:'||NEW.owner_id::text) AND reserved_micros>=NEW.reserved_micros;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operator daily projection is inconsistent'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER languon_operator_action_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_operator_action_budgets
FOR EACH ROW EXECUTE FUNCTION languon_operator_action_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_operator_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_operator_action_budgets%ROWTYPE;
DECLARE used bigint;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operator attempt accounting must be retained'; END IF;
  SELECT * INTO action_row FROM public.ai_operator_action_budgets WHERE action_id=NEW.action_id FOR UPDATE;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider attempt has no active operator authorization'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT coalesce(sum(coalesce(consumed_micros,reserved_micros)),0) INTO used FROM public.ai_operator_attempt_costs WHERE action_id=NEW.action_id;
    IF NEW.settled_at IS NOT NULL OR NEW.consumed_micros IS NOT NULL OR used+NEW.reserved_micros>action_row.reserved_micros THEN
      RAISE EXCEPTION 'Provider attempt exceeds operator action authorization';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.settled_at IS NOT NULL OR NEW.settled_at IS NULL OR NEW.attempt_id<>OLD.attempt_id OR NEW.action_id<>OLD.action_id
    OR NEW.reserved_micros<>OLD.reserved_micros OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'Operator provider attempt accounting is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER languon_operator_attempt_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_operator_attempt_costs
FOR EACH ROW EXECUTE FUNCTION languon_operator_attempt_guard();

--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_operator_purge_authorized(uuid) FROM PUBLIC;
--> statement-breakpoint
-- Install after languon_mark_accounting_reports_dirty and its version columns.
-- Holds/releases never touch report snapshots or their global mutation locks.
-- Both legacy reservations and new action settlement update these same grants.
CREATE FUNCTION languon_ai_credit_mark_terminal_reports_dirty() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM languon_mark_accounting_reports_dirty();
    RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_grant_balances_report_dirty AFTER UPDATE ON ai_credit_grant_balances
FOR EACH ROW WHEN (OLD.consumed_credits IS DISTINCT FROM NEW.consumed_credits
    OR OLD.removed_credits IS DISTINCT FROM NEW.removed_credits)
EXECUTE FUNCTION languon_ai_credit_mark_terminal_reports_dirty();
--> statement-breakpoint
-- Forward overrides after initial0089; preserve installed triggers and counters.
CREATE OR REPLACE FUNCTION languon_text_ai_usage_delta(usage_row text_ai_capacity_provider_usage, direction_value integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE scope_value text;
BEGIN
    -- Zero-valued source records still identify active overlap, but never own a
    -- counter contribution. Multiple zero records must not depend on an empty
    -- aggregate row remaining present after another record is removed.
    IF usage_row.cost=0 AND usage_row.input_tokens=0 AND usage_row.output_tokens=0 THEN RETURN; END IF;
    FOREACH scope_value IN ARRAY ARRAY['global', usage_row.owner_id::text] LOOP
        IF direction_value < 0 THEN
            IF usage_row.state='active' THEN
                UPDATE text_ai_capacity_active_totals SET cost=cost-usage_row.cost,
                    input_tokens=input_tokens-usage_row.input_tokens, output_tokens=output_tokens-usage_row.output_tokens
                WHERE scope=scope_value AND cohort=usage_row.cohort;
            ELSE
                UPDATE text_ai_capacity_settled_buckets SET cost=cost-usage_row.cost,
                    input_tokens=input_tokens-usage_row.input_tokens, output_tokens=output_tokens-usage_row.output_tokens
                WHERE scope=scope_value AND cohort=usage_row.cohort AND minute=date_trunc('minute',usage_row.settled_at);
            END IF;
            IF NOT FOUND THEN RAISE EXCEPTION 'Missing provider capacity projection' USING ERRCODE='23514'; END IF;
            DELETE FROM text_ai_capacity_active_totals WHERE scope=scope_value AND cohort=usage_row.cohort AND cost=0 AND input_tokens=0 AND output_tokens=0;
            DELETE FROM text_ai_capacity_settled_buckets WHERE scope=scope_value AND cohort=usage_row.cohort AND minute=date_trunc('minute',usage_row.settled_at) AND cost=0 AND input_tokens=0 AND output_tokens=0;
        ELSIF usage_row.state = 'active' THEN
            INSERT INTO text_ai_capacity_active_totals(scope,cohort,cost,input_tokens,output_tokens)
            VALUES(scope_value,usage_row.cohort,direction_value*usage_row.cost,direction_value*usage_row.input_tokens,direction_value*usage_row.output_tokens)
            ON CONFLICT(scope,cohort) DO UPDATE SET
                cost=text_ai_capacity_active_totals.cost+excluded.cost,
                input_tokens=text_ai_capacity_active_totals.input_tokens+excluded.input_tokens,
                output_tokens=text_ai_capacity_active_totals.output_tokens+excluded.output_tokens;
        ELSE
            INSERT INTO text_ai_capacity_settled_buckets(scope,cohort,minute,cost,input_tokens,output_tokens)
            VALUES(scope_value,usage_row.cohort,date_trunc('minute',usage_row.settled_at),direction_value*usage_row.cost,direction_value*usage_row.input_tokens,direction_value*usage_row.output_tokens)
            ON CONFLICT(scope,cohort,minute) DO UPDATE SET
                cost=text_ai_capacity_settled_buckets.cost+excluded.cost,
                input_tokens=text_ai_capacity_settled_buckets.input_tokens+excluded.input_tokens,
                output_tokens=text_ai_capacity_settled_buckets.output_tokens+excluded.output_tokens;
        END IF;
    END LOOP;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_text_ai_project_provider(source_value text, row_value jsonb, deleting boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    old_row text_ai_capacity_provider_usage%ROWTYPE;
    new_row text_ai_capacity_provider_usage%ROWTYPE;
    archive_row jsonb;
    live_row jsonb;
    live_table text;
    budget_row jsonb;
    call_row boolean := source_value IN ('conversation_provider_calls','learner_portrait_interview_provider_calls');
    action_row boolean := source_value='ai_credit_action_attempts';
    archive_source boolean := source_value='dictionary_generation_provider_usage_archive';
    row_state text;
    action_capability text;
    ignore_source boolean := false;
BEGIN
    new_row.id := (row_value->>'id')::uuid;
    IF action_row THEN
        SELECT capability INTO action_capability FROM ai_credit_actions WHERE id=(row_value->>'action_id')::uuid;
        IF action_capability IS NULL THEN
            IF NOT deleting THEN RAISE EXCEPTION 'Action provider usage requires its parent action' USING ERRCODE='23514'; END IF;
            -- Parent deletion cascades after the parent becomes invisible. The
            -- existing numerical row retains the pinned kind; expired rows may
            -- already have been compacted and need no further delta.
            SELECT job_kind INTO new_row.job_kind FROM text_ai_capacity_provider_usage WHERE id=new_row.id;
            IF new_row.job_kind IS NULL THEN RETURN; END IF;
        ELSE
            new_row.job_kind := CASE action_capability
                WHEN 'conversation' THEN 'conversation-turn'
                WHEN 'portrait-interview' THEN 'portrait-interview'
                WHEN 'dictionary-generation' THEN 'dictionary-generation'
                WHEN 'sentence-generation' THEN 'sentence-generation'
                WHEN 'text-translation' THEN 'text-translation'
                WHEN 'speech' THEN 'speech-generation'
                ELSE NULL END;
            IF new_row.job_kind IS NULL THEN RAISE EXCEPTION 'Unknown action capacity capability' USING ERRCODE='23514'; END IF;
        END IF;
    ELSE
    new_row.job_kind := CASE source_value
        WHEN 'dictionary_generation_jobs' THEN 'dictionary-generation'
        WHEN 'conversation_provider_calls' THEN 'conversation-turn'
        WHEN 'learner_portrait_interview_provider_calls' THEN 'portrait-interview'
        WHEN 'dictionary_text_selection_jobs' THEN 'text-selection-card'
        ELSE row_value->>'job_kind' END;
    END IF;
    -- Versioned feature jobs retain provider lifecycle fields for their own
    -- state machine, while generic attempts alone own numerical capacity.
    ignore_source := coalesce(source_value IN ('dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs')
        AND row_value->'selected_execution_snapshot'->>'actionAccountingVersion'='1',false)
        OR (archive_source AND EXISTS(SELECT 1 FROM ai_credit_actions WHERE id=new_row.id));
    IF ignore_source THEN deleting := true; END IF;
    -- Only provider-bearing job tables reach this function. Guard same-id live
    -- and archival updates with one lock, retaining one numerical contribution.
    PERFORM pg_advisory_xact_lock(hashtextextended(new_row.id::text,4312189074));
    SELECT * INTO old_row FROM text_ai_capacity_provider_usage WHERE id=new_row.id AND job_kind=new_row.job_kind FOR UPDATE;
    IF NOT ignore_source THEN
    IF archive_source AND deleting THEN
        live_table := CASE new_row.job_kind
            WHEN 'dictionary-generation' THEN 'dictionary_generation_jobs'
            WHEN 'sentence-generation' THEN 'sentence_ai_jobs'
            WHEN 'sentence-check' THEN 'sentence_ai_jobs'
            WHEN 'text-detection' THEN 'texts_ai_jobs'
            WHEN 'text-translation' THEN 'texts_ai_jobs'
            WHEN 'text-selection-card' THEN 'dictionary_text_selection_jobs'
            WHEN 'conversation-turn' THEN 'conversation_provider_calls'
            WHEN 'portrait-interview' THEN 'learner_portrait_interview_provider_calls' END;
        IF live_table IS NOT NULL THEN
            EXECUTE format('select to_jsonb(t) from %I t where id=$1',live_table) INTO live_row USING new_row.id;
        END IF;
        IF live_row IS NOT NULL THEN
            PERFORM languon_text_ai_project_provider(live_table,live_row,false);
            RETURN;
        END IF;
    ELSIF NOT archive_source THEN
        SELECT to_jsonb(a) INTO archive_row FROM dictionary_generation_provider_usage_archive a
        WHERE a.id=new_row.id AND a.job_kind=new_row.job_kind;
        IF archive_row IS NOT NULL AND (deleting OR coalesce(row_value->>'provider_reservation_state',row_value->>'state')='settled') THEN
            PERFORM languon_text_ai_project_provider('dictionary_generation_provider_usage_archive',archive_row,false);
            RETURN;
        END IF;
    END IF;
    END IF;
    IF NOT deleting THEN
        IF action_row THEN
            SELECT owner_id INTO new_row.owner_id FROM ai_credit_actions WHERE id=(row_value->>'action_id')::uuid;
            budget_row := row_value->'budget';
            new_row.cohort := concat_ws(':',budget_row->>'inputCostMicrosPerMillionTokens',budget_row->>'outputCostMicrosPerMillionTokens',budget_row->>'maxCostMicrosPerAttempt',budget_row->>'maxInputTokensPerAttempt',budget_row->>'maxOutputTokensPerAttempt');
            row_state := CASE WHEN row_value->>'settled_at' IS NULL THEN 'active' ELSE 'settled' END;
            new_row.cost := CASE WHEN row_state='active' THEN (row_value->>'reserved_cost_micros')::bigint ELSE coalesce((row_value->>'actual_cost_micros')::bigint,(row_value->>'reserved_cost_micros')::bigint) END;
            new_row.input_tokens := CASE WHEN row_state='active' THEN (row_value->>'input_limit')::bigint ELSE coalesce((row_value->>'input_tokens')::bigint,(row_value->>'input_limit')::bigint) END;
            new_row.output_tokens := CASE WHEN row_state='active' THEN (row_value->>'output_limit')::bigint ELSE coalesce((row_value->>'output_tokens')::bigint,(row_value->>'output_limit')::bigint) END;
            new_row.settled_at := (row_value->>'settled_at')::timestamptz;
        ELSE
            new_row.owner_id := coalesce(row_value->>'owner_id',row_value->>'learner_id')::uuid;
            row_state := CASE WHEN archive_source THEN 'settled'
                WHEN call_row THEN CASE WHEN row_value->>'state'='settled' THEN 'settled' ELSE 'active' END
                ELSE row_value->>'provider_reservation_state' END;
            IF call_row OR archive_source THEN
                new_row.cohort := concat_ws(':',row_value->>'input_cost_micros_per_million_tokens',row_value->>'output_cost_micros_per_million_tokens',row_value->>'max_cost_micros_per_attempt',row_value->>'max_input_tokens_per_attempt',row_value->>'max_output_tokens_per_attempt');
                new_row.cost := coalesce((row_value->>CASE WHEN row_state='active' THEN 'reserved_cost_micros' ELSE 'actual_cost_micros' END)::bigint,0);
                new_row.input_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'reserved_input_tokens' ELSE 'actual_input_tokens' END)::bigint,0);
                new_row.output_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'reserved_output_tokens' ELSE 'actual_output_tokens' END)::bigint,0);
                new_row.settled_at := (row_value->>'settled_at')::timestamptz;
            ELSE
                new_row.cohort := concat_ws(':',row_value->>'provider_input_cost_micros_per_million_tokens',row_value->>'provider_output_cost_micros_per_million_tokens',row_value->>'provider_max_cost_micros_per_attempt',row_value->>'provider_max_input_tokens_per_attempt',row_value->>'provider_max_output_tokens_per_attempt');
                new_row.cost := coalesce((row_value->>CASE WHEN row_state='active' THEN 'provider_reserved_cost_micros' ELSE 'provider_actual_cost_micros' END)::bigint,0);
                new_row.input_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'provider_reserved_input_tokens' ELSE 'provider_actual_input_tokens' END)::bigint,0);
                new_row.output_tokens := coalesce((row_value->>CASE WHEN row_state='active' THEN 'provider_reserved_output_tokens' ELSE 'provider_actual_output_tokens' END)::bigint,0);
                new_row.settled_at := (row_value->>'provider_reservation_settled_at')::timestamptz;
            END IF;
        END IF;
        new_row.state := row_state;
        new_row.archived := archive_source;
        IF row_state NOT IN ('active','settled') OR row_state IS NULL THEN deleting := true; END IF;
        IF row_state='settled' AND new_row.settled_at IS NULL THEN
            RAISE EXCEPTION 'Settled provider usage requires settlement timestamp' USING ERRCODE='23514';
        END IF;
    END IF;
    IF NOT deleting AND old_row IS NOT DISTINCT FROM new_row THEN RETURN; END IF;
    IF old_row.id IS NOT NULL THEN
        PERFORM languon_text_ai_usage_delta(old_row,-1);
        DELETE FROM text_ai_capacity_provider_usage WHERE id=old_row.id AND job_kind=old_row.job_kind;
    END IF;
    IF NOT deleting THEN
        INSERT INTO text_ai_capacity_provider_usage SELECT (new_row).*;
        PERFORM languon_text_ai_usage_delta(new_row,1);
    END IF;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_text_ai_project_provider_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP='UPDATE' AND ((to_jsonb(OLD)->>'id') IS DISTINCT FROM (to_jsonb(NEW)->>'id')
        OR (to_jsonb(OLD)->>'job_kind') IS DISTINCT FROM (to_jsonb(NEW)->>'job_kind')) THEN
        PERFORM languon_text_ai_project_provider(TG_TABLE_NAME,to_jsonb(OLD),true);
    END IF;
    PERFORM languon_text_ai_project_provider(TG_TABLE_NAME, CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END, TG_OP='DELETE');
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

--> statement-breakpoint
-- Old bootstrap may have materialized empty totals for all-zero source rows.
-- They no longer represent any contribution after the delta short-circuit.
DO $$
DECLARE
    previous_marker text := current_setting('languon.text_ai_capacity_maintenance',true);
    candidate record;
    old_usage text_ai_capacity_provider_usage%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(4312189072);
    PERFORM set_config('languon.text_ai_capacity_maintenance','1',true);
    -- Drop historical job-level summaries for whole-action jobs. Their generic
    -- attempts have distinct identities and remain the sole capacity authority,
    -- including after the private job has been archived or erased.
    FOR candidate IN SELECT u.id,u.job_kind FROM text_ai_capacity_provider_usage u
        JOIN ai_credit_actions a ON a.id=u.id LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(candidate.id::text,4312189074));
        SELECT * INTO old_usage FROM text_ai_capacity_provider_usage
            WHERE id=candidate.id AND job_kind=candidate.job_kind FOR UPDATE;
        IF old_usage.id IS NOT NULL THEN
            PERFORM languon_text_ai_usage_delta(old_usage,-1);
            DELETE FROM text_ai_capacity_provider_usage WHERE id=candidate.id AND job_kind=candidate.job_kind;
        END IF;
    END LOOP;
    -- Repair already-projected portrait action attempts from the old bootstrap;
    -- move their contribution instead of retaining a second conversation row.
    FOR candidate IN SELECT t.id, to_jsonb(t) AS payload FROM ai_credit_action_attempts t
        JOIN ai_credit_actions a ON a.id=t.action_id
        JOIN text_ai_capacity_provider_usage u ON u.id=t.id AND u.job_kind='conversation-turn'
        WHERE a.capability='portrait-interview' LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(candidate.id::text,4312189074));
        SELECT * INTO old_usage FROM text_ai_capacity_provider_usage
            WHERE id=candidate.id AND job_kind='conversation-turn' FOR UPDATE;
        IF old_usage.id IS NOT NULL THEN
            PERFORM languon_text_ai_usage_delta(old_usage,-1);
            DELETE FROM text_ai_capacity_provider_usage WHERE id=candidate.id AND job_kind='conversation-turn';
        END IF;
        PERFORM languon_text_ai_project_provider('ai_credit_action_attempts',candidate.payload,false);
    END LOOP;
    DELETE FROM text_ai_capacity_active_totals WHERE cost=0 AND input_tokens=0 AND output_tokens=0;
    DELETE FROM text_ai_capacity_settled_buckets WHERE cost=0 AND input_tokens=0 AND output_tokens=0;
    PERFORM set_config('languon.text_ai_capacity_maintenance',coalesce(previous_marker,''),true);
END; $$;
--> statement-breakpoint
CREATE TRIGGER ai_provider_price_revision_immutable BEFORE UPDATE OR DELETE ON ai_provider_price_revisions
FOR EACH ROW EXECUTE FUNCTION languon_guard_accounting_policy_revision();
