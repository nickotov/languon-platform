-- Minimal authority for the dedicated purge role: no SELECT privilege on cash-record JSON.
-- Application coordinator already validates its lease/fence and holds request/user locks.
CREATE OR REPLACE FUNCTION languon_anonymize_accounting_owner(owner_id_value uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT public.languon_operator_purge_authorized(owner_id_value) THEN RAISE EXCEPTION 'Accounting anonymization requires a checked deletion claim' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,76021941));
  PERFORM 1 FROM public.users u JOIN public.account_deletion_requests r ON r.user_id=u.id
    WHERE u.id=owner_id_value AND u.status='deletion_pending' AND r.state='running'
      AND r.purge_at<=clock_timestamp() AND r.lease_deadline>clock_timestamp()
    FOR UPDATE OF r,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting purge requires an active due deletion lease' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id_value::text,1920424381));
  PERFORM set_config('languon.ai_credit_purge_owner',owner_id_value::text,true);
  IF EXISTS(SELECT 1 FROM public.ai_operator_action_budgets WHERE owner_id=owner_id_value AND state<>'settled') THEN
    RAISE EXCEPTION 'Operator work is not quiescent for account purge' USING ERRCODE='23514';
  END IF;
  UPDATE public.ai_operator_action_budgets SET owner_id=null WHERE owner_id=owner_id_value;
  DELETE FROM public.ai_operator_daily_budgets WHERE scope='owner:'||owner_id_value::text;
  insert into public.ai_accounting_retired_purchase_lots(payment_id,retired_at,issued_milli) select p.id,clock_timestamp(),g.amount from public.ai_accounting_records p join public.ai_credit_grants g on g.id=p.grant_id where p.kind='payment' and p.owner_id=owner_id_value on conflict do nothing;
  with purchase_allocations as (select x.grant_id, x.allocated_credits, x.settled_credits, q.created_at, q.settled_at, q.state::text as state from public.ai_credit_reservation_allocations x join public.ai_credit_reservations q on q.id=x.reservation_id union all select x.grant_id, x.allocated_milli as allocated_credits, x.settled_milli as settled_credits, q.created_at, q.settled_at, q.state from public.ai_credit_action_allocations x join public.ai_credit_actions q on q.id=x.action_id), grouped as (select p.id payment_id,a.settled_at occurred_at,sum(a.settled_credits) credits,p.amount_usd_micros,g.amount issued from public.ai_accounting_records p join public.ai_credit_grants g on g.id=p.grant_id join purchase_allocations a on a.grant_id=g.id where p.owner_id=owner_id_value and a.settled_at is not null and a.settled_credits>0 group by p.id,a.settled_at,p.amount_usd_micros,g.amount), cumulative as (select *,sum(credits) over(partition by payment_id order by occurred_at) running from grouped) insert into public.ai_accounting_archived_purchase_movements(payment_id,occurred_at,kind,credits_milli,allocated_usd_micros) select payment_id,occurred_at,'consumed',credits,trunc(amount_usd_micros::numeric*running/issued)-trunc(amount_usd_micros::numeric*(running-credits)/issued) from cumulative on conflict do nothing;
  insert into public.ai_accounting_archived_purchase_movements(payment_id,occurred_at,kind,credits_milli,allocated_usd_micros) select p.id,r.created_at,'removed',sum(a.allocated_credits),0 from public.ai_accounting_records p join public.ai_credit_admin_removal_allocations a on a.grant_id=p.grant_id join public.ai_credit_admin_removals r on r.id=a.removal_id where p.owner_id=owner_id_value group by p.id,r.created_at on conflict do nothing;
  update public.ai_accounting_records set owner_id=null, data=(data || jsonb_build_object('reference','redacted','reason','Account removed')) || case when kind='payment' then jsonb_build_object('ownerId','00000000-0000-0000-0000-000000000000') else '{}'::jsonb end where owner_id=owner_id_value;
  UPDATE public.ai_accounting_records SET created_by=null WHERE created_by=owner_id_value;
  UPDATE public.ai_provider_price_revisions SET created_by=null WHERE created_by=owner_id_value;
  PERFORM public.languon_mark_accounting_reports_dirty();
END $$;
REVOKE ALL ON FUNCTION languon_anonymize_accounting_owner(uuid) FROM PUBLIC;
