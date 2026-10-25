import { describe, expect, it } from 'vitest';
import { LearnerAiCreditBalanceSchema } from './learner-ai-credits';

describe('learner credit balance contract', () => {
    it.each(['0', '20.125', '0.001', '9007199254740.991'])(
        'accepts exact decimal %s',
        (availableCredits) => {
            expect(
                LearnerAiCreditBalanceSchema.parse({
                    mode: 'limited',
                    availableCredits,
                }),
            ).toEqual({ mode: 'limited', availableCredits });
        },
    );
    it('requires null for unlimited access', () => {
        expect(
            LearnerAiCreditBalanceSchema.parse({
                mode: 'unlimited',
                availableCredits: null,
            }),
        ).toEqual({ mode: 'unlimited', availableCredits: null });
    });
    it.each([
        { mode: 'limited', availableCredits: null },
        { mode: 'limited', availableCredits: 20.125 },
        { mode: 'limited', availableCredits: '-1' },
        { mode: 'limited', availableCredits: '0.0001' },
        { mode: 'limited', availableCredits: '9007199254740.992' },
        { mode: 'unlimited', availableCredits: '0' },
        { mode: 'limited', availableCredits: '0', providerCostUsd: '1' },
    ])('rejects malformed or private fields: %j', (input) => {
        expect(LearnerAiCreditBalanceSchema.safeParse(input).success).toBe(
            false,
        );
    });
});
