import type { ProviderPrice } from '@languon/contracts';
import { AccountingInvalidRecordError, parseFixed } from './accounting';

function quantity(value: number): bigint {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new AccountingInvalidRecordError('Invalid provider usage.');
    return BigInt(value);
}
/** Compute a cost from the pinned immutable tariff, rounding upward once to a USD micro. */
export function providerTextExpenseMicros(
    price: ProviderPrice | null,
    usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    },
): bigint | null {
    const input = quantity(usage.inputTokens);
    const output = quantity(usage.outputTokens);
    const read = quantity(usage.cacheReadTokens ?? 0);
    const write = quantity(usage.cacheWriteTokens ?? 0);
    if (read + write > input)
        throw new AccountingInvalidRecordError(
            'Cache quantities exceed input tokens.',
        );
    if (
        !price ||
        price.meter !== 'text-tokens' ||
        price.inputUsdPerMillionTokens === null ||
        price.outputUsdPerMillionTokens === null ||
        (read > 0n && price.cacheReadUsdPerMillionTokens === null) ||
        (write > 0n && price.cacheWriteUsdPerMillionTokens === null)
    )
        return null;
    const numerator =
        (input - read - write) * parseFixed(price.inputUsdPerMillionTokens, 6) +
        output * parseFixed(price.outputUsdPerMillionTokens, 6) +
        read * parseFixed(price.cacheReadUsdPerMillionTokens ?? '0', 6) +
        write * parseFixed(price.cacheWriteUsdPerMillionTokens ?? '0', 6);
    return (numerator + 999999n) / 1000000n;
}
export function providerSpeechExpenseMicros(
    price: Pick<ProviderPrice, 'meter' | 'usdPer1000Characters'> | null,
    characters: number,
): bigint | null {
    const count = quantity(characters);
    if (
        !price ||
        price.meter !== 'speech-characters' ||
        price.usdPer1000Characters === null
    )
        return null;
    return (count * parseFixed(price.usdPer1000Characters, 6) + 999n) / 1000n;
}
