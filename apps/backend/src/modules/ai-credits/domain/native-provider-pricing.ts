import {
    ProviderExecutionFactsSchema,
    ProviderNativePricingRulesSchema,
    ProviderNativeUsageSchema,
    ProviderNativeCallObservationsSchema,
    type ProviderNativeCallObservation,
    type ProviderExecutionFacts,
    type ProviderNativeComponent,
    type ProviderNativePricingRules,
    type ProviderNativeRounding,
    type ProviderNativeUsage,
    type ProviderNativeUsageMeter,
    type ProviderNativeVariant,
} from '@languon/contracts';

type Fraction = { numerator: bigint; denominator: bigint };
type UnknownCost = { status: 'unknown'; reason: string };
type NativeCostSource =
    'native-rules' | 'reported-credits' | 'reported-usd' | 'mixed';
type NativeProviderAmount =
    | UnknownCost
    | {
          status: 'calculated';
          amount: Fraction;
          variantIds: string[];
          costSource: NativeCostSource;
      };
export type NativeProviderCost =
    | {
          status: 'calculated';
          micros: bigint;
          variantIds: string[];
          costSource: NativeCostSource;
      }
    | { status: 'unknown'; reason: string };
const ZERO: Fraction = { numerator: 0n, denominator: 1n };
const USD_MICROS = 1_000_000n;
function gcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}
function fraction(numerator: bigint, denominator: bigint): Fraction {
    const divisor = gcd(numerator, denominator);
    return {
        numerator: numerator / divisor,
        denominator: denominator / divisor,
    };
}
function decimal(value: string): Fraction {
    const [integer = '0', digits = ''] = value.split('.');
    return fraction(
        BigInt(`${integer}${digits}`),
        10n ** BigInt(digits.length),
    );
}
function plus(a: Fraction, b: Fraction): Fraction {
    return fraction(
        a.numerator * b.denominator + b.numerator * a.denominator,
        a.denominator * b.denominator,
    );
}
function times(a: Fraction, b: Fraction): Fraction {
    return fraction(a.numerator * b.numerator, a.denominator * b.denominator);
}
function compare(a: Fraction, b: Fraction): number {
    const delta = a.numerator * b.denominator - b.numerator * a.denominator;
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
function maximum(a: Fraction, b: Fraction): Fraction {
    return compare(a, b) >= 0 ? a : b;
}
function rounded(
    value: Fraction,
    rule: ProviderNativeRounding | undefined,
): Fraction {
    if (!rule) return value;
    const quantum = decimal(rule.quantum);
    const numerator = value.numerator * quantum.denominator;
    const denominator = value.denominator * quantum.numerator;
    const units =
        rule.mode === 'ceil'
            ? (numerator + denominator - 1n) / denominator
            : (2n * numerator + denominator) / (2n * denominator);
    return times({ numerator: units, denominator: 1n }, quantum);
}
function micros(value: Fraction): bigint {
    return (
        (value.numerator * USD_MICROS + value.denominator - 1n) /
        value.denominator
    );
}
function inUsd(value: Fraction, rules: ProviderNativePricingRules): Fraction {
    if (!rules.currency) return value;
    const numerator = decimal(rules.currency.usdNumerator);
    const denominator = decimal(rules.currency.unitDenominator);
    return times(
        value,
        fraction(
            numerator.numerator * denominator.denominator,
            numerator.denominator * denominator.numerator,
        ),
    );
}
function unknown(reason: string): UnknownCost {
    return { status: 'unknown', reason };
}
function isApplicable(
    variant: ProviderNativeVariant,
    facts: ProviderExecutionFacts,
    usage: ProviderNativeUsage,
    mode: 'actual' | 'upper-bound',
    ignoreWindows = false,
): boolean {
    const applies = variant.applies;
    if (
        facts.endpointId &&
        applies.endpointIds &&
        !applies.endpointIds.includes(facts.endpointId)
    )
        return false;
    if (
        facts.serviceTier &&
        applies.serviceTiers &&
        !applies.serviceTiers.includes(facts.serviceTier)
    )
        return false;
    if (applies.inputTokens && usage.inputTokens !== undefined) {
        if (mode === 'upper-bound') {
            if (usage.inputTokens < applies.inputTokens.minInclusive)
                return false;
        } else if (
            usage.inputTokens < applies.inputTokens.minInclusive ||
            (applies.inputTokens.maxExclusive !== undefined &&
                usage.inputTokens >= applies.inputTokens.maxExclusive)
        )
            return false;
    }
    if (!ignoreWindows && applies.dispatchWindows) {
        const first = Date.parse(facts.dispatchedAt);
        const last =
            mode === 'upper-bound'
                ? Date.parse(facts.latestDispatchAt ?? facts.dispatchedAt)
                : first;
        if (
            !applies.dispatchWindows.some(
                (window) =>
                    Date.parse(window.from) <= last &&
                    Date.parse(window.until) > first,
            )
        )
            return false;
    }
    return true;
}
/** Every reachable selector group must have a priced interval throughout a future dispatch horizon. */
function horizonCovered(
    variants: ProviderNativeVariant[],
    first: number,
    last: number,
): boolean {
    if (first === last) return true;
    const groups = new Map<string, ProviderNativeVariant[]>();
    for (const variant of variants) {
        const { dispatchWindows: _windows, ...selectors } = variant.applies;
        const id = JSON.stringify(selectors);
        const group = groups.get(id) ?? [];
        group.push(variant);
        groups.set(id, group);
    }
    for (const group of groups.values()) {
        if (group.some((variant) => !variant.applies.dispatchWindows)) continue;
        const windows = group
            .flatMap((variant) => variant.applies.dispatchWindows ?? [])
            .map(
                (window) =>
                    [
                        Date.parse(window.from),
                        Date.parse(window.until),
                    ] as const,
            )
            .sort((a, b) => a[0] - b[0]);
        let coveredUntil = first;
        for (const [from, until] of windows) {
            if (until <= coveredUntil) continue;
            if (from > coveredUntil) return false;
            coveredUntil = until;
            if (coveredUntil > last) break;
        }
        if (coveredUntil <= last) return false;
    }
    return true;
}
function componentQuantity(
    meter: ProviderNativeUsageMeter,
    usage: ProviderNativeUsage,
    mode: 'actual' | 'upper-bound',
): number | undefined {
    if (meter === 'uncachedInputTokens') {
        if (usage.inputTokens === undefined) return undefined;
        if (mode === 'upper-bound') return usage.inputTokens;
        if (
            usage.cacheReadTokens === undefined ||
            usage.cacheWriteTokens === undefined
        )
            return undefined;
        return (
            usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens
        );
    }
    if (
        mode === 'upper-bound' &&
        (meter === 'cacheReadTokens' || meter === 'cacheWriteTokens')
    )
        return usage[meter] ?? usage.inputTokens;
    return usage[meter];
}
function componentCost(
    component: ProviderNativeComponent,
    usage: ProviderNativeUsage,
    mode: 'actual' | 'upper-bound',
): Fraction | null {
    const count = componentQuantity(component.meter, usage, mode);
    if (count === undefined || count < 0) return null;
    if (component.chargeWhen === 'positive-usage' && count === 0) return ZERO;
    const price = decimal(component.pricePerUnit);
    const amount = fraction(
        price.numerator * BigInt(count),
        price.denominator * BigInt(component.unitQuantity),
    );
    return rounded(
        maximum(amount, decimal(component.minimum ?? '0')),
        component.rounding,
    );
}
function variantCost(
    variant: ProviderNativeVariant,
    usage: ProviderNativeUsage,
    mode: 'actual' | 'upper-bound',
): Fraction | null {
    let amount = ZERO;
    for (const component of variant.components) {
        const part = componentCost(component, usage, mode);
        if (part === null) return null;
        amount = plus(amount, part);
    }
    return rounded(
        maximum(amount, decimal(variant.minimumPerRequest ?? '0')),
        variant.totalRounding,
    );
}
function reportedCost(
    rules: ProviderNativePricingRules,
    usage: ProviderNativeUsage,
):
    | { amount: Fraction; source: 'reported-credits' | 'reported-usd' }
    | 'conflict'
    | null {
    const dollars =
        usage.providerCostUsd === undefined
            ? null
            : decimal(usage.providerCostUsd);
    const credits =
        rules.reportedCreditUsdPerCredit === undefined ||
        usage.providerCreditsConsumed === undefined
            ? null
            : times(
                  decimal(usage.providerCreditsConsumed),
                  decimal(rules.reportedCreditUsdPerCredit),
              );
    if (dollars && credits && compare(dollars, credits) !== 0)
        return 'conflict';
    if (dollars) return { amount: dollars, source: 'reported-usd' };
    return credits ? { amount: credits, source: 'reported-credits' } : null;
}
/** Pure exact pricing evaluation. Unknown evidence never becomes a zero rate or a reservation ceiling. */
function evaluateNativeProviderAmount(
    rawRules: ProviderNativePricingRules,
    rawFacts: ProviderExecutionFacts,
    rawUsage: ProviderNativeUsage,
    mode: 'actual' | 'upper-bound' = 'actual',
): NativeProviderAmount {
    const parsedRules = ProviderNativePricingRulesSchema.safeParse(rawRules);
    const parsedFacts = ProviderExecutionFactsSchema.safeParse(rawFacts);
    const parsedUsage = ProviderNativeUsageSchema.safeParse(rawUsage);
    if (!parsedRules.success || !parsedFacts.success || !parsedUsage.success)
        return unknown('Invalid native pricing or execution evidence.');
    const rules = parsedRules.data;
    const facts = parsedFacts.data;
    const usage = parsedUsage.data;
    if (mode !== 'actual' && mode !== 'upper-bound')
        return unknown('Unknown price evaluation mode.');
    if (
        mode === 'actual' &&
        usage.inputTokens !== undefined &&
        (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) >
            usage.inputTokens
    )
        return unknown('Cache quantities exceed total input tokens.');
    const reported = mode === 'actual' ? reportedCost(rules, usage) : null;
    if (reported === 'conflict')
        return unknown('Provider-reported monetary observations disagree.');
    if (usage.requests === 0) {
        if (
            Object.entries(usage).some(
                ([key, value]) =>
                    key !== 'requests' &&
                    !(
                        mode === 'upper-bound' &&
                        (key === 'providerCostUsd' ||
                            key === 'providerCreditsConsumed')
                    ) &&
                    value !== undefined &&
                    (typeof value === 'number'
                        ? value > 0
                        : /[1-9]/.test(value)),
            )
        )
            return unknown(
                'Usage cannot be positive without a billable request.',
            );
        return {
            status: 'calculated',
            amount: ZERO,
            variantIds: [],
            costSource: 'native-rules',
        };
    }
    const first = Date.parse(facts.dispatchedAt);
    const last =
        mode === 'upper-bound'
            ? Date.parse(facts.latestDispatchAt ?? facts.dispatchedAt)
            : first;
    if (
        first < Date.parse(rules.validFrom) ||
        (rules.validUntil !== null && last >= Date.parse(rules.validUntil))
    )
        return unknown('Pricing is not valid throughout the dispatch period.');
    const selectors = rules.variants.filter((variant) =>
        isApplicable(variant, facts, usage, mode, true),
    );
    if (mode === 'upper-bound' && !horizonCovered(selectors, first, last))
        return unknown(
            'Pricing does not cover every reachable dispatch window.',
        );
    const variants = selectors.filter((variant) =>
        isApplicable(variant, facts, usage, mode),
    );
    if (reported)
        return {
            status: 'calculated',
            amount: reported.amount,
            variantIds: variants.map((variant) => variant.id),
            costSource: reported.source,
        };
    if (variants.length === 0)
        return unknown('No native pricing variant applies to the dispatch.');
    let amount: Fraction | null = null;
    for (const variant of variants) {
        const part = variantCost(variant, usage, mode);
        if (part === null)
            return unknown('Required native usage quantity is unavailable.');
        if (amount !== null && mode === 'actual' && compare(amount, part) !== 0)
            return unknown(
                'Execution evidence does not resolve different native prices.',
            );
        amount = amount === null ? part : maximum(amount, part);
    }
    return {
        status: 'calculated',
        amount: inUsd(amount!, rules),
        variantIds: variants.map((variant) => variant.id),
        costSource: 'native-rules',
    };
}

/** Round to the internal USD micro only after official native billing rules. */
export function evaluateNativeProviderCost(
    rules: ProviderNativePricingRules,
    facts: ProviderExecutionFacts,
    usage: ProviderNativeUsage,
    mode: 'actual' | 'upper-bound' = 'actual',
): NativeProviderCost {
    const result = evaluateNativeProviderAmount(rules, facts, usage, mode);
    if (result.status === 'unknown') return result;
    const amountMicros = micros(result.amount);
    if (amountMicros > 9_223_372_036_854_775_807n)
        return unknown('Provider money range overflow.');
    return {
        status: 'calculated',
        micros: amountMicros,
        variantIds: result.variantIds,
        costSource: result.costSource,
    };
}
/** Component minima and official rounding apply per request, internal micro rounding once per attempt. */
export function evaluateNativeProviderCalls(
    rules: ProviderNativePricingRules,
    rawCalls: ProviderNativeCallObservation[],
    mode: 'actual' | 'upper-bound' = 'actual',
): NativeProviderCost {
    const parsed = ProviderNativeCallObservationsSchema.safeParse(rawCalls);
    if (!parsed.success)
        return unknown('Invalid or duplicate provider call observations.');
    let amount = ZERO;
    const variants = new Set<string>();
    const sources = new Set<NativeCostSource>();
    for (const call of parsed.data) {
        const result = evaluateNativeProviderAmount(
            rules,
            call.execution,
            call.usage,
            mode,
        );
        if (result.status === 'unknown') return result;
        amount = plus(amount, result.amount);
        for (const id of result.variantIds) variants.add(id);
        sources.add(result.costSource);
    }
    const amountMicros = micros(amount);
    if (amountMicros > 9_223_372_036_854_775_807n)
        return unknown('Provider money range overflow.');
    return {
        status: 'calculated',
        micros: amountMicros,
        variantIds: [...variants],
        costSource: sources.size === 1 ? [...sources][0]! : 'mixed',
    };
}
