import { syncBatchGenerationUrl } from '../lib/generation-url';

import { dictionaryApi } from '@/fsd/entities/dictionary';
import {
    copyDictionaryExport,
    saveDictionaryExport,
} from '@/fsd/features/dictionary-interchange';
import { retainIdempotencyAttempt } from '@/fsd/features/dictionary-library';
import type {
    DictionaryExportFormat,
    ImportDictionaryRequest,
    PreviewDictionaryImportRequest,
} from '@languon/contracts';
import { useMutation } from '@tanstack/react-query';

import type { useEditorState } from './use-editor-state';

export function useInterchangeMutations({
    t,
    queryClient,
    setBatchGenerationOpen,
    setBatchGenerationJobId,
    setInterchangeOpen,
    setInterchangePreview,
    setOutcome,
    interchangeAttempt,
    dictionaryId,
    requestWithSession,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 't'
    | 'queryClient'
    | 'setBatchGenerationOpen'
    | 'setBatchGenerationJobId'
    | 'setInterchangeOpen'
    | 'setInterchangePreview'
    | 'setOutcome'
    | 'interchangeAttempt'
    | 'dictionaryId'
    | 'requestWithSession'
>) {
    const interchangePreviewAction = useMutation({
        mutationFn: (body: PreviewDictionaryImportRequest) =>
            requestWithSession((token) =>
                dictionaryApi.previewImport(token, body),
            ),
        onSuccess: (response) => setInterchangePreview(response),
    });

    const interchangeImportAction = useMutation({
        mutationFn: (body: ImportDictionaryRequest) => {
            const fingerprint = JSON.stringify(body);
            interchangeAttempt.current = retainIdempotencyAttempt(
                interchangeAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) =>
                dictionaryApi.importDictionary(
                    token,
                    body,
                    interchangeAttempt.current!.key,
                ),
            );
        },
        onSuccess: async (response) => {
            interchangeAttempt.current = null;
            setInterchangeOpen(null);
            setInterchangePreview(null);
            if (response.mode === 'ai') {
                setBatchGenerationOpen(true);
                setBatchGenerationJobId(response.job.id);
                syncBatchGenerationUrl(response.job.id);
                queryClient.setQueryData(
                    ['dictionary-batch-generation-job', response.job.id],
                    { job: response.job },
                );
                return;
            }
            setOutcome(
                t('dictionary.interchange.imported', {
                    count: response.cards.length,
                }),
            );
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', dictionaryId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['dictionary', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    const interchangeExportAction = useMutation({
        mutationFn: async (format: DictionaryExportFormat) => {
            if (format === 'quizlet-text') {
                const result = await requestWithSession((token) =>
                    dictionaryApi.exportDictionary(token, dictionaryId, format),
                );
                await copyDictionaryExport(result.response);
                return 'copied' as const;
            }
            const saved = await saveDictionaryExport({
                contentType: 'text/csv; charset=utf-8',
                description: t('dictionary.interchange.exportTypeDescription'),
                load: () =>
                    requestWithSession((token) =>
                        dictionaryApi.exportDictionary(
                            token,
                            dictionaryId,
                            format,
                        ),
                    ),
                suggestedName: `dictionary-${dictionaryId}.csv`,
            });
            return saved === 'saved' ? ('downloaded' as const) : null;
        },
        onSuccess: (result) => {
            if (result)
                setOutcome(
                    result === 'copied'
                        ? t('dictionary.interchange.copied')
                        : t('dictionary.interchange.downloaded'),
                );
        },
    });

    return {
        interchangePreviewAction,
        interchangeImportAction,
        interchangeExportAction,
    };
}
