-- Canonical bounded output checks mirror the public Sentence contract at the
-- privileged writer boundary. These helpers grant no read/write authority.
CREATE OR REPLACE FUNCTION languon_sentence_json_shape(v jsonb, required_keys text[], optional_keys text[] DEFAULT ARRAY[]::text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='object' AND v ?& required_keys AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE NOT k=ANY(required_keys||optional_keys)),false)
$$;
CREATE OR REPLACE FUNCTION languon_sentence_safe_text(v jsonb, maximum_value integer, nonblank_value boolean DEFAULT true) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND char_length(v#>>'{}')<=maximum_value AND (NOT nonblank_value OR btrim(v#>>'{}',E' \t\n\r'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'') AND NOT EXISTS(SELECT 1 FROM regexp_split_to_table(v#>>'{}','') c WHERE c<>'' AND (ascii(c)<=8 OR ascii(c) IN (11,12) OR ascii(c) BETWEEN 14 AND 31 OR ascii(c) BETWEEN 127 AND 159)),false)
$$;
CREATE OR REPLACE FUNCTION languon_sentence_integer(v jsonb, maximum_value integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN jsonb_typeof(v)='number' THEN (v::text)::numeric BETWEEN 0 AND maximum_value AND trunc((v::text)::numeric)=(v::text)::numeric ELSE false END
$$;
CREATE OR REPLACE FUNCTION languon_sentence_token(v jsonb, prefix_value text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND char_length(v#>>'{}')<=40 AND (v#>>'{}') ~ ('^'||prefix_value||'-[0-9]+$'),false)
$$;
CREATE OR REPLACE FUNCTION languon_sentence_utf16_length(v text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(sum(CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END),0)::integer FROM regexp_split_to_table(v,'') c WHERE c<>''
$$;
CREATE OR REPLACE FUNCTION languon_sentence_utf16_slice(v text,start_value integer,end_value integer) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c text; at_value integer:=0; next_value integer; result_value text:='';
BEGIN
 IF start_value<0 OR end_value<=start_value THEN RETURN NULL; END IF;
 FOR c IN SELECT ch FROM regexp_split_to_table(v,'') ch WHERE ch<>'' LOOP
  next_value:=at_value+CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END;
  IF (start_value>at_value AND start_value<next_value) OR (end_value>at_value AND end_value<next_value) THEN RETURN NULL; END IF;
  IF at_value>=start_value AND next_value<=end_value THEN result_value:=result_value||c; END IF;
  at_value:=next_value;
 END LOOP;
 IF end_value>at_value THEN RETURN NULL; END IF;
 RETURN result_value;
END $$;

CREATE OR REPLACE FUNCTION languon_validate_knowledge_sentence_content(v jsonb, policy_value integer) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE segment_value jsonb; hint_value jsonb; target_value jsonb; joined_value text:=''; at_value integer:=0; end_value integer; required_value integer; contextual_value integer;
BEGIN
 IF NOT public.languon_sentence_json_shape(v,ARRAY['sourceText','referenceTranslation','segments','hints','targets']) OR NOT public.languon_sentence_safe_text(v->'sourceText',1000) OR NOT public.languon_sentence_safe_text(v->'referenceTranslation',4000) OR jsonb_typeof(v->'segments') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'segments') NOT BETWEEN 1 AND 256 OR jsonb_typeof(v->'hints') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'hints') NOT BETWEEN 1 AND 43 OR jsonb_typeof(v->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'targets') NOT BETWEEN 1 AND 3 THEN RETURN false; END IF;
 IF (SELECT count(DISTINCT h->>'id') FROM jsonb_array_elements(v->'hints') h)<>jsonb_array_length(v->'hints') THEN RETURN false; END IF;
 FOR hint_value IN SELECT value FROM jsonb_array_elements(v->'hints') LOOP
  IF NOT public.languon_sentence_json_shape(hint_value,ARRAY['id','text'],ARRAY['kind']) OR NOT public.languon_sentence_token(hint_value->'id','hint') OR NOT public.languon_sentence_safe_text(hint_value->'text',400) OR (hint_value ? 'kind' AND hint_value->>'kind' NOT IN ('dictionary','contextual')) OR (hint_value ? 'kind' AND jsonb_typeof(hint_value->'kind')<>'string') THEN RETURN false; END IF;
  IF policy_value=1 AND hint_value ? 'kind' THEN RETURN false; END IF;
 END LOOP;
 SELECT count(*) FILTER(WHERE h->>'kind'='dictionary'),count(*) FILTER(WHERE h->>'kind'='contextual') INTO required_value,contextual_value FROM jsonb_array_elements(v->'hints') h;
 IF (policy_value=1 AND jsonb_array_length(v->'hints')>3) OR (policy_value=2 AND (required_value NOT BETWEEN 1 AND 3 OR contextual_value NOT BETWEEN 1 AND 40 OR required_value+contextual_value<>jsonb_array_length(v->'hints'))) OR policy_value NOT IN (1,2) THEN RETURN false; END IF;
 FOR segment_value IN SELECT value FROM jsonb_array_elements(v->'segments') LOOP
  IF NOT public.languon_sentence_json_shape(segment_value,ARRAY['id','start','end','text','target'],ARRAY['contextualHintId']) OR NOT public.languon_sentence_token(segment_value->'id','segment') OR NOT public.languon_sentence_integer(segment_value->'start',8000) OR NOT public.languon_sentence_integer(segment_value->'end',8000) OR NOT public.languon_sentence_safe_text(segment_value->'text',1000,false) THEN RETURN false; END IF;
  end_value:=at_value+public.languon_sentence_utf16_length(segment_value->>'text');
  IF (segment_value->>'start')::integer<>at_value OR (segment_value->>'end')::integer<>end_value THEN RETURN false; END IF;
  at_value:=end_value; joined_value:=joined_value||(segment_value->>'text'); target_value:=segment_value->'target';
  IF target_value<>'null'::jsonb THEN
   IF NOT public.languon_sentence_json_shape(target_value,ARRAY['entryId','occurrenceId','hintId']) OR NOT public.languon_sentence_token(target_value->'occurrenceId','occurrence') OR NOT public.languon_sentence_token(target_value->'hintId','hint') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'targets') t WHERE t->'entryId'=target_value->'entryId') OR segment_value ? 'contextualHintId' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'hints') h WHERE h->'id'=target_value->'hintId' AND (policy_value=1 OR h->>'kind'='dictionary')) THEN RETURN false; END IF;
  ELSIF segment_value ? 'contextualHintId' THEN
   IF policy_value=1 OR NOT public.languon_sentence_token(segment_value->'contextualHintId','hint') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'hints') h WHERE h->'id'=segment_value->'contextualHintId' AND h->>'kind'='contextual') THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF joined_value IS DISTINCT FROM v->>'sourceText' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v->'targets') t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'segments') seg WHERE seg->'target'->'entryId'=t->'entryId')) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v->'hints') h WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'segments') s WHERE s->'target'->'hintId'=h->'id' OR s->'contextualHintId'=h->'id')) THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION languon_validate_knowledge_sentence_feedback(v jsonb, answer_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t jsonb; issue_value jsonb; span_value jsonb; percentage_value integer; expected_rating text;
BEGIN
 IF NOT public.languon_sentence_json_shape(v,ARRAY['percentage','rating','meaning','grammar','targets','issues','improvedTranslation','explanation']) OR NOT public.languon_sentence_integer(v->'percentage',100) OR v->>'meaning' NOT IN ('correct','partial','incorrect') OR v->>'grammar' NOT IN ('correct','minor-errors','substantive-errors') OR jsonb_typeof(v->'meaning') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'grammar') IS DISTINCT FROM 'string' OR NOT public.languon_sentence_safe_text(v->'improvedTranslation',4000) OR NOT public.languon_sentence_safe_text(v->'explanation',1000) OR jsonb_typeof(v->'targets') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'targets') NOT BETWEEN 1 AND 3 OR jsonb_typeof(v->'issues') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'issues')>50 THEN RETURN false; END IF;
 percentage_value:=(v->>'percentage')::integer;
 expected_rating:=CASE WHEN percentage_value=100 THEN 'perfect' WHEN percentage_value>=80 THEN 'good' WHEN percentage_value>=50 THEN 'not-bad' ELSE 'practise-again-later' END;
 IF v->>'rating' IS DISTINCT FROM expected_rating THEN RETURN false; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(v->'targets') LOOP
  IF NOT public.languon_sentence_json_shape(t,ARRAY['entryId','status','explanation']) OR jsonb_typeof(t->'entryId') IS DISTINCT FROM 'string' OR jsonb_typeof(t->'status') IS DISTINCT FROM 'string' OR t->>'status' NOT IN ('used','missing') OR NOT public.languon_sentence_safe_text(t->'explanation',1000) OR (t->>'status'='missing' AND percentage_value>79) THEN RETURN false; END IF;
 END LOOP;
 IF percentage_value=100 AND (v->>'meaning'<>'correct' OR v->>'grammar'<>'correct' OR jsonb_array_length(v->'issues')>0) THEN RETURN false; END IF;
 FOR issue_value IN SELECT value FROM jsonb_array_elements(v->'issues') LOOP
  IF NOT public.languon_sentence_json_shape(issue_value,ARRAY['id','kind','severity','span','explanation','correction']) OR NOT public.languon_sentence_token(issue_value->'id','issue') OR jsonb_typeof(issue_value->'kind') IS DISTINCT FROM 'string' OR issue_value->>'kind' NOT IN ('meaning','grammar','target') OR jsonb_typeof(issue_value->'severity') IS DISTINCT FROM 'string' OR issue_value->>'severity' NOT IN ('minor','substantive') OR NOT public.languon_sentence_safe_text(issue_value->'explanation',1000) OR (issue_value->'correction'<>'null'::jsonb AND NOT public.languon_sentence_safe_text(issue_value->'correction',4000,false)) THEN RETURN false; END IF;
  span_value:=issue_value->'span';
  IF span_value<>'null'::jsonb THEN
   IF NOT public.languon_sentence_json_shape(span_value,ARRAY['start','end','quote']) OR NOT public.languon_sentence_integer(span_value->'start',8000) OR NOT public.languon_sentence_integer(span_value->'end',8000) OR NOT public.languon_sentence_safe_text(span_value->'quote',4000) OR public.languon_sentence_utf16_slice(answer_value,(span_value->>'start')::integer,(span_value->>'end')::integer) IS DISTINCT FROM span_value->>'quote' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION languon_sentence_json_shape(jsonb,text[],text[]),languon_sentence_safe_text(jsonb,integer,boolean),languon_sentence_integer(jsonb,integer),languon_sentence_token(jsonb,text),languon_sentence_utf16_length(text),languon_sentence_utf16_slice(text,integer,integer),languon_validate_knowledge_sentence_content(jsonb,integer),languon_validate_knowledge_sentence_feedback(jsonb,text) FROM PUBLIC;
