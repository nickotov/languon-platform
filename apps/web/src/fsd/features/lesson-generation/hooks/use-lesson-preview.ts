import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserApiError } from '@languon/browser-auth';
import type { GenerationRunSummary } from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { lessonRunsApi } from '../api/lesson-runs-api';

export function useLessonPreview({
    run,
    actorId,
    request,
    open,
}: {
    run: GenerationRunSummary;
    actorId: string;
    request: ConversationSessionRequest;
    open: boolean;
}) {
    const client = useQueryClient();
    const [deniedScope, setDeniedScope] = useState<string | null>(null);
    const queryKey = [
        'lesson-preview',
        actorId,
        run.conversationId,
        run.id,
        run.revision,
    ];
    const scope = JSON.stringify(queryKey);
    const progress = JSON.stringify([
        run.completedTaskCount,
        run.tasks.map((task) => [
            task.id,
            task.completedUnitCount ?? (task.status === 'completed' ? 1 : 0),
        ]),
    ]);
    const observed = useRef({ scope, progress });
    const accessDenied = deniedScope === scope;
    const query = useQuery({
        queryKey,
        queryFn: async ({ signal }) => {
            try {
                return await lessonRunsApi.preview(
                    request,
                    run.conversationId,
                    run.id,
                    signal,
                );
            } catch (error) {
                if (
                    error instanceof BrowserApiError &&
                    [401, 403, 404].includes(error.status)
                ) {
                    // A revoked source must not remain visible through stale query data.
                    setDeniedScope(scope);
                    client.removeQueries({ queryKey, exact: true });
                }

                throw error;
            }
        },
        enabled: open && run.state !== 'discarded' && !accessDenied,
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: false,
    });
    const refetch = useCallback(() => {
        if (!accessDenied) {
            return query.refetch();
        }
    }, [accessDenied, query.refetch]);

    useEffect(() => {
        const previous = observed.current;
        observed.current = { scope, progress };
        if (previous.scope !== scope || previous.progress === progress) {
            return;
        }

        if (open) {
            void refetch();
        }
    }, [open, scope, progress, refetch]);

    return {
        ...query,
        data: accessDenied ? undefined : query.data,
        isPending: !accessDenied && query.isPending,
        isError: accessDenied || query.isError,
        accessDenied,
        refetch,
    };
}
