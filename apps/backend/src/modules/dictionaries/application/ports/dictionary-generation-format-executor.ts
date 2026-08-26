import type { DictionaryBatchGenerationProposalPayload } from '../../domain/batch-generation';
import type { DictionaryGenerationInputPayload } from '../../domain/generation';
import type { DictionaryGenerationProviderBudgetPolicy } from './dictionary-generation-provider-policy';

export type DictionaryGenerationExecutionStage =
    | 'scanning'
    | 'extracting'
    | 'ocr'
    | 'generating'
    | 'validating'
    | 'cleaning';

export interface DictionaryGenerationFormatExecutionResult {
    proposal: DictionaryBatchGenerationProposalPayload;
    providerUsage?: { inputTokens: number; outputTokens: number };
}

export interface DictionaryGenerationFormatExecutor<TFormat extends string> {
    readonly format: TFormat;
    execute(input: {
        attempt: number;
        fencingToken: bigint;
        jobId: string;
        leaseDeadline: Date;
        input: Extract<DictionaryGenerationInputPayload, { format: TFormat }>;
        providerBudget: DictionaryGenerationProviderBudgetPolicy;
        reportStage?: (
            stage: DictionaryGenerationExecutionStage,
            percent: number,
        ) => Promise<void>;
        signal: AbortSignal;
        workerId: string;
    }): Promise<DictionaryGenerationFormatExecutionResult>;
    readiness?(signal: AbortSignal): Promise<void>;
}
