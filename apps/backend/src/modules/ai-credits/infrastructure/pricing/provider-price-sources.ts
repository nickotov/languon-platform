import type { ProviderPriceSource } from '../../application/provider-price-source';
import { OpenRouterPriceSource } from './openrouter-price-source';
import { DeepSeekPriceSource } from './deepseek-price-source';
import { EvoLinkPriceSource } from './evolink-price-source';
import { OpenAiTranscriptionPriceSource } from './openai-transcription-price-source';
import { KiePriceSource } from './kie-price-source';

/** Register reviewed sources once per provider; exact model identities come from catalogs. */
export function createProviderPriceSources(
    options: { fetch?: typeof fetch; now?: () => Date } = {},
): ProviderPriceSource[] {
    return [
        new OpenRouterPriceSource(options.fetch, options.now),
        new DeepSeekPriceSource(options.fetch, options.now),
        new EvoLinkPriceSource(options.fetch, options.now),
        new KiePriceSource(options.fetch, options.now),
        new OpenAiTranscriptionPriceSource(options.fetch),
    ];
}
