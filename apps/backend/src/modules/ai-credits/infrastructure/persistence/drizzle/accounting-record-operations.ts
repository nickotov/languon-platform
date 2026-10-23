import type {
    AccountingRecord,
    AccountingRecordRequest,
    AccountingRefundContext,
} from '@languon/contracts';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AccountingConflictError,
    AccountingInvalidRecordError,
    formatFixed,
    parseFixed,
} from '../../../domain/accounting';
import {
    canonical,
    dto,
    markAccountingReportsDirty,
    purchaseAllocations,
    usd,
    type AccountingStoreContext,
} from './accounting-persistence-support';
import { aiAccountingRecordsTable as records } from './accounting-schema';

export async function record(
    persistence: AccountingStoreContext,
    input: AccountingRecordRequest,
    actorId: string,
    at: Date,
): Promise<AccountingRecord> {
    return persistence.database.transaction(async (tx) => {
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
            const issued = await persistence.credits(tx).issueGrant({
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
                throw new AccountingInvalidRecordError('Payment unavailable.');
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
                await persistence.credits(tx).revokePurchaseGrantAvailable({
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
                    input.kind === 'payment' ? parseFixed(input.feeUsd, 6) : 0n,
                occurredAt: new Date(input.occurredAt),
                createdAt: at,
                createdBy: actorId,
                data: input,
            })
            .returning();

        if (!row) throw new Error('Accounting insert did not return a record.');
        await markAccountingReportsDirty(tx);

        return dto(row);
    });
}

export async function refundContext(
    persistence: AccountingStoreContext,
    paymentId: string,
): Promise<AccountingRefundContext> {
    const result = await persistence.database.execute(
        sql`with purchase_allocations as (${purchaseAllocations}) select p.owner_id, p.grant_id, p.amount_usd_micros::text as paid, coalesce((select sum(amount_usd_micros) from ai_accounting_records where payment_id=p.id),0)::text as refunded, g.amount::text as issued, coalesce(a.reserved,0)::text as reserved, coalesce(a.consumed,0)::text as consumed, coalesce(r.revoked,0)::text as revoked from ai_accounting_records p left join ai_credit_grants g on g.id=p.grant_id left join lateral (select sum(case when x.state='active' then x.allocated_credits else 0 end) as reserved, sum(x.settled_credits) as consumed from purchase_allocations x where x.grant_id=g.id) a on true left join lateral (select sum(allocated_credits) as revoked from ai_credit_admin_removal_allocations where grant_id=g.id) r on true where p.id=${paymentId} and p.kind='payment'`,
    );
    const row = result[0];
    if (!row) throw new AccountingInvalidRecordError('Payment unavailable.');
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

export async function list(
    persistence: AccountingStoreContext,
    input: { before?: Date; limit: number },
) {
    return (
        await persistence.database
            .select()
            .from(records)
            .where(
                input.before ? lt(records.createdAt, input.before) : undefined,
            )
            .orderBy(desc(records.createdAt), desc(records.id))
            .limit(input.limit)
    ).map(dto);
}
