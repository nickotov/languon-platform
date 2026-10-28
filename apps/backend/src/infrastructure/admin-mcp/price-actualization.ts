import {
    textAiModelCatalog,
    type TextAiProviderCredentials,
} from '../../modules/text-ai/application/text-ai-provider-catalog';
import { SPEECH_MODEL_CATALOG } from '../../modules/speech/domain/speech-models';
import type { ProviderPriceTarget } from '../../modules/ai-credits/application/provider-price-source';

/** Catalog additions inherit pricing discovery; neither MCP nor sources duplicate model IDs. */
export function configuredPriceTargets(
    credentials: TextAiProviderCredentials,
): ProviderPriceTarget[] {
    const configured = (providerId: string) =>
        Boolean(
            credentials[
                `${providerId.toUpperCase()}_API_KEY` as keyof TextAiProviderCredentials
            ],
        );
    return [
        ...textAiModelCatalog
            .filter((m) => !m.retired && configured(m.providerId))
            .map((m): ProviderPriceTarget => ({
                providerId: m.providerId,
                modelId: m.id,
                meter: 'text-tokens',
            })),
        ...SPEECH_MODEL_CATALOG.filter((m) => configured(m.providerId)).map(
            (m): ProviderPriceTarget => ({
                providerId: m.providerId,
                modelId: m.modelId,
                meter: 'speech-characters',
            }),
        ),
    ];
}
