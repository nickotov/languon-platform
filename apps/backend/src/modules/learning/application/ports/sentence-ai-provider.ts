import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
import type {
    SentenceCheckDraft,
    SentenceCheckInput,
    SentenceGenerationDraft,
    SentenceGenerationInput,
} from '../../domain/sentence-types';
export interface SentenceTokenUsage {
    inputTokens: number;
    outputTokens: number;
}
export interface SentenceProviderCall<T> {
    input: T;
    execution: TextAiExecutionSnapshot;
    budget: TextAiProviderBudgetPolicy;
    idempotencyKey: string;
    signal: AbortSignal;
}
export interface SentenceAiProvider {
    generate(
        call: SentenceProviderCall<SentenceGenerationInput>,
    ): Promise<{ draft: SentenceGenerationDraft; usage?: SentenceTokenUsage }>;
    check(
        call: SentenceProviderCall<SentenceCheckInput>,
    ): Promise<{ draft: SentenceCheckDraft; usage?: SentenceTokenUsage }>;
}
