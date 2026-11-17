-- Read only an exact same-chat proposal under the worker's active lease.
CREATE OR REPLACE FUNCTION public.languon_read_learning_content_proposal(
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
 SELECT jsonb_build_object(
        'id',p.id,'conversationId',p.conversation_id,'turnId',p.turn_id,
        'noteId',p.note_id,'branchId',p.branch_id,'baseBranchVersion',p.base_branch_version,
        'body',p.body,'dependencies',p.dependency_snapshots,
        'createdAt',to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'appliedAt',CASE WHEN p.applied_at IS NULL THEN NULL ELSE
            to_char(p.applied_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        'appliedBranchVersion',p.applied_branch_version
    ) INTO result_value
 FROM public.conversation_content_proposals p
 WHERE p.id=proposal_value AND p.conversation_id=c.id AND p.note_id=c.source_id
 AND (p.turn_id=t.id OR EXISTS(SELECT 1 FROM public.conversation_turns origin_turn
  WHERE origin_turn.id=p.turn_id AND origin_turn.status='succeeded'));
 IF result_value IS NULL THEN RAISE EXCEPTION 'The proposal is unavailable' USING ERRCODE='23514'; END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.languon_read_learning_content_proposal(uuid,uuid,uuid) FROM PUBLIC;
