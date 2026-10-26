import type { TextAiProviderLeaseContext } from '../../../text-ai/application/ports/text-ai-provider-lease-context';
import type {
    DictionarySingleCardGenerationInputPayload,
    DictionaryGenerationProposalPayload,
} from '../../domain/generation';
import type { DictionaryGenerationProviderBudgetPolicy } from './dictionary-generation-provider-policy';
import type { TextAiExecutionSnapshot as DictionaryAiExecutionSnapshot } from '../../../text-ai/application/text-ai-provider-catalog';

export interface CardProposalGeneratorRequest {
    providerAttempt?: TextAiProviderLeaseContext;
    idempotencyKey: string;
    input: DictionarySingleCardGenerationInputPayload;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    providerExecution?: DictionaryAiExecutionSnapshot | null;
    signal: AbortSignal;
}

export interface CardProposalGeneratorResult {
    proposal: DictionaryGenerationProposalPayload;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
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
    public executionOutcome?: 'rejected' | 'completed' | 'ambiguous';
    public usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
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
