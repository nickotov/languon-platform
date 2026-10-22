-- Forward-only checked accounting authority after 0100 schema.
-- Source: .agent/features/052-ai-accounting/wallet-projections.sql
-- SHA256: d79a55fa4a4d72dbb8749024610fb568421767675f3c36f98adad6bf0bf30f03
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_projection() RETURNS trigger
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
-- Source: .agent/features/052-ai-accounting/conversation-action-accounting.sql
-- SHA256: bbc19599616aeeeac21dbf3feaa858277c4ca4acea7ba64311c753e43b3b25fa
CREATE OR REPLACE FUNCTION ai_credit_action_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE;
DECLARE count_calls integer;
DECLARE output_used bigint;
BEGIN
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.actual_cost_micros IS NOT DISTINCT FROM (public.languon_text_provider_expense_identity(OLD.id)->>'amountUsdMicros')::bigint
     AND (to_jsonb(NEW)-'actual_cost_micros')=(to_jsonb(OLD)-'actual_cost_micros') THEN RETURN NEW; END IF;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider dispatch requires active action authorization'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'dispatched' OR NEW.state<>'settled' OR
      NEW.id<>OLD.id OR NEW.action_id<>OLD.action_id OR NEW.execution_job_id IS DISTINCT FROM OLD.execution_job_id OR NEW.ordinal<>OLD.ordinal OR NEW.purpose<>OLD.purpose
      OR NEW.input_limit<>OLD.input_limit OR NEW.output_limit<>OLD.output_limit OR NEW.budget<>OLD.budget
      OR NEW.reserved_cost_micros<>OLD.reserved_cost_micros OR NEW.created_at<>OLD.created_at THEN
      RAISE EXCEPTION 'Provider attempt identity and final usage are immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs o JOIN public.ai_operator_action_budgets a ON a.action_id=o.action_id
    WHERE o.attempt_id=NEW.id AND o.action_id=NEW.action_id AND a.state='active' AND o.settled_at IS NULL AND o.reserved_micros>=NEW.reserved_cost_micros) THEN
    RAISE EXCEPTION 'Provider dispatch requires acknowledged operator cost authorization';
  END IF;
  IF NEW.created_at>=action_row.deadline_at OR NEW.state<>'dispatched' OR NEW.input_tokens IS NOT NULL OR NEW.output_tokens IS NOT NULL THEN
    RAISE EXCEPTION 'Provider dispatch is outside admitted execution';
  END IF;
  IF action_row.funding='customer' AND
    (SELECT coalesce(sum(allocated_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.action_id)<>action_row.held_milli THEN
    RAISE EXCEPTION 'Provider dispatch requires fully allocated action hold';
  END IF;
  SELECT count(*),coalesce(sum(coalesce(output_tokens,output_limit)),0) INTO count_calls,output_used
    FROM public.ai_credit_action_attempts WHERE action_id=NEW.action_id;
  IF NEW.ordinal<>count_calls+1 OR count_calls>=5 OR output_used+NEW.output_limit>action_row.output_limit THEN
    RAISE EXCEPTION 'Provider dispatch exceeds admitted action limits';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-immutability.sql
-- SHA256: 642dbd906a234cd23e4ce8fe14c34825898a6b9a7c48d3bd95c90b782443e024
CREATE OR REPLACE FUNCTION languon_guard_action_charging_policy() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_capability text; published ai_capability_policy_revisions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF public.languon_operator_purge_authorized(OLD.owner_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Admitted charging policies cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'Admitted charging policies are immutable' USING ERRCODE='23514';
  END IF;
  expected_capability := CASE NEW.job_kind
    WHEN 'portrait-interview' THEN 'portrait-interview'
    WHEN 'conversation-turn' THEN 'conversation'
    WHEN 'speech-generation' THEN 'speech'
    WHEN 'dictionary-generation' THEN 'dictionary-generation'
    WHEN 'sentence-generation' THEN 'sentence-generation'
    WHEN 'sentence-check' THEN 'sentence-generation'
    WHEN 'text-detection' THEN 'text-translation'
    WHEN 'text-translation' THEN 'text-translation'
    WHEN 'text-selection-card' THEN 'text-translation' END;
  IF expected_capability IS NULL OR NEW.policy->>'capability' IS DISTINCT FROM expected_capability
     OR NEW.policy - ARRAY['capability','version','revisionId','funding','updatedAt'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Action capability snapshot mismatch' USING ERRCODE='23514';
  END IF;
  IF (NEW.policy->>'version')::integer IS DISTINCT FROM
     (SELECT coalesce(max(version),0) FROM ai_capability_policy_revisions WHERE capability=expected_capability) THEN
    RAISE EXCEPTION 'New action requires the currently published charging policy' USING ERRCODE='23514';
  END IF;
  IF NEW.policy->>'version'='0' THEN
    IF NEW.policy->'revisionId' IS DISTINCT FROM 'null'::jsonb
       OR NEW.policy->'updatedAt' IS DISTINCT FROM 'null'::jsonb
       OR NEW.policy->>'funding' IS DISTINCT FROM (CASE WHEN expected_capability='portrait-interview' THEN 'operator' ELSE 'customer' END) THEN
      RAISE EXCEPTION 'Invalid initial charging policy' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO published FROM ai_capability_policy_revisions
      WHERE id=(NEW.policy->>'revisionId')::uuid AND capability=expected_capability;
    IF published.id IS NULL OR published.version::text IS DISTINCT FROM NEW.policy->>'version'
       OR published.funding IS DISTINCT FROM NEW.policy->>'funding'
       OR published.created_at IS DISTINCT FROM (NEW.policy->>'updatedAt')::timestamptz THEN
      RAISE EXCEPTION 'Charging policy provenance mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_guard_action_charging_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE job_owner uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ai_action_charging_policies WHERE job_id=NEW.job_id) THEN RETURN NULL; END IF;
  CASE NEW.job_kind
    WHEN 'dictionary-generation' THEN SELECT owner_id INTO job_owner FROM dictionary_generation_jobs WHERE id=NEW.job_id;
    WHEN 'speech-generation' THEN SELECT payer_id INTO job_owner FROM speech_jobs WHERE id=NEW.job_id;
    WHEN 'sentence-generation','sentence-check' THEN SELECT learner_id INTO job_owner FROM sentence_ai_jobs WHERE id=NEW.job_id AND job_kind=NEW.job_kind;
      IF job_owner IS NULL AND NEW.job_kind='sentence-generation' THEN SELECT p.learner_id INTO job_owner FROM sentence_preparation_actions m JOIN sentence_preparations p ON p.id=m.preparation_id WHERE m.action_id=NEW.job_id; END IF;
    WHEN 'text-detection','text-translation' THEN SELECT owner_id INTO job_owner FROM texts_ai_jobs WHERE id=NEW.job_id AND job_kind=NEW.job_kind;
    WHEN 'text-selection-card' THEN SELECT owner_id INTO job_owner FROM dictionary_text_selection_jobs WHERE id=NEW.job_id;
    WHEN 'portrait-interview' THEN SELECT owner_id INTO job_owner FROM learner_portrait_interview_operations WHERE id=NEW.job_id;
    WHEN 'conversation-turn' THEN SELECT owner_id INTO job_owner FROM conversation_turns WHERE id=NEW.job_id;
    ELSE RAISE EXCEPTION 'Unknown charging policy action' USING ERRCODE='23514';
  END CASE;
  IF job_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Charging policy requires its owned feature action' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
-- Source: .agent/features/052-ai-accounting/action-authority-guards.sql
-- SHA256: e5bab4e7191076500c0089dfdca94485a31bd3deee1d0f2505ec7d3450c49f1a
CREATE OR REPLACE FUNCTION languon_ai_credit_feature_authority(action_id_value uuid, kind_value text)
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
        IF owner_value IS NULL AND kind_value='sentence-generation' THEN
            SELECT p.learner_id,
                CASE m.terminal_outcome WHEN 'success' THEN 'completed' WHEN 'stopped' THEN 'cancelled' WHEN 'failure' THEN 'failed' ELSE 'running' END,
                m.terminal_outcome='stopped' AND EXISTS(SELECT 1 FROM sentence_preparation_commands c
                    WHERE c.preparation_id=p.id AND c.learner_id=p.learner_id AND c.action='stop' AND c.authorization_action_id=m.action_id)
            INTO owner_value,state_value,explicit_stop_value
            FROM sentence_preparation_actions m JOIN sentence_preparations p ON p.id=m.preparation_id
            WHERE m.action_id=action_id_value;
        END IF;
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
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_action_admission() RETURNS trigger
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
        ELSIF NOT effective_unlimited AND (NEW.funding<>'customer' OR (NEW.held_milli=0 AND NOT coalesce((
            (NEW.tariff->>'inputCreditsPerMillionTokens')::numeric=0
            AND coalesce((NEW.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(NEW.tariff->>'inputCreditsPerMillionTokens')::numeric)=0
            AND (NEW.tariff->>'outputCreditsPerMillionTokens')::numeric=0),false))) THEN
            RAISE EXCEPTION 'Customer action requires its finite credit hold' USING ERRCODE='23514';
        END IF;
    ELSE RAISE EXCEPTION 'Invalid pinned action funding' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_ai_credit_expected_outcome(feature_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
    SELECT CASE WHEN feature_value->>'state' IN ('completed','succeeded','ready') THEN 'success'
        WHEN feature_value->>'state'='cancelled' AND (feature_value->>'explicitStop')::boolean THEN 'stopped'
        WHEN feature_value->>'state' IN ('failed','cancelled','expired') THEN 'failure' ELSE NULL END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_ai_credit_guard_authority_proof() RETURNS trigger
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
CREATE OR REPLACE FUNCTION languon_ai_credit_record_feature_authority(action_id_value uuid,kind_value text)
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
CREATE OR REPLACE FUNCTION languon_ai_credit_feature_authority_trigger() RETURNS trigger
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
CREATE OR REPLACE FUNCTION languon_ai_credit_assert_action_authority(action_id_value uuid) RETURNS void
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
CREATE OR REPLACE FUNCTION languon_ai_credit_action_authority_constraint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE id_value uuid;
BEGIN
    id_value := CASE WHEN TG_TABLE_NAME='ai_credit_actions' THEN (to_jsonb(NEW)->>'id')::uuid
        WHEN TG_OP='DELETE' THEN (to_jsonb(OLD)->>'action_id')::uuid ELSE (to_jsonb(NEW)->>'action_id')::uuid END;
    PERFORM languon_ai_credit_assert_action_authority(id_value);
    RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_ai_credit_feature_authority_constraint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM languon_ai_credit_assert_action_authority(NEW.id);
    RETURN NULL;
END; $$;
--> statement-breakpoint
-- Source: .agent/features/052-ai-accounting/legacy-action-accounting.sql
-- SHA256: 2ff60a0abe0a2450778ad956dceb5321233eda7ae09c9937237e4b4a579b78eb
CREATE OR REPLACE FUNCTION guard_legacy_action_accounting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row_data jsonb; snapshot jsonb; action_row public.ai_credit_actions%ROWTYPE;
DECLARE job_owner uuid; kind text; expected_capability text; pin public.ai_action_charging_policies%ROWTYPE;
DECLARE parent_id uuid; prep_pin public.sentence_preparation_actions%ROWTYPE;
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
  parent_id := coalesce((snapshot->>'actionParentId')::uuid,NEW.id);
  IF parent_id<>NEW.id THEN
    IF TG_TABLE_NAME<>'sentence_ai_jobs' OR kind<>'sentence-generation' THEN RAISE EXCEPTION 'Invalid parent action capability' USING ERRCODE='23514'; END IF;
    SELECT m.* INTO prep_pin FROM public.sentence_preparation_actions m
      JOIN public.sentence_preparation_children c ON c.preparation_id=m.preparation_id AND c.job_id=NEW.id
      WHERE m.action_id=parent_id;
    IF prep_pin.action_id IS NULL OR (snapshot-'actionParentId') IS DISTINCT FROM prep_pin.selected_execution_snapshot
      OR (row_data->>'execution_revision_id')::uuid IS DISTINCT FROM prep_pin.execution_revision_id THEN
      RAISE EXCEPTION 'Preparation child must retain its approved parent execution' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=parent_id;
  SELECT * INTO pin FROM public.ai_action_charging_policies WHERE job_id=parent_id;
  IF action_row.id IS NULL OR action_row.owner_id<>job_owner OR action_row.capability<>expected_capability
    OR row_data->>'ai_credit_accounted'<>'false' OR row_data->>'ai_credit_reservation_id' IS NOT NULL
    OR action_row.funding IS DISTINCT FROM snapshot->>'actionFunding'
    OR action_row.budget_milli IS DISTINCT FROM (snapshot->>'actionBudgetMilli')::bigint
    OR action_row.policy_version IS DISTINCT FROM (snapshot->>'actionPolicyVersion')::integer
    OR action_row.output_limit NOT BETWEEN 1 AND 10000 OR (row_data->>'max_attempts')::integer>2
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
    SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=parent_id AND execution_job_id=NEW.id
      AND (SELECT count(*) FROM public.ai_credit_action_attempts WHERE action_id=parent_id AND execution_job_id=NEW.id)>=(row_data->>'attempt_count')::integer
  ) THEN
    RAISE EXCEPTION 'Running feature attempt requires durable action allowance' USING ERRCODE='23514';
  END IF;
  IF parent_id<>NEW.id THEN
    IF row_data->>'execution_state' IN ('completed','failed','cancelled','expired') AND EXISTS(
      SELECT 1 FROM public.ai_credit_action_attempts t LEFT JOIN public.ai_provider_expense_records e ON e.attempt_id=t.id
      WHERE t.action_id=parent_id AND t.execution_job_id=NEW.id AND (t.state<>'settled' OR e.id IS NULL)
    ) THEN RAISE EXCEPTION 'Preparation child usage must settle before its result' USING ERRCODE='23514'; END IF;
    IF row_data->>'execution_state' IN ('queued','running') AND action_row.state<>'active' THEN
      RAISE EXCEPTION 'Live preparation child requires remaining parent authorization' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
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
CREATE OR REPLACE FUNCTION guard_legacy_action_erasure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=coalesce((OLD.selected_execution_snapshot->>'actionParentId')::uuid,OLD.id) AND state='active') THEN
    RAISE EXCEPTION 'An active action prevents feature job erasure' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END $$;
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
-- Source: .agent/features/052-ai-accounting/operator-budget-guards.sql
-- SHA256: 21c133131c6e8c4ee9fb620769714463a858f77b067b1c5ca83e6b384dd960ec
CREATE OR REPLACE FUNCTION languon_operator_action_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE budget_row record;
DECLARE action_usage bigint;
DECLARE settings_row public.ai_accounting_settings_revisions%ROWTYPE;
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
    SELECT * INTO settings_row FROM public.ai_accounting_settings_revisions ORDER BY version DESC LIMIT 1;
    IF settings_row.id IS NULL OR settings_row.max_provider_cost_usd_per_action IS NULL
      OR settings_row.max_provider_cost_usd_per_account_day IS NULL OR settings_row.max_provider_cost_usd_per_day IS NULL
      OR NEW.reserved_micros>(settings_row.max_provider_cost_usd_per_action::numeric*1000000)::bigint
      OR NEW.owner_day_limit_micros IS DISTINCT FROM (settings_row.max_provider_cost_usd_per_account_day::numeric*1000000)::bigint
      OR NEW.global_day_limit_micros IS DISTINCT FROM (settings_row.max_provider_cost_usd_per_day::numeric*1000000)::bigint THEN
      RAISE EXCEPTION 'Operator authorization must use the current reviewed application limits' USING ERRCODE='23514';
    END IF;
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
--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-report-dirty.sql
-- SHA256: 77e48396ed4e9af1f3c75bf16a57e9bfd462de4b2ec0b0c7c76a9107d6274a25
-- Installed after report snapshot version columns. Never invoke during admission.
-- Manual/expense adapters invoke this transactionally after their fact insert.
-- Wallet projection invokes it only for consumed/removal deltas, never hold/release.
CREATE OR REPLACE FUNCTION languon_mark_accounting_reports_dirty() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
  WITH locked AS MATERIALIZED (
    SELECT key FROM public.ai_accounting_report_snapshots ORDER BY key FOR UPDATE
  )
  UPDATE public.ai_accounting_report_snapshots target
  SET change_version=target.change_version+1
  FROM locked WHERE target.key=locked.key;
$$;

REVOKE ALL ON FUNCTION languon_mark_accounting_reports_dirty() FROM PUBLIC;
--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql
-- SHA256: 7f12e36f50ae67e32dd22d3bff4234be103e12827ac9aea2a364f335792a5181
-- Numerical provenance is resolved behind this seam; worker callers cannot select arbitrary rates.
CREATE OR REPLACE FUNCTION languon_text_provider_expense_identity(attempt_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; k text; execution_value jsonb; snapshot_value jsonb; price_value jsonb; p public.ai_provider_price_revisions%ROWTYPE; provider_value text; model_value text; amount_value bigint; numerator numeric; ref text;
BEGIN
  SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value;
  IF NOT FOUND OR a.state<>'settled' THEN RAISE EXCEPTION 'Expense requires its settled authoritative attempt' USING ERRCODE='23514'; END IF;
  SELECT job_kind INTO k FROM public.ai_action_charging_policies WHERE job_id=a.action_id;
  CASE k
    WHEN 'conversation-turn' THEN SELECT execution INTO execution_value FROM public.conversation_turns WHERE id=a.action_id; ref:='conversation:';
    WHEN 'portrait-interview' THEN SELECT execution INTO execution_value FROM public.learner_portrait_interview_operations WHERE id=a.action_id; ref:='interview:';
    WHEN 'dictionary-generation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.dictionary_generation_jobs WHERE id=a.action_id; ref:='legacy:';
    WHEN 'sentence-preparation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_preparation_actions WHERE action_id=a.action_id; ref:='legacy:';
    WHEN 'sentence-generation','sentence-check' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_ai_jobs WHERE id=a.action_id; IF execution_value IS NULL THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_preparation_actions WHERE action_id=a.action_id; END IF; ref:='legacy:';
    WHEN 'text-detection','text-translation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.texts_ai_jobs WHERE id=a.action_id; ref:='legacy:';
    WHEN 'text-selection-card' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.dictionary_text_selection_jobs WHERE id=a.action_id; ref:='legacy:';
    ELSE RAISE EXCEPTION 'Expense has no typed feature provenance' USING ERRCODE='23514';
  END CASE;
  snapshot_value:=coalesce(execution_value->'snapshot',execution_value);
  price_value:=coalesce(execution_value->'providerPrice',execution_value->'actionProviderPrice');
  provider_value:=snapshot_value->>'providerId'; model_value:=snapshot_value->>'modelId';
  SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(price_value->>'id')::uuid;
  IF execution_value->>'actionAccountingVersion' IS DISTINCT FROM '1' OR p.id IS NULL OR p.provider_id IS DISTINCT FROM provider_value OR p.model_id IS DISTINCT FROM model_value OR p.meter<>'text-tokens' OR p.version IS DISTINCT FROM (price_value->>'version')::integer OR p.effective_at>a.created_at THEN
    RAISE EXCEPTION 'Expense requires its immutable reviewed provider pin' USING ERRCODE='23514';
  END IF;
  IF a.input_tokens IS NOT NULL AND a.output_tokens IS NOT NULL THEN
    IF a.input_tokens<0 OR a.output_tokens<0 OR a.input_tokens>a.input_limit OR a.output_tokens>a.output_limit OR coalesce(a.cache_read_tokens,0)+coalesce(a.cache_write_tokens,0)>a.input_tokens THEN RAISE EXCEPTION 'Expense meters exceed admitted attempt' USING ERRCODE='23514'; END IF;
    IF p.data->>'inputUsdPerMillionTokens' IS NOT NULL AND p.data->>'outputUsdPerMillionTokens' IS NOT NULL
       AND (coalesce(a.cache_read_tokens,0)=0 OR p.data->>'cacheReadUsdPerMillionTokens' IS NOT NULL)
       AND (coalesce(a.cache_write_tokens,0)=0 OR p.data->>'cacheWriteUsdPerMillionTokens' IS NOT NULL) THEN
      numerator:=(a.input_tokens-coalesce(a.cache_read_tokens,0)-coalesce(a.cache_write_tokens,0))*(p.data->>'inputUsdPerMillionTokens')::numeric
        +a.output_tokens*(p.data->>'outputUsdPerMillionTokens')::numeric
        +coalesce(a.cache_read_tokens,0)*coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0)
        +coalesce(a.cache_write_tokens,0)*coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0);
      amount_value:=ceil(numerator)::bigint; -- USD/token-million * micro-USD/USD cancels exactly.
    END IF;
  END IF;
  RETURN jsonb_build_object('attemptId',a.id,'actionId',a.action_id,'attemptReference',ref||a.id::text,'sourceKind','text-attempt','providerId',provider_value,'modelId',model_value,'measurement',CASE WHEN a.input_tokens IS NOT NULL AND a.output_tokens IS NOT NULL THEN 'measured' ELSE 'unknown' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',a.created_at);
END $$;
REVOKE ALL ON FUNCTION languon_text_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_text_provider_expense(attempt_value uuid, assertion_value jsonb DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb; found_row public.ai_provider_expense_records%ROWTYPE; owner_value uuid;
BEGIN
  SELECT c.owner_id INTO owner_value FROM public.ai_credit_action_attempts t JOIN public.ai_credit_actions c ON c.id=t.action_id WHERE t.id=attempt_value;
  IF owner_value IS NULL THEN RAISE EXCEPTION 'Expense attempt is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
  e:=public.languon_text_provider_expense_identity(attempt_value);
  IF assertion_value IS NOT NULL AND (
    assertion_value->>'attemptId' IS DISTINCT FROM e->>'attemptId' OR assertion_value->>'actionId' IS DISTINCT FROM e->>'actionId'
    OR assertion_value->>'attemptReference' IS DISTINCT FROM e->>'attemptReference' OR assertion_value->>'providerId' IS DISTINCT FROM e->>'providerId'
    OR assertion_value->>'modelId' IS DISTINCT FROM e->>'modelId' OR assertion_value->>'measurement' IS DISTINCT FROM e->>'measurement'
    OR assertion_value->>'costSource' IS DISTINCT FROM e->>'costSource' OR assertion_value->>'amountUsdMicros' IS DISTINCT FROM e->>'amountUsdMicros'
    OR (assertion_value->>'occurredAt')::timestamptz IS DISTINCT FROM (e->>'occurredAt')::timestamptz) THEN
    RAISE EXCEPTION 'Provider expense assertion conflicts with authoritative fact' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_id,action_id,attempt_reference,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
    VALUES(gen_random_uuid(),'text-attempt',attempt_value,(e->>'actionId')::uuid,e->>'attemptReference',e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',(e->>'amountUsdMicros')::bigint,(e->>'occurredAt')::timestamptz) ON CONFLICT(attempt_reference) DO NOTHING;
  SELECT * INTO found_row FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
  IF found_row.source_kind<>'text-attempt' OR found_row.attempt_id IS DISTINCT FROM attempt_value OR found_row.action_id IS DISTINCT FROM (e->>'actionId')::uuid OR found_row.provider_id IS DISTINCT FROM e->>'providerId' OR found_row.model_id IS DISTINCT FROM e->>'modelId' OR found_row.measurement IS DISTINCT FROM e->>'measurement' OR found_row.cost_source IS DISTINCT FROM e->>'costSource' OR found_row.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR found_row.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN
    RAISE EXCEPTION 'Provider expense fact conflicts with immutable authority' USING ERRCODE='23514';
  END IF;
  PERFORM public.languon_mark_accounting_reports_dirty();
  RETURN found_row.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_text_provider_expense(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_text_provider_attempt(attempt_value uuid, successful_value boolean, input_value integer, output_value integer, read_value integer, write_value integer, at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; owner_value uuid; e jsonb; cost_value bigint; o public.ai_operator_attempt_costs%ROWTYPE;
BEGIN
  SELECT c.owner_id INTO owner_value FROM public.ai_credit_action_attempts t JOIN public.ai_credit_actions c ON c.id=t.action_id WHERE t.id=attempt_value;
  IF owner_value IS NULL THEN RAISE EXCEPTION 'Provider attempt is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
  SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value FOR UPDATE;
  IF a.state='settled' THEN
    IF (a.input_tokens,a.output_tokens,a.cache_read_tokens,a.cache_write_tokens,a.successful) IS DISTINCT FROM (input_value,output_value,read_value,write_value,CASE WHEN successful_value AND input_value IS NOT NULL AND output_value IS NOT NULL THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Provider attempt replay differs from immutable usage' USING ERRCODE='23514'; END IF;
    PERFORM public.languon_record_text_provider_expense(attempt_value,NULL); RETURN;
  END IF;
  IF (input_value IS NULL) IS DISTINCT FROM (output_value IS NULL) OR input_value<0 OR output_value<0 OR input_value>a.input_limit OR output_value>a.output_limit OR coalesce(read_value,0)<0 OR coalesce(write_value,0)<0 OR coalesce(read_value,0)+coalesce(write_value,0)>input_value THEN RAISE EXCEPTION 'Invalid provider usage meters' USING ERRCODE='23514'; END IF;
  -- The trigger validates immutable identity; price accounting is derived after these trusted meters persist.
  UPDATE public.ai_credit_action_attempts SET state='settled',input_tokens=input_value,output_tokens=output_value,cache_read_tokens=read_value,cache_write_tokens=write_value,successful=CASE WHEN successful_value AND input_value IS NOT NULL THEN 1 ELSE 0 END,actual_cost_micros=NULL,settled_at=at_value WHERE id=attempt_value;
  e:=public.languon_text_provider_expense_identity(attempt_value); cost_value:=(e->>'amountUsdMicros')::bigint;
  UPDATE public.ai_credit_action_attempts SET actual_cost_micros=cost_value WHERE id=attempt_value AND actual_cost_micros IS DISTINCT FROM cost_value;
  SELECT * INTO o FROM public.ai_operator_attempt_costs WHERE attempt_id=attempt_value AND action_id=a.action_id FOR UPDATE;
  IF o.attempt_id IS NULL OR (cost_value IS NOT NULL AND cost_value>o.reserved_micros) THEN RAISE EXCEPTION 'Provider cost exceeds its authoritative reservation' USING ERRCODE='23514'; END IF;
  UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(cost_value,reserved_micros),measurement=CASE WHEN cost_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=at_value WHERE attempt_id=attempt_value AND settled_at IS NULL;
  PERFORM public.languon_record_text_provider_expense(attempt_value,NULL);
END $$;
REVOKE ALL ON FUNCTION languon_settle_text_provider_attempt(uuid,boolean,integer,integer,integer,integer,timestamptz) FROM PUBLIC;

-- Append-only financial facts accept only exact closed numerical provenance.
CREATE OR REPLACE FUNCTION languon_guard_provider_expense_fact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.source_kind='text-attempt' AND NEW.attempt_id IS NOT NULL THEN e:=public.languon_text_provider_expense_identity(NEW.attempt_id);
    ELSIF NEW.source_kind='speech-attempt' AND NEW.attempt_id IS NULL THEN e:=public.languon_speech_provider_expense_identity(NEW.action_id);
    ELSE RAISE EXCEPTION 'Unbound provider expense facts are forbidden' USING ERRCODE='23514'; END IF;
    IF NEW.action_id IS DISTINCT FROM (e->>'actionId')::uuid OR NEW.attempt_reference IS DISTINCT FROM e->>'attemptReference' OR NEW.provider_id IS DISTINCT FROM e->>'providerId' OR NEW.model_id IS DISTINCT FROM e->>'modelId' OR NEW.measurement IS DISTINCT FROM e->>'measurement' OR NEW.cost_source IS DISTINCT FROM e->>'costSource' OR NEW.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR NEW.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN RAISE EXCEPTION 'Provider expense does not match authoritative provenance' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS NULL AND (to_jsonb(NEW)-'attempt_id')=(to_jsonb(OLD)-'attempt_id') AND NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id) AND public.languon_operator_purge_authorized(nullif(current_setting('languon.ai_credit_purge_owner',true),'')::uuid) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Provider expense facts are immutable' USING ERRCODE='23514';
END $$;
--> statement-breakpoint
-- Source: apps/backend/src/modules/speech/infrastructure/speech-accounting-guards.sql
-- SHA256: d3a4854dfb2065aa605ae1d9d352424c70f99a671b4e4983efff8d116c95304f
-- Speech keeps its success-only customer hold, but every new clip has independent USD authorization.
CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.accounting_version,NEW.provider_price_snapshot,NEW.provider_character_count)
      IS DISTINCT FROM (OLD.accounting_version,OLD.provider_price_snapshot,OLD.provider_character_count) THEN
    RAISE EXCEPTION 'Speech provider accounting admission is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.provider_outcome IS NOT NULL AND NEW.provider_outcome IS DISTINCT FROM OLD.provider_outcome THEN RAISE EXCEPTION 'Speech provider outcome is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.provider_dispatched_at IS NOT NULL AND NEW.provider_dispatched_at IS DISTINCT FROM OLD.provider_dispatched_at THEN
    RAISE EXCEPTION 'Speech provider dispatch identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.speech_jobs WHERE id=NEW.id;
  IF NOT FOUND OR j.accounting_version<>1 THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id) THEN
    RAISE EXCEPTION 'Speech requires shared operator authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs a WHERE a.action_id=j.id AND a.attempt_id=j.id) THEN
    RAISE EXCEPTION 'Speech dispatch requires provider attempt authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('ready','failed','submission_unknown') THEN
    IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id AND b.state='settled') THEN
      RAISE EXCEPTION 'Terminal speech requires settled operator accounting' USING ERRCODE='23514';
    END IF;
    IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_provider_expense_records e WHERE e.action_id=j.id AND e.attempt_reference='speech:'||j.id::text) THEN
      RAISE EXCEPTION 'Terminal speech requires a provider expense fact' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;


CREATE OR REPLACE FUNCTION languon_speech_provider_expense_identity(job_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; amount_value bigint;
BEGIN
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR j.provider_outcome IS NULL OR p.id IS NULL OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId' OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId' OR p.meter<>'speech-characters' OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.effective_at>j.created_at OR p.data->>'usdPer1000Characters' IS DISTINCT FROM j.provider_price_snapshot->>'usdPer1000Characters' THEN RAISE EXCEPTION 'Speech expense requires its dispatched reviewed provenance' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome='ready' THEN amount_value:=ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint;
 ELSIF j.provider_outcome='not_submitted' THEN amount_value:=0;
 ELSIF j.provider_outcome<>'unknown' THEN RAISE EXCEPTION 'Unknown speech provider outcome' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('sourceKind','speech-attempt','attemptReference','speech:'||j.id::text,'actionId',j.id,'providerId',p.provider_id,'modelId',p.model_id,'measurement',CASE j.provider_outcome WHEN 'ready' THEN 'estimated' WHEN 'not_submitted' THEN 'measured' ELSE 'unknown' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',j.provider_dispatched_at);
END $$;
REVOKE ALL ON FUNCTION languon_speech_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_speech_provider_expense(job_value uuid,outcome_value text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; e jsonb; f public.ai_provider_expense_records%ROWTYPE; o public.ai_operator_attempt_costs%ROWTYPE; b public.ai_operator_action_budgets%ROWTYPE; owner_value uuid; amount_value bigint;
BEGIN
 SELECT payer_id INTO owner_value FROM public.speech_jobs WHERE id=job_value;
 IF owner_value IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); END IF;
 PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NOT NULL AND j.accounting_version=1 AND j.provider_dispatched_at IS NULL AND outcome_value='not_submitted' AND (j.queue_deadline<=clock_timestamp() OR public.languon_operator_purge_authorized(j.payer_id)) THEN
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id AND state='active'; RETURN NULL;
 END IF;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR outcome_value NOT IN ('ready','unknown','not_submitted') THEN RAISE EXCEPTION 'Unbound speech provider observation' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NOT NULL AND j.provider_outcome<>outcome_value THEN RAISE EXCEPTION 'Speech provider observation replay conflicts with first outcome' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NULL THEN
   IF j.payer_id IS NULL THEN RAISE EXCEPTION 'Erased speech cannot create new provider facts' USING ERRCODE='23514'; END IF;
   IF outcome_value='ready' AND (j.state<>'storing' OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND checksum IS NOT NULL AND byte_length>0)) THEN RAISE EXCEPTION 'Ready expense requires acknowledged synthesis output' USING ERRCODE='23514'; END IF;
   IF outcome_value='not_submitted' AND (j.state<>'submitting' OR j.task_id IS NOT NULL OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Zero speech expense requires a live unsubmitted operation' USING ERRCODE='23514'; END IF;
   IF outcome_value='unknown' AND j.state NOT IN ('submitting','processing','storing','submission_unknown','failed') THEN RAISE EXCEPTION 'Unknown speech expense requires dispatched work' USING ERRCODE='23514'; END IF;
   UPDATE public.speech_jobs SET provider_outcome=outcome_value WHERE id=job_value;
 END IF;
 e:=public.languon_speech_provider_expense_identity(job_value); amount_value:=(e->>'amountUsdMicros')::bigint;
 INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_reference,action_id,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
 VALUES(gen_random_uuid(),'speech-attempt',e->>'attemptReference',job_value,e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',amount_value,(e->>'occurredAt')::timestamptz) ON CONFLICT(attempt_reference) DO NOTHING;
 SELECT * INTO f FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
 IF f.source_kind<>'speech-attempt' OR f.attempt_id IS NOT NULL OR f.action_id<>job_value OR f.provider_id IS DISTINCT FROM e->>'providerId' OR f.model_id IS DISTINCT FROM e->>'modelId' OR f.amount_usd_micros IS DISTINCT FROM amount_value OR f.measurement IS DISTINCT FROM e->>'measurement' OR f.cost_source IS DISTINCT FROM e->>'costSource' OR f.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN RAISE EXCEPTION 'Speech expense conflicts with authoritative fact' USING ERRCODE='23514'; END IF;
 SELECT * INTO b FROM public.ai_operator_action_budgets WHERE action_id=job_value FOR UPDATE;
 IF b.state='active' THEN
   SELECT * INTO o FROM public.ai_operator_attempt_costs WHERE attempt_id=job_value AND action_id=job_value FOR UPDATE;
   IF o.attempt_id IS NULL OR (amount_value IS NOT NULL AND amount_value>o.reserved_micros) THEN RAISE EXCEPTION 'Speech observation exceeds provider authorization' USING ERRCODE='23514'; END IF;
   IF o.settled_at IS NULL THEN UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(amount_value,reserved_micros),measurement=CASE WHEN amount_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=clock_timestamp() WHERE attempt_id=job_value;
   ELSIF o.consumed_micros IS DISTINCT FROM coalesce(amount_value,o.reserved_micros) THEN RAISE EXCEPTION 'Speech operator amount conflicts with provider fact' USING ERRCODE='23514'; END IF;
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=(SELECT coalesce(sum(consumed_micros),0) FROM public.ai_operator_attempt_costs WHERE action_id=job_value),settled_at=clock_timestamp() WHERE action_id=job_value;
 END IF;
 PERFORM public.languon_mark_accounting_reports_dirty();
 RETURN f.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_speech_provider_expense(uuid,text) FROM PUBLIC;

-- Retired owner-only entry is never an unfenced privilege escalation.
CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Speech purge requires its expected worker and fencing token' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_id_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT s.* FROM public.speech_jobs s JOIN public.ai_operator_action_budgets b ON b.action_id=s.id WHERE s.payer_id=owner_id_value AND s.accounting_version=1 AND b.state='active' ORDER BY s.id FOR UPDATE OF s LOOP
   IF j.provider_dispatched_at IS NOT NULL THEN PERFORM public.languon_record_speech_provider_expense(j.id,coalesce(j.provider_outcome,'unknown'));
   ELSE UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id; END IF;
 END LOOP;
 PERFORM set_config('languon.speech_worker_version','1',true);
 WITH cancelled AS (UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=null,lease_expires_at=null WHERE payer_id=owner_id_value AND state='queued' RETURNING recording_id)
 UPDATE public.speech_recordings r SET state='deleting',text='',version=version+1 WHERE r.state='pending' AND EXISTS(SELECT 1 FROM cancelled c WHERE c.recording_id=r.id);
 DELETE FROM public.speech_daily_admission_counters WHERE scope='owner:'||owner_id_value::text;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_speech_customer(reservation_value uuid,outcome_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.ai_credit_reservations%ROWTYPE; j public.speech_jobs%ROWTYPE; owner_value uuid; charged bigint:=0; released bigint; measurement_value public.ai_credit_measurement; now_value timestamptz:=clock_timestamp();
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_reservations WHERE id=reservation_value AND job_kind='speech-generation';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Speech billing requires its owned reservation' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO r FROM public.ai_credit_reservations WHERE id=reservation_value FOR UPDATE;
 SELECT * INTO j FROM public.speech_jobs WHERE id=r.job_id AND payer_id=r.owner_id AND reservation_id=r.id FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Speech billing has no authoritative job' USING ERRCODE='23514'; END IF;
 IF r.state='settled' THEN RETURN jsonb_build_object('chargedCredits',r.charged_credits::text,'releasedCredits',(r.reserved_credits-r.charged_credits)::text,'measurement',r.measurement); END IF;
 IF r.state<>'active' THEN RAISE EXCEPTION 'Speech billing reservation is not active' USING ERRCODE='23514'; END IF;
 IF outcome_value='success' THEN
   IF NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND state='ready' AND ready_at IS NOT NULL) THEN RAISE EXCEPTION 'Speech billing requires published output' USING ERRCODE='23514'; END IF;
   IF r.policy_mode='limited' AND now_value<j.billing_deadline AND EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND ready_at<j.billing_deadline) THEN charged:=r.reserved_credits; END IF;
 ELSIF outcome_value='deadline' THEN
   IF NOT(now_value>=j.billing_deadline OR (j.state='queued' AND now_value>=j.queue_deadline)) THEN RAISE EXCEPTION 'Speech deadline has not expired' USING ERRCODE='23514'; END IF;
 ELSIF outcome_value='failure' THEN
   IF j.state<>'failed' AND NOT public.languon_operator_purge_authorized(owner_value) THEN RAISE EXCEPTION 'Speech release requires durable failure or checked purge' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Unknown speech billing outcome' USING ERRCODE='23514'; END IF;
 measurement_value:=CASE WHEN charged>0 THEN 'speech_success'::public.ai_credit_measurement ELSE 'speech_no_charge'::public.ai_credit_measurement END;
 IF charged>0 THEN UPDATE public.ai_credit_reservation_allocations SET settled_credits=allocated_credits WHERE reservation_id=r.id; END IF;
 UPDATE public.ai_credit_reservations SET state='settled',charged_credits=charged,measured_credits=NULL,measurement=measurement_value,settled_at=now_value WHERE id=r.id;
 INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,measurement,created_at) VALUES(gen_random_uuid(),owner_value,'settlement',-charged,measurement_value,now_value);
 released:=r.reserved_credits-charged;
 IF released>0 THEN INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,created_at) VALUES(gen_random_uuid(),owner_value,'release',released,now_value); END IF;
 RETURN jsonb_build_object('chargedCredits',charged::text,'releasedCredits',released::text,'measurement',measurement_value);
END $$;
REVOKE ALL ON FUNCTION languon_settle_speech_customer(uuid,text) FROM PUBLIC;
--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql
-- SHA256: ae0020c8d2b3064368fce2778ddc50ab02f99074ee03a1d3549a12cf9d4a5f62
-- Compact operational capacity complements the cross-provider USD authorization.
CREATE OR REPLACE FUNCTION languon_text_dispatch_capacity_allows(owner_value uuid, budget_value jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH limits AS (
  SELECT (budget_value->>'maxCostMicrosPerAttempt')::numeric AS cost,
    (budget_value->>'maxInputTokensPerAttempt')::numeric AS input_tokens,
    (budget_value->>'maxOutputTokensPerAttempt')::numeric AS output_tokens,
    concat_ws(':',budget_value->>'inputCostMicrosPerMillionTokens',budget_value->>'outputCostMicrosPerMillionTokens',budget_value->>'maxCostMicrosPerAttempt',budget_value->>'maxInputTokensPerAttempt',budget_value->>'maxOutputTokensPerAttempt') AS cohort,
    clock_timestamp()-interval '24 hours' AS cutoff
 ), scopes AS (SELECT 'global'::text AS scope,10 AS active_limit,20 AS daily_limit UNION ALL SELECT owner_value::text,3,3),
 usage AS (
  SELECT s.scope,s.active_limit,s.daily_limit,l.cost,l.input_tokens,l.output_tokens,
   coalesce(a.cost,0) AS active_cost,coalesce(a.input_tokens,0) AS active_input,coalesce(a.output_tokens,0) AS active_output,
   coalesce((SELECT sum(b.cost) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.cost) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_cost,
   coalesce((SELECT sum(b.input_tokens) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.input_tokens) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_input,
   coalesce((SELECT sum(b.output_tokens) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.output_tokens) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_output
  FROM scopes s CROSS JOIN limits l LEFT JOIN public.text_ai_capacity_active_totals a ON a.scope=s.scope AND a.cohort=l.cohort
 ) SELECT coalesce(bool_and(active_cost+cost<=cost*active_limit AND active_input+input_tokens<=input_tokens*active_limit AND active_output+output_tokens<=output_tokens*active_limit AND settled_cost+active_cost+cost<=cost*daily_limit AND settled_input+active_input+input_tokens<=input_tokens*daily_limit AND settled_output+active_output+output_tokens<=output_tokens*daily_limit),false) FROM usage;
$$;
REVOKE ALL ON FUNCTION languon_text_dispatch_capacity_allows(uuid,jsonb) FROM PUBLIC;

-- Financial mutations exposed to execution workers are tied to API-owned work.
-- The witness is a claimed typed lease, never a mutable session setting.
CREATE OR REPLACE FUNCTION languon_text_dispatch_execution(action_value uuid, job_value uuid, token_value text, worker_value text, fence_value bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text; row_value jsonb; execution_value jsonb; snapshot_value jsonb; owner_value uuid; table_value text;
BEGIN
 SELECT a.owner_id,p.job_kind INTO owner_value,k FROM public.ai_credit_actions a JOIN public.ai_action_charging_policies p ON p.job_id=a.id AND p.owner_id=a.owner_id WHERE a.id=action_value AND a.state='active';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Dispatch requires its admitted action' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') THEN RAISE EXCEPTION 'Dispatch owner is inactive' USING ERRCODE='23514'; END IF;
 CASE k
  WHEN 'conversation-turn' THEN table_value:='conversation_turns';
  WHEN 'portrait-interview' THEN table_value:='learner_portrait_interview_operations';
  WHEN 'dictionary-generation' THEN table_value:='dictionary_generation_jobs';
  WHEN 'sentence-generation','sentence-check' THEN table_value:='sentence_ai_jobs';
  WHEN 'text-detection','text-translation' THEN table_value:='texts_ai_jobs';
  WHEN 'text-selection-card' THEN table_value:='dictionary_text_selection_jobs';
  ELSE RAISE EXCEPTION 'Unsupported dispatch feature' USING ERRCODE='23514';
 END CASE;
 EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',table_value) INTO row_value USING job_value;
 IF row_value IS NULL OR coalesce(row_value->>'owner_id',row_value->>'learner_id') IS DISTINCT FROM owner_value::text THEN RAISE EXCEPTION 'Dispatch feature ownership mismatch' USING ERRCODE='23514'; END IF;
 IF k IN ('conversation-turn','portrait-interview') THEN
  IF job_value<>action_value OR coalesce(row_value->>'status',row_value->>'state')<>'running' OR token_value IS NULL OR row_value->>'lease_token' IS DISTINCT FROM token_value OR row_value->>'lease_until' IS NULL OR (row_value->>'lease_until')::timestamptz<=clock_timestamp() OR coalesce((row_value->>'cancel_requested')::boolean,false) THEN RAISE EXCEPTION 'Dispatch requires the current live lease' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'execution';
 ELSE
  IF row_value->>'execution_state'<>'running' OR worker_value IS NULL OR fence_value IS NULL OR row_value->>'worker_id' IS DISTINCT FROM worker_value OR (row_value->>'fencing_token')::bigint IS DISTINCT FROM fence_value OR row_value->>'lease_deadline' IS NULL OR (row_value->>'lease_deadline')::timestamptz<=clock_timestamp() OR row_value->>'cancellation_requested_at' IS NOT NULL THEN RAISE EXCEPTION 'Dispatch requires the current live worker fence' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'selected_execution_snapshot';
  IF job_value<>action_value THEN
   IF execution_value->>'actionParentId' IS DISTINCT FROM action_value::text OR NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions m JOIN public.sentence_preparation_children c ON c.preparation_id=m.preparation_id WHERE m.action_id=action_value AND c.job_id=job_value AND m.terminal_outcome IS NULL AND (m.selected_execution_snapshot-'actionParentId')=(execution_value-'actionParentId')) THEN RAISE EXCEPTION 'Preparation child has no admitted parent' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF execution_value->>'actionAccountingVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Dispatch requires immutable accounting execution' USING ERRCODE='23514'; END IF;
 RETURN execution_value || CASE WHEN k IN ('conversation-turn','portrait-interview') THEN '{}'::jsonb ELSE jsonb_build_object('dispatchJobAttempt',(row_value->>'attempt_count')::integer) END;
END $$;
REVOKE ALL ON FUNCTION languon_text_dispatch_execution(uuid,uuid,text,text,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_admit_text_provider_attempt(action_value uuid, call_value uuid, purpose_value text, input_value integer, output_value integer, job_value uuid, token_value text, worker_value text, fence_value bigint, at_value timestamptz) RETURNS public.ai_credit_action_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; e jsonb; s jsonb; b jsonb; p public.ai_provider_price_revisions%ROWTYPE; price_value jsonb; result public.ai_credit_action_attempts%ROWTYPE; used_output bigint; used_input bigint; used_cost bigint; reserved_value bigint; available_cost bigint; affordable bigint; spent numeric; input_rate numeric; output_rate numeric; credit_input numeric; credit_output numeric; count_value integer; support_count integer; answer_count integer; owner_value uuid; kind_value text; dispatch_value timestamptz:=date_trunc('milliseconds',clock_timestamp());
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT ca.owner_id,p.job_kind INTO owner_value,kind_value FROM public.ai_credit_actions ca JOIN public.ai_action_charging_policies p ON p.job_id=ca.id WHERE ca.id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 IF a.state<>'active' OR a.deadline_at<=clock_timestamp() OR input_value IS NULL OR input_value<0 OR output_value IS NULL OR output_value<1 OR purpose_value NOT IN ('answer','observation','reflection') THEN RAISE EXCEPTION 'Action execution allowance is unavailable' USING ERRCODE='23514'; END IF;
 e:=public.languon_text_dispatch_execution(action_value,job_value,token_value,worker_value,fence_value);
 IF kind_value='portrait-interview' AND purpose_value<>'answer' THEN RAISE EXCEPTION 'Interview only authorizes answer calls' USING ERRCODE='23514'; END IF;
 s:=coalesce(e->'snapshot',e); b:=coalesce(e->'budget',s->'aggregateBudget'); price_value:=coalesce(e->'providerPrice',e->'actionProviderPrice');
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(price_value->>'id')::uuid;
 IF p.id IS NULL OR p.provider_id IS DISTINCT FROM s->>'providerId' OR p.model_id IS DISTINCT FROM s->>'modelId' OR p.meter<>'text-tokens' OR p.version IS DISTINCT FROM (price_value->>'version')::integer OR p.effective_at>a.created_at OR p.data->>'inputUsdPerMillionTokens' IS NULL OR p.data->>'outputUsdPerMillionTokens' IS NULL THEN RAISE EXCEPTION 'Dispatch requires its reviewed immutable provider rate' USING ERRCODE='23514'; END IF;
 input_rate:=greatest((p.data->>'inputUsdPerMillionTokens')::numeric,coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0),coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0))*1000000;
 output_rate:=(p.data->>'outputUsdPerMillionTokens')::numeric*1000000;
 b:=b||jsonb_build_object('inputCostMicrosPerMillionTokens',input_rate::bigint,'outputCostMicrosPerMillionTokens',output_rate::bigint);
 IF NOT public.languon_text_dispatch_capacity_allows(owner_value,b) THEN RAISE EXCEPTION 'Provider operational capacity is unavailable' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(*) FILTER(WHERE purpose<>'answer'),count(*) FILTER(WHERE purpose='answer'),coalesce(sum(coalesce(output_tokens,output_limit)),0),coalesce(sum(coalesce(input_tokens,input_limit)),0),coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),coalesce(sum(CASE WHEN purpose='answer' AND (state='dispatched' OR (successful=1 AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value)
   OR EXISTS(SELECT 1 FROM public.sentence_ai_jobs j WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
  ))) THEN
  (coalesce(input_tokens,input_limit)-CASE WHEN state='dispatched' THEN 0 ELSE coalesce(cache_read_tokens,0) END)*CASE WHEN state='dispatched' THEN greatest((a.tariff->>'inputCreditsPerMillionTokens')::numeric,coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)) ELSE (a.tariff->>'inputCreditsPerMillionTokens')::numeric END
  +CASE WHEN state='dispatched' THEN 0 ELSE coalesce(cache_read_tokens,0) END*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)
  +coalesce(output_tokens,output_limit)*(a.tariff->>'outputCreditsPerMillionTokens')::numeric ELSE 0 END),0)*1000
 INTO count_value,support_count,answer_count,used_output,used_input,used_cost,spent FROM public.ai_credit_action_attempts WHERE action_id=action_value;
 IF purpose_value='answer' AND EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND state='dispatched') THEN RAISE EXCEPTION 'Ambiguous running provider answer cannot be retried' USING ERRCODE='23514'; END IF;
 IF e ? 'dispatchJobAttempt' THEN
  IF (e->>'dispatchJobAttempt')::integer NOT BETWEEN 1 AND 2
    OR (SELECT count(*)+1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND execution_job_id=job_value)<>(e->>'dispatchJobAttempt')::integer
    OR ((e->>'dispatchJobAttempt')::integer>1 AND (SELECT count(*)-count(DISTINCT execution_job_id) FROM public.ai_credit_action_attempts WHERE action_id=action_value)>=1) THEN RAISE EXCEPTION 'Typed feature attempt or retry authorization exhausted' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=call_value) OR count_value>=5 OR (purpose_value<>'answer' AND support_count>=2) OR (purpose_value='answer' AND answer_count>=2 AND NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value)) THEN RAISE EXCEPTION 'Action call limit reached or dispatch replayed' USING ERRCODE='23514'; END IF;
 affordable:=least(output_value,a.output_limit-used_output,(b->>'maxOutputTokensPerAttempt')::bigint-used_output,coalesce((s->>'perCallMaxOutputTokens')::bigint,10000),coalesce((e->>'interviewOutputTokenLimit')::bigint,10000));
 IF input_value>least(coalesce((s->>'perCallMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'admittedMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'interviewInputTokenLimit')::bigint,(b->>'maxInputTokensPerAttempt')::bigint)) OR used_input+input_value>(b->>'maxInputTokensPerAttempt')::bigint THEN RAISE EXCEPTION 'Action input execution allowance exceeded' USING ERRCODE='23514'; END IF;
 IF a.funding='customer' AND purpose_value='answer' THEN
  credit_input:=greatest((a.tariff->>'inputCreditsPerMillionTokens')::numeric,coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric))*1000;
  credit_output:=(a.tariff->>'outputCreditsPerMillionTokens')::numeric*1000;
  IF a.held_milli*1000000-spent-input_value*credit_input<0 THEN affordable:=0; ELSIF credit_output>0 THEN affordable:=least(affordable,floor((a.held_milli*1000000-spent-input_value*credit_input)/credit_output)::bigint); END IF;
 END IF;
 SELECT reserved_micros-coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0) INTO available_cost FROM public.ai_operator_action_budgets WHERE action_id=action_value AND state='active' FOR UPDATE;
 available_cost:=least(available_cost,(b->>'maxCostMicrosPerAttempt')::bigint-used_cost)-ceil(input_value*input_rate/1000000)::bigint;
 IF available_cost IS NULL OR available_cost<0 THEN affordable:=0; ELSIF output_rate>0 THEN affordable:=least(affordable,floor(available_cost*1000000/output_rate)::bigint); END IF;
 IF affordable<1 THEN RAISE EXCEPTION 'Action affordable output allowance exhausted' USING ERRCODE='23514'; END IF;
 reserved_value:=ceil(input_value*input_rate/1000000)::bigint+ceil(affordable*output_rate/1000000)::bigint;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(action_value,call_value,reserved_value,dispatch_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,created_at) VALUES(call_value,action_value,job_value,count_value+1,purpose_value,'dispatched',b,reserved_value,input_value,affordable,dispatch_value) RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION languon_admit_text_provider_attempt(uuid,uuid,text,integer,integer,uuid,text,text,bigint,timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_credit_action(action_value uuid, outcome_value text, at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; owner_value uuid; numerator numeric; charge_value bigint; remaining bigint; consumed bigint; lot record; measurement_value text; kind_value text; feature_value jsonb; expected_value text; settled_value timestamptz:=clock_timestamp();
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_actions WHERE id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 IF a.state='settled' THEN IF a.outcome IS DISTINCT FROM outcome_value THEN RAISE EXCEPTION 'Action settlement replay differs' USING ERRCODE='23514'; END IF; RETURN; END IF;
 IF outcome_value IS NULL OR outcome_value NOT IN ('success','stopped','failure') OR EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state<>'settled') THEN RAISE EXCEPTION 'Action settlement requires settled observations' USING ERRCODE='23514'; END IF;
 SELECT job_kind INTO kind_value FROM public.ai_action_charging_policies WHERE job_id=action_value;
 feature_value:=public.languon_ai_credit_feature_authority(action_value,kind_value); expected_value:=public.languon_ai_credit_expected_outcome(feature_value);
 IF feature_value IS NULL OR (expected_value IS NOT NULL AND expected_value<>outcome_value) THEN RAISE EXCEPTION 'Action outcome conflicts with its typed feature' USING ERRCODE='23514'; END IF;
 -- Callers publish their validated terminal feature in this same transaction.
 -- Deferred mandatory feature authority rejects any missing/mismatched publication.
 SELECT coalesce(sum((input_tokens-coalesce(cache_read_tokens,0))*(a.tariff->>'inputCreditsPerMillionTokens')::numeric+coalesce(cache_read_tokens,0)*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)+output_tokens*(a.tariff->>'outputCreditsPerMillionTokens')::numeric),0)*1000 INTO numerator FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND successful=1 AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND outcome_value<>'failure' AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value) OR EXISTS(
     SELECT 1 FROM public.sentence_ai_jobs j JOIN public.sentence_preparation_children c ON c.job_id=j.id
       JOIN public.sentence_preparation_actions m ON m.preparation_id=c.preparation_id AND m.action_id=action_value
     WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.selected_execution_snapshot->>'actionParentId'=action_value::text
       AND ((j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
         OR (outcome_value='stopped' AND j.execution_state='cancelled' AND j.cancellation_requested_at IS NOT NULL AND j.failure_category='explicit_stop'))
   ));
 charge_value:=CASE WHEN a.funding='customer' THEN least(a.held_milli,ceil(numerator/1000000)::bigint) ELSE 0 END;
 remaining:=charge_value;
 FOR lot IN SELECT * FROM public.ai_credit_action_allocations WHERE action_id=action_value ORDER BY grant_id FOR UPDATE LOOP
  consumed:=least(remaining,lot.allocated_milli); UPDATE public.ai_credit_action_allocations SET settled_milli=consumed WHERE action_id=action_value AND grant_id=lot.grant_id; remaining:=remaining-consumed;
 END LOOP;
 IF remaining<>0 THEN RAISE EXCEPTION 'Action hold allocations are inconsistent' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_operator_attempt_costs SET consumed_micros=reserved_micros,measurement='conservative',settled_at=clock_timestamp() WHERE action_id=action_value AND settled_at IS NULL;
 UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0),settled_at=clock_timestamp() WHERE action_id=action_value AND state='active';
 SELECT CASE WHEN bool_and(input_tokens IS NOT NULL AND output_tokens IS NOT NULL) IS DISTINCT FROM false THEN 'measured' ELSE 'unknown' END INTO measurement_value FROM public.ai_credit_action_attempts WHERE action_id=action_value;
 UPDATE public.ai_credit_actions SET state='settled',outcome=outcome_value,charged_milli=charge_value,measurement=measurement_value,settled_at=settled_value WHERE id=action_value;
 INSERT INTO public.ai_credit_history(id,owner_id,amount,kind,measurement,created_at) VALUES(gen_random_uuid(),owner_value,-charge_value,'settlement',CASE WHEN charge_value>0 THEN 'provider_reported'::public.ai_credit_measurement ELSE NULL END,settled_value);
 IF a.held_milli>charge_value THEN INSERT INTO public.ai_credit_history(id,owner_id,amount,kind,created_at) VALUES(gen_random_uuid(),owner_value,a.held_milli-charge_value,'release',settled_value); END IF;
END $$;
REVOKE ALL ON FUNCTION languon_settle_credit_action(uuid,text,timestamptz) FROM PUBLIC;

-- Speech is indivisible and uses only its API-pinned character count/rate.
CREATE OR REPLACE FUNCTION languon_admit_speech_provider_attempt(job_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; maximum_value bigint;
BEGIN
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.state<>'queued' OR j.provider_dispatched_at IS NOT NULL OR j.queue_deadline<=clock_timestamp() OR j.billing_deadline<=clock_timestamp() OR j.payer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.payer_id AND status='active') THEN RAISE EXCEPTION 'Speech dispatch requires its prepared queued job' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.payer_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF p.id IS NULL OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.meter<>'speech-characters' OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId' OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId' OR p.effective_at>j.created_at THEN RAISE EXCEPTION 'Speech reviewed rate is missing' USING ERRCODE='23514'; END IF;
 maximum_value:=ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint;
 IF maximum_value IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE action_id=j.id AND owner_id=j.payer_id AND state='active' AND reserved_micros>=maximum_value) THEN RAISE EXCEPTION 'Speech operator authorization is missing' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(j.id,j.id,maximum_value,clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION languon_admit_speech_provider_attempt(uuid) FROM PUBLIC;
--> statement-breakpoint
-- Source: .agent/features/052-ai-accounting/preparation-action-authority.sql
-- SHA256: 6bf55d03489bccf33ddd93113803472935073009d2bddae06a1bc11278fcf1c1
-- Installed after the generated preparation/action mapping DDL.
CREATE OR REPLACE FUNCTION languon_preparation_action_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE parent_row public.sentence_preparations%ROWTYPE; action_row public.ai_credit_actions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=OLD.action_id AND state='active') THEN
      RAISE EXCEPTION 'Active preparation authorization cannot be erased' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO parent_row FROM public.sentence_preparations WHERE id=NEW.preparation_id;
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id;
  IF parent_row.id IS NULL OR action_row.id IS NULL OR action_row.owner_id IS DISTINCT FROM parent_row.learner_id
    OR action_row.capability<>'sentence-generation'
    OR NEW.selected_execution_snapshot->>'actionAccountingVersion' IS DISTINCT FROM '1'
    OR NEW.selected_execution_snapshot->>'actionFunding' IS DISTINCT FROM action_row.funding
    OR (NEW.selected_execution_snapshot->>'actionBudgetMilli')::bigint IS DISTINCT FROM action_row.budget_milli
    OR (NEW.selected_execution_snapshot->>'actionPolicyVersion')::integer IS DISTINCT FROM action_row.policy_version
    OR action_row.tariff->>'inputCreditsPerMillionTokens' IS DISTINCT FROM NEW.selected_execution_snapshot->'creditPricing'->>'inputCreditsPerMillionTokens'
    OR action_row.tariff->>'outputCreditsPerMillionTokens' IS DISTINCT FROM NEW.selected_execution_snapshot->'creditPricing'->>'outputCreditsPerMillionTokens'
    OR action_row.tariff->>'cachedInputCreditsPerMillionTokens' IS DISTINCT FROM NEW.selected_execution_snapshot->'creditPricing'->>'cachedInputCreditsPerMillionTokens' THEN
    RAISE EXCEPTION 'Preparation must retain its owned approved financial execution' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.terminal_outcome IS NOT NULL OR action_row.state<>'active' THEN RAISE EXCEPTION 'New preparation authorization must be active' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.terminal_outcome IS NOT NULL OR NEW.terminal_outcome IS NULL
    OR (to_jsonb(NEW)-'terminal_outcome') IS DISTINCT FROM (to_jsonb(OLD)-'terminal_outcome') THEN
    RAISE EXCEPTION 'Preparation authorization and terminal outcome are immutable' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.sentence_preparation_children c JOIN public.sentence_ai_jobs j ON j.id=c.job_id
    WHERE c.preparation_id=NEW.preparation_id AND j.selected_execution_snapshot->>'actionParentId'=NEW.action_id::text
      AND j.execution_state IN ('queued','running')) THEN
    RAISE EXCEPTION 'Preparation children must settle before parent authorization' USING ERRCODE='23514';
  END IF;
  IF NEW.terminal_outcome='success' AND NOT EXISTS(
    SELECT 1 FROM public.sentence_preparation_children c JOIN public.sentence_ai_jobs j ON j.id=c.job_id
    JOIN public.sentence_exercises e ON e.id=j.result_exercise_id
    WHERE c.preparation_id=NEW.preparation_id AND j.selected_execution_snapshot->>'actionParentId'=NEW.action_id::text
      AND j.execution_state='completed' AND j.result_exercise_id IS NOT NULL AND j.learner_id=parent_row.learner_id
  ) THEN RAISE EXCEPTION 'Preparation success requires independently usable completed work' USING ERRCODE='23514'; END IF;
  IF NEW.terminal_outcome='stopped' AND NOT EXISTS(
    SELECT 1 FROM public.sentence_preparation_commands c WHERE c.preparation_id=NEW.preparation_id
      AND c.learner_id=parent_row.learner_id AND c.action='stop' AND c.authorization_action_id=NEW.action_id
  ) THEN RAISE EXCEPTION 'Preparation Stop requires its explicit learner command' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sentence_preparation_action_guard BEFORE INSERT OR UPDATE OR DELETE ON sentence_preparation_actions
FOR EACH ROW EXECUTE FUNCTION languon_preparation_action_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_preparation_action_attest() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.languon_ai_credit_record_feature_authority(NEW.action_id,'sentence-generation');
  RETURN NEW;
END $$;
CREATE TRIGGER sentence_preparation_action_attest AFTER INSERT OR UPDATE ON sentence_preparation_actions
FOR EACH ROW EXECUTE FUNCTION languon_preparation_action_attest();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_preparation_action_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mapping public.sentence_preparation_actions%ROWTYPE;
BEGIN
  SELECT * INTO mapping FROM public.sentence_preparation_actions WHERE action_id=NEW.action_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions a JOIN public.sentence_preparations p ON p.id=mapping.preparation_id
    WHERE a.id=mapping.action_id AND a.state='active' AND p.current_action_id IS DISTINCT FROM a.id) THEN
    RAISE EXCEPTION 'Active preparation must retain its approved current authorization' USING ERRCODE='23514';
  END IF;
  PERFORM public.languon_ai_credit_assert_action_authority(mapping.action_id);
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sentence_preparation_action_consistency AFTER INSERT OR UPDATE ON sentence_preparation_actions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_preparation_action_consistency();
--> statement-breakpoint
-- Source: apps/backend/src/modules/learning/infrastructure/persistence/drizzle/sentence-preparation-accounting.sql
-- SHA256: 9b248da426079a55583ceaa8766a278e60ea49396b50be7e06ab8da01f2e892f
-- API creates an immutable parent authorization. A restricted worker may only
-- construct a child from that persisted parent and its captured batch fence.
CREATE OR REPLACE FUNCTION languon_admit_sentence_preparation_child(
    preparation_value uuid, batch_value uuid, fence_value bigint, at_value timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    preparation sentence_preparations%ROWTYPE;
    source_dictionary dictionaries%ROWTYPE;
    batch sentence_preparation_batches%ROWTYPE;
    mapping sentence_preparation_actions%ROWTYPE;
    action_row ai_credit_actions%ROWTYPE;
    snapshot jsonb; budget jsonb; pricing jsonb; candidates jsonb; payload jsonb;
    job_value uuid := gen_random_uuid(); version_value integer; input_limit integer;
    used_output bigint; used_input bigint; used_cost bigint; call_count integer; spent numeric;
    required_input numeric; required_output numeric; owner_queue bigint; global_queue bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(4312189072);
    SELECT * INTO preparation FROM sentence_preparations WHERE id=preparation_value;
    IF preparation.id IS NULL THEN RAISE EXCEPTION 'Preparation is unavailable' USING ERRCODE='55000'; END IF;
    -- Match API/claim actor -> source -> coordinator lock order even for direct role calls.
    PERFORM u.id FROM users u WHERE u.id IN (preparation.learner_id,
        (SELECT owner_id FROM dictionaries WHERE id=preparation.dictionary_id)) ORDER BY u.id FOR UPDATE;
    SELECT * INTO source_dictionary FROM dictionaries WHERE id=preparation.dictionary_id FOR SHARE;
    IF source_dictionary.id IS NULL OR source_dictionary.lifecycle<>'active'
        OR NOT EXISTS(SELECT 1 FROM users WHERE id=preparation.learner_id AND status='active')
        OR NOT EXISTS(SELECT 1 FROM users WHERE id=source_dictionary.owner_id AND status='active')
        OR NOT coalesce((preparation.authority->>'kind'='owner' AND source_dictionary.owner_id=preparation.learner_id)
            OR (preparation.authority->>'kind'='shared' AND source_dictionary.visibility='unlisted'
                AND source_dictionary.share_locator=preparation.authority->>'shareId'
                AND source_dictionary.share_key_digest=preparation.authority->>'keyDigest'),false)
        THEN RAISE EXCEPTION 'Preparation access is no longer active' USING ERRCODE='55000'; END IF;
    SELECT * INTO preparation FROM sentence_preparations WHERE id=preparation_value FOR UPDATE;
    IF preparation.id IS NULL OR preparation.coordinator_fence IS DISTINCT FROM fence_value
        OR preparation.state NOT IN ('queued','running') OR preparation.mode='review-only'
        OR preparation.active_job_id IS NOT NULL OR preparation.current_action_id IS NULL THEN
        RAISE EXCEPTION 'Preparation coordinator fence is no longer active' USING ERRCODE='55000';
    END IF;
    SELECT * INTO batch FROM sentence_preparation_batches
        WHERE id=batch_value AND preparation_id=preparation.id FOR UPDATE;
    SELECT * INTO mapping FROM sentence_preparation_actions
        WHERE action_id=preparation.current_action_id AND preparation_id=preparation.id;
    SELECT * INTO action_row FROM ai_credit_actions WHERE id=mapping.action_id FOR UPDATE;
    IF batch.id IS NULL OR mapping.action_id IS NULL OR mapping.terminal_outcome IS NOT NULL
        OR action_row.owner_id IS DISTINCT FROM preparation.learner_id OR action_row.state<>'active'
        OR action_row.deadline_at<=greatest(at_value,clock_timestamp()) THEN RETURN NULL; END IF;
    SELECT coalesce(jsonb_agg(entry.value ORDER BY entry.ordinality),'[]'::jsonb) INTO candidates
    FROM (SELECT e.value,e.ordinality FROM jsonb_array_elements(batch.entries) WITH ORDINALITY e(value,ordinality)
        WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(batch.manifest) m
            WHERE (m->'entryIds') ? (e.value->>'entryId')) ORDER BY e.ordinality LIMIT 12) entry;
    IF jsonb_array_length(candidates)=0 THEN RETURN NULL; END IF;
    snapshot := mapping.selected_execution_snapshot || jsonb_build_object('actionParentId',action_row.id);
    budget := snapshot->'aggregateBudget'; pricing := snapshot->'creditPricing';
    IF snapshot->>'preparationFormat' NOT IN ('sentence-preparation:v1','sentence-preparation:v2')
        OR snapshot->>'preparationFormat' IS NULL THEN
        RAISE EXCEPTION 'Pinned preparation format is unavailable' USING ERRCODE='23514'; END IF;
    version_value := CASE WHEN snapshot->>'preparationFormat'='sentence-preparation:v2' THEN 2 ELSE 1 END;
    payload := jsonb_build_object('schemaVersion',1,'generationPolicyVersion',version_value,
        'dictionaryId',preparation.dictionary_id,'direction',preparation.direction,
        'sourceLanguage',preparation.source_language,'targetLanguage',preparation.target_language,
        'priorityEntryId',candidates->0->>'entryId','candidates',candidates);
    input_limit := least((budget->>'maxInputTokensPerAttempt')::integer,octet_length(payload::text)+8192);
    SELECT count(*),coalesce(sum(coalesce(output_tokens,output_limit)),0),
        coalesce(sum(coalesce(t.input_tokens,t.input_limit)),0),
        coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),
        coalesce(sum(CASE WHEN state='dispatched' OR (successful=1 AND EXISTS(SELECT 1 FROM sentence_ai_jobs eligible WHERE eligible.id=t.execution_job_id AND eligible.execution_state='completed' AND eligible.result_exercise_id IS NOT NULL)) THEN
            (coalesce(t.input_tokens,t.input_limit)-coalesce(cache_read_tokens,0)) * (action_row.tariff->>'inputCreditsPerMillionTokens')::numeric
            +coalesce(cache_read_tokens,0)*coalesce((action_row.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(action_row.tariff->>'inputCreditsPerMillionTokens')::numeric)
            +coalesce(output_tokens,output_limit)*(action_row.tariff->>'outputCreditsPerMillionTokens')::numeric ELSE 0 END),0)
    INTO call_count,used_output,used_input,used_cost,spent FROM ai_credit_action_attempts t WHERE t.action_id=action_row.id;
    required_input := greatest((action_row.tariff->>'inputCreditsPerMillionTokens')::numeric,
        coalesce((action_row.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,0))*input_limit;
    required_output := (action_row.tariff->>'outputCreditsPerMillionTokens')::numeric;
    IF call_count>=5 OR used_output>=action_row.output_limit
        OR used_input+input_limit>(budget->>'maxInputTokensPerAttempt')::bigint
        OR used_cost+ceil((input_limit*(budget->>'inputCostMicrosPerMillionTokens')::numeric
            +(budget->>'outputCostMicrosPerMillionTokens')::numeric)/1000000)>(budget->>'maxCostMicrosPerAttempt')::bigint
        OR (action_row.funding='customer' AND spent+required_input+required_output>action_row.held_milli*1000::numeric)
        OR EXISTS(SELECT 1 FROM ai_credit_action_attempts WHERE action_id=action_row.id AND state='dispatched')
        THEN RETURN NULL; END IF;
    SELECT coalesce(queued+running,0) INTO global_queue FROM text_ai_capacity_queue_totals WHERE scope='global';
    SELECT coalesce(queued+running,0) INTO owner_queue FROM text_ai_capacity_queue_totals WHERE scope=preparation.learner_id::text;
    IF coalesce(global_queue,0)>=coalesce((snapshot->'preparationQueueLimits'->>'global')::integer,1000)
        OR coalesce(owner_queue,0)>=coalesce((snapshot->'preparationQueueLimits'->>'learner')::integer,5) THEN
        RAISE EXCEPTION 'Preparation queue capacity unavailable' USING ERRCODE='54000'; END IF;
    PERFORM set_config('languon.model_pricing_revision','1',true);
    PERFORM set_config('languon.learning_execution_revision','1',true);
    PERFORM set_config('languon.text_ai_selection_revision','1',true);
    PERFORM set_config('languon.ai_credit_settlement_revision','1',true);
    PERFORM set_config('languon.text_ai_capacity_revision','1',true);
    INSERT INTO sentence_ai_jobs(id,learner_id,dictionary_id,job_kind,format,direction,authority,operation_id,session_id,
        request_fingerprint,input_payload,selected_execution_snapshot,selected_execution_version,execution_revision_id,
        max_attempts,created_at,updated_at,next_attempt_at,
        provider_input_cost_micros_per_million_tokens,provider_output_cost_micros_per_million_tokens,
        provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt,
        provider_reservation_state,provider_reserved_attempts,provider_reserved_cost_micros,provider_reserved_input_tokens,provider_reserved_output_tokens,
        ai_credit_accounted,ai_credit_input_credits_per_million_tokens,ai_credit_output_credits_per_million_tokens,
        ai_credit_max_credits_per_attempt,ai_credit_pricing_revision)
    VALUES(job_value,preparation.learner_id,preparation.dictionary_id,'sentence-generation','sentence-preparation:v'||version_value,
        preparation.direction,preparation.authority,job_value,preparation.id,
        md5(preparation.id::text||batch.id::text||fence_value::text),payload,snapshot,1,mapping.execution_revision_id,
        CASE WHEN EXISTS(SELECT 1 FROM ai_credit_action_attempts prior JOIN sentence_ai_jobs old ON old.id=prior.execution_job_id WHERE prior.action_id=action_row.id AND old.attempt_count>1) THEN 1 ELSE 2 END,at_value,at_value,at_value,
        (budget->>'inputCostMicrosPerMillionTokens')::integer,(budget->>'outputCostMicrosPerMillionTokens')::integer,
        (budget->>'maxCostMicrosPerAttempt')::integer,(budget->>'maxInputTokensPerAttempt')::integer,(budget->>'maxOutputTokensPerAttempt')::integer,
        'active',1,(budget->>'maxCostMicrosPerAttempt')::integer,(budget->>'maxInputTokensPerAttempt')::integer,(budget->>'maxOutputTokensPerAttempt')::integer,
        false,(pricing->>'inputCreditsPerMillionTokens')::numeric,(pricing->>'outputCreditsPerMillionTokens')::numeric,
        (pricing->>'maxCreditsPerAttempt')::bigint,(pricing->>'revision')::integer);
    INSERT INTO sentence_job_entries(job_id,dictionary_id,entry_id,learning_version)
        SELECT job_value,preparation.dictionary_id,(e->>'entryId')::uuid,(e->>'learningVersion')::integer
        FROM jsonb_array_elements(candidates) e;
    INSERT INTO sentence_preparation_children(job_id,preparation_id,batch_id) VALUES(job_value,preparation.id,batch.id);
    UPDATE sentence_preparations SET active_job_id=job_value,state='running',pause_reason=NULL,
        coordinator_fence=coordinator_fence+1,updated_at=at_value WHERE id=preparation.id;
    RETURN job_value;
END; $$;
REVOKE ALL ON FUNCTION languon_admit_sentence_preparation_child(uuid,uuid,bigint,timestamptz) FROM PUBLIC;
--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-owner-purge.sql
-- SHA256: b34403d4155e82155e01091a90128522d0146feaea8f3886b7b179cb4c472176
-- Minimal authority for the dedicated purge role: no SELECT privilege on cash-record JSON.
-- Application coordinator already validates its lease/fence and holds request/user locks.
CREATE OR REPLACE FUNCTION languon_anonymize_accounting_owner(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT public.languon_operator_purge_authorized(owner_id_value) THEN RAISE EXCEPTION 'Accounting anonymization requires a checked deletion claim' USING ERRCODE='23514'; END IF;
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
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-authorized-purge.sql
-- SHA256: 2287f232121c1fa2b00a1f68c923cd61385b3907ba8e30d5a7c2f5136ac378cd
-- A mutable session GUC is context, never authorization. The checked entry point
-- fences the live deletion claim; restricted roles have no raw financial DELETE.
CREATE OR REPLACE FUNCTION languon_assert_accounting_purge_claim(owner_value uuid, worker_value text, fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,76021941));
  PERFORM 1 FROM public.account_deletion_requests d JOIN public.users u ON u.id=d.user_id
    WHERE d.user_id=owner_value AND u.status='deletion_pending' AND d.state='running'
      AND d.purge_at<=clock_timestamp() AND d.lease_deadline>clock_timestamp()
      AND d.lease_worker_id=worker_value AND d.fencing_token=fence_value AND fence_value>0
    FOR UPDATE OF d,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting purge requires its active due deletion worker and fence' USING ERRCODE='23514'; END IF;
  PERFORM set_config('languon.ai_credit_purge_owner',owner_value::text,true);
  PERFORM set_config('languon.ai_credit_purge_worker',worker_value,true);
  PERFORM set_config('languon.ai_credit_purge_fence',fence_value::text,true);
END $$;
REVOKE ALL ON FUNCTION languon_assert_accounting_purge_claim(uuid,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_operator_purge_authorized(owner_value uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(current_setting('languon.ai_credit_purge_owner',true)=owner_value::text AND EXISTS(
   SELECT 1 FROM public.users u JOIN public.account_deletion_requests d ON d.user_id=u.id WHERE u.id=owner_value
     AND u.status='deletion_pending' AND d.state='running' AND d.purge_at<=clock_timestamp() AND d.lease_deadline>clock_timestamp()
     AND d.lease_worker_id=current_setting('languon.ai_credit_purge_worker',true)
     AND d.fencing_token::text=current_setting('languon.ai_credit_purge_fence',true) AND d.fencing_token>0),false);
$$;
REVOKE ALL ON FUNCTION languon_operator_purge_authorized(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_immutable_owner_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' OR NOT public.languon_operator_purge_authorized(OLD.owner_id) THEN RAISE EXCEPTION 'Financial erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_allocation_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_value uuid;
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_grant_balances WHERE grant_id=OLD.grant_id;
 IF owner_value IS NULL OR NOT public.languon_operator_purge_authorized(owner_value) THEN RAISE EXCEPTION 'Allocation erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION ai_credit_action_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT public.languon_operator_purge_authorized(OLD.owner_id) THEN RAISE EXCEPTION 'Action erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION ai_credit_action_attempt_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_value uuid; context_value text:=current_setting('languon.ai_credit_purge_owner',true);
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_actions WHERE id=OLD.action_id;
 IF context_value IS NULL OR context_value='' OR (owner_value IS NOT NULL AND owner_value::text<>context_value) OR NOT public.languon_operator_purge_authorized(context_value::uuid) THEN RAISE EXCEPTION 'Attempt erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION languon_purge_ai_credit_owner(owner_value uuid, worker_value text, fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 PERFORM pg_advisory_xact_lock(1920424395);
 IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE owner_id=owner_value AND state<>'settled')
    OR EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE owner_id=owner_value AND state<>'settled')
    OR EXISTS(SELECT 1 FROM public.ai_credit_reservations WHERE owner_id=owner_value AND state='active') THEN RAISE EXCEPTION 'Financial erasure requires quiescent settled work' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_anonymize_accounting_owner(owner_value);
 DELETE FROM public.ai_credit_action_quotes WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_actions WHERE owner_id=owner_value;
 DELETE FROM public.ai_action_charging_policies WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_history WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_admin_removals WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_reservations WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_grants WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_wallet_totals WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_accounts WHERE user_id=owner_value;
END $$;
REVOKE ALL ON FUNCTION languon_purge_ai_credit_owner(uuid,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_account_deletion_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.state='running' THEN
   IF OLD.state='running' AND NEW.fencing_token=OLD.fencing_token AND NEW.lease_worker_id=OLD.lease_worker_id THEN
     IF OLD.lease_deadline<=clock_timestamp() OR NEW.attempt_count<>OLD.attempt_count THEN RAISE EXCEPTION 'Expired deletion claim cannot renew without a new fence' USING ERRCODE='23514'; END IF;
   ELSE
     IF NOT((OLD.state='pending' AND OLD.next_attempt_at<=clock_timestamp()) OR (OLD.state='running' AND OLD.lease_deadline<=clock_timestamp()))
       OR OLD.purge_at>clock_timestamp() OR NEW.fencing_token<>OLD.fencing_token+1 OR NEW.attempt_count<>OLD.attempt_count+1 THEN RAISE EXCEPTION 'Deletion claim requires due work and the next fencing token' USING ERRCODE='23514'; END IF;
   END IF;
   PERFORM 1 FROM public.users WHERE id=OLD.user_id AND status='deletion_pending' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Deletion claim requires a scheduled account' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_claim_authority BEFORE UPDATE ON public.account_deletion_requests FOR EACH ROW EXECUTE FUNCTION languon_guard_account_deletion_claim();

CREATE OR REPLACE FUNCTION languon_complete_account_purge(owner_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE owner_id=owner_value) OR EXISTS(SELECT 1 FROM public.ai_credit_grants WHERE owner_id=owner_value) OR EXISTS(SELECT 1 FROM public.ai_credit_accounts WHERE user_id=owner_value) OR EXISTS(SELECT 1 FROM public.speech_jobs WHERE payer_id=owner_value) THEN RAISE EXCEPTION 'Account purge completion requires financial and speech erasure' USING ERRCODE='23514'; END IF;
 UPDATE public.users SET handle=NULL,status='purged',updated_at=clock_timestamp(),version=version+1 WHERE id=owner_value;
 UPDATE public.account_deletion_requests SET state='complete',completed_at=clock_timestamp(),lease_deadline=NULL,lease_worker_id=NULL,updated_at=clock_timestamp() WHERE user_id=owner_value;
END $$;
REVOKE ALL ON FUNCTION languon_complete_account_purge(uuid,text,integer) FROM PUBLIC;
