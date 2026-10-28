import {
    nativeProviderPricingMatchesMeter,
    type ProviderPrice,
    type ProviderExecutionFacts,
} from '@languon/contracts';
import { parseFixed } from './accounting';
import { evaluateNativeProviderCost } from './native-provider-pricing';

export interface ProviderExecutionBudget {
    /** Authoritative native pin; numeric rate fields below are only conservative SDK ceilings. */
    nativeProviderPrice?: ProviderPrice;
    nativeExecutionFacts?: ProviderExecutionFacts;
    nativeMaxCalls?: number;
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
const RATE_SCALE = 10n ** 24n;
function nativeDecimal(value: string): bigint {
    const [whole = '0', digits = ''] = value.split('.');
    return BigInt(whole) * RATE_SCALE + BigInt(digits.padEnd(24, '0'));
}
function nativeDecimalText(value: bigint): string {
    const fraction = (value % RATE_SCALE)
        .toString()
        .padStart(24, '0')
        .replace(/0+$/, '');
    return `${value / RATE_SCALE}${fraction ? `.${fraction}` : ''}`;
}
/** Budget-only envelope bounds mixed endpoints/tiers and repeated component minima across SDK calls. */
export function nativeTextProviderReservationMicros(
    price: ProviderPrice,
    facts: ProviderExecutionFacts,
    inputTokens: number,
    outputTokens: number,
    maximumCalls = 5,
): bigint | null {
    if (
        !price.nativeRules ||
        price.meter !== 'text-tokens' ||
        !nativeProviderPricingMatchesMeter(price.meter, price.nativeRules) ||
        !Number.isInteger(maximumCalls) ||
        maximumCalls < 1 ||
        maximumCalls > 5
    )
        return null;
    const quantities = {
        inputTokens,
        outputTokens,
        audioOutputTokens: 0,
        characters: 0,
        requests: 1 as const,
    };
    const applicability = evaluateNativeProviderCost(
        price.nativeRules,
        facts,
        quantities,
        'upper-bound',
    );
    if (applicability.status !== 'calculated') return null;
    const rates = new Map<
        string,
        (typeof price.nativeRules.variants)[number]['components'][number]
    >();
    const overheads = new Map<string, bigint>();
    let requestOverhead = 0n;
    for (const variant of price.nativeRules.variants) {
        const fixed =
            nativeDecimal(variant.minimumPerRequest ?? '0') +
            nativeDecimal(variant.totalRounding?.quantum ?? '0');
        if (fixed > requestOverhead) requestOverhead = fixed;
        for (const component of variant.components) {
            const previous = rates.get(component.meter);
            if (
                !previous ||
                nativeDecimal(component.pricePerUnit) *
                    BigInt(previous.unitQuantity) >
                    nativeDecimal(previous.pricePerUnit) *
                        BigInt(component.unitQuantity)
            )
                rates.set(component.meter, component);
            const fixedPart =
                nativeDecimal(component.minimum ?? '0') +
                nativeDecimal(component.rounding?.quantum ?? '0');
            if (fixedPart > (overheads.get(component.meter) ?? 0n))
                overheads.set(component.meter, fixedPart);
        }
    }
    const components = [...rates.values()]
        .filter((component) => component.meter !== 'requests')
        .map((component) => ({
            meter: component.meter,
            pricePerUnit: component.pricePerUnit,
            unitQuantity: component.unitQuantity,
            chargeWhen: 'positive-usage' as const,
        }));
    const requestRate = rates.get('requests');
    const unitQuantity = requestRate?.unitQuantity ?? 1;
    const fixed =
        [...overheads.values()].reduce(
            (sum, value) => sum + value,
            requestOverhead,
        ) * BigInt(maximumCalls);
    const requestPrice =
        nativeDecimal(requestRate?.pricePerUnit ?? '0') * BigInt(maximumCalls) +
        fixed * BigInt(unitQuantity);
    components.push({
        meter: 'requests',
        pricePerUnit: nativeDecimalText(requestPrice),
        unitQuantity,
        chargeWhen: 'positive-usage',
    });
    const bound = evaluateNativeProviderCost(
        {
            ...price.nativeRules,
            variants: [{ id: 'reservation-ceiling', applies: {}, components }],
        },
        facts,
        quantities,
        'upper-bound',
    );
    return bound.status === 'calculated' ? bound.micros : null;
}
/** Rate revisions determine costs; configured operator maxima remain unchanged. */
export function reviewedTextProviderBudget<T extends ProviderExecutionBudget>(
    price: ProviderPrice | null,
    configured: T,
    cacheMeters: {
        read: 'priced' | 'input-price-upper-bound' | 'none';
        write: 'priced' | 'none';
    } = { read: 'priced', write: 'priced' },
    executionFacts: ProviderExecutionFacts = {
        dispatchedAt: new Date().toISOString(),
    },
): T {
    if (price?.nativeRules) {
        if (price.meter !== 'text-tokens')
            throw new ProviderCostAdmissionUnavailableError(
                'A native text price is required.',
            );
        count(configured.maxCostMicrosPerAttempt);
        count(configured.maxInputTokensPerAttempt);
        count(configured.maxOutputTokensPerAttempt);
        const ceiling = (inputTokens: number, outputTokens: number) => {
            const result = nativeTextProviderReservationMicros(
                price,
                executionFacts,
                inputTokens,
                outputTokens,
            );
            if (result === null || result > PG_INTEGER_MAX)
                throw new ProviderCostAdmissionUnavailableError(
                    'Native provider rates cannot authorize this dispatch.',
                );
            return Number(result);
        };
        return {
            ...configured,
            nativeProviderPrice: price,
            nativeExecutionFacts: executionFacts,
            nativeMaxCalls: 5,
            inputCostMicrosPerMillionTokens: ceiling(1_000_000, 0),
            outputCostMicrosPerMillionTokens: ceiling(0, 1_000_000),
            minimumCostMicrosPerRequest: ceiling(0, 0),
        };
    }
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
    if (input.budget.nativeProviderPrice?.nativeRules) {
        const remaining =
            count(input.budget.maxCostMicrosPerAttempt) -
            count(input.spentCostMicros ?? 0);
        if (remaining < 0n) return 0;
        const cap = Number(
            outputLimit < count(input.budget.maxOutputTokensPerAttempt)
                ? outputLimit
                : count(input.budget.maxOutputTokensPerAttempt),
        );
        let low = 0;
        let high = cap;
        while (low < high) {
            const mid = Math.floor((low + high + 1) / 2);
            const result = nativeTextProviderReservationMicros(
                input.budget.nativeProviderPrice,
                input.budget.nativeExecutionFacts ?? {
                    dispatchedAt: new Date().toISOString(),
                },
                Number(inputTokens),
                mid,
                input.budget.nativeMaxCalls ?? 5,
            );
            if (result !== null && result <= remaining) low = mid;
            else high = mid - 1;
        }
        return low;
    }
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
