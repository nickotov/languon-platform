import { describe, expect, it } from 'vitest';
import type { ProviderNativePricingRules } from '@languon/contracts';
import { audioActionChargeMilli } from './action-pricing';
import {
    evaluateNativeProviderCost,
    evaluateNativeProviderCalls,
} from './native-provider-pricing';
const facts = { dispatchedAt: '2026-10-28T12:00:00Z' };
const rules: ProviderNativePricingRules = {
    version: 1,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: null,
    variants: [
        {
            id: 'synthetic-duration',
            applies: {},
            components: [
                {
                    meter: 'audioInputMilliseconds',
                    pricePerUnit: '0.0045',
                    unitQuantity: 60000,
                    chargeWhen: 'positive-usage',
                },
            ],
        },
    ],
};
describe('native duration exact financial arithmetic', () => {
    it('prices customer source duration independently and rounds once to milli-credits', () => {
        expect(audioActionChargeMilli(1000, '1')).toBe(17n);
        expect(audioActionChargeMilli(60000, '1.001')).toBe(1001n);
        expect(audioActionChargeMilli(1, '0')).toBe(0n);
        expect(audioActionChargeMilli(1, '0.001')).toBe(1n);
        expect(() => audioActionChargeMilli(0.1, '1')).toThrow();
        expect(() => audioActionChargeMilli(-1, '1')).toThrow();
        expect(() =>
            audioActionChargeMilli(Number.MAX_SAFE_INTEGER, '99999'),
        ).toThrow();
    });
    it('calculates per-minute rates using exact integer milliseconds', () => {
        expect(
            evaluateNativeProviderCost(rules, facts, {
                audioInputMilliseconds: 60000,
                requests: 1,
            }),
        ).toMatchObject({ status: 'calculated', micros: 4500n });
        expect(
            evaluateNativeProviderCost(rules, facts, {
                audioInputMilliseconds: 1001,
                requests: 1,
            }),
        ).toMatchObject({ status: 'calculated', micros: 76n });
        expect(
            evaluateNativeProviderCost(rules, facts, {
                audioInputMilliseconds: 1,
                requests: 1,
            }),
        ).toMatchObject({ status: 'calculated', micros: 1n });
    });
    it('does not derive actual duration from tokens, characters, or absent observations', () => {
        expect(
            evaluateNativeProviderCost(rules, facts, {
                inputTokens: 60000,
                characters: 60000,
                requests: 1,
            }).status,
        ).toBe('unknown');
        expect(
            evaluateNativeProviderCost(rules, facts, { requests: 1 }).status,
        ).toBe('unknown');
        expect(
            evaluateNativeProviderCost(rules, facts, {
                audioInputMilliseconds: 1,
                requests: 0,
            }).status,
        ).toBe('unknown');
    });
    it('rounds monetary micros after adding calls rather than charging a per-call micro minimum', () => {
        expect(
            evaluateNativeProviderCalls(rules, [
                {
                    callId: '00000000-0000-4000-8000-000000000001',
                    execution: facts,
                    usage: { audioInputMilliseconds: 1, requests: 1 },
                },
                {
                    callId: '00000000-0000-4000-8000-000000000002',
                    execution: facts,
                    usage: { audioInputMilliseconds: 1, requests: 1 },
                },
            ]),
        ).toMatchObject({ status: 'calculated', micros: 1n });
    });
    it('honors explicitly reviewed provider minimum/rounding rules without fabricating one', () => {
        const minimum = structuredClone(rules);
        minimum.variants[0]!.minimumPerRequest = '0.001';
        expect(
            evaluateNativeProviderCost(minimum, facts, {
                audioInputMilliseconds: 1,
                requests: 1,
            }),
        ).toMatchObject({ status: 'calculated', micros: 1000n });
        expect(
            evaluateNativeProviderCost(
                rules,
                facts,
                { audioInputMilliseconds: 120000, requests: 1 },
                'upper-bound',
            ),
        ).toMatchObject({ status: 'calculated', micros: 9000n });
    });
});
