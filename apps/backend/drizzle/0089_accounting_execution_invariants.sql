-- Fresh development-ledger cutover: historical conversion is explicitly not required.
-- Stop API/workers before switching to the separately provisioned empty database.
-- Never silently reinterpret accepted whole-credit balances as milli-credits.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ai_credit_grants)
 OR EXISTS(SELECT 1 FROM ai_credit_history)
 OR EXISTS(SELECT 1 FROM ai_credit_reservations)
 OR EXISTS(SELECT 1 FROM ai_credit_admin_removals)
 OR EXISTS(SELECT 1 FROM dictionary_generation_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM sentence_ai_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM texts_ai_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM dictionary_text_selection_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM speech_jobs WHERE state IN ('queued','submitting','processing','storing','submission_unknown'))
 OR EXISTS(SELECT 1 FROM conversation_turns WHERE status IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM learner_portrait_interview_operations WHERE state IN ('queued','running')) THEN
  RAISE EXCEPTION 'AI accounting requires a fresh empty development ledger and drained workers; preserve the old database and provision a new one before cutover' USING ERRCODE='55000';
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_conversation_credit_maximum(
    turn_id_value uuid, owner_id_value uuid, reservation_id_value uuid, ordinal_value integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    turn_record conversation_turns%ROWTYPE;
    call_record conversation_provider_calls%ROWTYPE;
    maximum_input bigint;
    maximum_output bigint;
    input_rate numeric;
    output_rate numeric;
    maximum_credits bigint;
BEGIN
    SELECT * INTO turn_record FROM conversation_turns WHERE id=turn_id_value;
    SELECT * INTO call_record FROM conversation_provider_calls
      WHERE turn_id=turn_id_value AND reservation_id=reservation_id_value AND ordinal=ordinal_value;
    IF turn_record.id IS NULL OR call_record.id IS NULL
       OR turn_record.owner_id IS DISTINCT FROM owner_id_value
       OR call_record.owner_id IS DISTINCT FROM owner_id_value
       OR ordinal_value NOT BETWEEN 1 AND 5
       OR (turn_record.execution#>>'{snapshot,modelId}') IS DISTINCT FROM 'deepseek-flash'
       OR (turn_record.execution#>>'{snapshot,creditPricing,revision}') IS DISTINCT FROM '1' THEN
       RAISE EXCEPTION 'Conversation credit reservation requires its pinned owned call' USING ERRCODE='23514';
    END IF;
    maximum_input := (turn_record.execution#>>'{snapshot,perCallMaxInputTokens}')::bigint;
    maximum_output := least((turn_record.execution#>>'{snapshot,perCallMaxOutputTokens}')::bigint,
      CASE WHEN call_record.purpose='actor' THEN 4096 ELSE 2048 END);
    input_rate := (turn_record.execution#>>'{snapshot,creditPricing,inputCreditsPerMillionTokens}')::numeric;
    output_rate := (turn_record.execution#>>'{snapshot,creditPricing,outputCreditsPerMillionTokens}')::numeric;
    IF maximum_input IS NULL OR maximum_input NOT BETWEEN 1 AND 262144
       OR maximum_output IS NULL OR maximum_output NOT BETWEEN 1 AND 4096
       OR input_rate IS NULL OR input_rate NOT BETWEEN 0 AND 1000000000
       OR output_rate IS NULL OR output_rate NOT BETWEEN 0 AND 1000000000
       OR call_record.reserved_input_tokens IS DISTINCT FROM maximum_input
       OR call_record.reserved_output_tokens NOT BETWEEN 1 AND maximum_output
       OR (call_record.purpose<>'actor' AND (ordinal_value=5 OR
           (SELECT count(*) FROM conversation_provider_calls WHERE turn_id=turn_id_value AND purpose<>'actor')>2)) THEN
       RAISE EXCEPTION 'Conversation call exceeds pinned token or memory bounds' USING ERRCODE='23514';
    END IF;
    maximum_credits := ceil((maximum_input * input_rate + call_record.reserved_output_tokens::bigint * output_rate)/1000.0)::bigint;
    IF maximum_credits NOT BETWEEN 1 AND 9007199254740991 THEN
       RAISE EXCEPTION 'Conversation call pricing is invalid' USING ERRCODE='23514';
    END IF;
    RETURN maximum_credits;
END; $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_portrait_credit_maximum(
    operation_id_value uuid, owner_id_value uuid, reservation_id_value uuid, ordinal_value integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    operation_record learner_portrait_interview_operations%ROWTYPE;
    call_record learner_portrait_interview_provider_calls%ROWTYPE;
    maximum_input bigint;
    maximum_output bigint;
    input_rate numeric;
    output_rate numeric;
    maximum_credits bigint;
BEGIN
    SELECT * INTO operation_record FROM learner_portrait_interview_operations WHERE id=operation_id_value;
    SELECT * INTO call_record FROM learner_portrait_interview_provider_calls
      WHERE operation_id=operation_id_value AND reservation_id=reservation_id_value AND ordinal=ordinal_value;
    IF operation_record.id IS NULL OR call_record.id IS NULL
       OR operation_record.owner_id IS DISTINCT FROM owner_id_value
       OR call_record.owner_id IS DISTINCT FROM owner_id_value
       OR ordinal_value NOT BETWEEN 1 AND 5
       OR (operation_record.execution#>>'{snapshot,modelId}') IS DISTINCT FROM 'deepseek-flash'
       OR (operation_record.execution#>>'{snapshot,creditPricing,revision}') IS DISTINCT FROM '1' THEN
       RAISE EXCEPTION 'Portrait credit reservation requires its pinned owned call' USING ERRCODE='23514';
    END IF;
    maximum_input := (operation_record.execution#>>'{snapshot,perCallMaxInputTokens}')::bigint;
    IF maximum_input IS NULL OR maximum_input NOT BETWEEN 1 AND 262144 THEN
        RAISE EXCEPTION 'Invalid pinned portrait model input bound' USING ERRCODE='23514';
    END IF;
    IF operation_record.execution ? 'interviewInputTokenLimit' THEN
        IF jsonb_typeof(operation_record.execution->'interviewInputTokenLimit') IS DISTINCT FROM 'number'
           OR (operation_record.execution->>'interviewInputTokenLimit') !~ '^[1-9][0-9]{0,5}$'
           OR (operation_record.execution->>'interviewInputTokenLimit')::bigint > maximum_input THEN
            RAISE EXCEPTION 'Invalid pinned portrait request input bound' USING ERRCODE='23514';
        END IF;
        maximum_input := (operation_record.execution->>'interviewInputTokenLimit')::bigint;
    END IF;
    maximum_output := least((operation_record.execution#>>'{snapshot,perCallMaxOutputTokens}')::bigint,
      CASE WHEN call_record.purpose='actor' THEN 4096 ELSE 2048 END);
    IF operation_record.execution ? 'interviewOutputTokenLimit' THEN
        IF jsonb_typeof(operation_record.execution->'interviewOutputTokenLimit') IS DISTINCT FROM 'number'
           OR (operation_record.execution->>'interviewOutputTokenLimit') !~ '^[1-9][0-9]{0,3}$'
           OR (operation_record.execution->>'interviewOutputTokenLimit')::bigint NOT BETWEEN 1024 AND maximum_output THEN
            RAISE EXCEPTION 'Invalid pinned portrait request output bound' USING ERRCODE='23514';
        END IF;
        maximum_output := (operation_record.execution->>'interviewOutputTokenLimit')::bigint;
    END IF;
    input_rate := (operation_record.execution#>>'{snapshot,creditPricing,inputCreditsPerMillionTokens}')::numeric;
    output_rate := (operation_record.execution#>>'{snapshot,creditPricing,outputCreditsPerMillionTokens}')::numeric;
    IF maximum_input IS NULL OR maximum_input NOT BETWEEN 1 AND 262144
       OR maximum_output IS NULL OR maximum_output NOT BETWEEN 1 AND 4096
       OR input_rate IS NULL OR input_rate NOT BETWEEN 0 AND 1000000000
       OR output_rate IS NULL OR output_rate NOT BETWEEN 0 AND 1000000000
       OR call_record.reserved_input_tokens IS DISTINCT FROM maximum_input
       OR call_record.reserved_output_tokens NOT BETWEEN 1 AND maximum_output
       OR call_record.purpose<>'actor' THEN
       RAISE EXCEPTION 'Portrait call exceeds pinned token or memory bounds' USING ERRCODE='23514';
    END IF;
    maximum_credits := ceil((maximum_input * input_rate + call_record.reserved_output_tokens::bigint * output_rate)/1000.0)::bigint;
    IF maximum_credits NOT BETWEEN 1 AND 9007199254740991 THEN
       RAISE EXCEPTION 'Portrait call pricing is invalid' USING ERRCODE='23514';
    END IF;
    RETURN maximum_credits;
END; $$;
--> statement-breakpoint
-- Install after accounting tables and feature job tables. Policy reads are lock-free.
CREATE FUNCTION languon_guard_action_charging_policy() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_capability text; published ai_capability_policy_revisions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF current_setting('languon.ai_credit_purge_owner',true)=OLD.owner_id::text
       OR NOT EXISTS(SELECT 1 FROM users WHERE id=OLD.owner_id) THEN RETURN OLD; END IF;
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
--> statement-breakpoint
-- Append after Drizzle action tables and wallet-projection functions are created.
-- All quantities share the milli-credit ledger unit. Old per-attempt guards remain active.
CREATE OR REPLACE FUNCTION ai_credit_action_allocation_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE;
BEGIN
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id FOR UPDATE;
  IF NOT FOUND OR action_row.state<>'active' OR action_row.funding<>'customer' THEN
    RAISE EXCEPTION 'Action allocation requires active funded action';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.action_id<>OLD.action_id OR NEW.grant_id<>OLD.grant_id OR NEW.allocated_milli<>OLD.allocated_milli THEN
      RAISE EXCEPTION 'Action allocations cannot be reassigned';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.settled_milli<>0 OR
     (SELECT coalesce(sum(allocated_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.action_id)+NEW.allocated_milli>action_row.held_milli THEN
    RAISE EXCEPTION 'Action allocation exceeds hold';
  END IF;
  UPDATE public.ai_credit_grant_balances SET remaining_credits=remaining_credits-NEW.allocated_milli,
    reserved_credits=reserved_credits+NEW.allocated_milli
    WHERE grant_id=NEW.grant_id AND owner_id=action_row.owner_id
      AND remaining_credits>=NEW.allocated_milli
      AND (expires_at IS NULL OR expires_at>action_row.created_at);
  IF NOT FOUND THEN RAISE EXCEPTION 'Action grant is unavailable'; END IF;
  INSERT INTO public.ai_credit_wallet_totals(owner_id,reserved_credits,consumed_credits)
    VALUES(action_row.owner_id,NEW.allocated_milli,0)
    ON CONFLICT(owner_id) DO UPDATE SET reserved_credits=public.ai_credit_wallet_totals.reserved_credits+NEW.allocated_milli;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_credit_action_allocation_project BEFORE INSERT OR UPDATE
ON ai_credit_action_allocations FOR EACH ROW EXECUTE FUNCTION ai_credit_action_allocation_project();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_credit_action_settlement_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE lot record;
BEGIN
  IF OLD.state<>'active' THEN RAISE EXCEPTION 'Settled actions are immutable'; END IF;
  IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.capability<>OLD.capability OR NEW.funding<>OLD.funding
    OR NEW.policy_version<>OLD.policy_version OR NEW.tariff<>OLD.tariff OR NEW.held_milli<>OLD.held_milli
    OR NEW.budget_milli<>OLD.budget_milli OR NEW.output_limit<>OLD.output_limit
    OR NEW.created_at<>OLD.created_at OR NEW.deadline_at<>OLD.deadline_at THEN
      RAISE EXCEPTION 'Action authorization is immutable';
  END IF;
  IF NEW.state='settled' THEN
    IF (SELECT coalesce(sum(allocated_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.id)<>NEW.held_milli
      OR (SELECT coalesce(sum(settled_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.id)<>NEW.charged_milli THEN
      RAISE EXCEPTION 'Action allocations do not match settlement';
    END IF;
    FOR lot IN SELECT * FROM public.ai_credit_action_allocations WHERE action_id=NEW.id LOOP
      UPDATE public.ai_credit_grant_balances SET remaining_credits=remaining_credits+lot.allocated_milli-lot.settled_milli,
        reserved_credits=reserved_credits-lot.allocated_milli, consumed_credits=consumed_credits+lot.settled_milli
        WHERE grant_id=lot.grant_id AND owner_id=NEW.owner_id AND reserved_credits>=lot.allocated_milli;
      IF NOT FOUND THEN RAISE EXCEPTION 'Action grant projection is inconsistent'; END IF;
    END LOOP;
    UPDATE public.ai_credit_wallet_totals SET reserved_credits=reserved_credits-NEW.held_milli,
      consumed_credits=consumed_credits+NEW.charged_milli WHERE owner_id=NEW.owner_id AND reserved_credits>=NEW.held_milli;
    IF NEW.held_milli>0 AND NOT FOUND THEN RAISE EXCEPTION 'Action wallet projection is inconsistent'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_credit_action_settlement_project BEFORE UPDATE
ON ai_credit_actions FOR EACH ROW EXECUTE FUNCTION ai_credit_action_settlement_project();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_credit_action_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE;
DECLARE count_calls integer;
DECLARE output_used bigint;
BEGIN
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id FOR UPDATE;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider dispatch requires active action authorization'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'dispatched' OR NEW.state<>'settled' OR
      NEW.id<>OLD.id OR NEW.action_id<>OLD.action_id OR NEW.ordinal<>OLD.ordinal OR NEW.purpose<>OLD.purpose
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
CREATE TRIGGER ai_credit_action_attempt_guard BEFORE INSERT OR UPDATE
ON ai_credit_action_attempts FOR EACH ROW EXECUTE FUNCTION ai_credit_action_attempt_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_credit_action_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_setting('languon.ai_credit_purge_owner',true) IS DISTINCT FROM OLD.owner_id::text THEN
    RAISE EXCEPTION 'Action accounting can only be deleted by account purge';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER ai_credit_action_delete_guard BEFORE DELETE ON ai_credit_actions
FOR EACH ROW EXECUTE FUNCTION ai_credit_action_delete_guard();
--> statement-breakpoint
CREATE TRIGGER ai_credit_action_allocation_delete_guard BEFORE DELETE ON ai_credit_action_allocations
FOR EACH ROW EXECUTE FUNCTION languon_ai_credit_guard_allocation_delete();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_credit_action_attempt_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_owner uuid;
DECLARE purge_owner text;
BEGIN
  SELECT owner_id INTO action_owner FROM public.ai_credit_actions WHERE id=OLD.action_id;
  purge_owner := current_setting('languon.ai_credit_purge_owner',true);
  -- During an authorized parent cascade the action row has already been deleted.
  -- A present parent must always match the complete-account purge identity.
  IF nullif(purge_owner,'') IS NULL OR (action_owner IS NOT NULL AND purge_owner IS DISTINCT FROM action_owner::text) THEN
    RAISE EXCEPTION 'Provider attempt accounting can only be deleted by account purge';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER ai_credit_action_attempt_delete_guard BEFORE DELETE ON ai_credit_action_attempts
FOR EACH ROW EXECUTE FUNCTION ai_credit_action_attempt_delete_guard();
--> statement-breakpoint
-- Apply after generated capacity-schema DDL. The migration backfill executes
-- through the same transactional delta functions as runtime writes.
CREATE FUNCTION languon_text_ai_queue_delta(scope_value text, queued_delta bigint, running_delta bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF queued_delta < 0 OR running_delta < 0 THEN
        UPDATE text_ai_capacity_queue_totals SET queued=queued+queued_delta, running=running+running_delta
        WHERE scope=scope_value;
        IF NOT FOUND THEN RAISE EXCEPTION 'Missing queue capacity projection' USING ERRCODE='23514'; END IF;
        DELETE FROM text_ai_capacity_queue_totals WHERE scope=scope_value AND queued=0 AND running=0;
    ELSE
        INSERT INTO text_ai_capacity_queue_totals(scope,queued,running) VALUES(scope_value,queued_delta,running_delta)
        ON CONFLICT(scope) DO UPDATE SET queued=text_ai_capacity_queue_totals.queued+excluded.queued,
            running=text_ai_capacity_queue_totals.running+excluded.running;
    END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_project_job(source_value text, row_value jsonb, deleting boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    old_row text_ai_capacity_jobs%ROWTYPE;
    row_id uuid := (row_value->>'id')::uuid;
    row_state text := coalesce(row_value->>'execution_state', row_value->>'status', row_value->>'state');
    row_owner uuid := coalesce(row_value->>'owner_id', row_value->>'learner_id')::uuid;
    row_kind text;
    row_created timestamptz := (row_value->>'created_at')::timestamptz;
    row_next timestamptz := coalesce(row_value->>'next_attempt_at', row_value->>'created_at')::timestamptz;
    row_runnable boolean;
BEGIN
    row_kind := CASE source_value
        WHEN 'dictionary_generation_jobs' THEN 'dictionary-generation'
        WHEN 'conversation_turns' THEN 'conversation-turn'
        WHEN 'learner_portrait_interview_operations' THEN 'portrait-interview'
        WHEN 'dictionary_text_selection_jobs' THEN 'text-selection-card'
        ELSE row_value->>'job_kind' END;
    row_runnable := CASE WHEN source_value = 'dictionary_generation_jobs'
        THEN row_value->'input_payload'->>'awaitingUpload' IS DISTINCT FROM 'true'
        ELSE coalesce((row_value->>'cancel_requested')::boolean, false) = false END;
    SELECT * INTO old_row FROM text_ai_capacity_jobs WHERE source = source_value AND id = row_id FOR UPDATE;
    IF NOT deleting AND row_state IN ('queued','running') AND old_row.id IS NOT NULL
        AND old_row.owner_id = row_owner AND old_row.job_kind = row_kind
        AND old_row.state = row_state AND old_row.created_at = row_created
        AND old_row.next_attempt_at = row_next AND old_row.runnable = row_runnable THEN RETURN; END IF;
    IF old_row.id IS NOT NULL THEN
        PERFORM languon_text_ai_queue_delta('global', -(old_row.state='queued')::integer, -(old_row.state='running')::integer);
        PERFORM languon_text_ai_queue_delta(old_row.owner_id::text, -(old_row.state='queued')::integer, -(old_row.state='running')::integer);
        DELETE FROM text_ai_capacity_jobs WHERE source = source_value AND id = row_id;
    END IF;
    IF NOT deleting AND row_state IN ('queued','running') THEN
        INSERT INTO text_ai_capacity_jobs(source,id,owner_id,job_kind,state,created_at,next_attempt_at,runnable)
        VALUES(source_value,row_id,row_owner,row_kind,row_state,row_created,row_next,row_runnable);
        PERFORM languon_text_ai_queue_delta('global', (row_state='queued')::integer, (row_state='running')::integer);
        PERFORM languon_text_ai_queue_delta(row_owner::text, (row_state='queued')::integer, (row_state='running')::integer);
    END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_project_job_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM languon_text_ai_project_job(TG_TABLE_NAME, CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END, TG_OP='DELETE');
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_usage_delta(usage_row text_ai_capacity_provider_usage, direction_value integer)
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
CREATE FUNCTION languon_text_ai_project_provider(source_value text, row_value jsonb, deleting boolean)
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
CREATE FUNCTION languon_text_ai_project_provider_trigger() RETURNS trigger
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
DO $$
DECLARE table_value text; row_value jsonb;
BEGIN
    FOREACH table_value IN ARRAY ARRAY['dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs','conversation_turns','learner_portrait_interview_operations'] LOOP
        EXECUTE format('LOCK TABLE %I IN SHARE ROW EXCLUSIVE MODE',table_value);
        FOR row_value IN EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE %I IN (''queued'',''running'')',table_value,CASE WHEN table_value='conversation_turns' THEN 'status' WHEN table_value='learner_portrait_interview_operations' THEN 'state' ELSE 'execution_state' END) LOOP
            PERFORM languon_text_ai_project_job(table_value,row_value,false);
        END LOOP;
        EXECUTE format('CREATE TRIGGER text_ai_capacity_job_projection AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION languon_text_ai_project_job_trigger()',table_value);
    END LOOP;
    FOREACH table_value IN ARRAY ARRAY['dictionary_generation_jobs','sentence_ai_jobs','texts_ai_jobs','dictionary_text_selection_jobs','conversation_provider_calls','learner_portrait_interview_provider_calls','ai_credit_action_attempts','dictionary_generation_provider_usage_archive'] LOOP
        EXECUTE format('LOCK TABLE %I IN SHARE ROW EXCLUSIVE MODE',table_value);
        FOR row_value IN EXECUTE format('SELECT to_jsonb(t) FROM %I t',table_value) LOOP
            PERFORM languon_text_ai_project_provider(table_value,row_value,false);
        END LOOP;
        EXECUTE format('CREATE TRIGGER text_ai_capacity_provider_projection AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION languon_text_ai_project_provider_trigger()',table_value);
    END LOOP;
END;
$$;

--> statement-breakpoint
CREATE FUNCTION languon_text_ai_has_capacity_overlap(kinds text[], at_value timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT EXISTS(SELECT 1 FROM text_ai_capacity_jobs WHERE job_kind=ANY(kinds))
        OR EXISTS(SELECT 1 FROM text_ai_capacity_provider_usage WHERE job_kind=ANY(kinds)
            AND (state='active' OR (state='settled' AND settled_at>at_value-interval '24 hours'
                AND (cost>0 OR input_tokens>0 OR output_tokens>0))));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_shared_text_ai_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  increases boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    increases := NEW.execution_state IN ('queued','running') OR NEW.provider_reservation_state = 'active';
  ELSE
    increases :=
      (NEW.execution_state IN ('queued','running') AND OLD.execution_state NOT IN ('queued','running'))
      OR (NEW.execution_state = 'running' AND
          (OLD.execution_state <> 'running' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id OR NEW.fencing_token > OLD.fencing_token))
      OR (NEW.provider_reservation_state = 'active' AND
          (OLD.provider_reservation_state <> 'active'
           OR NEW.provider_reserved_cost_micros > OLD.provider_reserved_cost_micros
           OR NEW.provider_reserved_input_tokens > OLD.provider_reserved_input_tokens
           OR NEW.provider_reserved_output_tokens > OLD.provider_reserved_output_tokens
           OR coalesce((to_jsonb(NEW)->>'provider_reserved_attempts')::integer,0) > coalesce((to_jsonb(OLD)->>'provider_reserved_attempts')::integer,0)));
  END IF;
  IF NOT increases THEN RETURN NEW; END IF;
  -- Acquiring before reading overlap serializes old admission-first and sentence-first orders.
  PERFORM pg_advisory_xact_lock(4312189072);
  IF current_setting('languon.text_ai_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['sentence-generation','sentence-check'],now()) THEN
    RAISE EXCEPTION 'Shared text AI-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  IF current_setting('languon.texts_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['text-detection','text-translation','text-selection-card'],now()) THEN
    RAISE EXCEPTION 'Texts-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  IF current_setting('languon.conversation_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['conversation-turn'],now()) THEN
    RAISE EXCEPTION 'Conversation-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1' AND languon_text_ai_has_capacity_overlap(ARRAY['portrait-interview'],now()) THEN
    RAISE EXCEPTION 'Portrait-capable capacity transaction required' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_portrait_capacity_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NOT (NEW.status='running' AND (OLD.status<>'running' OR NEW.lease_token IS DISTINCT FROM OLD.lease_token)) THEN RETURN NEW; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(4312189072);
 IF current_setting('languon.portrait_capacity_revision',true) IS DISTINCT FROM '1'
    AND languon_text_ai_has_capacity_overlap(ARRAY['portrait-interview'],now()) THEN
   RAISE EXCEPTION 'Portrait-capable capacity transaction required' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_queue_delta(text,bigint,bigint) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_project_job(text,jsonb,boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_usage_delta(text_ai_capacity_provider_usage,integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_project_provider(text,jsonb,boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_guard_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth()<2 THEN
        RAISE EXCEPTION 'Capacity projections must be maintained through source records' USING ERRCODE='55000';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
--> statement-breakpoint
DO $$
DECLARE table_value text;
BEGIN
    FOREACH table_value IN ARRAY ARRAY['text_ai_capacity_jobs','text_ai_capacity_queue_totals','text_ai_capacity_provider_usage','text_ai_capacity_active_totals','text_ai_capacity_settled_buckets'] LOOP
        EXECUTE format('CREATE TRIGGER text_ai_capacity_projection_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION languon_text_ai_guard_projection()',table_value);
    END LOOP;
END; $$;
--> statement-breakpoint
CREATE FUNCTION languon_text_ai_cleanup_capacity(at_value timestamptz, batch_limit integer DEFAULT 1000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    candidate record;
    usage_row text_ai_capacity_provider_usage%ROWTYPE;
    removed integer := 0;
    cutoff timestamptz := least(at_value,clock_timestamp())-interval '24 hours';
    previous_marker text := current_setting('languon.text_ai_capacity_maintenance',true);
BEGIN
    IF batch_limit<1 OR batch_limit>10000 THEN RAISE EXCEPTION 'Invalid capacity cleanup batch limit'; END IF;
    PERFORM pg_advisory_xact_lock(4312189072);
    PERFORM set_config('languon.text_ai_capacity_maintenance','1',true);
    FOR candidate IN SELECT id,job_kind FROM text_ai_capacity_provider_usage
        WHERE state='settled' AND settled_at<=cutoff ORDER BY settled_at LIMIT batch_limit LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(candidate.id::text,4312189074));
        SELECT * INTO usage_row FROM text_ai_capacity_provider_usage
            WHERE id=candidate.id AND job_kind=candidate.job_kind AND state='settled' AND settled_at<=cutoff FOR UPDATE;
        IF usage_row.id IS NOT NULL THEN
            PERFORM languon_text_ai_usage_delta(usage_row,-1);
            DELETE FROM text_ai_capacity_provider_usage WHERE id=usage_row.id AND job_kind=usage_row.job_kind;
            removed := removed+1;
        END IF;
    END LOOP;
    PERFORM set_config('languon.text_ai_capacity_maintenance',coalesce(previous_marker,''),true);
    RETURN removed;
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_text_ai_cleanup_capacity(timestamptz,integer) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_text_ai_guard_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth()<2 AND current_setting('languon.text_ai_capacity_maintenance',true) IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'Capacity projections must be maintained through source records' USING ERRCODE='55000';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
