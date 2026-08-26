import type { DictionaryImportPairsGenerationProposalPayload } from '../../domain/batch-generation';
import type { DictionaryImportPairsGenerationInputPayload } from '../../domain/generation';
import type { DictionaryGenerationProviderBudgetPolicy } from './dictionary-generation-provider-policy';

export const dictionaryImportPairsGenerationMinimumInputTokensPerAttempt = 262_144;
export const dictionaryImportPairsGenerationMinimumOutputTokensPerAttempt = 40_960;

export interface ImportPairsProposalGeneratorRequest {
    idempotencyKey: string;
    input: DictionaryImportPairsGenerationInputPayload;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    signal: AbortSignal;
}

export interface ImportPairsProposalGeneratorResult {
    proposal: DictionaryImportPairsGenerationProposalPayload;
    usage: { inputTokens: number; outputTokens: number };
}

export interface ImportPairsProposalGenerator {
    generate(
        request: ImportPairsProposalGeneratorRequest,
    ): Promise<ImportPairsProposalGeneratorResult>;
    readiness?(signal: AbortSignal): Promise<void>;
}
