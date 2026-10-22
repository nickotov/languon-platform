export class AccountingConflictError extends Error {}
export class AccountingInvalidRecordError extends Error {}

export function parseFixed(value: string, places: number): bigint {
    if (!new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${places}})?$`).test(value))
        throw new AccountingInvalidRecordError('Invalid exact amount.');
    const [whole = '0', fractional = ''] = value.split('.');
    return (
        BigInt(whole) * 10n ** BigInt(places) +
        BigInt(fractional.padEnd(places, '0'))
    );
}
export function formatFixed(value: bigint, places: number): string {
    const sign = value < 0n ? '-' : '';
    const absolute = value < 0n ? -value : value;
    const scale = 10n ** BigInt(places);
    return `${sign}${absolute / scale}.${(absolute % scale).toString().padStart(places, '0')}`;
}
/** Integer division keeps fractions exact and never overstates attributable purchase value. */
export function purchaseValueMicros(
    amountUsdMicros: bigint,
    consumedCredits: bigint,
    issuedCredits: bigint,
): bigint {
    if (
        issuedCredits <= 0n ||
        consumedCredits < 0n ||
        consumedCredits > issuedCredits ||
        amountUsdMicros < 0n
    )
        throw new AccountingInvalidRecordError();
    return (amountUsdMicros * consumedCredits) / issuedCredits;
}

/** Refund cash exceeding the unconsumed purchase value is exposed as consumed-value loss. */
export function refundedConsumedValueMicros(input: {
    paid: bigint;
    refunded: bigint;
    consumed: bigint;
    issued: bigint;
}): bigint {
    if (input.refunded < 0n || input.refunded > input.paid)
        throw new AccountingInvalidRecordError();
    const unconsumed = purchaseValueMicros(
        input.paid,
        input.issued - input.consumed,
        input.issued,
    );
    return input.refunded > unconsumed ? input.refunded - unconsumed : 0n;
}

export class AccountingReportPendingError extends Error {}
