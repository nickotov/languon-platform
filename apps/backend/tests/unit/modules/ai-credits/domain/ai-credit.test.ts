import { describe, expect, it } from 'vitest';

import {
    AiCreditInsufficientBalanceError,
    AiCreditInvalidAmountError,
    AiCreditUsageExceedsReservationError,
    allocateAiCredits,
    calculateAiCreditUsage,
    effectiveAiCreditPolicy,
    maximumAdminCreditAdjustment,
    resolveAiCreditMeasurement,
    settleAiCreditReservation,
    validateAdminCreditAdjustment,
} from '../../../../../src/modules/ai-credits/domain/ai-credit';

const at = new Date('2026-09-25T12:00:00.000Z');

describe('AI credit domain', () => {
    it('treats an absent or expired unlimited account as limited', () => {
        expect(effectiveAiCreditPolicy(null, at)).toBe('limited');
        expect(
            effectiveAiCreditPolicy(
                { mode: 'unlimited', unlimitedUntil: at },
                at,
            ),
        ).toBe('limited');
        expect(
            effectiveAiCreditPolicy(
                {
                    mode: 'unlimited',
                    unlimitedUntil: new Date('2026-09-25T12:00:00.001Z'),
                },
                at,
            ),
        ).toBe('unlimited');
        expect(
            effectiveAiCreditPolicy(
                { mode: 'unlimited', unlimitedUntil: null },
                at,
            ),
        ).toBe('unlimited');
    });

    it('allocates earliest expiry first, stable creation order next, and non-expiring last', () => {
        const allocations = allocateAiCredits(
            [
                {
                    availableCredits: 10n,
                    createdAt: new Date('2026-09-01T00:00:00Z'),
                    expiresAt: null,
                    id: 'never',
                },
                {
                    availableCredits: 4n,
                    createdAt: new Date('2026-09-03T00:00:00Z'),
                    expiresAt: new Date('2026-10-01T00:00:00Z'),
                    id: 'later-created',
                },
                {
                    availableCredits: 3n,
                    createdAt: new Date('2026-09-02T00:00:00Z'),
                    expiresAt: new Date('2026-10-01T00:00:00Z'),
                    id: 'earlier-created',
                },
                {
                    availableCredits: 50n,
                    createdAt: new Date('2026-08-01T00:00:00Z'),
                    expiresAt: at,
                    id: 'expired-at-boundary',
                },
            ],
            12n,
            at,
        );

        expect(allocations).toEqual([
            { credits: 3n, grantId: 'earlier-created' },
            { credits: 4n, grantId: 'later-created' },
            { credits: 5n, grantId: 'never' },
        ]);
    });

    it('fails allocation atomically when eligible lots are insufficient', () => {
        expect(() =>
            allocateAiCredits(
                [
                    {
                        availableCredits: 9n,
                        createdAt: at,
                        expiresAt: null,
                        id: 'grant',
                    },
                ],
                10n,
                at,
            ),
        ).toThrow(AiCreditInsufficientBalanceError);
    });

    it('calculates normalized credits without floating point arithmetic', () => {
        expect(
            calculateAiCreditUsage({
                inputCreditsPerToken: 1n,
                inputTokens: 123,
                outputCreditsPerToken: 3n,
                outputTokens: 45,
            }),
        ).toBe(258n);
        expect(() =>
            calculateAiCreditUsage({
                inputCreditsPerToken: 1n,
                inputTokens: 1.5,
                outputCreditsPerToken: 3n,
                outputTokens: 1,
            }),
        ).toThrow(AiCreditInvalidAmountError);
    });

    it('bounds non-zero admin adjustments in either direction', () => {
        expect(
            validateAdminCreditAdjustment(maximumAdminCreditAdjustment),
        ).toBe(maximumAdminCreditAdjustment);
        expect(
            validateAdminCreditAdjustment(-maximumAdminCreditAdjustment),
        ).toBe(-maximumAdminCreditAdjustment);
        expect(() => validateAdminCreditAdjustment(0n)).toThrow(
            AiCreditInvalidAmountError,
        );
        expect(() =>
            validateAdminCreditAdjustment(maximumAdminCreditAdjustment + 1n),
        ).toThrow(AiCreditInvalidAmountError);
    });

    it('settles reported usage and releases the unused reservation', () => {
        expect(
            settleAiCreditReservation({
                measuredCredits: 320n,
                measurement: 'provider_reported',
                policyMode: 'limited',
                reservedCredits: 1_000n,
            }),
        ).toEqual({
            chargedCredits: 320n,
            measuredCredits: 320n,
            measurement: 'provider_reported',
            releasedCredits: 680n,
        });
    });

    it('charges the full finite reservation when usage is estimated', () => {
        expect(
            settleAiCreditReservation({
                measuredCredits: null,
                measurement: 'estimated',
                policyMode: 'limited',
                reservedCredits: 1_000n,
            }),
        ).toEqual({
            chargedCredits: 1_000n,
            measuredCredits: null,
            measurement: 'estimated',
            releasedCredits: 0n,
        });
    });

    it('records unlimited reported or unmetered usage without a charge', () => {
        expect(resolveAiCreditMeasurement('unlimited', false)).toBe(
            'unmetered',
        );
        expect(resolveAiCreditMeasurement('limited', false)).toBe('estimated');
        expect(resolveAiCreditMeasurement('unlimited', true)).toBe(
            'provider_reported',
        );
        expect(
            settleAiCreditReservation({
                measuredCredits: 900n,
                measurement: 'provider_reported',
                policyMode: 'unlimited',
                reservedCredits: 0n,
            }),
        ).toEqual({
            chargedCredits: 0n,
            measuredCredits: 900n,
            measurement: 'provider_reported',
            releasedCredits: 0n,
        });
        expect(
            settleAiCreditReservation({
                measuredCredits: null,
                measurement: 'unmetered',
                policyMode: 'unlimited',
                reservedCredits: 0n,
            }).chargedCredits,
        ).toBe(0n);
    });

    it('rejects invalid measurement claims and over-reservation usage', () => {
        expect(() =>
            settleAiCreditReservation({
                measuredCredits: null,
                measurement: 'provider_reported',
                policyMode: 'limited',
                reservedCredits: 100n,
            }),
        ).toThrow(AiCreditInvalidAmountError);
        expect(() =>
            settleAiCreditReservation({
                measuredCredits: 101n,
                measurement: 'provider_reported',
                policyMode: 'limited',
                reservedCredits: 100n,
            }),
        ).toThrow(AiCreditUsageExceedsReservationError);
        expect(
            settleAiCreditReservation({
                measuredCredits: null,
                measurement: 'estimated',
                policyMode: 'unlimited',
                reservedCredits: 0n,
            }),
        ).toEqual({
            chargedCredits: 0n,
            measuredCredits: null,
            measurement: 'estimated',
            releasedCredits: 0n,
        });
    });
});
