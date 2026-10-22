import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type {
    AiCreditAccountSummary,
    AiCreditHistoryEntry,
    AiCreditJobKind,
    AiCreditSettlementResult,
    SpeechCreditTransactionParticipant,
} from '../../../application/ai-credit-participant';
import {
    AiCreditIdempotencyConflictError,
    AiCreditInsufficientBalanceError,
    AiCreditInvalidAmountError,
    AiCreditManagementConflictError,
    AiCreditReservationStateError,
    allocateAiCredits,
    effectiveAiCreditPolicy,
    settleAiCreditReservation,
    validateAdminCreditAdjustment,
    validatePositiveCreditAmount,
    type AiCreditLot,
    type AiCreditMeasurement,
    type AiCreditPolicyMode,
} from '../../../domain/ai-credit';
import { DrizzleCapabilityPolicyParticipant } from './drizzle-capability-policy-participant';
import {
    aiCreditAccountsTable,
    aiCreditAdminRemovalAllocationsTable,
    aiCreditAdminRemovalsTable,
    aiCreditGrantsTable,
    aiCreditGrantBalancesTable,
    aiCreditWalletTotalsTable,
    aiCreditHistoryTable,
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
} from './schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
export type AiCreditTransaction = Parameters<
    Parameters<Database['transaction']>[0]
>[0];

// Credit mutations are always called after the caller has acquired its own
// aggregate locks. This separate namespace serializes wallet operations last.
export const aiCreditOwnerLockNamespace = 1_920_424_381;

export class DrizzleAiCreditTransactionParticipant implements SpeechCreditTransactionParticipant {
    public constructor(private readonly transaction: AiCreditTransaction) {}

    public async accountSummary(ownerId: string, at: Date) {
        await this.lockOwner(ownerId);
        return this.readSummary(ownerId, at);
    }

    public async history(input: {
        ownerId: string;
        page: number;
        pageSize: number;
    }): Promise<{ entries: AiCreditHistoryEntry[]; total: number }> {
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
        await this.lockOwner(input.ownerId);
        const [entries, [total]] = await Promise.all([
            this.transaction
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
            this.transaction
                .select({ value: count() })
                .from(aiCreditHistoryTable)
                .where(eq(aiCreditHistoryTable.ownerId, input.ownerId)),
        ]);
        return { entries, total: total?.value ?? 0 };
    }

    public async issueGrant(input: {
        amount: bigint;
        createdAt: Date;
        expiresAt: Date | null;
        ownerId: string;
        source: 'admin' | 'subscription' | 'purchase' | 'migration';
        sourceReference: string;
    }) {
        validatePositiveCreditAmount(input.amount);
        if (input.source === 'admin') {
            validateAdminCreditAdjustment(input.amount);
        }
        validateSourceReference(input.sourceReference);
        validateGrantExpiry(input.source, input.createdAt, input.expiresAt);
        await this.lockOwner(input.ownerId);
        const grantId = randomUUID();
        const inserted = await this.transaction
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
            await this.recordHistory({
                amount: input.amount,
                at: input.createdAt,
                expiresAt: input.expiresAt,
                grantSource: input.source,
                kind: 'grant',
                ownerId: input.ownerId,
            });
            return { created: true, grantId };
        }
        const [existing] = await this.transaction
            .select()
            .from(aiCreditGrantsTable)
            .where(
                and(
                    eq(aiCreditGrantsTable.source, input.source),
                    eq(
                        aiCreditGrantsTable.sourceReference,
                        input.sourceReference,
                    ),
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

    public async revokePurchaseGrantAvailable(input: {
        ownerId: string;
        grantId: string;
        amount: bigint;
        sourceReference: string;
        reason: string;
        at: Date;
    }): Promise<{ created: boolean; revokedCredits: bigint }> {
        validatePositiveCreditAmount(input.amount);
        validateAdminCreditAdjustment(input.amount);
        validateSourceReference(input.sourceReference);
        validateReason(input.reason);
        await this.lockOwner(input.ownerId);
        const [existing] = await this.transaction
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
            const allocations = await this.transaction
                .select()
                .from(aiCreditAdminRemovalAllocationsTable)
                .where(
                    eq(
                        aiCreditAdminRemovalAllocationsTable.removalId,
                        existing.id,
                    ),
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
        const [lot] = await this.transaction
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
        const inserted = await this.transaction
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
        await this.transaction
            .insert(aiCreditAdminRemovalAllocationsTable)
            .values({
                removalId,
                grantId: input.grantId,
                allocatedCredits: input.amount,
            });
        await this.recordHistory({
            ownerId: input.ownerId,
            amount: -input.amount,
            at: input.at,
            kind: 'admin_removal',
            reason: input.reason,
        });
        return { created: true, revokedCredits: input.amount };
    }

    public async adjustByAdmin(input: {
        amount: bigint;
        at: Date;
        expectedManagementVersion: number;
        expiresAt: Date | null;
        ownerId: string;
        reason: string;
        sourceReference: string;
    }) {
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
        await this.lockOwner(input.ownerId);
        await this.assertManagementVersion(
            input.ownerId,
            input.expectedManagementVersion,
        );
        if (input.amount > 0n) {
            const grantId = randomUUID();
            const inserted = await this.transaction
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
            await this.recordHistory({
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
                await this.loadLots(input.ownerId, input.at),
                removalAmount,
                input.at,
            );
            const removalId = randomUUID();
            const inserted = await this.transaction
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
            await this.transaction
                .insert(aiCreditAdminRemovalAllocationsTable)
                .values(
                    allocations.map((allocation) => ({
                        allocatedCredits: allocation.credits,
                        grantId: allocation.grantId,
                        removalId,
                    })),
                );
            await this.recordHistory({
                amount: input.amount,
                at: input.at,
                kind: 'admin_removal',
                ownerId: input.ownerId,
                reason: input.reason,
            });
        }
        await this.advanceManagementVersion(
            input.ownerId,
            input.expectedManagementVersion,
            input.at,
        );
        return this.readSummary(input.ownerId, input.at);
    }

    public async updatePolicy(input: {
        at: Date;
        expectedManagementVersion: number;
        mode: AiCreditPolicyMode;
        ownerId: string;
        reason: string;
        unlimitedUntil: Date | null;
    }) {
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
        await this.lockOwner(input.ownerId);
        const nextVersion = await this.advanceManagementVersion(
            input.ownerId,
            input.expectedManagementVersion,
            input.at,
            { mode: input.mode, unlimitedUntil: input.unlimitedUntil },
        );
        await this.recordHistory({
            amount: 0n,
            at: input.at,
            kind: 'policy_update',
            ownerId: input.ownerId,
            reason: input.reason,
        });
        const summary = await this.readSummary(input.ownerId, input.at);
        return { ...summary, managementVersion: nextVersion };
    }

    public async reserveAttempt(input: {
        at: Date;
        attempt: number;
        jobId: string;
        jobKind?: AiCreditJobKind;
        interviewCreditsBypass?: boolean;
        maximumCredits: bigint;
        ownerId: string;
        reservationId: string;
    }) {
        const jobKind = input.jobKind ?? 'dictionary-generation';
        if (
            ![
                'dictionary-generation',
                'sentence-generation',
                'sentence-check',
                'text-detection',
                'text-translation',
                'text-selection-card',
                'speech-generation',
                'conversation-turn',
                'portrait-interview',
            ].includes(jobKind)
        ) {
            throw new AiCreditReservationStateError();
        }
        if (input.interviewCreditsBypass && jobKind !== 'portrait-interview') {
            throw new AiCreditReservationStateError();
        }
        validatePositiveCreditAmount(input.maximumCredits);
        if (!Number.isInteger(input.attempt) || input.attempt < 1) {
            throw new AiCreditInvalidAmountError(
                'Reservation attempt must be a positive integer.',
            );
        }
        await this.lockOwner(input.ownerId);
        const [existing] = await this.transaction
            .select()
            .from(aiCreditReservationsTable)
            .where(
                and(
                    eq(aiCreditReservationsTable.jobId, input.jobId),
                    eq(aiCreditReservationsTable.attempt, input.attempt),
                ),
            )
            .limit(1);
        if (existing) {
            if (
                existing.jobKind !== jobKind ||
                existing.id !== input.reservationId ||
                existing.ownerId !== input.ownerId ||
                existing.state !== 'active'
            ) {
                throw new AiCreditIdempotencyConflictError();
            }
            return {
                policy: {
                    mode: existing.policyMode,
                    unlimitedUntil: existing.unlimitedUntil,
                },
                reservationId: existing.id,
                reservedCredits: existing.reservedCredits,
            };
        }
        const chargingPolicy = await new DrizzleCapabilityPolicyParticipant(
            this.transaction,
        ).pinAction({
            ownerId: input.ownerId,
            jobId: input.jobId,
            jobKind,
            at: input.at,
        });
        const policy =
            chargingPolicy.funding === 'operator'
                ? { mode: 'unlimited' as const, unlimitedUntil: null }
                : input.attempt === 1
                  ? await this.currentPolicy(input.ownerId, input.at)
                  : await this.admissionPolicy(
                        input.ownerId,
                        input.jobId,
                        jobKind,
                    );
        const reservedCredits =
            policy.mode === 'unlimited' ? 0n : input.maximumCredits;
        const allocations =
            policy.mode === 'limited'
                ? allocateAiCredits(
                      await this.loadLots(input.ownerId, input.at),
                      input.maximumCredits,
                      input.at,
                  )
                : [];
        await this.transaction.insert(aiCreditReservationsTable).values({
            attempt: input.attempt,
            createdAt: input.at,
            id: input.reservationId,
            jobId: input.jobId,
            jobKind,
            ownerId: input.ownerId,
            policyMode: policy.mode,
            reservedCredits,
            unlimitedUntil: policy.unlimitedUntil,
        });
        if (allocations.length > 0) {
            await this.transaction
                .insert(aiCreditReservationAllocationsTable)
                .values(
                    allocations.map((allocation) => ({
                        allocatedCredits: allocation.credits,
                        grantId: allocation.grantId,
                        reservationId: input.reservationId,
                    })),
                );
        }
        await this.recordHistory({
            amount: -reservedCredits,
            at: input.at,
            kind: 'reservation',
            ownerId: input.ownerId,
        });
        return {
            policy,
            reservationId: input.reservationId,
            reservedCredits,
        };
    }

    public async markProviderDispatched(input: {
        dispatchedAt: Date;
        ownerId: string;
        reservationId: string;
    }) {
        await this.lockOwner(input.ownerId);
        const [reservation] = await this.reservation(
            input.ownerId,
            input.reservationId,
        );
        if (!reservation || reservation.state !== 'active') {
            throw new AiCreditReservationStateError();
        }
        if (reservation.dispatchedAt === null) {
            await this.transaction
                .update(aiCreditReservationsTable)
                .set({ dispatchedAt: input.dispatchedAt })
                .where(eq(aiCreditReservationsTable.id, input.reservationId));
        }
    }

    public async settleAttempt(input: {
        measuredCredits: bigint | null;
        measurement: AiCreditMeasurement;
        ownerId: string;
        reservationId: string;
        settledAt: Date;
    }): Promise<AiCreditSettlementResult> {
        return this.settleReservation(input);
    }

    public async settleFailedAttempt(input: {
        ownerId: string;
        reservationId: string;
        settledAt: Date;
    }): Promise<AiCreditSettlementResult> {
        return this.settleReservation({
            ...input,
            measuredCredits: null,
            measurement: 'technical_failure',
        });
    }

    private async settleReservation(input: {
        measuredCredits: bigint | null;
        measurement: AiCreditMeasurement;
        ownerId: string;
        reservationId: string;
        settledAt: Date;
        speechOutcome?: boolean;
    }): Promise<AiCreditSettlementResult> {
        await this.lockOwner(input.ownerId);
        const [reservation] = await this.reservation(
            input.ownerId,
            input.reservationId,
        );
        if (!reservation) throw new AiCreditReservationStateError();
        if (
            (reservation.jobKind === 'speech-generation') !==
            Boolean(input.speechOutcome)
        )
            throw new AiCreditReservationStateError();
        if (reservation.state === 'released') {
            throw new AiCreditReservationStateError();
        }
        if (reservation.state === 'settled') {
            return settlementResult(reservation);
        }
        if (
            reservation.dispatchedAt === null &&
            input.measurement !== 'speech_no_charge' &&
            input.measurement !== 'technical_failure'
        ) {
            throw new AiCreditReservationStateError();
        }
        const settlement = input.speechOutcome
            ? {
                  chargedCredits:
                      input.measurement === 'speech_success'
                          ? reservation.reservedCredits
                          : 0n,
                  measuredCredits: null,
                  measurement: input.measurement,
                  releasedCredits:
                      input.measurement === 'speech_success'
                          ? 0n
                          : reservation.reservedCredits,
              }
            : settleAiCreditReservation({
                  measuredCredits: input.measuredCredits,
                  measurement: input.measurement,
                  policyMode: reservation.policyMode,
                  reservedCredits: reservation.reservedCredits,
              });
        const { chargedCredits } = settlement;
        if (chargedCredits > 0n) {
            const allocations = await this.reservationAllocations(
                input.reservationId,
            );
            let remaining = chargedCredits;
            for (const allocation of allocations) {
                const settled =
                    allocation.allocatedCredits < remaining
                        ? allocation.allocatedCredits
                        : remaining;
                await this.transaction
                    .update(aiCreditReservationAllocationsTable)
                    .set({ settledCredits: settled })
                    .where(
                        and(
                            eq(
                                aiCreditReservationAllocationsTable.reservationId,
                                input.reservationId,
                            ),
                            eq(
                                aiCreditReservationAllocationsTable.grantId,
                                allocation.grantId,
                            ),
                        ),
                    );
                remaining -= settled;
                if (remaining === 0n) break;
            }
            if (remaining !== 0n) {
                throw new AiCreditReservationStateError();
            }
        }
        await this.transaction
            .update(aiCreditReservationsTable)
            .set({
                chargedCredits,
                measuredCredits: input.measuredCredits,
                measurement: input.measurement,
                settledAt: input.settledAt,
                state: 'settled',
            })
            .where(eq(aiCreditReservationsTable.id, input.reservationId));
        const { releasedCredits } = settlement;
        await this.recordHistory({
            amount: -chargedCredits,
            at: input.settledAt,
            kind: 'settlement',
            measurement: input.measurement,
            ownerId: input.ownerId,
        });
        if (releasedCredits > 0n) {
            await this.recordHistory({
                amount: releasedCredits,
                at: input.settledAt,
                kind: 'release',
                ownerId: input.ownerId,
            });
        }
        return {
            chargedCredits,
            measuredCredits: input.measuredCredits,
            measurement: input.measurement,
            releasedCredits,
        };
    }

    public async settleSpeechAttempt(input: {
        ownerId: string;
        reservationId: string;
        settledAt: Date;
        billingDeadline?: Date;
        outcome: 'success' | 'failure' | 'deadline';
    }): Promise<AiCreditSettlementResult> {
        const rows = await this.transaction.execute(
            sql`select languon_settle_speech_customer(${input.reservationId}::uuid,${input.outcome}) as result`,
        );
        const result = rows[0]?.result as {
            chargedCredits: string;
            releasedCredits: string;
            measurement: 'speech_success' | 'speech_no_charge';
        };
        return {
            chargedCredits: BigInt(result.chargedCredits),
            releasedCredits: BigInt(result.releasedCredits),
            measuredCredits: null,
            measurement: result.measurement,
        };
    }

    public async releaseUndispatchedAttempt(input: {
        ownerId: string;
        releasedAt: Date;
        reservationId: string;
    }) {
        await this.lockOwner(input.ownerId);
        const [reservation] = await this.reservation(
            input.ownerId,
            input.reservationId,
        );
        if (!reservation) throw new AiCreditReservationStateError();
        if (reservation.state === 'released') return;
        if (
            reservation.state !== 'active' ||
            reservation.dispatchedAt !== null
        ) {
            throw new AiCreditReservationStateError();
        }
        await this.transaction
            .update(aiCreditReservationsTable)
            .set({
                chargedCredits: 0n,
                settledAt: input.releasedAt,
                state: 'released',
            })
            .where(eq(aiCreditReservationsTable.id, input.reservationId));
        await this.recordHistory({
            amount: reservation.reservedCredits,
            at: input.releasedAt,
            kind: 'release',
            ownerId: input.ownerId,
        });
    }

    public async purgeOwner(
        ownerId: string,
        authorization?: { workerId: string; fencingToken: number },
    ) {
        if (!authorization)
            throw new Error(
                'Financial purge requires the expected deletion worker and fencing token.',
            );
        await this.transaction.execute(
            sql`select languon_purge_ai_credit_owner(${ownerId}::uuid,${authorization.workerId},${authorization.fencingToken}::integer)`,
        );
    }

    private async lockOwner(ownerId: string) {
        await this.transaction.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, ${aiCreditOwnerLockNamespace}))`,
        );
    }

    private async advanceManagementVersion(
        ownerId: string,
        expectedVersion: number,
        at: Date,
        policy?: { mode: AiCreditPolicyMode; unlimitedUntil: Date | null },
    ) {
        const account = await this.assertManagementVersion(
            ownerId,
            expectedVersion,
        );
        if (account === null) {
            if (expectedVersion !== 0)
                throw new AiCreditManagementConflictError();
            await this.transaction.insert(aiCreditAccountsTable).values({
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
        await this.transaction
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

    private async assertManagementVersion(
        ownerId: string,
        expectedVersion: number,
    ) {
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
            throw new AiCreditManagementConflictError();
        }
        const [account] = await this.transaction
            .select()
            .from(aiCreditAccountsTable)
            .where(eq(aiCreditAccountsTable.userId, ownerId))
            .limit(1);
        if (
            (account === undefined && expectedVersion !== 0) ||
            (account !== undefined &&
                account.managementVersion !== expectedVersion)
        ) {
            throw new AiCreditManagementConflictError();
        }
        return account ?? null;
    }

    private async readSummary(
        ownerId: string,
        at: Date,
    ): Promise<AiCreditAccountSummary> {
        const [[account], [balances], [totals]] = await Promise.all([
            this.transaction
                .select({
                    mode: aiCreditAccountsTable.mode,
                    unlimitedUntil: aiCreditAccountsTable.unlimitedUntil,
                    managementVersion: aiCreditAccountsTable.managementVersion,
                })
                .from(aiCreditAccountsTable)
                .where(eq(aiCreditAccountsTable.userId, ownerId))
                .limit(1),
            this.transaction
                .select({
                    availableCredits: sql<string>`coalesce(sum(${aiCreditGrantBalancesTable.remainingCredits}), 0)::text`,
                    nextExpirationAt:
                        sql<Date | null>`min(${aiCreditGrantBalancesTable.expiresAt})`.mapWith(
                            aiCreditGrantBalancesTable.expiresAt,
                        ),
                })
                .from(aiCreditGrantBalancesTable)
                .where(this.spendableLots(ownerId, at)),
            this.transaction
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
                    account?.mode === 'unlimited'
                        ? account.unlimitedUntil
                        : null,
            },
            reservedCredits: totals?.reservedCredits ?? 0n,
        };
    }

    private spendableLots(ownerId: string, at: Date) {
        return and(
            eq(aiCreditGrantBalancesTable.ownerId, ownerId),
            gt(aiCreditGrantBalancesTable.remainingCredits, 0n),
            or(
                isNull(aiCreditGrantBalancesTable.expiresAt),
                gt(aiCreditGrantBalancesTable.expiresAt, at),
            ),
        );
    }

    private async loadLots(ownerId: string, at: Date): Promise<AiCreditLot[]> {
        return this.transaction
            .select({
                availableCredits: aiCreditGrantBalancesTable.remainingCredits,
                createdAt: aiCreditGrantBalancesTable.createdAt,
                expiresAt: aiCreditGrantBalancesTable.expiresAt,
                id: aiCreditGrantBalancesTable.grantId,
            })
            .from(aiCreditGrantBalancesTable)
            .where(this.spendableLots(ownerId, at));
    }

    private reservation(ownerId: string, reservationId: string) {
        return this.transaction
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

    private async currentPolicy(ownerId: string, at: Date) {
        const [account] = await this.transaction
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

    private async admissionPolicy(
        ownerId: string,
        jobId: string,
        jobKind: AiCreditJobKind,
    ) {
        const [reservation] = await this.transaction
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

    private reservationAllocations(reservationId: string) {
        return this.transaction
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

    private async recordHistory(input: {
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
    }) {
        await this.transaction.insert(aiCreditHistoryTable).values({
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
}

function validateReason(reason: string) {
    if (reason !== reason.trim() || reason.length < 1 || reason.length > 500) {
        throw new AiCreditInvalidAmountError(
            'Credit adjustment reason must contain 1 to 500 trimmed characters.',
        );
    }
}

function validateSourceReference(sourceReference: string) {
    if (
        sourceReference !== sourceReference.trim() ||
        sourceReference.length < 1 ||
        sourceReference.length > 200
    ) {
        throw new AiCreditInvalidAmountError(
            'Credit source reference must contain 1 to 200 trimmed characters.',
        );
    }
}

function validateGrantExpiry(
    source: 'admin' | 'subscription' | 'purchase' | 'migration',
    createdAt: Date,
    expiresAt: Date | null,
) {
    if (expiresAt !== null && expiresAt <= createdAt) {
        throw new AiCreditInvalidAmountError(
            'Credit grant expiry must be later than its creation time.',
        );
    }
    if (source === 'purchase' && expiresAt !== null) {
        throw new AiCreditInvalidAmountError(
            'Purchased credits cannot expire.',
        );
    }
}

function settlementResult(reservation: {
    chargedCredits: bigint | null;
    measuredCredits: bigint | null;
    measurement: AiCreditMeasurement | null;
    reservedCredits: bigint;
}): AiCreditSettlementResult {
    if (
        reservation.chargedCredits === null ||
        reservation.measurement === null
    ) {
        throw new AiCreditReservationStateError();
    }
    return {
        chargedCredits: reservation.chargedCredits,
        measuredCredits: reservation.measuredCredits,
        measurement: reservation.measurement,
        releasedCredits:
            reservation.reservedCredits - reservation.chargedCredits,
    };
}

function sameDate(left: Date | null, right: Date | null) {
    return left === null
        ? right === null
        : right !== null && left.getTime() === right.getTime();
}
