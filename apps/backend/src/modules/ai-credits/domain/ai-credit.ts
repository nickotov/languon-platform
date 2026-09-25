export const maximumAdminCreditAdjustment = 1_000_000_000_000n;
export const maximumAiCreditAmount = BigInt(Number.MAX_SAFE_INTEGER);

export type AiCreditPolicyMode = 'limited' | 'unlimited';
export type AiCreditMeasurement =
    'provider_reported' | 'estimated' | 'unmetered';
export type AiCreditGrantSource =
    'admin' | 'subscription' | 'purchase' | 'migration';

export interface AiCreditAccountPolicy {
    mode: AiCreditPolicyMode;
    unlimitedUntil: Date | null;
}

export interface AiCreditLot {
    availableCredits: bigint;
    createdAt: Date;
    expiresAt: Date | null;
    id: string;
}

export interface AiCreditAllocation {
    credits: bigint;
    grantId: string;
}

export interface AiCreditSettlement {
    chargedCredits: bigint;
    measuredCredits: bigint | null;
    measurement: AiCreditMeasurement;
    releasedCredits: bigint;
}

export class AiCreditInvalidAmountError extends Error {}
export class AiCreditInsufficientBalanceError extends Error {}
export class AiCreditUsageExceedsReservationError extends Error {}
export class AiCreditReservationStateError extends Error {}
export class AiCreditManagementConflictError extends Error {}
export class AiCreditIdempotencyConflictError extends Error {}

export function effectiveAiCreditPolicy(
    policy: AiCreditAccountPolicy | null,
    at: Date,
): AiCreditPolicyMode {
    if (
        policy?.mode === 'unlimited' &&
        (policy.unlimitedUntil === null || policy.unlimitedUntil > at)
    ) {
        return 'unlimited';
    }
    return 'limited';
}

export function validateAdminCreditAdjustment(amount: bigint): bigint {
    const absolute = amount < 0n ? -amount : amount;
    if (amount === 0n || absolute > maximumAdminCreditAdjustment) {
        throw new AiCreditInvalidAmountError(
            `Credit adjustment must be non-zero and no greater than ${maximumAdminCreditAdjustment.toString()} credits.`,
        );
    }
    return amount;
}

export function validatePositiveCreditAmount(amount: bigint): bigint {
    if (amount <= 0n || amount > maximumAiCreditAmount) {
        throw new AiCreditInvalidAmountError(
            `Credit amount must be between 1 and ${maximumAiCreditAmount.toString()}.`,
        );
    }
    return amount;
}

export function calculateAiCreditUsage(input: {
    inputCreditsPerToken: bigint;
    inputTokens: number;
    outputCreditsPerToken: bigint;
    outputTokens: number;
}): bigint {
    if (
        !Number.isSafeInteger(input.inputTokens) ||
        input.inputTokens < 0 ||
        !Number.isSafeInteger(input.outputTokens) ||
        input.outputTokens < 0 ||
        input.inputCreditsPerToken < 0n ||
        input.inputCreditsPerToken > maximumAiCreditAmount ||
        input.outputCreditsPerToken < 0n ||
        input.outputCreditsPerToken > maximumAiCreditAmount
    ) {
        throw new AiCreditInvalidAmountError(
            'Token counts and credit rates must be non-negative safe integers.',
        );
    }
    const credits =
        BigInt(input.inputTokens) * input.inputCreditsPerToken +
        BigInt(input.outputTokens) * input.outputCreditsPerToken;
    if (credits > maximumAiCreditAmount) {
        throw new AiCreditInvalidAmountError(
            'Calculated credit usage is too large.',
        );
    }
    return credits;
}

export function resolveAiCreditMeasurement(
    policyMode: string,
    hasProviderUsage: boolean,
): AiCreditMeasurement {
    if (hasProviderUsage) return 'provider_reported';
    if (policyMode === 'unlimited') return 'unmetered';
    if (policyMode === 'limited') return 'estimated';
    throw new AiCreditInvalidAmountError('AI credit policy mode is invalid.');
}

export function settleAiCreditReservation(input: {
    measuredCredits: bigint | null;
    measurement: AiCreditMeasurement;
    policyMode: AiCreditPolicyMode;
    reservedCredits: bigint;
}): AiCreditSettlement {
    if (
        input.reservedCredits < 0n ||
        input.reservedCredits > maximumAiCreditAmount ||
        (input.measuredCredits !== null &&
            input.measuredCredits > maximumAiCreditAmount)
    ) {
        throw new AiCreditInvalidAmountError(
            'Settlement credit amount is invalid.',
        );
    }
    if (input.measurement === 'provider_reported') {
        if (input.measuredCredits === null || input.measuredCredits < 0n) {
            throw new AiCreditInvalidAmountError(
                'Provider-reported settlement requires non-negative measured credits.',
            );
        }
    } else if (input.measuredCredits !== null) {
        throw new AiCreditInvalidAmountError(
            'Estimated and unmetered settlement cannot claim measured credits.',
        );
    }
    if (input.policyMode === 'limited' && input.measurement === 'unmetered') {
        throw new AiCreditInvalidAmountError(
            'Settlement measurement does not match the pinned credit policy.',
        );
    }
    const chargedCredits =
        input.policyMode === 'unlimited'
            ? 0n
            : input.measurement === 'estimated'
              ? input.reservedCredits
              : (input.measuredCredits ?? 0n);
    if (chargedCredits > input.reservedCredits) {
        throw new AiCreditUsageExceedsReservationError();
    }
    return {
        chargedCredits,
        measuredCredits: input.measuredCredits,
        measurement: input.measurement,
        releasedCredits: input.reservedCredits - chargedCredits,
    };
}

export function allocateAiCredits(
    lots: readonly AiCreditLot[],
    amount: bigint,
    at: Date,
): AiCreditAllocation[] {
    validatePositiveCreditAmount(amount);
    const eligible = lots
        .filter(
            (lot) =>
                lot.availableCredits > 0n &&
                (lot.expiresAt === null || lot.expiresAt > at),
        )
        .sort(compareAiCreditLots);
    const allocations: AiCreditAllocation[] = [];
    let remaining = amount;
    for (const lot of eligible) {
        if (remaining === 0n) break;
        const credits =
            lot.availableCredits < remaining ? lot.availableCredits : remaining;
        allocations.push({ credits, grantId: lot.id });
        remaining -= credits;
    }
    if (remaining > 0n) throw new AiCreditInsufficientBalanceError();
    return allocations;
}

function compareAiCreditLots(left: AiCreditLot, right: AiCreditLot) {
    if (left.expiresAt === null && right.expiresAt !== null) return 1;
    if (left.expiresAt !== null && right.expiresAt === null) return -1;
    const expiryDifference =
        (left.expiresAt?.getTime() ?? 0) - (right.expiresAt?.getTime() ?? 0);
    if (expiryDifference !== 0) return expiryDifference;
    const creationDifference =
        left.createdAt.getTime() - right.createdAt.getTime();
    if (creationDifference !== 0) return creationDifference;
    return left.id.localeCompare(right.id);
}
