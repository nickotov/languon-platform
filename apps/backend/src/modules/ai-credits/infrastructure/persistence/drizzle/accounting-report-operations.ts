import type { AccountingReport } from '@languon/contracts';
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import { AccountingReportPendingError } from '../../../domain/accounting';
import {
    purchaseAllocations,
    usd,
    type AccountingStoreContext,
} from './accounting-persistence-support';
import {
    aiProviderExpenseRecordsTable as expenses,
    aiAccountingRecordsTable as records,
    aiAccountingReportSnapshotsTable as snapshots,
} from './accounting-schema';

export async function report(
    persistence: AccountingStoreContext,
    from: Date,
    to: Date,
): Promise<AccountingReport> {
    const now = new Date();
    const key = `${from.toISOString()}/${to.toISOString()}`;
    const row = await persistence.database.transaction(async (tx) => {
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended('accounting-report-registration', 0))`,
        );

        // Inactive registrations expire; requests cannot create an unbounded work queue.
        await tx
            .delete(snapshots)
            .where(
                lt(snapshots.requestedAt, new Date(now.getTime() - 3600000)),
            );

        const [existing] = await tx
            .select()
            .from(snapshots)
            .where(eq(snapshots.key, key));

        if (!existing) {
            const [count] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(snapshots);

            if ((count?.count ?? 0) >= 64)
                throw new AccountingReportPendingError('Report queue is full.');
        }

        const [saved] = await tx
            .insert(snapshots)
            .values({ key, from, to, requestedAt: now })
            .onConflictDoUpdate({
                target: snapshots.key,
                set: { requestedAt: now },
            })
            .returning();

        return saved;
    });

    if (
        !row?.report ||
        !row.generatedAt ||
        row.generatedAt.getTime() < now.getTime() - 60000
    )
        throw new AccountingReportPendingError('Report is being prepared.');

    return row.report;
}

/** Worker tick: bounded one report at a time; lease recovers safely after a process crash. */
export async function refreshNextReport(
    persistence: AccountingStoreContext,
    at = new Date(),
): Promise<boolean> {
    const claimed = await persistence.database.execute(
        sql`update ai_accounting_report_snapshots set lease_until=${new Date(at.getTime() + 120000).toISOString()} where key=(select key from ai_accounting_report_snapshots where requested_at > ${new Date(at.getTime() - 3600000).toISOString()} and (generated_at is null or generated_at < ${new Date(at.getTime() - 30000).toISOString()}) and (lease_until is null or lease_until < ${at.toISOString()}) order by generated_at asc nulls first, requested_at asc for update skip locked limit 1) returning key, period_from, period_to, change_version, computed_version, report`,
    );
    const row = claimed[0];
    if (!row) return false;
    const leaseUntil = new Date(at.getTime() + 120000);
    const changeVersion = BigInt(String(row.change_version));
    try {
        if (
            row.report &&
            changeVersion === BigInt(String(row.computed_version))
        ) {
            // Verify unchanged versions atomically; no history scan and no lost concurrent invalidation.
            await persistence.database
                .update(snapshots)
                .set({
                    generatedAt: at,
                    report: {
                        ...(row.report as AccountingReport),
                        generatedAt: at.toISOString(),
                    },
                    leaseUntil: null,
                })
                .where(
                    and(
                        eq(snapshots.key, String(row.key)),
                        eq(snapshots.changeVersion, changeVersion),
                        eq(snapshots.leaseUntil, leaseUntil),
                    ),
                );

            await persistence.database
                .update(snapshots)
                .set({ leaseUntil: null })
                .where(
                    and(
                        eq(snapshots.key, String(row.key)),
                        eq(snapshots.leaseUntil, leaseUntil),
                    ),
                );

            return true;
        }

        const report = await computeReport(
            persistence,
            new Date(String(row.period_from)),
            new Date(String(row.period_to)),
        );

        await persistence.database
            .update(snapshots)
            .set({
                report,
                generatedAt: new Date(report.generatedAt),
                leaseUntil: null,
                computedVersion: changeVersion,
            })
            .where(
                and(
                    eq(snapshots.key, String(row.key)),
                    eq(snapshots.leaseUntil, leaseUntil),
                ),
            );

        return true;
    } catch (error) {
        await persistence.database
            .update(snapshots)
            .set({ leaseUntil: new Date(at.getTime() + 5000) })
            .where(
                and(
                    eq(snapshots.key, String(row.key)),
                    eq(snapshots.leaseUntil, leaseUntil),
                ),
            );

        throw error;
    }
}

export async function computeReport(
    persistence: AccountingStoreContext,
    from: Date,
    to: Date,
): Promise<AccountingReport> {
    // A repeatable-read snapshot keeps independent cash/usage aggregates coherent. The durable materializer alone executes these aggregates.
    return persistence.database.transaction(
        async (tx) => {
            const snapshotAt = new Date();
            const deadline = snapshotAt.getTime() + 30000;
            const checkBudget = () => {
                if (Date.now() > deadline)
                    throw new AccountingReportPendingError(
                        'Report refresh exceeded its time budget.',
                    );
            };

            await tx.execute(
                sql`select set_config('statement_timeout', '15000', true)`,
            );

            const cashRows = await tx
                .select({
                    kind: records.kind,
                    total: sql<string>`sum(${records.amountUsdMicros})::text`,
                    fees: sql<string>`sum(${records.feeUsdMicros})::text`,
                })
                .from(records)
                .where(
                    and(
                        gte(records.occurredAt, from),
                        lt(records.occurredAt, to),
                    ),
                )
                .groupBy(records.kind);
            const amount = (kind: string) =>
                BigInt(cashRows.find((row) => row.kind === kind)?.total ?? '0');
            const fees = BigInt(
                cashRows.find((row) => row.kind === 'payment')?.fees ?? '0',
            );
            const facts = await tx
                .select({
                    provider: expenses.providerId,
                    cost: sql<string>`coalesce(sum(${expenses.amountUsdMicros}), 0)::text`,
                    measured: sql<number>`count(*) filter (where ${expenses.amountUsdMicros} is not null and (${expenses.costSource} = 'provider_reported' or ${expenses.measurement} = 'measured'))::int`,
                    estimated: sql<number>`count(*) filter (where ${expenses.amountUsdMicros} is not null and ${expenses.costSource} <> 'provider_reported' and ${expenses.measurement} <> 'measured')::int`,
                    unknown: sql<number>`count(*) filter (where ${expenses.amountUsdMicros} is null)::int`,
                })
                .from(expenses)
                .where(
                    and(
                        gte(expenses.occurredAt, from),
                        lt(expenses.occurredAt, to),
                    ),
                )
                .groupBy(expenses.providerId);
            const providerRows = await tx
                .select()
                .from(records)
                .where(
                    and(
                        sql`${records.providerId} is not null`,
                        or(
                            lt(records.occurredAt, to),
                            eq(records.kind, 'provider_bill'),
                        ),
                    ),
                )
                .orderBy(desc(records.occurredAt), desc(records.id));
            const providers: AccountingReport['providers'] = [];
            let adjustments = 0n;
            for (const providerId of new Set([
                ...facts.map((fact) => fact.provider),
                ...providerRows.map((row) => row.providerId!),
            ])) {
                checkBudget();
                const rows = providerRows.filter(
                    (row) => row.providerId === providerId,
                );
                const deposits = rows
                    .filter(
                        (row) =>
                            row.kind === 'provider_deposit' &&
                            row.occurredAt >= from,
                    )
                    .reduce((sum, row) => sum + row.amountUsdMicros, 0n);
                const latest = rows.find(
                    (row) => row.kind === 'provider_balance',
                );
                const cost = BigInt(
                    facts.find((fact) => fact.provider === providerId)?.cost ??
                        '0',
                );
                // Whole invoice periods only: never invent allocation of a period adjustment to individual days.
                const bills: AccountingReport['providers'][number]['bills'] =
                    [];

                for (const row of rows.filter(
                    (row) =>
                        row.data.kind === 'provider_bill' &&
                        new Date(row.data.periodStart) >= from &&
                        new Date(row.data.periodEnd) <= to,
                )) {
                    checkBudget();
                    if (row.data.kind !== 'provider_bill') continue;
                    const [period] = await tx
                        .select({
                            cost: sql<string>`coalesce(sum(${expenses.amountUsdMicros}), 0)::text`,
                            unknown: sql<number>`count(*) filter (where ${expenses.amountUsdMicros} is null)::int`,
                        })
                        .from(expenses)
                        .where(
                            and(
                                eq(expenses.providerId, providerId),
                                gte(
                                    expenses.occurredAt,
                                    new Date(row.data.periodStart),
                                ),
                                lt(
                                    expenses.occurredAt,
                                    new Date(row.data.periodEnd),
                                ),
                            ),
                        );
                    const calculated = BigInt(period?.cost ?? '0');
                    const adjustment = row.amountUsdMicros - calculated;
                    adjustments += adjustment;
                    bills.push({
                        id: row.id,
                        periodStart: new Date(
                            row.data.periodStart,
                        ).toISOString(),
                        periodEnd: new Date(row.data.periodEnd).toISOString(),
                        invoiceUsd: usd(row.amountUsdMicros),
                        calculatedExpenseUsd: usd(calculated),
                        unallocatedAdjustmentUsd: usd(adjustment),
                        unknownCount: period?.unknown ?? 0,
                    });
                }

                const [allExpense] = await tx
                    .select({
                        cost: sql<string>`coalesce(sum(${expenses.amountUsdMicros}), 0)::text`,
                    })
                    .from(expenses)
                    .where(
                        and(
                            eq(expenses.providerId, providerId),
                            lt(expenses.occurredAt, to),
                        ),
                    );

                checkBudget();
                const allAdjustments = await tx.execute(
                    sql`select coalesce(sum(b.amount_usd_micros - (select coalesce(sum(e.amount_usd_micros),0) from ai_provider_expense_records e where e.provider_id=b.provider_id and e.occurred_at >= (b.data->>'periodStart')::timestamptz and e.occurred_at < (b.data->>'periodEnd')::timestamptz)),0)::text as total from ai_accounting_records b where b.kind='provider_bill' and b.provider_id=${providerId} and (b.data->>'periodEnd')::timestamptz <= ${to.toISOString()}::timestamptz`,
                );
                const allDeposits = rows
                    .filter((row) => row.kind === 'provider_deposit')
                    .reduce((sum, row) => sum + row.amountUsdMicros, 0n);

                providers.push({
                    providerId,
                    depositsUsd: usd(deposits),
                    calculatedExpenseUsd: usd(cost),
                    latestBalanceUsd: latest
                        ? usd(latest.amountUsdMicros)
                        : null,
                    balanceObservedAt: latest?.occurredAt.toISOString() ?? null,
                    estimatedRemainingUsd: usd(
                        allDeposits -
                            BigInt(allExpense?.cost ?? '0') -
                            BigInt(String(allAdjustments[0]?.total ?? '0')),
                    ),
                    bills,
                });
            }

            checkBudget();
            const economics = await tx.execute(
                sql`with purchase_allocations as (${purchaseAllocations}) select coalesce(sum((trunc(p.amount_usd_micros::numeric * a.total_consumed / g.amount) - trunc(p.amount_usd_micros::numeric * (a.total_consumed - a.consumed) / g.amount))),0)::text as allocated, coalesce(sum(trunc(p.amount_usd_micros::numeric * a.available / g.amount)::numeric),0)::text as unused, coalesce(sum(greatest(0, coalesce(r.refunded,0) - trunc(p.amount_usd_micros::numeric * (g.amount - a.total_consumed) / g.amount))),0)::text as loss from ai_accounting_records p join ai_credit_grants g on g.id = p.grant_id cross join lateral (select coalesce(sum(x.settled_credits) filter(where x.settled_at >= ${from.toISOString()} and x.settled_at < ${to.toISOString()}),0) as consumed, coalesce(sum(x.settled_credits) filter(where x.settled_at < ${to.toISOString()}),0) as total_consumed, greatest(0,g.amount - coalesce(sum(x.settled_credits) filter(where x.settled_at < ${to.toISOString()}),0) - (select coalesce(sum(allocated_credits),0) from ai_credit_admin_removal_allocations ra join ai_credit_admin_removals rm on rm.id=ra.removal_id where ra.grant_id = g.id and rm.created_at < ${to.toISOString()})) as available from purchase_allocations x where x.grant_id=g.id and x.created_at < ${to.toISOString()}) a left join lateral (select sum(amount_usd_micros) as refunded from ai_accounting_records where payment_id=p.id and occurred_at < ${to.toISOString()}) r on true where p.kind='payment' and p.occurred_at < ${to.toISOString()} and not exists(select 1 from ai_accounting_retired_purchase_lots l where l.payment_id=p.id)`,
            );

            checkBudget();
            const archived = await tx.execute(
                sql`select coalesce(sum(a.allocated),0)::text as allocated, coalesce(sum(case when l.retired_at < ${to.toISOString()} then 0 else trunc(p.amount_usd_micros::numeric * greatest(0,l.issued_milli - a.consumed - a.removed) / l.issued_milli) end),0)::text as unused, coalesce(sum(greatest(0,coalesce(r.refunded,0) - trunc(p.amount_usd_micros::numeric * (l.issued_milli-a.consumed) / l.issued_milli))),0)::text as loss from ai_accounting_retired_purchase_lots l join ai_accounting_records p on p.id=l.payment_id cross join lateral (select coalesce(sum(m.allocated_usd_micros) filter(where m.kind='consumed' and m.occurred_at >= ${from.toISOString()} and m.occurred_at < ${to.toISOString()}),0) allocated, coalesce(sum(m.credits_milli) filter(where m.kind='consumed' and m.occurred_at < ${to.toISOString()}),0) consumed, coalesce(sum(m.credits_milli) filter(where m.kind='removed' and m.occurred_at < ${to.toISOString()}),0) removed from ai_accounting_archived_purchase_movements m where m.payment_id=l.payment_id) a left join lateral (select sum(amount_usd_micros) refunded from ai_accounting_records where payment_id=p.id and occurred_at < ${to.toISOString()}) r on true where p.occurred_at < ${to.toISOString()}`,
            );
            const first = economics[0];
            const archivedFirst = archived[0];
            const allocated =
                BigInt(String(first?.allocated ?? '0')) +
                BigInt(String(archivedFirst?.allocated ?? '0'));
            const loss =
                BigInt(String(first?.loss ?? '0')) +
                BigInt(String(archivedFirst?.loss ?? '0'));
            const calculated = facts.reduce(
                (sum, row) => sum + BigInt(row.cost),
                0n,
            );

            checkBudget();
            const missing = await tx.execute(
                sql`select count(*)::int as total from ai_credit_action_attempts a where a.state='settled' and a.settled_at >= ${from.toISOString()}::timestamptz and a.settled_at < ${to.toISOString()}::timestamptz and not exists(select 1 from ai_provider_expense_records e where e.attempt_id=a.id) union all select count(*)::int as total from speech_jobs j where j.accounting_version=1 and j.state in ('ready','failed','submission_unknown') and j.provider_dispatched_at >= ${from.toISOString()}::timestamptz and j.provider_dispatched_at < ${to.toISOString()}::timestamptz and not exists(select 1 from ai_provider_expense_records e where e.attempt_reference='speech:'||j.id::text)`,
            );
            const unknown = facts.reduce(
                (sum, row) => sum + row.unknown,
                missing.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
            );

            return {
                generatedAt: snapshotAt.toISOString(),
                from: from.toISOString(),
                to: to.toISOString(),
                cash: {
                    paymentsUsd: usd(amount('payment')),
                    refundsUsd: usd(amount('refund')),
                    feesUsd: usd(fees),
                    netReceiptsUsd: usd(
                        amount('payment') - amount('refund') - fees,
                    ),
                },
                usage: {
                    calculatedExpenseUsd: usd(calculated),
                    measuredCount: facts.reduce(
                        (sum, row) => sum + row.measured,
                        0,
                    ),
                    estimatedCount: facts.reduce(
                        (sum, row) => sum + row.estimated,
                        0,
                    ),
                    unknownCount: unknown,
                    allocatedPurchaseValueUsd: usd(allocated),
                    unusedPurchaseValueUsd: usd(
                        BigInt(String(first?.unused ?? '0')) +
                            BigInt(String(archivedFirst?.unused ?? '0')),
                    ),
                    refundedConsumedValueUsd: usd(loss),
                    manualUnallocatedAdjustmentUsd: usd(adjustments),
                    operationalMarginUsd: usd(
                        allocated - calculated - adjustments - loss,
                    ),
                    complete: unknown === 0,
                },
                providers,
            };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
}
