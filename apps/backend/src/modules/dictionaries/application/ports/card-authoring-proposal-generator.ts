import type {
    DictionaryCardAuthoringProviderDelta,
    DictionaryCardAuthoringProviderInput,
} from '../../domain/card-authoring';
import type { DictionaryGenerationProviderBudgetPolicy } from './dictionary-generation-provider-policy';

export interface CardAuthoringProposalGeneratorRequest {
    idempotencyKey: string;
    input: DictionaryCardAuthoringProviderInput;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    signal: AbortSignal;
}

export interface CardAuthoringProposalGeneratorResult {
    delta: DictionaryCardAuthoringProviderDelta;
    usage?: { inputTokens: number; outputTokens: number };
}

export type CardAuthoringProposalGeneratorResponse =
    CardAuthoringProposalGeneratorResult | DictionaryCardAuthoringProviderDelta;

export interface CardAuthoringProposalGenerator {
    generate(
        request: CardAuthoringProposalGeneratorRequest,
    ): Promise<CardAuthoringProposalGeneratorResponse>;
    readiness?(signal: AbortSignal): Promise<void>;
}

export class CardAuthoringProposalGeneratorError extends Error {
    public constructor(
        public readonly category:
            | 'invalid_model_output'
            | 'provider_rate_limited'
            | 'provider_timeout'
            | 'provider_unavailable',
    ) {
        super('Card authoring proposal generation failed.');
        this.name = 'CardAuthoringProposalGeneratorError';
    }
}
