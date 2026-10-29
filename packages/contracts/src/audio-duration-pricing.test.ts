import { describe, expect, it } from 'vitest';
import {
    ProviderNativeUsageSchema,
    ProviderAudioDurationObservationSchema,
    ProviderAudioDurationBoundSchema,
    providerSecondsToAudioMilliseconds,
    nativeProviderPricingMatchesMeter,
    type ProviderNativePricingRules,
} from './provider-native-pricing';
import { ProviderPricePublishRequestSchema } from './ai-provider-prices';
const rules: ProviderNativePricingRules = {
    version: 1,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: null,
    variants: [
        {
            id: 'duration',
            applies: {},
            components: [
                {
                    meter: 'audioInputMilliseconds',
                    pricePerUnit: '0.0045',
                    unitQuantity: 60_000,
                    chargeWhen: 'positive-usage',
                },
            ],
        },
    ],
};
describe('native audio-duration contract', () => {
    it('accepts integer milliseconds without pretending they are tokens or characters', () => {
        expect(
            ProviderNativeUsageSchema.parse({
                audioInputMilliseconds: 1234,
                requests: 1,
            }),
        ).toEqual({ audioInputMilliseconds: 1234, requests: 1 });
        expect(nativeProviderPricingMatchesMeter('audio-duration', rules)).toBe(
            true,
        );
        for (const meter of [
            'text-tokens',
            'speech-characters',
            'speech-tokens',
        ])
            expect(nativeProviderPricingMatchesMeter(meter, rules)).toBe(false);
        for (const value of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, Infinity])
            expect(
                ProviderNativeUsageSchema.safeParse({
                    audioInputMilliseconds: value,
                    requests: 1,
                }).success,
            ).toBe(false);
    });
    it('converts provider decimal seconds exactly and never rounds missing precision', () => {
        expect(providerSecondsToAudioMilliseconds(1.001)).toBe(1001);
        expect(providerSecondsToAudioMilliseconds(0)).toBe(0);
        expect(providerSecondsToAudioMilliseconds(60)).toBe(60_000);
        expect(providerSecondsToAudioMilliseconds(0.0001)).toBeNull();
        expect(providerSecondsToAudioMilliseconds(1.0001)).toBeNull();
        expect(providerSecondsToAudioMilliseconds(NaN)).toBeNull();
        expect(providerSecondsToAudioMilliseconds(-1)).toBeNull();
        expect(
            providerSecondsToAudioMilliseconds(Number.MAX_SAFE_INTEGER),
        ).toBeNull();
    });
    it('keeps reservation media bounds distinct from provider observation evidence', () => {
        expect(
            ProviderAudioDurationBoundSchema.safeParse({
                provenance: 'verified-media-bound',
                maximumAudioInputMilliseconds: 60000,
            }).success,
        ).toBe(true);
        expect(
            ProviderAudioDurationObservationSchema.safeParse({
                provenance: 'verified-media-bound',
                audioInputMilliseconds: 60000,
            }).success,
        ).toBe(false);
        expect(
            ProviderAudioDurationObservationSchema.safeParse({
                provenance: 'provider-reported',
                audioInputMilliseconds: 60000,
            }).success,
        ).toBe(true);
    });
    it('allows native duration prices but rejects legacy flattened character rates', () => {
        const publication = {
            providerId: 'fixture-transcription',
            modelId: 'duration-test',
            meter: 'audio-duration',
            nativeRules: rules,
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            effectiveAt: '2026-01-01T00:00:00Z',
            sourceReference: 'synthetic-test',
            sourceUrl: null,
            reason: 'Deterministic test price',
            expectedVersion: 0,
        };
        expect(
            ProviderPricePublishRequestSchema.safeParse(publication).success,
        ).toBe(true);
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...publication,
                nativeRules: undefined,
                usdPer1000Characters: '0.0045',
            }).success,
        ).toBe(false);
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...publication,
                meter: 'text-tokens',
            }).success,
        ).toBe(false);
    });
});
