import {
    type KnowledgeTranscriptionAdminConfig,
    type KnowledgeTranscriptionAdminReadiness,
    type ProviderPrice,
} from '@languon/contracts';
import {
    TRANSCRIPTION_DATA_SHARING_ATTESTATION_MS,
    isApprovedTranscriptionProcessingRevision,
} from '../domain/transcription-processing-policy';
import { evaluateNativeProviderCost } from '../../ai-credits/domain/native-provider-pricing';

export interface TranscriptionReadinessOptions {
    credentialsConfigured: boolean;
    executionReady: boolean;
    credentialFingerprint?: string | null | undefined;
    attestedCredentialFingerprint?: string | null | undefined;
    dataSharingAttestedAt?: Date | null | undefined;
    preview?: boolean;
}

/** Configuration readiness is separate from model activation or a paid availability check. */
export function transcriptionAdminReadiness(
    config: KnowledgeTranscriptionAdminConfig | null,
    prices: ProviderPrice[],
    options: TranscriptionReadinessOptions,
): KnowledgeTranscriptionAdminReadiness {
    const reasons: KnowledgeTranscriptionAdminReadiness['reasons'] = [];
    if (
        !isApprovedTranscriptionProcessingRevision(
            config?.processingControlsRevision,
        )
    )
        reasons.push('processing_controls_unapproved');
    if (!config?.dataSharingDisabled || !config.dataSharingEvidence)
        reasons.push('data_sharing_unverified');
    const attestedAt = options.preview
        ? new Date()
        : options.dataSharingAttestedAt;
    if (
        !options.preview &&
        (!attestedAt ||
            attestedAt.getTime() + TRANSCRIPTION_DATA_SHARING_ATTESTATION_MS <=
                Date.now())
    )
        reasons.push('data_sharing_attestation_expired');
    if (
        !options.credentialFingerprint ||
        (!options.preview &&
            options.attestedCredentialFingerprint !==
                options.credentialFingerprint)
    )
        reasons.push('processing_credentials_changed');
    if (!config?.enabled) reasons.push('disabled');
    if (!options.credentialsConfigured) reasons.push('credentials_missing');
    if (!options.executionReady) reasons.push('execution_unavailable');
    if (!config?.billingRulesVerified || !config.billingEvidence)
        reasons.push('billing_unverified');
    if (config?.creditsPerMinute === null || !config)
        reasons.push('tariff_missing');
    const price = prices.find(
        (item) => item.id === config?.providerPriceRevisionId,
    );
    let boundedProviderCostMicros: string | null = null;
    if (!price) reasons.push('provider_price_missing');
    else if (
        price.providerId !== 'openai' ||
        price.modelId !== 'gpt-transcribe' ||
        price.meter !== 'audio-duration' ||
        !price.nativeRules ||
        price.id !== prices[0]?.id
    )
        reasons.push('provider_price_invalid');
    else if (config) {
        const cost = evaluateNativeProviderCost(
            price.nativeRules,
            {
                endpointId: '/v1/audio/transcriptions',
                dispatchedAt: new Date().toISOString(),
            },
            { audioInputMilliseconds: config.maximumDurationMs, requests: 1 },
            'upper-bound',
        );
        if (cost.status === 'unknown')
            reasons.push('provider_bound_unavailable');
        else {
            boundedProviderCostMicros = cost.micros.toString();
            if (cost.micros > BigInt(config.maximumProviderCostMicros))
                reasons.push('provider_budget_exceeded');
        }
    }
    return {
        ready: reasons.length === 0,
        credentialsConfigured: options.credentialsConfigured,
        reasons,
        boundedProviderCostMicros,
    };
}
