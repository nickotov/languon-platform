import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    AiCreditIdempotencyConflictError,
    AiCreditInsufficientBalanceError,
    AiCreditInvalidAmountError,
    AiCreditReservationStateError,
    allocateAiCredits,
    validateAdminCreditAdjustment,
    validatePositiveCreditAmount,
    type AiCreditPolicyMode,
} from '../../../domain/ai-credit';
import {
    sameDate,
    validateGrantExpiry,
    validateReason,
    validateSourceReference,
    type AiCreditContext,
} from './ai-credit-persistence-support';
import {
    advanceManagementVersion,
    assertManagementVersion,
    loadLots,
    lockOwner,
    readSummary,
    recordHistory,
} from './ai-credit-wallet-access';
import {
    aiCreditAdminRemovalAllocationsTable,
    aiCreditAdminRemovalsTable,
    aiCreditGrantBalancesTable,
    aiCreditGrantsTable,
} from './schema';

export async function issueGrant(
    persistence: AiCreditContext,
    input: {
        amount: bigint;
        createdAt: Date;
        expiresAt: Date | null;
        ownerId: string;
        source: 'admin' | 'subscription' | 'purchase' | 'migration';
        sourceReference: string;
    },
) {
    validatePositiveCreditAmount(input.amount);
    if (input.source === 'admin') {
        validateAdminCreditAdjustment(input.amount);
    }

    validateSourceReference(input.sourceReference);
    validateGrantExpiry(input.source, input.createdAt, input.expiresAt);
    await lockOwner(persistence, input.ownerId);
    const grantId = randomUUID();
    const inserted = await persistence.transaction
        .insert(aiCreditGrantsTable)
        .values({
            amount: input.amount,
            createdAt: input.createdAt,
            expiresAt: input.expiresAt,
            id: grantId,
            ownerId: input.ownerId,
            source: input.source,
            sourceReference: input.sourceReference,
        })
        .onConflictDoNothing({
            target: [
                aiCreditGrantsTable.source,
                aiCreditGrantsTable.sourceReference,
            ],
        })
        .returning({ id: aiCreditGrantsTable.id });

    if (inserted.length > 0) {
        await recordHistory(persistence, {
            amount: input.amount,
            at: input.createdAt,
            expiresAt: input.expiresAt,
            grantSource: input.source,
            kind: 'grant',
            ownerId: input.ownerId,
        });

        return { created: true, grantId };
    }

    const [existing] = await persistence.transaction
        .select()
        .from(aiCreditGrantsTable)
        .where(
            and(
                eq(aiCreditGrantsTable.source, input.source),
                eq(aiCreditGrantsTable.sourceReference, input.sourceReference),
            ),
        )
        .limit(1);

    if (
        !existing ||
        existing.ownerId !== input.ownerId ||
        existing.amount !== input.amount ||
        !sameDate(existing.expiresAt, input.expiresAt)
    ) {
        throw new AiCreditIdempotencyConflictError();
    }

    return { created: false, grantId: existing.id };
}

export async function revokePurchaseGrantAvailable(
    persistence: AiCreditContext,
    input: {
        ownerId: string;
        grantId: string;
        amount: bigint;
        sourceReference: string;
        reason: string;
        at: Date;
    },
): Promise<{ created: boolean; revokedCredits: bigint }> {
    validatePositiveCreditAmount(input.amount);
    validateAdminCreditAdjustment(input.amount);
    validateSourceReference(input.sourceReference);
    validateReason(input.reason);
    await lockOwner(persistence, input.ownerId);
    const [existing] = await persistence.transaction
        .select()
        .from(aiCreditAdminRemovalsTable)
        .where(
            eq(
                aiCreditAdminRemovalsTable.sourceReference,
                input.sourceReference,
            ),
        )
        .limit(1);

    if (existing) {
        const allocations = await persistence.transaction
            .select()
            .from(aiCreditAdminRemovalAllocationsTable)
            .where(
                eq(aiCreditAdminRemovalAllocationsTable.removalId, existing.id),
            );

        if (
            existing.ownerId !== input.ownerId ||
            existing.amount !== input.amount ||
            existing.reason !== input.reason ||
            allocations.length !== 1 ||
            allocations[0]?.grantId !== input.grantId ||
            allocations[0]?.allocatedCredits !== input.amount
        ) {
            throw new AiCreditIdempotencyConflictError();
        }

        return { created: false, revokedCredits: input.amount };
    }

    const [lot] = await persistence.transaction
        .select({
            source: aiCreditGrantsTable.source,
            remainingCredits: aiCreditGrantBalancesTable.remainingCredits,
        })
        .from(aiCreditGrantsTable)
        .innerJoin(
            aiCreditGrantBalancesTable,
            eq(aiCreditGrantBalancesTable.grantId, aiCreditGrantsTable.id),
        )
        .where(
            and(
                eq(aiCreditGrantsTable.id, input.grantId),
                eq(aiCreditGrantsTable.ownerId, input.ownerId),
            ),
        )
        .limit(1);

    if (!lot || lot.source !== 'purchase')
        throw new AiCreditReservationStateError();
    if (lot.remainingCredits < input.amount)
        throw new AiCreditInsufficientBalanceError();
    const removalId = randomUUID();
    const inserted = await persistence.transaction
        .insert(aiCreditAdminRemovalsTable)
        .values({
            id: removalId,
            ownerId: input.ownerId,
            amount: input.amount,
            sourceReference: input.sourceReference,
            reason: input.reason,
            createdAt: input.at,
        })
        .onConflictDoNothing({
            target: aiCreditAdminRemovalsTable.sourceReference,
        })
        .returning({ id: aiCreditAdminRemovalsTable.id });

    if (inserted.length === 0) throw new AiCreditIdempotencyConflictError();
    await persistence.transaction
        .insert(aiCreditAdminRemovalAllocationsTable)
        .values({
            removalId,
            grantId: input.grantId,
            allocatedCredits: input.amount,
        });

    await recordHistory(persistence, {
        ownerId: input.ownerId,
        amount: -input.amount,
        at: input.at,
        kind: 'admin_removal',
        reason: input.reason,
    });

    return { created: true, revokedCredits: input.amount };
}

export async function adjustByAdmin(
    persistence: AiCreditContext,
    input: {
        amount: bigint;
        at: Date;
        expectedManagementVersion: number;
        expiresAt: Date | null;
        ownerId: string;
        reason: string;
        sourceReference: string;
    },
) {
    validateAdminCreditAdjustment(input.amount);
    validateReason(input.reason);
    validateSourceReference(input.sourceReference);
    if (input.amount < 0n && input.expiresAt !== null) {
        throw new AiCreditInvalidAmountError(
            'A credit removal cannot have an expiry.',
        );
    }

    if (input.amount > 0n) {
        validateGrantExpiry('admin', input.at, input.expiresAt);
    }

    await lockOwner(persistence, input.ownerId);
    await assertManagementVersion(
        persistence,
        input.ownerId,
        input.expectedManagementVersion,
    );

    if (input.amount > 0n) {
        const grantId = randomUUID();
        const inserted = await persistence.transaction
            .insert(aiCreditGrantsTable)
            .values({
                amount: input.amount,
                createdAt: input.at,
                expiresAt: input.expiresAt,
                id: grantId,
                ownerId: input.ownerId,
                source: 'admin',
                sourceReference: input.sourceReference,
            })
            .onConflictDoNothing({
                target: [
                    aiCreditGrantsTable.source,
                    aiCreditGrantsTable.sourceReference,
                ],
            })
            .returning({ id: aiCreditGrantsTable.id });

        if (inserted.length === 0) {
            throw new AiCreditIdempotencyConflictError();
        }

        await recordHistory(persistence, {
            amount: input.amount,
            at: input.at,
            expiresAt: input.expiresAt,
            grantSource: 'admin',
            kind: 'grant',
            ownerId: input.ownerId,
            reason: input.reason,
        });
    } else {
        const removalAmount = -input.amount;
        const allocations = allocateAiCredits(
            await loadLots(persistence, input.ownerId, input.at),
            removalAmount,
            input.at,
        );
        const removalId = randomUUID();
        const inserted = await persistence.transaction
            .insert(aiCreditAdminRemovalsTable)
            .values({
                amount: removalAmount,
                createdAt: input.at,
                id: removalId,
                ownerId: input.ownerId,
                reason: input.reason,
                sourceReference: input.sourceReference,
            })
            .onConflictDoNothing({
                target: aiCreditAdminRemovalsTable.sourceReference,
            })
            .returning({ id: aiCreditAdminRemovalsTable.id });

        if (inserted.length === 0) {
            throw new AiCreditIdempotencyConflictError();
        }

        await persistence.transaction
            .insert(aiCreditAdminRemovalAllocationsTable)
            .values(
                allocations.map((allocation) => ({
                    allocatedCredits: allocation.credits,
                    grantId: allocation.grantId,
                    removalId,
                })),
            );

        await recordHistory(persistence, {
            amount: input.amount,
            at: input.at,
            kind: 'admin_removal',
            ownerId: input.ownerId,
            reason: input.reason,
        });
    }

    await advanceManagementVersion(
        persistence,
        input.ownerId,
        input.expectedManagementVersion,
        input.at,
    );

    return readSummary(persistence, input.ownerId, input.at);
}

export async function updatePolicy(
    persistence: AiCreditContext,
    input: {
        at: Date;
        expectedManagementVersion: number;
        mode: AiCreditPolicyMode;
        ownerId: string;
        reason: string;
        unlimitedUntil: Date | null;
    },
) {
    validateReason(input.reason);
    if (input.mode === 'limited' && input.unlimitedUntil !== null) {
        throw new AiCreditInvalidAmountError(
            'Limited policy cannot have an unlimited expiry.',
        );
    }

    if (
        input.mode === 'unlimited' &&
        input.unlimitedUntil !== null &&
        input.unlimitedUntil <= input.at
    ) {
        throw new AiCreditInvalidAmountError(
            'Unlimited policy expiry must be in the future.',
        );
    }

    await lockOwner(persistence, input.ownerId);
    const nextVersion = await advanceManagementVersion(
        persistence,
        input.ownerId,
        input.expectedManagementVersion,
        input.at,
        { mode: input.mode, unlimitedUntil: input.unlimitedUntil },
    );

    await recordHistory(persistence, {
        amount: 0n,
        at: input.at,
        kind: 'policy_update',
        ownerId: input.ownerId,
        reason: input.reason,
    });

    const summary = await readSummary(persistence, input.ownerId, input.at);

    return { ...summary, managementVersion: nextVersion };
}

export async function purgeOwner(
    persistence: AiCreditContext,
    ownerId: string,
    authorization?: { workerId: string; fencingToken: number },
) {
    if (!authorization)
        throw new Error(
            'Financial purge requires the expected deletion worker and fencing token.',
        );
    await persistence.transaction.execute(
        sql`select languon_purge_ai_credit_owner(${ownerId}::uuid,${authorization.workerId},${authorization.fencingToken}::integer)`,
    );
}
