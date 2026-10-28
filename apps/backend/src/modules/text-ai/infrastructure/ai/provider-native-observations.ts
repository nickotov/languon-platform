import { z } from 'zod';
import {
    ProviderExecutionFactsSchema,
    ProviderNativeCallObservationSchema,
    ProviderNativeRateSchema,
    ProviderNativeUsageSchema,
    type ProviderExecutionFacts,
    type ProviderNativeUsage,
} from '@languon/contracts';

const identity = z.string().trim().min(1).max(200);
const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const scalarPrice = z.union([
    ProviderNativeRateSchema,
    z.number().finite().nonnegative().max(1_000_000_000_000),
]);
const wireSchema = z.object({
    provider: identity.nullish(),
    provider_name: identity.nullish(),
    endpoint_id: identity.nullish(),
    service_tier: identity.nullish(),
    usage: z
        .object({
            cost: scalarPrice.nullish(),
            prompt_cache_hit_tokens: tokenCount.nullish(),
            prompt_cache_miss_tokens: tokenCount.nullish(),
            prompt_tokens_details: z
                .object({ cached_tokens: tokenCount.nullish() })
                .nullish(),
            cache_write_tokens: tokenCount.nullish(),
        })
        .nullish(),
});
export interface NativeTextCallReceipt {
    callId: string;
    dispatchedAt: string;
}
export interface NativeTextObservation {
    callId?: string;
    usage: ProviderNativeUsage;
    execution?: ProviderExecutionFacts;
}
const metadataSchema = z.object({
    callId: z.uuid().optional(),
    usage: ProviderNativeUsageSchema,
    execution: ProviderExecutionFactsSchema.optional(),
});

/** Expand an SDK numeric value without rounding it to the money settlement scale. */
export function reportedPriceDecimal(value: string | number): string {
    const source = String(value);
    if (!/[eE]/.test(source)) return ProviderNativeRateSchema.parse(source);
    const match = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(source);
    if (!match) throw new Error('Invalid reported provider price.');
    const whole = match[1]!;
    const fraction = match[2] ?? '';
    const digits = whole + fraction;
    const point = whole.length + Number(match[3]);
    const expanded =
        point <= 0
            ? `0.${'0'.repeat(-point)}${digits}`
            : point >= digits.length
              ? digits + '0'.repeat(point - digits.length)
              : `${digits.slice(0, point)}.${digits.slice(point)}`;
    return ProviderNativeRateSchema.parse(expanded);
}

/** Capture only known billing/identity fields from provider JSON, never model content. */
export function captureNativeTextObservation(
    raw: unknown,
    providerId: string,
    receipt?: NativeTextCallReceipt,
    knownDispatchedAt?: string,
): NativeTextObservation | undefined {
    const parsed = wireSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    const value = parsed.data;
    const cacheRead =
        value.usage?.prompt_cache_hit_tokens ??
        value.usage?.prompt_tokens_details?.cached_tokens;
    const observedAt = receipt?.dispatchedAt ?? knownDispatchedAt;
    const endpointId =
        value.endpoint_id ?? value.provider ?? value.provider_name;
    const usage: ProviderNativeUsage = {
        requests: 1,
        ...(cacheRead == null ? {} : { cacheReadTokens: cacheRead }),
        ...(value.usage?.cache_write_tokens == null
            ? {}
            : { cacheWriteTokens: value.usage.cache_write_tokens }),
        ...(providerId !== 'openrouter' || value.usage?.cost == null
            ? {}
            : { providerCostUsd: reportedPriceDecimal(value.usage.cost) }),
    };
    if (
        !receipt &&
        !observedAt &&
        !endpointId &&
        Object.keys(usage).length === 1
    )
        return undefined;
    return {
        ...(receipt ? { callId: receipt.callId } : {}),
        usage,
        ...(observedAt
            ? {
                  execution: {
                      dispatchedAt: observedAt,
                      ...(endpointId ? { endpointId } : {}),
                      ...(value.service_tier
                          ? { serviceTier: value.service_tier }
                          : {}),
                  },
              }
            : {}),
    };
}

export function readNativeTextObservation(
    value: unknown,
): NativeTextObservation | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as Record<string, unknown>;
    const metadata = source.providerMetadata;
    const candidate =
        metadata && typeof metadata === 'object'
            ? (metadata as Record<string, unknown>).languonNativePricing
            : source.languonNativePricing;
    const parsed = metadataSchema.safeParse(candidate);
    if (!parsed.success) return undefined;
    if (parsed.data.callId && parsed.data.execution)
        ProviderNativeCallObservationSchema.parse({
            callId: parsed.data.callId,
            usage: parsed.data.usage,
            execution: parsed.data.execution,
        });
    return {
        usage: parsed.data.usage,
        ...(parsed.data.callId ? { callId: parsed.data.callId } : {}),
        ...(parsed.data.execution ? { execution: parsed.data.execution } : {}),
    };
}
