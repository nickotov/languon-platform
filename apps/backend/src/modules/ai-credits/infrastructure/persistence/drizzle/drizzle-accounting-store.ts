import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
    AccountingRecord,
    AccountingRecordRequest,
    AccountingReport,
    AccountingRefundContext,
} from '@languon/contracts';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    AccountingCredits,
    AccountingStore,
    ProviderExpenseFact,
} from '../../../application/accounting-store';
import {
    AccountingConflictError,
    AccountingInvalidRecordError,
    AccountingReportPendingError,
    formatFixed,
    parseFixed,
} from '../../../domain/accounting';
import {
    aiAccountingRecordsTable as records,
    aiProviderExpenseRecordsTable as expenses,
    aiAccountingReportSnapshotsTable as snapshots,
} from './accounting-schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type RecordRow = typeof records.$inferSelect;
const usd = (value: bigint) => formatFixed(value, 6);
const dto = (row: RecordRow): AccountingRecord => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    grantId: row.grantId,
    data: row.data,
});
// Both existing capability attempts and newer whole-action holds retain purchase-lot attribution.
const purchaseAllocations = sql`select x.grant_id, x.allocated_credits, x.settled_credits, q.created_at, q.settled_at, q.state::text as state from ai_credit_reservation_allocations x join ai_credit_reservations q on q.id=x.reservation_id union all select x.grant_id, x.allocated_milli as allocated_credits, x.settled_milli as settled_credits, q.created_at, q.settled_at, q.state from ai_credit_action_allocations x join ai_credit_actions q on q.id=x.action_id`;
const canonical = (value: unknown): string =>
    JSON.stringify(value, Object.keys(value as object).sort());

export class DrizzleAccountingStore implements AccountingStore {
    constructor(
        private readonly database: Database,
        private readonly credits: (tx: Transaction) => AccountingCredits,
    ) {}

    async record(
        input: AccountingRecordRequest,
        actorId: string,
        at: Date,
    ): Promise<AccountingRecord> {
        return this.database.transaction(async (tx) => {
            // Global idempotency lock before any wallet effect; mismatched replays fail closed.
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${`accounting:${input.idempotencyKey}`}, 0))`,
            );
            const [existing] = await tx
                .select()
                .from(records)
                .where(eq(records.idempotencyKey, input.idempotencyKey));
            if (existing) {
                if (canonical(existing.data) !== canonical(input))
                    throw new AccountingConflictError(
                        'Idempotency key reused with different data.',
                    );
                return dto(existing);
            }
            const id = randomUUID();
            const amount = parseFixed(input.amountUsd, 6);
            let grantId: string | null = null;
            let ownerId: string | null = null;
            if (input.kind === 'payment') {
                const [owner] = await tx
                    .select({ id: usersTable.id })
                    .from(usersTable)
                    .where(
                        and(
                            eq(usersTable.id, input.ownerId),
                            eq(usersTable.status, 'active'),
                        ),
                    )
                    .for('share');
                if (!owner)
                    throw new AccountingInvalidRecordError(
                        'Payment credit recipient unavailable.',
                    );
                ownerId = input.ownerId;
                const issued = await this.credits(tx).issueGrant({
                    ownerId,
                    amount: parseFixed(input.credits, 3),
                    createdAt: at,
                    expiresAt: null,
                    source: 'purchase',
                    sourceReference: `payment:${id}`,
                });
                grantId = issued.grantId;
            }
            if (input.kind === 'refund') {
                // Serialize all refunds against the payment, including independent idempotency keys.
                const [payment] = await tx
                    .select()
                    .from(records)
                    .where(
                        and(
                            eq(records.id, input.paymentId),
                            eq(records.kind, 'payment'),
                        ),
                    )
                    .for('update');
                if (!payment)
                    throw new AccountingInvalidRecordError(
                        'Payment unavailable.',
                    );
                const [refunded] = await tx
                    .select({
                        total: sql<string>`coalesce(sum(${records.amountUsdMicros}), 0)::text`,
                    })
                    .from(records)
                    .where(eq(records.paymentId, payment.id));
                if (
                    BigInt(refunded?.total ?? '0') + amount >
                    payment.amountUsdMicros
                )
                    throw new AccountingInvalidRecordError(
                        'Refund exceeds payment.',
                    );
                ownerId = payment.ownerId;
                grantId = payment.grantId;
                const revoke = parseFixed(input.revokeAvailableCredits, 3);
                if (revoke > 0n && (!ownerId || !grantId))
                    throw new AccountingInvalidRecordError(
                        'Removed accounts allow cash-only refunds.',
                    );
                if (revoke > 0n && ownerId && grantId)
                    await this.credits(tx).revokePurchaseGrantAvailable({
                        ownerId,
                        grantId,
                        amount: revoke,
                        sourceReference: `refund:${id}`,
                        reason: input.reason,
                        at,
                    });
            }
            if (input.kind === 'provider_bill') {
                // Disallow overlapping invoice coverage; avoids counting the same reconciliation twice.
                await tx.execute(
                    sql`select pg_advisory_xact_lock(hashtextextended(${`accounting-bill:${input.providerId}`}, 0))`,
                );
                const overlaps = await tx.execute(
                    sql`select id from ${records} where kind = 'provider_bill' and provider_id = ${input.providerId} and (data->>'periodStart')::timestamptz < ${input.periodEnd}::timestamptz and (data->>'periodEnd')::timestamptz > ${input.periodStart}::timestamptz limit 1`,
                );
                if (overlaps.length)
                    throw new AccountingConflictError(
                        'Provider bill periods overlap.',
                    );
            }
            const [row] = await tx
                .insert(records)
                .values({
                    id,
                    idempotencyKey: input.idempotencyKey,
                    kind: input.kind,
                    providerId: 'providerId' in input ? input.providerId : null,
                    paymentId: input.kind === 'refund' ? input.paymentId : null,
                    ownerId,
                    grantId,
                    amountUsdMicros: amount,
                    feeUsdMicros:
                        input.kind === 'payment'
                            ? parseFixed(input.feeUsd, 6)
                            : 0n,
                    occurredAt: new Date(input.occurredAt),
                    createdAt: at,
                    createdBy: actorId,
                    data: input,
                })
                .returning();
            if (!row)
                throw new Error('Accounting insert did not return a record.');
            await markAccountingReportsDirty(tx);
            return dto(row);
        });
    }
    async refundContext(paymentId: string): Promise<AccountingRefundContext> {
        const result = await this.database.execute(
            sql`with purchase_allocations as (${purchaseAllocations}) select p.owner_id, p.grant_id, p.amount_usd_micros::text as paid, coalesce((select sum(amount_usd_micros) from ai_accounting_records where payment_id=p.id),0)::text as refunded, g.amount::text as issued, coalesce(a.reserved,0)::text as reserved, coalesce(a.consumed,0)::text as consumed, coalesce(r.revoked,0)::text as revoked from ai_accounting_records p left join ai_credit_grants g on g.id=p.grant_id left join lateral (select sum(case when x.state='active' then x.allocated_credits else 0 end) as reserved, sum(x.settled_credits) as consumed from purchase_allocations x where x.grant_id=g.id) a on true left join lateral (select sum(allocated_credits) as revoked from ai_credit_admin_removal_allocations where grant_id=g.id) r on true where p.id=${paymentId} and p.kind='payment'`,
        );
        const row = result[0];
        if (!row)
            throw new AccountingInvalidRecordError('Payment unavailable.');
        if (!row.owner_id || !row.grant_id)
            return {
                paymentId,
                ownerId: null,
                grantId: null,
                paidUsd: usd(BigInt(String(row.paid))),
                refundedUsd: usd(BigInt(String(row.refunded))),
                availableCredits: null,
                reservedCredits: null,
                consumedCredits: null,
                revokedCredits: null,
            };
        const reserved = BigInt(String(row.reserved));
        const consumed = BigInt(String(row.consumed));
        const revoked = BigInt(String(row.revoked));
        return {
            paymentId,
            ownerId: String(row.owner_id),
            grantId: String(row.grant_id),
            paidUsd: usd(BigInt(String(row.paid))),
            refundedUsd: usd(BigInt(String(row.refunded))),
            availableCredits: formatFixed(
                BigInt(String(row.issued)) - reserved - consumed - revoked,
                3,
            ),
            reservedCredits: formatFixed(reserved, 3),
            consumedCredits: formatFixed(consumed, 3),
            revokedCredits: formatFixed(revoked, 3),
        };
    }
    async list(input: { before?: Date; limit: number }) {
        return (
            await this.database
                .select()
                .from(records)
                .where(
                    input.before
                        ? lt(records.createdAt, input.before)
                        : undefined,
                )
                .orderBy(desc(records.createdAt), desc(records.id))
                .limit(input.limit)
        ).map(dto);
    }
    async report(from: Date, to: Date): Promise<AccountingReport> {
        const now = new Date();
        const key = `${from.toISOString()}/${to.toISOString()}`;
        const row = await this.database.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended('accounting-report-registration', 0))`,
            );
            // Inactive registrations expire; requests cannot create an unbounded work queue.
            await tx
                .delete(snapshots)
                .where(
                    lt(
                        snapshots.requestedAt,
                        new Date(now.getTime() - 3600000),
                    ),
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
                    throw new AccountingReportPendingError(
                        'Report queue is full.',
                    );
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
    async refreshNextReport(at = new Date()): Promise<boolean> {
        const claimed = await this.database.execute(
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
                await this.database
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
                await this.database
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
            const report = await this.computeReport(
                new Date(String(row.period_from)),
                new Date(String(row.period_to)),
            );
            await this.database
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
            await this.database
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

    private async computeReport(
        from: Date,
        to: Date,
    ): Promise<AccountingReport> {
        // A repeatable-read snapshot keeps independent cash/usage aggregates coherent. The durable materializer alone executes these aggregates.
        return this.database.transaction(
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
                    BigInt(
                        cashRows.find((row) => row.kind === kind)?.total ?? '0',
                    );
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
                        facts.find((fact) => fact.provider === providerId)
                            ?.cost ?? '0',
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
                            periodEnd: new Date(
                                row.data.periodEnd,
                            ).toISOString(),
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
                        balanceObservedAt:
                            latest?.occurredAt.toISOString() ?? null,
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
                    missing.reduce(
                        (sum, row) => sum + Number(row.total ?? 0),
                        0,
                    ),
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
}

/** Call in the owning settlement transaction, including failed and free provider attempts. */
export async function recordProviderExpense(
    tx: Transaction,
    fact: ProviderExpenseFact,
): Promise<void> {
    if (!fact.attemptId)
        throw new AccountingInvalidRecordError(
            'Provider expense requires its authoritative text attempt.',
        );
    const assertion = {
        ...fact,
        amountUsdMicros: fact.amountUsdMicros?.toString() ?? null,
        occurredAt: fact.occurredAt.toISOString(),
    };
    await tx.execute(
        sql`select languon_record_text_provider_expense(${fact.attemptId}::uuid, ${JSON.stringify(assertion)}::jsonb)`,
    );
}

/** Existing owner purge calls this in the same transaction before deleting the owner. */
export async function anonymizeAccountingOwner(
    tx: Transaction,
    ownerId: string,
): Promise<void> {
    await tx.execute(
        sql`select languon_anonymize_accounting_owner(${ownerId}::uuid)`,
    );
}

/** Terminal changes only; fixed lock order across <=64 registrations prevents deadlocks. */
export async function markAccountingReportsDirty(
    tx: Transaction,
): Promise<void> {
    await tx.execute(sql`select languon_mark_accounting_reports_dirty()`);
}
