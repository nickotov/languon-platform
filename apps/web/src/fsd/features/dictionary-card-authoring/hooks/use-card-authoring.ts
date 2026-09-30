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
    const { ai, card, dictionary, onSave, existingSources = [] } = props;
    const state = useCardDraft(props);
    const {
        draft,
        setValue,
        hiddenSuggestionIds,
        setHiddenSuggestionIds,
        proposal,
        isLatestVersion,
        beginSuccessor,
        cancelSuccessor,
        reviewedSuggestionIds,
        setReviewedSuggestionIds,
        selectedSuggestions,
        setSelectedSuggestions,
    } = state;
    const [generatingScope, setGeneratingScope] = useState<
        | { kind: 'all' }
        | { kind: 'field'; field: DictionaryCardAuthoringField }
        | null
    >(null);
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
    const validTranslationContext =
        draft.translationContext === null ||
        (draft.translationContext.trim().length > 0 &&
            [...draft.translationContext].length <= 1000);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (
            active ||
            ai?.pending ||
            ai?.successorActive ||
            !validValues ||
            !validTranslationContext
        )
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

    const selectedSourceSuggestion = proposal?.sourceSuggestions?.find(
        (suggestion) =>
            selectedSuggestions.source === suggestion.id &&
            suggestion.value === draft.values.source.trim(),
    );
    const normalizedCardContext = draft.translationContext?.trim() || null;
    const normalizedDictionaryContext =
        dictionary.translationContext?.trim() || null;
    const effectiveTranslationContext =
        normalizedCardContext ?? normalizedDictionaryContext;
    const contextIsStale = Boolean(
        proposal &&
        (ai?.format === 'card-authoring:v3'
            ? proposal.translationContext !== effectiveTranslationContext
            : effectiveTranslationContext !== null),
    );
    const stale = Boolean(
        proposal &&
        ((proposal.source !== draft.values.source.trim() &&
            !selectedSourceSuggestion) ||
            contextIsStale),
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

    const proposalSuggestions = proposal
        ? [...(proposal.sourceSuggestions ?? []), ...proposal.suggestions]
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
    const proposedSourceId =
        proposal?.sourceResult?.kind === 'suggested'
            ? proposal.sourceResult.suggestionId
            : null;
    const proposedSource = proposedSourceId
        ? proposal?.sourceSuggestions?.find(
              (suggestion) => suggestion.id === proposedSourceId,
          )
        : undefined;
    const sourceReviewRequired = Boolean(
        proposedSource &&
        !hiddenSuggestionIds.has(proposedSource.id) &&
        !reviewedSuggestionIds.has(proposedSource.id) &&
        availableSuggestions.some(
            (suggestion) =>
                suggestion.field !== 'source' &&
                'basisSource' in suggestion &&
                suggestion.basisSource === proposedSource.value,
        ),
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
        if (
            !ai ||
            !validSource ||
            !validTranslationContext ||
            active ||
            !isLatestVersion
        )
            return;
        if (
            scope.kind === 'field' &&
            scope.field === 'exampleTranslation' &&
            !draft.values.example?.trim()
        )
            return;
        const successor = Boolean(proposal) && !stale;
        const createsVersion = Boolean(card) || successor;
        setGeneratingScope(scope);
        if (createsVersion) beginSuccessor();
        try {
            await ai.onAction({
                discardedSuggestionIds: discardedSuggestionIdsForPredecessor(
                    hiddenSuggestionIds,
                    proposal,
                ),
                draft,
                kind: 'generate',
                scope,
                successor,
            });
        } catch {
            if (createsVersion) cancelSuccessor();
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
        proposal,
        isLatestVersion,
        generatingScope,
        reviewedSuggestionIds,
        sourceReviewRequired,
        validSource,
        validValues,
        validTranslationContext,
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
