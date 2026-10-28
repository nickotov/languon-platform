import type { TextAiProviderUsage } from '../../../text-ai/application/ports/text-ai-provider-usage';
import type { TextAiProviderLeaseContext } from '../../../text-ai/application/ports/text-ai-provider-lease-context';
import type {
    EnqueueTextDetectionRequest,
    EnqueueTextTranslationRequest,
    TextDetectionResult,
    TextSourceSegment,
    TextTranslationProposal,
    TextTranslationSegment,
} from '@languon/contracts';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
export type TextJobKind = 'text-detection' | 'text-translation';
export type TextJobInput =
    | ({ kind: 'text-detection' } & EnqueueTextDetectionRequest)
    | ({
          kind: 'text-translation';
          segments: TextSourceSegment[];
      } & EnqueueTextTranslationRequest);
export type TextJobResult = TextDetectionResult | TextTranslationProposal;
export type TextsTokenUsage = TextAiProviderUsage;
export interface TextsProviderCall {
    providerAttempt?: TextAiProviderLeaseContext;
    input: TextJobInput;
    execution: TextAiExecutionSnapshot;
    budget: TextAiProviderBudgetPolicy;
    idempotencyKey: string;
    signal: AbortSignal;
}
export interface TextsAiProvider {
    run(call: TextsProviderCall): Promise<{
        draft: TextDetectionResult | { translation: TextTranslationSegment[] };
        usage?: TextsTokenUsage;
    }>;
}
export class TextsAiError extends Error {
    executionOutcome?: 'rejected' | 'completed' | 'ambiguous';
    constructor(
        readonly code: string,
        message: string = code,
    ) {
        super(message);
        this.name = 'TextsAiError';
    }
}
export class TextsCreditsExhaustedError extends TextsAiError {
    constructor() {
        super('ai_credits_exhausted');
    }
}
export class TextsProviderInvalidOutputError extends TextsAiError {
    override executionOutcome = 'completed' as const;
    constructor(readonly usage?: TextsTokenUsage) {
        super('invalid_model_output');
    }
}
