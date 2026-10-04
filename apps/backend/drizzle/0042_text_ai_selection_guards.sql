-- Selected text execution is admission-pinned. Existing Auto/legacy rows remain compatible.
CREATE FUNCTION enforce_dictionary_text_ai_selection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.selected_execution_version IS NOT NULL OR NEW.selected_execution_snapshot IS NOT NULL THEN
        IF NEW.selected_execution_version IS DISTINCT FROM 1
            OR NEW.selected_execution_snapshot IS NULL
            OR NEW.execution_revision_id IS NULL
            OR jsonb_typeof(NEW.selected_execution_snapshot) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Invalid selected text AI execution snapshot' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.selected_execution_snapshot IS NOT NULL OR NEW.selected_execution_snapshot IS NOT NULL) AND (
        NEW.selected_execution_snapshot IS DISTINCT FROM OLD.selected_execution_snapshot
        OR NEW.selected_execution_version IS DISTINCT FROM OLD.selected_execution_version
        OR NEW.execution_revision_id IS DISTINCT FROM OLD.execution_revision_id
    ) THEN
        RAISE EXCEPTION 'Selected text AI execution is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.selected_execution_version = 1
        AND NEW.execution_state = 'running'
        AND OLD.execution_state IS DISTINCT FROM 'running'
        AND current_setting('languon.text_ai_selection_revision', true) IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'Selected text AI execution requires a capable worker' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER dictionary_text_ai_selection_guard
BEFORE INSERT OR UPDATE ON dictionary_generation_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_dictionary_text_ai_selection();
