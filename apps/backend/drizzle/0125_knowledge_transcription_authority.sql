-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/native-pricing-evaluator.sql
-- SHA256: b0eff7cf70c4a00b9b1bb8ccdb120419e83a28df407b5c0fe3d48a58051e40f9
-- Closed native price arithmetic shared by every authoritative provider-expense path.
-- Fractions are integer numeric pairs. div() is exact integer division; no floating money arithmetic.
CREATE OR REPLACE FUNCTION languon_native_decimal(value text) RETURNS numeric[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE digits integer;
BEGIN
 IF value IS NULL OR value !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,24})?$' THEN RAISE EXCEPTION 'Invalid native decimal'; END IF;
 digits:=CASE WHEN position('.' in value)>0 THEN length(split_part(value,'.',2)) ELSE 0 END;
 RETURN ARRAY[replace(value,'.','')::numeric,power(10::numeric,digits)];
END $$;
REVOKE ALL ON FUNCTION languon_native_decimal(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_round(value numeric[], rule jsonb) RETURNS numeric[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE q numeric[]; n numeric; d numeric; units numeric;
BEGIN
 IF rule IS NULL THEN RETURN value; END IF;
 IF jsonb_typeof(rule)<>'object' OR NOT rule ?& ARRAY['quantum','mode'] OR jsonb_typeof(rule->'quantum')<>'string' OR EXISTS(SELECT 1 FROM jsonb_object_keys(rule) k WHERE k NOT IN ('quantum','mode')) OR rule->>'mode' NOT IN ('ceil','half-up') THEN RAISE EXCEPTION 'Invalid native rounding'; END IF;
 q:=public.languon_native_decimal(rule->>'quantum');
 IF q[1]<=0 THEN RAISE EXCEPTION 'Invalid native quantum'; END IF;
 n:=value[1]*q[2]; d:=value[2]*q[1];
 units:=CASE WHEN rule->>'mode'='ceil' THEN div(n+d-1,d) ELSE div(2*n+d,2*d) END;
 RETURN ARRAY[units*q[1],q[2]];
END $$;
REVOKE ALL ON FUNCTION languon_native_round(numeric[],jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_object(value jsonb, allowed text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN jsonb_typeof(value)='object' THEN NOT EXISTS(SELECT 1 FROM jsonb_object_keys(value) k WHERE NOT k=ANY(allowed)) ELSE false END;
$$;
REVOKE ALL ON FUNCTION languon_native_object(jsonb,text[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_count(value jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE n numeric;
BEGIN
 IF value IS NULL OR jsonb_typeof(value)<>'number' THEN RAISE EXCEPTION 'Invalid native quantity'; END IF;
 n:=value::text::numeric;
 IF n<0 OR n>9007199254740991 OR n<>trunc(n) THEN RAISE EXCEPTION 'Invalid native quantity'; END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION languon_native_count(jsonb) FROM PUBLIC;

-- Compact JSON byte accounting matches JSON.stringify without stripping meaningful string spaces.
CREATE OR REPLACE FUNCTION languon_native_json_bytes(input_value jsonb) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 WITH RECURSIVE nodes(value) AS (
  SELECT input_value
  UNION ALL
  SELECT child.value FROM nodes n CROSS JOIN LATERAL (
   SELECT e.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}'::jsonb END) e
   UNION ALL
   SELECT e.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]'::jsonb END) e
  ) child
 )
 SELECT coalesce(sum(CASE jsonb_typeof(value)
  WHEN 'object' THEN 2+(SELECT coalesce(sum(octet_length(to_jsonb(k)::text)+1),0)+greatest(count(*)-1,0) FROM jsonb_object_keys(value) k)
  WHEN 'array' THEN 2+greatest(jsonb_array_length(value)-1,0)
  ELSE octet_length(value::text) END),0)::bigint FROM nodes;
$$;
REVOKE ALL ON FUNCTION languon_native_json_bytes(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_meter_compatible(price_data jsonb, meter_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; c jsonb; allowed text[]; meters text[];
BEGIN
 allowed:=CASE meter_value WHEN 'text-tokens' THEN ARRAY['inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','requests'] WHEN 'speech-characters' THEN ARRAY['characters','requests'] WHEN 'speech-tokens' THEN ARRAY['inputTokens','audioOutputTokens','requests'] WHEN 'audio-duration' THEN ARRAY['audioInputMilliseconds','requests'] ELSE NULL END;
 IF octet_length((price_data->'nativeRules')::text)>131072 THEN RETURN false; END IF;
 IF allowed IS NULL OR jsonb_typeof(price_data->'nativeRules'->'variants')<>'array' OR jsonb_array_length(price_data->'nativeRules'->'variants')<1 THEN RETURN false; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(price_data->'nativeRules'->'variants') LOOP
  meters:=ARRAY[]::text[];
  IF jsonb_typeof(v->'components')<>'array' OR jsonb_array_length(v->'components')<1 THEN RETURN false; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(v->'components') LOOP
   IF c->>'meter' IS NULL OR NOT (c->>'meter'=ANY(allowed)) THEN RETURN false; END IF;
   meters:=array_append(meters,c->>'meter');
  END LOOP;
  IF meters<@ARRAY['requests']::text[] THEN CONTINUE; END IF;
  IF (meter_value='text-tokens' AND (NOT ('outputTokens'=ANY(meters)) OR NOT (meters && ARRAY['inputTokens','uncachedInputTokens']::text[]))) OR (meter_value='speech-characters' AND NOT ('characters'=ANY(meters))) OR (meter_value='speech-tokens' AND NOT (ARRAY['inputTokens','audioOutputTokens']::text[]<@meters)) OR (meter_value='audio-duration' AND NOT ('audioInputMilliseconds'=ANY(meters))) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION languon_native_meter_compatible(jsonb,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_evaluate_provider_price(price_data jsonb, execution_facts jsonb, usage jsonb, evaluation_mode text DEFAULT 'actual') RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE rules jsonb:=price_data->'nativeRules'; v jsonb; a jsonb; c jsonb; w jsonb; k text; val jsonb; group_value jsonb;
 first_value timestamptz; last_value timestamptz; from_value timestamptz; until_value timestamptz; covered_value timestamptz;
 currency_value jsonb; selectors jsonb:='[]'; candidates jsonb:='[]'; ids jsonb:='[]'; meters text[]; variant_ids text[]:=ARRAY[]::text[];
 q numeric; n numeric; d numeric; part numeric[]; minimum_value numeric[]; total numeric[]; chosen numeric[]; usd numeric[]; credit numeric[]; fx_n numeric[]; fx_d numeric[];
 reported_value numeric[]; source_value text; applies_value boolean; windows_present boolean; amount_value numeric;
BEGIN
 -- Bound all work before traversing card predicates, including nonmatching cards.
 IF rules IS NULL OR octet_length(rules::text)>131072 OR public.languon_native_json_bytes(rules)>65536 THEN RAISE EXCEPTION 'Native rule byte budget exceeded'; END IF;
 IF jsonb_typeof(rules->'variants')<>'array' THEN RAISE EXCEPTION 'Invalid native variants'; END IF;
 IF (SELECT coalesce(sum(jsonb_array_length(card->'components')),0) FROM jsonb_array_elements(rules->'variants') card)>1024 OR (SELECT coalesce(sum(jsonb_array_length(card->'applies'->'dispatchWindows')),0) FROM jsonb_array_elements(rules->'variants') card)>2048 THEN RAISE EXCEPTION 'Native aggregate rule budget exceeded'; END IF;
 -- Validate the entire closed structure before choosing a branch, including unreachable cards.
 IF evaluation_mode IS NULL OR evaluation_mode NOT IN ('actual','upper-bound') OR NOT public.languon_native_object(rules,ARRAY['version','validFrom','validUntil','currency','reportedCreditUsdPerCredit','variants']) OR NOT rules ?& ARRAY['version','validFrom','validUntil','variants'] OR rules->'version'<>'1'::jsonb
   OR NOT public.languon_native_object(execution_facts,ARRAY['dispatchedAt','endpointId','serviceTier','latestDispatchAt'])
   OR NOT public.languon_native_object(usage,ARRAY['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','audioInputMilliseconds','characters','requests','providerCreditsConsumed','providerCostUsd']) THEN RAISE EXCEPTION 'Invalid native evidence'; END IF;
 IF NOT execution_facts ? 'dispatchedAt' OR jsonb_typeof(rules->'validFrom')<>'string' OR jsonb_typeof(execution_facts->'dispatchedAt')<>'string' OR rules->>'validFrom' !~ '^\d{4}-\d{2}-\d{2}T' OR execution_facts->>'dispatchedAt' !~ '^\d{4}-\d{2}-\d{2}T' OR (rules->>'validUntil' IS NOT NULL AND (jsonb_typeof(rules->'validUntil')<>'string' OR rules->>'validUntil' !~ '^\d{4}-\d{2}-\d{2}T')) OR rules->>'validFrom' ~ '\.\d{4}' OR rules->>'validUntil' ~ '\.\d{4}' OR execution_facts->>'dispatchedAt' ~ '\.\d{4}' OR execution_facts->>'latestDispatchAt' ~ '\.\d{4}' THEN RAISE EXCEPTION 'Invalid native validity'; END IF;
 first_value:=(execution_facts->>'dispatchedAt')::timestamptz;
 last_value:=coalesce((execution_facts->>'latestDispatchAt')::timestamptz,first_value);
 IF last_value<first_value OR (rules->>'validUntil' IS NOT NULL AND (rules->>'validUntil')::timestamptz<=(rules->>'validFrom')::timestamptz) THEN RAISE EXCEPTION 'Invalid native interval'; END IF;
 FOREACH k IN ARRAY ARRAY['endpointId','serviceTier'] LOOP
  IF execution_facts ? k AND (jsonb_typeof(execution_facts->k)<>'string' OR length(btrim(execution_facts->>k)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'Invalid native execution selector'; END IF;
 END LOOP;
 FOR k,val IN SELECT * FROM jsonb_each(usage) LOOP
  IF k IN ('providerCreditsConsumed','providerCostUsd') THEN IF jsonb_typeof(val)<>'string' THEN RAISE EXCEPTION 'Invalid native monetary observation'; END IF; part:=public.languon_native_decimal(usage->>k);
  ELSE q:=public.languon_native_count(val); END IF;
 END LOOP;
 IF NOT usage ? 'requests' OR (usage->>'requests')::numeric NOT IN (0,1) THEN RAISE EXCEPTION 'Invalid native request count'; END IF;
 currency_value:=rules->'currency';
 IF currency_value IS NOT NULL THEN
  IF NOT public.languon_native_object(currency_value,ARRAY['code','usdNumerator','unitDenominator']) OR NOT currency_value ?& ARRAY['code','usdNumerator','unitDenominator'] OR jsonb_typeof(currency_value->'code')<>'string' OR jsonb_typeof(currency_value->'usdNumerator')<>'string' OR jsonb_typeof(currency_value->'unitDenominator')<>'string' OR currency_value->>'code' !~ '^[A-Z][A-Z0-9_]{0,15}$' THEN RAISE EXCEPTION 'Invalid native currency'; END IF;
  fx_n:=public.languon_native_decimal(currency_value->>'usdNumerator'); fx_d:=public.languon_native_decimal(currency_value->>'unitDenominator');
  IF fx_n[1]<=0 OR fx_d[1]<=0 OR (currency_value->>'code'='USD' AND fx_n[1]*fx_d[2]<>fx_d[1]*fx_n[2]) THEN RAISE EXCEPTION 'Invalid native conversion'; END IF;
 ELSE fx_n:=ARRAY[1::numeric,1::numeric]; fx_d:=fx_n; END IF;
 IF rules ? 'reportedCreditUsdPerCredit' THEN IF jsonb_typeof(rules->'reportedCreditUsdPerCredit')<>'string' THEN RAISE EXCEPTION 'Invalid credit conversion'; END IF; credit:=public.languon_native_decimal(rules->>'reportedCreditUsdPerCredit'); IF credit[1]<=0 THEN RAISE EXCEPTION 'Invalid credit conversion'; END IF; END IF;
 IF jsonb_typeof(rules->'variants')<>'array' OR jsonb_array_length(rules->'variants') NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Invalid native variants'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(rules->'variants') LOOP
  IF NOT public.languon_native_object(v,ARRAY['id','applies','components','minimumPerRequest','totalRounding']) OR NOT v ?& ARRAY['id','applies','components'] OR jsonb_typeof(v->'id')<>'string' OR length(btrim(v->>'id')) NOT BETWEEN 1 AND 200 OR btrim(v->>'id')=ANY(variant_ids) THEN RAISE EXCEPTION 'Invalid native variant'; END IF;
  variant_ids:=array_append(variant_ids,btrim(v->>'id')); a:=v->'applies';
  IF NOT public.languon_native_object(a,ARRAY['endpointIds','serviceTiers','inputTokens','dispatchWindows']) THEN RAISE EXCEPTION 'Invalid native applicability'; END IF;
  FOREACH k IN ARRAY ARRAY['endpointIds','serviceTiers'] LOOP
   IF a ? k THEN
    IF jsonb_typeof(a->k)<>'array' OR jsonb_array_length(a->k)<1 OR jsonb_array_length(a->k)>(CASE WHEN k='endpointIds' THEN 128 ELSE 16 END) THEN RAISE EXCEPTION 'Invalid native selector'; END IF;
    FOR val IN SELECT value FROM jsonb_array_elements(a->k) LOOP IF jsonb_typeof(val)<>'string' OR length(btrim(val#>>'{}')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid native selector identity'; END IF; END LOOP;
   END IF;
  END LOOP;
  IF a ? 'inputTokens' THEN
   IF NOT public.languon_native_object(a->'inputTokens',ARRAY['minInclusive','maxExclusive']) OR NOT a->'inputTokens' ? 'minInclusive' THEN RAISE EXCEPTION 'Invalid native token range'; END IF;
   q:=public.languon_native_count(a->'inputTokens'->'minInclusive');
   IF a->'inputTokens' ? 'maxExclusive' AND public.languon_native_count(a->'inputTokens'->'maxExclusive')<=q THEN RAISE EXCEPTION 'Empty native token range'; END IF;
  END IF;
  IF a ? 'dispatchWindows' THEN
   IF jsonb_typeof(a->'dispatchWindows')<>'array' OR jsonb_array_length(a->'dispatchWindows') NOT BETWEEN 1 AND 2048 THEN RAISE EXCEPTION 'Invalid native windows'; END IF;
   FOR w IN SELECT value FROM jsonb_array_elements(a->'dispatchWindows') LOOP
    IF NOT public.languon_native_object(w,ARRAY['from','until']) OR NOT w ?& ARRAY['from','until'] OR jsonb_typeof(w->'from')<>'string' OR jsonb_typeof(w->'until')<>'string' OR w->>'from' !~ '^\d{4}-\d{2}-\d{2}T' OR w->>'until' !~ '^\d{4}-\d{2}-\d{2}T' OR w->>'from' ~ '\.\d{4}' OR w->>'until' ~ '\.\d{4}' OR (w->>'from')::timestamptz>=(w->>'until')::timestamptz THEN RAISE EXCEPTION 'Invalid native window'; END IF;
   END LOOP;
  END IF;
  IF jsonb_typeof(v->'components')<>'array' OR jsonb_array_length(v->'components') NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'Invalid native components'; END IF;
  meters:=ARRAY[]::text[];
  FOR c IN SELECT value FROM jsonb_array_elements(v->'components') LOOP
   IF NOT public.languon_native_object(c,ARRAY['meter','pricePerUnit','unitQuantity','minimum','chargeWhen','rounding']) OR NOT c ?& ARRAY['meter','pricePerUnit','unitQuantity','chargeWhen'] OR c->>'meter' NOT IN ('inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','audioInputMilliseconds','characters','requests') OR c->>'meter'=ANY(meters) OR c->>'chargeWhen' NOT IN ('positive-usage','request') THEN RAISE EXCEPTION 'Invalid native component'; END IF;
   IF jsonb_typeof(c->'pricePerUnit')<>'string' THEN RAISE EXCEPTION 'Invalid native rate'; END IF;
   meters:=array_append(meters,c->>'meter'); part:=public.languon_native_decimal(c->>'pricePerUnit'); q:=public.languon_native_count(c->'unitQuantity'); IF q<1 THEN RAISE EXCEPTION 'Invalid native price unit'; END IF;
   IF c ? 'minimum' THEN IF jsonb_typeof(c->'minimum')<>'string' THEN RAISE EXCEPTION 'Invalid native minimum'; END IF; part:=public.languon_native_decimal(c->>'minimum'); END IF;
   part:=public.languon_native_round(ARRAY[0::numeric,1::numeric],c->'rounding');
  END LOOP;
  IF v ? 'minimumPerRequest' THEN IF jsonb_typeof(v->'minimumPerRequest')<>'string' THEN RAISE EXCEPTION 'Invalid native minimum'; END IF; part:=public.languon_native_decimal(v->>'minimumPerRequest'); END IF;
  part:=public.languon_native_round(ARRAY[0::numeric,1::numeric],v->'totalRounding');
 END LOOP;
 IF evaluation_mode='actual' AND usage ? 'inputTokens' AND coalesce((usage->>'cacheReadTokens')::numeric,0)+coalesce((usage->>'cacheWriteTokens')::numeric,0)>(usage->>'inputTokens')::numeric THEN RAISE EXCEPTION 'Cache quantities exceed input'; END IF;
 IF evaluation_mode='actual' THEN
  IF usage ? 'providerCostUsd' THEN reported_value:=public.languon_native_decimal(usage->>'providerCostUsd'); source_value:='reported-usd'; END IF;
  IF usage ? 'providerCreditsConsumed' AND credit IS NOT NULL THEN
   part:=public.languon_native_decimal(usage->>'providerCreditsConsumed'); part:=ARRAY[part[1]*credit[1],part[2]*credit[2]];
   IF reported_value IS NOT NULL AND reported_value[1]*part[2]<>part[1]*reported_value[2] THEN RAISE EXCEPTION 'Monetary observations disagree'; END IF;
   IF reported_value IS NULL THEN reported_value:=part; source_value:='reported-credits'; END IF;
  END IF;
 END IF;
 IF (usage->>'requests')::numeric=0 THEN
  IF EXISTS(SELECT 1 FROM jsonb_each(usage) x WHERE key<>'requests' AND NOT(evaluation_mode='upper-bound' AND key IN ('providerCostUsd','providerCreditsConsumed')) AND (value#>>'{}')::numeric>0) THEN RAISE EXCEPTION 'Usage without a request'; END IF;
  RETURN jsonb_build_object('status','calculated','amountUsdMicros','0','usdNumerator','0','usdDenominator','1','variantIds','[]'::jsonb,'costSource','native-rules');
 END IF;
 IF evaluation_mode='actual' THEN last_value:=first_value; END IF;
 IF first_value<(rules->>'validFrom')::timestamptz OR (rules->>'validUntil' IS NOT NULL AND last_value>=(rules->>'validUntil')::timestamptz) THEN RAISE EXCEPTION 'Native pricing is not valid throughout dispatch'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(rules->'variants') LOOP
  a:=v->'applies'; applies_value:=true;
  IF execution_facts ? 'endpointId' AND a ? 'endpointIds' AND NOT a->'endpointIds' ? btrim(execution_facts->>'endpointId') THEN applies_value:=false; END IF;
  IF execution_facts ? 'serviceTier' AND a ? 'serviceTiers' AND NOT a->'serviceTiers' ? btrim(execution_facts->>'serviceTier') THEN applies_value:=false; END IF;
  IF a ? 'inputTokens' AND usage ? 'inputTokens' AND ((usage->>'inputTokens')::numeric<(a->'inputTokens'->>'minInclusive')::numeric OR (evaluation_mode='actual' AND a->'inputTokens' ? 'maxExclusive' AND (usage->>'inputTokens')::numeric>=(a->'inputTokens'->>'maxExclusive')::numeric)) THEN applies_value:=false; END IF;
  IF applies_value THEN selectors:=selectors||jsonb_build_array(v); END IF;
 END LOOP;
 IF evaluation_mode='upper-bound' AND first_value<last_value THEN
  FOR group_value IN SELECT DISTINCT (value->'applies')-'dispatchWindows' FROM jsonb_array_elements(selectors) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(selectors) s WHERE (s->'applies')-'dispatchWindows'=group_value AND NOT s->'applies' ? 'dispatchWindows') THEN CONTINUE; END IF;
   covered_value:=first_value;
   FOR from_value,until_value IN SELECT (win->>'from')::timestamptz,(win->>'until')::timestamptz FROM jsonb_array_elements(selectors) s CROSS JOIN LATERAL jsonb_array_elements(s->'applies'->'dispatchWindows') win WHERE (s->'applies')-'dispatchWindows'=group_value ORDER BY (win->>'from')::timestamptz LOOP
    IF until_value<=covered_value THEN CONTINUE; END IF;
    IF from_value>covered_value THEN RAISE EXCEPTION 'Unpriced native dispatch gap'; END IF;
    covered_value:=until_value; EXIT WHEN covered_value>last_value;
   END LOOP;
   IF covered_value<=last_value THEN RAISE EXCEPTION 'Unpriced native dispatch horizon'; END IF;
  END LOOP;
 END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(selectors) LOOP
  IF NOT v->'applies' ? 'dispatchWindows' OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'applies'->'dispatchWindows') win WHERE (win->>'from')::timestamptz<=last_value AND (win->>'until')::timestamptz>first_value) THEN candidates:=candidates||jsonb_build_array(v); ids:=ids||jsonb_build_array(btrim(v->>'id')); END IF;
 END LOOP;
 IF reported_value IS NOT NULL THEN amount_value:=div(reported_value[1]*1000000+reported_value[2]-1,reported_value[2]); IF amount_value>9223372036854775807 THEN RAISE EXCEPTION 'Native monetary amount exceeds supported storage'; END IF; RETURN jsonb_build_object('status','calculated','amountUsdMicros',amount_value::text,'usdNumerator',reported_value[1]::text,'usdDenominator',reported_value[2]::text,'variantIds',ids,'costSource',source_value); END IF;
 IF jsonb_array_length(candidates)=0 THEN RAISE EXCEPTION 'No applicable native price'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(candidates) LOOP
  total:=ARRAY[0::numeric,1::numeric];
  FOR c IN SELECT value FROM jsonb_array_elements(v->'components') LOOP
   k:=c->>'meter';
   IF k='uncachedInputTokens' THEN
    q:=(usage->>'inputTokens')::numeric;
    IF evaluation_mode='actual' THEN IF NOT usage ? 'cacheReadTokens' OR NOT usage ? 'cacheWriteTokens' THEN q:=NULL; ELSE q:=q-(usage->>'cacheReadTokens')::numeric-(usage->>'cacheWriteTokens')::numeric; END IF; END IF;
   ELSIF evaluation_mode='upper-bound' AND k IN ('cacheReadTokens','cacheWriteTokens') THEN q:=coalesce((usage->>k)::numeric,(usage->>'inputTokens')::numeric);
   ELSE q:=(usage->>k)::numeric; END IF;
   IF q IS NULL OR q<0 THEN RAISE EXCEPTION 'Required native quantity is unavailable'; END IF;
   IF c->>'chargeWhen'='positive-usage' AND q=0 THEN part:=ARRAY[0::numeric,1::numeric];
   ELSE part:=public.languon_native_decimal(c->>'pricePerUnit'); part:=ARRAY[part[1]*q,part[2]*(c->>'unitQuantity')::numeric]; minimum_value:=public.languon_native_decimal(coalesce(c->>'minimum','0')); IF part[1]*minimum_value[2]<minimum_value[1]*part[2] THEN part:=minimum_value; END IF; part:=public.languon_native_round(part,c->'rounding'); END IF;
   total:=ARRAY[total[1]*part[2]+part[1]*total[2],total[2]*part[2]];
  END LOOP;
  minimum_value:=public.languon_native_decimal(coalesce(v->>'minimumPerRequest','0')); IF total[1]*minimum_value[2]<minimum_value[1]*total[2] THEN total:=minimum_value; END IF;
  total:=public.languon_native_round(total,v->'totalRounding');
  IF chosen IS NOT NULL AND evaluation_mode='actual' AND total[1]*chosen[2]<>chosen[1]*total[2] THEN RAISE EXCEPTION 'Execution does not resolve different native prices'; END IF;
  IF chosen IS NULL OR total[1]*chosen[2]>chosen[1]*total[2] THEN chosen:=total; END IF;
 END LOOP;
 usd:=ARRAY[chosen[1]*fx_n[1]*fx_d[2],chosen[2]*fx_n[2]*fx_d[1]];
 amount_value:=div(usd[1]*1000000+usd[2]-1,usd[2]);
 IF amount_value>9223372036854775807 THEN RAISE EXCEPTION 'Native monetary amount exceeds supported storage'; END IF;
 RETURN jsonb_build_object('status','calculated','amountUsdMicros',amount_value::text,'usdNumerator',usd[1]::text,'usdDenominator',usd[2]::text,'variantIds',ids,'costSource','native-rules');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','unknown','reason','Native pricing or execution evidence is invalid, incomplete or ambiguous.');
END $$;
REVOKE ALL ON FUNCTION languon_evaluate_provider_price(jsonb,jsonb,jsonb,text) FROM PUBLIC;

-- Budget-only envelope: mixed cards and five SDK calls cannot hide repeated minima/rounding.
CREATE OR REPLACE FUNCTION languon_native_text_reservation(price_data jsonb, facts jsonb, input_bound integer, output_bound integer, maximum_calls integer DEFAULT 5) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE rules jsonb:=price_data->'nativeRules'; quantities jsonb; checked jsonb; v jsonb; c jsonb; old jsonb; k text; best jsonb:='{}'; fixed jsonb:='{}'; fixed_value numeric; variant_fixed numeric:=0; request_fixed numeric; request_rate jsonb; request_price numeric; request_unit numeric; components jsonb:='[]'; synthetic jsonb;
BEGIN
 IF price_data->>'meter' IS DISTINCT FROM 'text-tokens' OR NOT public.languon_native_meter_compatible(price_data,'text-tokens') THEN RAISE EXCEPTION 'Native text price has incompatible component meters'; END IF;
 IF maximum_calls IS NULL OR maximum_calls NOT BETWEEN 1 AND 5 OR input_bound<0 OR output_bound<0 THEN RAISE EXCEPTION 'Invalid native text allowance'; END IF;
 quantities:=jsonb_build_object('inputTokens',input_bound,'outputTokens',output_bound,'audioOutputTokens',0,'characters',0,'requests',1);
 checked:=public.languon_evaluate_provider_price(price_data,facts,quantities,'upper-bound');
 IF checked->>'status'<>'calculated' THEN RETURN checked; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(rules->'variants') LOOP
  variant_fixed:=greatest(variant_fixed,coalesce((v->>'minimumPerRequest')::numeric,0)+coalesce((v->'totalRounding'->>'quantum')::numeric,0));
  FOR c IN SELECT value FROM jsonb_array_elements(v->'components') LOOP
   k:=c->>'meter'; old:=best->k;
   IF old IS NULL OR (c->>'pricePerUnit')::numeric*(old->>'unitQuantity')::numeric>(old->>'pricePerUnit')::numeric*(c->>'unitQuantity')::numeric THEN best:=best||jsonb_build_object(k,c); END IF;
   fixed_value:=coalesce((c->>'minimum')::numeric,0)+coalesce((c->'rounding'->>'quantum')::numeric,0);
   IF fixed_value>coalesce((fixed->>k)::numeric,0) THEN fixed:=fixed||jsonb_build_object(k,fixed_value::text); END IF;
  END LOOP;
 END LOOP;
 FOR k,c IN SELECT * FROM jsonb_each(best) LOOP
  IF k='requests' THEN CONTINUE; END IF;
  components:=components||jsonb_build_array(jsonb_build_object('meter',k,'pricePerUnit',c->>'pricePerUnit','unitQuantity',c->'unitQuantity','chargeWhen','positive-usage'));
 END LOOP;
 SELECT (coalesce(sum((value#>>'{}')::numeric),0)+variant_fixed)*maximum_calls INTO request_fixed FROM jsonb_each(fixed);
 request_rate:=best->'requests'; request_unit:=coalesce((request_rate->>'unitQuantity')::numeric,1);
 request_price:=coalesce((request_rate->>'pricePerUnit')::numeric,0)*maximum_calls+request_fixed*request_unit;
 components:=components||jsonb_build_array(jsonb_build_object('meter','requests','pricePerUnit',request_price::text,'unitQuantity',request_unit,'chargeWhen','positive-usage'));
 synthetic:=rules||jsonb_build_object('variants',jsonb_build_array(jsonb_build_object('id','reservation-ceiling','applies','{}'::jsonb,'components',components)));
 RETURN public.languon_evaluate_provider_price(jsonb_build_object('nativeRules',synthetic),facts,quantities,'upper-bound');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','unknown','reason','Native text allowance cannot be bounded.');
END $$;
REVOKE ALL ON FUNCTION languon_native_text_reservation(jsonb,jsonb,integer,integer,integer) FROM PUBLIC;

--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql
-- SHA256: 34b61159e4d6a7ae8c347a293b7db7377ca3c32762c69eaa709ebcd58caa5111
-- Numerical provenance is resolved behind this seam; worker callers cannot select arbitrary rates.
CREATE OR REPLACE FUNCTION languon_text_provider_expense_identity(attempt_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; k text; execution_value jsonb; snapshot_value jsonb; price_value jsonb; p public.ai_provider_price_revisions%ROWTYPE; provider_value text; model_value text; amount_value bigint; numerator numeric; ref text; native_result jsonb;
BEGIN
  SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value;
  IF NOT FOUND OR a.state<>'settled' THEN RAISE EXCEPTION 'Expense requires its settled authoritative attempt' USING ERRCODE='23514'; END IF;
  SELECT job_kind INTO k FROM public.ai_action_charging_policies WHERE job_id=a.action_id;
  CASE k
    WHEN 'conversation-turn' THEN SELECT execution INTO execution_value FROM public.conversation_turns WHERE id=a.action_id; ref:='conversation:';
    WHEN 'portrait-interview' THEN SELECT execution INTO execution_value FROM public.learner_portrait_interview_operations WHERE id=a.action_id; ref:='interview:';
    WHEN 'dictionary-generation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.dictionary_generation_jobs WHERE id=a.action_id; ref:='legacy:';
    WHEN 'sentence-preparation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_preparation_actions WHERE action_id=a.action_id; ref:='legacy:';
    WHEN 'sentence-generation','sentence-check' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_ai_jobs WHERE id=a.action_id; IF execution_value IS NULL THEN SELECT selected_execution_snapshot INTO execution_value FROM public.sentence_preparation_actions WHERE action_id=a.action_id; END IF; ref:='legacy:';
    WHEN 'text-detection','text-translation' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.texts_ai_jobs WHERE id=a.action_id; ref:='legacy:';
    WHEN 'text-selection-card' THEN SELECT selected_execution_snapshot INTO execution_value FROM public.dictionary_text_selection_jobs WHERE id=a.action_id; ref:='legacy:';
    ELSE RAISE EXCEPTION 'Expense has no typed feature provenance' USING ERRCODE='23514';
  END CASE;
  snapshot_value:=coalesce(execution_value->'snapshot',execution_value);
  price_value:=coalesce(execution_value->'providerPrice',execution_value->'actionProviderPrice');
  IF EXISTS(SELECT 1 FROM public.text_ai_route_dispatches WHERE attempt_id=attempt_value) THEN
    SELECT snapshot,provider_price INTO snapshot_value,price_value FROM public.text_ai_route_dispatches WHERE attempt_id=attempt_value;
  END IF;
  provider_value:=snapshot_value->>'providerId'; model_value:=snapshot_value->>'modelId';
  SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(price_value->>'id')::uuid;
  IF execution_value->>'actionAccountingVersion' IS DISTINCT FROM '1' OR p.id IS NULL OR p.provider_id IS DISTINCT FROM provider_value OR p.model_id IS DISTINCT FROM model_value OR p.meter<>'text-tokens' OR p.version IS DISTINCT FROM (price_value->>'version')::integer OR p.effective_at>a.created_at THEN
    RAISE EXCEPTION 'Expense requires its immutable reviewed provider pin' USING ERRCODE='23514';
  END IF;
  IF p.data ? 'nativeRules' THEN
    native_result:=public.languon_native_parent_expense(p.data,a.id,a.provider_usage->'calls');
    IF native_result->>'status'='calculated' THEN amount_value:=(native_result->>'amountUsdMicros')::bigint; END IF;
  ELSIF a.input_tokens IS NOT NULL AND a.output_tokens IS NOT NULL THEN
    IF a.input_tokens<0 OR a.output_tokens<0 OR a.input_tokens>a.input_limit OR a.output_tokens>a.output_limit OR coalesce(a.cache_read_tokens,0)+coalesce(a.cache_write_tokens,0)>a.input_tokens THEN RAISE EXCEPTION 'Expense meters exceed admitted attempt' USING ERRCODE='23514'; END IF;
    IF p.data->>'inputUsdPerMillionTokens' IS NOT NULL AND p.data->>'outputUsdPerMillionTokens' IS NOT NULL
       AND (coalesce(a.cache_read_tokens,0)=0 OR p.data->>'cacheReadUsdPerMillionTokens' IS NOT NULL)
       AND (coalesce(a.cache_write_tokens,0)=0 OR p.data->>'cacheWriteUsdPerMillionTokens' IS NOT NULL) THEN
      numerator:=(a.input_tokens-coalesce(a.cache_read_tokens,0)-coalesce(a.cache_write_tokens,0))*(p.data->>'inputUsdPerMillionTokens')::numeric
        +a.output_tokens*(p.data->>'outputUsdPerMillionTokens')::numeric
        +coalesce(a.cache_read_tokens,0)*coalesce((p.data->>'cacheReadUsdPerMillionTokens')::numeric,0)
        +coalesce(a.cache_write_tokens,0)*coalesce((p.data->>'cacheWriteUsdPerMillionTokens')::numeric,0);
      amount_value:=greatest(ceil(numerator)::bigint,CASE WHEN a.input_tokens+a.output_tokens>0 THEN ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint ELSE 0 END); -- USD/token-million * micro-USD/USD cancels exactly.
    END IF;
  END IF;
  RETURN jsonb_build_object('attemptId',a.id,'actionId',a.action_id,'attemptReference',ref||a.id::text,'sourceKind','text-attempt','providerId',provider_value,'modelId',model_value,'measurement',CASE WHEN (p.data ? 'nativeRules' AND amount_value IS NOT NULL) OR (a.input_tokens IS NOT NULL AND a.output_tokens IS NOT NULL) THEN 'measured' ELSE 'unknown' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',a.created_at);
END $$;
REVOKE ALL ON FUNCTION languon_text_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_text_provider_expense(attempt_value uuid, assertion_value jsonb DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb; found_row public.ai_provider_expense_records%ROWTYPE; owner_value uuid;
BEGIN
  SELECT c.owner_id INTO owner_value FROM public.ai_credit_action_attempts t JOIN public.ai_credit_actions c ON c.id=t.action_id WHERE t.id=attempt_value;
  IF owner_value IS NULL THEN RAISE EXCEPTION 'Expense attempt is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
  e:=public.languon_text_provider_expense_identity(attempt_value);
  IF assertion_value IS NOT NULL AND (
    assertion_value->>'attemptId' IS DISTINCT FROM e->>'attemptId' OR assertion_value->>'actionId' IS DISTINCT FROM e->>'actionId'
    OR assertion_value->>'attemptReference' IS DISTINCT FROM e->>'attemptReference' OR assertion_value->>'providerId' IS DISTINCT FROM e->>'providerId'
    OR assertion_value->>'modelId' IS DISTINCT FROM e->>'modelId' OR assertion_value->>'measurement' IS DISTINCT FROM e->>'measurement'
    OR assertion_value->>'costSource' IS DISTINCT FROM e->>'costSource' OR assertion_value->>'amountUsdMicros' IS DISTINCT FROM e->>'amountUsdMicros'
    OR (assertion_value->>'occurredAt')::timestamptz IS DISTINCT FROM (e->>'occurredAt')::timestamptz) THEN
    RAISE EXCEPTION 'Provider expense assertion conflicts with authoritative fact' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_id,action_id,attempt_reference,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
    VALUES(gen_random_uuid(),'text-attempt',attempt_value,(e->>'actionId')::uuid,e->>'attemptReference',e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',(e->>'amountUsdMicros')::bigint,(e->>'occurredAt')::timestamptz) ON CONFLICT(attempt_reference) DO NOTHING;
  SELECT * INTO found_row FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
  IF found_row.source_kind<>'text-attempt' OR found_row.attempt_id IS DISTINCT FROM attempt_value OR found_row.action_id IS DISTINCT FROM (e->>'actionId')::uuid OR found_row.provider_id IS DISTINCT FROM e->>'providerId' OR found_row.model_id IS DISTINCT FROM e->>'modelId' OR found_row.measurement IS DISTINCT FROM e->>'measurement' OR found_row.cost_source IS DISTINCT FROM e->>'costSource' OR found_row.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR found_row.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN
    RAISE EXCEPTION 'Provider expense fact conflicts with immutable authority' USING ERRCODE='23514';
  END IF;
  PERFORM public.languon_mark_accounting_reports_dirty();
  RETURN found_row.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_text_provider_expense(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_text_provider_attempt(attempt_value uuid, successful_value boolean, input_value integer, output_value integer, read_value integer, write_value integer, at_value timestamptz, observations_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; owner_value uuid; e jsonb; cost_value bigint; o public.ai_operator_attempt_costs%ROWTYPE; settled_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); calls_value jsonb; usage_value jsonb; facts_value jsonb; native_value boolean; k text; v jsonb;
BEGIN
  SELECT c.owner_id INTO owner_value FROM public.ai_credit_action_attempts t JOIN public.ai_credit_actions c ON c.id=t.action_id WHERE t.id=attempt_value;
  IF owner_value IS NULL THEN RAISE EXCEPTION 'Provider attempt is unavailable' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
  SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value FOR UPDATE;
  native_value:=a.budget ? 'nativeProviderPrice';
  IF observations_value IS NOT NULL AND (NOT public.languon_native_object(observations_value,ARRAY['usage','execution','calls']) OR octet_length(observations_value::text)>131072) THEN RAISE EXCEPTION 'Invalid provider observations' USING ERRCODE='23514'; END IF;
  IF a.state='settled' THEN
    IF observations_value ? 'usage' AND observations_value->'usage' IS DISTINCT FROM (a.provider_usage-'calls') THEN RAISE EXCEPTION 'Provider usage replay differs' USING ERRCODE='23514'; END IF;
    IF observations_value ? 'execution' AND observations_value->'execution' IS DISTINCT FROM a.provider_execution_facts THEN RAISE EXCEPTION 'Provider execution replay differs' USING ERRCODE='23514'; END IF;
    IF observations_value ? 'calls' AND observations_value->'calls' IS DISTINCT FROM a.provider_usage->'calls' THEN RAISE EXCEPTION 'Provider observation replay differs' USING ERRCODE='23514'; END IF;
    IF (a.input_tokens,a.output_tokens,a.cache_read_tokens,a.cache_write_tokens,a.successful) IS DISTINCT FROM (input_value,output_value,read_value,write_value,CASE WHEN successful_value AND input_value IS NOT NULL AND output_value IS NOT NULL THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Provider attempt replay differs from immutable usage' USING ERRCODE='23514'; END IF;
    PERFORM public.languon_record_text_provider_expense(attempt_value,NULL); RETURN;
  END IF;
  IF (input_value IS NULL) IS DISTINCT FROM (output_value IS NULL) OR input_value<0 OR output_value<0 OR input_value>a.input_limit OR output_value>a.output_limit OR coalesce(read_value,0)<0 OR coalesce(write_value,0)<0 OR coalesce(read_value,0)+coalesce(write_value,0)>input_value THEN RAISE EXCEPTION 'Invalid provider usage meters' USING ERRCODE='23514'; END IF;
  IF native_value THEN
    calls_value:=public.languon_native_parent_calls(attempt_value);
    IF observations_value ? 'calls' AND observations_value->'calls' IS DISTINCT FROM calls_value THEN RAISE EXCEPTION 'Provider calls differ from DB checkpoint evidence' USING ERRCODE='23514'; END IF;
    -- The DB checkpoint is authoritative even when SDK token totals are unavailable.
    IF input_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(calls_value) c WHERE c->'usage'->>'inputTokens' IS NULL OR c->'usage'->>'outputTokens' IS NULL) AND
      ((SELECT coalesce(sum((c->'usage'->>'inputTokens')::bigint),0) FROM jsonb_array_elements(calls_value)c)<>input_value OR
       (SELECT coalesce(sum((c->'usage'->>'outputTokens')::bigint),0) FROM jsonb_array_elements(calls_value)c)<>output_value) THEN RAISE EXCEPTION 'Aggregate provider meters differ from DB checkpoints' USING ERRCODE='23514'; END IF;
    usage_value:=coalesce(observations_value->'usage','{}'::jsonb);
    facts_value:=observations_value->'execution';
    IF NOT public.languon_native_object(usage_value,ARRAY['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','characters','requests','providerCreditsConsumed','providerCostUsd']) OR (facts_value IS NOT NULL AND NOT public.languon_native_object(facts_value,ARRAY['endpointId','serviceTier'])) THEN RAISE EXCEPTION 'Invalid aggregate native observation fields' USING ERRCODE='23514'; END IF;
    FOR k,v IN SELECT * FROM jsonb_each(usage_value) LOOP
      IF k IN ('providerCreditsConsumed','providerCostUsd') THEN IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Invalid aggregate reported amount' USING ERRCODE='23514'; END IF; PERFORM public.languon_native_decimal(v#>>'{}');
      ELSE PERFORM public.languon_native_count(v); END IF;
    END LOOP;
    IF usage_value ? 'requests' AND (usage_value->>'requests')::numeric NOT IN (0,1) THEN RAISE EXCEPTION 'Invalid aggregate native requests' USING ERRCODE='23514'; END IF;
    FOR k,v IN SELECT * FROM jsonb_each(coalesce(facts_value,'{}'::jsonb)) LOOP IF jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid aggregate execution selector' USING ERRCODE='23514'; END IF; END LOOP;
    usage_value:=usage_value||jsonb_build_object('calls',calls_value);
  ELSE
    IF observations_value IS NOT NULL THEN RAISE EXCEPTION 'Legacy attempts do not accept native observations' USING ERRCODE='23514'; END IF;
  END IF;
  -- The trigger validates immutable identity; price accounting is derived after these trusted meters persist.
  UPDATE public.ai_credit_action_attempts SET state='settled',provider_usage=usage_value,provider_execution_facts=facts_value,input_tokens=input_value,output_tokens=output_value,cache_read_tokens=read_value,cache_write_tokens=write_value,successful=CASE WHEN successful_value AND input_value IS NOT NULL THEN 1 ELSE 0 END,actual_cost_micros=NULL,settled_at=settled_value WHERE id=attempt_value;
  e:=public.languon_text_provider_expense_identity(attempt_value); cost_value:=(e->>'amountUsdMicros')::bigint;
  UPDATE public.ai_credit_action_attempts SET actual_cost_micros=cost_value WHERE id=attempt_value AND actual_cost_micros IS DISTINCT FROM cost_value;
  SELECT * INTO o FROM public.ai_operator_attempt_costs WHERE attempt_id=attempt_value AND action_id=a.action_id FOR UPDATE;
  IF o.attempt_id IS NULL OR (cost_value IS NOT NULL AND cost_value>o.reserved_micros AND NOT native_value) THEN RAISE EXCEPTION 'Provider cost exceeds its authoritative reservation' USING ERRCODE='23514'; END IF;
  PERFORM public.languon_record_text_provider_expense(attempt_value,NULL);
  UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(cost_value,reserved_micros),measurement=CASE WHEN cost_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=settled_value WHERE attempt_id=attempt_value AND settled_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION languon_settle_text_provider_attempt(uuid,boolean,integer,integer,integer,integer,timestamptz,jsonb) FROM PUBLIC;

-- Preserve the historical seven-argument API for legacy callers and old pins.
CREATE OR REPLACE FUNCTION languon_settle_text_provider_attempt(attempt_value uuid, successful_value boolean, input_value integer, output_value integer, read_value integer, write_value integer, at_value timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.languon_settle_text_provider_attempt(attempt_value,successful_value,input_value,output_value,read_value,write_value,at_value,NULL::jsonb);
$$;
REVOKE ALL ON FUNCTION languon_settle_text_provider_attempt(uuid,boolean,integer,integer,integer,integer,timestamptz) FROM PUBLIC;

-- Append-only financial facts accept only exact closed numerical provenance.
CREATE OR REPLACE FUNCTION languon_guard_provider_expense_fact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.source_kind='text-attempt' AND NEW.attempt_id IS NOT NULL THEN e:=public.languon_text_provider_expense_identity(NEW.attempt_id);
    ELSIF NEW.source_kind='transcription-attempt' AND NEW.attempt_id IS NOT NULL THEN e:=public.languon_transcription_provider_expense_identity(NEW.attempt_id);
    ELSIF NEW.source_kind='speech-attempt' AND NEW.attempt_id IS NULL THEN e:=public.languon_speech_provider_expense_identity(NEW.action_id);
    ELSIF NEW.source_kind='admin-probe' AND NEW.attempt_id IS NULL THEN e:=public.languon_probe_provider_expense_identity(NEW.action_id);
    ELSE RAISE EXCEPTION 'Unbound provider expense facts are forbidden' USING ERRCODE='23514'; END IF;
    IF NEW.action_id IS DISTINCT FROM (e->>'actionId')::uuid OR NEW.attempt_reference IS DISTINCT FROM e->>'attemptReference' OR NEW.provider_id IS DISTINCT FROM e->>'providerId' OR NEW.model_id IS DISTINCT FROM e->>'modelId' OR NEW.measurement IS DISTINCT FROM e->>'measurement' OR NEW.cost_source IS DISTINCT FROM e->>'costSource' OR NEW.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR NEW.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN RAISE EXCEPTION 'Provider expense does not match authoritative provenance' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS NULL AND (to_jsonb(NEW)-'attempt_id')=(to_jsonb(OLD)-'attempt_id') AND NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id) AND public.languon_operator_purge_authorized(nullif(current_setting('languon.ai_credit_purge_owner',true),'')::uuid) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Provider expense facts are immutable' USING ERRCODE='23514';
END $$;

--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/operator-native-overrun-guards.sql
-- SHA256: 0f4843a4630c149d7c019cc27f6443bdcec160934ba8395ad1517b8accc5156a
-- Known native-provider overruns are incurred facts, never new spending permission.
CREATE OR REPLACE FUNCTION languon_native_overrun_authorized(attempt_value uuid, amount_value bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.ai_provider_expense_records f
  JOIN public.text_ai_route_dispatches d ON d.attempt_id=f.attempt_id
  JOIN public.ai_provider_price_revisions p ON p.id=(d.provider_price->>'id')::uuid
  WHERE f.attempt_id=attempt_value AND f.source_kind='text-attempt' AND f.cost_source='calculated' AND f.amount_usd_micros=amount_value AND p.data ? 'nativeRules'
 ) OR EXISTS(
  SELECT 1 FROM public.ai_provider_expense_records f JOIN public.speech_jobs j ON j.id=f.action_id
  JOIN public.ai_provider_price_revisions p ON p.id=(j.provider_price_snapshot->>'id')::uuid
  WHERE f.action_id=attempt_value AND f.source_kind='speech-attempt' AND f.cost_source='calculated' AND f.amount_usd_micros=amount_value AND p.data ? 'nativeRules'
 ) OR EXISTS(
  SELECT 1 FROM public.ai_provider_expense_records f JOIN public.knowledge_transcription_jobs j ON j.id=f.action_id
  JOIN public.ai_provider_price_revisions p ON p.id=(j.provider_price_snapshot->>'id')::uuid
  WHERE f.attempt_id=attempt_value AND f.source_kind='transcription-attempt' AND f.cost_source='calculated' AND f.amount_usd_micros=amount_value AND p.data ? 'nativeRules'
 );
$$;
REVOKE ALL ON FUNCTION languon_native_overrun_authorized(uuid,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_operator_action_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE budget_row record;
DECLARE action_usage bigint;
DECLARE settings_row public.ai_accounting_settings_revisions%ROWTYPE;
DECLARE excess_value bigint;
BEGIN
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL
    AND languon_operator_purge_authorized(OLD.owner_id)
    AND (to_jsonb(NEW)-'owner_id')=(to_jsonb(OLD)-'owner_id') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.owner_id,OLD.owner_id)::text,1920424381));
  PERFORM pg_advisory_xact_lock(1920424395);
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operator action accounting must be retained'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO settings_row FROM public.ai_accounting_settings_revisions ORDER BY version DESC LIMIT 1;
    IF settings_row.id IS NULL OR settings_row.max_provider_cost_usd_per_action IS NULL
      OR settings_row.max_provider_cost_usd_per_account_day IS NULL OR settings_row.max_provider_cost_usd_per_day IS NULL
      OR NEW.reserved_micros>(settings_row.max_provider_cost_usd_per_action::numeric*1000000)::bigint
      OR NEW.owner_day_limit_micros IS DISTINCT FROM (settings_row.max_provider_cost_usd_per_account_day::numeric*1000000)::bigint
      OR NEW.global_day_limit_micros IS DISTINCT FROM (settings_row.max_provider_cost_usd_per_day::numeric*1000000)::bigint THEN
      RAISE EXCEPTION 'Operator authorization must use the current reviewed application limits' USING ERRCODE='23514';
    END IF;
    IF NEW.owner_id IS NULL OR NEW.day<>to_char(NEW.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') OR NEW.state<>'active'
      OR NEW.reserved_micros>NEW.owner_day_limit_micros OR NEW.reserved_micros>NEW.global_day_limit_micros THEN
      RAISE EXCEPTION 'Operator action authorization is invalid';
    END IF;
    INSERT INTO public.ai_operator_daily_budgets(day,scope) VALUES(NEW.day,'global'),(NEW.day,'owner:'||NEW.owner_id::text) ON CONFLICT DO NOTHING;
    SELECT * INTO budget_row FROM public.ai_operator_daily_budgets WHERE day=NEW.day AND scope='global' FOR UPDATE;
    SELECT coalesce(sum(greatest(t.consumed_micros-t.reserved_micros,0)),0) INTO excess_value FROM public.ai_operator_attempt_costs t JOIN public.ai_operator_action_budgets b ON b.action_id=t.action_id WHERE b.day=NEW.day AND b.state='active';
    IF budget_row.reserved_micros+budget_row.consumed_micros+excess_value+NEW.reserved_micros>NEW.global_day_limit_micros THEN
      RAISE EXCEPTION 'Global operator daily allowance is exhausted';
    END IF;
    SELECT * INTO budget_row FROM public.ai_operator_daily_budgets WHERE day=NEW.day AND scope='owner:'||NEW.owner_id::text FOR UPDATE;
    SELECT coalesce(sum(greatest(t.consumed_micros-t.reserved_micros,0)),0) INTO excess_value FROM public.ai_operator_attempt_costs t JOIN public.ai_operator_action_budgets b ON b.action_id=t.action_id WHERE b.day=NEW.day AND b.owner_id=NEW.owner_id AND b.state='active';
    IF budget_row.reserved_micros+budget_row.consumed_micros+excess_value+NEW.reserved_micros>NEW.owner_day_limit_micros THEN
      RAISE EXCEPTION 'Account operator daily allowance is exhausted';
    END IF;
    UPDATE public.ai_operator_daily_budgets SET reserved_micros=reserved_micros+NEW.reserved_micros
      WHERE day=NEW.day AND scope IN ('global','owner:'||NEW.owner_id::text);
    RETURN NEW;
  END IF;
  IF OLD.state<>'active' OR NEW.state<>'settled' OR NEW.action_id<>OLD.action_id OR NEW.owner_id<>OLD.owner_id
    OR NEW.day<>OLD.day OR NEW.reserved_micros<>OLD.reserved_micros OR NEW.created_at<>OLD.created_at
    OR NEW.owner_day_limit_micros<>OLD.owner_day_limit_micros OR NEW.global_day_limit_micros<>OLD.global_day_limit_micros THEN
    RAISE EXCEPTION 'Operator action authorization and terminal outcome are immutable';
  END IF;
  SELECT coalesce(sum(coalesce(consumed_micros,reserved_micros)),0) INTO action_usage
    FROM public.ai_operator_attempt_costs WHERE action_id=NEW.action_id;
  IF action_usage<>NEW.consumed_micros OR (action_usage>NEW.reserved_micros AND EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs t WHERE t.action_id=NEW.action_id AND t.consumed_micros>t.reserved_micros AND NOT public.languon_native_overrun_authorized(t.attempt_id,t.consumed_micros))) THEN RAISE EXCEPTION 'Operator action settlement is inconsistent'; END IF;
  UPDATE public.ai_operator_daily_budgets SET reserved_micros=reserved_micros-NEW.reserved_micros,consumed_micros=consumed_micros+NEW.consumed_micros
    WHERE day=NEW.day AND scope IN ('global','owner:'||NEW.owner_id::text) AND reserved_micros>=NEW.reserved_micros;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operator daily projection is inconsistent'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION languon_operator_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_operator_action_budgets%ROWTYPE;
DECLARE used bigint;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operator attempt accounting must be retained'; END IF;
  SELECT * INTO action_row FROM public.ai_operator_action_budgets WHERE action_id=NEW.action_id FOR UPDATE;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider attempt has no active operator authorization'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT coalesce(sum(coalesce(consumed_micros,reserved_micros)),0) INTO used FROM public.ai_operator_attempt_costs WHERE action_id=NEW.action_id;
    IF NEW.settled_at IS NOT NULL OR NEW.consumed_micros IS NOT NULL OR used+NEW.reserved_micros>action_row.reserved_micros THEN
      RAISE EXCEPTION 'Provider attempt exceeds operator action authorization';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.settled_at IS NOT NULL OR NEW.settled_at IS NULL OR NEW.attempt_id<>OLD.attempt_id OR NEW.action_id<>OLD.action_id
    OR NEW.reserved_micros<>OLD.reserved_micros OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'Operator provider attempt accounting is immutable';
  END IF;
  IF NEW.consumed_micros>NEW.reserved_micros AND (NEW.measurement<>'measured' OR NOT public.languon_native_overrun_authorized(NEW.attempt_id,NEW.consumed_micros)) THEN RAISE EXCEPTION 'Overrun requires its immutable native expense fact' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql
-- SHA256: 8c138406e0580ee5124d688ed7d722a66052976838ef77e8c38208cacbfd7ebf
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
 SELECT count(*),count(*) FILTER(WHERE purpose<>'answer'),count(*) FILTER(WHERE purpose='answer'),coalesce(sum(coalesce(output_tokens,CASE WHEN EXISTS(SELECT 1 FROM public.text_ai_route_health_events rejection WHERE rejection.attempt_id=ai_credit_action_attempts.id AND rejection.reason IN ('authorization_failed','provider_credits_exhausted','rate_limited','model_retired','model_unavailable')) THEN 0 ELSE output_limit END)),0),coalesce(sum(coalesce(input_tokens,input_limit)),0),coalesce(sum(coalesce(actual_cost_micros,reserved_cost_micros)),0),coalesce(sum(CASE WHEN purpose='answer' AND (state='dispatched' OR (successful=1 AND (
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
DECLARE a public.ai_credit_actions%ROWTYPE; owner_value uuid; numerator numeric; charge_value bigint; remaining bigint; consumed bigint; lot record; measurement_value text; kind_value text; feature_value jsonb; expected_value text; settled_value timestamptz:=clock_timestamp();
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
  SELECT CASE WHEN outcome_value='success' AND j.state='completed' AND j.result IS NOT NULL AND EXISTS(SELECT 1 FROM public.ai_credit_action_attempts t WHERE t.action_id=j.id AND t.usage_meter='audio-duration' AND t.state='settled' AND t.successful=1) THEN j.source_duration_ms::numeric*(a.tariff->>'audioCreditsPerMinute')::numeric*1000*1000000/60000 ELSE 0 END INTO numerator FROM public.knowledge_transcription_jobs j WHERE j.id=action_value;
  IF numerator IS NULL THEN RAISE EXCEPTION 'Transcription settlement requires its typed duration job' USING ERRCODE='23514'; END IF;
 ELSE
 SELECT coalesce(sum((input_tokens-coalesce(cache_read_tokens,0))*(a.tariff->>'inputCreditsPerMillionTokens')::numeric+coalesce(cache_read_tokens,0)*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)+output_tokens*(a.tariff->>'outputCreditsPerMillionTokens')::numeric),0)*1000 INTO numerator FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND successful=1 AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND outcome_value<>'failure' AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value) OR EXISTS(
     SELECT 1 FROM public.sentence_ai_jobs j JOIN public.sentence_preparation_children c ON c.job_id=j.id
       JOIN public.sentence_preparation_actions m ON m.preparation_id=c.preparation_id AND m.action_id=action_value
     WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.selected_execution_snapshot->>'actionParentId'=action_value::text
       AND ((j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
         OR (outcome_value='stopped' AND j.execution_state='cancelled' AND j.cancellation_requested_at IS NOT NULL AND j.failure_category='explicit_stop'))
   ));
 END IF;
 charge_value:=CASE WHEN a.funding='customer' THEN least(a.held_milli,ceil(numerator/1000000)::bigint) ELSE 0 END;
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
-- Source: apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/transcription-accounting.sql
-- SHA256: 664865a54669293f03d5b0e9e8b071dd887515d721325157dd8c1edacf7b8234
-- Canonical typed duration authority. Existing text/speech paths keep their prior semantics.
CREATE OR REPLACE FUNCTION languon_guard_action_charging_policy() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_capability text; published ai_capability_policy_revisions%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF public.languon_operator_purge_authorized(OLD.owner_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Admitted charging policies cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'Admitted charging policies are immutable' USING ERRCODE='23514';
  END IF;
  expected_capability := CASE NEW.job_kind
    WHEN 'portrait-interview' THEN 'portrait-interview'
    WHEN 'conversation-turn' THEN 'conversation'
    WHEN 'knowledge-transcription' THEN 'speech'
    WHEN 'speech-generation' THEN 'speech'
    WHEN 'dictionary-generation' THEN 'dictionary-generation'
    WHEN 'sentence-generation' THEN 'sentence-generation'
    WHEN 'sentence-check' THEN 'sentence-generation'
    WHEN 'text-detection' THEN 'text-translation'
    WHEN 'text-translation' THEN 'text-translation'
    WHEN 'text-selection-card' THEN 'text-translation' END;
  IF expected_capability IS NULL OR NEW.policy->>'capability' IS DISTINCT FROM expected_capability
     OR NEW.policy - ARRAY['capability','version','revisionId','funding','updatedAt'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Action capability snapshot mismatch' USING ERRCODE='23514';
  END IF;
  IF (NEW.policy->>'version')::integer IS DISTINCT FROM
     (SELECT coalesce(max(version),0) FROM ai_capability_policy_revisions WHERE capability=expected_capability) THEN
    RAISE EXCEPTION 'New action requires the currently published charging policy' USING ERRCODE='23514';
  END IF;
  IF NEW.policy->>'version'='0' THEN
    IF NEW.policy->'revisionId' IS DISTINCT FROM 'null'::jsonb
       OR NEW.policy->'updatedAt' IS DISTINCT FROM 'null'::jsonb
       OR NEW.policy->>'funding' IS DISTINCT FROM (CASE WHEN expected_capability='portrait-interview' THEN 'operator' ELSE 'customer' END) THEN
      RAISE EXCEPTION 'Invalid initial charging policy' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO published FROM ai_capability_policy_revisions
      WHERE id=(NEW.policy->>'revisionId')::uuid AND capability=expected_capability;
    IF published.id IS NULL OR published.version::text IS DISTINCT FROM NEW.policy->>'version'
       OR published.funding IS DISTINCT FROM NEW.policy->>'funding'
       OR published.created_at IS DISTINCT FROM (NEW.policy->>'updatedAt')::timestamptz THEN
      RAISE EXCEPTION 'Charging policy provenance mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION languon_ai_credit_feature_authority(action_id_value uuid, kind_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_value uuid; state_value text; explicit_stop_value boolean := false;
BEGIN
    CASE kind_value
    WHEN 'dictionary-generation' THEN
        SELECT owner_id,execution_state::text,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM dictionary_generation_jobs WHERE id=action_id_value;
    WHEN 'sentence-generation','sentence-check' THEN
        SELECT learner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM sentence_ai_jobs WHERE id=action_id_value AND job_kind=kind_value;
        IF owner_value IS NULL AND kind_value='sentence-generation' THEN
            SELECT p.learner_id,
                CASE m.terminal_outcome WHEN 'success' THEN 'completed' WHEN 'stopped' THEN 'cancelled' WHEN 'failure' THEN 'failed' ELSE 'running' END,
                m.terminal_outcome='stopped' AND EXISTS(SELECT 1 FROM sentence_preparation_commands c
                    WHERE c.preparation_id=p.id AND c.learner_id=p.learner_id AND c.action='stop' AND c.authorization_action_id=m.action_id)
            INTO owner_value,state_value,explicit_stop_value
            FROM sentence_preparation_actions m JOIN sentence_preparations p ON p.id=m.preparation_id
            WHERE m.action_id=action_id_value;
        END IF;
    WHEN 'text-detection','text-translation' THEN
        SELECT owner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_category='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM texts_ai_jobs WHERE id=action_id_value AND job_kind=kind_value;
    WHEN 'text-selection-card' THEN
        SELECT owner_id,execution_state,cancellation_requested_at IS NOT NULL AND failure_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM dictionary_text_selection_jobs WHERE id=action_id_value;
    WHEN 'conversation-turn' THEN
        SELECT owner_id,status,cancel_requested AND failure_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM conversation_turns WHERE id=action_id_value;
    WHEN 'portrait-interview' THEN
        SELECT owner_id,state,cancel_requested AND error_code='explicit_stop'
        INTO owner_value,state_value,explicit_stop_value FROM learner_portrait_interview_operations WHERE id=action_id_value;
    WHEN 'knowledge-transcription' THEN
        SELECT owner_id,state,cancellation_requested_at IS NOT NULL AND failure_code='explicit_stop' INTO owner_value,state_value,explicit_stop_value FROM knowledge_transcription_jobs WHERE id=action_id_value;
    WHEN 'speech-generation' THEN
        SELECT payer_id,state,false INTO owner_value,state_value,explicit_stop_value FROM speech_jobs WHERE id=action_id_value;
    ELSE RAISE EXCEPTION 'Unknown action feature kind' USING ERRCODE='23514';
    END CASE;
    IF owner_value IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('ownerId',owner_value,'state',state_value,'explicitStop',coalesce(explicit_stop_value,false),'jobKind',kind_value);
END; $$;

CREATE OR REPLACE FUNCTION languon_transcription_feature_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_ai_credit_record_feature_authority(NEW.id,'knowledge-transcription');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS knowledge_transcription_action_authority ON public.knowledge_transcription_jobs;
CREATE TRIGGER knowledge_transcription_action_authority AFTER INSERT OR UPDATE ON public.knowledge_transcription_jobs FOR EACH ROW EXECUTE FUNCTION languon_transcription_feature_authority();

CREATE OR REPLACE FUNCTION languon_authorize_transcription_dispatch(job_value uuid, worker_value text, fence_value integer, checksum_value text, bytes_value integer, duration_value integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; a public.ai_credit_actions%ROWTYPE; c public.knowledge_transcription_config_revisions%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; m record; evaluated jsonb; instant_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); call_value uuid:=gen_random_uuid(); attempt_value uuid:=gen_random_uuid(); reserved_value bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Transcription job is unavailable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.owner_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_actions WHERE id=j.id FOR UPDATE;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 instant_value:=date_trunc('milliseconds',clock_timestamp());
 IF worker_value IS NULL OR fence_value IS NULL OR j.lease_deadline IS NULL OR j.state<>'running' OR j.worker_id IS DISTINCT FROM worker_value OR j.fencing_token IS DISTINCT FROM fence_value OR j.lease_deadline<=instant_value OR j.deadline_at<=instant_value OR j.cancellation_requested_at IS NOT NULL OR j.dispatched_at IS NOT NULL OR a.id IS NULL OR a.state<>'active' OR a.deadline_at<=instant_value OR a.usage_meter<>'audio-duration' OR a.audio_input_limit_milliseconds IS DISTINCT FROM j.source_duration_ms OR a.output_limit<>0 THEN RAISE EXCEPTION 'Transcription requires its original active duration allowance and live lease' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dictionary_ai_worker_observations WHERE worker_id=worker_value AND provider_id='openai' AND model_id='gpt-transcribe' AND adapter_revision='knowledge-transcription:v1' AND status='available' AND expires_at>instant_value AND text_ai_supported_formats @> '["knowledge-transcription:v1"]'::jsonb) THEN RAISE EXCEPTION 'A live compatible transcription executor is required' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.users WHERE id=j.owner_id AND status='active' FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'Transcription owner is unavailable' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.knowledge_notes WHERE id=j.note_id AND owner_id=j.owner_id FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'Transcription source is unavailable' USING ERRCODE='23514'; END IF;
 IF a.funding='customer' AND a.held_milli<j.maximum_credits_milli THEN RAISE EXCEPTION 'Transcription requires its complete customer hold' USING ERRCODE='23514'; END IF;
 SELECT b.checksum,octet_length(b.bytes) AS bytes,b.duration_ms INTO m FROM public.knowledge_media_assets g JOIN public.knowledge_media_blobs b ON b.id=g.blob_id WHERE g.id=j.asset_id AND g.note_id=j.note_id;
 IF NOT FOUND OR m.checksum IS DISTINCT FROM j.checksum OR checksum_value IS DISTINCT FROM j.checksum OR bytes_value IS DISTINCT FROM j.byte_length OR duration_value IS DISTINCT FROM j.source_duration_ms OR m.bytes IS DISTINCT FROM j.byte_length OR m.duration_ms IS DISTINCT FROM j.source_duration_ms THEN RAISE EXCEPTION 'Transcription input no longer matches its verified immutable source' USING ERRCODE='23514'; END IF;
 SELECT r.* INTO c FROM public.knowledge_transcription_state s JOIN public.knowledge_transcription_config_revisions r ON r.id=s.active_revision_id WHERE s.id='global' FOR SHARE OF s;
 IF c.id IS DISTINCT FROM j.configuration_revision_id OR NOT c.enabled OR NOT c.billing_rules_verified OR c.billing_evidence IS NULL OR c.credits_per_minute IS NULL OR c.maximum_bytes<j.byte_length OR c.maximum_duration_ms<j.source_duration_ms OR a.tariff->>'audioCreditsPerMinute' IS DISTINCT FROM c.credits_per_minute THEN RAISE EXCEPTION 'Transcription configuration is not ready or changed' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=c.provider_price_revision_id;
 IF p.id IS NULL OR p.id IS DISTINCT FROM (j.provider_price_snapshot->>'id')::uuid OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.data->'nativeRules' IS DISTINCT FROM j.provider_price_snapshot->'nativeRules' OR p.provider_id<>'openai' OR p.model_id<>'gpt-transcribe' OR p.meter<>'audio-duration' OR NOT (p.data ? 'nativeRules') OR NOT public.languon_native_meter_compatible(p.data,'audio-duration') OR p.effective_at>j.created_at THEN RAISE EXCEPTION 'Transcription native price pin is unavailable' USING ERRCODE='23514'; END IF;
 evaluated:=public.languon_evaluate_provider_price(p.data,jsonb_build_object('endpointId','/v1/audio/transcriptions','dispatchedAt',to_char(instant_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'latestDispatchAt',to_char(date_trunc('milliseconds',a.deadline_at-interval '1 microsecond') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),jsonb_build_object('audioInputMilliseconds',j.source_duration_ms,'requests',1),'upper-bound');
 IF evaluated->>'status'<>'calculated' THEN RAISE EXCEPTION 'Transcription has no reviewed finite provider bound' USING ERRCODE='23514'; END IF;
 reserved_value:=(evaluated->>'amountUsdMicros')::bigint;
 IF reserved_value>c.maximum_provider_cost_micros OR NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE action_id=j.id AND state='active' AND reserved_micros>=reserved_value) OR EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE action_id=j.id) THEN RAISE EXCEPTION 'Transcription operational allowance is unavailable' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_operator_attempt_costs(attempt_id,action_id,reserved_micros,created_at) VALUES(attempt_value,j.id,reserved_value,instant_value);
 INSERT INTO public.ai_credit_action_attempts(id,action_id,execution_job_id,ordinal,purpose,state,budget,reserved_cost_micros,input_limit,output_limit,usage_meter,audio_input_limit_milliseconds,created_at,provider_dispatch_witness) VALUES(attempt_value,j.id,j.id,1,'answer','dispatched',jsonb_build_object('usageMeter','audio-duration','audioInputLimitMilliseconds',j.source_duration_ms,'maxCostMicrosPerAttempt',reserved_value),reserved_value,0,0,'audio-duration',j.source_duration_ms,instant_value,jsonb_build_object('jobId',j.id,'worker',worker_value,'fence',fence_value::text));
 INSERT INTO public.ai_credit_native_call_dispatches(id,attempt_id,ordinal,input_limit,output_limit,call_kind,audio_input_limit_milliseconds,dispatched_at) VALUES(call_value,attempt_value,1,0,0,'audio-transcription',j.source_duration_ms,instant_value);
 UPDATE public.knowledge_transcription_jobs SET receipt_id=call_value,attempt_id=attempt_value,dispatched_at=instant_value,updated_at=instant_value WHERE id=j.id;
 RETURN jsonb_build_object('receiptId',call_value,'operationId',j.id,'noteId',j.note_id,'assetId',j.asset_id,'checksum',j.checksum,'providerId','openai','modelId','gpt-transcribe','providerPriceRevisionId',p.id,'customerTariffRevisionId',c.id,'usageMeter','audioInputMilliseconds','maximumBytes',j.byte_length,'maximumDurationMs',j.source_duration_ms,'expiresAt',to_char(least(j.lease_deadline,j.deadline_at,a.deadline_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;
REVOKE ALL ON FUNCTION languon_authorize_transcription_dispatch(uuid,text,integer,text,integer,integer) FROM PUBLIC;

-- Only a typed transcription result may attach duration observations to its issued receipt.
CREATE OR REPLACE FUNCTION languon_observe_transcription_call(job_value uuid, receipt_value uuid, duration_value bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; r public.ai_credit_native_call_dispatches%ROWTYPE; u jsonb;
BEGIN
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 SELECT * INTO r FROM public.ai_credit_native_call_dispatches WHERE id=receipt_value FOR UPDATE;
 IF j.id IS NULL OR r.id IS NULL OR j.receipt_id IS DISTINCT FROM r.id OR j.attempt_id IS DISTINCT FROM r.attempt_id OR r.call_kind<>'audio-transcription' THEN RAISE EXCEPTION 'Transcription observation requires its issued duration receipt' USING ERRCODE='23514'; END IF;
 IF duration_value IS NOT NULL AND (duration_value<0 OR duration_value>9007199254740991) THEN RAISE EXCEPTION 'Invalid reported transcription duration' USING ERRCODE='23514'; END IF;
 u:=jsonb_build_object('requests',1)||CASE WHEN duration_value IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('audioInputMilliseconds',duration_value) END;
 IF r.observed_at IS NOT NULL THEN
  IF r.provider_usage IS DISTINCT FROM u THEN RAISE EXCEPTION 'Transcription observation replay differs' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 UPDATE public.ai_credit_native_call_dispatches SET provider_usage=u,provider_execution_facts=jsonb_build_object('endpointId','/v1/audio/transcriptions'),observed_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION languon_observe_transcription_call(uuid,uuid,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_transcription_provider_expense_identity(attempt_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public.ai_credit_action_attempts%ROWTYPE; j public.knowledge_transcription_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; evaluated jsonb; amount_value bigint;
BEGIN
 SELECT * INTO t FROM public.ai_credit_action_attempts WHERE id=attempt_value;
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=t.execution_job_id;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF t.id IS NULL OR t.state<>'settled' OR j.attempt_id IS DISTINCT FROM t.id OR t.usage_meter<>'audio-duration' OR p.id IS NULL OR p.meter<>'audio-duration' OR p.provider_id<>'openai' OR p.model_id<>'gpt-transcribe' OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.data->'nativeRules' IS DISTINCT FROM j.provider_price_snapshot->'nativeRules' THEN RAISE EXCEPTION 'Transcription expense requires immutable duration provenance' USING ERRCODE='23514'; END IF;
 evaluated:=public.languon_native_parent_expense(p.data,t.id,t.provider_usage->'calls');
 IF evaluated->>'status'='calculated' THEN amount_value:=(evaluated->>'amountUsdMicros')::bigint; END IF;
 RETURN jsonb_build_object('attemptId',t.id,'actionId',j.id,'attemptReference','knowledge-transcription:'||t.id::text,'sourceKind','transcription-attempt','providerId',p.provider_id,'modelId',p.model_id,'measurement',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'measured' END,'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',amount_value::text,'occurredAt',t.created_at);
END $$;
REVOKE ALL ON FUNCTION languon_transcription_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_transcription_attempt(job_value uuid, successful_value boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE; t public.ai_credit_action_attempts%ROWTYPE; e jsonb; f public.ai_provider_expense_records%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.knowledge_transcription_jobs WHERE id=job_value FOR UPDATE;
 IF j.attempt_id IS NULL THEN RETURN; END IF;
 SELECT * INTO t FROM public.ai_credit_action_attempts WHERE id=j.attempt_id FOR UPDATE;
 IF t.id IS NULL OR t.usage_meter<>'audio-duration' OR t.execution_job_id IS DISTINCT FROM j.id THEN RAISE EXCEPTION 'Transcription attempt is unavailable' USING ERRCODE='23514'; END IF;
 IF t.state='settled' THEN RETURN; END IF;
 IF successful_value AND (j.state<>'completed' OR j.result IS NULL OR j.receipt_id IS NULL OR j.result->>'receiptId' IS DISTINCT FROM j.receipt_id::text) THEN RAISE EXCEPTION 'Transcription success requires the validated published result' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_credit_action_attempts SET state='settled',successful=CASE WHEN successful_value THEN 1 ELSE 0 END,provider_usage=jsonb_build_object('calls',public.languon_native_parent_calls(t.id)),settled_at=clock_timestamp() WHERE id=t.id;
 e:=public.languon_transcription_provider_expense_identity(t.id);
 INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_id,action_id,attempt_reference,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at) VALUES(gen_random_uuid(),'transcription-attempt',t.id,j.id,e->>'attemptReference',e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',(e->>'amountUsdMicros')::bigint,t.created_at) ON CONFLICT(attempt_reference) DO NOTHING;
 SELECT * INTO f FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
 IF f.amount_usd_micros IS DISTINCT FROM (e->>'amountUsdMicros')::bigint OR f.source_kind<>'transcription-attempt' OR f.attempt_id IS DISTINCT FROM t.id THEN RAISE EXCEPTION 'Transcription expense replay differs' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_credit_action_attempts SET actual_cost_micros=f.amount_usd_micros WHERE id=t.id;
 UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(f.amount_usd_micros,reserved_micros),measurement=CASE WHEN f.amount_usd_micros IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=clock_timestamp() WHERE attempt_id=t.id AND settled_at IS NULL;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_settle_transcription_attempt(uuid,boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ai_credit_action_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE action_row public.ai_credit_actions%ROWTYPE;
DECLARE count_calls integer;
DECLARE output_used bigint;
BEGIN
  SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=NEW.action_id FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.state='settled' AND NEW.actual_cost_micros IS NOT DISTINCT FROM ((CASE WHEN OLD.usage_meter='audio-duration' THEN public.languon_transcription_provider_expense_identity(OLD.id) ELSE public.languon_text_provider_expense_identity(OLD.id) END)->>'amountUsdMicros')::bigint
     AND (to_jsonb(NEW)-'actual_cost_micros')=(to_jsonb(OLD)-'actual_cost_micros') THEN RETURN NEW; END IF;
  IF NOT FOUND OR action_row.state<>'active' THEN RAISE EXCEPTION 'Provider dispatch requires active action authorization'; END IF;
  IF NEW.usage_meter IS DISTINCT FROM action_row.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM action_row.audio_input_limit_milliseconds THEN RAISE EXCEPTION 'Attempt dimensions must match the parent action'; END IF;
  IF NEW.usage_meter='audio-duration' AND (NEW.input_tokens IS NOT NULL OR NEW.output_tokens IS NOT NULL OR NEW.input_limit<>0 OR NEW.output_limit<>0) THEN RAISE EXCEPTION 'Duration observations cannot be interpreted as tokens'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'dispatched' OR NEW.state<>'settled' OR
      NEW.id<>OLD.id OR NEW.action_id<>OLD.action_id OR NEW.execution_job_id IS DISTINCT FROM OLD.execution_job_id OR NEW.ordinal<>OLD.ordinal OR NEW.purpose<>OLD.purpose
      OR NEW.usage_meter IS DISTINCT FROM OLD.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM OLD.audio_input_limit_milliseconds OR NEW.input_limit<>OLD.input_limit OR NEW.output_limit<>OLD.output_limit OR NEW.budget<>OLD.budget
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

CREATE OR REPLACE FUNCTION ai_credit_action_settlement_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE lot record;
BEGIN
  IF OLD.state<>'active' THEN RAISE EXCEPTION 'Settled actions are immutable'; END IF;
  IF NEW.usage_meter IS DISTINCT FROM OLD.usage_meter OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM OLD.audio_input_limit_milliseconds OR NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.capability<>OLD.capability OR NEW.funding<>OLD.funding
    OR NEW.policy_version<>OLD.policy_version OR NEW.tariff<>OLD.tariff OR NEW.held_milli<>OLD.held_milli
    OR NEW.budget_milli<>OLD.budget_milli OR NEW.output_limit<>OLD.output_limit
    OR NEW.created_at<>OLD.created_at OR NEW.deadline_at<>OLD.deadline_at THEN
      RAISE EXCEPTION 'Action authorization is immutable';
  END IF;
  IF NEW.state='settled' THEN
    IF (SELECT coalesce(sum(allocated_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.id)<>NEW.held_milli
      OR (SELECT coalesce(sum(settled_milli),0) FROM public.ai_credit_action_allocations WHERE action_id=NEW.id)<>NEW.charged_milli THEN
      RAISE EXCEPTION 'Action allocations do not match settlement';
    END IF;
    FOR lot IN SELECT * FROM public.ai_credit_action_allocations WHERE action_id=NEW.id LOOP
      UPDATE public.ai_credit_grant_balances SET remaining_credits=remaining_credits+lot.allocated_milli-lot.settled_milli,
        reserved_credits=reserved_credits-lot.allocated_milli, consumed_credits=consumed_credits+lot.settled_milli
        WHERE grant_id=lot.grant_id AND owner_id=NEW.owner_id AND reserved_credits>=lot.allocated_milli;
      IF NOT FOUND THEN RAISE EXCEPTION 'Action grant projection is inconsistent'; END IF;
    END LOOP;
    UPDATE public.ai_credit_wallet_totals SET reserved_credits=reserved_credits-NEW.held_milli,
      consumed_credits=consumed_credits+NEW.charged_milli WHERE owner_id=NEW.owner_id AND reserved_credits>=NEW.held_milli;
    IF NEW.held_milli>0 AND NOT FOUND THEN RAISE EXCEPTION 'Action wallet projection is inconsistent'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION languon_guard_transcription_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.created_by IS NULL AND OLD.created_by IS NOT NULL AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') AND public.languon_operator_purge_authorized(OLD.created_by) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.created_by IS NULL AND OLD.created_by IS NOT NULL AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.created_by) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Transcription configuration revisions are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS knowledge_transcription_configuration_immutable ON public.knowledge_transcription_config_revisions;
CREATE TRIGGER knowledge_transcription_configuration_immutable BEFORE UPDATE OR DELETE ON public.knowledge_transcription_config_revisions FOR EACH ROW EXECUTE FUNCTION languon_guard_transcription_configuration();

-- Note deletion settles holds before its ordinary cascading removal of private job payloads.
CREATE OR REPLACE FUNCTION languon_cancel_note_transcriptions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(OLD.owner_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT * FROM public.knowledge_transcription_jobs WHERE note_id=OLD.id AND state IN ('queued','running') ORDER BY id FOR UPDATE LOOP
  UPDATE public.knowledge_transcription_jobs SET state='failed',result=NULL,failure_code='source_deleted',cancellation_requested_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id;
  PERFORM public.languon_settle_transcription_attempt(j.id,false);
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=j.id AND state='active') THEN PERFORM public.languon_settle_credit_action(j.id,'failure',clock_timestamp()); END IF;
 END LOOP;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS knowledge_note_transcription_erasure ON public.knowledge_notes;
CREATE TRIGGER knowledge_note_transcription_erasure BEFORE DELETE ON public.knowledge_notes FOR EACH ROW EXECUTE FUNCTION languon_cancel_note_transcriptions();

CREATE OR REPLACE FUNCTION languon_guard_transcription_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.knowledge_transcription_config_revisions%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE; a public.ai_credit_actions%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['state','maximum_credits_milli','deadline_at','worker_id','fencing_token','lease_deadline','cancellation_requested_at','receipt_id','attempt_id','dispatched_at','observed_audio_input_ms','result','failure_code','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','maximum_credits_milli','deadline_at','worker_id','fencing_token','lease_deadline','cancellation_requested_at','receipt_id','attempt_id','dispatched_at','observed_audio_input_ms','result','failure_code','updated_at']) THEN RAISE EXCEPTION 'Transcription source and configuration identities are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state IN ('completed','failed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Terminal transcription output is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state<>'confirmation-required' AND (NEW.maximum_credits_milli IS DISTINCT FROM OLD.maximum_credits_milli OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at) THEN RAISE EXCEPTION 'Confirmed transcription spending allowance is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.dispatched_at IS NOT NULL AND (NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at OR NEW.receipt_id IS DISTINCT FROM OLD.receipt_id OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id) THEN RAISE EXCEPTION 'Transcription dispatch identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.state='running' THEN
   IF NEW.worker_id IS NULL OR NEW.lease_deadline IS NULL OR NEW.lease_deadline>NEW.deadline_at OR NEW.lease_deadline<=clock_timestamp() OR NOT ((OLD.state='queued' AND NEW.fencing_token=OLD.fencing_token+1) OR (OLD.state='running' AND NEW.worker_id IS NOT DISTINCT FROM OLD.worker_id AND NEW.fencing_token=OLD.fencing_token)) THEN RAISE EXCEPTION 'Transcription requires a current fenced lease' USING ERRCODE='23514'; END IF;
  ELSIF NEW.state IN ('completed','failed','cancelled') THEN
   IF NEW.state='completed' AND (OLD.state<>'running' OR OLD.lease_deadline<=clock_timestamp() OR NEW.deadline_at<=clock_timestamp() OR NEW.cancellation_requested_at IS NOT NULL OR NEW.receipt_id IS NULL OR NEW.result->>'receiptId' IS DISTINCT FROM NEW.receipt_id::text OR jsonb_typeof(NEW.result->'text') IS DISTINCT FROM 'string' OR char_length(NEW.result->>'text') NOT BETWEEN 1 AND 80000 OR octet_length(NEW.result::text)>524288 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.owner_id AND status='active') OR NOT EXISTS(SELECT 1 FROM public.knowledge_notes WHERE id=NEW.note_id AND owner_id=NEW.owner_id) OR NOT EXISTS(SELECT 1 FROM public.knowledge_media_assets g JOIN public.knowledge_media_blobs b ON b.id=g.blob_id WHERE g.id=NEW.asset_id AND g.note_id=NEW.note_id AND b.checksum=NEW.checksum AND b.duration_ms=NEW.source_duration_ms AND octet_length(b.bytes)=NEW.byte_length)) THEN RAISE EXCEPTION 'Transcription publication requires live source, lease and validated text' USING ERRCODE='23514'; END IF;
  ELSIF NOT ((OLD.state='confirmation-required' AND NEW.state IN ('confirmation-required','queued')) OR (OLD.state='queued' AND NEW.state='queued' AND NEW.cancellation_requested_at IS NOT NULL)) THEN RAISE EXCEPTION 'Invalid transcription lifecycle transition' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.state NOT IN ('confirmation-required','queued') OR NEW.receipt_id IS NOT NULL OR NEW.dispatched_at IS NOT NULL OR NEW.attempt_id IS NOT NULL OR NEW.result IS NOT NULL OR NEW.fencing_token<>0 THEN RAISE EXCEPTION 'New transcription must be undispatched work' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO c FROM public.knowledge_transcription_config_revisions WHERE id=NEW.configuration_revision_id;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(NEW.provider_price_snapshot->>'id')::uuid;
 IF c.id IS NULL OR p.id IS NULL OR c.provider_price_revision_id IS DISTINCT FROM p.id OR p.version IS DISTINCT FROM (NEW.provider_price_snapshot->>'version')::integer OR p.data->'nativeRules' IS DISTINCT FROM NEW.provider_price_snapshot->'nativeRules' OR c.credits_per_minute IS NULL OR p.meter<>'audio-duration' OR p.provider_id<>'openai' OR p.model_id<>'gpt-transcribe' THEN RAISE EXCEPTION 'Transcription requires immutable native price and customer tariff pins' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS knowledge_transcription_job_guard ON public.knowledge_transcription_jobs;
CREATE TRIGGER knowledge_transcription_job_guard BEFORE INSERT OR UPDATE ON public.knowledge_transcription_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_transcription_job();

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_action_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pin ai_action_charging_policies%ROWTYPE; account_mode text; unlimited_expiry timestamptz; effective_unlimited boolean; duration_job public.knowledge_transcription_jobs%ROWTYPE; duration_config public.knowledge_transcription_config_revisions%ROWTYPE; duration_max bigint;
BEGIN
    SELECT * INTO pin FROM ai_action_charging_policies WHERE job_id=NEW.id;
    IF pin.job_id IS NULL OR pin.owner_id IS DISTINCT FROM NEW.owner_id
        OR pin.policy->>'capability' IS DISTINCT FROM NEW.capability
        OR (pin.policy->>'version')::integer IS DISTINCT FROM NEW.policy_version
        OR NEW.created_at<pin.created_at OR NEW.state<>'active' THEN
        RAISE EXCEPTION 'Action admission requires its immutable owned charging policy' USING ERRCODE='23514';
    END IF;
    IF pin.policy->>'funding'='operator' THEN
        IF NEW.funding<>'operator' OR NEW.held_milli<>0 THEN
            RAISE EXCEPTION 'Operator action cannot charge customer credits' USING ERRCODE='23514';
        END IF;
    ELSIF pin.policy->>'funding'='customer' THEN
        SELECT mode::text,unlimited_until INTO account_mode,unlimited_expiry FROM ai_credit_accounts WHERE user_id=NEW.owner_id;
        effective_unlimited := coalesce(account_mode='unlimited' AND (unlimited_expiry IS NULL OR unlimited_expiry>NEW.created_at),false);
        IF effective_unlimited AND (NEW.funding<>'unlimited' OR NEW.held_milli<>0) THEN
            RAISE EXCEPTION 'Unlimited entitlement must preserve finite customer grants' USING ERRCODE='23514';
        ELSIF NOT effective_unlimited AND (NEW.funding<>'customer' OR (NEW.held_milli=0 AND NOT coalesce((
            (NEW.tariff->>'inputCreditsPerMillionTokens')::numeric=0
            AND coalesce((NEW.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(NEW.tariff->>'inputCreditsPerMillionTokens')::numeric)=0
            AND (NEW.tariff->>'outputCreditsPerMillionTokens')::numeric=0),false))) THEN
            RAISE EXCEPTION 'Customer action requires its finite credit hold' USING ERRCODE='23514';
        END IF;
    ELSE RAISE EXCEPTION 'Invalid pinned action funding' USING ERRCODE='23514'; END IF;
    IF NEW.usage_meter='audio-duration' THEN
        SELECT * INTO duration_job FROM public.knowledge_transcription_jobs WHERE id=NEW.id;
        SELECT * INTO duration_config FROM public.knowledge_transcription_config_revisions WHERE id=duration_job.configuration_revision_id;
        IF pin.job_kind<>'knowledge-transcription' OR NEW.capability<>'speech' OR duration_job.id IS NULL OR duration_job.owner_id IS DISTINCT FROM NEW.owner_id OR duration_job.state<>'queued' OR duration_config.id IS NULL OR duration_config.credits_per_minute IS NULL OR NEW.tariff->>'audioCreditsPerMinute' IS DISTINCT FROM duration_config.credits_per_minute OR NEW.audio_input_limit_milliseconds IS DISTINCT FROM duration_job.source_duration_ms OR NEW.output_limit<>0 OR NEW.tariff->>'inputCreditsPerMillionTokens' IS DISTINCT FROM '0' OR NEW.tariff->>'outputCreditsPerMillionTokens' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Duration action admission requires its typed source and exact tariff' USING ERRCODE='23514'; END IF;
        duration_max:=ceil(duration_job.source_duration_ms::numeric*duration_config.credits_per_minute::numeric*1000/60000)::bigint;
        IF (NEW.funding='customer' AND (NEW.held_milli<>duration_max OR NEW.budget_milli<>duration_max OR duration_job.maximum_credits_milli<>duration_max)) OR (NEW.funding<>'customer' AND (NEW.budget_milli<>0 OR duration_job.maximum_credits_milli<>0)) THEN RAISE EXCEPTION 'Duration action hold must equal the confirmed source tariff' USING ERRCODE='23514'; END IF;
    ELSIF NEW.tariff ? 'audioCreditsPerMinute' THEN RAISE EXCEPTION 'Audio tariffs cannot enter token actions' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION languon_cancel_owner_transcriptions(owner_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.knowledge_transcription_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT * FROM public.knowledge_transcription_jobs WHERE owner_id=owner_value AND state IN ('queued','running') ORDER BY id FOR UPDATE LOOP
  UPDATE public.knowledge_transcription_jobs SET state='failed',result=NULL,failure_code='owner_deleted',cancellation_requested_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id;
  PERFORM public.languon_settle_transcription_attempt(j.id,false);
  IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE id=j.id AND state='active') THEN PERFORM public.languon_settle_credit_action(j.id,'failure',clock_timestamp()); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION languon_cancel_owner_transcriptions(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_action_charging_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE job_owner uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ai_action_charging_policies WHERE job_id=NEW.job_id) THEN RETURN NULL; END IF;
  CASE NEW.job_kind
    WHEN 'dictionary-generation' THEN SELECT owner_id INTO job_owner FROM dictionary_generation_jobs WHERE id=NEW.job_id;
    WHEN 'knowledge-transcription' THEN SELECT owner_id INTO job_owner FROM knowledge_transcription_jobs WHERE id=NEW.job_id;
    WHEN 'speech-generation' THEN SELECT payer_id INTO job_owner FROM speech_jobs WHERE id=NEW.job_id;
    WHEN 'sentence-generation','sentence-check' THEN SELECT learner_id INTO job_owner FROM sentence_ai_jobs WHERE id=NEW.job_id AND job_kind=NEW.job_kind;
      IF job_owner IS NULL AND NEW.job_kind='sentence-generation' THEN SELECT p.learner_id INTO job_owner FROM sentence_preparation_actions m JOIN sentence_preparations p ON p.id=m.preparation_id WHERE m.action_id=NEW.job_id; END IF;
    WHEN 'text-detection','text-translation' THEN SELECT owner_id INTO job_owner FROM texts_ai_jobs WHERE id=NEW.job_id AND job_kind=NEW.job_kind;
    WHEN 'text-selection-card' THEN SELECT owner_id INTO job_owner FROM dictionary_text_selection_jobs WHERE id=NEW.job_id;
    WHEN 'portrait-interview' THEN SELECT owner_id INTO job_owner FROM learner_portrait_interview_operations WHERE id=NEW.job_id;
    WHEN 'conversation-turn' THEN SELECT owner_id INTO job_owner FROM conversation_turns WHERE id=NEW.job_id;
    ELSE RAISE EXCEPTION 'Unknown charging policy action' USING ERRCODE='23514';
  END CASE;
  IF job_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Charging policy requires its owned feature action' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
