import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { blockProposalsApi } from '../api/block-proposals-api';

export function useBlockProposals({
    actorId,
    conversationId,
    request,
    completionKey,
    reconciliationKey,
}: {
    actorId: string;
    conversationId: string | undefined;
    request: ConversationSessionRequest | undefined;
    completionKey: string;
    reconciliationKey: number;
}) {
    const client = useQueryClient();
    const queryKey = useMemo(
        () => ['knowledge-block-proposals', actorId, conversationId],
        [actorId, conversationId],
    );
    const query = useQuery({
        queryKey,
        // The request has its own bounded timeout. Keeping it alive across a
        // StrictMode effect replay lets Query coalesce the initial history read.
        queryFn: () => blockProposalsApi.list(request!, conversationId!),
        enabled: Boolean(request && conversationId),
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

    const refresh = useCallback(
        async (requiredTurnIds?: readonly string[]) => {
            const pending = client
                .getQueryCache()
                .find({ queryKey, exact: true });

            if (pending?.state.fetchStatus === 'fetching') {
                // A completion can race the initial GET's earlier database snapshot.
                // Wait, then invalidate once; do not cancel and issue overlapping GETs.
                await pending.promise?.catch(() => undefined);
            }

            if (requiredTurnIds?.length) {
                const cached =
                    client.getQueryData<
                        Awaited<ReturnType<typeof blockProposalsApi.list>>
                    >(queryKey);
                const alreadyLoaded = requiredTurnIds.every((turnId) =>
                    cached?.proposals.some(
                        (proposal) => proposal.turnId === turnId,
                    ),
                );

                if (alreadyLoaded) {
                    return;
                }
            }

            await client.invalidateQueries(
                { queryKey, exact: true },
                { cancelRefetch: false },
            );
        },
        [client, queryKey],
    );

    useEffect(() => {
        const old = previous.current;
        previous.current = {
            actorId,
            conversationId,
            completionKey,
            reconciliationKey,
        };

        if (old.actorId !== actorId || old.conversationId !== conversationId) {
            return;
        }

        const priorTurns = new Set(old.completionKey.split(','));
        const completed = completionKey
            .split(',')
            .filter((turnId) => turnId && !priorTurns.has(turnId));

        if (old.reconciliationKey !== reconciliationKey) {
            void refresh();
        } else if (completed.length) {
            void refresh(completed);
        }
    }, [actorId, conversationId, completionKey, reconciliationKey, refresh]);

    return { data: query.data, isError: query.isError, refresh };
}
