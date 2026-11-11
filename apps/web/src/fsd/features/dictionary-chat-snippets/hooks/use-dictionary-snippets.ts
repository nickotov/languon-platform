import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dictionarySnippetsApi } from '../api/dictionary-snippets-api';
import type { DictionarySnippetContext } from '../types';

export function useDictionarySnippets(
    context: DictionarySnippetContext | undefined,
    actorId: string,
    completionKey: string,
    reconciliationKey: number,
) {
    const client = useQueryClient();
    const conversationId = context?.conversationId;
    const queryKey = useMemo(
        () => ['dictionary-chat-snippets', actorId, conversationId],
        [actorId, conversationId],
    );
    const query = useQuery({
        queryKey,
        queryFn: () => dictionarySnippetsApi.list(context!),
        enabled: Boolean(context),
        retry: false,
        staleTime: Infinity,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const previous = useRef({
        actorId,
        conversationId,
        completionKey,
        reconciliationKey,
    });
    const refresh = useCallback(async () => {
        const pending = client.getQueryCache().find({ queryKey, exact: true });
        if (pending?.state.fetchStatus === 'fetching') {
            // Completion may arrive while the initial GET still has an older snapshot.
            await pending.promise?.catch(() => undefined);
        }

        await client.invalidateQueries(
            { queryKey, exact: true },
            { cancelRefetch: false },
        );
    }, [client, queryKey]);

    useEffect(() => {
        const old = previous.current;
        previous.current = {
            actorId,
            conversationId,
            completionKey,
            reconciliationKey,
        };

        if (
            old.actorId !== actorId ||
            old.conversationId !== conversationId ||
            !conversationId
        ) {
            return;
        }

        if (
            old.completionKey !== completionKey ||
            old.reconciliationKey !== reconciliationKey
        ) {
            void refresh();
        }
    }, [actorId, conversationId, completionKey, reconciliationKey, refresh]);

    return { ...query, refresh };
}
