-- Read only an exact same-chat proposal under the worker's active lease.
CREATE FUNCTION public.languon_read_learning_block_proposal(
 turn_value uuid, lease_value uuid, proposal_value uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.conversation_turns%ROWTYPE; c public.conversation_chats%ROWTYPE;
 result_value jsonb;
BEGIN
 SELECT * INTO t FROM public.conversation_turns WHERE id=turn_value FOR UPDATE;
 IF NOT FOUND OR t.status<>'running' OR t.cancel_requested
  OR t.lease_token IS NULL OR t.lease_token IS DISTINCT FROM lease_value
  OR t.lease_until IS NULL OR t.lease_until<=clock_timestamp() THEN
  RAISE EXCEPTION 'The response is no longer active' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.conversation_chats WHERE id=t.conversation_id AND owner_id=t.owner_id FOR SHARE;
 IF NOT FOUND OR c.source_kind<>'knowledge' OR c.source->>'view'='saved' OR c.source ? 'shareKind'
  OR t.authority->>'sourceOwnerId' IS DISTINCT FROM t.owner_id::text
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=t.owner_id AND status='active')
  OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=c.source_id AND owner_id=t.owner_id)
 THEN RAISE EXCEPTION 'The source is unavailable' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('id',p.id,'blocks',p.blocks) INTO result_value
 FROM public.conversation_block_proposals p
 WHERE p.id=proposal_value AND p.conversation_id=c.id AND p.note_id=c.source_id;
 IF result_value IS NULL THEN RAISE EXCEPTION 'The proposal is unavailable' USING ERRCODE='23514'; END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.languon_read_learning_block_proposal(uuid,uuid,uuid) FROM PUBLIC;
