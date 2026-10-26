import type { TextAiProviderLeaseContext } from '../../../text-ai/application/ports/text-ai-provider-lease-context';
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
import {
    SentenceInvalidModelOutputError,
    type SentenceModelOutputReason,
} from '../../domain/sentence-errors';
export interface SentenceTokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
/** Usage accompanying rejection has already passed the dispatched call's bounds. */
export class SentenceProviderInvalidModelOutputError extends SentenceInvalidModelOutputError {
    readonly executionOutcome = 'completed' as const;
    readonly usage?: SentenceTokenUsage;
    constructor(reason: SentenceModelOutputReason, usage?: SentenceTokenUsage) {
        super(undefined, reason);
        if (usage) this.usage = { ...usage };
    }
}
export interface SentenceProviderCall<T> {
    providerAttempt?: TextAiProviderLeaseContext;
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
