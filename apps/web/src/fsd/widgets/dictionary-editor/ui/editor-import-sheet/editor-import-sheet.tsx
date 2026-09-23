import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { DictionaryImportPanel } from '@/fsd/features/dictionary-interchange';
import { BottomSheet } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';

export function EditorImportSheet({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'dictionaryId'
        | 'interchangeOpen'
        | 'setInterchangeOpen'
        | 'interchangePreview'
        | 'setInterchangePreview'
        | 'generationCapabilities'
        | 'interchangePreviewAction'
        | 'interchangeImportAction'
        | 'current'
        | 'catalog'
        | 'currentVersions'
    >;
}) {
    const {
        t,
        dictionaryId,
        interchangeOpen,
        setInterchangeOpen,
        interchangePreview,
        setInterchangePreview,
        generationCapabilities,
        interchangePreviewAction,
        interchangeImportAction,
        current,
        catalog,
        currentVersions,
    } = model;

    const dismissibleValue: ComponentProps<typeof BottomSheet>['dismissible'] =
        !interchangePreviewAction.isPending &&
        !interchangeImportAction.isPending;

    const handleClose: ComponentProps<typeof BottomSheet>['onClose'] = () => {
        setInterchangeOpen(null);
        setInterchangePreview(null);
    };

    const openValue: ComponentProps<typeof BottomSheet>['open'] =
        interchangeOpen === 'import';

    const aiAvailableValue: ComponentProps<
        typeof DictionaryImportPanel
    >['aiAvailable'] =
        generationCapabilities.data?.importPairsGeneration.available === true;

    const errorValue: ComponentProps<typeof DictionaryImportPanel>['error'] =
        interchangePreviewAction.error
            ? dictionaryErrorMessage(interchangePreviewAction.error, t)
            : interchangeImportAction.error
              ? dictionaryErrorMessage(interchangeImportAction.error, t)
              : null;

    const handleCommit: ComponentProps<
        typeof DictionaryImportPanel
    >['onCommit'] = async (request) => {
        await interchangeImportAction.mutateAsync(request);
    };

    const handlePreview: ComponentProps<
        typeof DictionaryImportPanel
    >['onPreview'] = async (request) => {
        await interchangePreviewAction.mutateAsync(request);
    };

    const optionalFieldsEnabledValue: ComponentProps<
        typeof DictionaryImportPanel
    >['optionalFieldsEnabled'] =
        current.settings.values.transcriptionEnabled ||
        current.settings.values.definitionEnabled ||
        current.settings.values.exampleEnabled;

    const pendingValue: ComponentProps<
        typeof DictionaryImportPanel
    >['pending'] =
        interchangePreviewAction.isPending || interchangeImportAction.isPending;

    const targetValue: ComponentProps<typeof DictionaryImportPanel>['target'] =
        {
            dictionaryId,
            expectedDictionaryVersion: currentVersions.dictionaryVersion,
            expectedSettingsVersion: currentVersions.settingsVersion,
            kind: 'existing',
        };

    return (
        <BottomSheet
            closeLabel={t('common.cancel')}
            dismissible={dismissibleValue}
            onClose={handleClose}
            open={openValue}
            size='large'
            title={t('dictionary.interchange.importTitle')}
        >
            {interchangeOpen === 'import' ? (
                <DictionaryImportPanel
                    aiAvailable={aiAvailableValue}
                    error={errorValue}
                    onCommit={handleCommit}
                    onPreview={handlePreview}
                    optionalFieldsEnabled={optionalFieldsEnabledValue}
                    languages={catalog}
                    pending={pendingValue}
                    preview={interchangePreview}
                    sourceLanguage={current.sourceLanguage}
                    target={targetValue}
                    targetLanguage={current.targetLanguage}
                />
            ) : null}
        </BottomSheet>
    );
}
