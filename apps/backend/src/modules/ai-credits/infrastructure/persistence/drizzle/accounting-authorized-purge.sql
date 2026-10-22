-- A mutable session GUC is context, never authorization. The checked entry point
-- fences the live deletion claim; restricted roles have no raw financial DELETE.
CREATE OR REPLACE FUNCTION languon_assert_accounting_purge_claim(owner_value uuid, worker_value text, fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,76021941));
  PERFORM 1 FROM public.account_deletion_requests d JOIN public.users u ON u.id=d.user_id
    WHERE d.user_id=owner_value AND u.status='deletion_pending' AND d.state='running'
      AND d.purge_at<=clock_timestamp() AND d.lease_deadline>clock_timestamp()
      AND d.lease_worker_id=worker_value AND d.fencing_token=fence_value AND fence_value>0
    FOR UPDATE OF d,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting purge requires its active due deletion worker and fence' USING ERRCODE='23514'; END IF;
  PERFORM set_config('languon.ai_credit_purge_owner',owner_value::text,true);
  PERFORM set_config('languon.ai_credit_purge_worker',worker_value,true);
  PERFORM set_config('languon.ai_credit_purge_fence',fence_value::text,true);
END $$;
REVOKE ALL ON FUNCTION languon_assert_accounting_purge_claim(uuid,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_operator_purge_authorized(owner_value uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(current_setting('languon.ai_credit_purge_owner',true)=owner_value::text AND EXISTS(
   SELECT 1 FROM public.users u JOIN public.account_deletion_requests d ON d.user_id=u.id WHERE u.id=owner_value
     AND u.status='deletion_pending' AND d.state='running' AND d.purge_at<=clock_timestamp() AND d.lease_deadline>clock_timestamp()
     AND d.lease_worker_id=current_setting('languon.ai_credit_purge_worker',true)
     AND d.fencing_token::text=current_setting('languon.ai_credit_purge_fence',true) AND d.fencing_token>0),false);
$$;
REVOKE ALL ON FUNCTION languon_operator_purge_authorized(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_immutable_owner_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' OR NOT public.languon_operator_purge_authorized(OLD.owner_id) THEN RAISE EXCEPTION 'Financial erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION languon_ai_credit_guard_allocation_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_value uuid;
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_grant_balances WHERE grant_id=OLD.grant_id;
 IF owner_value IS NULL OR NOT public.languon_operator_purge_authorized(owner_value) THEN RAISE EXCEPTION 'Allocation erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION ai_credit_action_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT public.languon_operator_purge_authorized(OLD.owner_id) THEN RAISE EXCEPTION 'Action erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION ai_credit_action_attempt_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_value uuid; context_value text:=current_setting('languon.ai_credit_purge_owner',true);
BEGIN
 SELECT owner_id INTO owner_value FROM public.ai_credit_actions WHERE id=OLD.action_id;
 IF context_value IS NULL OR context_value='' OR (owner_value IS NOT NULL AND owner_value::text<>context_value) OR NOT public.languon_operator_purge_authorized(context_value::uuid) THEN RAISE EXCEPTION 'Attempt erasure requires a checked live deletion claim' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION languon_purge_ai_credit_owner(owner_value uuid, worker_value text, fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_value::text,1920424381));
 PERFORM pg_advisory_xact_lock(1920424395);
 IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE owner_id=owner_value AND state<>'settled')
    OR EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE owner_id=owner_value AND state<>'settled')
    OR EXISTS(SELECT 1 FROM public.ai_credit_reservations WHERE owner_id=owner_value AND state='active') THEN RAISE EXCEPTION 'Financial erasure requires quiescent settled work' USING ERRCODE='23514'; END IF;
 PERFORM public.languon_anonymize_accounting_owner(owner_value);
 DELETE FROM public.ai_credit_action_quotes WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_actions WHERE owner_id=owner_value;
 DELETE FROM public.ai_action_charging_policies WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_history WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_admin_removals WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_reservations WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_grants WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_wallet_totals WHERE owner_id=owner_value;
 DELETE FROM public.ai_credit_accounts WHERE user_id=owner_value;
END $$;
REVOKE ALL ON FUNCTION languon_purge_ai_credit_owner(uuid,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION languon_guard_account_deletion_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.state='running' THEN
   IF OLD.state='running' AND NEW.fencing_token=OLD.fencing_token AND NEW.lease_worker_id=OLD.lease_worker_id THEN
     IF OLD.lease_deadline<=clock_timestamp() OR NEW.attempt_count<>OLD.attempt_count THEN RAISE EXCEPTION 'Expired deletion claim cannot renew without a new fence' USING ERRCODE='23514'; END IF;
   ELSE
     IF NOT((OLD.state='pending' AND OLD.next_attempt_at<=clock_timestamp()) OR (OLD.state='running' AND OLD.lease_deadline<=clock_timestamp()))
       OR OLD.purge_at>clock_timestamp() OR NEW.fencing_token<>OLD.fencing_token+1 OR NEW.attempt_count<>OLD.attempt_count+1 THEN RAISE EXCEPTION 'Deletion claim requires due work and the next fencing token' USING ERRCODE='23514'; END IF;
   END IF;
   PERFORM 1 FROM public.users WHERE id=OLD.user_id AND status='deletion_pending' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Deletion claim requires a scheduled account' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_claim_authority BEFORE UPDATE ON public.account_deletion_requests FOR EACH ROW EXECUTE FUNCTION languon_guard_account_deletion_claim();

CREATE OR REPLACE FUNCTION languon_complete_account_purge(owner_value uuid,worker_value text,fence_value integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.languon_assert_accounting_purge_claim(owner_value,worker_value,fence_value);
 IF EXISTS(SELECT 1 FROM public.ai_credit_actions WHERE owner_id=owner_value) OR EXISTS(SELECT 1 FROM public.ai_credit_grants WHERE owner_id=owner_value) OR EXISTS(SELECT 1 FROM public.ai_credit_accounts WHERE user_id=owner_value) OR EXISTS(SELECT 1 FROM public.speech_jobs WHERE payer_id=owner_value) THEN RAISE EXCEPTION 'Account purge completion requires financial and speech erasure' USING ERRCODE='23514'; END IF;
 UPDATE public.users SET handle=NULL,status='purged',updated_at=clock_timestamp(),version=version+1 WHERE id=owner_value;
 UPDATE public.account_deletion_requests SET state='complete',completed_at=clock_timestamp(),lease_deadline=NULL,lease_worker_id=NULL,updated_at=clock_timestamp() WHERE user_id=owner_value;
END $$;
REVOKE ALL ON FUNCTION languon_complete_account_purge(uuid,text,integer) FROM PUBLIC;
