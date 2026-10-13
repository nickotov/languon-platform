import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { useEditorState } from './use-editor-state';

export function useEditorQueries({
    search,
    cardLifecycle,
    cardsQueryKey,
    dictionaryId,
    requestWithSession,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 'search'
    | 'cardLifecycle'
    | 'editing'
    | 'generationTarget'
    | 'cardsQueryKey'
    | 'dictionaryId'
    | 'requestWithSession'
>) {
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });

    const dictionary = useQuery({
        queryKey: ['dictionary', dictionaryId],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readDictionary(token, dictionaryId, signal),
            ),
    });

    const cards = useInfiniteQuery({
        queryKey: cardsQueryKey,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            requestWithSession((token) =>
                dictionaryApi.listCards(
                    token,
                    dictionaryId,
                    {
                        lifecycle: cardLifecycle,
                        limit: 50,
                        ...(pageParam ? { cursor: pageParam } : {}),
                        ...(search.trim() ? { search: search.trim() } : {}),
                    },
                    signal,
                ),
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        enabled: dictionary.isSuccess,
    });

    const generationCapabilities = useQuery({
        queryKey: ['dictionary-generation-capabilities'],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readGenerationCapabilities(token, signal),
            ),
        staleTime: 30_000,
    });

    const audio = { requestWithSession };

    return { languages, dictionary, cards, generationCapabilities, audio };
}
