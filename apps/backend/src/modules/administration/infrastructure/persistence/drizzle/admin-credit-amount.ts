import {
    formatCreditMilli,
    parseCreditMilli,
} from '../../../../ai-credits/domain/exact-credit-amount';

/** Numeric admin transport is decimal credits; storage and all arithmetic are milli-credits. */
export function adminCreditsToMilli(amount: number): bigint {
    const canonical = String(amount);
    if (canonical.startsWith('-')) return -parseCreditMilli(canonical.slice(1));
    return parseCreditMilli(canonical);
}
export function milliToAdminCredits(amount: bigint): number {
    if (amount < 0n) return Number(`-${formatCreditMilli(-amount)}`);
    return Number(formatCreditMilli(amount));
}
