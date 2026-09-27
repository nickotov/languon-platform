import { dictionaryApi } from '@/fsd/entities/dictionary';
import {
    type DictionaryCardAuthoringAction,
    type DictionaryCardAuthoringSelectedSuggestion,
    type DictionaryCardDraft,
    retainCardAuthoringIdempotencyAttempt,
} from '@/fsd/features/dictionary-card-authoring';
import { useMutation } from '@tanstack/react-query';

import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';

export function useAuthoringMutation({
    t,
    queryClient,
    setEditing,
    authoringJobId,
    setAuthoringJobId,
    authoringReviewJob,
    setAuthoringReviewJob,
    setOutcome,
    authoringAttempt,
    dictionaryId,
    requestWithSession,
    cards,
    editing,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 't'
    | 'queryClient'
    | 'setEditing'
    | 'authoringJobId'
    | 'setAuthoringJobId'
    | 'authoringReviewJob'
    | 'setAuthoringReviewJob'
    | 'setOutcome'
    | 'authoringAttempt'
    | 'dictionaryId'
    | 'requestWithSession'
    | 'editing'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'cards'>) {
    const cardAuthoringAction = useMutation({
        mutationFn: async (
            action:
                | DictionaryCardAuthoringAction
                | {
                      draft: DictionaryCardDraft;
                      kind: 'accept';
                      selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[];
                  },
        ) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            if (action.kind === 'cancel') {
                if (!authoringJobId)
                    throw new Error('Card authoring job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.cancelGenerationJob(token, authoringJobId),
                );
            }
            if (action.kind === 'accept') {
                if (!authoringReviewJob)
                    throw new Error('Card authoring proposal unavailable');
                if (authoringReviewJob.format === 'card-authoring:v1') {
                    const selectedSuggestions =
                        action.selectedSuggestions.filter(
                            (
                                selection,
                            ): selection is DictionaryCardAuthoringSelectedSuggestion & {
                                field: Exclude<
                                    DictionaryCardAuthoringSelectedSuggestion['field'],
                                    'source'
                                >;
                            } => selection.field !== 'source',
                        );
                    return requestWithSession((token) =>
                        dictionaryApi.acceptGenerationJob(
                            token,
                            authoringReviewJob.id,
                            {
                                candidate: action.draft,
                                format: 'card-authoring:v1',
                                selectedSuggestions,
                            },
                        ),
                    );
                }
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(
                        token,
                        authoringReviewJob.id,
                        {
                            candidate: action.draft,
                            format: 'card-authoring:v2',
                            selectedSuggestions: action.selectedSuggestions,
                        },
                    ),
                );
            }

            const bodyDraft = {
                overrides: action.draft.overrides,
                values: {
                    definition: action.draft.values.definition,
                    example: action.draft.values.example,
                    exampleTranslation: action.draft.values.exampleTranslation,
                    transcription: action.draft.values.transcription,
                    translation: action.draft.values.translation.trim() || null,
                },
            };
            const source = action.draft.values.source.trim();
            const base = {
                draft: bodyDraft,
                expectedDictionaryVersion: versions.dictionaryVersion,
                expectedSettingsVersion: versions.settingsVersion,
                format: 'card-authoring:v2' as const,
                source,
            };
            const fingerprint = JSON.stringify({
                dictionaryId,
                predecessorId: action.successor ? authoringReviewJob?.id : null,
                request: action.successor
                    ? {
                          ...base,
                          discardedSuggestionIds: action.discardedSuggestionIds,
                          scope: action.scope,
                      }
                    : {
                          ...base,
                          cardId: editing === 'new' ? null : editing?.id,
                          scope: action.scope,
                      },
            });
            const attempt = retainCardAuthoringIdempotencyAttempt(
                authoringAttempt.current,
                fingerprint,
            );
            authoringAttempt.current = attempt;
            const response = await requestWithSession((token) => {
                if (action.successor) {
                    if (!authoringReviewJob)
                        throw new Error('Card authoring proposal unavailable');
                    if (authoringReviewJob.format === 'card-authoring:v1') {
                        const scope = (() => {
                            if (action.scope.kind === 'all') {
                                return action.scope;
                            }
                            if (action.scope.field === 'source') {
                                throw new Error(
                                    'Source generation requires card-authoring:v2',
                                );
                            }
                            return {
                                field: action.scope.field,
                                kind: 'field' as const,
                            };
                        })();
                        return dictionaryApi.regenerateCardAuthoringGeneration(
                            token,
                            authoringReviewJob.id,
                            {
                                ...base,
                                discardedSuggestionIds:
                                    action.discardedSuggestionIds,
                                format: 'card-authoring:v1',
                                scope,
                            },
                            attempt.key,
                        );
                    }
                    return dictionaryApi.regenerateCardAuthoringGeneration(
                        token,
                        authoringReviewJob.id,
                        {
                            ...base,
                            discardedSuggestionIds:
                                action.discardedSuggestionIds,
                            format: 'card-authoring:v2',
                            scope: action.scope,
                        },
                        attempt.key,
                    );
                }
                if (editing && editing !== 'new') {
                    return dictionaryApi.enqueueCardAuthoringUpdateGeneration(
                        token,
                        dictionaryId,
                        editing.id,
                        {
                            ...base,
                            expectedCardVersion: editing.version,
                            scope: action.scope,
                        },
                        attempt.key,
                    );
                }
                return dictionaryApi.enqueueCardAuthoringGeneration(
                    token,
                    dictionaryId,
                    { ...base, scope: action.scope },
                    attempt.key,
                );
            });
            authoringAttempt.current = null;
            return response;
        },
        onSuccess: async (response) => {
            if (response.job.kind !== 'card-authoring') return;
            if (response.job.state === 'accepted') {
                setEditing(null);
                setAuthoringJobId(null);
                setAuthoringReviewJob(null);
                setOutcome(
                    'outcome' in response &&
                        typeof response.outcome === 'object' &&
                        response.outcome !== null &&
                        'duplicateSource' in response.outcome &&
                        response.outcome.duplicateSource
                        ? t('dictionary.card.savedDuplicate')
                        : t('dictionary.card.saved'),
                );
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary-cards', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionaries'],
                    }),
                ]);
                return;
            }
            setAuthoringJobId(response.job.id);
            queryClient.setQueryData(
                ['dictionary-card-authoring-job', response.job.id],
                response.job,
            );
            if (response.job.state === 'review')
                setAuthoringReviewJob(response.job);
        },
    });

    return { cardAuthoringAction };
}
