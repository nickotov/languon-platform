-- Optional diagnostics are historical observations, never dispatch prerequisites.
CREATE OR REPLACE FUNCTION languon_text_ai_route_dispatch_allowed(route_value text,flow_value text,fingerprint_value text,at_value timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(route_value,1920424421));
 -- Only actual dispatched provider observations affect runtime eligibility. Manual
 -- diagnostics never disable a route, clear a cooldown, or authorize dispatch.
 -- Keep provider-credential failures shared across sibling routes and model/
 -- transport failures shared across flows on the route. Only schema failures
 -- belong to the current flow contract. Every exclusion expires automatically.
 RETURN NOT EXISTS(
   SELECT 1 FROM public.text_ai_route_health_events
   WHERE observed_at>at_value-interval '60 seconds' AND observed_at<=at_value
     AND (
       (provider_id=split_part(route_value,'/',1) AND reason='authorization_failed')
       OR (route_id=route_value AND reason IN ('model_retired','model_unavailable','provider_unavailable','rate_limited','provider_credits_exhausted'))
       OR (route_id=route_value AND flow_id=flow_value AND fingerprint=fingerprint_value AND reason='schema_incompatible')
     )
 );
END $$;
REVOKE ALL ON FUNCTION languon_text_ai_route_dispatch_allowed(text,text,text,timestamptz) FROM PUBLIC;
