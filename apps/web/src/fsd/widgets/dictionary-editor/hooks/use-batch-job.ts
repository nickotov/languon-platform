import { dictionaryApi } from '@/fsd/entities/dictionary';
import { batchGenerationJobForDictionary } from '@/fsd/features/dictionary-batch-generation';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { syncBatchGenerationUrl } from '../lib/generation-url';
import type { useEditorState } from './use-editor-state';

export function useBatchJob({
    batchGenerationOpen,
    batchGenerationJobId,
    setBatchGenerationJobId,
    dictionaryId,
    requestWithSession,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 'batchGenerationOpen'
    | 'batchGenerationJobId'
    | 'setBatchGenerationJobId'
    | 'dictionaryId'
    | 'requestWithSession'
>) {
    const batchGenerationJob = useQuery({
        queryKey: ['dictionary-batch-generation-job', batchGenerationJobId],
        queryFn: async ({ signal }) => {
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(
                    token,
                    batchGenerationJobId!,
                    signal,
                ),
            );
            return {
                job: batchGenerationJobForDictionary(
                    response.job,
                    dictionaryId,
                ),
            };
        },
        enabled: batchGenerationOpen && batchGenerationJobId !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.job?.state;
            return state === 'queued' || state === 'running' ? 1_000 : false;
        },
    });

    useEffect(() => {
        if (
            batchGenerationJobId &&
            batchGenerationJob.isSuccess &&
            batchGenerationJob.data.job === null
        ) {
            setBatchGenerationJobId(null);
            syncBatchGenerationUrl(null);
        }
    }, [
        batchGenerationJob.data?.job,
        batchGenerationJob.isSuccess,
        batchGenerationJobId,
    ]);

    return { batchGenerationJob };
}
