import { dictionaryApi } from '@/fsd/entities/dictionary';
import { type DictionaryCardDraft } from '@/fsd/features/dictionary-card-authoring';
import type { DictionaryCard } from '@languon/contracts';
import { useMutation } from '@tanstack/react-query';

import type { useAuthoringCleanup } from './use-authoring-cleanup';
import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';

export function useCardMutation({
    t,
    queryClient,
    setEditing,
    setAuthoringJobId,
    setAuthoringReviewJob,
    setGenerationCompared,
    setOutcome,
    authoringAttempt,
    dictionaryId,
    requestWithSession,
    dictionary,
    cards,
    queueCardAuthoringCleanup,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 't'
    | 'queryClient'
    | 'setEditing'
    | 'setAuthoringJobId'
    | 'setAuthoringReviewJob'
    | 'setGenerationCompared'
    | 'setOutcome'
    | 'authoringAttempt'
    | 'dictionaryId'
    | 'requestWithSession'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'dictionary' | 'cards'> &
    Pick<ReturnType<typeof useAuthoringCleanup>, 'queueCardAuthoringCleanup'>) {
    const cardMutation = useMutation({
        mutationFn: async (input: {
            card?: DictionaryCard;
            draft: DictionaryCardDraft;
        }) => {
            const current = dictionary.data?.dictionary;
            const versions = cards.data?.pages[0];
            if (!current || !versions)
                throw new Error('Dictionary unavailable');
            if (input.card) {
                return requestWithSession((token) =>
                    dictionaryApi.updateCard(
                        token,
                        dictionaryId,
                        input.card!.id,
                        {
                            expectedCardVersion: input.card!.version,
                            expectedDictionaryVersion:
                                versions.dictionaryVersion,
                            expectedSettingsVersion: versions.settingsVersion,
                            ...input.draft,
                        },
                    ),
                );
            }
            return requestWithSession((token) =>
                dictionaryApi.createCard(token, dictionaryId, {
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    ...input.draft,
                }),
            );
        },
        onSuccess: async (response, input) => {
            setGenerationCompared(false);
            await queueCardAuthoringCleanup();
            setAuthoringJobId(null);
            setAuthoringReviewJob(null);
            authoringAttempt.current = null;
            setEditing((currentEditing) => {
                if (input.card) {
                    return currentEditing !== 'new' &&
                        currentEditing?.id === input.card.id
                        ? null
                        : currentEditing;
                }
                return currentEditing === 'new' ? null : currentEditing;
            });
            setOutcome(
                response.duplicateSource
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
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    return { cardMutation };
}
