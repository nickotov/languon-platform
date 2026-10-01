import type { DictionaryCardValues } from '@languon/contracts';
import type { DictionaryCardAuthoringField } from '../types';
import type { DraftVersion } from './card-draft-versions';

/** A manual value replaces its AI reference; Source changes invalidate all bases. */
export function editCardDraftValue<K extends keyof DictionaryCardValues>(
    current: DraftVersion,
    key: K,
    value: DictionaryCardValues[K],
): DraftVersion {
    const selectedSuggestions = { ...current.selectedSuggestions };
    if (key === 'source') {
        for (const field of Object.keys(selectedSuggestions))
            delete selectedSuggestions[field as DictionaryCardAuthoringField];
    } else delete selectedSuggestions[key];
    return {
        ...current,
        draft: {
            ...current.draft,
            values: { ...current.draft.values, [key]: value },
        },
        selectedSuggestions,
    };
}
