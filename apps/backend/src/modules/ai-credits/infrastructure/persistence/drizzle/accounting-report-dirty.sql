-- Installed after report snapshot version columns. Never invoke during admission.
-- Manual/expense adapters invoke this transactionally after their fact insert.
-- Wallet projection invokes it only for consumed/removal deltas, never hold/release.
CREATE OR REPLACE FUNCTION languon_mark_accounting_reports_dirty() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
  WITH locked AS MATERIALIZED (
    SELECT key FROM public.ai_accounting_report_snapshots ORDER BY key FOR UPDATE
  )
  UPDATE public.ai_accounting_report_snapshots target
  SET change_version=target.change_version+1
  FROM locked WHERE target.key=locked.key;
$$;

REVOKE ALL ON FUNCTION languon_mark_accounting_reports_dirty() FROM PUBLIC;
