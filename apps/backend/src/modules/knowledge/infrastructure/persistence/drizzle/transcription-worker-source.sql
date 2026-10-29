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
