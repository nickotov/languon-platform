import type { AcceptDictionaryGenerationJobRequest } from '@languon/contracts';
import type {
    DictionaryCardAuthoringGeneration,
    DictionaryCardAuthoringSelectedSuggestion,
    DictionaryCardDraft,
} from '@/fsd/features/dictionary-card-authoring';

export function cardAuthoringAcceptance(
    draft: DictionaryCardDraft,
    selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[],
    generation: DictionaryCardAuthoringGeneration,
): AcceptDictionaryGenerationJobRequest {
    if (generation.format === 'card-authoring:v1') {
        return {
            format: generation.format,
            candidate: { values: draft.values, overrides: draft.overrides },
            selectedSuggestions: selectedSuggestions.filter(
                (
                    selection,
                ): selection is typeof selection & {
                    field: Exclude<typeof selection.field, 'source'>;
                } => selection.field !== 'source',
            ),
        };
    }
    if (generation.format === 'card-authoring:v2') {
        return {
            format: generation.format,
            candidate: { values: draft.values, overrides: draft.overrides },
            selectedSuggestions,
        };
    }
    return { format: generation.format, candidate: draft, selectedSuggestions };
}
