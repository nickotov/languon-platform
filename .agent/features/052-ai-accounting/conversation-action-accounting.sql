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
