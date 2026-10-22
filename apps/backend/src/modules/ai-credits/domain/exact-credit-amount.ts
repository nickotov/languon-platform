/** All wallet and action amounts use integer thousandths; transports expose canonical credit values. */
export const CREDIT_MILLI_SCALE = 1000n;
export const MAX_CREDIT_MILLI = 9_007_199_254_740_991n;

export class InvalidExactCreditAmountError extends Error {}

export function parseCreditMilli(value: string): bigint {
    if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$/u.test(value))
        throw new InvalidExactCreditAmountError(
            'Credits require a nonnegative decimal with at most three fractional digits.',
        );
    const [whole = '0', fraction = ''] = value.split('.');
    const result =
        BigInt(whole) * CREDIT_MILLI_SCALE + BigInt(fraction.padEnd(3, '0'));
    if (result > MAX_CREDIT_MILLI)
        throw new InvalidExactCreditAmountError(
            'Credit amount exceeds the supported bound.',
        );
    return result;
}

export function formatCreditMilli(value: bigint): string {
    if (value < 0n || value > MAX_CREDIT_MILLI)
        throw new InvalidExactCreditAmountError();
    const fraction = (value % CREDIT_MILLI_SCALE)
        .toString()
        .padStart(3, '0')
        .replace(/0+$/u, '');
    return `${value / CREDIT_MILLI_SCALE}${fraction ? `.${fraction}` : ''}`;
}
