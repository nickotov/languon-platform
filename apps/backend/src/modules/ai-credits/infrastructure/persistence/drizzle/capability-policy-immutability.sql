-- Install after accounting tables and feature job tables. Policy reads are lock-free.
CREATE FUNCTION languon_guard_action_charging_policy() RETURNS trigger
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
CREATE TRIGGER ai_action_charging_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON ai_action_charging_policies
FOR EACH ROW EXECUTE FUNCTION languon_guard_action_charging_policy();

-- Deferrable because feature ownership and charging policy are inserted atomically,
-- with feature-specific ordering. No accounting row can authorize another owner.
CREATE FUNCTION languon_guard_action_charging_owner() RETURNS trigger
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
CREATE CONSTRAINT TRIGGER ai_action_charging_owner_guard AFTER INSERT ON ai_action_charging_policies
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_guard_action_charging_owner();

CREATE FUNCTION languon_guard_accounting_policy_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
     AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Published accounting revisions are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER ai_capability_policy_revision_guard BEFORE UPDATE OR DELETE ON ai_capability_policy_revisions
FOR EACH ROW EXECUTE FUNCTION languon_guard_accounting_policy_revision();
CREATE TRIGGER ai_accounting_settings_revision_guard BEFORE UPDATE OR DELETE ON ai_accounting_settings_revisions
FOR EACH ROW EXECUTE FUNCTION languon_guard_accounting_policy_revision();
