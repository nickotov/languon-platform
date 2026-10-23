import { readReservation } from './ai-credit-wallet-access';
import { and, eq, sql } from 'drizzle-orm';
import type {
    AiCreditJobKind,
    AiCreditSettlementResult,
} from '../../../application/ai-credit-participant';
import {
    AiCreditIdempotencyConflictError,
    AiCreditInvalidAmountError,
    AiCreditReservationStateError,
    allocateAiCredits,
    settleAiCreditReservation,
    validatePositiveCreditAmount,
    type AiCreditMeasurement,
} from '../../../domain/ai-credit';
import {
    settlementResult,
    type AiCreditContext,
} from './ai-credit-persistence-support';
import {
    admissionPolicy,
    currentPolicy,
    loadLots,
    lockOwner,
    recordHistory,
    reservationAllocations,
} from './ai-credit-wallet-access';
import { DrizzleCapabilityPolicyParticipant } from './drizzle-capability-policy-participant';
import {
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
} from './schema';

export async function reserveAttempt(
    persistence: AiCreditContext,
    input: {
        at: Date;
        attempt: number;
        jobId: string;
        jobKind?: AiCreditJobKind;
        interviewCreditsBypass?: boolean;
        maximumCredits: bigint;
        ownerId: string;
        reservationId: string;
    },
) {
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

    await lockOwner(persistence, input.ownerId);
    const [existing] = await persistence.transaction
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
        persistence.transaction,
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
              ? await currentPolicy(persistence, input.ownerId, input.at)
              : await admissionPolicy(
                    persistence,
                    input.ownerId,
                    input.jobId,
                    jobKind,
                );
    const reservedCredits =
        policy.mode === 'unlimited' ? 0n : input.maximumCredits;
    const allocations =
        policy.mode === 'limited'
            ? allocateAiCredits(
                  await loadLots(persistence, input.ownerId, input.at),
                  input.maximumCredits,
                  input.at,
              )
            : [];

    await persistence.transaction.insert(aiCreditReservationsTable).values({
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
        await persistence.transaction
            .insert(aiCreditReservationAllocationsTable)
            .values(
                allocations.map((allocation) => ({
                    allocatedCredits: allocation.credits,
                    grantId: allocation.grantId,
                    reservationId: input.reservationId,
                })),
            );
    }

    await recordHistory(persistence, {
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

export async function markProviderDispatched(
    persistence: AiCreditContext,
    input: {
        dispatchedAt: Date;
        ownerId: string;
        reservationId: string;
    },
) {
    await lockOwner(persistence, input.ownerId);
    const [reservation] = await readReservation(
        persistence,
        input.ownerId,
        input.reservationId,
    );

    if (!reservation || reservation.state !== 'active') {
        throw new AiCreditReservationStateError();
    }

    if (reservation.dispatchedAt === null) {
        await persistence.transaction
            .update(aiCreditReservationsTable)
            .set({ dispatchedAt: input.dispatchedAt })
            .where(eq(aiCreditReservationsTable.id, input.reservationId));
    }
}

export async function settleAttempt(
    persistence: AiCreditContext,
    input: {
        measuredCredits: bigint | null;
        measurement: AiCreditMeasurement;
        ownerId: string;
        reservationId: string;
        settledAt: Date;
    },
): Promise<AiCreditSettlementResult> {
    return settleReservation(persistence, input);
}

export async function settleFailedAttempt(
    persistence: AiCreditContext,
    input: {
        ownerId: string;
        reservationId: string;
        settledAt: Date;
    },
): Promise<AiCreditSettlementResult> {
    return settleReservation(persistence, {
        ...input,
        measuredCredits: null,
        measurement: 'technical_failure',
    });
}

export async function settleReservation(
    persistence: AiCreditContext,
    input: {
        measuredCredits: bigint | null;
        measurement: AiCreditMeasurement;
        ownerId: string;
        reservationId: string;
        settledAt: Date;
        speechOutcome?: boolean;
    },
): Promise<AiCreditSettlementResult> {
    await lockOwner(persistence, input.ownerId);
    const [reservation] = await readReservation(
        persistence,
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
        const allocations = await reservationAllocations(
            persistence,
            input.reservationId,
        );
        let remaining = chargedCredits;
        for (const allocation of allocations) {
            const settled =
                allocation.allocatedCredits < remaining
                    ? allocation.allocatedCredits
                    : remaining;

            await persistence.transaction
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

    await persistence.transaction
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
    await recordHistory(persistence, {
        amount: -chargedCredits,
        at: input.settledAt,
        kind: 'settlement',
        measurement: input.measurement,
        ownerId: input.ownerId,
    });

    if (releasedCredits > 0n) {
        await recordHistory(persistence, {
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

export async function settleSpeechAttempt(
    persistence: AiCreditContext,
    input: {
        ownerId: string;
        reservationId: string;
        settledAt: Date;
        billingDeadline?: Date;
        outcome: 'success' | 'failure' | 'deadline';
    },
): Promise<AiCreditSettlementResult> {
    const rows = await persistence.transaction.execute(
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

export async function releaseUndispatchedAttempt(
    persistence: AiCreditContext,
    input: {
        ownerId: string;
        releasedAt: Date;
        reservationId: string;
    },
) {
    await lockOwner(persistence, input.ownerId);
    const [reservation] = await readReservation(
        persistence,
        input.ownerId,
        input.reservationId,
    );

    if (!reservation) throw new AiCreditReservationStateError();
    if (reservation.state === 'released') return;
    if (reservation.state !== 'active' || reservation.dispatchedAt !== null) {
        throw new AiCreditReservationStateError();
    }

    await persistence.transaction
        .update(aiCreditReservationsTable)
        .set({
            chargedCredits: 0n,
            settledAt: input.releasedAt,
            state: 'released',
        })
        .where(eq(aiCreditReservationsTable.id, input.reservationId));

    await recordHistory(persistence, {
        amount: reservation.reservedCredits,
        at: input.releasedAt,
        kind: 'release',
        ownerId: input.ownerId,
    });
}
