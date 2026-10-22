import { describe, expect, it } from 'vitest';
import {
    ActionAllowanceQuoteSchema,
    ActionBillingSchema,
} from '../src/ai-action';
import { SentenceNextRequestSchema } from '../src/learning/sentences';
describe('learner action financial contracts', () => {
    it('preserves sentence Next confirmation alongside the original operation', () => {
        const quoteId = '00000000-0000-4000-8000-000000000001';
        const request = {
            direction: 'source-to-target',
            mode: 'new-only',
            scope: { type: 'all' },
            operationId: '00000000-0000-4000-8000-000000000002',
            sessionId: '00000000-0000-4000-8000-000000000003',
            visitedExerciseIds: [],
        };
        expect(SentenceNextRequestSchema.parse(request)).toEqual(request);
        expect(
            SentenceNextRequestSchema.parse({
                ...request,
                confirmedQuoteId: quoteId,
            }),
        ).toEqual({ ...request, confirmedQuoteId: quoteId });
        expect(
            SentenceNextRequestSchema.safeParse({
                ...request,
                confirmedQuoteId: 'forged',
            }).success,
        ).toBe(false);
    });
    it('preserves exact milli-credit detail and tiny output without a minimum', () => {
        expect(
            ActionAllowanceQuoteSchema.parse({
                id: '00000000-0000-4000-8000-000000000001',
                maximumCredits: '0.001',
                approximateOutputTokens: 1,
                expiresAt: '2030-01-01T00:00:00.000Z',
            }).maximumCredits,
        ).toBe('0.001');
        expect(
            ActionBillingSchema.parse({
                state: 'charged',
                heldCredits: '2.5',
                chargedCredits: '2.145',
                measurement: 'measured',
            }).chargedCredits,
        ).toBe('2.145');
    });
    it('rejects negative/inexact amounts and admin provider facts', () => {
        for (const chargedCredits of ['-1', '0.0001', 'NaN'])
            expect(() =>
                ActionBillingSchema.parse({
                    state: 'charged',
                    heldCredits: '1',
                    chargedCredits,
                    measurement: 'measured',
                }),
            ).toThrow();
        expect(() =>
            ActionBillingSchema.parse({
                state: 'free',
                heldCredits: '0',
                chargedCredits: '0',
                measurement: 'unknown',
                providerCostUsd: '0.01',
            }),
        ).toThrow();
    });
});
