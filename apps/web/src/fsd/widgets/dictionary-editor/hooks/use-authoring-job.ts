import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { useEditorState } from './use-editor-state';

export function useAuthoringJob({
    editing,
    authoringJobId,
    setAuthoringReviewJob,
    requestWithSession,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 'editing'
    | 'authoringJobId'
    | 'setAuthoringReviewJob'
    | 'requestWithSession'
>) {
    const authoringJob = useQuery({
        queryKey: ['dictionary-card-authoring-job', authoringJobId],
        queryFn: async ({ signal }) => {
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(token, authoringJobId!, signal),
            );
            return response.job.kind === 'card-authoring' ? response.job : null;
        },
        enabled: editing === 'new' && authoringJobId !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.state;
            return state === 'queued' || state === 'running' ? 1_000 : false;
        },
    });

    useEffect(() => {
        if (authoringJob.data?.state === 'review') {
            setAuthoringReviewJob(authoringJob.data);
        }
    }, [authoringJob.data]);

    return { authoringJob };
}
