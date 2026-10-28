import {
    textAiModelCatalog,
    type TextAiProviderCredentials,
} from '../../modules/text-ai/application/text-ai-provider-catalog';
import { SPEECH_MODEL_CATALOG } from '../../modules/speech/domain/speech-models';
import type { ProviderPriceTarget } from '../../modules/ai-credits/application/provider-price-source';
import type { PriceCatalogEntry } from '../../modules/admin-mcp/application/admin-mcp-price-actualization-service';

/** Public source verification includes retired identities and needs no generation credential. */
export function modelPriceCatalog(
    credentials: TextAiProviderCredentials,
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
    return entries;
}
/** Compatibility helper for consumers interested only in configured active entries. */
export function configuredPriceTargets(
    credentials: TextAiProviderCredentials,
): ProviderPriceTarget[] {
    return modelPriceCatalog(credentials)
        .filter((entry) => entry.configured && !entry.retired)
        .map((entry) => entry.target);
}
