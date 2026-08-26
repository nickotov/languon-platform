import type {
    DictionarySingleCardGenerationInputPayload,
    DictionaryGenerationProposalPayload,
} from '../../domain/generation';
import type { DictionaryGenerationProviderBudgetPolicy } from './dictionary-generation-provider-policy';

export interface CardProposalGeneratorRequest {
    idempotencyKey: string;
    input: DictionarySingleCardGenerationInputPayload;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    signal: AbortSignal;
}

export interface CardProposalGeneratorResult {
    proposal: DictionaryGenerationProposalPayload;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}

export type CardProposalGeneratorResponse =
    CardProposalGeneratorResult | DictionaryGenerationProposalPayload;

export interface CardProposalGenerator {
    generate(
        request: CardProposalGeneratorRequest,
    ): Promise<CardProposalGeneratorResponse>;
    readiness?(signal: AbortSignal): Promise<void>;
}

export class CardProposalGeneratorError extends Error {
    public constructor(
        public readonly category:
            | 'invalid_model_output'
            | 'provider_rate_limited'
            | 'provider_timeout'
            | 'provider_unavailable',
    ) {
        super('Card proposal generation failed.');
        this.name = 'CardProposalGeneratorError';
    }
}
