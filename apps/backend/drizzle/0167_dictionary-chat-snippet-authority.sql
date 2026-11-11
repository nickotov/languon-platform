-- Immutable snippets are produced/read only by a live owner-bound worker turn.
CREATE FUNCTION public.languon_propose_dictionary_chat_snippet(turn_value uuid, lease_value uuid, input_value jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.conversation_turns%ROWTYPE; c public.conversation_chats%ROWTYPE;
 result_value uuid := gen_random_uuid(); context_value jsonb;
BEGIN
 SELECT * INTO t FROM public.conversation_turns WHERE id=turn_value FOR UPDATE;
 IF NOT FOUND OR t.status<>'running' OR t.cancel_requested OR t.lease_token IS DISTINCT FROM lease_value
  OR t.lease_token IS NULL OR t.lease_until IS NULL OR t.lease_until<=clock_timestamp() THEN
  RAISE EXCEPTION 'The response is no longer active' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.conversation_chats WHERE id=t.conversation_id AND owner_id=t.owner_id FOR SHARE;
 context_value := t.source_snapshot->'dictionaryGenerationContext';
 IF NOT FOUND OR c.source_kind<>'dictionary' OR t.authority->>'sourceOwnerId' IS DISTINCT FROM t.owner_id::text
  OR context_value IS NULL OR jsonb_typeof(context_value)<>'object'
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=t.owner_id AND status='active' FOR SHARE)
  OR NOT EXISTS(SELECT 1 FROM public.dictionaries WHERE id=c.source_id AND owner_id=t.owner_id AND lifecycle='active' FOR SHARE) THEN
  RAISE EXCEPTION 'The dictionary is unavailable' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(input_value) IS DISTINCT FROM 'object'
  OR char_length(input_value->>'title') NOT BETWEEN 1 AND 200
  OR jsonb_typeof(input_value->'cards') IS DISTINCT FROM 'array'
  OR jsonb_array_length(input_value->'cards') NOT BETWEEN 1 AND 100
  OR octet_length(input_value::text)>3000000 THEN
  RAISE EXCEPTION 'Invalid snippet' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(input_value->'cards') card WHERE
  jsonb_typeof(card) IS DISTINCT FROM 'object'
  OR jsonb_typeof(card->'source') IS DISTINCT FROM 'string'
  OR jsonb_typeof(card->'translation') IS DISTINCT FROM 'string'
  OR char_length(btrim(card->>'source')) NOT BETWEEN 1 AND 200
  OR char_length(btrim(card->>'translation')) NOT BETWEEN 1 AND 200
  OR (context_value->'settings'->>'definitionEnabled'='true' AND coalesce(char_length(btrim(card->>'definition')),0)=0)
  OR (context_value->'settings'->>'transcriptionEnabled'='true' AND coalesce(char_length(btrim(card->>'transcription')),0)=0)
  OR (context_value->'settings'->>'exampleEnabled'='true' AND coalesce(char_length(btrim(card->>'example')),0)=0)
  OR (context_value->'settings'->>'exampleEnabled'='true' AND context_value->'settings'->>'exampleTranslationEnabled'='true'
   AND coalesce(char_length(btrim(card->>'exampleTranslation')),0)=0)
 ) THEN RAISE EXCEPTION 'Incomplete dictionary snippet' USING ERRCODE='23514'; END IF;
 -- Exact callback retries reuse their immutable result; deliberate new outputs remain distinct.
 SELECT id INTO result_value FROM public.conversation_dictionary_snippets
  WHERE turn_id=t.id AND title=input_value->>'title' AND cards=input_value->'cards';
 IF FOUND THEN RETURN result_value; END IF;
 IF (SELECT count(*) FROM public.conversation_dictionary_snippets WHERE turn_id=t.id)>=8 THEN
  RAISE EXCEPTION 'The snippet limit was reached' USING ERRCODE='23514'; END IF;
 result_value := gen_random_uuid();
 INSERT INTO public.conversation_dictionary_snippets(id,conversation_id,turn_id,dictionary_id,title,cards,generation_context,created_at)
 VALUES(result_value,c.id,t.id,c.source_id,input_value->>'title',input_value->'cards',context_value,clock_timestamp());
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.languon_propose_dictionary_chat_snippet(uuid,uuid,jsonb) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.languon_read_dictionary_chat_snippet(turn_value uuid,lease_value uuid,snippet_value uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.conversation_turns%ROWTYPE; c public.conversation_chats%ROWTYPE; result_value jsonb;
BEGIN
 SELECT * INTO t FROM public.conversation_turns WHERE id=turn_value FOR UPDATE;
 IF NOT FOUND OR t.status<>'running' OR t.cancel_requested OR t.lease_token IS DISTINCT FROM lease_value
  OR t.lease_token IS NULL OR t.lease_until IS NULL OR t.lease_until<=clock_timestamp() THEN
  RAISE EXCEPTION 'The response is no longer active' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.conversation_chats WHERE id=t.conversation_id AND owner_id=t.owner_id FOR SHARE;
 IF NOT FOUND OR c.source_kind<>'dictionary' OR t.authority->>'sourceOwnerId' IS DISTINCT FROM t.owner_id::text
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=t.owner_id AND status='active' FOR SHARE)
  OR NOT EXISTS(SELECT 1 FROM public.dictionaries WHERE id=c.source_id AND owner_id=t.owner_id AND lifecycle='active' FOR SHARE) THEN
  RAISE EXCEPTION 'The dictionary is unavailable' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('id',p.id,'conversationId',p.conversation_id,'turnId',p.turn_id,'dictionaryId',p.dictionary_id,
  'title',p.title,'cards',p.cards,'generationContext',p.generation_context,'createdAt',to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 INTO result_value FROM public.conversation_dictionary_snippets p
 WHERE p.id=snippet_value AND p.conversation_id=c.id AND p.dictionary_id=c.source_id
 AND (p.turn_id=t.id OR EXISTS(SELECT 1 FROM public.conversation_turns origin WHERE origin.id=p.turn_id AND origin.status='succeeded'));
 IF result_value IS NULL THEN RAISE EXCEPTION 'The snippet is unavailable' USING ERRCODE='23514'; END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.languon_read_dictionary_chat_snippet(uuid,uuid,uuid) FROM PUBLIC;
