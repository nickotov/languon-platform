import type {
    ProviderPriceSource,
    ProviderPriceTarget,
    ProviderPriceFetchResult,
} from '../../application/provider-price-source';
import { KNOWLEDGE_TRANSCRIPTION_MODEL as model } from '../../../knowledge/domain/transcription-model';
import { publishedRate, sourceFailure } from './native-price-source';
import { readPricingText } from './pricing-http';

/** A published headline rate is insufficient to invent file-STT rounding/minimum rules. */
export class OpenAiTranscriptionPriceSource implements ProviderPriceSource {
    readonly providerId = model.providerId;
    constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}
    async fetchPrices(
        targets: ProviderPriceTarget[],
        signal?: AbortSignal,
    ): Promise<ProviderPriceFetchResult[]> {
        const supported = targets.some(
            (target) =>
                target.providerId === model.providerId &&
                target.modelId === model.modelId &&
                target.meter === model.meter,
        );
        let evidence: string | null = null;
        let unavailable = false;
        if (supported) {
            try {
                evidence = await readPricingText(
                    this.fetcher,
                    new URL(model.officialModelUrl),
                    signal,
                );
            } catch {
                signal?.throwIfAborted();
                unavailable = true;
            }
        }
        return targets.map((target) => {
            if (
                target.providerId !== model.providerId ||
                target.modelId !== model.modelId ||
                target.meter !== model.meter
            )
                return sourceFailure(
                    target,
                    'unsupported',
                    'Only the registered direct OpenAI file-transcription route is supported.',
                );
            if (unavailable || evidence === null)
                return sourceFailure(
                    target,
                    'unavailable',
                    'The official transcription model metadata could not be read.',
                );
            const section = evidence
                .split(/^### Transcription audio duration\s*$/m)[1]
                ?.split(/^## /m)[0];
            const price = section?.match(
                /^\| Price \| \$([0-9]+(?:\.[0-9]+)?) \| minute \|\s*$/m,
            )?.[1];
            if (
                !evidence.includes('Model ID: `gpt-transcribe`') ||
                !/^\| Transcription \| `v1\/audio\/transcriptions` \| Supported \|\s*$/m.test(
                    evidence,
                ) ||
                !price
            )
                return sourceFailure(
                    target,
                    'source-changed',
                    'The exact official transcription identity, endpoint or duration-price table changed; review is required.',
                );
            try {
                const rate = publishedRate(price);
                return sourceFailure(
                    target,
                    'source-changed',
                    `The official model page verifies USD ${rate} per minute for gpt-transcribe file transcription. File-transcription minimum and billing-rounding rules remain unverified; no executable native price can be inferred. Review the official billing evidence and publish an explicit native revision through existing administrative preview/apply controls.`,
                );
            } catch {
                return sourceFailure(
                    target,
                    'source-changed',
                    'The official duration rate exceeds the supported exact pricing contract.',
                );
            }
        });
    }
}
