-- Restricted erasure preserves the existing MCP reference-only audit policy.
-- No caller receives access to token secrets, preview payloads, or audit metadata.
CREATE OR REPLACE FUNCTION languon_purge_admin_mcp_owner(owner_value uuid,worker_value text,fence_value integer,at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE token_values uuid[]; preview_values uuid[]; event_value record; references_value jsonb; key_value text;
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO token_values FROM (
  SELECT id FROM public.admin_mcp_tokens WHERE owner_user_id=owner_value FOR UPDATE
 ) locked_tokens;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO preview_values FROM (
  SELECT id FROM public.admin_mcp_previews WHERE token_id=ANY(token_values)
   OR target=owner_value::text OR target='user-action-budget:'||owner_value::text FOR UPDATE
 ) locked_previews;
 DELETE FROM public.admin_mcp_receipts WHERE preview_id=ANY(preview_values);
 DELETE FROM public.admin_mcp_previews WHERE id=ANY(preview_values);
 DELETE FROM public.admin_mcp_reservations WHERE token_id=ANY(token_values);
 UPDATE public.admin_mcp_tokens SET name='Account purged',
  secret_hash=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),
  permissions='[]'::jsonb,allowed_actions='[]'::jsonb,limits='{}'::jsonb,revoked_at=at_value,last_used_at=NULL
 WHERE id=ANY(token_values);
 FOR event_value IN SELECT id,metadata FROM public.admin_mcp_audit_events
  WHERE actor_user_id=owner_value OR target=owner_value::text OR target='user-action-budget:'||owner_value::text FOR UPDATE
 LOOP
  references_value='{}'::jsonb;
  FOREACH key_value IN ARRAY ARRAY['providerExpenseId','reservationId','probeId','actionId'] LOOP
   IF jsonb_typeof(event_value.metadata->key_value)='string'
    AND event_value.metadata->>key_value ~* '^[0-9a-f-]{36}$' THEN
    references_value=references_value||jsonb_build_object(key_value,event_value.metadata->key_value);
   END IF;
  END LOOP;
  IF jsonb_typeof(event_value.metadata->'providerExpenseIds')='array' THEN
   references_value=references_value||jsonb_build_object('providerExpenseIds',(
    SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(event_value.metadata->'providerExpenseIds')
    WHERE jsonb_typeof(value)='string' AND value#>>'{}' ~* '^[0-9a-f-]{36}$'
   ));
  END IF;
  UPDATE public.admin_mcp_audit_events SET reason='Account purged',target='purged-account',metadata=references_value
   WHERE id=event_value.id;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION languon_purge_admin_mcp_owner(uuid,text,integer,timestamptz) FROM PUBLIC;

--> statement-breakpoint
-- The worker can read bytes only through its live typed transcription lease.
CREATE OR REPLACE FUNCTION languon_read_transcription_audio(job_value uuid, worker_value text, fence_value integer)
RETURNS TABLE(bytes bytea,mime_type text,duration_ms integer,checksum text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT b.bytes,b.mime_type,b.duration_ms,b.checksum
 FROM public.knowledge_transcription_jobs j
 JOIN public.users u ON u.id=j.owner_id AND u.status='active'
 JOIN public.knowledge_notes n ON n.id=j.note_id AND n.owner_id=j.owner_id
 JOIN public.knowledge_media_assets a ON a.id=j.asset_id AND a.note_id=n.id
 JOIN public.knowledge_media_blobs b ON b.id=a.blob_id
 WHERE j.id=job_value AND j.state='running' AND j.worker_id=worker_value AND j.fencing_token=fence_value
   AND j.cancellation_requested_at IS NULL AND j.lease_deadline>clock_timestamp() AND j.deadline_at>clock_timestamp()
   AND b.checksum=j.checksum AND b.duration_ms=j.source_duration_ms AND octet_length(b.bytes)=j.byte_length;
$$;
REVOKE ALL ON FUNCTION languon_read_transcription_audio(uuid,text,integer) FROM PUBLIC;
