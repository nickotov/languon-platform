import type {
    ProviderPrice,
    ProviderPricePublishRequest,
} from '@languon/contracts';
export interface ProviderPriceStore {
    list(): Promise<ProviderPrice[]>;
    publish(
        input: ProviderPricePublishRequest,
        actorId: string,
        at: Date,
    ): Promise<ProviderPrice>;
}
