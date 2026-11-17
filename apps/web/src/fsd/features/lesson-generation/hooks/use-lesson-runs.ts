import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { lessonRunsApi } from '../api/lesson-runs-api';
import { useLessonRunActions } from './use-lesson-run-actions';

export function useLessonRuns({
    actorId,
    conversationId,
    request,
    active,
    revisionKey,
    onChanged,
}: {
    actorId: string;
    conversationId: string | null;
    request: ConversationSessionRequest;
    active: boolean;
    revisionKey: string;
    onChanged(): Promise<void>;
}) {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: ['lesson-runs', actorId, conversationId],
        queryFn: ({ signal }) =>
            lessonRunsApi.list(request, conversationId!, signal),
        enabled: Boolean(conversationId),
        retry: false,
        gcTime: 0,
        refetchInterval: (state) =>
            active ||
            state.state.data?.runs.some((run) => run.state === 'running')
                ? 1500
                : false,
        refetchOnWindowFocus: true,
    });
    const refreshRuns = useCallback(async () => {
        await client.invalidateQueries({
            queryKey: ['lesson-runs', actorId, conversationId],
        });

        await client.invalidateQueries({
            queryKey: ['lesson-run', actorId, conversationId],
        });
    }, [actorId, conversationId, client]);
    const refresh = useCallback(async () => {
        await Promise.all([refreshRuns(), onChanged()]);
    }, [refreshRuns, onChanged]);
    const actions = useLessonRunActions(
        request,
        refresh,
        `${actorId}:${conversationId}`,
    );

    useEffect(() => {
        if (conversationId) {
            void refreshRuns();
        }
    }, [conversationId, revisionKey, refreshRuns]);

    return {
        runs: query.data?.runs ?? [],
        isError: query.isError,
        refresh,
        actions,
    };
}
