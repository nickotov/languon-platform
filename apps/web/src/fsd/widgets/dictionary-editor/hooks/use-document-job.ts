import { dictionaryApi } from '@/fsd/entities/dictionary';
import { documentGenerationJobForDictionary } from '@/fsd/features/dictionary-document-generation';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { syncDocumentGenerationUrl } from '../lib/generation-url';
import type { useEditorState } from './use-editor-state';

export function useDocumentJob({
    documentGenerationOpen,
    documentGenerationJobId,
    setDocumentGenerationJobId,
    dictionaryId,
    requestWithSession,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 'documentGenerationOpen'
    | 'documentGenerationJobId'
    | 'setDocumentGenerationJobId'
    | 'dictionaryId'
    | 'requestWithSession'
>) {
    const documentGenerationJob = useQuery({
        queryKey: [
            'dictionary-document-generation-job',
            documentGenerationJobId,
        ],
        queryFn: async ({ signal }) => {
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(
                    token,
                    documentGenerationJobId!,
                    signal,
                ),
            );
            return {
                job: documentGenerationJobForDictionary(
                    response.job,
                    dictionaryId,
                ),
            };
        },
        enabled: documentGenerationOpen && documentGenerationJobId !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.job?.state;
            return state === 'awaiting-upload' ||
                state === 'queued' ||
                state === 'running'
                ? 1_000
                : false;
        },
    });

    useEffect(() => {
        if (
            documentGenerationJobId &&
            documentGenerationJob.isSuccess &&
            documentGenerationJob.data.job === null
        ) {
            setDocumentGenerationJobId(null);
            syncDocumentGenerationUrl(null);
        }
    }, [
        documentGenerationJob.data?.job,
        documentGenerationJob.isSuccess,
        documentGenerationJobId,
    ]);

    return { documentGenerationJob };
}
