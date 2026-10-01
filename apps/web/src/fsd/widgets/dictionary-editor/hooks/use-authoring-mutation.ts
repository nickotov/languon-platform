import { dictionaryApi } from '@/fsd/entities/dictionary';
import {
    type DictionaryCardAuthoringAction,
    type DictionaryCardAuthoringSelectedSuggestion,
    type DictionaryCardDraft,
    type DictionaryCardAuthoringGeneration,
    retainCardAuthoringIdempotencyAttempt,
} from '@/fsd/features/dictionary-card-authoring';
import { useMutation } from '@tanstack/react-query';

import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';
import { cardAuthoringAcceptance } from '../lib/card-authoring-acceptance';
import type { useAuthoringCleanup } from './use-authoring-cleanup';
import { regenerateCardAuthoring } from '../api/regenerate-card-authoring';

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
    editingSession,
    queueCardAuthoringCleanup,
    authoringCleanup,
    flushCardAuthoringCleanup,
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
    | 'editingSession'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'cards'> &
    Pick<
        ReturnType<typeof useAuthoringCleanup>,
        | 'queueCardAuthoringCleanup'
        | 'authoringCleanup'
        | 'flushCardAuthoringCleanup'
    >) {
    const cardAuthoringAction = useMutation({
        mutationFn: async (
            action:
                | DictionaryCardAuthoringAction
                | {
                      draft: DictionaryCardDraft;
                      kind: 'accept';
                      selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[];
                      generation?: DictionaryCardAuthoringGeneration;
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
                const generation =
                    action.generation ??
                    (authoringReviewJob
                        ? {
                              jobId: authoringReviewJob.id,
                              format: authoringReviewJob.format,
                          }
                        : undefined);
                if (!generation)
                    throw new Error('Card authoring proposal unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(
                        token,
                        generation.jobId,
                        cardAuthoringAcceptance(
                            action.draft,
                            action.selectedSuggestions,
                            generation,
                        ),
                    ),
                );
            }

            const bodyDraft = {
                overrides: action.draft.overrides,
                translationContext: action.draft.translationContext,
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
                format: 'card-authoring:v3' as const,
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
                    return regenerateCardAuthoring(
                        token,
                        {
                            jobId: authoringReviewJob.id,
                            format: authoringReviewJob.format,
                        },
                        base,
                        action,
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
        onMutate: () => ({ session: editingSession.current }),
        onError: (_error, _action, attempt) => {
            if (attempt?.session !== editingSession.current)
                cardAuthoringAction.reset();
        },
        onSuccess: async (response, _action, attempt) => {
            if (response.job.kind !== 'card-authoring') return;
            if (attempt?.session !== editingSession.current) {
                if (
                    response.job.state === 'queued' ||
                    response.job.state === 'running'
                ) {
                    authoringCleanup.current.cancelJobIds.add(response.job.id);
                } else if (response.job.state === 'review') {
                    authoringCleanup.current.discardJobIds.add(response.job.id);
                }
                void flushCardAuthoringCleanup();
                return;
            }
            if (response.job.state === 'accepted') {
                await queueCardAuthoringCleanup();
                if (attempt.session !== editingSession.current) return;
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
