import {
    dictionaryErrorMessage,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';
import { BottomSheet } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor-common.module.css';

export function EditorSettingsSheet({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'locale'
        | 'settingsOpen'
        | 'setSettingsOpen'
        | 'updateSettings'
        | 'current'
        | 'catalog'
    >;
}) {
    const {
        t,
        locale,
        settingsOpen,
        setSettingsOpen,
        updateSettings,
        current,
        catalog,
    } = model;

    const handleClose: ComponentProps<typeof BottomSheet>['onClose'] = () =>
        setSettingsOpen(false);

    const classNameValue: ComponentProps<typeof BottomSheet>['className'] =
        styles.settingsSheet ?? '';

    const handleCancel: ComponentProps<
        typeof DictionarySettingsForm
    >['onCancel'] = () => setSettingsOpen(false);

    const errorValue: ComponentProps<typeof DictionarySettingsForm>['error'] =
        updateSettings.error
            ? dictionaryErrorMessage(updateSettings.error, t)
            : null;

    const handleSave: ComponentProps<
        typeof DictionarySettingsForm
    >['onSave'] = async (values) => updateSettings.mutateAsync(values);

    const sourceLanguage = languageLabel(
        catalog,
        current.sourceLanguage,
        locale,
    );

    const targetLanguage = languageLabel(
        catalog,
        current.targetLanguage,
        locale,
    );

    const description = `${current.name} · ${sourceLanguage} → ${targetLanguage}`;

    const dismissible = !updateSettings.isPending;

    return (
        <BottomSheet
            bodyClassName={styles.settingsBody}
            headerClassName={styles.settingsHeader}
            titleClassName={styles.settingsTitle}
            open={settingsOpen}
            size='large'
            description={description}
            dismissible={dismissible}
            onClose={handleClose}
            title={t('dictionary.settings.title')}
            closeLabel={t('common.cancel')}
            className={classNameValue}
        >
            <DictionarySettingsForm
                onCancel={handleCancel}
                dictionary={current}
                error={errorValue}
                languages={catalog}
                onSave={handleSave}
                pending={updateSettings.isPending}
            />
        </BottomSheet>
    );
}
