-- Structured result eligibility is independent from immutable provider completion/expense.
CREATE OR REPLACE FUNCTION languon_register_structured_call(attempt_value uuid, lease_value uuid, validation_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE attempt_row public.ai_credit_action_attempts%ROWTYPE; turn_row public.conversation_turns%ROWTYPE; previous public.ai_credit_structured_call_validations%ROWTYPE; owner_value uuid;
BEGIN
 SELECT a.owner_id INTO owner_value FROM public.ai_credit_actions a JOIN public.ai_credit_action_attempts t ON t.action_id=a.id WHERE t.id=attempt_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Structured attempt is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 SELECT t.* INTO turn_row FROM public.conversation_turns t JOIN public.ai_credit_action_attempts a ON a.action_id=t.id WHERE a.id=attempt_value FOR UPDATE OF t;
 SELECT * INTO attempt_row FROM public.ai_credit_action_attempts WHERE id=attempt_value FOR UPDATE;
 IF turn_row.id IS NULL OR turn_row.owner_id<>owner_value OR turn_row.status<>'running' OR turn_row.cancel_requested OR lease_value IS NULL OR turn_row.lease_token IS DISTINCT FROM lease_value OR turn_row.lease_until<=clock_timestamp() OR turn_row.lease_until IS NULL OR attempt_row.state<>'dispatched' OR attempt_row.provider_dispatch_witness->>'token' IS DISTINCT FROM lease_value::text OR validation_value IS NULL OR length(validation_value) NOT BETWEEN 1 AND 200 OR NOT EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=attempt_row.action_id AND state='active') THEN
  RAISE EXCEPTION 'Structured registration requires its live dispatch lease' USING ERRCODE='23514';
 END IF;
 SELECT * INTO previous FROM public.ai_credit_structured_call_validations WHERE attempt_id=attempt_value;
 IF FOUND THEN
  IF previous.validation_id IS DISTINCT FROM validation_value THEN RAISE EXCEPTION 'Structured validation identity differs' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM public.ai_credit_structured_call_validations v JOIN public.ai_credit_action_attempts t ON t.id=v.attempt_id WHERE t.action_id=attempt_row.action_id AND v.validation_id=validation_value AND v.accepted IS NOT NULL) THEN
  RAISE EXCEPTION 'Validated structured group cannot admit another call' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.ai_credit_structured_call_validations(attempt_id,validation_id,created_at) VALUES(attempt_value,validation_value,clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION languon_register_structured_call(uuid,uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_validate_structured_call(attempt_value uuid, lease_value uuid, accepted_value boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE attempt_row public.ai_credit_action_attempts%ROWTYPE; turn_row public.conversation_turns%ROWTYPE; receipt public.ai_credit_structured_call_validations%ROWTYPE; owner_value uuid;
BEGIN
 SELECT a.owner_id INTO owner_value FROM public.ai_credit_actions a JOIN public.ai_credit_action_attempts t ON t.action_id=a.id WHERE t.id=attempt_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Structured attempt is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 SELECT t.* INTO turn_row FROM public.conversation_turns t JOIN public.ai_credit_action_attempts a ON a.action_id=t.id WHERE a.id=attempt_value FOR UPDATE OF t;
 SELECT * INTO attempt_row FROM public.ai_credit_action_attempts WHERE id=attempt_value FOR UPDATE;
 IF turn_row.id IS NULL OR turn_row.owner_id<>owner_value OR turn_row.status<>'running' OR turn_row.cancel_requested OR lease_value IS NULL OR turn_row.lease_token IS DISTINCT FROM lease_value OR turn_row.lease_until<=clock_timestamp() OR turn_row.lease_until IS NULL OR attempt_row.state<>'settled' OR attempt_row.provider_dispatch_witness->>'token' IS DISTINCT FROM lease_value::text OR accepted_value IS NULL OR (accepted_value AND attempt_row.successful<>1) OR NOT EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=attempt_row.action_id AND state='active') THEN
  RAISE EXCEPTION 'Structured validation requires its live completed dispatch lease' USING ERRCODE='23514';
 END IF;
 SELECT * INTO receipt FROM public.ai_credit_structured_call_validations WHERE attempt_id=attempt_value FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Structured call was not registered before dispatch' USING ERRCODE='23514'; END IF;
 IF receipt.accepted IS NOT NULL THEN
  IF receipt.accepted IS DISTINCT FROM accepted_value THEN RAISE EXCEPTION 'Structured validation replay differs' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 UPDATE public.ai_credit_structured_call_validations SET accepted=accepted_value,validated_at=clock_timestamp() WHERE attempt_id=attempt_value;
END $$;
REVOKE ALL ON FUNCTION languon_validate_structured_call(uuid,uuid,boolean) FROM PUBLIC;

-- The feature calls this inside its validated artifact/event checkpoint transaction.
CREATE OR REPLACE FUNCTION languon_accept_structured_validation(action_value uuid, lease_value uuid, validation_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_value uuid; call_value uuid; call_count integer:=0;
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_actions WHERE id=action_value;
 IF owner_value IS NULL OR validation_value IS NULL OR length(validation_value) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Structured validation action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 FOR call_value IN SELECT t.id FROM public.ai_credit_action_attempts t JOIN public.ai_credit_structured_call_validations v ON v.attempt_id=t.id WHERE t.action_id=action_value AND v.validation_id=validation_value ORDER BY t.ordinal LOOP
  PERFORM public.languon_validate_structured_call(call_value,lease_value,true);
  call_count:=call_count+1;
 END LOOP;
 IF call_count=0 THEN RAISE EXCEPTION 'Structured validation has no admitted call' USING ERRCODE='23514'; END IF;
 UPDATE public.conversation_turns SET usage=jsonb_set(usage,'{outputLimitReached}','false'::jsonb) WHERE id=action_value;
END $$;
REVOKE ALL ON FUNCTION languon_accept_structured_validation(uuid,uuid,text) FROM PUBLIC;

-- A typed run association may be attached once, while the action is still unsettled.
CREATE OR REPLACE FUNCTION languon_attach_credit_action_series(action_value uuid, series_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; existing public.ai_credit_action_series%ROWTYPE; owner_value uuid;
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_actions WHERE id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 SELECT * INTO existing FROM public.ai_credit_action_series WHERE action_id=action_value;
 IF FOUND THEN
  IF existing.series_id IS DISTINCT FROM series_value OR existing.owner_id IS DISTINCT FROM owner_value THEN RAISE EXCEPTION 'Action settlement series replay differs' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 IF a.state<>'active' OR a.usage_meter<>'text-tokens' OR NOT EXISTS(
  SELECT 1 FROM public.conversation_generation_run_actions m JOIN public.conversation_generation_runs r ON r.id=m.run_id
  JOIN public.conversation_turns t ON t.id=m.turn_id
  WHERE m.turn_id=action_value AND m.run_id=series_value AND m.kind='generation' AND r.owner_id=owner_value AND t.owner_id=owner_value AND t.conversation_id=r.conversation_id
 ) THEN RAISE EXCEPTION 'Action requires its typed generation series' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_credit_series_totals(series_id,owner_id) VALUES(series_value,owner_value) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.ai_credit_series_totals WHERE series_id=series_value AND owner_id=owner_value) THEN RAISE EXCEPTION 'Settlement series owner differs' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_credit_action_series(action_id,series_id,owner_id) VALUES(action_value,series_value,owner_value);
END $$;
REVOKE ALL ON FUNCTION languon_attach_credit_action_series(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_structured_validation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_value uuid; context_value text:=current_setting('languon.ai_credit_purge_owner',true);
BEGIN
 IF TG_OP='DELETE' THEN
  SELECT a.owner_id INTO owner_value FROM public.ai_credit_actions a JOIN public.ai_credit_action_attempts t ON t.action_id=a.id WHERE t.id=OLD.attempt_id;
  IF context_value IS NOT NULL AND context_value<>'' AND (owner_value IS NULL OR owner_value::text=context_value) AND public.languon_operator_purge_authorized(context_value::uuid) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Structured validation evidence cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF OLD.accepted IS NOT NULL OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.validation_id IS DISTINCT FROM OLD.validation_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.accepted IS NULL OR NEW.validated_at IS NULL THEN
  RAISE EXCEPTION 'Structured validation evidence is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_credit_structured_validation_guard BEFORE UPDATE OR DELETE ON public.ai_credit_structured_call_validations FOR EACH ROW EXECUTE FUNCTION languon_guard_structured_validation();

CREATE OR REPLACE FUNCTION languon_guard_credit_series() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF public.languon_operator_purge_authorized(OLD.owner_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Credit series evidence cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='ai_credit_action_series' THEN
  RAISE EXCEPTION 'Credit series association is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.series_id IS DISTINCT FROM OLD.series_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.numerator<OLD.numerator OR NEW.charged_milli<OLD.charged_milli THEN
  RAISE EXCEPTION 'Credit series identity and settled amounts are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_credit_action_series_guard BEFORE UPDATE OR DELETE ON public.ai_credit_action_series FOR EACH ROW EXECUTE FUNCTION languon_guard_credit_series();
CREATE TRIGGER ai_credit_series_totals_guard BEFORE UPDATE OR DELETE ON public.ai_credit_series_totals FOR EACH ROW EXECUTE FUNCTION languon_guard_credit_series();
