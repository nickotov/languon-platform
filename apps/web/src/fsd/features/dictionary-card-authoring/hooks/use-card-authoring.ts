import { DictionaryCardValuesSchema } from '@languon/contracts';
import type { FormEvent } from 'react';
import type { DictionaryCardAuthoringField } from '@languon/contracts';
import type { DictionaryCardFormProps } from '../types';
import { useCardDraft } from './use-card-draft';
import { previewCardEffectiveSettings } from '../lib/preview-card-effective-settings';
import { hasLoadedSourceDuplicate } from '../lib/duplicate-source';
import { discardedSuggestionIdsForPredecessor } from '../lib/authoring-job-cleanup';
import { isValidCardAuthoringSource } from '../lib/valid-authoring-source';

export function useCardAuthoring(props: DictionaryCardFormProps) {
    const { ai, dictionary, onSave, existingSources = [] } = props;
    const state = useCardDraft(props);
    const {
        draft,
        setValue,
        hiddenSuggestionIds,
        setHiddenSuggestionIds,
        selectedSuggestions,
        setSelectedSuggestions,
    } = state;

    const effective = previewCardEffectiveSettings(
        dictionary.settings.values,
        draft.overrides,
    );

    const duplicate = hasLoadedSourceDuplicate(
        draft.values.source,
        existingSources,
    );

    const validValues = DictionaryCardValuesSchema.safeParse(
        draft.values,
    ).success;

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (active || ai?.successorActive || !validValues) return;
        try {
            await onSave(
                draft,
                stale
                    ? []
                    : Object.entries(selectedSuggestions)
                          .map(([field, suggestionId]) => ({
                              field: field as DictionaryCardAuthoringField,
                              suggestionId,
                          }))
                          .filter(({ field }) =>
                              field === 'translation'
                                  ? true
                                  : field === 'transcription'
                                    ? effective.transcriptionEnabled
                                    : field === 'definition'
                                      ? effective.definitionEnabled
                                      : field === 'example'
                                        ? effective.exampleEnabled
                                        : effective.exampleTranslationEnabled,
                          ),
            );
        } catch {
            // The owning mutation renders the recoverable error state.
        }
    }

    const validSource = isValidCardAuthoringSource(draft.values.source);

    const stale = Boolean(
        ai?.proposal && ai.proposal.source !== draft.values.source.trim(),
    );

    const active = ai?.job?.state === 'queued' || ai?.job?.state === 'running';

    function acceptSuggestion(
        field: DictionaryCardAuthoringField,
        suggestionId: string,
        value: string,
    ) {
        if (stale) return;
        setValue(field, value, true);
        setSelectedSuggestions((current) => ({
            ...current,
            [field]: suggestionId,
        }));
    }

    function discardSuggestion(
        field: DictionaryCardAuthoringField,
        suggestionId: string,
    ) {
        setHiddenSuggestionIds((current) => new Set(current).add(suggestionId));
        setSelectedSuggestions((current) => {
            if (current[field] !== suggestionId) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    }

    async function generate(
        scope:
            | { kind: 'all' }
            | { kind: 'field'; field: DictionaryCardAuthoringField },
    ) {
        if (!ai || !validSource || active) return;
        try {
            await ai.onAction({
                discardedSuggestionIds: discardedSuggestionIdsForPredecessor(
                    hiddenSuggestionIds,
                    ai.proposal,
                ),
                draft,
                kind: 'generate',
                scope,
                successor: Boolean(ai.proposal) && !stale,
            });
        } catch {
            // The owning orchestration renders a safe recoverable error.
        }
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        void submit(event);
    }

    function regenerateField(field: DictionaryCardAuthoringField) {
        void generate({ kind: 'field', field });
    }

    function generateAll() {
        void generate({ kind: 'all' });
    }

    return {
        ...state,
        effective,
        duplicate,
        active,
        stale,
        validSource,
        validValues,
        acceptSuggestion,
        discardSuggestion,
        regenerateField,
        generateAll,
        handleSubmit,
    };
}
export type CardAuthoring = ReturnType<typeof useCardAuthoring>;
