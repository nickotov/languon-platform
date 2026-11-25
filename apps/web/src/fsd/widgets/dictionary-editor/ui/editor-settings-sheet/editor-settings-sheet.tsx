import {
    dictionaryErrorMessage,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';
import { BottomSheet } from '@/fsd/shared/ui';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../styles/dictionary-editor-common.module.css';

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

    function closeSettings() {
        setSettingsOpen(false);
    }

    const error = updateSettings.error
        ? dictionaryErrorMessage(updateSettings.error, t)
        : null;

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
            onClose={closeSettings}
            title={t('dictionary.settings.title')}
            closeLabel={t('common.cancel')}
            className={styles.settingsSheet ?? ''}
        >
            <DictionarySettingsForm
                onCancel={closeSettings}
                dictionary={current}
                error={error}
                languages={catalog}
                onSave={updateSettings.mutateAsync}
                pending={updateSettings.isPending}
            />
        </BottomSheet>
    );
}
