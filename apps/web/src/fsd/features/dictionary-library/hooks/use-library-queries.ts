import type { DictionaryLifecycle } from '@languon/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';

export function useLibraryQueries(
    requestWithSession: RequestWithSession,
    lifecycle: DictionaryLifecycle,
    search: string,
) {
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const dictionaries = useInfiniteQuery({
        queryKey: ['dictionaries', lifecycle, search],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            requestWithSession((token) =>
                dictionaryApi.listDictionaries(
                    token,
                    {
                        lifecycle,
                        limit: 25,
                        ...(pageParam ? { cursor: pageParam } : {}),
                        ...(search.trim() ? { search: search.trim() } : {}),
                    },
                    signal,
                ),
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });

    return { languages, dictionaries };
}
