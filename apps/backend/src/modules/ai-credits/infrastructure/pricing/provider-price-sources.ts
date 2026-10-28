import type { ProviderPriceSource } from '../../application/provider-price-source';
import { OpenRouterPriceSource } from './openrouter-price-source';

/** Register independently validated provider adapters here; models are discovered by exact ID. */
export function createProviderPriceSources(
    options: { fetch?: typeof fetch } = {},
): ProviderPriceSource[] {
    return [new OpenRouterPriceSource(options.fetch)];
}
