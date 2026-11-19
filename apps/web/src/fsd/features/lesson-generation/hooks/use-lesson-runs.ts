import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { lessonRunsApi } from '../api/lesson-runs-api';
import { shareLessonRunCache } from '../lib/lesson-run-cache';
import { useLessonRunActions } from './use-lesson-run-actions';

export function useLessonRuns({
    actorId,
    conversationId,
    request,
    reconciliations,
    onChanged,
}: {
    actorId: string;
    conversationId: string | null;
    request: ConversationSessionRequest;
    reconciliations: number;
    onChanged(): Promise<void>;
}) {
    const client = useQueryClient();
    const scope = `${actorId}:${conversationId}`;
    const observed = useRef({ scope, reconciliations });
    const [verified, setVerified] = useState({ scope, reconciliations });
    const key = ['lesson-runs', actorId, conversationId];
    const query = useQuery({
        queryKey: key,
        queryFn: async ({ signal }) => {
            const snapshot = await lessonRunsApi.list(
                request,
                conversationId!,
                signal,
            );

            return { ...snapshot, publication: 'snapshot' as const };
        },
        enabled: Boolean(conversationId),
        structuralSharing: shareLessonRunCache,
        refetchOnMount: 'always',
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });
    const refreshRuns = useCallback(async () => {
        const details = client.invalidateQueries({
            queryKey: ['lesson-run', actorId, conversationId],
        });

        await client.invalidateQueries({
            queryKey: ['lesson-runs', actorId, conversationId],
            exact: true,
        });

        // Unlock only after the selected run list has actually reconciled.
        if (
            client.getQueryState(['lesson-runs', actorId, conversationId])
                ?.status === 'success'
        ) {
            const completed = { scope, reconciliations };
            setVerified((current) =>
                observed.current.scope === scope &&
                observed.current.reconciliations === reconciliations
                    ? completed
                    : current,
            );
        }

        await details;
    }, [actorId, conversationId, client, scope, reconciliations]);
    const refresh = useCallback(async () => {
        await Promise.all([refreshRuns(), onChanged()]);
    }, [refreshRuns, onChanged]);
    const actions = useLessonRunActions(
        request,
        refresh,
        scope,
        conversationId,
    );

    useEffect(() => {
        const previous = observed.current;
        observed.current = { scope, reconciliations };
        if (previous.scope !== scope) {
            setVerified({ scope, reconciliations });
        }

        if (
            conversationId &&
            previous.scope === scope &&
            reconciliations > previous.reconciliations
        ) {
            // One repair read after an actual connection gap; progress itself is streamed.
            void refreshRuns();
        }
    }, [conversationId, reconciliations, refreshRuns, scope]);

    return {
        runs: (query.data?.runs ?? []).filter(
            (run) => run.conversationId === conversationId,
        ),
        rechecking:
            verified.scope === scope &&
            reconciliations > verified.reconciliations,
        isError: query.isError,
        refresh,
        actions,
    };
}
