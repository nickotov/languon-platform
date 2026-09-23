import { dictionaryApi } from '@/fsd/entities/dictionary';
import { retainIdempotencyAttempt } from '@/fsd/features/dictionary-library';
import type { DictionaryGenerationCandidate } from '@languon/contracts';
import { useMutation } from '@tanstack/react-query';
import { syncBatchGenerationUrl } from '../lib/generation-url';
import type { useBatchJob } from './use-batch-job';
import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';

export function useBatchMutation({
    t,
    queryClient,
    batchGenerationJobId,
    setBatchGenerationJobId,
    setOutcome,
    batchEnqueueAttempt,
    dictionaryId,
    requestWithSession,
    cards,
    batchGenerationJob,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 't'
    | 'queryClient'
    | 'batchGenerationJobId'
    | 'setBatchGenerationJobId'
    | 'setOutcome'
    | 'batchEnqueueAttempt'
    | 'dictionaryId'
    | 'requestWithSession'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'cards'> &
    Pick<ReturnType<typeof useBatchJob>, 'batchGenerationJob'>) {
    const batchGenerationAction = useMutation({
        mutationFn: async (
            action:
                | {
                      kind: 'accept';
                      selected: readonly {
                          candidate: DictionaryGenerationCandidate;
                          rowIndex: number;
                      }[];
                  }
                | { kind: 'cancel' | 'discard' }
                | { context?: string; kind: 'start'; text: string }
                | {
                      kind: 'retry-failures';
                      rowIndexes: readonly number[];
                  },
        ) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            if (action.kind === 'accept') {
                if (!batchGenerationJobId)
                    throw new Error('Batch generation job unavailable');
                const format = batchGenerationJob.data?.job?.format;
                if (
                    format !== 'pasted-terms:v1' &&
                    format !== 'import-pairs:v1'
                )
                    throw new Error('Batch generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(
                        token,
                        batchGenerationJobId,
                        {
                            format,
                            selected: [...action.selected],
                        },
                    ),
                );
            }
            if (action.kind === 'cancel' || action.kind === 'discard') {
                if (!batchGenerationJobId)
                    throw new Error('Batch generation job unavailable');
                return requestWithSession((token) =>
                    action.kind === 'cancel'
                        ? dictionaryApi.cancelGenerationJob(
                              token,
                              batchGenerationJobId,
                          )
                        : dictionaryApi.discardGenerationJob(
                              token,
                              batchGenerationJobId,
                          ),
                );
            }
            if (action.kind === 'retry-failures') {
                if (!batchGenerationJobId)
                    throw new Error('Batch generation job unavailable');
                const rowIndexes = [...action.rowIndexes].sort(
                    (left, right) => left - right,
                );
                const fingerprint = JSON.stringify({
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    jobId: batchGenerationJobId,
                    rowIndexes,
                });
                const attempt = retainIdempotencyAttempt(
                    batchEnqueueAttempt.current,
                    fingerprint,
                );
                batchEnqueueAttempt.current = attempt;
                const retryBody = {
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    rowIndexes,
                };
                const response =
                    batchGenerationJob.data?.job?.kind === 'import-pairs'
                        ? await requestWithSession((token) =>
                              dictionaryApi.retryImportPairsGeneration(
                                  token,
                                  batchGenerationJobId,
                                  retryBody,
                                  attempt.key,
                              ),
                          )
                        : await requestWithSession((token) =>
                              dictionaryApi.retryPastedTermsGeneration(
                                  token,
                                  batchGenerationJobId,
                                  retryBody,
                                  attempt.key,
                              ),
                          );
                batchEnqueueAttempt.current = null;
                return response;
            }
            const text = action.kind === 'start' ? action.text : '';
            const context =
                action.kind === 'start' ? (action.context ?? null) : null;
            const attempt = retainIdempotencyAttempt(
                batchEnqueueAttempt.current,
                JSON.stringify({
                    context,
                    dictionaryId,
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    text,
                }),
            );
            batchEnqueueAttempt.current = attempt;
            const response = await requestWithSession((token) =>
                dictionaryApi.enqueuePastedTermsGeneration(
                    token,
                    dictionaryId,
                    {
                        context,
                        expectedDictionaryVersion: versions.dictionaryVersion,
                        expectedSettingsVersion: versions.settingsVersion,
                        text,
                    },
                    attempt.key,
                ),
            );
            batchEnqueueAttempt.current = null;
            return response;
        },
        onSuccess: async (response) => {
            if (
                response.job.kind !== 'pasted-terms' &&
                response.job.kind !== 'import-pairs'
            )
                return;
            setBatchGenerationJobId(response.job.id);
            syncBatchGenerationUrl(response.job.id);
            queryClient.setQueryData(
                ['dictionary-batch-generation-job', response.job.id],
                { job: response.job },
            );
            if (response.job.state === 'accepted') {
                setOutcome(
                    t('dictionary.batch.saved', {
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

    return { batchGenerationAction };
}
