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
