-- Preserve every existing proposal identity, receipt and source snapshot while
-- replacing the pre-release blocks-only payload with the canonical mixed body.
UPDATE public.conversation_content_proposals p
SET body = jsonb_build_object('schemaVersion', 2, 'document', jsonb_build_object(
 'type', 'doc', 'content', coalesce((SELECT jsonb_agg(jsonb_build_object('type', 'learningBlock', 'attrs', jsonb_build_object('block', item)) ORDER BY ordinal)
 FROM jsonb_array_elements(p.body) WITH ORDINALITY AS entry(item, ordinal)), '[]'::jsonb)))
WHERE jsonb_typeof(p.body) = 'array';

--> statement-breakpoint
-- Canonical proposal authority: frozen local named sources participate in the
-- existing stale-source and independent-copy contract. Migration generation
-- copies this function; historical migrations remain immutable.
CREATE OR REPLACE FUNCTION public.languon_propose_learning_content_change(
 turn_value uuid, lease_value uuid, body_value jsonb, target_value uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.conversation_turns%ROWTYPE; c public.conversation_chats%ROWTYPE;
 n public.knowledge_notes%ROWTYPE; branch_value uuid; version_value integer;
 actual_version integer; proposal_value uuid := gen_random_uuid();
 branch_body jsonb; target_body jsonb; source_ref text; dependency_body jsonb;
 existing_proposal uuid; source_kind text;
 dependencies_value jsonb := '[]'::jsonb; blocks_value jsonb;
BEGIN
  IF jsonb_typeof(body_value) IS DISTINCT FROM 'object'
     OR body_value->>'schemaVersion' IS DISTINCT FROM '2'
     OR body_value->'document'->>'type' IS DISTINCT FROM 'doc'
     OR jsonb_typeof(body_value->'document'->'content') IS DISTINCT FROM 'array'
     OR octet_length(body_value::text)>500000 THEN
    RAISE EXCEPTION 'Invalid proposed content' USING ERRCODE='23514';
  END IF;
  IF jsonb_array_length(body_value->'document'->'content') NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Invalid proposed content size' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(node->'attrs'->'block'),'[]'::jsonb) INTO blocks_value
  FROM jsonb_array_elements(body_value->'document'->'content') node
  WHERE node->>'type'='learningBlock';
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
 SELECT id INTO existing_proposal FROM public.conversation_content_proposals
  WHERE turn_id=t.id AND target_block_id IS NOT DISTINCT FROM target_value;
 IF FOUND THEN
  IF EXISTS(SELECT 1 FROM public.conversation_content_proposals WHERE id=existing_proposal AND body=body_value) THEN RETURN existing_proposal; END IF;
  RAISE EXCEPTION 'A proposal already exists for this target' USING ERRCODE='23505';
 END IF;
 IF (SELECT count(*) FROM public.conversation_content_proposals WHERE turn_id=t.id)>=8 THEN
  RAISE EXCEPTION 'The response proposal limit was reached' USING ERRCODE='23514'; END IF;
 -- Canonical proposals are bounded to100k UTF-16 units. Allow their UTF-8
 -- encoding plus JSONB formatting without excluding valid multilingual text.
 IF jsonb_typeof(blocks_value) IS DISTINCT FROM 'array' OR octet_length(blocks_value::text)>500000 THEN
  RAISE EXCEPTION 'Invalid proposed blocks' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(blocks_value)>25 OR EXISTS(
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
  IF jsonb_array_length(coalesce(t.source_snapshot->'blockReferences', '[]'::jsonb))>0
   AND NOT (t.source_snapshot->'blockReferences' ? target_value::text) THEN
   RAISE EXCEPTION 'An update must target an explicitly mentioned block' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(blocks_value) <> 1 OR jsonb_array_length(body_value->'document'->'content') <> 1 THEN RAISE EXCEPTION 'An update requires one block' USING ERRCODE='23514'; END IF;
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
 -- A named local reference has a material kind distinct from the legacy
 -- passage/media references. Historical origins never authorize local reads.
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(blocks_value) b
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b->'semantics'->'sources')='array' THEN b->'semantics'->'sources' ELSE '[]'::jsonb END) source
  WHERE b->>'type'='exercise' AND source->'origin'->>'kind'='block'
   AND (jsonb_typeof(source->'origin'->'blockId') IS DISTINCT FROM 'string'
    OR source->'origin'->>'blockId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(source->>'kind','') NOT IN ('vocabulary','grammar','text'))
 ) THEN RAISE EXCEPTION 'The named question source is invalid' USING ERRCODE='23514'; END IF;
 FOR source_ref,source_kind IN
  SELECT DISTINCT reference.id,reference.kind FROM (
   SELECT legacy.id,NULL::text AS kind
    FROM jsonb_array_elements(blocks_value) b
    CROSS JOIN LATERAL (VALUES (b->'source'->>'blockId'),(b->'group'->>'parentBlockId')) AS legacy(id)
    WHERE b->>'type'='exercise'
   UNION ALL
   SELECT source->'origin'->>'blockId',
    CASE source->>'kind' WHEN 'vocabulary' THEN 'vocabulary' WHEN 'grammar' THEN 'grammar' WHEN 'text' THEN 'bilingual-text' END
    FROM jsonb_array_elements(blocks_value) b
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b->'semantics'->'sources')='array' THEN b->'semantics'->'sources' ELSE '[]'::jsonb END) source
    WHERE b->>'type'='exercise' AND source->'origin'->>'kind'='block'
  ) reference WHERE reference.id IS NOT NULL
 LOOP
  SELECT b INTO dependency_body FROM jsonb_array_elements(blocks_value) b WHERE b->>'id'=source_ref;
  IF FOUND THEN
   IF source_kind IS NOT NULL AND dependency_body->>'type' IS DISTINCT FROM source_kind THEN
    RAISE EXCEPTION 'The named question source has a different material kind' USING ERRCODE='23514'; END IF;
   CONTINUE;
  END IF;
  dependency_body := NULL;
  WITH RECURSIVE nodes(value) AS (
   SELECT branch_body
   UNION ALL
   SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(value->'content')='array' THEN value->'content' ELSE '[]'::jsonb END) child
  ) SELECT value->'attrs'->'block' INTO dependency_body FROM nodes
    WHERE value->>'type'='learningBlock' AND value->'attrs'->'block'->>'id'=source_ref;
  IF dependency_body IS NULL THEN RAISE EXCEPTION 'The question source is unavailable' USING ERRCODE='23514'; END IF;
  IF source_kind IS NOT NULL AND dependency_body->>'type' IS DISTINCT FROM source_kind THEN
   RAISE EXCEPTION 'The named question source has a different material kind' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dependencies_value) b WHERE b->>'id'=source_ref) THEN
   dependencies_value := dependencies_value || jsonb_build_array(dependency_body);
  END IF;
 END LOOP;
 INSERT INTO public.conversation_content_proposals(id,conversation_id,turn_id,note_id,branch_id,base_branch_version,body,created_at,target_block_id,target_snapshot,dependency_snapshots)
 VALUES(proposal_value,c.id,t.id,n.id,branch_value,version_value,body_value,clock_timestamp(),target_value,target_body,dependencies_value);
 RETURN proposal_value;
END $$;
REVOKE ALL ON FUNCTION public.languon_propose_learning_content_change(uuid,uuid,jsonb,uuid) FROM PUBLIC;

--> statement-breakpoint
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

--> statement-breakpoint
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

--> statement-breakpoint
-- Compact operational capacity complements the cross-provider USD authorization.
CREATE OR REPLACE FUNCTION languon_text_dispatch_capacity_allows(owner_value uuid, budget_value jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH limits AS (
  SELECT (budget_value->>'maxCostMicrosPerAttempt')::numeric AS cost,
    (budget_value->>'maxInputTokensPerAttempt')::numeric AS input_tokens,
    (budget_value->>'maxOutputTokensPerAttempt')::numeric AS output_tokens,
    concat_ws(':',budget_value->>'inputCostMicrosPerMillionTokens',budget_value->>'outputCostMicrosPerMillionTokens',budget_value->>'maxCostMicrosPerAttempt',budget_value->>'maxInputTokensPerAttempt',budget_value->>'maxOutputTokensPerAttempt') AS cohort,
    clock_timestamp()-interval '24 hours' AS cutoff
 ), scopes AS (SELECT 'global'::text AS scope,10 AS active_limit,20 AS daily_limit UNION ALL SELECT owner_value::text,3,3),
 usage AS (
  SELECT s.scope,s.active_limit,s.daily_limit,l.cost,l.input_tokens,l.output_tokens,
   coalesce(a.cost,0) AS active_cost,coalesce(a.input_tokens,0) AS active_input,coalesce(a.output_tokens,0) AS active_output,
   coalesce((SELECT sum(b.cost) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.cost) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_cost,
   coalesce((SELECT sum(b.input_tokens) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.input_tokens) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_input,
   coalesce((SELECT sum(b.output_tokens) FROM public.text_ai_capacity_settled_buckets b WHERE b.scope=s.scope AND b.cohort=l.cohort AND b.minute>=date_trunc('minute',l.cutoff)+interval '1 minute'),0)+coalesce((SELECT sum(u.output_tokens) FROM public.text_ai_capacity_provider_usage u WHERE u.cohort=l.cohort AND u.state='settled' AND (s.scope='global' OR u.owner_id=owner_value) AND u.settled_at>l.cutoff AND u.settled_at<date_trunc('minute',l.cutoff)+interval '1 minute'),0) AS settled_output
  FROM scopes s CROSS JOIN limits l LEFT JOIN public.text_ai_capacity_active_totals a ON a.scope=s.scope AND a.cohort=l.cohort
 ) SELECT coalesce(bool_and(active_cost+cost<=cost*active_limit AND active_input+input_tokens<=input_tokens*active_limit AND active_output+output_tokens<=output_tokens*active_limit AND settled_cost+active_cost+cost<=cost*daily_limit AND settled_input+active_input+input_tokens<=input_tokens*daily_limit AND settled_output+active_output+output_tokens<=output_tokens*daily_limit),false) FROM usage;
$$;
REVOKE ALL ON FUNCTION languon_text_dispatch_capacity_allows(uuid,jsonb) FROM PUBLIC;

-- Financial mutations exposed to execution workers are tied to API-owned work.
-- The witness is a claimed typed lease, never a mutable session setting.
CREATE OR REPLACE FUNCTION languon_text_dispatch_execution(action_value uuid, job_value uuid, token_value text, worker_value text, fence_value bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text; row_value jsonb; execution_value jsonb; snapshot_value jsonb; owner_value uuid; table_value text; route_candidate jsonb; routing_value jsonb; dispatch_attempt integer; route_value text; configured_value jsonb; fingerprint_value text;
BEGIN
 SELECT a.owner_id,p.job_kind INTO owner_value,k FROM public.ai_credit_actions a JOIN public.ai_action_charging_policies p ON p.job_id=a.id AND p.owner_id=a.owner_id WHERE a.id=action_value AND a.state='active';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Dispatch requires its admitted action' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') THEN RAISE EXCEPTION 'Dispatch owner is inactive' USING ERRCODE='23514'; END IF;
 CASE k
  WHEN 'conversation-turn' THEN table_value:='conversation_turns';
  WHEN 'portrait-interview' THEN table_value:='learner_portrait_interview_operations';
  WHEN 'dictionary-generation' THEN table_value:='dictionary_generation_jobs';
  WHEN 'sentence-generation','sentence-check' THEN table_value:='sentence_ai_jobs';
  WHEN 'text-detection','text-translation' THEN table_value:='texts_ai_jobs';
  WHEN 'text-selection-card' THEN table_value:='dictionary_text_selection_jobs';
  ELSE RAISE EXCEPTION 'Unsupported dispatch feature' USING ERRCODE='23514';
 END CASE;
 EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',table_value) INTO row_value USING job_value;
 IF row_value IS NULL OR coalesce(row_value->>'owner_id',row_value->>'learner_id') IS DISTINCT FROM owner_value::text THEN RAISE EXCEPTION 'Dispatch feature ownership mismatch' USING ERRCODE='23514'; END IF;
 IF k IN ('conversation-turn','portrait-interview') THEN
  IF job_value<>action_value OR coalesce(row_value->>'status',row_value->>'state')<>'running' OR token_value IS NULL OR row_value->>'lease_token' IS DISTINCT FROM token_value OR row_value->>'lease_until' IS NULL OR (row_value->>'lease_until')::timestamptz<=clock_timestamp() OR coalesce((row_value->>'cancel_requested')::boolean,false) THEN RAISE EXCEPTION 'Dispatch requires the current live lease' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'execution';
 ELSE
  IF row_value->>'execution_state'<>'running' OR worker_value IS NULL OR fence_value IS NULL OR row_value->>'worker_id' IS DISTINCT FROM worker_value OR (row_value->>'fencing_token')::bigint IS DISTINCT FROM fence_value OR row_value->>'lease_deadline' IS NULL OR (row_value->>'lease_deadline')::timestamptz<=clock_timestamp() OR row_value->>'cancellation_requested_at' IS NOT NULL THEN RAISE EXCEPTION 'Dispatch requires the current live worker fence' USING ERRCODE='23514'; END IF;
  execution_value:=row_value->'selected_execution_snapshot';
  IF job_value<>action_value THEN
   IF execution_value->>'actionParentId' IS DISTINCT FROM action_value::text OR NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions m JOIN public.sentence_preparation_children c ON c.preparation_id=m.preparation_id WHERE m.action_id=action_value AND c.job_id=job_value AND m.terminal_outcome IS NULL AND (m.selected_execution_snapshot-'actionParentId')=(execution_value-'actionParentId')) THEN RAISE EXCEPTION 'Preparation child has no admitted parent' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF execution_value->>'actionAccountingVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Dispatch requires immutable accounting execution' USING ERRCODE='23514'; END IF;
 snapshot_value:=coalesce(execution_value->'snapshot',execution_value);
 routing_value:=snapshot_value->'routingAuthority';
 IF routing_value IS NOT NULL THEN
  dispatch_attempt:=CASE WHEN k IN ('conversation-turn','portrait-interview') THEN
      1+(SELECT count(*) FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state='settled' AND successful=0)
      ELSE (row_value->>'attempt_count')::integer END;
  IF dispatch_attempt NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Automatic routing attempt allowance exhausted' USING ERRCODE='23514'; END IF;
  IF dispatch_attempt=2 THEN
   IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state='dispatched') THEN RAISE EXCEPTION 'Ambiguous upstream execution cannot be retried' USING ERRCODE='23514'; END IF;
   IF k='conversation-turn' AND EXISTS(SELECT 1 FROM public.conversation_messages WHERE turn_id=action_value AND role='assistant' AND content<>'') THEN RAISE EXCEPTION 'Visible output prevents automatic fallback' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT r.configuration INTO configured_value FROM public.text_ai_routing_state current_state JOIN public.text_ai_routing_revisions r ON r.id=current_state.active_revision_id WHERE current_state.id='global' FOR SHARE OF current_state;
  IF dispatch_attempt=1 AND k IN ('conversation-turn','portrait-interview') THEN
   -- Inline adapters were constructed before admission; never change their identity behind HTTP.
   route_candidate:=routing_value->'candidates'->0;
   IF configured_value IS NULL OR NOT (configured_value->'enabledRouteIds' ? (route_candidate->>'routeId')) OR NOT public.languon_text_ai_route_dispatch_allowed(route_candidate->>'routeId',routing_value->>'flowId',route_candidate->>'fingerprint',clock_timestamp()) THEN route_candidate:=NULL; END IF;
  ELSIF dispatch_attempt=2 AND k IN ('conversation-turn','portrait-interview') THEN
   route_candidate:=routing_value->'candidates'->1;
   IF configured_value IS NULL OR route_candidate IS NULL OR NOT (configured_value->'enabledRouteIds' ? (route_candidate->>'routeId')) OR NOT public.languon_text_ai_route_dispatch_allowed(route_candidate->>'routeId',routing_value->>'flowId',route_candidate->>'fingerprint',clock_timestamp()) THEN route_candidate:=NULL; END IF;
  ELSIF dispatch_attempt=1 THEN
   -- No provider has run: choose only among the alternatives pinned at admission.
   SELECT candidate INTO route_candidate FROM jsonb_array_elements(routing_value->'candidates') WITH ORDINALITY AS pinned(candidate,position)
   WHERE configured_value->'enabledRouteIds' ? (candidate->>'routeId')
    AND public.languon_text_ai_route_dispatch_allowed(candidate->>'routeId',routing_value->>'flowId',candidate->>'fingerprint',clock_timestamp())
   ORDER BY position LIMIT 1;
  ELSE
   SELECT candidate INTO route_candidate FROM jsonb_array_elements(routing_value->'candidates') WITH ORDINALITY AS pinned(candidate,position)
   WHERE NOT EXISTS(SELECT 1 FROM public.text_ai_route_dispatches d JOIN public.ai_credit_action_attempts a ON a.id=d.attempt_id WHERE a.action_id=action_value AND a.execution_job_id=job_value AND a.state='settled' AND a.successful=0 AND d.route_id=candidate->>'routeId')
    AND configured_value->'enabledRouteIds' ? (candidate->>'routeId')
    AND public.languon_text_ai_route_dispatch_allowed(candidate->>'routeId',routing_value->>'flowId',candidate->>'fingerprint',clock_timestamp())
   ORDER BY position LIMIT 1;
  END IF;
  IF route_candidate IS NULL THEN RAISE EXCEPTION 'Route excluded before dispatch' USING ERRCODE='23514'; END IF;
  IF (route_candidate->'snapshot'->>'perCallMaxInputTokens')::bigint<(snapshot_value->>'perCallMaxInputTokens')::bigint OR (route_candidate->'snapshot'->>'perCallMaxOutputTokens')::bigint<(snapshot_value->>'perCallMaxOutputTokens')::bigint THEN RAISE EXCEPTION 'Fallback cannot reduce confirmed allowance' USING ERRCODE='23514'; END IF;
  snapshot_value:=snapshot_value || (route_candidate->'snapshot') || jsonb_build_object('aggregateBudget',snapshot_value->'aggregateBudget','routingAuthority',routing_value);
  IF execution_value ? 'snapshot' THEN execution_value:=execution_value || jsonb_build_object('snapshot',snapshot_value,'providerPrice',route_candidate->'providerPrice');
  ELSE execution_value:=snapshot_value || jsonb_build_object('actionProviderPrice',route_candidate->'providerPrice'); END IF;
  execution_value:=execution_value || jsonb_build_object('routingDispatchAttempt',dispatch_attempt);

 END IF;

 RETURN execution_value || CASE WHEN k IN ('conversation-turn','portrait-interview') THEN '{}'::jsonb ELSE jsonb_build_object('dispatchJobAttempt',(row_value->>'attempt_count')::integer) END;
END $$;
REVOKE ALL ON FUNCTION languon_text_dispatch_execution(uuid,uuid,text,text,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_admit_text_provider_attempt(action_value uuid, call_value uuid, purpose_value text, input_value integer, output_value integer, job_value uuid, token_value text, worker_value text, fence_value bigint, at_value timestamptz) RETURNS public.ai_credit_action_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; e jsonb; s jsonb; b jsonb; p public.ai_provider_price_revisions%ROWTYPE; price_value jsonb; result public.ai_credit_action_attempts%ROWTYPE; used_output bigint; used_input bigint; used_cost bigint; reserved_value bigint; available_cost bigint; affordable bigint; spent numeric; input_rate numeric; output_rate numeric; credit_input numeric; credit_output numeric; confirmed_output bigint; minimum_value bigint; call_available bigint; count_value integer; support_count integer; answer_count integer; owner_value uuid; kind_value text; dispatch_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); native_value jsonb; low_value integer; high_value integer; middle_value integer; native_facts jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT ca.owner_id,policy_row.job_kind INTO owner_value,kind_value FROM public.ai_credit_actions ca JOIN public.ai_action_charging_policies policy_row ON policy_row.job_id=ca.id WHERE ca.id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 IF a.state<>'active' OR a.deadline_at<=clock_timestamp() OR input_value IS NULL OR input_value<0 OR output_value IS NULL OR output_value<1 OR purpose_value NOT IN ('answer','observation','reflection') THEN RAISE EXCEPTION 'Action execution allowance is unavailable' USING ERRCODE='23514'; END IF;
 native_facts:=jsonb_build_object('dispatchedAt',to_char(dispatch_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'latestDispatchAt',to_char((date_trunc('milliseconds',a.deadline_at-interval '1 microsecond')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 e:=public.languon_text_dispatch_execution(action_value,job_value,token_value,worker_value,fence_value);
 IF kind_value='portrait-interview' AND purpose_value<>'answer' THEN RAISE EXCEPTION 'Interview only authorizes answer calls' USING ERRCODE='23514'; END IF;
 s:=coalesce(e->'snapshot',e); b:=coalesce(e->'budget',s->'aggregateBudget'); price_value:=coalesce(e->'providerPrice',e->'actionProviderPrice');
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(price_value->>'id')::uuid;
 IF p.id IS NULL OR p.provider_id IS DISTINCT FROM s->>'providerId' OR p.model_id IS DISTINCT FROM s->>'modelId' OR p.meter<>'text-tokens' OR p.version IS DISTINCT FROM (price_value->>'version')::integer OR p.effective_at>a.created_at OR (NOT p.data ? 'nativeRules' AND (p.data->>'inputUsdPerMillionTokens' IS NULL OR p.data->>'outputUsdPerMillionTokens' IS NULL)) THEN RAISE EXCEPTION 'Dispatch requires its reviewed immutable provider rate' USING ERRCODE='23514'; END IF;
 IF p.data ? 'nativeRules' THEN
  native_value:=public.languon_native_text_reservation(p.data,native_facts,1000000,0,5);
  IF native_value->>'status'<>'calculated' THEN RAISE EXCEPTION 'Native input allowance is unavailable' USING ERRCODE='23514'; END IF;
  input_rate:=(native_value->>'amountUsdMicros')::numeric;
  native_value:=public.languon_native_text_reservation(p.data,native_facts,0,1000000,5);
  IF native_value->>'status'<>'calculated' THEN RAISE EXCEPTION 'Native output allowance is unavailable' USING ERRCODE='23514'; END IF;
  output_rate:=(native_value->>'amountUsdMicros')::numeric;
  native_value:=public.languon_native_text_reservation(p.data,native_facts,0,0,5);
  IF native_value->>'status'<>'calculated' OR input_rate>2147483647 OR output_rate>2147483647 THEN RAISE EXCEPTION 'Native provider allowance exceeds execution meter' USING ERRCODE='23514'; END IF;
  minimum_value:=(native_value->>'amountUsdMicros')::bigint;
  b:=b||jsonb_build_object('nativeProviderPrice',price_value,'nativeExecutionFacts',native_facts,'nativeMaxCalls',5,'inputCostMicrosPerMillionTokens',input_rate::bigint,'outputCostMicrosPerMillionTokens',output_rate::bigint);
 ELSE
 minimum_value:=ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint;
 IF p.provider_id='evolink' AND minimum_value<=0 THEN RAISE EXCEPTION 'Reviewed provider minimum per request is required' USING ERRCODE='23514'; END IF;
 input_rate:=greatest((p.data->>'inputUsdPerMillionTokens')::numeric,coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0),coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0))*1000000;
 output_rate:=(p.data->>'outputUsdPerMillionTokens')::numeric*1000000;
 b:=b||jsonb_build_object('inputCostMicrosPerMillionTokens',input_rate::bigint,'outputCostMicrosPerMillionTokens',output_rate::bigint);
 END IF;
 IF NOT public.languon_text_dispatch_capacity_allows(owner_value,b) THEN RAISE EXCEPTION 'Provider operational capacity is unavailable' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(*) FILTER(WHERE purpose<>'answer'),count(*) FILTER(WHERE purpose='answer'),coalesce(sum(coalesce(output_tokens,CASE WHEN EXISTS(SELECT 1 FROM public.text_ai_route_health_events rejection WHERE rejection.attempt_id=ai_credit_action_attempts.id AND rejection.reason IN ('authorization_failed','provider_credits_exhausted','rate_limited','model_retired','model_unavailable')) THEN 0 ELSE output_limit END)),0),coalesce(sum(coalesce(input_tokens,input_limit)),0),coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),coalesce(sum(CASE WHEN purpose='answer' AND (state='dispatched' OR (successful=1 AND NOT EXISTS(SELECT 1 FROM public.ai_credit_structured_call_validations v WHERE v.attempt_id=ai_credit_action_attempts.id AND v.accepted=false) AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value)
   OR EXISTS(SELECT 1 FROM public.sentence_ai_jobs j WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
  ))) THEN
  (coalesce(input_tokens,input_limit)-CASE WHEN state='dispatched' THEN 0 ELSE coalesce(cache_read_tokens,0) END)*CASE WHEN state='dispatched' THEN greatest((a.tariff->>'inputCreditsPerMillionTokens')::numeric,coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)) ELSE (a.tariff->>'inputCreditsPerMillionTokens')::numeric END
  +CASE WHEN state='dispatched' THEN 0 ELSE coalesce(cache_read_tokens,0) END*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)
  +coalesce(output_tokens,output_limit)*(a.tariff->>'outputCreditsPerMillionTokens')::numeric ELSE 0 END),0)*1000
 INTO count_value,support_count,answer_count,used_output,used_input,used_cost,spent FROM public.ai_credit_action_attempts WHERE action_id=action_value;
 IF purpose_value='answer' AND EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND state='dispatched') THEN RAISE EXCEPTION 'Ambiguous running provider answer cannot be retried' USING ERRCODE='23514'; END IF;
 IF purpose_value='answer' AND kind_value='conversation-turn' AND (SELECT count(*) FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND state='settled' AND successful=0)>=2 THEN RAISE EXCEPTION 'Conversation automatic retry allowance is exhausted' USING ERRCODE='23514'; END IF;
 IF e ? 'dispatchJobAttempt' THEN
  IF (e->>'dispatchJobAttempt')::integer NOT BETWEEN 1 AND 2
    OR (SELECT count(*)+1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND execution_job_id=job_value)<>(e->>'dispatchJobAttempt')::integer
    OR ((e->>'dispatchJobAttempt')::integer>1 AND (SELECT count(*)-count(DISTINCT execution_job_id) FROM public.ai_credit_action_attempts WHERE action_id=action_value)>=1) THEN RAISE EXCEPTION 'Typed feature attempt or retry authorization exhausted' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=call_value) OR count_value>=5 OR (purpose_value<>'answer' AND (support_count>=4 OR (SELECT count(*) FROM public.ai_credit_action_attempts prior JOIN public.text_ai_route_dispatches receipt ON receipt.attempt_id=prior.id WHERE prior.action_id=action_value AND prior.purpose<>'answer' AND receipt.route_id=(s->>'providerId')||'/'||(s->>'modelId'))>=2)) OR (purpose_value='answer' AND kind_value='portrait-interview' AND answer_count>=2) THEN RAISE EXCEPTION 'Action call limit reached or dispatch replayed' USING ERRCODE='23514'; END IF;
 affordable:=least(output_value,a.output_limit-used_output,(b->>'maxOutputTokensPerAttempt')::bigint-used_output,coalesce((s->>'perCallMaxOutputTokens')::bigint,10000),coalesce((e->>'interviewOutputTokenLimit')::bigint,10000));
 confirmed_output:=affordable;
 IF input_value>least(coalesce((s->>'perCallMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'admittedMaxInputTokens')::bigint,(b->>'maxInputTokensPerAttempt')::bigint),coalesce((e->>'interviewInputTokenLimit')::bigint,(b->>'maxInputTokensPerAttempt')::bigint)) OR used_input+input_value>(b->>'maxInputTokensPerAttempt')::bigint THEN RAISE EXCEPTION 'Action input execution allowance exceeded' USING ERRCODE='23514'; END IF;
 IF a.funding='customer' AND purpose_value='answer' THEN
  credit_input:=greatest((a.tariff->>'inputCreditsPerMillionTokens')::numeric,coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric))*1000;
  credit_output:=(a.tariff->>'outputCreditsPerMillionTokens')::numeric*1000;
  IF a.held_milli::numeric*1000000-spent-input_value*credit_input<0 THEN affordable:=0; ELSIF credit_output>0 THEN affordable:=least(affordable,floor((a.held_milli::numeric*1000000-spent-input_value*credit_input)/credit_output)); END IF;
 END IF;
 SELECT reserved_micros-coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0) INTO available_cost FROM public.ai_operator_action_budgets WHERE action_id=action_value AND state='active' FOR UPDATE;
 call_available:=least(available_cost,(b->>'maxCostMicrosPerAttempt')::bigint-used_cost);
 IF call_available<minimum_value THEN RAISE EXCEPTION 'Provider request minimum exceeds operator allowance' USING ERRCODE='23514'; END IF;
 IF p.data ? 'nativeRules' THEN
  low_value:=0; high_value:=greatest(0,affordable)::integer;
  WHILE low_value<high_value LOOP
   middle_value:=low_value+(high_value-low_value+1)/2;
   native_value:=public.languon_native_text_reservation(p.data,native_facts,input_value,middle_value,5);
   IF native_value->>'status'='calculated' AND (native_value->>'amountUsdMicros')::numeric<=call_available THEN low_value:=middle_value; ELSE high_value:=middle_value-1; END IF;
  END LOOP;
  affordable:=low_value;
 ELSE
 available_cost:=call_available-ceil(input_value*input_rate/1000000)::bigint;
 IF available_cost IS NULL OR available_cost<0 THEN affordable:=0; ELSIF output_rate>0 THEN affordable:=least(affordable,floor(available_cost::numeric*1000000/output_rate)); END IF;
 END IF;
 IF coalesce((e->>'routingDispatchAttempt')::integer,(e->>'dispatchJobAttempt')::integer,1)=2 AND affordable<confirmed_output THEN RAISE EXCEPTION 'Fallback cannot reduce confirmed allowance' USING ERRCODE='23514'; END IF;
 IF affordable<1 THEN RAISE EXCEPTION 'Action affordable output allowance exhausted' USING ERRCODE='23514'; END IF;
 IF p.data ? 'nativeRules' THEN native_value:=public.languon_native_text_reservation(p.data,native_facts,input_value,affordable::integer,5); reserved_value:=(native_value->>'amountUsdMicros')::bigint; ELSE reserved_value:=greatest(minimum_value,ceil(input_value*input_rate/1000000)::bigint+ceil(affordable*output_rate/1000000)::bigint); END IF;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(action_value,call_value,reserved_value,dispatch_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,created_at,provider_dispatch_witness) VALUES(call_value,action_value,job_value,count_value+1,purpose_value,'dispatched',b,reserved_value,input_value,affordable,dispatch_value,jsonb_build_object('jobId',job_value,'token',token_value,'worker',worker_value,'fence',fence_value::text)) RETURNING * INTO result;
 INSERT INTO public.text_ai_route_dispatches(attempt_id,route_id,snapshot,provider_price,created_at)
 VALUES(call_value,(s->>'providerId')||'/'||(s->>'modelId'),s,price_value,dispatch_value);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION languon_admit_text_provider_attempt(uuid,uuid,text,integer,integer,uuid,text,text,bigint,timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_credit_action(action_value uuid, outcome_value text, at_value timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_actions%ROWTYPE; owner_value uuid; action_numerator numeric; charge_value bigint; remaining bigint; consumed bigint; lot record; measurement_value text; kind_value text; feature_value jsonb; expected_value text; settled_value timestamptz:=clock_timestamp(); series_value uuid; prior_numerator numeric; prior_charged bigint;
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_actions WHERE id=action_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Admitted action is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=action_value FOR UPDATE;
 IF a.state='settled' THEN IF a.outcome IS DISTINCT FROM outcome_value THEN RAISE EXCEPTION 'Action settlement replay differs' USING ERRCODE='23514'; END IF; RETURN; END IF;
 IF outcome_value IS NULL OR outcome_value NOT IN ('success','stopped','failure') OR EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=action_value AND state<>'settled') THEN RAISE EXCEPTION 'Action settlement requires settled observations' USING ERRCODE='23514'; END IF;
 SELECT job_kind INTO kind_value FROM public.ai_action_charging_policies WHERE job_id=action_value;
 feature_value:=public.languon_ai_credit_feature_authority(action_value,kind_value); expected_value:=public.languon_ai_credit_expected_outcome(feature_value);
 IF feature_value IS NULL OR (expected_value IS NOT NULL AND expected_value<>outcome_value) THEN RAISE EXCEPTION 'Action outcome conflicts with its typed feature' USING ERRCODE='23514'; END IF;
 -- Callers publish their validated terminal feature in this same transaction.
 -- Deferred mandatory feature authority rejects any missing/mismatched publication.
 IF kind_value='knowledge-transcription' THEN
  SELECT CASE WHEN outcome_value='success' AND j.state='completed' AND j.result IS NOT NULL AND EXISTS(SELECT 1 FROM public.ai_credit_action_attempts t WHERE t.action_id=j.id AND t.usage_meter='audio-duration' AND t.state='settled' AND t.successful=1) THEN j.source_duration_ms::numeric*(a.tariff->>'audioCreditsPerMinute')::numeric*1000*1000000/60000 ELSE 0 END INTO action_numerator FROM public.knowledge_transcription_jobs j WHERE j.id=action_value;
  IF action_numerator IS NULL THEN RAISE EXCEPTION 'Transcription settlement requires its typed duration job' USING ERRCODE='23514'; END IF;
 ELSE
 SELECT coalesce(sum((input_tokens-coalesce(cache_read_tokens,0))*(a.tariff->>'inputCreditsPerMillionTokens')::numeric+coalesce(cache_read_tokens,0)*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)+output_tokens*(a.tariff->>'outputCreditsPerMillionTokens')::numeric),0)*1000 INTO action_numerator FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND successful=1 AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND outcome_value<>'failure' AND NOT EXISTS(
   SELECT 1 FROM public.ai_credit_structured_call_validations v WHERE v.attempt_id=ai_credit_action_attempts.id AND v.accepted IS DISTINCT FROM true
 ) AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value) OR EXISTS(
     SELECT 1 FROM public.sentence_ai_jobs j JOIN public.sentence_preparation_children c ON c.job_id=j.id
       JOIN public.sentence_preparation_actions m ON m.preparation_id=c.preparation_id AND m.action_id=action_value
     WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.selected_execution_snapshot->>'actionParentId'=action_value::text
       AND ((j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
         OR (outcome_value='stopped' AND j.execution_state='cancelled' AND j.cancellation_requested_at IS NOT NULL AND j.failure_category='explicit_stop'))
   ));
 END IF;
 charge_value:=CASE WHEN a.funding='customer' THEN least(a.held_milli,ceil(action_numerator/1000000)::bigint) ELSE 0 END;
 -- Round across customer-funded stages, including explicit Stop; operator/free work
 -- and technical failures never enter the customer's exact accumulator.
 SELECT series_id INTO series_value FROM public.ai_credit_action_series WHERE action_id=action_value AND owner_id=owner_value;
 IF series_value IS NOT NULL AND a.funding='customer' AND outcome_value<>'failure' THEN
  SELECT s.numerator,s.charged_milli INTO prior_numerator,prior_charged FROM public.ai_credit_series_totals s WHERE s.series_id=series_value AND s.owner_id=owner_value FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement series is missing' USING ERRCODE='23514'; END IF;
  charge_value:=ceil((prior_numerator+action_numerator)/1000000)::bigint-prior_charged;
  IF charge_value<0 OR charge_value>a.held_milli THEN RAISE EXCEPTION 'Cumulative settlement exceeds its admitted hold' USING ERRCODE='23514'; END IF;
  UPDATE public.ai_credit_series_totals SET numerator=prior_numerator+action_numerator,charged_milli=prior_charged+charge_value WHERE series_id=series_value;
 END IF;
 remaining:=charge_value;
 FOR lot IN SELECT * FROM public.ai_credit_action_allocations WHERE action_id=action_value ORDER BY grant_id FOR UPDATE LOOP
  consumed:=least(remaining,lot.allocated_milli); UPDATE public.ai_credit_action_allocations SET settled_milli=consumed WHERE action_id=action_value AND grant_id=lot.grant_id; remaining:=remaining-consumed;
 END LOOP;
 IF remaining<>0 THEN RAISE EXCEPTION 'Action hold allocations are inconsistent' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_operator_attempt_costs SET consumed_micros=reserved_micros,measurement='conservative',settled_at=clock_timestamp() WHERE action_id=action_value AND settled_at IS NULL;
 UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0),settled_at=clock_timestamp() WHERE action_id=action_value AND state='active';
 SELECT CASE WHEN kind_value='knowledge-transcription' OR bool_and(input_tokens IS NOT NULL AND output_tokens IS NOT NULL) IS DISTINCT FROM false THEN 'measured' ELSE 'unknown' END INTO measurement_value FROM public.ai_credit_action_attempts WHERE action_id=action_value;
 UPDATE public.ai_credit_actions SET state='settled',outcome=outcome_value,charged_milli=charge_value,measurement=measurement_value,settled_at=settled_value WHERE id=action_value;
 INSERT INTO public.ai_credit_history(id,owner_id,amount,kind,measurement,created_at) VALUES(gen_random_uuid(),owner_value,-charge_value,'settlement',CASE WHEN charge_value>0 THEN CASE WHEN kind_value='knowledge-transcription' THEN 'estimated'::public.ai_credit_measurement ELSE 'provider_reported'::public.ai_credit_measurement END ELSE NULL END,settled_value);
 IF a.held_milli>charge_value THEN INSERT INTO public.ai_credit_history(id,owner_id,amount,kind,created_at) VALUES(gen_random_uuid(),owner_value,a.held_milli-charge_value,'release',settled_value); END IF;
END $$;
REVOKE ALL ON FUNCTION languon_settle_credit_action(uuid,text,timestamptz) FROM PUBLIC;

-- Speech is indivisible and uses only its API-pinned character count/rate.
-- Retire the previous unfenced overload even if a role script was not reapplied.
CREATE OR REPLACE FUNCTION languon_admit_speech_provider_attempt(job_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Speech dispatch requires the current live lease witness' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_admit_speech_provider_attempt(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_admit_speech_provider_attempt(job_value uuid, lease_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; maximum_value bigint; owner_value uuid; native_value jsonb; dispatch_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); profile_value jsonb;
BEGIN
 SELECT payer_id INTO owner_value FROM public.speech_jobs WHERE id=job_value;
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Prepared speech owner is missing' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.state<>'submitting' OR lease_value IS NULL OR j.lease_token IS DISTINCT FROM lease_value OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() OR j.task_id IS NOT NULL OR j.provider_dispatched_at IS NOT NULL OR j.queue_deadline<=clock_timestamp() OR j.billing_deadline<=clock_timestamp() OR j.payer_id IS DISTINCT FROM owner_value OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.payer_id AND status='active') THEN RAISE EXCEPTION 'Speech dispatch requires its prepared queued job' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF p.id IS NULL OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.meter NOT IN ('speech-characters','speech-tokens') OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId' OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId' OR p.effective_at>j.created_at THEN RAISE EXCEPTION 'Speech reviewed rate is missing' USING ERRCODE='23514'; END IF;
 IF p.data ? 'nativeRules' THEN
  IF NOT public.languon_native_meter_compatible(p.data,p.meter) THEN RAISE EXCEPTION 'Native speech price has incompatible component meters' USING ERRCODE='23514'; END IF;
  SELECT profile INTO profile_value FROM public.speech_recordings WHERE id=j.recording_id;
  IF j.provider_usage_bounds IS NULL OR j.provider_usage_bounds->>'requests'<>'1' OR (j.provider_usage_bounds->>'characters')::integer IS DISTINCT FROM j.provider_character_count OR (p.meter='speech-tokens' AND (profile_value->'nativeBilling'->>'providerTaskBoundVerified' IS DISTINCT FROM 'true' OR NOT (j.provider_usage_bounds @> (profile_value->'nativeBilling'->'usageBounds')))) THEN RAISE EXCEPTION 'Native speech task has no reviewed finite bounds' USING ERRCODE='23514'; END IF;
  native_value:=public.languon_evaluate_provider_price(p.data,jsonb_build_object('dispatchedAt',dispatch_value),j.provider_usage_bounds,'upper-bound');
  IF native_value->>'status'<>'calculated' THEN RAISE EXCEPTION 'Native speech allowance is unavailable' USING ERRCODE='23514'; END IF;
  maximum_value:=(native_value->>'amountUsdMicros')::bigint;
 ELSE
 maximum_value:=greatest(ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint,ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint);
 END IF;
 IF maximum_value IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE action_id=j.id AND owner_id=j.payer_id AND state='active' AND reserved_micros>=maximum_value) THEN RAISE EXCEPTION 'Speech operator authorization is missing' USING ERRCODE='23514'; END IF;
 IF j.reservation_id IS NOT NULL THEN
  UPDATE public.ai_credit_reservations SET dispatched_at=coalesce(dispatched_at,clock_timestamp())
    WHERE id=j.reservation_id AND job_id=j.id AND job_kind='speech-generation' AND owner_id=j.payer_id AND state='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Speech dispatch requires its existing customer authorization' USING ERRCODE='23514'; END IF;
 ELSIF j.billing_state='reserved' THEN RAISE EXCEPTION 'Paid speech has no customer authorization' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(action_id,attempt_id,reserved_micros,created_at) VALUES(j.id,j.id,maximum_value,clock_timestamp());
 UPDATE public.speech_jobs SET provider_dispatched_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION languon_admit_speech_provider_attempt(uuid,uuid) FROM PUBLIC;

-- Execution workers cannot alter current admission counters or choose the cutoff.
CREATE OR REPLACE FUNCTION languon_cleanup_speech_admission_counters(batch_value integer DEFAULT 1000) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE removed_value integer;
BEGIN
 IF batch_value IS NULL OR batch_value<1 OR batch_value>1000 THEN RAISE EXCEPTION 'Speech quota cleanup batch must be between 1 and 1000' USING ERRCODE='23514'; END IF;
 WITH expired AS (
  SELECT day,scope FROM public.speech_daily_admission_counters
   WHERE day<((clock_timestamp() AT TIME ZONE 'UTC')-interval '7 days')::date::text
   ORDER BY day,scope LIMIT batch_value FOR UPDATE SKIP LOCKED
 ) DELETE FROM public.speech_daily_admission_counters c USING expired e WHERE c.day=e.day AND c.scope=e.scope;
 GET DIAGNOSTICS removed_value=ROW_COUNT;
 RETURN removed_value;
END $$;
REVOKE ALL ON FUNCTION languon_cleanup_speech_admission_counters(integer) FROM PUBLIC;

-- Keep the independent insert guard aligned with bounded known-rejection operational output.
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
      OR NEW.reserved_cost_micros<>OLD.reserved_cost_micros OR NEW.created_at<>OLD.created_at OR NEW.provider_dispatch_witness IS DISTINCT FROM OLD.provider_dispatch_witness THEN
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
  SELECT count(*),coalesce(sum(coalesce(output_tokens,CASE WHEN EXISTS(SELECT 1 FROM public.text_ai_route_health_events rejection WHERE rejection.attempt_id=ai_credit_action_attempts.id AND rejection.reason IN ('authorization_failed','provider_credits_exhausted','rate_limited','model_retired','model_unavailable')) THEN 0 ELSE output_limit END)),0) INTO count_calls,output_used
    FROM public.ai_credit_action_attempts WHERE action_id=NEW.action_id;
  IF NEW.ordinal<>count_calls+1 OR count_calls>=5 OR output_used+NEW.output_limit>action_row.output_limit THEN
    RAISE EXCEPTION 'Provider dispatch exceeds admitted action limits';
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
-- Retire old unreleased execution authority after the canonical functions exist.
DROP FUNCTION IF EXISTS public.languon_propose_learning_blocks(uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS public.languon_propose_learning_block_change(uuid,uuid,jsonb,uuid);
DROP FUNCTION IF EXISTS public.languon_read_learning_block_proposal(uuid,uuid,uuid);

--> statement-breakpoint
-- Canonical proposal speech authority follows the renamed table and mixed body.
-- Private knowledge source checks expose booleans only; execution workers never read document bodies.
CREATE OR REPLACE FUNCTION languon_knowledge_speech_binding_available(binding_value uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    b public.speech_bindings%ROWTYPE;
    s jsonb;
    origin_value jsonb;
    note_value public.knowledge_notes%ROWTYPE;
    owner_value uuid;
    branch_value public.knowledge_working_branches%ROWTYPE;
    grant_value public.knowledge_workbook_shares%ROWTYPE;
    workbook_value public.knowledge_workbooks%ROWTYPE;
    proposal_value public.conversation_content_proposals%ROWTYPE;
    chat_value public.conversation_chats%ROWTYPE;
BEGIN
    SELECT * INTO b FROM public.speech_bindings WHERE id=binding_value;
    IF b.id IS NULL THEN
        RETURN false;
    END IF;
    s:=b.source;
    origin_value:=s->'origin';
    IF s->>'kind' NOT IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft') THEN
        RETURN false;
    END IF;
    SELECT owner_id INTO owner_value FROM public.knowledge_notes WHERE id=(s->>'noteId')::uuid;
    IF owner_value IS NULL THEN
        RETURN false;
    END IF;
    -- Source actors precede source aggregates, and both precede accounting/job locks.
    PERFORM 1 FROM public.users WHERE id IN (b.actor_id,owner_value) ORDER BY id FOR SHARE;
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=b.actor_id AND status='active')
        OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') THEN
        RETURN false;
    END IF;
    IF s->>'kind'='knowledge-snippet' AND origin_value->>'kind'='saved' AND origin_value->'access'->>'kind'='workbook' THEN
        SELECT * INTO grant_value FROM public.knowledge_workbook_shares WHERE locator=origin_value->'access'->>'locator' AND key_digest=origin_value->'access'->>'keyDigest';
        IF grant_value.workbook_id IS NULL THEN
            RETURN false;
        END IF;
        SELECT * INTO workbook_value FROM public.knowledge_workbooks WHERE id=grant_value.workbook_id AND owner_id=owner_value AND deleted_at IS NULL FOR SHARE;
        IF workbook_value.id IS NULL THEN
            RETURN false;
        END IF;
        PERFORM 1 FROM public.knowledge_workbook_shares WHERE workbook_id=workbook_value.id AND locator=origin_value->'access'->>'locator' AND key_digest=origin_value->'access'->>'keyDigest' FOR SHARE;
        IF NOT FOUND
            OR NOT EXISTS(SELECT 1 FROM public.knowledge_workbook_notes WHERE workbook_id=workbook_value.id AND note_id=(s->>'noteId')::uuid) THEN
            RETURN false;
        END IF;
    END IF;
    SELECT * INTO note_value FROM public.knowledge_notes WHERE id=(s->>'noteId')::uuid AND owner_id=owner_value FOR SHARE;
    IF note_value.id IS NULL THEN
        RETURN false;
    END IF;
    IF s->>'kind'='knowledge-snippet' AND origin_value->>'kind'='saved' THEN
        IF note_value.status<>'saved'
            OR note_value.version IS DISTINCT FROM (origin_value->>'expectedNoteVersion')::integer THEN
            RETURN false;
        END IF;
        IF origin_value->'access'->>'kind'='note' THEN
            PERFORM 1 FROM public.knowledge_shares WHERE note_id=note_value.id AND locator=origin_value->'access'->>'locator' AND key_digest=origin_value->'access'->>'keyDigest' FOR SHARE;
            IF NOT FOUND THEN
                RETURN false;
            END IF;
        ELSIF origin_value->'access'->>'kind'='workbook' THEN
            IF workbook_value.id IS NULL THEN
                RETURN false;
            END IF;
        ELSIF b.actor_id<>note_value.owner_id THEN
            RETURN false;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(note_value.body->'document'->'content','[]'::jsonb)) node WHERE node->'attrs'->'block'->>'id'=s->>'blockId') THEN
            RETURN false;
        END IF;
    ELSIF s->>'kind'='knowledge-snippet' AND origin_value->>'kind'='proposal' THEN
        IF b.actor_id<>note_value.owner_id THEN
            RETURN false;
        END IF;
        SELECT * INTO chat_value FROM public.conversation_chats WHERE id=(origin_value->>'conversationId')::uuid AND owner_id=b.actor_id AND source_kind='knowledge' AND source_id=note_value.id FOR SHARE;
        IF chat_value.id IS NULL
            OR chat_value.source->>'shareLocator' IS NOT NULL
            OR chat_value.source->>'view'='saved' THEN
            RETURN false;
        END IF;
        SELECT * INTO proposal_value FROM public.conversation_content_proposals WHERE id=(origin_value->>'proposalId')::uuid AND conversation_id=chat_value.id AND note_id=note_value.id FOR SHARE;
        IF proposal_value.id IS NULL
            OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(proposal_value.body->'document'->'content') node WHERE node->>'type'='learningBlock' AND node->'attrs'->'block'->>'id'=s->>'blockId') THEN
            RETURN false;
        END IF;
    ELSE
        IF b.actor_id<>note_value.owner_id THEN
            RETURN false;
        END IF;
        SELECT * INTO branch_value FROM public.knowledge_working_branches WHERE id=coalesce((s->>'branchId')::uuid,(origin_value->>'branchId')::uuid) AND note_id=note_value.id FOR SHARE;
        IF branch_value.id IS NULL THEN
            RETURN false;
        END IF;
        IF s->>'kind'<>'knowledge-audio-draft' THEN
            IF branch_value.version IS DISTINCT FROM coalesce((s->>'expectedBranchVersion')::integer,(origin_value->>'expectedBranchVersion')::integer) THEN
                RETURN false;
            END IF;
            IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(branch_value.content->'body'->'document'->'content','[]'::jsonb)) node WHERE node->'attrs'->'block'->>'id'=s->>'blockId') THEN
                RETURN false;
            END IF;
        END IF;
    END IF;
    -- The source locks keep discard/revocation behind this publication transaction.
    PERFORM 1 FROM public.speech_bindings WHERE id=b.id AND actor_id=b.actor_id AND source=b.source AND source_revision=b.source_revision FOR SHARE;
    RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION languon_knowledge_speech_binding_available(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_speech_knowledge_source_state(job_value uuid,lease_value uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    j public.speech_jobs%ROWTYPE;
    binding_value uuid;
BEGIN
    IF current_setting('languon.speech_worker_version',true) IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'Speech worker capability required' USING ERRCODE='42501';
    END IF;
    SELECT * INTO j FROM public.speech_jobs WHERE id=job_value;
    IF j.id IS NULL THEN
        RETURN 'unavailable';
    END IF;
    IF j.source_binding_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=j.recording_id) THEN
        RETURN 'legacy';
    END IF;
    IF lease_value IS NOT NULL AND (j.lease_token IS DISTINCT FROM lease_value OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) THEN
        RETURN 'unavailable';
    END IF;
    SELECT id INTO binding_value FROM public.speech_bindings WHERE id=j.source_binding_id AND job_id=j.id AND actor_id=j.payer_id;
    IF binding_value IS NULL
        OR NOT public.languon_knowledge_speech_binding_available(binding_value) THEN
        RETURN 'unavailable';
    END IF;
    RETURN 'available';
END $$;
REVOKE ALL ON FUNCTION languon_speech_knowledge_source_state(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_cleanup_knowledge_speech_quotes(batch_value integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    removed_value integer;
BEGIN
    IF current_setting('languon.speech_worker_version',true) IS DISTINCT FROM '1'
        OR batch_value NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Bounded speech worker cleanup required' USING ERRCODE='42501';
    END IF;
    DELETE FROM public.speech_quotes WHERE id IN (
        SELECT id FROM public.speech_quotes WHERE expires_at<=clock_timestamp() AND source->>'kind' IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft') ORDER BY expires_at,id LIMIT batch_value FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS removed_value=ROW_COUNT;
    RETURN removed_value;
END $$;
REVOKE ALL ON FUNCTION languon_cleanup_knowledge_speech_quotes(integer) FROM PUBLIC;

-- Branch erasure removes source excerpts without cancelling or rewriting financial/provider facts.
CREATE OR REPLACE FUNCTION languon_erase_branch_speech() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    recording_value uuid;
    retained_value uuid;
    erased_values uuid[];
BEGIN
    DELETE FROM public.speech_quotes q WHERE q.source->>'noteId'=OLD.note_id::text AND (
        q.source->>'branchId'=OLD.id::text OR q.source->'origin'->>'branchId'=OLD.id::text OR
        (q.source->'origin'->>'kind'='proposal' AND EXISTS(SELECT 1 FROM public.conversation_content_proposals p WHERE p.id::text=q.source->'origin'->>'proposalId' AND p.branch_id=OLD.id))
    );
    WITH erased AS (
        DELETE FROM public.speech_bindings b WHERE b.source->>'noteId'=OLD.note_id::text AND (
            b.source->>'branchId'=OLD.id::text OR b.source->'origin'->>'branchId'=OLD.id::text OR
            (b.source->'origin'->>'kind'='proposal' AND EXISTS(SELECT 1 FROM public.conversation_content_proposals p WHERE p.id::text=b.source->'origin'->>'proposalId' AND p.branch_id=OLD.id))
        ) RETURNING recording_id
    ) SELECT array_agg(DISTINCT recording_id) INTO erased_values FROM erased;
    FOREACH recording_value IN ARRAY coalesce(erased_values,'{}'::uuid[]) LOOP
        FOR retained_value IN SELECT id FROM public.speech_bindings WHERE recording_id=recording_value LOOP
            IF NOT public.languon_knowledge_speech_binding_available(retained_value) THEN
                DELETE FROM public.speech_bindings WHERE id=retained_value;
            END IF;
        END LOOP;
        IF NOT EXISTS(SELECT 1 FROM public.speech_bindings WHERE recording_id=recording_value) THEN
            UPDATE public.speech_recordings SET text='',state=CASE WHEN state='deleted' THEN state ELSE 'deleting' END,version=version+1 WHERE id=recording_value;
        END IF;
    END LOOP;
    RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION languon_erase_branch_speech() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_branch_speech_erasure ON public.knowledge_working_branches;
CREATE TRIGGER knowledge_branch_speech_erasure BEFORE DELETE ON public.knowledge_working_branches FOR EACH ROW EXECUTE FUNCTION languon_erase_branch_speech();

-- Proposal erasure also runs on the conversation FK cascade; no excerpt survives its source.
CREATE OR REPLACE FUNCTION languon_erase_proposal_speech() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    recording_value uuid;
    retained_value uuid;
    erased_values uuid[];
BEGIN
    DELETE FROM public.speech_quotes q WHERE q.source->>'kind'='knowledge-snippet' AND q.source->'origin'->>'kind'='proposal' AND q.source->'origin'->>'proposalId'=OLD.id::text;
    WITH erased AS (
        DELETE FROM public.speech_bindings b WHERE b.source->>'kind'='knowledge-snippet' AND b.source->'origin'->>'kind'='proposal' AND b.source->'origin'->>'proposalId'=OLD.id::text RETURNING recording_id
    ) SELECT array_agg(DISTINCT recording_id) INTO erased_values FROM erased;
    FOREACH recording_value IN ARRAY coalesce(erased_values,'{}'::uuid[]) LOOP
        FOR retained_value IN SELECT id FROM public.speech_bindings WHERE recording_id=recording_value LOOP
            IF NOT public.languon_knowledge_speech_binding_available(retained_value) THEN
                DELETE FROM public.speech_bindings WHERE id=retained_value;
            END IF;
        END LOOP;
        IF NOT EXISTS(SELECT 1 FROM public.speech_bindings WHERE recording_id=recording_value) THEN
            UPDATE public.speech_recordings SET text='',state=CASE WHEN state='deleted' THEN state ELSE 'deleting' END,version=version+1 WHERE id=recording_value;
        END IF;
    END LOOP;
    RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION languon_erase_proposal_speech() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_proposal_speech_erasure ON public.conversation_content_proposals;
CREATE TRIGGER knowledge_proposal_speech_erasure BEFORE DELETE ON public.conversation_content_proposals FOR EACH ROW EXECUTE FUNCTION languon_erase_proposal_speech();

CREATE INDEX IF NOT EXISTS speech_quotes_proposal_source_idx ON public.speech_quotes ((source->'origin'->>'proposalId')) WHERE source->>'kind'='knowledge-snippet' AND source->'origin'->>'kind'='proposal';
CREATE INDEX IF NOT EXISTS speech_bindings_proposal_source_idx ON public.speech_bindings ((source->'origin'->>'proposalId')) WHERE source->>'kind'='knowledge-snippet' AND source->'origin'->>'kind'='proposal';

CREATE INDEX IF NOT EXISTS speech_quotes_knowledge_source_idx ON public.speech_quotes ((source->>'noteId'),(coalesce(source->>'branchId',source->'origin'->>'branchId'))) WHERE source->>'kind' IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft');
CREATE INDEX IF NOT EXISTS speech_bindings_knowledge_source_idx ON public.speech_bindings ((source->>'noteId'),(coalesce(source->>'branchId',source->'origin'->>'branchId'))) WHERE source->>'kind' IN ('knowledge-block','knowledge-snippet','knowledge-audio-draft');

CREATE OR REPLACE FUNCTION languon_guard_knowledge_speech_payer_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
    IF NEW.source_binding_id IS NOT DISTINCT FROM OLD.source_binding_id THEN
        RETURN NEW;
    END IF;
    IF OLD.source_binding_id IS NOT NULL THEN
        RAISE EXCEPTION 'Original knowledge speech payer binding is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.source_binding_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF OLD.state<>'queued'
        OR OLD.provider_dispatched_at IS NOT NULL
        OR NOT EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=OLD.recording_id)
        OR NOT EXISTS(SELECT 1 FROM public.speech_bindings WHERE id=NEW.source_binding_id AND job_id=OLD.id AND actor_id=OLD.payer_id) THEN
        RAISE EXCEPTION 'Knowledge speech requires its original admitted payer binding' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_speech_payer_binding() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_speech_payer_binding_guard ON public.speech_jobs;
CREATE TRIGGER knowledge_speech_payer_binding_guard BEFORE UPDATE OF source_binding_id ON public.speech_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_speech_payer_binding();

CREATE OR REPLACE FUNCTION languon_guard_knowledge_speech_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
    job_value uuid;
    lease_value uuid;
BEGIN
    IF OLD.state='pending' AND NEW.state='ready' AND EXISTS(SELECT 1 FROM public.knowledge_speech_recordings WHERE recording_id=OLD.id) THEN
        SELECT id,lease_token INTO job_value,lease_value FROM public.speech_jobs WHERE recording_id=OLD.id AND state='storing' AND lease_expires_at>clock_timestamp();
        IF job_value IS NULL
            OR public.languon_speech_knowledge_source_state(job_value,lease_value)<>'available' THEN
            RAISE EXCEPTION 'Live knowledge source required for speech publication' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_knowledge_speech_publication() FROM PUBLIC;
DROP TRIGGER IF EXISTS knowledge_speech_publication_guard ON public.speech_recordings;
CREATE TRIGGER knowledge_speech_publication_guard BEFORE UPDATE ON public.speech_recordings FOR EACH ROW EXECUTE FUNCTION languon_guard_knowledge_speech_publication();
