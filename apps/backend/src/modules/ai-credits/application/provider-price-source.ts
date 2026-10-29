import type { ProviderPricePublishRequest } from '@languon/contracts';

export interface ProviderPriceTarget {
    providerId: string;
    modelId: string;
    meter:
        | 'text-tokens'
        | 'speech-characters'
        | 'speech-tokens'
        | 'audio-duration';
}

export type FetchedProviderPrice = Omit<
    ProviderPricePublishRequest,
    'expectedVersion' | 'reason' | 'effectiveAt'
>;

export type ProviderPriceFetchResult =
    | {
          target: ProviderPriceTarget;
          status: 'available';
          price: FetchedProviderPrice;
      }
    | {
          target: ProviderPriceTarget;
          status:
              | 'unsupported'
              | 'unavailable'
              | 'model-not-found'
              | 'source-changed';
          reason: string;
      };

/** Provider-specific discovery is read-only; publishing remains an administrative use case. */
export interface ProviderPriceSource {
    readonly providerId: string;
    fetchPrices(
        targets: ProviderPriceTarget[],
        signal?: AbortSignal,
    ): Promise<ProviderPriceFetchResult[]>;
}
