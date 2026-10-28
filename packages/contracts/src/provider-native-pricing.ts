import { z } from 'zod';

/** Rates retain published precision; settled USD amounts still use whole micros. */
export const ProviderNativeRateSchema = z
    .string()
    .regex(/^(0|[1-9]\d{0,11})(\.\d{1,24})?$/);
const positiveRate = ProviderNativeRateSchema.refine(
    (value) => /[1-9]/.test(value),
    'A positive rate is required.',
);
const identifier = z.string().trim().min(1).max(200);
const canonicalDecimal = (value: string) => {
    const [integer, fractional = ''] = value.split('.');
    const digits = fractional.replace(/0+$/, '');
    return digits ? `${integer}.${digits}` : integer;
};
// JS and database evaluation share millisecond precision; finer boundaries must not be rounded silently.
const instant = z
    .string()
    .datetime({ offset: true })
    .refine(
        (value) => !/\.\d{4}/.test(value),
        'Pricing instants support at most millisecond precision.',
    );
const quantity = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const ProviderNativeUsageMeterSchema = z.enum([
    'inputTokens',
    'uncachedInputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'audioOutputTokens',
    'characters',
    'requests',
]);
export const ProviderNativeRoundingSchema = z
    .object({
        quantum: positiveRate,
        mode: z.enum(['ceil', 'half-up']),
    })
    .strict();
export const ProviderNativeComponentSchema = z
    .object({
        meter: ProviderNativeUsageMeterSchema,
        pricePerUnit: ProviderNativeRateSchema,
        unitQuantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        minimum: ProviderNativeRateSchema.optional(),
        chargeWhen: z.enum(['positive-usage', 'request']),
        rounding: ProviderNativeRoundingSchema.optional(),
    })
    .strict();
const inputRange = z
    .object({
        minInclusive: quantity,
        maxExclusive: quantity.optional(),
    })
    .strict()
    .refine(
        (value) =>
            value.maxExclusive === undefined ||
            value.maxExclusive > value.minInclusive,
        'Token range must be nonempty.',
    );
const dispatchWindow = z
    .object({ from: instant, until: instant })
    .strict()
    .refine(
        (value) => Date.parse(value.from) < Date.parse(value.until),
        'Dispatch window must be nonempty.',
    );
export const ProviderNativeVariantSchema = z
    .object({
        id: identifier,
        applies: z
            .object({
                endpointIds: z.array(identifier).min(1).max(128).optional(),
                serviceTiers: z.array(identifier).min(1).max(16).optional(),
                inputTokens: inputRange.optional(),
                dispatchWindows: z
                    .array(dispatchWindow)
                    .min(1)
                    .max(2048)
                    .optional(),
            })
            .strict(),
        components: z.array(ProviderNativeComponentSchema).min(1).max(16),
        minimumPerRequest: ProviderNativeRateSchema.optional(),
        totalRounding: ProviderNativeRoundingSchema.optional(),
    })
    .strict()
    .refine(
        (value) =>
            new Set(value.components.map((component) => component.meter))
                .size === value.components.length,
        'Each usage meter occurs at most once in a price variant.',
    );
export const ProviderNativePricingRulesSchema = z
    .object({
        version: z.literal(1),
        validFrom: instant,
        validUntil: instant.nullable(),
        currency: z
            .object({
                code: z.string().regex(/^[A-Z][A-Z0-9_]{0,15}$/),
                usdNumerator: positiveRate,
                unitDenominator: positiveRate,
            })
            .strict()
            .optional(),
        reportedCreditUsdPerCredit: positiveRate.optional(),
        variants: z.array(ProviderNativeVariantSchema).min(1).max(128),
    })
    .strict()
    .refine(
        (value) =>
            new TextEncoder().encode(JSON.stringify(value)).byteLength <=
            65_536,
        'Native pricing rules must not exceed 64 KiB.',
    )
    .refine(
        (value) =>
            value.variants.reduce(
                (total, variant) => total + variant.components.length,
                0,
            ) <= 1024 &&
            value.variants.reduce(
                (total, variant) =>
                    total + (variant.applies.dispatchWindows?.length ?? 0),
                0,
            ) <= 2048,
        'Native pricing rules exceed aggregate component or dispatch-window limits.',
    )
    .refine(
        (value) =>
            value.validUntil === null ||
            Date.parse(value.validFrom) < Date.parse(value.validUntil),
        'Pricing validity must be nonempty.',
    )
    .refine(
        (value) =>
            new Set(value.variants.map((variant) => variant.id)).size ===
            value.variants.length,
        'Price variant identities must be unique.',
    )
    .refine(
        (value) =>
            value.currency?.code !== 'USD' ||
            canonicalDecimal(value.currency.usdNumerator) ===
                canonicalDecimal(value.currency.unitDenominator),
        'USD currency has an identity conversion.',
    );
export const ProviderExecutionFactsSchema = z
    .object({
        dispatchedAt: instant,
        endpointId: identifier.optional(),
        serviceTier: identifier.optional(),
        /** Upper-bound evaluation can cover a dispatch horizon, never a guessed actual time. */
        latestDispatchAt: instant.optional(),
    })
    .strict()
    .refine(
        (value) =>
            value.latestDispatchAt === undefined ||
            Date.parse(value.latestDispatchAt) >=
                Date.parse(value.dispatchedAt),
        'Execution horizon must not precede dispatch.',
    );
export const ProviderNativeUsageSchema = z
    .object({
        inputTokens: quantity.optional(),
        outputTokens: quantity.optional(),
        cacheReadTokens: quantity.optional(),
        cacheWriteTokens: quantity.optional(),
        audioOutputTokens: quantity.optional(),
        characters: quantity.optional(),
        requests: z.union([z.literal(0), z.literal(1)]),
        /** Infrastructure may populate this only from a validated provider task response. */
        providerCreditsConsumed: ProviderNativeRateSchema.optional(),
        /** Validated provider-reported USD cost; never supplied by a learner or price administrator. */
        providerCostUsd: ProviderNativeRateSchema.optional(),
    })
    .strict();
export type ProviderNativePricingRules = z.infer<
    typeof ProviderNativePricingRulesSchema
>;
export type ProviderNativeComponent = z.infer<
    typeof ProviderNativeComponentSchema
>;
export type ProviderNativeVariant = z.infer<typeof ProviderNativeVariantSchema>;
export type ProviderNativeRounding = z.infer<
    typeof ProviderNativeRoundingSchema
>;
export type ProviderExecutionFacts = z.infer<
    typeof ProviderExecutionFactsSchema
>;
export type ProviderNativeUsage = z.infer<typeof ProviderNativeUsageSchema>;
export type ProviderNativeUsageMeter = z.infer<
    typeof ProviderNativeUsageMeterSchema
>;

/** Native components must be measurable by the selected execution/accounting path. */
export function nativeProviderPricingMatchesMeter(
    meter: string,
    rules: ProviderNativePricingRules,
): boolean {
    const allowed: readonly ProviderNativeUsageMeter[] =
        meter === 'text-tokens'
            ? [
                  'inputTokens',
                  'uncachedInputTokens',
                  'outputTokens',
                  'cacheReadTokens',
                  'cacheWriteTokens',
                  'requests',
              ]
            : meter === 'speech-characters'
              ? ['characters', 'requests']
              : meter === 'speech-tokens'
                ? ['inputTokens', 'audioOutputTokens', 'requests']
                : [];
    return rules.variants.every((variant) => {
        const meters = new Set(
            variant.components.map((component) => component.meter),
        );
        if (
            variant.components.some(
                (component) => !allowed.includes(component.meter),
            )
        )
            return false;
        // A provider may bill a fixed amount per request irrespective of usage.
        if (allowed.length && meters.size === 1 && meters.has('requests'))
            return true;
        if (meter === 'text-tokens')
            return (
                (meters.has('inputTokens') ||
                    meters.has('uncachedInputTokens')) &&
                meters.has('outputTokens')
            );
        if (meter === 'speech-characters') return meters.has('characters');
        if (meter === 'speech-tokens')
            return meters.has('inputTokens') && meters.has('audioOutputTokens');
        return false;
    });
}

/** One server-issued call receipt per actual provider request; never recurse through usage. */
export const ProviderNativeCallObservationSchema = z
    .object({
        callId: z.uuid(),
        usage: ProviderNativeUsageSchema,
        execution: ProviderExecutionFactsSchema,
    })
    .strict();
export const ProviderNativeCallObservationsSchema = z
    .array(ProviderNativeCallObservationSchema)
    .min(1)
    .max(5)
    .refine(
        (calls) =>
            new Set(calls.map((call) => call.callId)).size === calls.length,
        'Provider call receipt identities must be unique.',
    );
export type ProviderNativeCallObservation = z.infer<
    typeof ProviderNativeCallObservationSchema
>;
export type ProviderNativeCallObservations = z.infer<
    typeof ProviderNativeCallObservationsSchema
>;
