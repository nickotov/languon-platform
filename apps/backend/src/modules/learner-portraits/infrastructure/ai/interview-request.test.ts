import { describe, expect, it } from 'vitest';
import { maximumTextPrice } from '../../../ai-credits/domain/model-price';
import {
    chooseInterviewOutputTokenLimit,
    readInterviewOutputTokenLimit,
    type InterviewExecution,
} from './interview-request';

const pricing = {
    inputCreditsPerMillionTokens: 1_000_000,
    outputCreditsPerMillionTokens: 3_000_000,
};
const choose = (
    availableCredits?: bigint,
    inputTokenLimit = 5824,
    creditPricing = pricing,
) =>
    chooseInterviewOutputTokenLimit({
        inputTokenLimit,
        modelLimit: 8192,
        creditPricing,
        ...(availableCredits === undefined ? {} : { availableCredits }),
    });

describe('immutable interview output budget', () => {
    it('keeps full allowance for funded, free and unlimited work', () => {
        expect(choose()).toBe(4096);
        expect(choose(20_000n)).toBe(4096);
        expect(choose(18_112n)).toBe(4096);
    });
    it('uses the largest useful affordable cap with the remaining balance after earlier charged work', () => {
        expect(choose(15_608n)).toBe(3261);
        expect(
            maximumTextPrice(
                {
                    maxInputTokensPerAttempt: 5824,
                    maxOutputTokensPerAttempt: 3261,
                },
                pricing,
            ),
        ).toBeLessThanOrEqual(15608);
        expect(
            maximumTextPrice(
                {
                    maxInputTokensPerAttempt: 5824,
                    maxOutputTokensPerAttempt: 3262,
                },
                pricing,
            ),
        ).toBeGreaterThan(15608);
    });
    it('preserves a useful floor and rejects one credit below it', () => {
        expect(choose(8896n)).toBe(1024);
        expect(choose(8895n)).toBeNull();
        expect(choose(0n)).toBeNull();
    });
    it('uses exact independent ceiling arithmetic for fractional rates', () => {
        const rates = {
            inputCreditsPerMillionTokens: 333333,
            outputCreditsPerMillionTokens: 777777,
        };
        const cap = choose(1500n, 1000, rates)!;
        expect(cap).toBeGreaterThanOrEqual(1024);
        expect(
            maximumTextPrice(
                {
                    maxInputTokensPerAttempt: 1000,
                    maxOutputTokensPerAttempt: cap,
                },
                rates,
            ),
        ).toBeLessThanOrEqual(1500);
        expect(
            maximumTextPrice(
                {
                    maxInputTokensPerAttempt: 1000,
                    maxOutputTokensPerAttempt: cap + 1,
                },
                rates,
            ),
        ).toBeGreaterThan(1500);
    });
    it('handles a zero output tariff without dividing by its rate', () => {
        expect(
            choose(5824n, 5824, {
                ...pricing,
                outputCreditsPerMillionTokens: 0,
            }),
        ).toBe(4096);
        expect(
            choose(5823n, 5824, {
                ...pricing,
                outputCreditsPerMillionTokens: 0,
            }),
        ).toBeNull();
    });
    it('does not force a new useful allowance beyond a model output limit', () => {
        expect(
            chooseInterviewOutputTokenLimit({
                inputTokenLimit: 1000,
                modelLimit: 512,
                creditPricing: pricing,
                availableCredits: 20_000n,
            }),
        ).toBeNull();
    });
    it('retains a legacy model allowance below the new useful minimum', () => {
        expect(
            readInterviewOutputTokenLimit({
                snapshot: { perCallMaxOutputTokens: 512 },
            } as unknown as InterviewExecution),
        ).toBe(512);
    });
    it('preserves legacy caps and rejects malformed or oversized new pins', () => {
        const execution = { snapshot: { perCallMaxOutputTokens: 8192 } };
        expect(
            readInterviewOutputTokenLimit(execution as InterviewExecution),
        ).toBe(4096);
        expect(
            readInterviewOutputTokenLimit({
                ...execution,
                interviewOutputTokenLimit: 3261,
            } as InterviewExecution),
        ).toBe(3261);
        for (const pin of [null, '1024', 0, -1, 1023, 4097, 1.5, NaN])
            expect(() =>
                readInterviewOutputTokenLimit({
                    ...execution,
                    interviewOutputTokenLimit: pin,
                } as unknown as InterviewExecution),
            ).toThrow();
        expect(() =>
            readInterviewOutputTokenLimit({
                snapshot: { perCallMaxOutputTokens: 2048 },
                interviewOutputTokenLimit: 3000,
            } as InterviewExecution),
        ).toThrow();
    });
});
