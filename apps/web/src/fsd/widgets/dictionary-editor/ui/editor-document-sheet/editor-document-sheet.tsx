import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { DictionaryDocumentGenerationPanel } from '@/fsd/features/dictionary-document-generation';
import { BottomSheet, Button, ErrorState, LoadingState } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import { syncDocumentGenerationUrl } from '../../lib/generation-url';

export function EditorDocumentSheet({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'documentGenerationOpen'
        | 'setDocumentGenerationOpen'
        | 'documentGenerationJobId'
        | 'setDocumentGenerationJobId'
        | 'dictionary'
        | 'cards'
        | 'generationCapabilities'
        | 'documentGenerationJob'
        | 'documentGenerationAction'
        | 'current'
        | 'catalog'
    >;
}) {
    const {
        t,
        documentGenerationOpen,
        setDocumentGenerationOpen,
        documentGenerationJobId,
        setDocumentGenerationJobId,
        dictionary,
        cards,
        generationCapabilities,
        documentGenerationJob,
        documentGenerationAction,
        current,
        catalog,
    } = model;

    const handleClose: ComponentProps<typeof BottomSheet>['onClose'] = () => {
        setDocumentGenerationOpen(false);
        setDocumentGenerationJobId(null);
        syncDocumentGenerationUrl(null);
    };

    const handleClick: ComponentProps<typeof Button>['onClick'] = () =>
        void documentGenerationJob.refetch();

    const availableValue: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['available'] =
        generationCapabilities.data?.documentTermsGeneration.available === true;

    const conflictValue: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['conflict'] =
        (documentGenerationAction.error instanceof DictionaryApiError &&
            documentGenerationAction.error.detail.code ===
                'version_conflict') ||
        (documentGenerationJob.data?.job?.state === 'review' &&
            (documentGenerationJob.data.job.expectedDictionaryVersion !==
                cards.data?.pages[0]?.dictionaryVersion ||
                documentGenerationJob.data.job.expectedSettingsVersion !==
                    cards.data?.pages[0]?.settingsVersion ||
                documentGenerationJob.data.job.sourceLanguage !==
                    current.sourceLanguage ||
                documentGenerationJob.data.job.targetLanguage !==
                    current.targetLanguage));

    const errorValue: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['error'] = documentGenerationAction.error
        ? dictionaryErrorMessage(documentGenerationAction.error, t)
        : documentGenerationJob.error
          ? dictionaryErrorMessage(documentGenerationJob.error, t)
          : null;

    const nativeExtractionAvailableValue: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['nativeExtractionAvailable'] =
        generationCapabilities.data?.documentTermsGeneration.available === true;

    const ocrAvailableValue: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['ocrAvailable'] =
        generationCapabilities.data?.documentOcr.available === true;

    const handleAccept: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['onAccept'] = async (selected) => {
        await documentGenerationAction.mutateAsync({
            kind: 'accept',
            selected,
        });
    };

    const handleCancel: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['onCancel'] = async () => {
        await documentGenerationAction.mutateAsync({
            kind: 'cancel',
        });
    };

    const handleClose2: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['onClose'] = () => {
        setDocumentGenerationOpen(false);
        setDocumentGenerationJobId(null);
        syncDocumentGenerationUrl(null);
    };

    const handleDiscard: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['onDiscard'] = async () => {
        await documentGenerationAction.mutateAsync({
            kind: 'discard',
        });
    };

    const handleReloadConflict: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['onReloadConflict'] = async () => {
        documentGenerationAction.reset();
        await Promise.all([
            dictionary.refetch(),
            cards.refetch(),
            documentGenerationJob.refetch(),
        ]);
    };

    const handleRetryFailures: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['onRetryFailures'] = async (failures) => {
        await documentGenerationAction.mutateAsync({
            kind: 'retry-failures',
            rowIndexes: failures.map((failure) => failure.rowIndex),
        });
    };

    const handleStart: ComponentProps<
        typeof DictionaryDocumentGenerationPanel
    >['onStart'] = async (input) => {
        await documentGenerationAction.mutateAsync({
            ...input,
            kind: 'start',
        });
    };

    return (
        <BottomSheet
            closeLabel={t('common.cancel')}
            description={t('dictionary.document.sheetHelp')}
            dismissible={!documentGenerationAction.isPending}
            onClose={handleClose}
            open={documentGenerationOpen}
            size='large'
            title={t('dictionary.document.title')}
        >
            {documentGenerationOpen &&
            documentGenerationJobId &&
            documentGenerationJob.isPending ? (
                <LoadingState>{t('dictionary.document.loading')}</LoadingState>
            ) : documentGenerationOpen &&
              documentGenerationJobId &&
              documentGenerationJob.isError &&
              !documentGenerationJob.data ? (
                <ErrorState
                    action={
                        <Button onClick={handleClick} type='button'>
                            {t('common.retry')}
                        </Button>
                    }
                    title={t('dictionary.document.loadFailed')}
                >
                    {dictionaryErrorMessage(documentGenerationJob.error, t)}
                </ErrorState>
            ) : documentGenerationOpen ? (
                <DictionaryDocumentGenerationPanel
                    available={availableValue}
                    conflict={conflictValue}
                    dictionary={current}
                    error={errorValue}
                    {...(documentGenerationJob.data?.job
                        ? {
                              job: documentGenerationJob.data.job,
                          }
                        : {})}
                    languages={catalog}
                    nativeExtractionAvailable={nativeExtractionAvailableValue}
                    ocrAvailable={ocrAvailableValue}
                    onAccept={handleAccept}
                    onCancel={handleCancel}
                    onClose={handleClose2}
                    onDiscard={handleDiscard}
                    onReloadConflict={handleReloadConflict}
                    onRetryFailures={handleRetryFailures}
                    onStart={handleStart}
                    pendingAction={documentGenerationAction.isPending}
                />
            ) : null}
        </BottomSheet>
    );
}
