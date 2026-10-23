import { and, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
    AiCreditAccountSummary,
    AiCreditHistoryEntry,
    AiCreditJobKind,
} from '../../../application/ai-credit-participant';
import {
    AiCreditInvalidAmountError,
    AiCreditManagementConflictError,
    AiCreditReservationStateError,
    effectiveAiCreditPolicy,
    type AiCreditLot,
    type AiCreditMeasurement,
    type AiCreditPolicyMode,
} from '../../../domain/ai-credit';
import {
    aiCreditOwnerLockNamespace,
    type AiCreditContext,
} from './ai-credit-persistence-support';
import {
    aiCreditAccountsTable,
    aiCreditGrantBalancesTable,
    aiCreditGrantsTable,
    aiCreditHistoryTable,
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
    aiCreditWalletTotalsTable,
} from './schema';

export async function accountSummary(
    persistence: AiCreditContext,
    ownerId: string,
    at: Date,
) {
    await lockOwner(persistence, ownerId);

    return readSummary(persistence, ownerId, at);
}

export async function history(
    persistence: AiCreditContext,
    input: {
        ownerId: string;
        page: number;
        pageSize: number;
    },
): Promise<{ entries: AiCreditHistoryEntry[]; total: number }> {
    if (
        !Number.isInteger(input.page) ||
        input.page < 1 ||
        !Number.isInteger(input.pageSize) ||
        input.pageSize < 1 ||
        input.pageSize > 100
    ) {
        throw new AiCreditInvalidAmountError(
            'Credit history page and page size are invalid.',
        );
    }

    await lockOwner(persistence, input.ownerId);
    const [entries, [total]] = await Promise.all([
        persistence.transaction
            .select({
                amount: aiCreditHistoryTable.amount,
                createdAt: aiCreditHistoryTable.createdAt,
                expiresAt: aiCreditHistoryTable.expiresAt,
                grantSource: aiCreditHistoryTable.grantSource,
                id: aiCreditHistoryTable.id,
                kind: aiCreditHistoryTable.kind,
                measurement: aiCreditHistoryTable.measurement,
                reason: aiCreditHistoryTable.reason,
            })
            .from(aiCreditHistoryTable)
            .where(eq(aiCreditHistoryTable.ownerId, input.ownerId))
            .orderBy(
                desc(aiCreditHistoryTable.createdAt),
                desc(aiCreditHistoryTable.id),
            )
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize),
        persistence.transaction
            .select({ value: count() })
            .from(aiCreditHistoryTable)
            .where(eq(aiCreditHistoryTable.ownerId, input.ownerId)),
    ]);

    return { entries, total: total?.value ?? 0 };
}

export async function lockOwner(persistence: AiCreditContext, ownerId: string) {
    await persistence.transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, ${aiCreditOwnerLockNamespace}))`,
    );
}

export async function advanceManagementVersion(
    persistence: AiCreditContext,
    ownerId: string,
    expectedVersion: number,
    at: Date,
    policy?: { mode: AiCreditPolicyMode; unlimitedUntil: Date | null },
) {
    const account = await assertManagementVersion(
        persistence,
        ownerId,
        expectedVersion,
    );

    if (account === null) {
        if (expectedVersion !== 0) throw new AiCreditManagementConflictError();
        await persistence.transaction.insert(aiCreditAccountsTable).values({
            createdAt: at,
            managementVersion: 1,
            mode: policy?.mode ?? 'limited',
            unlimitedUntil: policy?.unlimitedUntil ?? null,
            updatedAt: at,
            userId: ownerId,
        });

        return 1;
    }

    if (account.managementVersion !== expectedVersion) {
        throw new AiCreditManagementConflictError();
    }

    const nextVersion = expectedVersion + 1;
    await persistence.transaction
        .update(aiCreditAccountsTable)
        .set({
            managementVersion: nextVersion,
            mode: policy?.mode ?? account.mode,
            unlimitedUntil:
                policy === undefined
                    ? account.unlimitedUntil
                    : policy.unlimitedUntil,
            updatedAt: at,
        })
        .where(eq(aiCreditAccountsTable.userId, ownerId));

    return nextVersion;
}

export async function assertManagementVersion(
    persistence: AiCreditContext,
    ownerId: string,
    expectedVersion: number,
) {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        throw new AiCreditManagementConflictError();
    }

    const [account] = await persistence.transaction
        .select()
        .from(aiCreditAccountsTable)
        .where(eq(aiCreditAccountsTable.userId, ownerId))
        .limit(1);

    if (
        (account === undefined && expectedVersion !== 0) ||
        (account !== undefined && account.managementVersion !== expectedVersion)
    ) {
        throw new AiCreditManagementConflictError();
    }

    return account ?? null;
}

export async function readSummary(
    persistence: AiCreditContext,
    ownerId: string,
    at: Date,
): Promise<AiCreditAccountSummary> {
    const [[account], [balances], [totals]] = await Promise.all([
        persistence.transaction
            .select({
                mode: aiCreditAccountsTable.mode,
                unlimitedUntil: aiCreditAccountsTable.unlimitedUntil,
                managementVersion: aiCreditAccountsTable.managementVersion,
            })
            .from(aiCreditAccountsTable)
            .where(eq(aiCreditAccountsTable.userId, ownerId))
            .limit(1),
        persistence.transaction
            .select({
                availableCredits: sql<string>`coalesce(sum(${aiCreditGrantBalancesTable.remainingCredits}), 0)::text`,
                nextExpirationAt:
                    sql<Date | null>`min(${aiCreditGrantBalancesTable.expiresAt})`.mapWith(
                        aiCreditGrantBalancesTable.expiresAt,
                    ),
            })
            .from(aiCreditGrantBalancesTable)
            .where(spendableLots(persistence, ownerId, at)),
        persistence.transaction
            .select()
            .from(aiCreditWalletTotalsTable)
            .where(eq(aiCreditWalletTotalsTable.ownerId, ownerId))
            .limit(1),
    ]);

    return {
        availableCredits: BigInt(balances?.availableCredits ?? '0'),
        consumedCredits: totals?.consumedCredits ?? 0n,
        managementVersion: account?.managementVersion ?? 0,
        nextExpirationAt: balances?.nextExpirationAt ?? null,
        policy: {
            configuredMode: account?.mode ?? 'limited',
            effectiveMode: effectiveAiCreditPolicy(account ?? null, at),
            unlimitedUntil:
                account?.mode === 'unlimited' ? account.unlimitedUntil : null,
        },
        reservedCredits: totals?.reservedCredits ?? 0n,
    };
}

export function spendableLots(
    persistence: AiCreditContext,
    ownerId: string,
    at: Date,
) {
    return and(
        eq(aiCreditGrantBalancesTable.ownerId, ownerId),
        gt(aiCreditGrantBalancesTable.remainingCredits, 0n),
        or(
            isNull(aiCreditGrantBalancesTable.expiresAt),
            gt(aiCreditGrantBalancesTable.expiresAt, at),
        ),
    );
}

export async function loadLots(
    persistence: AiCreditContext,
    ownerId: string,
    at: Date,
): Promise<AiCreditLot[]> {
    return persistence.transaction
        .select({
            availableCredits: aiCreditGrantBalancesTable.remainingCredits,
            createdAt: aiCreditGrantBalancesTable.createdAt,
            expiresAt: aiCreditGrantBalancesTable.expiresAt,
            id: aiCreditGrantBalancesTable.grantId,
        })
        .from(aiCreditGrantBalancesTable)
        .where(spendableLots(persistence, ownerId, at));
}

export function readReservation(
    persistence: AiCreditContext,
    ownerId: string,
    reservationId: string,
) {
    return persistence.transaction
        .select()
        .from(aiCreditReservationsTable)
        .where(
            and(
                eq(aiCreditReservationsTable.id, reservationId),
                eq(aiCreditReservationsTable.ownerId, ownerId),
            ),
        )
        .limit(1);
}

export async function currentPolicy(
    persistence: AiCreditContext,
    ownerId: string,
    at: Date,
) {
    const [account] = await persistence.transaction
        .select({
            mode: aiCreditAccountsTable.mode,
            unlimitedUntil: aiCreditAccountsTable.unlimitedUntil,
        })
        .from(aiCreditAccountsTable)
        .where(eq(aiCreditAccountsTable.userId, ownerId))
        .limit(1);
    const mode = effectiveAiCreditPolicy(account ?? null, at);

    return {
        mode,
        unlimitedUntil:
            mode === 'unlimited' ? (account?.unlimitedUntil ?? null) : null,
    } as const;
}

export async function admissionPolicy(
    persistence: AiCreditContext,
    ownerId: string,
    jobId: string,
    jobKind: AiCreditJobKind,
) {
    const [reservation] = await persistence.transaction
        .select({
            ownerId: aiCreditReservationsTable.ownerId,
            policyMode: aiCreditReservationsTable.policyMode,
            unlimitedUntil: aiCreditReservationsTable.unlimitedUntil,
        })
        .from(aiCreditReservationsTable)
        .where(
            and(
                eq(aiCreditReservationsTable.jobId, jobId),
                eq(aiCreditReservationsTable.attempt, 1),
                eq(aiCreditReservationsTable.jobKind, jobKind),
            ),
        )
        .limit(1);

    if (!reservation || reservation.ownerId !== ownerId)
        throw new AiCreditReservationStateError();

    return {
        mode: reservation.policyMode,
        unlimitedUntil: reservation.unlimitedUntil,
    } as const;
}

export function reservationAllocations(
    persistence: AiCreditContext,
    reservationId: string,
) {
    return persistence.transaction
        .select({
            allocatedCredits:
                aiCreditReservationAllocationsTable.allocatedCredits,
            createdAt: aiCreditGrantsTable.createdAt,
            expiresAt: aiCreditGrantsTable.expiresAt,
            grantId: aiCreditReservationAllocationsTable.grantId,
        })
        .from(aiCreditReservationAllocationsTable)
        .innerJoin(
            aiCreditGrantsTable,
            eq(
                aiCreditGrantsTable.id,
                aiCreditReservationAllocationsTable.grantId,
            ),
        )
        .where(
            eq(
                aiCreditReservationAllocationsTable.reservationId,
                reservationId,
            ),
        )
        .orderBy(
            sql`${aiCreditGrantsTable.expiresAt} asc nulls last`,
            aiCreditGrantsTable.createdAt,
            aiCreditGrantsTable.id,
        );
}

export async function recordHistory(
    persistence: AiCreditContext,
    input: {
        amount: bigint;
        at: Date;
        expiresAt?: Date | null;
        grantSource?: 'admin' | 'subscription' | 'purchase' | 'migration';
        kind:
            | 'grant'
            | 'admin_removal'
            | 'reservation'
            | 'settlement'
            | 'release'
            | 'policy_update';
        measurement?: AiCreditMeasurement;
        ownerId: string;
        reason?: string;
    },
) {
    await persistence.transaction.insert(aiCreditHistoryTable).values({
        amount: input.amount,
        createdAt: input.at,
        expiresAt: input.expiresAt,
        grantSource: input.grantSource,
        id: randomUUID(),
        kind: input.kind,
        measurement: input.measurement,
        ownerId: input.ownerId,
        reason: input.reason,
    });
}
