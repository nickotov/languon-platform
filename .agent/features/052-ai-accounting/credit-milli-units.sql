-- Fresh development-ledger cutover: historical conversion is explicitly not required.
-- Stop API/workers before switching to the separately provisioned empty database.
-- Never silently reinterpret accepted whole-credit balances as milli-credits.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ai_credit_grants)
 OR EXISTS(SELECT 1 FROM ai_credit_history)
 OR EXISTS(SELECT 1 FROM ai_credit_reservations)
 OR EXISTS(SELECT 1 FROM ai_credit_admin_removals)
 OR EXISTS(SELECT 1 FROM dictionary_generation_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM sentence_ai_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM texts_ai_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM dictionary_text_selection_jobs WHERE execution_state IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM speech_jobs WHERE state IN ('queued','submitting','processing','storing','submission_unknown'))
 OR EXISTS(SELECT 1 FROM conversation_turns WHERE status IN ('queued','running'))
 OR EXISTS(SELECT 1 FROM learner_portrait_interview_operations WHERE state IN ('queued','running')) THEN
  RAISE EXCEPTION 'AI accounting requires a fresh empty development ledger and drained workers; preserve the old database and provision a new one before cutover' USING ERRCODE='55000';
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_conversation_credit_maximum(
    turn_id_value uuid, owner_id_value uuid, reservation_id_value uuid, ordinal_value integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    turn_record conversation_turns%ROWTYPE;
    call_record conversation_provider_calls%ROWTYPE;
    maximum_input bigint;
    maximum_output bigint;
    input_rate numeric;
    output_rate numeric;
    maximum_credits bigint;
BEGIN
    SELECT * INTO turn_record FROM conversation_turns WHERE id=turn_id_value;
    SELECT * INTO call_record FROM conversation_provider_calls
      WHERE turn_id=turn_id_value AND reservation_id=reservation_id_value AND ordinal=ordinal_value;
    IF turn_record.id IS NULL OR call_record.id IS NULL
       OR turn_record.owner_id IS DISTINCT FROM owner_id_value
       OR call_record.owner_id IS DISTINCT FROM owner_id_value
       OR ordinal_value NOT BETWEEN 1 AND 5
       OR (turn_record.execution#>>'{snapshot,modelId}') IS DISTINCT FROM 'deepseek-flash'
       OR (turn_record.execution#>>'{snapshot,creditPricing,revision}') IS DISTINCT FROM '1' THEN
       RAISE EXCEPTION 'Conversation credit reservation requires its pinned owned call' USING ERRCODE='23514';
    END IF;
    maximum_input := (turn_record.execution#>>'{snapshot,perCallMaxInputTokens}')::bigint;
    maximum_output := least((turn_record.execution#>>'{snapshot,perCallMaxOutputTokens}')::bigint,
      CASE WHEN call_record.purpose='actor' THEN 4096 ELSE 2048 END);
    input_rate := (turn_record.execution#>>'{snapshot,creditPricing,inputCreditsPerMillionTokens}')::numeric;
    output_rate := (turn_record.execution#>>'{snapshot,creditPricing,outputCreditsPerMillionTokens}')::numeric;
    IF maximum_input IS NULL OR maximum_input NOT BETWEEN 1 AND 262144
       OR maximum_output IS NULL OR maximum_output NOT BETWEEN 1 AND 4096
       OR input_rate IS NULL OR input_rate NOT BETWEEN 0 AND 1000000000
       OR output_rate IS NULL OR output_rate NOT BETWEEN 0 AND 1000000000
       OR call_record.reserved_input_tokens IS DISTINCT FROM maximum_input
       OR call_record.reserved_output_tokens NOT BETWEEN 1 AND maximum_output
       OR (call_record.purpose<>'actor' AND (ordinal_value=5 OR
           (SELECT count(*) FROM conversation_provider_calls WHERE turn_id=turn_id_value AND purpose<>'actor')>2)) THEN
       RAISE EXCEPTION 'Conversation call exceeds pinned token or memory bounds' USING ERRCODE='23514';
    END IF;
    maximum_credits := ceil((maximum_input * input_rate + call_record.reserved_output_tokens::bigint * output_rate)/1000.0)::bigint;
    IF maximum_credits NOT BETWEEN 1 AND 9007199254740991 THEN
       RAISE EXCEPTION 'Conversation call pricing is invalid' USING ERRCODE='23514';
    END IF;
    RETURN maximum_credits;
END; $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION languon_portrait_credit_maximum(
    operation_id_value uuid, owner_id_value uuid, reservation_id_value uuid, ordinal_value integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    operation_record learner_portrait_interview_operations%ROWTYPE;
    call_record learner_portrait_interview_provider_calls%ROWTYPE;
    maximum_input bigint;
    maximum_output bigint;
    input_rate numeric;
    output_rate numeric;
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
    IF operation_record.execution ? 'interviewOutputTokenLimit' THEN
        IF jsonb_typeof(operation_record.execution->'interviewOutputTokenLimit') IS DISTINCT FROM 'number'
           OR (operation_record.execution->>'interviewOutputTokenLimit') !~ '^[1-9][0-9]{0,3}$'
           OR (operation_record.execution->>'interviewOutputTokenLimit')::bigint NOT BETWEEN 1024 AND maximum_output THEN
            RAISE EXCEPTION 'Invalid pinned portrait request output bound' USING ERRCODE='23514';
        END IF;
        maximum_output := (operation_record.execution->>'interviewOutputTokenLimit')::bigint;
    END IF;
    input_rate := (operation_record.execution#>>'{snapshot,creditPricing,inputCreditsPerMillionTokens}')::numeric;
    output_rate := (operation_record.execution#>>'{snapshot,creditPricing,outputCreditsPerMillionTokens}')::numeric;
    IF maximum_input IS NULL OR maximum_input NOT BETWEEN 1 AND 262144
       OR maximum_output IS NULL OR maximum_output NOT BETWEEN 1 AND 4096
       OR input_rate IS NULL OR input_rate NOT BETWEEN 0 AND 1000000000
       OR output_rate IS NULL OR output_rate NOT BETWEEN 0 AND 1000000000
       OR call_record.reserved_input_tokens IS DISTINCT FROM maximum_input
       OR call_record.reserved_output_tokens NOT BETWEEN 1 AND maximum_output
       OR call_record.purpose<>'actor' THEN
       RAISE EXCEPTION 'Portrait call exceeds pinned token or memory bounds' USING ERRCODE='23514';
    END IF;
    maximum_credits := ceil((maximum_input * input_rate + call_record.reserved_output_tokens::bigint * output_rate)/1000.0)::bigint;
    IF maximum_credits NOT BETWEEN 1 AND 9007199254740991 THEN
       RAISE EXCEPTION 'Portrait call pricing is invalid' USING ERRCODE='23514';
    END IF;
    RETURN maximum_credits;
END; $$;
