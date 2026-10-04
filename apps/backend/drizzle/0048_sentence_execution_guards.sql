-- Sentence jobs pin learner input and selected execution at admission.
-- These compatibility markers are set only by code capable of learning execution,
-- shared capacity and typed credit settlement; they are not credential attestation.
CREATE FUNCTION enforce_sentence_execution_selection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.selected_execution_version IS DISTINCT FROM 1
       OR NEW.selected_execution_snapshot IS NULL
       OR jsonb_typeof(NEW.selected_execution_snapshot) <> 'object'
       OR NEW.execution_revision_id IS NULL THEN
        RAISE EXCEPTION 'Sentence selected execution is required' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND ROW(
        NEW.id, NEW.learner_id, NEW.dictionary_id, NEW.job_kind, NEW.format,
        NEW.operation_id, NEW.session_id, NEW.request_fingerprint, NEW.authority,
        NEW.direction, NEW.input_payload, NEW.selected_execution_version,
        NEW.selected_execution_snapshot, NEW.execution_revision_id, NEW.max_attempts,
        NEW.ai_credit_accounted, NEW.ai_credit_max_credits_per_attempt,
        NEW.ai_credit_input_credits_per_million_tokens,
        NEW.ai_credit_output_credits_per_million_tokens, NEW.ai_credit_pricing_revision,
        NEW.provider_input_cost_micros_per_million_tokens,
        NEW.provider_output_cost_micros_per_million_tokens,
        NEW.provider_max_cost_micros_per_attempt, NEW.provider_max_input_tokens_per_attempt,
        NEW.provider_max_output_tokens_per_attempt
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.learner_id, OLD.dictionary_id, OLD.job_kind, OLD.format,
        OLD.operation_id, OLD.session_id, OLD.request_fingerprint, OLD.authority,
        OLD.direction, OLD.input_payload, OLD.selected_execution_version,
        OLD.selected_execution_snapshot, OLD.execution_revision_id, OLD.max_attempts,
        OLD.ai_credit_accounted, OLD.ai_credit_max_credits_per_attempt,
        OLD.ai_credit_input_credits_per_million_tokens,
        OLD.ai_credit_output_credits_per_million_tokens, OLD.ai_credit_pricing_revision,
        OLD.provider_input_cost_micros_per_million_tokens,
        OLD.provider_output_cost_micros_per_million_tokens,
        OLD.provider_max_cost_micros_per_attempt, OLD.provider_max_input_tokens_per_attempt,
        OLD.provider_max_output_tokens_per_attempt
    ) THEN
        RAISE EXCEPTION 'Sentence admission is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW)->'reference_revealed')
        IS DISTINCT FROM (to_jsonb(OLD)->'reference_revealed') THEN
        RAISE EXCEPTION 'Sentence reference assistance is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' OR (
        NEW.execution_state = 'running' AND (
            OLD.execution_state <> 'running'
            OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
            OR NEW.fencing_token IS DISTINCT FROM OLD.fencing_token
        )
    ) THEN
        IF current_setting('languon.learning_execution_revision', true) IS DISTINCT FROM '1'
           OR current_setting('languon.text_ai_selection_revision', true) IS DISTINCT FROM '1'
           OR current_setting('languon.text_ai_capacity_revision', true) IS DISTINCT FROM '1'
           OR current_setting('languon.ai_credit_settlement_revision', true) IS DISTINCT FROM '1' THEN
            RAISE EXCEPTION 'Sentence-capable worker and admission required' USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sentence_execution_selection
BEFORE INSERT OR UPDATE ON sentence_ai_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_sentence_execution_selection();
--> statement-breakpoint
-- Typed jobs keep globally unique identities even after their private content is erased.
CREATE FUNCTION enforce_text_ai_job_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM dictionary_generation_provider_usage_archive WHERE id = NEW.id)
       OR EXISTS (SELECT 1 FROM ai_credit_reservations WHERE job_id = NEW.id)
       OR (TG_TABLE_NAME = 'sentence_ai_jobs' AND EXISTS (
           SELECT 1 FROM dictionary_generation_jobs WHERE id = NEW.id
       ))
       OR (TG_TABLE_NAME = 'dictionary_generation_jobs' AND EXISTS (
           SELECT 1 FROM sentence_ai_jobs WHERE id = NEW.id
       )) THEN
        RAISE EXCEPTION 'Text AI job identity collision' USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sentence_job_identity BEFORE INSERT ON sentence_ai_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_text_ai_job_identity();
--> statement-breakpoint
CREATE TRIGGER dictionary_text_ai_job_identity BEFORE INSERT ON dictionary_generation_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_text_ai_job_identity();
--> statement-breakpoint
CREATE FUNCTION prevent_active_sentence_provider_erasure() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.provider_reservation_state = 'active' THEN
        RAISE EXCEPTION 'Active sentence provider reservation prevents erasure' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sentence_active_provider_erasure BEFORE DELETE ON sentence_ai_jobs
FOR EACH ROW EXECUTE FUNCTION prevent_active_sentence_provider_erasure();
