import type { DictionaryBatchGenerationProposalPayload } from '../../domain/batch-generation';
import type { DictionaryPastedTermsGenerationInputPayload } from '../../domain/generation';
import type { DictionaryGenerationProviderBudgetPolicy } from './dictionary-generation-provider-policy';

// Five 20-row structured calls share one persisted attempt envelope. The input
// ceiling leaves each call at least 52,428 conservative tokens; output leaves
// 8,192 per call. Activation fails closed below either aggregate bound.
export const dictionaryPastedTermsGenerationMinimumInputTokensPerAttempt = 262_144;
export const dictionaryPastedTermsGenerationMinimumOutputTokensPerAttempt = 40_960;

export interface PastedTermsProposalGeneratorRequest {
    idempotencyKey: string;
    input: DictionaryPastedTermsGenerationInputPayload;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    signal: AbortSignal;
}

export interface PastedTermsProposalGeneratorResult {
    proposal: DictionaryBatchGenerationProposalPayload;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
}

export interface PastedTermsProposalGenerator {
    generate(
        request: PastedTermsProposalGeneratorRequest,
    ): Promise<PastedTermsProposalGeneratorResult>;
    readiness?(signal: AbortSignal): Promise<void>;
}
