import { dictionaryApi } from '@/fsd/entities/dictionary';
import type { DictionaryCard } from '@languon/contracts';
import { useMutation } from '@tanstack/react-query';

import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';

export function useCardLifecycle({
    t,
    queryClient,
    setOutcome,
    dictionaryId,
    requestWithSession,
    cards,
}: Pick<
    ReturnType<typeof useEditorState>,
    't' | 'queryClient' | 'setOutcome' | 'dictionaryId' | 'requestWithSession'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'cards'>) {
    const cardLifecycleMutation = useMutation({
        mutationFn: async (card: DictionaryCard) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            return requestWithSession((token) =>
                dictionaryApi.setCardLifecycle(
                    token,
                    dictionaryId,
                    card.id,
                    card.lifecycle === 'active' ? 'archived' : 'active',
                    {
                        expectedCardVersion: card.version,
                        expectedDictionaryVersion: versions.dictionaryVersion,
                    },
                ),
            );
        },
        onSuccess: async (_, card) => {
            setOutcome(
                card.lifecycle === 'active'
                    ? t('dictionary.cards.archivedOutcome')
                    : t('dictionary.cards.restoredOutcome'),
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

    const reorder = useMutation({
        mutationFn: async ({
            card,
            direction,
        }: {
            card: DictionaryCard;
            direction: -1 | 1;
        }) => {
            const page = cards.data?.pages[0];
            const ordered =
                cards.data?.pages.flatMap((entry) => entry.data) ?? [];
            if (!page) throw new Error('Dictionary unavailable');
            const from = ordered.findIndex((entry) => entry.id === card.id);
            const to = from + direction;
            if (from < 0 || to < 0 || to >= ordered.length) return;
            const ids = ordered.map((entry) => entry.id);
            [ids[from], ids[to]] = [ids[to]!, ids[from]!];
            await requestWithSession((token) =>
                dictionaryApi.reorderCards(token, dictionaryId, {
                    expectedDictionaryVersion: page.dictionaryVersion,
                    orderedCardIds: ids,
                }),
            );
        },
        onSuccess: async () => {
            setOutcome(t('dictionary.cards.reordered'));
            await Promise.all([
                cards.refetch(),
                queryClient.invalidateQueries({
                    queryKey: ['dictionary', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    return { cardLifecycleMutation, reorder };
}
