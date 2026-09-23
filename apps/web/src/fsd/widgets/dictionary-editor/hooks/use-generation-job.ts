import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { syncGenerationUrl } from '../lib/generation-url';
import type { useEditorState } from './use-editor-state';

export function useGenerationJob({
    generationTarget,
    setGenerationTarget,
    dictionaryId,
    requestWithSession,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 'generationTarget'
    | 'setGenerationTarget'
    | 'dictionaryId'
    | 'requestWithSession'
>) {
    const generationJob = useQuery({
        queryKey: [
            'dictionary-generation-job',
            dictionaryId,
            generationTarget?.cardId,
            generationTarget?.jobId,
        ],
        queryFn: async ({ signal }) => {
            if (!generationTarget) return { job: null };
            if (!generationTarget.jobId) {
                return requestWithSession((token) =>
                    dictionaryApi.readLatestCardGeneration(
                        token,
                        dictionaryId,
                        generationTarget.cardId,
                        signal,
                    ),
                );
            }
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(
                    token,
                    generationTarget.jobId!,
                    signal,
                ),
            );
            return {
                job: response.job.kind === 'single-card' ? response.job : null,
            };
        },
        enabled: generationTarget !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.job?.state;
            return state === 'queued' || state === 'running' ? 1_000 : false;
        },
    });

    const generationCard = useQuery({
        queryKey: [
            'dictionary-generation-card',
            dictionaryId,
            generationTarget?.cardId,
        ],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readCard(
                    token,
                    dictionaryId,
                    generationTarget!.cardId,
                    signal,
                ),
            ),
        enabled: generationTarget !== null,
    });

    useEffect(() => {
        const job = generationJob.data?.job;
        if (
            !job ||
            job.kind !== 'single-card' ||
            generationTarget?.jobId === job.id
        )
            return;
        const nextTarget = { cardId: job.cardId, jobId: job.id };
        setGenerationTarget(nextTarget);
        syncGenerationUrl(nextTarget);
    }, [generationJob.data?.job, generationTarget?.jobId]);

    return { generationJob, generationCard };
}
