import { z } from 'zod';

/** Compatibility numeric transport; ledger arithmetic always uses integer milli-credits. */
export const CreditAmountNumberSchema = z
    .number()
    .min(0)
    .max(9_007_199_254_740)
    .refine(
        (value) => /^(0|[1-9]\d*)(\.\d{1,3})?$/.test(String(value)),
        'Credits require at most three fractional digits.',
    );
export const SignedCreditAmountNumberSchema = z
    .number()
    .min(-9_007_199_254_740)
    .max(9_007_199_254_740)
    .refine(
        (value) => /^-?(0|[1-9]\d*)(\.\d{1,3})?$/.test(String(value)),
        'Credits require at most three fractional digits.',
    );

/** Parse nonnegative public decimal credits into exact integer milli-credits. */
export function parseCreditMilli(value: string): bigint {
    if (!/^(0|[1-9]\d{0,12})(\.\d{1,3})?$/.test(value)) {
        throw new RangeError(
            'Credits require a nonnegative decimal with at most three fractional digits.',
        );
    }
    const [whole = '0', fraction = ''] = value.split('.');
    const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
    if (milli > 9_007_199_254_740_991n) {
        throw new RangeError('Credit amount exceeds the supported bound.');
    }
    return milli;
}
