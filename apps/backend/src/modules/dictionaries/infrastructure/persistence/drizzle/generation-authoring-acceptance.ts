import { DictionaryCardAuthoringV3ProposalSchema } from '@languon/contracts';
import {
    DictionaryCardAuthoringProposalPayloadSchema,
    dictionaryCardAuthoringGenerationFormat,
    dictionaryCardAuthoringGenerationFormatV1,
    dictionaryCardAuthoringGenerationFormatV2,
    usesModernCardAuthoringSemantics,
} from '../../../domain/card-authoring';
import { DictionaryGenerationCandidateConflictError } from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { parseDictionaryGenerationInput } from '../../../domain/generation';
import { normalizeCardValues } from '../../../domain/limits';
import type { JobRow, ProposalRow } from './generation-context';

export function validateAuthoringAcceptance(
    job: JobRow,
    proposal: ProposalRow,
    input: Parameters<DictionaryGenerationStore['acceptCardAuthoring']>[0],
) {
    const stored = DictionaryCardAuthoringProposalPayloadSchema.parse(
        proposal.payload,
    );
    const jobInput = parseDictionaryGenerationInput(job.inputPayload);
    if (
        jobInput.format !== dictionaryCardAuthoringGenerationFormat &&
        jobInput.format !== dictionaryCardAuthoringGenerationFormatV2 &&
        jobInput.format !== dictionaryCardAuthoringGenerationFormatV1
    )
        throw new DictionaryGenerationCandidateConflictError();
    const candidateValues = normalizeCardValues(input.candidate.values);
    const candidateTranslationContext =
        jobInput.format === dictionaryCardAuthoringGenerationFormat
            ? (input.candidate.translationContext ?? null)
            : undefined;
    const proposalTranslationContext =
        jobInput.format === dictionaryCardAuthoringGenerationFormat
            ? DictionaryCardAuthoringV3ProposalSchema.parse(proposal.payload)
                  .translationContext
            : undefined;

    if (
        jobInput.format === dictionaryCardAuthoringGenerationFormat &&
        (input.candidate.translationContext === undefined ||
            candidateTranslationContext !== jobInput.draft.translationContext ||
            proposalTranslationContext !== jobInput.translationContext)
    )
        throw new DictionaryGenerationCandidateConflictError();
    const aiAssisted = input.selectedSuggestions.length > 0;
    if (
        jobInput.format === dictionaryCardAuthoringGenerationFormatV1 &&
        aiAssisted &&
        candidateValues.source !== stored.source
    )
        throw new DictionaryGenerationCandidateConflictError();
    const suggestionsById = new Map(
        [...stored.suggestions, ...(stored.sourceSuggestions ?? [])].map(
            (suggestion) => [suggestion.id, suggestion],
        ),
    );

    for (const selected of input.selectedSuggestions) {
        const suggestion = suggestionsById.get(selected.suggestionId);
        if (
            !suggestion ||
            suggestion.field !== selected.field ||
            candidateValues[selected.field] !== suggestion.value ||
            (suggestion.field !== 'source' &&
                suggestion.basisSource !== undefined &&
                suggestion.basisSource !== candidateValues.source)
        )
            throw new DictionaryGenerationCandidateConflictError();
    }

    if (
        usesModernCardAuthoringSemantics(jobInput.format) &&
        candidateValues.source !== stored.source &&
        input.selectedSuggestions.some(
            (selected) => selected.field !== 'source',
        ) &&
        !input.selectedSuggestions.some(
            (selected) => selected.field === 'source',
        )
    )
        throw new DictionaryGenerationCandidateConflictError();

    return {
        jobInput,
        candidateValues,
        candidateTranslationContext,
        aiAssisted,
    };
}
