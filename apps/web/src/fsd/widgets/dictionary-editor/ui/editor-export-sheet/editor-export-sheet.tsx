import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import {
    DictionaryExportPanel,
    DictionaryExportSaveError,
} from '@/fsd/features/dictionary-interchange';
import { BottomSheet } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';

export function EditorExportSheet({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'interchangeOpen'
        | 'setInterchangeOpen'
        | 'interchangeExportAction'
    >;
}) {
    const { t, interchangeOpen, setInterchangeOpen, interchangeExportAction } =
        model;

    const handleClose: ComponentProps<typeof BottomSheet>['onClose'] = () =>
        setInterchangeOpen(null);

    const openValue: ComponentProps<typeof BottomSheet>['open'] =
        interchangeOpen === 'export';

    function resolveErrorValue() {
        if (interchangeExportAction.error) {
            if (
                interchangeExportAction.error instanceof
                DictionaryExportSaveError
            ) {
                return t('dictionary.interchange.exportStreamingRequired');
            }

            return dictionaryErrorMessage(interchangeExportAction.error, t);
        }

        return null;
    }

    const errorValue: ComponentProps<typeof DictionaryExportPanel>['error'] =
        resolveErrorValue();

    const handleExport: ComponentProps<
        typeof DictionaryExportPanel
    >['onExport'] = async (format) => {
        await interchangeExportAction.mutateAsync(format);
    };

    return (
        <BottomSheet
            closeLabel={t('common.cancel')}
            dismissible={!interchangeExportAction.isPending}
            onClose={handleClose}
            open={openValue}
            title={t('dictionary.interchange.exportTitle')}
        >
            {interchangeOpen === 'export' ? (
                <DictionaryExportPanel
                    error={errorValue}
                    onExport={handleExport}
                    pending={interchangeExportAction.isPending}
                />
            ) : null}
        </BottomSheet>
    );
}
