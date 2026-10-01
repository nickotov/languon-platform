import type { DictionaryCardEffectiveSettings } from '@languon/contracts';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringGeneration,
    DictionaryCardAuthoringProposal,
} from '../types';
import {
    cardAuthoringSuggestionIds,
    type DraftVersion,
} from './card-draft-versions';

export function authoringFieldEnabled(
    field: DictionaryCardAuthoringField,
    effective: DictionaryCardEffectiveSettings,
) {
    if (field === 'source' || field === 'translation') return true;
    if (field === 'transcription') return effective.transcriptionEnabled;
    if (field === 'definition') return effective.definitionEnabled;
    if (field === 'example') return effective.exampleEnabled;
    return effective.exampleTranslationEnabled;
}

/** Apply only newly returned choices, coherently against the final Source. */
export function applyAuthoringResult(
    previous: DraftVersion,
    proposal: DictionaryCardAuthoringProposal,
    effective: DictionaryCardEffectiveSettings,
    generation?: DictionaryCardAuthoringGeneration,
): DraftVersion {
    const previousIds = previous.proposal
        ? cardAuthoringSuggestionIds(previous.proposal)
        : new Set<string>();
    const all = [
        ...(proposal.sourceSuggestions ?? []),
        ...proposal.suggestions,
    ];
    const fresh = all.filter((suggestion) => !previousIds.has(suggestion.id));
    const sourceId =
        proposal.sourceResult?.kind === 'suggested'
            ? proposal.sourceResult.suggestionId
            : null;
    const source = fresh.find(
        (suggestion) =>
            suggestion.field === 'source' && suggestion.id === sourceId,
    );
    const values = { ...previous.draft.values };
    if (source) values.source = source.value;
    if (!values.source.trim()) values.source = proposal.source;
    const finalSource = values.source.trim();
    const selectedSuggestions = { ...previous.selectedSuggestions };

    // A normalized Source invalidates older dependent provenance, not dormant values.
    for (const [field, id] of Object.entries(selectedSuggestions)) {
        const suggestion = all.find((candidate) => candidate.id === id);
        if (
            !suggestion ||
            suggestion.value !==
                values[field as DictionaryCardAuthoringField]?.trim() ||
            (suggestion.basisSource !== undefined &&
                suggestion.basisSource !== finalSource)
        ) {
            delete selectedSuggestions[field as DictionaryCardAuthoringField];
        }
    }
    for (const suggestion of fresh) {
        if (!authoringFieldEnabled(suggestion.field, effective)) continue;
        if (suggestion.field === 'source' && suggestion !== source) continue;
        if (
            suggestion.basisSource !== undefined &&
            suggestion.basisSource !== finalSource
        )
            continue;
        values[suggestion.field] = suggestion.value;
        selectedSuggestions[suggestion.field] = suggestion.id;
    }
    return {
        draft: {
            ...previous.draft,
            overrides: { ...previous.draft.overrides },
            values,
        },
        ...(generation ? { generation } : {}),
        hiddenSuggestionIds: new Set(),
        proposal,
        reviewedSuggestionIds: new Set(all.map(({ id }) => id)),
        selectedSuggestions,
    };
}

export function authoringSelections(
    version: DraftVersion,
    effective: DictionaryCardEffectiveSettings,
) {
    return Object.entries(version.selectedSuggestions)
        .filter((entry): entry is [DictionaryCardAuthoringField, string] =>
            Boolean(entry[1]),
        )
        .filter(([field]) => authoringFieldEnabled(field, effective))
        .map(([field, suggestionId]) => ({ field, suggestionId }));
}
