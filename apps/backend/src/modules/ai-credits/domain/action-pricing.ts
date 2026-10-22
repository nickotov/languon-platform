import { MAX_CREDIT_MILLI, parseCreditMilli } from './exact-credit-amount';

export interface ActionTariff {
    inputCreditsPerMillionTokens: string;
    outputCreditsPerMillionTokens: string;
    cachedInputCreditsPerMillionTokens?: string | null;
}
export interface ActionUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
}
const TOKEN_SCALE = 1_000_000n;
function tokens(value: number): bigint {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error('Invalid token quantity.');
    return BigInt(value);
}
/** Numerators are retained across calls; round exactly once at action settlement. */
export function actionChargeNumerator(
    usage: ActionUsage,
    tariff: ActionTariff,
): bigint {
    const input = tokens(usage.inputTokens);
    const cached = tokens(usage.cacheReadTokens ?? 0);
    if (cached > input) throw new Error('Cached input exceeds total input.');
    return (
        (input - cached) *
            parseCreditMilli(tariff.inputCreditsPerMillionTokens) +
        cached *
            parseCreditMilli(
                tariff.cachedInputCreditsPerMillionTokens ??
                    tariff.inputCreditsPerMillionTokens,
            ) +
        tokens(usage.outputTokens) *
            parseCreditMilli(tariff.outputCreditsPerMillionTokens)
    );
}
/** Admission uses the higher input rate because future cache usage is not known. */
export function maximumActionChargeNumerator(
    usage: ActionUsage,
    tariff: ActionTariff,
): bigint {
    const ordinary = parseCreditMilli(tariff.inputCreditsPerMillionTokens);
    const cached = parseCreditMilli(
        tariff.cachedInputCreditsPerMillionTokens ??
            tariff.inputCreditsPerMillionTokens,
    );
    return (
        tokens(usage.inputTokens) * (ordinary > cached ? ordinary : cached) +
        tokens(usage.outputTokens) *
            parseCreditMilli(tariff.outputCreditsPerMillionTokens)
    );
}
export function roundActionChargeMilli(numerator: bigint): bigint {
    if (numerator < 0n) throw new Error('Invalid charge numerator.');
    const charge = (numerator + TOKEN_SCALE - 1n) / TOKEN_SCALE;
    if (charge > MAX_CREDIT_MILLI)
        throw new Error('Action charge exceeds supported bound.');
    return charge;
}
export function affordableActionOutput(input: {
    budgetMilli: bigint;
    inputTokens: number;
    outputLimit: number;
    tariff: ActionTariff;
    usedNumerator?: bigint;
}): number {
    if (input.budgetMilli < 0n || input.budgetMilli > MAX_CREDIT_MILLI)
        throw new Error('Invalid action budget.');
    const maximum = tokens(input.outputLimit);
    const remaining =
        input.budgetMilli * TOKEN_SCALE -
        (input.usedNumerator ?? 0n) -
        maximumActionChargeNumerator(
            { inputTokens: input.inputTokens, outputTokens: 0 },
            input.tariff,
        );
    if (remaining < 0n) return 0;
    const rate = parseCreditMilli(input.tariff.outputCreditsPerMillionTokens);
    const affordable = rate === 0n ? maximum : remaining / rate;
    return Number(affordable < maximum ? affordable : maximum);
}
