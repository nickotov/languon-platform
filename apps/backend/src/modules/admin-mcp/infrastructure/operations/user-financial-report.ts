import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
    aiProviderExpenseRecordsTable as expenses,
    aiAccountingRecordsTable as payments,
} from '../../../ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { aiCreditHistoryTable as history } from '../../../ai-credits/infrastructure/persistence/drizzle/schema';
import { purchaseAllocations } from '../../../ai-credits/infrastructure/persistence/drizzle/accounting-persistence-support';
import { formatFixed } from '../../../ai-credits/domain/accounting';
import { AdminMcpError } from '../../domain/admin-mcp';
import type { AdminMcpDatabase } from '../persistence/drizzle/admin-mcp-persistence';
import {
    type adminMcpReadSchemas,
    reportRange,
} from '../../application/operation-schemas';

type Input = z.infer<(typeof adminMcpReadSchemas)['financial-reports.user']>;

/** Content-free, indexed owner lookup; bounded query time isolates administration from generation. */
export async function userFinancialReport(
    database: AdminMcpDatabase,
    input: Input,
) {
    const { from, to } = reportRange(input);
    return database.transaction(
        async (tx) => {
            await tx.execute(
                sql`select set_config('statement_timeout', '1500', true)`,
            );
            const user = await tx.execute(
                sql`select id from users where id=${input.userId}::uuid`,
            );
            if (!user[0])
                throw new AdminMcpError('not_found', 'User not found.');

            // A speech request has a payer; never attribute a shared cache hit to its later readers.
            const ownerExpense = sql`(${expenses.actionId} in (select id from ai_credit_actions where owner_id=${input.userId}::uuid) or (${expenses.sourceKind}='speech-attempt' and ${expenses.actionId} in (select id from speech_jobs where payer_id=${input.userId}::uuid)))`;
            const expenseWhere = and(
                ownerExpense,
                gte(expenses.occurredAt, from),
                lt(expenses.occurredAt, to),
            );
            const [cost] = await tx
                .select({
                    known: sql<string>`coalesce(sum(${expenses.amountUsdMicros}),0)::text`,
                    measured: sql<number>`count(*) filter(where ${expenses.amountUsdMicros} is not null and (${expenses.costSource}='provider_reported' or ${expenses.measurement}='measured'))::int`,
                    estimated: sql<number>`count(*) filter(where ${expenses.amountUsdMicros} is not null and ${expenses.costSource}<>'provider_reported' and ${expenses.measurement}<>'measured')::int`,
                    unknown: sql<number>`count(*) filter(where ${expenses.amountUsdMicros} is null)::int`,
                    total: sql<number>`count(*)::int`,
                })
                .from(expenses)
                .where(expenseWhere);
            const details = await tx
                .select({
                    id: expenses.id,
                    actionId: expenses.actionId,
                    providerId: expenses.providerId,
                    modelId: expenses.modelId,
                    measurement: expenses.measurement,
                    costSource: expenses.costSource,
                    amountUsdMicros: expenses.amountUsdMicros,
                    occurredAt: expenses.occurredAt,
                })
                .from(expenses)
                .where(expenseWhere)
                .orderBy(desc(expenses.occurredAt), desc(expenses.id))
                .limit(input.pageSize)
                .offset((input.page - 1) * input.pageSize);
            const cash = await tx
                .select({
                    kind: payments.kind,
                    amount: sql<string>`sum(${payments.amountUsdMicros})::text`,
                    fees: sql<string>`sum(${payments.feeUsdMicros})::text`,
                })
                .from(payments)
                .where(
                    and(
                        eq(payments.ownerId, input.userId),
                        gte(payments.occurredAt, from),
                        lt(payments.occurredAt, to),
                    ),
                )
                .groupBy(payments.kind);
            const credits = await tx
                .select({
                    kind: history.kind,
                    amount: sql<string>`sum(${history.amount})::text`,
                })
                .from(history)
                .where(
                    and(
                        eq(history.ownerId, input.userId),
                        gte(history.createdAt, from),
                        lt(history.createdAt, to),
                    ),
                )
                .groupBy(history.kind);

            // Same cumulative purchase-lot allocation as the accounting report. Grants have no payment and contribute no revenue.
            const allocated = await tx.execute(
                sql`with purchase_allocations as (${purchaseAllocations}) select coalesce(sum(trunc(p.amount_usd_micros::numeric * a.total_consumed / g.amount) - trunc(p.amount_usd_micros::numeric * (a.total_consumed-a.consumed) / g.amount)),0)::text as amount,coalesce(sum(greatest(0,coalesce(refunds.amount,0)-trunc(p.amount_usd_micros::numeric*(g.amount-a.total_consumed)/g.amount))),0)::text as refund_loss from ai_accounting_records p join ai_credit_grants g on g.id=p.grant_id cross join lateral(select coalesce(sum(x.settled_credits) filter(where x.settled_at>=${from.toISOString()}::timestamptz and x.settled_at<${to.toISOString()}::timestamptz),0) consumed,coalesce(sum(x.settled_credits) filter(where x.settled_at<${to.toISOString()}::timestamptz),0) total_consumed from purchase_allocations x where x.grant_id=g.id) a left join lateral(select sum(amount_usd_micros) amount from ai_accounting_records refund where refund.payment_id=p.id and refund.kind='refund' and refund.occurred_at<${to.toISOString()}::timestamptz) refunds on true where p.kind='payment' and p.owner_id=${input.userId}::uuid and p.occurred_at<${to.toISOString()}::timestamptz`,
            );
            const purchaseValue = BigInt(String(allocated[0]?.amount ?? '0'));
            const knownCost = BigInt(cost?.known ?? '0');
            const refundLoss = BigInt(String(allocated[0]?.refund_loss ?? '0'));
            const cashAmount = (kind: string) =>
                BigInt(cash.find((item) => item.kind === kind)?.amount ?? '0');
            const creditAmount = (kind: string) =>
                BigInt(
                    credits.find((item) => item.kind === kind)?.amount ?? '0',
                );
            const missing = await tx.execute(
                sql`select count(*)::int as total from ai_credit_action_attempts attempt join ai_credit_actions action on action.id=attempt.action_id where action.owner_id=${input.userId}::uuid and attempt.state='settled' and attempt.settled_at>=${from.toISOString()}::timestamptz and attempt.settled_at<${to.toISOString()}::timestamptz and not exists(select 1 from ai_provider_expense_records expense where expense.attempt_id=attempt.id) union all select count(*)::int as total from speech_jobs job where job.payer_id=${input.userId}::uuid and job.accounting_version=1 and job.state in ('ready','failed','submission_unknown') and job.provider_dispatched_at>=${from.toISOString()}::timestamptz and job.provider_dispatched_at<${to.toISOString()}::timestamptz and not exists(select 1 from ai_provider_expense_records expense where expense.attempt_reference='speech:'||job.id::text)`,
            );
            const unknownCount =
                (cost?.unknown ?? 0) +
                missing.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
            return {
                userId: input.userId,
                from: from.toISOString(),
                to: to.toISOString(),
                updatedAt: new Date().toISOString(),
                periodNote:
                    to.getTime() > Date.now()
                        ? 'Current UTC day is partial; totals include records available at the update timestamp.'
                        : null,
                cash: {
                    paymentsUsd: formatFixed(cashAmount('payment'), 6),
                    refundsUsd: formatFixed(cashAmount('refund'), 6),
                    feesUsd: formatFixed(
                        BigInt(
                            cash.find((item) => item.kind === 'payment')
                                ?.fees ?? '0',
                        ),
                        6,
                    ),
                },
                credits: {
                    charged: formatFixed(-creditAmount('settlement'), 3),
                    granted: formatFixed(creditAmount('grant'), 3),
                    revoked: formatFixed(-creditAmount('admin_removal'), 3),
                },
                usage: {
                    knownExpenseUsd: formatFixed(knownCost, 6),
                    measuredCount: cost?.measured ?? 0,
                    estimatedCount: cost?.estimated ?? 0,
                    unknownCount,
                    allocatedPurchaseValueUsd: formatFixed(purchaseValue, 6),
                    refundedConsumedValueUsd: formatFixed(refundLoss, 6),
                    attributableMarginUsd: formatFixed(
                        purchaseValue - knownCost - refundLoss,
                        6,
                    ),
                    complete: unknownCount === 0,
                    uncertainty:
                        'Known costs only; estimated costs remain estimates. Shared expenses and unallocated invoice adjustments are excluded from this attributable margin; recorded refunded-consumed purchase value is deducted.',
                },
                expenses: details.map(
                    ({ amountUsdMicros, occurredAt, ...detail }) => ({
                        ...detail,
                        amountUsd:
                            amountUsdMicros === null
                                ? null
                                : formatFixed(amountUsdMicros, 6),
                        occurredAt: occurredAt.toISOString(),
                    }),
                ),
                page: input.page,
                pageSize: input.pageSize,
                total: cost?.total ?? 0,
            };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
}
