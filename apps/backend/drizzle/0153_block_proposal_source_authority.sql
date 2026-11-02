-- Workers may publish suggestions for their current turn without reading drafts.
CREATE OR REPLACE FUNCTION public.languon_propose_learning_block_change(
 turn_value uuid, lease_value uuid, blocks_value jsonb, target_value uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.conversation_turns%ROWTYPE; c public.conversation_chats%ROWTYPE;
 n public.knowledge_notes%ROWTYPE; branch_value uuid; version_value integer;
 actual_version integer; proposal_value uuid := gen_random_uuid();
 branch_body jsonb; target_body jsonb; source_ref text; dependency_body jsonb;
 dependencies_value jsonb := '[]'::jsonb;
BEGIN
 SELECT * INTO t FROM public.conversation_turns WHERE id=turn_value FOR UPDATE;
 IF NOT FOUND OR t.status<>'running' OR t.cancel_requested
  OR t.lease_token IS NULL OR t.lease_token IS DISTINCT FROM lease_value OR t.lease_until<=clock_timestamp()
  OR t.lease_until IS NULL THEN RAISE EXCEPTION 'The response is no longer active' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.conversation_chats WHERE id=t.conversation_id AND owner_id=t.owner_id FOR SHARE;
 IF NOT FOUND OR c.source_kind<>'knowledge' OR c.source->>'view'='saved' OR c.source ? 'shareKind'
  OR t.authority->>'sourceOwnerId' IS DISTINCT FROM t.owner_id::text
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=t.owner_id AND status='active')
 THEN RAISE EXCEPTION 'Only the document owner can propose blocks' USING ERRCODE='23514'; END IF;
 SELECT * INTO n FROM public.knowledge_notes WHERE id=c.source_id AND owner_id=t.owner_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'The source is unavailable' USING ERRCODE='23514'; END IF;
 branch_value := (t.source_snapshot->'blockTarget'->>'branchId')::uuid;
 version_value := (t.source_snapshot->'blockTarget'->>'version')::integer;
 SELECT version INTO actual_version FROM public.knowledge_working_branches
  WHERE id=branch_value AND note_id=n.id FOR UPDATE;
 IF NOT FOUND OR actual_version IS DISTINCT FROM version_value THEN
  RAISE EXCEPTION 'The working document changed during generation' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.conversation_block_proposals WHERE turn_id=t.id) THEN
  RAISE EXCEPTION 'A block proposal was already generated for this response' USING ERRCODE='23505'; END IF;
 -- Canonical proposals are bounded to100k UTF-16 units. Allow their UTF-8
 -- encoding plus JSONB formatting without excluding valid multilingual text.
 IF jsonb_typeof(blocks_value) IS DISTINCT FROM 'array' OR octet_length(blocks_value::text)>500000 THEN
  RAISE EXCEPTION 'Invalid proposed blocks' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(blocks_value) NOT BETWEEN 1 AND 25 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(blocks_value) b WHERE jsonb_typeof(b)<>'object'
  OR jsonb_typeof(b->'id') IS DISTINCT FROM 'string'
  OR b->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  OR coalesce(b->>'type','') NOT IN('video','vocabulary','bilingual-text','audio','grammar','exercise')
 ) THEN RAISE EXCEPTION 'Invalid proposed blocks' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(blocks_value) b WHERE b->>'type'='audio'
  AND b ? 'assetId' AND NOT EXISTS(SELECT 1 FROM public.knowledge_media_assets a WHERE a.note_id=n.id AND a.id::text=b->>'assetId'))
 THEN RAISE EXCEPTION 'Audio content must belong to this note' USING ERRCODE='23514'; END IF;
 SELECT content->'body'->'document' INTO branch_body FROM public.knowledge_working_branches WHERE id=branch_value;
 IF target_value IS NOT NULL THEN
  IF jsonb_array_length(blocks_value) <> 1 THEN RAISE EXCEPTION 'An update requires one block' USING ERRCODE='23514'; END IF;
  WITH RECURSIVE nodes(value) AS (
   SELECT branch_body
   UNION ALL
   SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(value->'content')='array' THEN value->'content' ELSE '[]'::jsonb END) child
  ) SELECT value->'attrs'->'block' INTO target_body FROM nodes
    WHERE value->>'type'='learningBlock' AND value->'attrs'->'block'->>'id'=target_value::text;
  IF target_body IS NULL OR target_body->>'type' IS DISTINCT FROM blocks_value->0->>'type' THEN
   RAISE EXCEPTION 'The target block is unavailable or has a different type' USING ERRCODE='23514'; END IF;
  IF blocks_value->0->>'id' IS DISTINCT FROM target_value::text THEN RAISE EXCEPTION 'The replacement identity must match its target' USING ERRCODE='23514'; END IF;
 END IF;
 -- An append can coexist with unrelated edits. Grounded questions retain exact
 -- existing source blocks so apply can detect changed passages and copying can
 -- include an independent, correctly remapped source rather than mis-grounding.
 FOR source_ref IN SELECT DISTINCT reference.id
  FROM jsonb_array_elements(blocks_value) b
  CROSS JOIN LATERAL (VALUES (b->'source'->>'blockId'),(b->'group'->>'parentBlockId')) AS reference(id)
  WHERE b->>'type'='exercise' AND reference.id IS NOT NULL
 LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(blocks_value) b WHERE b->>'id'=source_ref) THEN CONTINUE; END IF;
  dependency_body := NULL;
  WITH RECURSIVE nodes(value) AS (
   SELECT branch_body
   UNION ALL
   SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(value->'content')='array' THEN value->'content' ELSE '[]'::jsonb END) child
  ) SELECT value->'attrs'->'block' INTO dependency_body FROM nodes
    WHERE value->>'type'='learningBlock' AND value->'attrs'->'block'->>'id'=source_ref;
  IF dependency_body IS NULL THEN RAISE EXCEPTION 'The question source is unavailable' USING ERRCODE='23514'; END IF;
  dependencies_value := dependencies_value || jsonb_build_array(dependency_body);
 END LOOP;
 INSERT INTO public.conversation_block_proposals(id,conversation_id,turn_id,note_id,branch_id,base_branch_version,blocks,created_at,target_block_id,target_snapshot,dependency_snapshots)
 VALUES(proposal_value,c.id,t.id,n.id,branch_value,version_value,blocks_value,clock_timestamp(),target_value,target_body,dependencies_value);
 RETURN proposal_value;
END $$;
REVOKE ALL ON FUNCTION public.languon_propose_learning_block_change(uuid,uuid,jsonb,uuid) FROM PUBLIC;
