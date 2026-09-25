-- Custom SQL migration file, put your code below! --
CREATE FUNCTION "enforce_ai_credit_worker_capability"() RETURNS trigger AS $$
BEGIN
	IF OLD."ai_credit_accounted" = true
		AND NEW."execution_state" IS DISTINCT FROM OLD."execution_state"
		AND current_setting('languon.ai_credit_settlement_revision', true) IS DISTINCT FROM '1'
	THEN
		RAISE EXCEPTION 'AI-credit-accounted job requires settlement capability revision 1'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "ai_credit_worker_capability"
BEFORE UPDATE OF "execution_state" ON "dictionary_generation_jobs"
FOR EACH ROW EXECUTE FUNCTION "enforce_ai_credit_worker_capability"();
