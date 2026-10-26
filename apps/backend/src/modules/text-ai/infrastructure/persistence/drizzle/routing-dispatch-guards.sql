-- Immutable per-call model/price provenance is installed after the routing schema.
CREATE OR REPLACE FUNCTION languon_guard_text_ai_route_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; k text; e jsonb; s jsonb; candidate jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id) THEN RAISE EXCEPTION 'Route dispatch receipt is immutable' USING ERRCODE='55000'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Route dispatch receipt is immutable' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=NEW.attempt_id;
 IF a.id IS NULL OR a.state<>'dispatched' OR NEW.created_at IS DISTINCT FROM a.created_at THEN RAISE EXCEPTION 'Route receipt requires its admitted provider attempt' USING ERRCODE='23514'; END IF;
 SELECT job_kind INTO k FROM public.ai_action_charging_policies WHERE job_id=a.action_id;
 CASE k
  WHEN 'conversation-turn' THEN SELECT execution INTO e FROM public.conversation_turns WHERE id=a.execution_job_id;
  WHEN 'portrait-interview' THEN SELECT execution INTO e FROM public.learner_portrait_interview_operations WHERE id=a.execution_job_id;
  WHEN 'dictionary-generation' THEN SELECT selected_execution_snapshot INTO e FROM public.dictionary_generation_jobs WHERE id=a.execution_job_id;
  WHEN 'sentence-generation','sentence-check' THEN SELECT selected_execution_snapshot INTO e FROM public.sentence_ai_jobs WHERE id=a.execution_job_id;
  WHEN 'text-detection','text-translation' THEN SELECT selected_execution_snapshot INTO e FROM public.texts_ai_jobs WHERE id=a.execution_job_id;
  WHEN 'text-selection-card' THEN SELECT selected_execution_snapshot INTO e FROM public.dictionary_text_selection_jobs WHERE id=a.execution_job_id;
  ELSE RAISE EXCEPTION 'Route receipt has no typed provenance' USING ERRCODE='23514';
 END CASE;
 s:=coalesce(e->'snapshot',e);
 IF NEW.route_id IS DISTINCT FROM (NEW.snapshot->>'providerId')||'/'||(NEW.snapshot->>'modelId') THEN RAISE EXCEPTION 'Route receipt identity mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.snapshot->>'providerId'=s->>'providerId' AND NEW.snapshot->>'modelId'=s->>'modelId' THEN
  IF NEW.provider_price IS DISTINCT FROM coalesce(e->'providerPrice',e->'actionProviderPrice') THEN RAISE EXCEPTION 'Route receipt changes the admitted provider price' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT value INTO candidate FROM jsonb_array_elements(s->'routingAuthority'->'candidates') WHERE value->>'routeId'=NEW.route_id;
  IF candidate IS NULL OR NEW.provider_price IS DISTINCT FROM candidate->'providerPrice' OR NOT NEW.snapshot @> ((candidate->'snapshot')-'aggregateBudget') THEN RAISE EXCEPTION 'Route receipt uses an unauthorized alternative' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_text_ai_route_dispatch() FROM PUBLIC;
CREATE OR REPLACE TRIGGER text_ai_route_dispatch_immutable BEFORE INSERT OR UPDATE OR DELETE ON text_ai_route_dispatches FOR EACH ROW EXECUTE FUNCTION languon_guard_text_ai_route_dispatch();

CREATE OR REPLACE FUNCTION languon_guard_text_ai_routing_revision() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published routing revisions are immutable' USING ERRCODE='55000'; END $$;
CREATE OR REPLACE TRIGGER text_ai_routing_revision_immutable BEFORE UPDATE OR DELETE ON text_ai_routing_revisions FOR EACH ROW EXECUTE FUNCTION languon_guard_text_ai_routing_revision();
