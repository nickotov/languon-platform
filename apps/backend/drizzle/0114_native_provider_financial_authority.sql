-- Native provider metering uses immutable pins and DB-issued dispatch receipts.
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/native-pricing-evaluator.sql
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


--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/native-provider-call-authority.sql
-- A native SDK call owns an immutable DB-clock receipt; callers cannot choose its pricing instant.
CREATE OR REPLACE FUNCTION languon_authorize_native_text_call(attempt_value uuid, input_value integer, output_value integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.ai_credit_action_attempts%ROWTYPE; action_row public.ai_credit_actions%ROWTYPE; witness jsonb; k text; table_value text; feature jsonb; receipt public.text_ai_route_dispatches%ROWTYPE; pin public.ai_provider_price_revisions%ROWTYPE; clock_value timestamptz:=date_trunc('milliseconds',clock_timestamp()); counted integer; used_input bigint; used_output bigint; call_value uuid:=gen_random_uuid(); selected jsonb; check_value jsonb; prior public.ai_credit_native_call_dispatches%ROWTYPE; prior_cost bigint; known_n numeric:=0; known_d numeric:=1; part_n numeric; part_d numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(4312189072);
 SELECT c.* INTO action_row FROM public.ai_credit_actions c JOIN public.ai_credit_action_attempts t ON t.action_id=c.id WHERE t.id=attempt_value;
 IF action_row.id IS NULL OR action_row.state<>'active' OR action_row.deadline_at<=clock_value THEN RAISE EXCEPTION 'Native call requires its active parent action' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(action_row.owner_id::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=attempt_value FOR UPDATE;
 SELECT * INTO action_row FROM public.ai_credit_actions WHERE id=a.action_id FOR UPDATE;
 clock_value:=date_trunc('milliseconds',clock_timestamp());
 IF action_row.id IS NULL OR action_row.state<>'active' OR action_row.deadline_at<=clock_value THEN RAISE EXCEPTION 'Native parent authority expired while waiting' USING ERRCODE='23514'; END IF;
 IF a.state<>'dispatched' OR input_value IS NULL OR input_value<0 OR output_value IS NULL OR output_value<1 OR a.provider_dispatch_witness IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=action_row.owner_id AND status='active') THEN RAISE EXCEPTION 'Native call requires an admitted dispatched attempt' USING ERRCODE='23514'; END IF;
 SELECT * INTO receipt FROM public.text_ai_route_dispatches WHERE attempt_id=a.id;
 SELECT * INTO pin FROM public.ai_provider_price_revisions WHERE id=(receipt.provider_price->>'id')::uuid;
 IF pin.id IS NULL OR NOT pin.data ? 'nativeRules' OR pin.version IS DISTINCT FROM (receipt.provider_price->>'version')::integer OR pin.provider_id IS DISTINCT FROM receipt.snapshot->>'providerId' OR pin.model_id IS DISTINCT FROM receipt.snapshot->>'modelId' THEN RAISE EXCEPTION 'Native call requires its immutable native pin' USING ERRCODE='23514'; END IF;
 witness:=a.provider_dispatch_witness;
 IF witness->>'jobId' IS DISTINCT FROM a.execution_job_id::text THEN RAISE EXCEPTION 'Native call witness mismatch' USING ERRCODE='23514'; END IF;
 SELECT job_kind INTO k FROM public.ai_action_charging_policies WHERE job_id=a.action_id;
 CASE k
  WHEN 'conversation-turn' THEN table_value:='conversation_turns';
  WHEN 'portrait-interview' THEN table_value:='learner_portrait_interview_operations';
  WHEN 'dictionary-generation' THEN table_value:='dictionary_generation_jobs';
  WHEN 'sentence-generation','sentence-check' THEN table_value:='sentence_ai_jobs';
  WHEN 'text-detection','text-translation' THEN table_value:='texts_ai_jobs';
  WHEN 'text-selection-card' THEN table_value:='dictionary_text_selection_jobs';
  ELSE RAISE EXCEPTION 'Native call has no supported typed feature' USING ERRCODE='23514';
 END CASE;
 EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',table_value) INTO feature USING a.execution_job_id;
 IF feature IS NULL OR coalesce(feature->>'owner_id',feature->>'learner_id') IS DISTINCT FROM action_row.owner_id::text THEN RAISE EXCEPTION 'Native call feature ownership mismatch' USING ERRCODE='23514'; END IF;
 IF k IN ('conversation-turn','portrait-interview') THEN
  IF coalesce(feature->>'status',feature->>'state')<>'running' OR witness->>'token' IS NULL OR feature->>'lease_token' IS DISTINCT FROM witness->>'token' OR feature->>'lease_until' IS NULL OR (feature->>'lease_until')::timestamptz<=clock_value OR coalesce((feature->>'cancel_requested')::boolean,false) THEN RAISE EXCEPTION 'Native call requires its original live lease' USING ERRCODE='23514'; END IF;
 ELSE
  IF feature->>'execution_state'<>'running' OR witness->>'worker' IS NULL OR witness->>'fence' IS NULL OR feature->>'worker_id' IS DISTINCT FROM witness->>'worker' OR feature->>'fencing_token' IS DISTINCT FROM witness->>'fence' OR feature->>'lease_deadline' IS NULL OR (feature->>'lease_deadline')::timestamptz<=clock_value OR feature->>'cancellation_requested_at' IS NOT NULL THEN RAISE EXCEPTION 'Native call requires its original live worker fence' USING ERRCODE='23514'; END IF;
 END IF;
 IF receipt.snapshot ? 'routingAuthority' THEN
  SELECT candidate INTO selected FROM jsonb_array_elements(receipt.snapshot->'routingAuthority'->'candidates') candidate WHERE candidate->>'routeId'=receipt.route_id;
  IF selected IS NULL OR NOT EXISTS(SELECT 1 FROM public.text_ai_routing_state s JOIN public.text_ai_routing_revisions r ON r.id=s.active_revision_id WHERE s.id='global' AND r.configuration->'enabledRouteIds' ? receipt.route_id) OR NOT public.languon_text_ai_route_dispatch_allowed(receipt.route_id,receipt.snapshot->'routingAuthority'->>'flowId',selected->>'fingerprint',clock_value) THEN RAISE EXCEPTION 'Native route excluded before HTTP dispatch' USING ERRCODE='23514'; END IF;
 END IF;
 counted:=0; used_input:=0; used_output:=0;
 FOR prior IN SELECT * FROM public.ai_credit_native_call_dispatches WHERE attempt_id=attempt_value ORDER BY ordinal LOOP
  counted:=counted+1;
  check_value:=public.languon_evaluate_provider_price(pin.data,coalesce(prior.provider_execution_facts,'{}'::jsonb)||jsonb_build_object('dispatchedAt',to_char(prior.dispatched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),coalesce(prior.provider_usage,jsonb_build_object('requests',1)),'actual');
  IF check_value->>'status'='calculated' THEN
   prior_cost:=(check_value->>'amountUsdMicros')::bigint;
   used_input:=used_input+coalesce((prior.provider_usage->>'inputTokens')::bigint,prior.input_limit);
   used_output:=used_output+coalesce((prior.provider_usage->>'outputTokens')::bigint,prior.output_limit);
  ELSE
   -- Missing financial evidence keeps the complete issued bounds reserved.
   used_input:=used_input+prior.input_limit; used_output:=used_output+prior.output_limit;
   check_value:=public.languon_native_text_reservation(pin.data,jsonb_build_object('dispatchedAt',to_char(prior.dispatched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),prior.input_limit,prior.output_limit,1);
   IF check_value->>'status'<>'calculated' THEN RAISE EXCEPTION 'Prior native call has no finite reservation' USING ERRCODE='23514'; END IF;
   prior_cost:=(check_value->>'amountUsdMicros')::bigint;
  END IF;
  part_n:=(check_value->>'usdNumerator')::numeric; part_d:=(check_value->>'usdDenominator')::numeric;
  known_n:=known_n*part_d+part_n*known_d; known_d:=known_d*part_d;
 END LOOP;
 IF counted>=5 OR used_input+input_value>a.input_limit OR used_output+output_value>a.output_limit THEN RAISE EXCEPTION 'Native calls exceed the parent envelope' USING ERRCODE='23514'; END IF;
 check_value:=public.languon_native_text_reservation(pin.data,jsonb_build_object('dispatchedAt',to_char(clock_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'latestDispatchAt',to_char((date_trunc('milliseconds',action_row.deadline_at-interval '1 microsecond')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),(a.input_limit-used_input)::integer,(a.output_limit-used_output)::integer,5-counted);
 IF check_value->>'status'<>'calculated' OR div((known_n*(check_value->>'usdDenominator')::numeric+(check_value->>'usdNumerator')::numeric*known_d)*1000000+known_d*(check_value->>'usdDenominator')::numeric-1,known_d*(check_value->>'usdDenominator')::numeric)>a.reserved_cost_micros THEN RAISE EXCEPTION 'Native rate changed outside its reserved dispatch bound' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ai_credit_native_call_dispatches(id,attempt_id,ordinal,input_limit,output_limit,dispatched_at) VALUES(call_value,attempt_value,counted+1,input_value,output_value,clock_value);
 RETURN jsonb_build_object('callId',call_value,'dispatchedAt',to_char(clock_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;
REVOKE ALL ON FUNCTION languon_authorize_native_text_call(uuid,integer,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_observe_native_text_call(call_value uuid, observations_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.ai_credit_native_call_dispatches%ROWTYPE; a public.ai_credit_action_attempts%ROWTYPE; usage_value jsonb; facts_value jsonb; k text; val jsonb; n numeric; pin public.ai_provider_price_revisions%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.ai_credit_native_call_dispatches WHERE id=call_value;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Native observation has no issued dispatch receipt' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM public.ai_credit_action_attempts WHERE id=r.attempt_id;
 PERFORM pg_advisory_xact_lock(hashtextextended((SELECT owner_id::text FROM public.ai_credit_actions WHERE id=a.action_id),1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO r FROM public.ai_credit_native_call_dispatches WHERE id=call_value FOR UPDATE;
 IF NOT public.languon_native_object(observations_value,ARRAY['usage','execution']) OR NOT observations_value ? 'usage' OR octet_length(observations_value::text)>16384 THEN RAISE EXCEPTION 'Invalid native observation' USING ERRCODE='23514'; END IF;
 usage_value:=observations_value->'usage'; facts_value:=coalesce(observations_value->'execution','{}'::jsonb);
 SELECT p.* INTO pin FROM public.text_ai_route_dispatches d JOIN public.ai_provider_price_revisions p ON p.id=(d.provider_price->>'id')::uuid AND p.version=(d.provider_price->>'version')::integer WHERE d.attempt_id=r.attempt_id;
 IF pin.id IS NULL OR (usage_value ? 'providerCostUsd' AND pin.provider_id<>'openrouter') OR (usage_value ? 'providerCreditsConsumed' AND (pin.provider_id<>'kie' OR pin.data->'nativeRules'->>'reportedCreditUsdPerCredit' IS NULL)) THEN RAISE EXCEPTION 'Reported monetary evidence is not supported by this immutable provider pin' USING ERRCODE='23514'; END IF;
 IF NOT public.languon_native_object(usage_value,ARRAY['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','characters','requests','providerCreditsConsumed','providerCostUsd']) OR NOT usage_value ? 'requests' OR NOT public.languon_native_object(facts_value,ARRAY['endpointId','serviceTier']) THEN RAISE EXCEPTION 'Invalid native observation fields' USING ERRCODE='23514'; END IF;
 FOR k,val IN SELECT * FROM jsonb_each(usage_value) LOOP
  IF k IN ('providerCreditsConsumed','providerCostUsd') THEN IF jsonb_typeof(val)<>'string' THEN RAISE EXCEPTION 'Invalid reported amount' USING ERRCODE='23514'; END IF; PERFORM public.languon_native_decimal(val#>>'{}');
  ELSE n:=public.languon_native_count(val); END IF;
 END LOOP;
 IF (usage_value->>'requests')::numeric NOT IN (0,1) OR coalesce((usage_value->>'inputTokens')::numeric,0)>r.input_limit OR coalesce((usage_value->>'outputTokens')::numeric,0)>r.output_limit OR (usage_value ? 'inputTokens' AND coalesce((usage_value->>'cacheReadTokens')::numeric,0)+coalesce((usage_value->>'cacheWriteTokens')::numeric,0)>(usage_value->>'inputTokens')::numeric) THEN RAISE EXCEPTION 'Native observation exceeds its issued envelope' USING ERRCODE='23514'; END IF;
 FOR k,val IN SELECT * FROM jsonb_each(facts_value) LOOP IF jsonb_typeof(val)<>'string' OR length(btrim(val#>>'{}')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid native execution selector' USING ERRCODE='23514'; END IF; END LOOP;
 IF r.observed_at IS NOT NULL THEN
  IF r.provider_usage IS DISTINCT FROM usage_value OR r.provider_execution_facts IS DISTINCT FROM facts_value THEN RAISE EXCEPTION 'Native observation replay differs' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 -- Late financial observations remain useful for reconciliation; they never mutate a frozen parent expense.
 UPDATE public.ai_credit_native_call_dispatches SET provider_usage=usage_value,provider_execution_facts=facts_value,observed_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION languon_observe_native_text_call(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_parent_calls(attempt_value uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('callId',id,'usage',coalesce(provider_usage,jsonb_build_object('requests',1)),'execution',coalesce(provider_execution_facts,'{}'::jsonb)||jsonb_build_object('dispatchedAt',to_char(dispatched_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) ORDER BY ordinal),'[]'::jsonb)
 FROM public.ai_credit_native_call_dispatches WHERE attempt_id=attempt_value;
$$;
REVOKE ALL ON FUNCTION languon_native_parent_calls(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_native_parent_expense(price_data jsonb, attempt_value uuid, frozen_calls jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE call_value jsonb; receipt public.ai_credit_native_call_dispatches%ROWTYPE; result_value jsonb; n numeric:=0; d numeric:=1; part_n numeric; part_d numeric; ids uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF frozen_calls IS NULL OR jsonb_typeof(frozen_calls)<>'array' OR jsonb_array_length(frozen_calls)>5 OR jsonb_array_length(frozen_calls)<>(SELECT count(*) FROM public.ai_credit_native_call_dispatches WHERE attempt_id=attempt_value) THEN RAISE EXCEPTION 'Native parent receipt set is incomplete'; END IF;
 IF jsonb_array_length(frozen_calls)=0 THEN RETURN jsonb_build_object('status','calculated','amountUsdMicros','0'); END IF;
 FOR call_value IN SELECT value FROM jsonb_array_elements(frozen_calls) LOOP
  IF NOT public.languon_native_object(call_value,ARRAY['callId','usage','execution']) OR NOT call_value ?& ARRAY['callId','usage','execution'] OR (call_value->>'callId')::uuid=ANY(ids) THEN RAISE EXCEPTION 'Invalid native parent call'; END IF;
  ids:=array_append(ids,(call_value->>'callId')::uuid);
  SELECT * INTO receipt FROM public.ai_credit_native_call_dispatches WHERE id=(call_value->>'callId')::uuid AND attempt_id=attempt_value;
  IF receipt.id IS NULL OR (call_value->'execution'->>'dispatchedAt')::timestamptz IS DISTINCT FROM receipt.dispatched_at THEN RAISE EXCEPTION 'Native call has no matching DB clock receipt'; END IF;
  result_value:=public.languon_evaluate_provider_price(price_data,call_value->'execution',call_value->'usage','actual');
  IF result_value->>'status'<>'calculated' THEN RETURN result_value; END IF;
  part_n:=(result_value->>'usdNumerator')::numeric; part_d:=(result_value->>'usdDenominator')::numeric;
  n:=n*part_d+part_n*d; d:=d*part_d;
 END LOOP;
 IF div(n*1000000+d-1,d)>9223372036854775807 THEN RAISE EXCEPTION 'Native parent monetary amount exceeds supported storage'; END IF;
 RETURN jsonb_build_object('status','calculated','amountUsdMicros',div(n*1000000+d-1,d)::text);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','unknown','reason','Native call receipt or metering evidence is incomplete.');
END $$;
REVOKE ALL ON FUNCTION languon_native_parent_expense(jsonb,uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_native_call_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.ai_credit_action_attempts WHERE id=OLD.attempt_id) THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.observed_at IS NULL AND NEW.observed_at IS NOT NULL AND NEW.provider_usage IS NOT NULL AND (to_jsonb(NEW)-ARRAY['provider_usage','provider_execution_facts','observed_at'])=(to_jsonb(OLD)-ARRAY['provider_usage','provider_execution_facts','observed_at']) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Native provider dispatch receipts are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS ai_credit_native_call_receipt_guard ON public.ai_credit_native_call_dispatches;
CREATE TRIGGER ai_credit_native_call_receipt_guard BEFORE UPDATE OR DELETE ON public.ai_credit_native_call_dispatches FOR EACH ROW EXECUTE FUNCTION languon_guard_native_call_receipt();


--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql
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
-- Source: apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/probe-expense-authority.sql
-- Probe provenance is operator-only and never creates a learner action or wallet hold.
CREATE OR REPLACE FUNCTION languon_probe_provider_expense_identity(probe_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.text_ai_probes%ROWTYPE; rate public.ai_provider_price_revisions%ROWTYPE; expected_value bigint; numerator numeric; native_result jsonb; usage_value jsonb;
BEGIN
  SELECT * INTO p FROM public.text_ai_probes WHERE id=probe_value;
  IF p.id IS NULL OR p.state='running' OR p.completed_at IS NULL THEN
    RAISE EXCEPTION 'Probe expense requires completed authoritative probe' USING ERRCODE='23514';
  END IF;
  IF coalesce(p.input_tokens,0)<0 OR coalesce(p.output_tokens,0)<0 OR coalesce(p.cache_read_tokens,0)<0 OR coalesce(p.cache_write_tokens,0)<0 OR coalesce(p.cache_read_tokens,0)+coalesce(p.cache_write_tokens,0)>coalesce(p.input_tokens,0) THEN
    RAISE EXCEPTION 'Invalid probe usage meters' USING ERRCODE='23514';
  END IF;
  SELECT * INTO rate FROM public.ai_provider_price_revisions WHERE id=(p.price->>'id')::uuid;
  IF rate.id IS NULL OR rate.provider_id<>p.provider_id OR rate.model_id<>p.model_id OR rate.meter<>'text-tokens' OR rate.effective_at>p.started_at OR rate.version<>(p.price->>'version')::integer THEN
    RAISE EXCEPTION 'Probe expense requires reviewed price pin' USING ERRCODE='23514';
  END IF;
  IF rate.data ? 'nativeRules' THEN
    IF (p.provider_usage ? 'providerCostUsd' AND rate.provider_id<>'openrouter') OR (p.provider_usage ? 'providerCreditsConsumed' AND (rate.provider_id<>'kie' OR rate.data->'nativeRules'->>'reportedCreditUsdPerCredit' IS NULL)) THEN RAISE EXCEPTION 'Foreign reported probe monetary evidence' USING ERRCODE='23514'; END IF;
    usage_value:=coalesce(p.provider_usage,'{}'::jsonb)||jsonb_build_object('requests',1);
    IF p.input_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('inputTokens',p.input_tokens); END IF;
    IF p.output_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('outputTokens',p.output_tokens); END IF;
    IF p.cache_read_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('cacheReadTokens',p.cache_read_tokens); END IF;
    IF p.cache_write_tokens IS NOT NULL THEN usage_value:=usage_value||jsonb_build_object('cacheWriteTokens',p.cache_write_tokens); END IF;
    native_result:=public.languon_evaluate_provider_price(rate.data,coalesce(p.provider_execution_facts,'{}'::jsonb)||jsonb_build_object('dispatchedAt',to_char(p.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),usage_value,'actual');
    IF native_result->>'status'='calculated' THEN expected_value:=(native_result->>'amountUsdMicros')::bigint; END IF;
    IF p.failure='budget_insufficient' AND p.input_tokens=0 AND p.output_tokens=0 THEN expected_value:=0; END IF;
  ELSIF p.measurement<>'unknown' AND p.input_tokens IS NOT NULL AND p.output_tokens IS NOT NULL
    AND coalesce(p.cache_read_tokens,0)+coalesce(p.cache_write_tokens,0)<=p.input_tokens
    AND (coalesce(p.cache_read_tokens,0)=0 OR rate.data->>'cacheReadUsdPerMillionTokens' IS NOT NULL)
    AND (coalesce(p.cache_write_tokens,0)=0 OR rate.data->>'cacheWriteUsdPerMillionTokens' IS NOT NULL) THEN
    numerator:=(p.input_tokens-coalesce(p.cache_read_tokens,0)-coalesce(p.cache_write_tokens,0))*(rate.data->>'inputUsdPerMillionTokens')::numeric
      +p.output_tokens*(rate.data->>'outputUsdPerMillionTokens')::numeric
      +coalesce(p.cache_read_tokens,0)*coalesce((rate.data->>'cacheReadUsdPerMillionTokens')::numeric,0)
      +coalesce(p.cache_write_tokens,0)*coalesce((rate.data->>'cacheWriteUsdPerMillionTokens')::numeric,0);
    expected_value:=CASE WHEN p.failure='budget_insufficient' AND p.input_tokens=0 AND p.output_tokens=0 THEN 0 ELSE greatest(ceil(numerator)::bigint,ceil(coalesce((rate.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint) END;
    IF expected_value>p.maximum_micros THEN expected_value:=NULL; END IF;
  END IF;
  IF p.cost_micros IS DISTINCT FROM expected_value THEN RAISE EXCEPTION 'Probe cost differs from authoritative meters' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('actionId',p.id,'attemptReference','admin-probe:'||p.id::text,'sourceKind','admin-probe','providerId',p.provider_id,'modelId',p.model_id,'measurement',CASE WHEN rate.data ? 'nativeRules' AND expected_value IS NOT NULL THEN 'measured' ELSE p.measurement END,'costSource',CASE WHEN p.cost_micros IS NULL THEN 'unknown' ELSE 'calculated' END,'amountUsdMicros',p.cost_micros::text,'occurredAt',p.started_at);
END $$;
REVOKE ALL ON FUNCTION languon_probe_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_probe_provider_expense(probe_value uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb; result_value uuid;
BEGIN
  e:=public.languon_probe_provider_expense_identity(probe_value);
  INSERT INTO public.ai_provider_expense_records(id,source_kind,action_id,attempt_reference,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
  VALUES(gen_random_uuid(),'admin-probe',probe_value,e->>'attemptReference',e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',(e->>'amountUsdMicros')::bigint,(e->>'occurredAt')::timestamptz)
  ON CONFLICT(attempt_reference) DO NOTHING;
  SELECT id INTO result_value FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
  PERFORM public.languon_mark_accounting_reports_dirty();
  RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION languon_record_probe_provider_expense(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_probe_fact() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Probe expense provenance is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL AND (to_jsonb(NEW)-'actor_id')=(to_jsonb(OLD)-'actor_id') AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.actor_id) THEN RETURN NEW; END IF;
  IF OLD.state<>'running' THEN
    RAISE EXCEPTION 'Completed probe facts are immutable' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['state','failure','cost_micros','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','measurement','elapsed_ms','first_output_ms','completed_at','evidence_expires_at','provider_usage','provider_execution_facts'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','failure','cost_micros','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','measurement','elapsed_ms','first_output_ms','completed_at','evidence_expires_at','provider_usage','provider_execution_facts']) THEN
    RAISE EXCEPTION 'Probe authorization cannot change at settlement' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS text_ai_probe_fact_guard ON public.text_ai_probes;
CREATE TRIGGER text_ai_probe_fact_guard BEFORE UPDATE OR DELETE ON public.text_ai_probes FOR EACH ROW EXECUTE FUNCTION languon_guard_probe_fact();

CREATE OR REPLACE FUNCTION languon_guard_probe_recovery() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL AND (to_jsonb(NEW)-'actor_id')=(to_jsonb(OLD)-'actor_id') AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.actor_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Probe recovery attestations are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS text_ai_probe_recovery_guard ON public.text_ai_probe_recoveries;
CREATE TRIGGER text_ai_probe_recovery_guard BEFORE UPDATE OR DELETE ON public.text_ai_probe_recoveries FOR EACH ROW EXECUTE FUNCTION languon_guard_probe_recovery();

-- Retaining incurred native expense never expands the reservation or publishes a passed probe.
-- The AFTER guard reads the just-persisted immutable pin and observations through the same
-- authoritative identity used by append-only expense records; callers cannot choose a cost.
CREATE OR REPLACE FUNCTION languon_guard_native_probe_overrun() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.cost_micros>NEW.maximum_micros THEN
  IF NEW.state<>'failed' OR NEW.completed_at IS NULL OR NOT coalesce(jsonb_typeof(NEW.price->'nativeRules')='object',false) THEN RAISE EXCEPTION 'Probe overrun requires failed native evidence' USING ERRCODE='23514'; END IF;
  PERFORM public.languon_probe_provider_expense_identity(NEW.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION languon_guard_native_probe_overrun() FROM PUBLIC;
DROP TRIGGER IF EXISTS text_ai_native_probe_overrun_guard ON public.text_ai_probes;
CREATE TRIGGER text_ai_native_probe_overrun_guard AFTER INSERT OR UPDATE ON public.text_ai_probes FOR EACH ROW EXECUTE FUNCTION languon_guard_native_probe_overrun();


--> statement-breakpoint
-- Source: apps/backend/src/modules/speech/infrastructure/speech-accounting-guards.sql
-- Speech keeps its success-only customer hold, but every new clip has independent USD authorization.
CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text; v jsonb;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.accounting_version,NEW.provider_price_snapshot,NEW.provider_character_count,NEW.provider_usage_bounds)
      IS DISTINCT FROM (OLD.accounting_version,OLD.provider_price_snapshot,OLD.provider_character_count,OLD.provider_usage_bounds) THEN
    RAISE EXCEPTION 'Speech provider accounting admission is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.provider_outcome IS NOT NULL AND NEW.provider_outcome IS DISTINCT FROM OLD.provider_outcome THEN
    RAISE EXCEPTION 'Speech provider outcome is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.provider_dispatched_at IS NOT NULL AND NEW.provider_dispatched_at IS DISTINCT FROM OLD.provider_dispatched_at THEN
    RAISE EXCEPTION 'Speech provider dispatch identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.provider_usage,NEW.provider_execution_facts) IS DISTINCT FROM (OLD.provider_usage,OLD.provider_execution_facts) THEN
    IF OLD.provider_usage IS NOT NULL OR OLD.provider_execution_facts IS NOT NULL OR OLD.provider_outcome IS NOT NULL THEN
      RAISE EXCEPTION 'Speech provider usage is an immutable first observation' USING ERRCODE='23514';
    END IF;
    IF current_setting('languon.speech_worker_version',true) IS DISTINCT FROM '1'
       OR NEW.provider_dispatched_at IS NULL OR NEW.state NOT IN ('submitting','processing','storing')
       OR NEW.lease_token IS NULL OR NEW.lease_expires_at IS NULL OR NEW.lease_expires_at<=clock_timestamp() THEN
      RAISE EXCEPTION 'Speech provider usage requires its live dispatched worker' USING ERRCODE='23514';
    END IF;
    IF NEW.provider_usage IS NULL OR jsonb_typeof(NEW.provider_usage)<>'object' OR NEW.provider_usage->>'requests' IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'Invalid speech provider usage' USING ERRCODE='23514';
    END IF;
    FOR k,v IN SELECT * FROM jsonb_each(NEW.provider_usage) LOOP
      IF k IN ('providerCreditsConsumed','providerCostUsd') THEN
        IF (k='providerCreditsConsumed' AND (NEW.provider_price_snapshot->>'providerId' IS DISTINCT FROM 'kie' OR NEW.provider_price_snapshot->'nativeRules'->>'reportedCreditUsdPerCredit' IS NULL))
           OR (k='providerCostUsd' AND (NEW.provider_price_snapshot->>'providerId' IS DISTINCT FROM 'openrouter' OR NOT (NEW.provider_price_snapshot ? 'nativeRules'))) THEN
          RAISE EXCEPTION 'Speech monetary evidence does not match its pinned provider contract' USING ERRCODE='23514';
        END IF;
        IF jsonb_typeof(v)<>'string' OR (v#>>'{}') !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,24})?$' THEN
          RAISE EXCEPTION 'Invalid speech provider monetary observation' USING ERRCODE='23514';
        END IF;
      ELSIF k IN ('inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','audioOutputTokens','characters','requests') THEN
        IF jsonb_typeof(v)<>'number' OR (v#>>'{}') !~ '^(0|[1-9][0-9]*)$' OR (v#>>'{}')::numeric>9007199254740991 THEN
          RAISE EXCEPTION 'Invalid speech provider usage quantity' USING ERRCODE='23514';
        END IF;
      ELSE
        RAISE EXCEPTION 'Unknown speech provider usage meter' USING ERRCODE='23514';
      END IF;
    END LOOP;
    IF NEW.provider_execution_facts IS NOT NULL THEN
      IF jsonb_typeof(NEW.provider_execution_facts)<>'object' THEN
        RAISE EXCEPTION 'Invalid speech execution observation' USING ERRCODE='23514';
      END IF;
      FOR k,v IN SELECT * FROM jsonb_each(NEW.provider_execution_facts) LOOP
        IF k NOT IN ('endpointId','serviceTier') OR jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 200 THEN
          RAISE EXCEPTION 'Untrusted speech execution identity' USING ERRCODE='23514';
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS speech_accounting_snapshot_guard ON speech_jobs;
CREATE TRIGGER speech_accounting_snapshot_guard BEFORE UPDATE ON speech_jobs FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_snapshot();

-- Column grants deny direct observation writes. Only this checked entry can write
-- first evidence; a caller-controlled session flag is never a lease credential.
CREATE OR REPLACE FUNCTION languon_retain_speech_provider_observation(job_value uuid,lease_value uuid,usage_value jsonb,execution_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NULL OR lease_value IS NULL OR j.lease_token IS DISTINCT FROM lease_value
    OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()
    OR j.provider_dispatched_at IS NULL OR j.state NOT IN ('submitting','processing','storing') THEN
   RAISE EXCEPTION 'Speech observation requires its expected live dispatch lease' USING ERRCODE='23514';
 END IF;
 IF j.provider_usage IS NOT NULL OR j.provider_execution_facts IS NOT NULL OR j.provider_outcome IS NOT NULL THEN
   IF j.provider_usage IS DISTINCT FROM usage_value OR j.provider_execution_facts IS DISTINCT FROM execution_value THEN
     RAISE EXCEPTION 'Speech observation conflicts with immutable first evidence' USING ERRCODE='23514';
   END IF;
   RETURN;
 END IF;
 PERFORM set_config('languon.speech_worker_version','1',true);
 UPDATE public.speech_jobs SET provider_usage=usage_value,provider_execution_facts=execution_value WHERE id=job_value;
END $$;
REVOKE ALL ON FUNCTION languon_retain_speech_provider_observation(uuid,uuid,jsonb,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_speech_accounting_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.speech_jobs WHERE id=NEW.id;
  IF NOT FOUND OR j.accounting_version<>1 THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id) THEN
    RAISE EXCEPTION 'Speech requires shared operator authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_operator_attempt_costs a WHERE a.action_id=j.id AND a.attempt_id=j.id) THEN
    RAISE EXCEPTION 'Speech dispatch requires provider attempt authorization' USING ERRCODE='23514';
  END IF;
  IF j.state IN ('ready','failed','submission_unknown') THEN
    IF NOT EXISTS(SELECT 1 FROM public.ai_operator_action_budgets b WHERE b.action_id=j.id AND b.state='settled') THEN
      RAISE EXCEPTION 'Terminal speech requires settled operator accounting' USING ERRCODE='23514';
    END IF;
    IF j.state IN ('submitting','processing','storing','submission_unknown','ready') AND j.provider_dispatched_at IS NULL THEN
    RAISE EXCEPTION 'Speech dispatch requires acknowledged accounting attempt' USING ERRCODE='23514';
  END IF;
  IF j.provider_dispatched_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_provider_expense_records e WHERE e.action_id=j.id AND e.attempt_reference='speech:'||j.id::text) THEN
      RAISE EXCEPTION 'Terminal speech requires a provider expense fact' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS speech_accounting_authority_guard ON speech_jobs;
CREATE CONSTRAINT TRIGGER speech_accounting_authority_guard AFTER INSERT OR UPDATE ON speech_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION languon_guard_speech_accounting_authority();

CREATE OR REPLACE FUNCTION languon_speech_provider_expense_identity(job_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; p public.ai_provider_price_revisions%ROWTYPE;
  amount_value bigint; native_value jsonb; measurement_value text;
BEGIN
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value;
 SELECT * INTO p FROM public.ai_provider_price_revisions WHERE id=(j.provider_price_snapshot->>'id')::uuid;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR j.provider_outcome IS NULL
    OR p.id IS NULL OR p.provider_id IS DISTINCT FROM j.provider_price_snapshot->>'providerId'
    OR p.model_id IS DISTINCT FROM j.provider_price_snapshot->>'modelId'
    OR p.meter NOT IN ('speech-characters','speech-tokens') OR p.meter IS DISTINCT FROM j.provider_price_snapshot->>'meter'
    OR p.version IS DISTINCT FROM (j.provider_price_snapshot->>'version')::integer OR p.effective_at>j.created_at
    OR p.data->'nativeRules' IS DISTINCT FROM j.provider_price_snapshot->'nativeRules'
    OR p.data->>'usdPer1000Characters' IS DISTINCT FROM j.provider_price_snapshot->>'usdPer1000Characters'
    OR p.data->>'minimumUsdPerRequest' IS DISTINCT FROM j.provider_price_snapshot->>'minimumUsdPerRequest' THEN
   RAISE EXCEPTION 'Speech expense requires its dispatched reviewed provenance' USING ERRCODE='23514';
 END IF;
 IF j.provider_outcome='not_submitted' THEN
   amount_value:=0;
   measurement_value:='measured';
 ELSIF p.data ? 'nativeRules' THEN
   IF (j.provider_usage ? 'providerCreditsConsumed' AND (p.provider_id<>'kie' OR p.data->'nativeRules'->>'reportedCreditUsdPerCredit' IS NULL))
      OR (j.provider_usage ? 'providerCostUsd' AND p.provider_id<>'openrouter') THEN
     RAISE EXCEPTION 'Speech monetary evidence does not match its pinned provider contract' USING ERRCODE='23514';
   END IF;
   IF j.provider_outcome='ready' OR j.provider_usage ? 'providerCreditsConsumed' OR j.provider_usage ? 'providerCostUsd' THEN
     native_value:=public.languon_evaluate_provider_price(
       p.data,
       coalesce(j.provider_execution_facts,'{}'::jsonb)||jsonb_build_object('dispatchedAt',j.provider_dispatched_at),
       coalesce(j.provider_usage,jsonb_build_object('requests',1)),
       'actual'
     );
     IF native_value->>'status'='calculated' THEN
       amount_value:=(native_value->>'amountUsdMicros')::bigint;
       measurement_value:=CASE WHEN p.meter='speech-tokens' OR native_value->>'costSource' IN ('reported-credits','reported-usd') THEN 'measured' ELSE 'estimated' END;
     END IF;
   END IF;
 ELSIF j.provider_outcome='ready' AND p.meter='speech-characters' THEN
   amount_value:=greatest(ceil(j.provider_character_count*(p.data->>'usdPer1000Characters')::numeric*1000)::bigint,ceil(coalesce((p.data->>'minimumUsdPerRequest')::numeric,0)*1000000)::bigint);
   measurement_value:='estimated';
 ELSIF j.provider_outcome<>'unknown' THEN
   RAISE EXCEPTION 'Unknown speech provider outcome' USING ERRCODE='23514';
 END IF;
 RETURN jsonb_build_object('sourceKind','speech-attempt','attemptReference','speech:'||j.id::text,'actionId',j.id,'providerId',p.provider_id,'modelId',p.model_id,
   'measurement',coalesce(measurement_value,'unknown'),'costSource',CASE WHEN amount_value IS NULL THEN 'unknown' ELSE 'calculated' END,
   'amountUsdMicros',amount_value::text,'occurredAt',j.provider_dispatched_at);
END $$;
REVOKE ALL ON FUNCTION languon_speech_provider_expense_identity(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_record_speech_provider_expense(job_value uuid,outcome_value text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE; e jsonb; f public.ai_provider_expense_records%ROWTYPE; o public.ai_operator_attempt_costs%ROWTYPE; b public.ai_operator_action_budgets%ROWTYPE; owner_value uuid; amount_value bigint;
BEGIN
 SELECT payer_id INTO owner_value FROM public.speech_jobs WHERE id=job_value;
 IF owner_value IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); END IF;
 PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO j FROM public.speech_jobs WHERE id=job_value FOR UPDATE;
 IF j.id IS NOT NULL AND j.accounting_version=1 AND j.provider_dispatched_at IS NULL AND outcome_value='not_submitted' AND (j.queue_deadline<=clock_timestamp() OR public.languon_operator_purge_authorized(j.payer_id)) THEN
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id AND state='active'; RETURN NULL;
 END IF;
 IF j.id IS NULL OR j.accounting_version<>1 OR j.provider_dispatched_at IS NULL OR outcome_value NOT IN ('ready','unknown','not_submitted') THEN RAISE EXCEPTION 'Unbound speech provider observation' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NOT NULL AND j.provider_outcome<>outcome_value THEN RAISE EXCEPTION 'Speech provider observation replay conflicts with first outcome' USING ERRCODE='23514'; END IF;
 IF j.provider_outcome IS NULL THEN
   IF j.payer_id IS NULL THEN RAISE EXCEPTION 'Erased speech cannot create new provider facts' USING ERRCODE='23514'; END IF;
   IF outcome_value='ready' AND (j.state<>'storing' OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND checksum IS NOT NULL AND byte_length>0)) THEN RAISE EXCEPTION 'Ready expense requires acknowledged synthesis output' USING ERRCODE='23514'; END IF;
   IF outcome_value='not_submitted' AND (j.state<>'submitting' OR j.task_id IS NOT NULL OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Zero speech expense requires a live unsubmitted operation' USING ERRCODE='23514'; END IF;
   IF outcome_value='unknown' AND j.state NOT IN ('submitting','processing','storing','submission_unknown','failed') THEN RAISE EXCEPTION 'Unknown speech expense requires dispatched work' USING ERRCODE='23514'; END IF;
   UPDATE public.speech_jobs SET provider_outcome=outcome_value WHERE id=job_value;
 END IF;
 e:=public.languon_speech_provider_expense_identity(job_value); amount_value:=(e->>'amountUsdMicros')::bigint;
 INSERT INTO public.ai_provider_expense_records(id,source_kind,attempt_reference,action_id,provider_id,model_id,measurement,cost_source,amount_usd_micros,occurred_at)
 VALUES(gen_random_uuid(),'speech-attempt',e->>'attemptReference',job_value,e->>'providerId',e->>'modelId',e->>'measurement',e->>'costSource',amount_value,(e->>'occurredAt')::timestamptz) ON CONFLICT(attempt_reference) DO NOTHING;
 SELECT * INTO f FROM public.ai_provider_expense_records WHERE attempt_reference=e->>'attemptReference';
 IF f.source_kind<>'speech-attempt' OR f.attempt_id IS NOT NULL OR f.action_id<>job_value OR f.provider_id IS DISTINCT FROM e->>'providerId' OR f.model_id IS DISTINCT FROM e->>'modelId' OR f.amount_usd_micros IS DISTINCT FROM amount_value OR f.measurement IS DISTINCT FROM e->>'measurement' OR f.cost_source IS DISTINCT FROM e->>'costSource' OR f.occurred_at IS DISTINCT FROM (e->>'occurredAt')::timestamptz THEN RAISE EXCEPTION 'Speech expense conflicts with authoritative fact' USING ERRCODE='23514'; END IF;
 SELECT * INTO b FROM public.ai_operator_action_budgets WHERE action_id=job_value FOR UPDATE;
 IF b.state='active' THEN
   SELECT * INTO o FROM public.ai_operator_attempt_costs WHERE attempt_id=job_value AND action_id=job_value FOR UPDATE;
   IF o.attempt_id IS NULL OR (amount_value IS NOT NULL AND amount_value>o.reserved_micros AND NOT (j.provider_price_snapshot ? 'nativeRules')) THEN RAISE EXCEPTION 'Speech observation exceeds provider authorization' USING ERRCODE='23514'; END IF;
   IF o.settled_at IS NULL THEN UPDATE public.ai_operator_attempt_costs SET consumed_micros=coalesce(amount_value,reserved_micros),measurement=CASE WHEN amount_value IS NULL THEN 'conservative' ELSE 'measured' END,settled_at=clock_timestamp() WHERE attempt_id=job_value;
   ELSIF o.consumed_micros IS DISTINCT FROM coalesce(amount_value,o.reserved_micros) THEN RAISE EXCEPTION 'Speech operator amount conflicts with provider fact' USING ERRCODE='23514'; END IF;
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=(SELECT coalesce(sum(consumed_micros),0) FROM public.ai_operator_attempt_costs WHERE action_id=job_value),settled_at=clock_timestamp() WHERE action_id=job_value;
 END IF;
 PERFORM public.languon_mark_accounting_reports_dirty();
 RETURN f.id;
END $$;
REVOKE ALL ON FUNCTION languon_record_speech_provider_expense(uuid,text) FROM PUBLIC;

-- Retired owner-only entry is never an unfenced privilege escalation.
CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Speech purge requires its expected worker and fencing token' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_finalize_speech_accounting_for_purge(owner_id_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_id_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended('actor:'||owner_id_value::text,1920424383));
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 FOR j IN SELECT s.* FROM public.speech_jobs s JOIN public.ai_operator_action_budgets b ON b.action_id=s.id WHERE s.payer_id=owner_id_value AND s.accounting_version=1 AND b.state='active' ORDER BY s.id FOR UPDATE OF s LOOP
   IF j.provider_dispatched_at IS NOT NULL THEN PERFORM public.languon_record_speech_provider_expense(j.id,coalesce(j.provider_outcome,'unknown'));
   ELSE UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id; END IF;
 END LOOP;
 PERFORM set_config('languon.speech_worker_version','1',true);
 WITH cancelled AS (UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=null,lease_expires_at=null WHERE payer_id=owner_id_value AND state='queued' RETURNING recording_id)
 UPDATE public.speech_recordings r SET state='deleting',text='',version=version+1 WHERE r.state='pending' AND EXISTS(SELECT 1 FROM cancelled c WHERE c.recording_id=r.id);
 FOR j IN SELECT s.* FROM public.speech_jobs s WHERE s.payer_id=owner_id_value ORDER BY s.id FOR UPDATE LOOP
   IF j.reservation_id IS NOT NULL AND j.billing_state='reserved' THEN PERFORM public.languon_settle_speech_customer(j.reservation_id,'failure'); END IF;
   UPDATE public.speech_jobs SET payer_id=NULL,reservation_id=NULL,billing_state=CASE WHEN billing_state='reserved' THEN 'released_no_charge' ELSE billing_state END WHERE id=j.id;
 END LOOP;
 DELETE FROM public.speech_quotes WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_bindings WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_daily_admission_counters WHERE scope='owner:'||owner_id_value::text;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_finalize_speech_accounting_for_purge(uuid,text,integer) FROM PUBLIC;

-- API scheduling cancellation precedes the due purge lease. Dispatch remains
-- admitted: leave its owner, usage and USD authorization for the normal worker.
CREATE OR REPLACE FUNCTION languon_cancel_speech_for_scheduled_deletion(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE j public.speech_jobs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,76021941));
 PERFORM 1 FROM public.users u JOIN public.account_deletion_requests d ON d.user_id=u.id WHERE u.id=owner_id_value AND u.status='deletion_pending' AND d.state='pending' AND d.scheduled_at<=clock_timestamp() FOR UPDATE OF u,d;
 IF NOT FOUND THEN RAISE EXCEPTION 'Speech scheduling cancellation requires its newly scheduled inactive account' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('actor:'||owner_id_value::text,1920424383));
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 PERFORM set_config('languon.speech_worker_version','1',true);
 FOR j IN SELECT * FROM public.speech_jobs WHERE payer_id=owner_id_value AND state='queued' AND provider_dispatched_at IS NULL ORDER BY id FOR UPDATE LOOP
   UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=0,settled_at=clock_timestamp() WHERE action_id=j.id AND state='active';
   UPDATE public.speech_jobs SET state='failed',error='speech_source_unavailable',lease_token=NULL,lease_expires_at=NULL WHERE id=j.id;
   UPDATE public.speech_recordings SET state='deleting',text='',version=version+1 WHERE id=j.recording_id AND state='pending';
   IF j.reservation_id IS NOT NULL AND j.billing_state='reserved' THEN PERFORM public.languon_settle_speech_customer(j.reservation_id,'failure'); END IF;
   UPDATE public.speech_jobs SET payer_id=NULL,reservation_id=NULL,billing_state=CASE WHEN billing_state='reserved' THEN 'released_no_charge' ELSE billing_state END WHERE id=j.id;
 END LOOP;
 DELETE FROM public.speech_quotes WHERE actor_id=owner_id_value;
 DELETE FROM public.speech_bindings WHERE actor_id=owner_id_value;
 PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_cancel_speech_for_scheduled_deletion(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_settle_speech_customer(reservation_value uuid,outcome_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.ai_credit_reservations%ROWTYPE; j public.speech_jobs%ROWTYPE; owner_value uuid; charged bigint:=0; released bigint; measurement_value public.ai_credit_measurement; now_value timestamptz:=clock_timestamp();
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_reservations WHERE id=reservation_value AND job_kind='speech-generation';
 IF owner_value IS NULL THEN RAISE EXCEPTION 'Speech billing requires its owned reservation' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381)); PERFORM pg_advisory_xact_lock(1920424395);
 SELECT * INTO r FROM public.ai_credit_reservations WHERE id=reservation_value FOR UPDATE;
 SELECT * INTO j FROM public.speech_jobs WHERE id=r.job_id AND payer_id=r.owner_id AND reservation_id=r.id FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Speech billing has no authoritative job' USING ERRCODE='23514'; END IF;
 IF r.state='settled' THEN RETURN jsonb_build_object('chargedCredits',r.charged_credits::text,'releasedCredits',(r.reserved_credits-r.charged_credits)::text,'measurement',r.measurement); END IF;
 IF r.state<>'active' THEN RAISE EXCEPTION 'Speech billing reservation is not active' USING ERRCODE='23514'; END IF;
 IF outcome_value='success' THEN
   IF NOT EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND state='ready' AND ready_at IS NOT NULL) THEN RAISE EXCEPTION 'Speech billing requires published output' USING ERRCODE='23514'; END IF;
   IF r.policy_mode='limited' AND EXISTS(SELECT 1 FROM public.users WHERE id=owner_value AND status='active') AND now_value<j.billing_deadline AND EXISTS(SELECT 1 FROM public.speech_recordings WHERE id=j.recording_id AND ready_at<j.billing_deadline) THEN charged:=r.reserved_credits; END IF;
 ELSIF outcome_value='deadline' THEN
   IF NOT(now_value>=j.billing_deadline OR (j.state='queued' AND now_value>=j.queue_deadline)) THEN RAISE EXCEPTION 'Speech deadline has not expired' USING ERRCODE='23514'; END IF;
 ELSIF outcome_value='failure' THEN
   IF j.state<>'failed' AND NOT public.languon_operator_purge_authorized(owner_value) THEN RAISE EXCEPTION 'Speech release requires durable failure or checked purge' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Unknown speech billing outcome' USING ERRCODE='23514'; END IF;
 measurement_value:=CASE WHEN charged>0 THEN 'speech_success'::public.ai_credit_measurement ELSE 'speech_no_charge'::public.ai_credit_measurement END;
 IF charged>0 THEN UPDATE public.ai_credit_reservation_allocations SET settled_credits=allocated_credits WHERE reservation_id=r.id; END IF;
 UPDATE public.ai_credit_reservations SET state='settled',charged_credits=charged,measured_credits=NULL,measurement=measurement_value,settled_at=now_value WHERE id=r.id;
 INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,measurement,created_at) VALUES(gen_random_uuid(),owner_value,'settlement',-charged,measurement_value,now_value);
 released:=r.reserved_credits-charged;
 IF released>0 THEN INSERT INTO public.ai_credit_history(id,owner_id,kind,amount,created_at) VALUES(gen_random_uuid(),owner_value,'release',released,now_value); END IF;
 RETURN jsonb_build_object('chargedCredits',charged::text,'releasedCredits',released::text,'measurement',measurement_value);
END $$;
REVOKE ALL ON FUNCTION languon_settle_speech_customer(uuid,text) FROM PUBLIC;


--> statement-breakpoint
-- Source: apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/operator-native-overrun-guards.sql
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
 SELECT coalesce(sum((input_tokens-coalesce(cache_read_tokens,0))*(a.tariff->>'inputCreditsPerMillionTokens')::numeric+coalesce(cache_read_tokens,0)*coalesce((a.tariff->>'cachedInputCreditsPerMillionTokens')::numeric,(a.tariff->>'inputCreditsPerMillionTokens')::numeric)+output_tokens*(a.tariff->>'outputCreditsPerMillionTokens')::numeric),0)*1000 INTO numerator FROM public.ai_credit_action_attempts WHERE action_id=action_value AND purpose='answer' AND successful=1 AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND outcome_value<>'failure' AND (
   NOT EXISTS(SELECT 1 FROM public.sentence_preparation_actions WHERE action_id=action_value) OR EXISTS(
     SELECT 1 FROM public.sentence_ai_jobs j JOIN public.sentence_preparation_children c ON c.job_id=j.id
       JOIN public.sentence_preparation_actions m ON m.preparation_id=c.preparation_id AND m.action_id=action_value
     WHERE j.id=ai_credit_action_attempts.execution_job_id AND j.selected_execution_snapshot->>'actionParentId'=action_value::text
       AND ((j.execution_state='completed' AND j.result_exercise_id IS NOT NULL)
         OR (outcome_value='stopped' AND j.execution_state='cancelled' AND j.cancellation_requested_at IS NOT NULL AND j.failure_category='explicit_stop'))
   ));
 charge_value:=CASE WHEN a.funding='customer' THEN least(a.held_milli,ceil(numerator/1000000)::bigint) ELSE 0 END;
 remaining:=charge_value;
 FOR lot IN SELECT * FROM public.ai_credit_action_allocations WHERE action_id=action_value ORDER BY grant_id FOR UPDATE LOOP
  consumed:=least(remaining,lot.allocated_milli); UPDATE public.ai_credit_action_allocations SET settled_milli=consumed WHERE action_id=action_value AND grant_id=lot.grant_id; remaining:=remaining-consumed;
 END LOOP;
 IF remaining<>0 THEN RAISE EXCEPTION 'Action hold allocations are inconsistent' USING ERRCODE='23514'; END IF;
 UPDATE public.ai_operator_attempt_costs SET consumed_micros=reserved_micros,measurement='conservative',settled_at=clock_timestamp() WHERE action_id=action_value AND settled_at IS NULL;
 UPDATE public.ai_operator_action_budgets SET state='settled',consumed_micros=coalesce((SELECT sum(coalesce(consumed_micros,reserved_micros)) FROM public.ai_operator_attempt_costs WHERE action_id=action_value),0),settled_at=clock_timestamp() WHERE action_id=action_value AND state='active';
 SELECT CASE WHEN bool_and(input_tokens IS NOT NULL AND output_tokens IS NOT NULL) IS DISTINCT FROM false THEN 'measured' ELSE 'unknown' END INTO measurement_value FROM public.ai_credit_action_attempts WHERE action_id=action_value;
 UPDATE public.ai_credit_actions SET state='settled',outcome=outcome_value,charged_milli=charge_value,measurement=measurement_value,settled_at=settled_value WHERE id=action_value;
 INSERT INTO public.ai_credit_history(id,owner_id,amount,kind,measurement,created_at) VALUES(gen_random_uuid(),owner_value,-charge_value,'settlement',CASE WHEN charge_value>0 THEN 'provider_reported'::public.ai_credit_measurement ELSE NULL END,settled_value);
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
