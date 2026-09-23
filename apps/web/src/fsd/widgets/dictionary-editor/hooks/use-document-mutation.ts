import { dictionaryApi } from '@/fsd/entities/dictionary';
import {
    documentMediaTypeForFile,
    fileSha256,
} from '@/fsd/features/dictionary-document-generation';
import { retainIdempotencyAttempt } from '@/fsd/features/dictionary-library';
import type { DictionaryGenerationCandidate } from '@languon/contracts';
import { documentIngestionLimitsV1 } from '@languon/contracts';
import { useMutation } from '@tanstack/react-query';
import {
    syncBatchGenerationUrl,
    syncDocumentGenerationUrl,
} from '../lib/generation-url';
import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';

export function useDocumentMutation({
    t,
    queryClient,
    setBatchGenerationOpen,
    setBatchGenerationJobId,
    setDocumentGenerationOpen,
    documentGenerationJobId,
    setDocumentGenerationJobId,
    setOutcome,
    documentRetryAttempt,
    documentUploadAttempt,
    dictionaryId,
    requestWithSession,
    cards,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 't'
    | 'queryClient'
    | 'setBatchGenerationOpen'
    | 'setBatchGenerationJobId'
    | 'setDocumentGenerationOpen'
    | 'documentGenerationJobId'
    | 'setDocumentGenerationJobId'
    | 'setOutcome'
    | 'documentRetryAttempt'
    | 'documentUploadAttempt'
    | 'dictionaryId'
    | 'requestWithSession'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'cards'>) {
    const documentGenerationAction = useMutation({
        mutationFn: async (
            action:
                | {
                      kind: 'accept';
                      selected: readonly {
                          candidate: DictionaryGenerationCandidate;
                          rowIndex: number;
                      }[];
                  }
                | { kind: 'cancel' }
                | { kind: 'discard' }
                | {
                      kind: 'retry-failures';
                      rowIndexes: readonly number[];
                  }
                | { file: File; instruction?: string; kind: 'start' },
        ) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            if (action.kind === 'accept') {
                if (!documentGenerationJobId)
                    throw new Error('Document generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(
                        token,
                        documentGenerationJobId,
                        {
                            format: 'document-terms:v1',
                            selected: [...action.selected],
                        },
                    ),
                );
            }
            if (action.kind === 'cancel' || action.kind === 'discard') {
                if (!documentGenerationJobId)
                    throw new Error('Document generation job unavailable');
                return requestWithSession((token) =>
                    action.kind === 'cancel'
                        ? dictionaryApi.cancelGenerationJob(
                              token,
                              documentGenerationJobId,
                          )
                        : dictionaryApi.discardGenerationJob(
                              token,
                              documentGenerationJobId,
                          ),
                );
            }
            if (action.kind === 'retry-failures') {
                if (!documentGenerationJobId)
                    throw new Error('Document generation job unavailable');
                const rowIndexes = [...action.rowIndexes].sort(
                    (left, right) => left - right,
                );
                const attempt = retainIdempotencyAttempt(
                    documentRetryAttempt.current,
                    JSON.stringify({
                        dictionaryId,
                        expectedDictionaryVersion: versions.dictionaryVersion,
                        expectedSettingsVersion: versions.settingsVersion,
                        jobId: documentGenerationJobId,
                        rowIndexes,
                    }),
                );
                documentRetryAttempt.current = attempt;
                const response = await requestWithSession((token) =>
                    dictionaryApi.retryDocumentTermsGeneration(
                        token,
                        documentGenerationJobId,
                        {
                            expectedDictionaryVersion:
                                versions.dictionaryVersion,
                            expectedSettingsVersion: versions.settingsVersion,
                            rowIndexes,
                        },
                        attempt.key,
                    ),
                );
                documentRetryAttempt.current = null;
                return response;
            }

            const mediaType = documentMediaTypeForFile(action.file);
            if (!mediaType)
                throw new Error(t('dictionary.document.invalidFile'));
            if (
                action.file.size < 1 ||
                action.file.size >
                    documentIngestionLimitsV1.upload.maximumFileBytes
            ) {
                throw new Error(t('dictionary.document.invalidFileSize'));
            }
            const sha256 = await fileSha256(action.file);
            const instruction = action.instruction?.trim() || null;
            const fingerprint = JSON.stringify({
                dictionaryId,
                expectedDictionaryVersion: versions.dictionaryVersion,
                expectedSettingsVersion: versions.settingsVersion,
                instruction,
                mediaType,
                sha256,
                sizeBytes: action.file.size,
            });
            const attempt = retainIdempotencyAttempt(
                documentUploadAttempt.current,
                fingerprint,
            );
            documentUploadAttempt.current = attempt;
            const authorization = await requestWithSession((token) =>
                dictionaryApi.createDocumentUpload(
                    token,
                    dictionaryId,
                    {
                        expectedDictionaryVersion: versions.dictionaryVersion,
                        expectedSettingsVersion: versions.settingsVersion,
                        instruction,
                        mediaType,
                        sha256,
                        sizeBytes: action.file.size,
                    },
                    attempt.key,
                ),
            );
            setDocumentGenerationJobId(authorization.job.id);
            syncDocumentGenerationUrl(authorization.job.id);
            queryClient.setQueryData(
                ['dictionary-document-generation-job', authorization.job.id],
                { job: authorization.job },
            );
            const uploaded = await dictionaryApi.uploadDocument(
                authorization.upload,
                action.file,
            );
            const response = await requestWithSession((token) =>
                dictionaryApi.completeDocumentUpload(
                    token,
                    authorization.upload.id,
                    uploaded,
                ),
            );
            documentUploadAttempt.current = null;
            return response;
        },
        onSuccess: async (response) => {
            if (response.job.kind === 'pasted-terms') {
                setDocumentGenerationOpen(false);
                setDocumentGenerationJobId(null);
                syncDocumentGenerationUrl(null);
                setBatchGenerationOpen(true);
                setBatchGenerationJobId(response.job.id);
                syncBatchGenerationUrl(response.job.id);
                queryClient.setQueryData(
                    ['dictionary-batch-generation-job', response.job.id],
                    { job: response.job },
                );
                return;
            }
            if (response.job.kind !== 'document-terms') return;
            setDocumentGenerationJobId(response.job.id);
            syncDocumentGenerationUrl(response.job.id);
            queryClient.setQueryData(
                ['dictionary-document-generation-job', response.job.id],
                { job: response.job },
            );
            if (response.job.state === 'accepted') {
                setOutcome(
                    t('dictionary.document.saved', {
                        count: response.job.outcome?.cards.length ?? 0,
                    }),
                );
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary-cards', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionaries'],
                    }),
                ]);
            }
        },
    });

    return { documentGenerationAction };
}
