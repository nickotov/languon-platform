import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { DictionaryBatchGenerationPanel } from '@/fsd/features/dictionary-batch-generation';
import { BottomSheet, Button, ErrorState, LoadingState } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import { syncBatchGenerationUrl } from '../../lib/generation-url';

export function EditorBatchSheet({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'batchGenerationOpen'
        | 'setBatchGenerationOpen'
        | 'batchGenerationJobId'
        | 'setBatchGenerationJobId'
        | 'dictionary'
        | 'cards'
        | 'generationCapabilities'
        | 'batchGenerationJob'
        | 'batchGenerationAction'
        | 'current'
        | 'catalog'
    >;
}) {
    const {
        t,
        batchGenerationOpen,
        setBatchGenerationOpen,
        batchGenerationJobId,
        setBatchGenerationJobId,
        dictionary,
        cards,
        generationCapabilities,
        batchGenerationJob,
        batchGenerationAction,
        current,
        catalog,
    } = model;

    const handleClose: ComponentProps<typeof BottomSheet>['onClose'] = () => {
        setBatchGenerationOpen(false);

        setBatchGenerationJobId(null);

        syncBatchGenerationUrl(null);
    };

    const handleClick: ComponentProps<typeof Button>['onClick'] = () =>
        void batchGenerationJob.refetch();

    const availableValue: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['available'] =
        generationCapabilities.data?.pastedTermsGeneration.available === true;

    const conflictValue =
        (batchGenerationAction.error instanceof DictionaryApiError &&
            batchGenerationAction.error.detail.code === 'version_conflict') ||
        (batchGenerationJob.data?.job != null &&
            batchGenerationJob.data.job.state === 'review' &&
            (batchGenerationJob.data.job.expectedDictionaryVersion !==
                cards.data?.pages[0]?.dictionaryVersion ||
                batchGenerationJob.data.job.expectedSettingsVersion !==
                    cards.data?.pages[0]?.settingsVersion ||
                batchGenerationJob.data.job.sourceLanguage !==
                    current.sourceLanguage ||
                batchGenerationJob.data.job.targetLanguage !==
                    current.targetLanguage));

    function resolveErrorValue() {
        if (batchGenerationAction.error) {
            return dictionaryErrorMessage(batchGenerationAction.error, t);
        }

        if (batchGenerationJob.error) {
            return dictionaryErrorMessage(batchGenerationJob.error, t);
        }

        return null;
    }

    const errorValue = resolveErrorValue();

    const handleAccept: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['onAccept'] = async (selected) => {
        await batchGenerationAction.mutateAsync({
            kind: 'accept',
            selected,
        });
    };

    const handleCancel: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['onCancel'] = async () => {
        await batchGenerationAction.mutateAsync({
            kind: 'cancel',
        });
    };

    const handleClose2: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['onClose'] = () => {
        setBatchGenerationOpen(false);

        setBatchGenerationJobId(null);

        syncBatchGenerationUrl(null);
    };

    const handleDiscard: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['onDiscard'] = async () => {
        await batchGenerationAction.mutateAsync({
            kind: 'discard',
        });
    };

    const handleReloadConflict: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['onReloadConflict'] = async () => {
        batchGenerationAction.reset();

        await Promise.all([
            dictionary.refetch(),
            cards.refetch(),
            batchGenerationJob.refetch(),
        ]);
    };

    const handleRetryFailures: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['onRetryFailures'] = async (failures) => {
        await batchGenerationAction.mutateAsync({
            kind: 'retry-failures',
            rowIndexes: failures.map((failure) => failure.rowIndex),
        });
    };

    const handleStart: ComponentProps<
        typeof DictionaryBatchGenerationPanel
    >['onStart'] = async (input) => {
        await batchGenerationAction.mutateAsync({
            ...input,
            kind: 'start',
        });
    };

    function resolveEditorBatchSheetContent() {
        if (
            batchGenerationOpen &&
            batchGenerationJobId &&
            batchGenerationJob.isPending
        ) {
            return <LoadingState>{t('dictionary.batch.loading')}</LoadingState>;
        }

        if (
            batchGenerationOpen &&
            batchGenerationJobId &&
            batchGenerationJob.isError &&
            !batchGenerationJob.data
        ) {
            return (
                <ErrorState
                    action={
                        <Button onClick={handleClick} type='button'>
                            {t('common.retry')}
                        </Button>
                    }
                    title={t('dictionary.batch.loadFailed')}
                >
                    {dictionaryErrorMessage(batchGenerationJob.error, t)}
                </ErrorState>
            );
        }

        if (batchGenerationOpen) {
            return (
                <DictionaryBatchGenerationPanel
                    available={availableValue}
                    conflict={conflictValue}
                    dictionary={current}
                    error={errorValue}
                    {...(batchGenerationJob.data?.job
                        ? {
                              job: batchGenerationJob.data.job,
                          }
                        : {})}
                    languages={catalog}
                    onAccept={handleAccept}
                    onCancel={handleCancel}
                    onClose={handleClose2}
                    onDiscard={handleDiscard}
                    onReloadConflict={handleReloadConflict}
                    onRetryFailures={handleRetryFailures}
                    onStart={handleStart}
                    pendingAction={batchGenerationAction.isPending}
                />
            );
        }

        return null;
    }

    const resolvedEditorBatchSheetContent = resolveEditorBatchSheetContent();

    return (
        <BottomSheet
            closeLabel={t('common.cancel')}
            description={t('dictionary.batch.sheetHelp')}
            dismissible={!batchGenerationAction.isPending}
            onClose={handleClose}
            open={batchGenerationOpen}
            size='large'
            title={t('dictionary.batch.title')}
        >
            {resolvedEditorBatchSheetContent}
        </BottomSheet>
    );
}
