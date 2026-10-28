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
 allowed:=CASE meter_value WHEN 'text-tokens' THEN ARRAY['inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','requests'] WHEN 'speech-characters' THEN ARRAY['characters','requests'] WHEN 'speech-tokens' THEN ARRAY['inputTokens','audioOutputTokens','requests'] ELSE NULL END;
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
  IF (meter_value='text-tokens' AND (NOT ('outputTokens'=ANY(meters)) OR NOT (meters && ARRAY['inputTokens','uncachedInputTokens']::text[]))) OR (meter_value='speech-characters' AND NOT ('characters'=ANY(meters))) OR (meter_value='speech-tokens' AND NOT (ARRAY['inputTokens','audioOutputTokens']::text[]<@meters)) THEN RETURN false; END IF;
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
   OR NOT public.languon_native_object(usage,ARRAY['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','characters','requests','providerCreditsConsumed','providerCostUsd']) THEN RAISE EXCEPTION 'Invalid native evidence'; END IF;
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
   IF NOT public.languon_native_object(c,ARRAY['meter','pricePerUnit','unitQuantity','minimum','chargeWhen','rounding']) OR NOT c ?& ARRAY['meter','pricePerUnit','unitQuantity','chargeWhen'] OR c->>'meter' NOT IN ('inputTokens','uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','characters','requests') OR c->>'meter'=ANY(meters) OR c->>'chargeWhen' NOT IN ('positive-usage','request') THEN RAISE EXCEPTION 'Invalid native component'; END IF;
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
