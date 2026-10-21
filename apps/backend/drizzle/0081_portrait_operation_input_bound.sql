-- Reserve the immutable interview request bound, preserving full-model bounds for older operations.
CREATE OR REPLACE FUNCTION languon_portrait_credit_maximum(
    operation_id_value uuid, owner_id_value uuid, reservation_id_value uuid, ordinal_value integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    operation_record learner_portrait_interview_operations%ROWTYPE;
    call_record learner_portrait_interview_provider_calls%ROWTYPE;
    maximum_input bigint;
    maximum_output bigint;
    input_rate bigint;
    output_rate bigint;
    maximum_credits bigint;
BEGIN
    SELECT * INTO operation_record FROM learner_portrait_interview_operations WHERE id=operation_id_value;
    SELECT * INTO call_record FROM learner_portrait_interview_provider_calls
      WHERE operation_id=operation_id_value AND reservation_id=reservation_id_value AND ordinal=ordinal_value;
    IF operation_record.id IS NULL OR call_record.id IS NULL
       OR operation_record.owner_id IS DISTINCT FROM owner_id_value
       OR call_record.owner_id IS DISTINCT FROM owner_id_value
       OR ordinal_value NOT BETWEEN 1 AND 5
       OR (operation_record.execution#>>'{snapshot,modelId}') IS DISTINCT FROM 'deepseek-flash'
       OR (operation_record.execution#>>'{snapshot,creditPricing,revision}') IS DISTINCT FROM '1' THEN
       RAISE EXCEPTION 'Portrait credit reservation requires its pinned owned call' USING ERRCODE='23514';
    END IF;
    maximum_input := (operation_record.execution#>>'{snapshot,perCallMaxInputTokens}')::bigint;
    IF maximum_input IS NULL OR maximum_input NOT BETWEEN 1 AND 262144 THEN
        RAISE EXCEPTION 'Invalid pinned portrait model input bound' USING ERRCODE='23514';
    END IF;
    IF operation_record.execution ? 'interviewInputTokenLimit' THEN
        IF jsonb_typeof(operation_record.execution->'interviewInputTokenLimit') IS DISTINCT FROM 'number'
           OR (operation_record.execution->>'interviewInputTokenLimit') !~ '^[1-9][0-9]{0,5}$'
           OR (operation_record.execution->>'interviewInputTokenLimit')::bigint > maximum_input THEN
            RAISE EXCEPTION 'Invalid pinned portrait request input bound' USING ERRCODE='23514';
        END IF;
        maximum_input := (operation_record.execution->>'interviewInputTokenLimit')::bigint;
    END IF;
    maximum_output := least((operation_record.execution#>>'{snapshot,perCallMaxOutputTokens}')::bigint,
      CASE WHEN call_record.purpose='actor' THEN 4096 ELSE 2048 END);
    input_rate := (operation_record.execution#>>'{snapshot,creditPricing,inputCreditsPerMillionTokens}')::bigint;
    output_rate := (operation_record.execution#>>'{snapshot,creditPricing,outputCreditsPerMillionTokens}')::bigint;
    IF maximum_input IS NULL OR maximum_input NOT BETWEEN 1 AND 262144
       OR maximum_output IS NULL OR maximum_output NOT BETWEEN 1 AND 4096
       OR input_rate IS NULL OR input_rate NOT BETWEEN 0 AND 1000000000
       OR output_rate IS NULL OR output_rate NOT BETWEEN 0 AND 1000000000
       OR call_record.reserved_input_tokens IS DISTINCT FROM maximum_input
       OR call_record.reserved_output_tokens NOT BETWEEN 1 AND maximum_output
       OR call_record.purpose<>'actor' THEN
       RAISE EXCEPTION 'Portrait call exceeds pinned token or memory bounds' USING ERRCODE='23514';
    END IF;
    maximum_credits := ((maximum_input * input_rate + 999999) / 1000000)
      + ((call_record.reserved_output_tokens::bigint * output_rate + 999999) / 1000000);
    IF maximum_credits NOT BETWEEN 1 AND 9007199254740991 THEN
       RAISE EXCEPTION 'Portrait call pricing is invalid' USING ERRCODE='23514';
    END IF;
    RETURN maximum_credits;
END; $$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION languon_portrait_credit_maximum(uuid,uuid,uuid,integer) FROM PUBLIC;
