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

    function fieldIsEnabled(field: DictionaryCardAuthoringField) {
        if (field === 'translation') return true;
        if (field === 'transcription') return effective.transcriptionEnabled;
        if (field === 'definition') return effective.definitionEnabled;
        if (field === 'example') return effective.exampleEnabled;
        return effective.exampleTranslationEnabled;
    }

    const availableSuggestions =
        ai?.proposal?.suggestions.filter(
            (suggestion) =>
                fieldIsEnabled(suggestion.field) &&
                !hiddenSuggestionIds.has(suggestion.id),
        ) ?? [];
    const availableSuggestionFields = new Set(
        availableSuggestions.map((suggestion) => suggestion.field),
    );
    const bulkAcceptSuggestions = availableSuggestions.filter(
        (suggestion, index, suggestions) =>
            !selectedSuggestions[suggestion.field] &&
            suggestions.findIndex(
                (candidate) => candidate.field === suggestion.field,
            ) === index,
    );

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

    function acceptAllSuggestions() {
        if (stale || active) return;
        for (const suggestion of bulkAcceptSuggestions) {
            acceptSuggestion(
                suggestion.field,
                suggestion.id,
                suggestion.value,
            );
        }
    }

    function discardAllSuggestions() {
        const discardedIds = new Set(
            availableSuggestions.map((suggestion) => suggestion.id),
        );
        setHiddenSuggestionIds(
            (current) => new Set([...current, ...discardedIds]),
        );
        setSelectedSuggestions((current) => {
            const retained = Object.fromEntries(
                Object.entries(current).filter(
                    ([, suggestionId]) => !discardedIds.has(suggestionId),
                ),
            );
            return retained;
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
        acceptAllSuggestions,
        availableSuggestionCount: availableSuggestions.length,
        availableSuggestionFieldCount: availableSuggestionFields.size,
        bulkAcceptSuggestionCount: bulkAcceptSuggestions.length,
        discardSuggestion,
        discardAllSuggestions,
        regenerateField,
        generateAll,
        handleSubmit,
    };
}
export type CardAuthoring = ReturnType<typeof useCardAuthoring>;
