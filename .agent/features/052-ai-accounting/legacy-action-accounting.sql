-- New feature jobs retain their own ownership, fencing, capacity and terminal validators.
-- Versioned snapshots opt into whole-action accounting; original reservations remain guarded.
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
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=coalesce((OLD.selected_execution_snapshot->>'actionParentId')::uuid,OLD.id) AND state='active') THEN
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
