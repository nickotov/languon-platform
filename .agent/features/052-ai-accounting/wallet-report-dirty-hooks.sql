-- Install after languon_mark_accounting_reports_dirty and its version columns.
-- Holds/releases never touch report snapshots or their global mutation locks.
-- Both legacy reservations and new action settlement update these same grants.
CREATE FUNCTION languon_ai_credit_mark_terminal_reports_dirty() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM languon_mark_accounting_reports_dirty();
    RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER ai_credit_grant_balances_report_dirty AFTER UPDATE ON ai_credit_grant_balances
FOR EACH ROW WHEN (OLD.consumed_credits IS DISTINCT FROM NEW.consumed_credits
    OR OLD.removed_credits IS DISTINCT FROM NEW.removed_credits)
EXECUTE FUNCTION languon_ai_credit_mark_terminal_reports_dirty();
