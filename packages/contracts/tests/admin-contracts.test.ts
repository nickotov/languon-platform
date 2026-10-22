import { describe, expect, it } from 'vitest';

import {
    AdminAuditEventsQuerySchema,
    AdminReasonSchema,
    AdminUsersQuerySchema,
    AdminUserStatusMutationRequestSchema,
} from '../src/admin';

describe('admin contracts', () => {
    it('normalizes bounded mutation reasons', () => {
        expect(AdminReasonSchema.parse('  account owner request  ')).toBe(
            'account owner request',
        );
        expect(() => AdminReasonSchema.parse('no')).toThrow();
        expect(() => AdminReasonSchema.parse('x'.repeat(501))).toThrow();
    });

    it('rejects unversioned or ambiguous status mutations', () => {
        expect(
            AdminUserStatusMutationRequestSchema.parse({
                expectedVersion: 3,
                reason: 'verified support request',
            }),
        ).toEqual({
            expectedVersion: 3,
            reason: 'verified support request',
        });
        expect(() =>
            AdminUserStatusMutationRequestSchema.parse({
                expectedVersion: 0,
                reason: 'verified support request',
            }),
        ).toThrow();
    });

    it('coerces safe pagination and rejects unknown query keys', () => {
        expect(
            AdminUsersQuerySchema.parse({ page: '2', pageSize: '50' }),
        ).toEqual({
            page: 2,
            pageSize: 50,
        });
        expect(
            AdminAuditEventsQuerySchema.parse({
                page: undefined,
                pageSize: undefined,
            }),
        ).toEqual({ page: 1, pageSize: 25 });
        expect(() => AdminUsersQuerySchema.parse({ pageSize: 101 })).toThrow();
        expect(() => AdminUsersQuerySchema.parse({ role: 'owner' })).toThrow();
    });
});

describe('fractional admin credit compatibility transport', () => {
    it('preserves milli-credit adjustments and rejects sub-milli float artifacts', async () => {
        const {
            AdminAiCreditAdjustmentRequestSchema,
            AdminAiCreditAmountSchema,
        } = await import('../src/admin');
        const input = {
            expectedVersion: 0,
            amountCredits: -0.125,
            expiresAt: null,
            reason: 'Correct fractional credit grant',
        };
        expect(
            AdminAiCreditAdjustmentRequestSchema.parse(input).amountCredits,
        ).toBe(-0.125);
        expect(AdminAiCreditAmountSchema.parse(0.001)).toBe(0.001);
        for (const amountCredits of [0.0001, 0.1 + 0.2, Infinity, NaN])
            expect(() =>
                AdminAiCreditAdjustmentRequestSchema.parse({
                    ...input,
                    amountCredits,
                }),
            ).toThrow();
    });
    it('permits fractional model and speech tariffs without rounding rates', async () => {
        const { ModelPricePublishRequestSchema } =
            await import('../src/speech');
        const price = {
            providerId: 'provider',
            modelId: 'model',
            meter: 'text-tokens',
            expectedVersion: 0,
            creditsPer1000Characters: null,
            minimumCredits: null,
            inputCreditsPerMillionTokens: 0.125,
            outputCreditsPerMillionTokens: 0.001,
            provisional: true,
            reason: 'Calibrate exact fractional model rate',
        };
        expect(
            ModelPricePublishRequestSchema.parse(price)
                .inputCreditsPerMillionTokens,
        ).toBe(0.125);
        expect(() =>
            ModelPricePublishRequestSchema.parse({
                ...price,
                outputCreditsPerMillionTokens: 0.0001,
            }),
        ).toThrow();
        expect(
            ModelPricePublishRequestSchema.parse({
                ...price,
                meter: 'speech-characters',
                inputCreditsPerMillionTokens: null,
                outputCreditsPerMillionTokens: null,
                creditsPer1000Characters: 0.125,
                minimumCredits: 0.001,
            }).minimumCredits,
        ).toBe(0.001);
    });
});

describe('optional cached-input customer tariff', () => {
    it('preserves null, omitted and fractional cached rates without altering ordinary input', async () => {
        const { ModelPricePublishRequestSchema } =
            await import('../src/speech');
        const price = {
            providerId: 'provider',
            modelId: 'model',
            meter: 'text-tokens',
            expectedVersion: 1,
            creditsPer1000Characters: null,
            minimumCredits: null,
            inputCreditsPerMillionTokens: 1.125,
            outputCreditsPerMillionTokens: 2,
            provisional: false,
            reason: 'Publish cached customer tariff',
        };
        expect(
            ModelPricePublishRequestSchema.parse(price)
                .cachedInputCreditsPerMillionTokens,
        ).toBeUndefined();
        expect(
            ModelPricePublishRequestSchema.parse({
                ...price,
                cachedInputCreditsPerMillionTokens: null,
            }).cachedInputCreditsPerMillionTokens,
        ).toBeNull();
        const cached = ModelPricePublishRequestSchema.parse({
            ...price,
            cachedInputCreditsPerMillionTokens: 0.125,
        });
        expect(cached.cachedInputCreditsPerMillionTokens).toBe(0.125);
        expect(cached.inputCreditsPerMillionTokens).toBe(1.125);
        expect(() =>
            ModelPricePublishRequestSchema.parse({
                ...price,
                cachedInputCreditsPerMillionTokens: 0.0001,
            }),
        ).toThrow();
    });
    it('allows a positive fractional speech rate with an explicit zero minimum', async () => {
        const { ModelPricePublishRequestSchema } =
            await import('../src/speech');
        const price = {
            providerId: 'provider',
            modelId: 'voice',
            meter: 'speech-characters',
            expectedVersion: 1,
            creditsPer1000Characters: 0.001,
            minimumCredits: 0,
            inputCreditsPerMillionTokens: null,
            outputCreditsPerMillionTokens: null,
            cachedInputCreditsPerMillionTokens: null,
            provisional: false,
            reason: 'Publish fractional speech tariff',
        };
        expect(ModelPricePublishRequestSchema.parse(price).minimumCredits).toBe(
            0,
        );
        expect(() =>
            ModelPricePublishRequestSchema.parse({
                ...price,
                creditsPer1000Characters: 0,
            }),
        ).toThrow();
    });
});
