// Static SQL shared by production inspection and a read-only CTE verification.
// Probe expenses are a separate authority; MCP checks may also have operator
// reservations, which are deliberately counted twice rather than omitted.
export const exposureSql = `select (
    coalesce((select sum(case when a.state='active' then a.reserved_micros +
        coalesce((select sum(greatest(t.consumed_micros-t.reserved_micros,0))
            from ai_operator_attempt_costs t where t.action_id=a.action_id),0)
        else a.consumed_micros end)
        from ai_operator_action_budgets a where a.day=$1),0)
    + coalesce((select sum(coalesce(p.cost_micros,p.maximum_micros))
        from text_ai_probes p where p.day=$1),0)
)::text as exposure`;

// No tables or data are mutated. CTEs shadow real tables for this one statement.
// Includes native overrun, a settled actual cost, a running and unknown probe,
// known probe cost, and previous-day rows that must not affect today's quota.
export const exposureFixtureSql = `with
ai_operator_action_budgets(action_id,day,state,reserved_micros,consumed_micros) as (values
    ('active','2026-10-31','active',100000::bigint,null::bigint),
    ('settled','2026-10-31','settled',100000::bigint,2000::bigint),
    ('old','2026-10-30','active',900000::bigint,null::bigint)),
ai_operator_attempt_costs(action_id,reserved_micros,consumed_micros) as (values
    ('active',20000::bigint,30000::bigint),('active',10000::bigint,null::bigint)),
text_ai_probes(day,maximum_micros,cost_micros) as (values
    ('2026-10-31',10000::bigint,1000::bigint),
    ('2026-10-31',10000::bigint,null::bigint),
    ('2026-10-31',20000::bigint,null::bigint),
    ('2026-10-31',10000::bigint,15000::bigint),
    ('2026-10-30',900000::bigint,null::bigint))
${exposureSql}`;
