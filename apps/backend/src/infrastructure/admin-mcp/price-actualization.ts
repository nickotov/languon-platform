import {
    textAiModelCatalog,
    type TextAiProviderCredentials,
} from '../../modules/text-ai/application/text-ai-provider-catalog';
import { KNOWLEDGE_TRANSCRIPTION_MODEL } from '../../modules/knowledge/domain/transcription-model';
import { SPEECH_MODEL_CATALOG } from '../../modules/speech/domain/speech-models';
import type { ProviderPriceTarget } from '../../modules/ai-credits/application/provider-price-source';
import type { PriceCatalogEntry } from '../../modules/admin-mcp/application/admin-mcp-price-actualization-service';

/** Public source verification includes retired identities and needs no generation credential. */
export function modelPriceCatalog(
    credentials: TextAiProviderCredentials,
    transcriptionCredentials: { OPENAI_API_KEY?: string | undefined } = {},
): PriceCatalogEntry[] {
    const entries: PriceCatalogEntry[] = textAiModelCatalog.map((model) => {
        const configured = Boolean(credentials[model.credentialReference]);
        return {
            target: {
                providerId: model.providerId,
                modelId: model.id,
                meter: 'text-tokens',
            },
            configured,
            retired: model.retired === true,
            executionBlockers: [
                ...(!configured
                    ? ['Provider credentials are not configured.']
                    : []),
                ...(model.retired
                    ? ['This exact model is retired and cannot dispatch.']
                    : []),
                ...(model.processingControlsRevision?.includes(
                    'review-required',
                )
                    ? ['The route processing policy still requires approval.']
                    : []),
            ],
        };
    });
    for (const model of SPEECH_MODEL_CATALOG) {
        if (model.providerId === 'fixture') continue;
        const configured = Boolean(
            credentials[
                `${model.providerId.toUpperCase()}_API_KEY` as keyof TextAiProviderCredentials
            ],
        );
        entries.push({
            target: {
                providerId: model.providerId,
                modelId: model.modelId,
                meter: model.nativeBilling?.meter ?? 'speech-characters',
            },
            configured,
            retired: false,
            executionBlockers: [
                ...(!configured
                    ? ['Provider credentials are not configured.']
                    : []),
                ...(model.nativeBilling &&
                !model.nativeBilling.providerTaskBoundVerified
                    ? [
                          'A provider-backed task spending bound is unverified; upstream model limits alone do not establish it.',
                      ]
                    : []),
            ],
        });
    }
    const transcriptionConfigured = Boolean(
        transcriptionCredentials.OPENAI_API_KEY,
    );
    entries.push({
        target: {
            providerId: KNOWLEDGE_TRANSCRIPTION_MODEL.providerId,
            modelId: KNOWLEDGE_TRANSCRIPTION_MODEL.modelId,
            meter: KNOWLEDGE_TRANSCRIPTION_MODEL.meter,
        },
        configured: transcriptionConfigured,
        retired: false,
        executionBlockers: [
            ...(!transcriptionConfigured
                ? ['Provider credentials are not configured.']
                : []),
            'File-transcription billing minimum and rounding rules require reviewed evidence.',
            'Transcription requires an enabled versioned configuration, explicit customer tariff and a live compatible executor.',
        ],
    });
    return entries;
}
/** Compatibility helper for consumers interested only in configured active entries. */
export function configuredPriceTargets(
    credentials: TextAiProviderCredentials,
    transcriptionCredentials: { OPENAI_API_KEY?: string | undefined } = {},
): ProviderPriceTarget[] {
    return modelPriceCatalog(credentials, transcriptionCredentials)
        .filter((entry) => entry.configured && !entry.retired)
        .map((entry) => entry.target);
}
