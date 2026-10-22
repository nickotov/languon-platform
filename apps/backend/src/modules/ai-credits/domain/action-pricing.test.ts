import { describe, expect, it } from 'vitest';
import { formatCreditMilli, parseCreditMilli } from './exact-credit-amount';
import {
    actionChargeNumerator,
    maximumActionChargeNumerator,
    affordableActionOutput,
    roundActionChargeMilli,
} from './action-pricing';

describe('exact action credits', () => {
    it('round trips decimal fractions without floating point', () => {
        expect(parseCreditMilli('1.001')).toBe(1001n);
        expect(formatCreditMilli(1010n)).toBe('1.01');
        expect(formatCreditMilli(0n)).toBe('0');
        for (const value of ['1e3', '-1', '01', '0.0001', ' 1', '1.'])
            expect(() => parseCreditMilli(value)).toThrow();
    });
    it('sums eligible usage before a single upward rounding', () => {
        const tariff = {
            inputCreditsPerMillionTokens: '0.001',
            outputCreditsPerMillionTokens: '1.001',
        };
        const first = actionChargeNumerator(
            { inputTokens: 1, outputTokens: 1 },
            tariff,
        );
        expect(roundActionChargeMilli(first + first)).toBe(1n);
        expect(
            roundActionChargeMilli(first) + roundActionChargeMilli(first),
        ).toBe(2n);
    });
    it('funds the higher cached-input tariff before cache usage is known', () => {
        const tariff = {
            inputCreditsPerMillionTokens: '1',
            cachedInputCreditsPerMillionTokens: '3',
            outputCreditsPerMillionTokens: '1000',
        };
        expect(
            affordableActionOutput({
                budgetMilli: 4n,
                inputTokens: 1000,
                outputLimit: 10000,
                tariff,
            }),
        ).toBe(1);
        expect(
            roundActionChargeMilli(
                maximumActionChargeNumerator(
                    { inputTokens: 1000, outputTokens: 1 },
                    tariff,
                ),
            ),
        ).toBe(4n);
        expect(
            roundActionChargeMilli(
                actionChargeNumerator(
                    {
                        inputTokens: 1000,
                        cacheReadTokens: 500,
                        outputTokens: 1,
                    },
                    tariff,
                ),
            ),
        ).toBe(3n);
    });
    it('retains the fractional remainder across provider calls during admission', () => {
        expect(
            affordableActionOutput({
                budgetMilli: 1n,
                usedNumerator: 200000n,
                inputTokens: 0,
                outputLimit: 10000,
                tariff: {
                    inputCreditsPerMillionTokens: '0',
                    outputCreditsPerMillionTokens: '1',
                },
            }),
        ).toBe(800);
    });
    it('admits tiny affordable output and includes input in the exact budget', () => {
        const tariff = {
            inputCreditsPerMillionTokens: '1',
            outputCreditsPerMillionTokens: '1000',
        };
        expect(
            affordableActionOutput({
                budgetMilli: 1n,
                inputTokens: 1,
                outputLimit: 10000,
                tariff,
            }),
        ).toBe(0);
        expect(
            affordableActionOutput({
                budgetMilli: 2n,
                inputTokens: 1,
                outputLimit: 10000,
                tariff,
            }),
        ).toBe(1);
        expect(
            affordableActionOutput({
                budgetMilli: 100000n,
                inputTokens: 1,
                outputLimit: 10000,
                tariff,
            }),
        ).toBe(10000);
    });
});
