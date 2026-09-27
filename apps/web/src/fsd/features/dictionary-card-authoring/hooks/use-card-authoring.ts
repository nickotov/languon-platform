import { DictionaryCardValuesSchema } from '@languon/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardFormProps,
} from '../types';
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
    const [generatingScope, setGeneratingScope] = useState<
        | { kind: 'all' }
        | { kind: 'field'; field: DictionaryCardAuthoringField }
        | null
    >(null);
    const [reviewedSuggestionIds, setReviewedSuggestionIds] = useState<
        Set<string>
    >(() => new Set());

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
        if (active || ai?.pending || ai?.successorActive || !validValues)
            return;
        try {
            await onSave(
                draft,
                stale
                    ? []
                    : Object.entries(selectedSuggestions)
                          .filter(
                              (entry): entry is [string, string] =>
                                  entry[1] !== undefined,
                          )
                          .map(([field, suggestionId]) => ({
                              field: field as DictionaryCardAuthoringField,
                              suggestionId,
                          }))
                          .filter(({ field }) =>
                              field === 'source' || field === 'translation'
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

    const selectedSourceSuggestion = ai?.proposal?.sourceSuggestions?.find(
        (suggestion) =>
            selectedSuggestions.source === suggestion.id &&
            suggestion.value === draft.values.source.trim(),
    );
    const stale = Boolean(
        ai?.proposal &&
        ai.proposal.source !== draft.values.source.trim() &&
        !selectedSourceSuggestion,
    );

    const active = ai?.job?.state === 'queued' || ai?.job?.state === 'running';

    useEffect(() => {
        if (!active && !ai?.pending) setGeneratingScope(null);
    }, [active, ai?.pending, ai?.proposal]);

    function fieldIsEnabled(field: DictionaryCardAuthoringField) {
        if (field === 'source') return true;
        if (field === 'translation') return true;
        if (field === 'transcription') return effective.transcriptionEnabled;
        if (field === 'definition') return effective.definitionEnabled;
        if (field === 'example') return effective.exampleEnabled;
        return effective.exampleTranslationEnabled;
    }

    const proposalSuggestions = ai?.proposal
        ? [...(ai.proposal.sourceSuggestions ?? []), ...ai.proposal.suggestions]
        : [];
    const availableSuggestions =
        proposalSuggestions.filter(
            (suggestion) =>
                fieldIsEnabled(suggestion.field) &&
                !hiddenSuggestionIds.has(suggestion.id),
        ) ?? [];
    const availableSuggestionFields = new Set(
        availableSuggestions.map((suggestion) => suggestion.field),
    );
    const bulkAcceptSuggestions = availableSuggestions.filter(
        (suggestion, index, suggestions) =>
            suggestions.findLastIndex(
                (candidate) => candidate.field === suggestion.field,
            ) === index &&
            selectedSuggestions[suggestion.field] !== suggestion.id,
    );

    function acceptSuggestion(
        field: DictionaryCardAuthoringField,
        suggestionId: string,
        value: string,
    ) {
        const suggestion = proposalSuggestions.find(
            (candidate) => candidate.id === suggestionId,
        );
        const sourceBasisMatches =
            field === 'source' ||
            !suggestion ||
            !('basisSource' in suggestion) ||
            suggestion.basisSource === draft.values.source.trim();
        if (stale || !sourceBasisMatches) return;
        setValue(field, value, true);
        setReviewedSuggestionIds(
            (current) =>
                new Set([
                    ...current,
                    ...proposalSuggestions
                        .filter((candidate) => candidate.field === field)
                        .map((candidate) => candidate.id),
                ]),
        );
        setSelectedSuggestions((current) => ({
            ...current,
            [field]: suggestionId,
        }));
    }

    function discardSuggestion(
        field: DictionaryCardAuthoringField,
        suggestionId: string,
    ) {
        const suggestion = proposalSuggestions.find(
            (candidate) => candidate.id === suggestionId,
        );
        const dependentIds =
            field === 'source' && suggestion
                ? proposalSuggestions
                      .filter(
                          (candidate) =>
                              'basisSource' in candidate &&
                              candidate.basisSource === suggestion.value,
                      )
                      .map((candidate) => candidate.id)
                : [];
        const discardedIds = new Set([suggestionId, ...dependentIds]);
        setHiddenSuggestionIds(
            (current) => new Set([...current, ...discardedIds]),
        );
        setSelectedSuggestions((current) => {
            return Object.fromEntries(
                Object.entries(current).filter(
                    ([, id]) => !id || !discardedIds.has(id),
                ),
            );
        });
    }

    function acceptAllSuggestions() {
        if (stale || active) return;
        const source = bulkAcceptSuggestions.find(
            (suggestion) => suggestion.field === 'source',
        );
        const finalSource = source?.value ?? draft.values.source.trim();
        const accepted = bulkAcceptSuggestions.filter(
            (suggestion) =>
                suggestion.field === 'source' ||
                !('basisSource' in suggestion) ||
                suggestion.basisSource === finalSource,
        );
        for (const suggestion of accepted) {
            setValue(suggestion.field, suggestion.value, true);
        }
        const acceptedFields = new Set(
            accepted.map((suggestion) => suggestion.field),
        );
        setReviewedSuggestionIds(
            (current) =>
                new Set([
                    ...current,
                    ...proposalSuggestions
                        .filter((suggestion) =>
                            acceptedFields.has(suggestion.field),
                        )
                        .map((suggestion) => suggestion.id),
                ]),
        );
        setSelectedSuggestions((current) => ({
            ...current,
            ...Object.fromEntries(
                accepted.map((suggestion) => [suggestion.field, suggestion.id]),
            ),
        }));
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
                    ([, suggestionId]) =>
                        !suggestionId || !discardedIds.has(suggestionId),
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
        if (
            scope.kind === 'field' &&
            scope.field === 'exampleTranslation' &&
            !draft.values.example?.trim()
        )
            return;
        setGeneratingScope(scope);
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
            setGeneratingScope(null);
            // The owning orchestration renders a safe recoverable error.
        }
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        void submit(event);
    }

    function generateField(field: DictionaryCardAuthoringField) {
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
        generatingScope,
        reviewedSuggestionIds,
        validSource,
        validValues,
        acceptSuggestion,
        acceptAllSuggestions,
        availableSuggestionCount: availableSuggestions.length,
        availableSuggestionFieldCount: availableSuggestionFields.size,
        bulkAcceptSuggestionCount: bulkAcceptSuggestions.length,
        discardSuggestion,
        discardAllSuggestions,
        generateField,
        generateAll,
        handleSubmit,
    };
}
export type CardAuthoring = ReturnType<typeof useCardAuthoring>;
