import type {
    ProviderPrice,
    ProviderExecutionFacts,
    ProviderNativeUsage,
    ProviderNativeCallObservation,
} from '@languon/contracts';
import {
    evaluateNativeProviderCalls,
    evaluateNativeProviderCost,
} from './native-provider-pricing';
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
        providerCostUsd?: string | undefined;
        providerCreditsConsumed?: string | undefined;
        requests?: 0 | 1 | undefined;
        calls?: ProviderNativeCallObservation[] | undefined;
    },
    facts?: ProviderExecutionFacts,
): bigint | null {
    if (price?.nativeRules) {
        if (usage.calls) {
            const result = evaluateNativeProviderCalls(
                price.nativeRules,
                usage.calls,
            );
            return result.status === 'calculated' ? result.micros : null;
        }
        if (!facts) return null;
        const result = evaluateNativeProviderCost(price.nativeRules, facts, {
            ...usage,
            requests: usage.requests ?? 1,
        });
        return result.status === 'calculated' ? result.micros : null;
    }
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
    const tokenCost = (numerator + 999999n) / 1000000n;
    const minimum =
        input + output > 0n
            ? parseFixed(price.minimumUsdPerRequest ?? '0', 6)
            : 0n;
    return tokenCost > minimum ? tokenCost : minimum;
}
export function providerSpeechExpenseMicros(
    price: Pick<
        ProviderPrice,
        | 'meter'
        | 'usdPer1000Characters'
        | 'minimumUsdPerRequest'
        | 'nativeRules'
    > | null,
    characters: number,
    facts?: ProviderExecutionFacts,
    reportedUsage?: Partial<ProviderNativeUsage>,
): bigint | null {
    if (price?.nativeRules) {
        if (!facts) return null;
        const result = evaluateNativeProviderCost(price.nativeRules, facts, {
            ...reportedUsage,
            characters,
            requests: reportedUsage?.requests ?? 1,
        });
        return result.status === 'calculated' ? result.micros : null;
    }
    const count = quantity(characters);
    if (
        !price ||
        price.meter !== 'speech-characters' ||
        price.usdPer1000Characters === null
    )
        return null;
    const metered =
        (count * parseFixed(price.usdPer1000Characters, 6) + 999n) / 1000n;
    const minimum =
        count > 0n ? parseFixed(price.minimumUsdPerRequest ?? '0', 6) : 0n;
    return metered > minimum ? metered : minimum;
}
