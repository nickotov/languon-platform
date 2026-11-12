import type { DictionaryLifecycle } from '@languon/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export function useCardSearch(
    dictionaryId: string,
    cardLifecycle: DictionaryLifecycle,
) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [committedSearch, setCommittedSearch] = useState('');
    const normalizedSearch = search.trim();

    useEffect(() => {
        if (normalizedSearch === committedSearch) {
            return;
        }

        const timer = window.setTimeout(() => {
            // A new filter starts at page one, including a previously cached term.
            queryClient.removeQueries({
                exact: true,
                queryKey: [
                    'dictionary-cards',
                    dictionaryId,
                    cardLifecycle,
                    normalizedSearch,
                ],
            });

            setCommittedSearch(normalizedSearch);
        }, 300);

        return () => window.clearTimeout(timer);
    }, [
        normalizedSearch,
        committedSearch,
        dictionaryId,
        cardLifecycle,
        queryClient,
    ]);

    return {
        search,
        setSearch,
        committedSearch,
        searchPending: normalizedSearch !== committedSearch,
    };
}
