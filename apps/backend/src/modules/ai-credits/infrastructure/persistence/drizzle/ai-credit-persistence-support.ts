import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type { AiCreditSettlementResult } from '../../../application/ai-credit-participant';
import {
    AiCreditInvalidAmountError,
    AiCreditReservationStateError,
    type AiCreditMeasurement,
} from '../../../domain/ai-credit';

export type Database = PostgresJsDatabase<typeof databaseSchema>;

export type AiCreditTransaction = Parameters<
    Parameters<Database['transaction']>[0]
>[0];

// Credit mutations are always called after the caller has acquired its own
// aggregate locks. This separate namespace serializes wallet operations last.
export const aiCreditOwnerLockNamespace = 1_920_424_381;

export function validateReason(reason: string) {
    if (reason !== reason.trim() || reason.length < 1 || reason.length > 500) {
        throw new AiCreditInvalidAmountError(
            'Credit adjustment reason must contain 1 to 500 trimmed characters.',
        );
    }
}

export function validateSourceReference(sourceReference: string) {
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

export function validateGrantExpiry(
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

export function settlementResult(reservation: {
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

export function sameDate(left: Date | null, right: Date | null) {
    return left === null
        ? right === null
        : right !== null && left.getTime() === right.getTime();
}

export interface AiCreditContext {
    readonly transaction: AiCreditTransaction;
}
