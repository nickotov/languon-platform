-- Refine terminal and zero-tariff guards without rewriting installed migration history.
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
CREATE OR REPLACE FUNCTION guard_legacy_action_erasure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=OLD.id AND state='active') THEN
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
