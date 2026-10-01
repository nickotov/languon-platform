import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CardAutoSaveError, createCardAutoSaver } from '../lib/card-auto-save';
import type {
    DictionaryCardAuthoringGeneration,
    DictionaryCardAuthoringSelectedSuggestion,
    DictionaryCardDraft,
} from '@/fsd/features/dictionary-card-authoring';
import type { useEditorState } from './use-editor-state';
import type { useEditorQueries } from './use-editor-queries';
import type { useAuthoringCleanup } from './use-authoring-cleanup';

export function useCardAutoSave(
    context: Pick<
        ReturnType<typeof useEditorState>,
        | 'dictionaryId'
        | 'requestWithSession'
        | 'editing'
        | 'editingSession'
        | 'setEditing'
        | 'setAuthoringJobId'
        | 'setAuthoringReviewJob'
        | 'authoringAttempt'
        | 'queryClient'
        | 'setOutcome'
        | 't'
    > &
        Pick<ReturnType<typeof useEditorQueries>, 'cards' | 'dictionary'> &
        Pick<
            ReturnType<typeof useAuthoringCleanup>,
            'authoringCleanup' | 'flushCardAuthoringCleanup'
        >,
) {
    const saver = useRef<{
        session: number;
        save: ReturnType<typeof createCardAutoSaver>;
    } | null>(null);
    const cardAutoSave = useMutation({
        onMutate: () => ({ session: context.editingSession.current }),
        onError: (_error, _input, attempt) => {
            if (attempt?.session !== context.editingSession.current)
                cardAutoSave.reset();
        },
        mutationFn: async (input: {
            draft: DictionaryCardDraft;
            selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[];
            generation: DictionaryCardAuthoringGeneration;
        }) => {
            const card = context.editing;
            const versions = context.cards.data?.pages[0];
            if (!card || card === 'new' || !versions)
                throw new Error('Card unavailable');
            const session = context.editingSession.current;
            if (saver.current?.session !== session) {
                saver.current = {
                    session,
                    save: createCardAutoSaver(
                        context.dictionaryId,
                        context.requestWithSession,
                    ),
                };
            }
            const response = await saver.current.save({
                ...input,
                card,
                dictionaryVersion: versions.dictionaryVersion,
                settingsVersion: versions.settingsVersion,
            });
            if (context.editingSession.current !== session) {
                throw new CardAutoSaveError(
                    new Error('The editing session closed.'),
                    false,
                );
            }
            context.setEditing(response.card);
            if (!input.selectedSuggestions.length) {
                context.authoringCleanup.current.discardJobIds.add(
                    input.generation.jobId,
                );
                void context.flushCardAuthoringCleanup();
            }
            context.setAuthoringJobId(null);
            context.setAuthoringReviewJob(null);
            context.authoringAttempt.current = null;
            // Keep the current list's optimistic versions usable for immediate regeneration.
            context.queryClient.setQueriesData<
                NonNullable<typeof context.cards.data>
            >(
                { queryKey: ['dictionary-cards', context.dictionaryId] },
                (data) =>
                    data
                        ? {
                              ...data,
                              pages: data.pages.map((page) => ({
                                  ...page,
                                  dictionaryVersion: response.dictionaryVersion,
                                  settingsVersion:
                                      response.card.settingsVersion,
                                  data: page.data.map((entry) =>
                                      entry.id === response.card.id
                                          ? response.card
                                          : entry,
                                  ),
                              })),
                          }
                        : data,
            );
            context.queryClient.setQueryData(
                ['dictionary-card', context.dictionaryId, response.card.id],
                response,
            );
            context.setOutcome(
                context.t(
                    response.unchanged
                        ? 'dictionary.generation.progressUnchanged'
                        : response.duplicateSource
                          ? 'dictionary.card.savedDuplicate'
                          : 'dictionary.card.saved',
                ),
            );
            void Promise.all([
                context.queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', context.dictionaryId],
                }),
                context.queryClient.invalidateQueries({
                    queryKey: ['dictionary', context.dictionaryId],
                }),
                context.queryClient.invalidateQueries({
                    queryKey: ['dictionaries'],
                }),
            ]);
            return response;
        },
    });
    return { cardAutoSave };
}
