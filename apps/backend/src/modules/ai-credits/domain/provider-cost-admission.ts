import type { ProviderPrice } from '@languon/contracts';
import { parseFixed } from './accounting';

export interface ProviderExecutionBudget {
    minimumCostMicrosPerRequest?: number;
    inputCostMicrosPerMillionTokens: number;
    outputCostMicrosPerMillionTokens: number;
    maxCostMicrosPerAttempt: number;
    maxInputTokensPerAttempt: number;
    maxOutputTokensPerAttempt: number;
}
export class ProviderCostAdmissionUnavailableError extends Error {}
const MILLION = 1_000_000n;
const PG_INTEGER_MAX = 2_147_483_647n;
function count(value: number): bigint {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new ProviderCostAdmissionUnavailableError(
            'Invalid operator execution allowance.',
        );
    return BigInt(value);
}
function rate(value: string): bigint {
    const result = parseFixed(value, 6);
    if (result > PG_INTEGER_MAX)
        throw new ProviderCostAdmissionUnavailableError(
            'Reviewed provider rate exceeds the supported execution meter.',
        );
    return result;
}
/** Rate revisions determine costs; configured operator maxima remain unchanged. */
export function reviewedTextProviderBudget<T extends ProviderExecutionBudget>(
    price: ProviderPrice | null,
    configured: T,
    cacheMeters: {
        read: 'priced' | 'input-price-upper-bound' | 'none';
        write: 'priced' | 'none';
    } = { read: 'priced', write: 'priced' },
): T {
    if (
        !price ||
        price.meter !== 'text-tokens' ||
        price.inputUsdPerMillionTokens === null ||
        price.outputUsdPerMillionTokens === null
    )
        throw new ProviderCostAdmissionUnavailableError(
            'Reviewed provider input and output rates are required for generation.',
        );
    if (
        (cacheMeters.read === 'priced' &&
            price.cacheReadUsdPerMillionTokens === null) ||
        (cacheMeters.write === 'priced' &&
            price.cacheWriteUsdPerMillionTokens === null)
    )
        throw new ProviderCostAdmissionUnavailableError(
            'Reviewed rates are required for every enabled cache meter.',
        );
    const minimum =
        price.minimumUsdPerRequest == null
            ? 0n
            : rate(price.minimumUsdPerRequest);
    if (price.providerId === 'evolink' && minimum <= 0n)
        throw new ProviderCostAdmissionUnavailableError(
            'Reviewed provider minimum per request is required.',
        );
    count(configured.maxCostMicrosPerAttempt);
    count(configured.maxInputTokensPerAttempt);
    count(configured.maxOutputTokensPerAttempt);
    const inputRates = [
        price.inputUsdPerMillionTokens,
        price.cacheReadUsdPerMillionTokens,
        price.cacheWriteUsdPerMillionTokens,
    ]
        .filter((value): value is string => value !== null)
        .map(rate);
    const maximumInputRate = inputRates.reduce(
        (maximum, value) => (value > maximum ? value : maximum),
        0n,
    );
    return {
        ...configured,
        ...(price.minimumUsdPerRequest == null
            ? {}
            : { minimumCostMicrosPerRequest: Number(minimum) }),
        inputCostMicrosPerMillionTokens: Number(maximumInputRate),
        outputCostMicrosPerMillionTokens: Number(
            rate(price.outputUsdPerMillionTokens),
        ),
    };
}
/** Pessimistic input/cache rate and exact integer arithmetic bound every dispatch. */
export function providerAffordableOutputTokens(input: {
    inputTokens: number;
    outputLimit: number;
    spentCostMicros?: number;
    budget: ProviderExecutionBudget;
}): number {
    const inputTokens = count(input.inputTokens);
    const outputLimit = count(input.outputLimit);
    if (inputTokens > count(input.budget.maxInputTokensPerAttempt)) return 0;
    const inputRate = count(input.budget.inputCostMicrosPerMillionTokens);
    const outputRate = count(input.budget.outputCostMicrosPerMillionTokens);
    const inputCost = (inputTokens * inputRate + MILLION - 1n) / MILLION;
    const remainingBudget =
        count(input.budget.maxCostMicrosPerAttempt) -
        count(input.spentCostMicros ?? 0);
    if (remainingBudget < count(input.budget.minimumCostMicrosPerRequest ?? 0))
        return 0;
    const remaining =
        count(input.budget.maxCostMicrosPerAttempt) -
        count(input.spentCostMicros ?? 0) -
        inputCost;
    if (remaining < 0n) return 0;
    const affordable =
        outputRate === 0n ? outputLimit : (remaining * MILLION) / outputRate;
    const tokenLimit = count(input.budget.maxOutputTokensPerAttempt);
    const cap = outputLimit < tokenLimit ? outputLimit : tokenLimit;
    return Number(affordable < cap ? affordable : cap);
}
