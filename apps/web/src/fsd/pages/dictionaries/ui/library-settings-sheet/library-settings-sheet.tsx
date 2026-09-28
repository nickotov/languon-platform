import {
    dictionaryErrorMessage,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';
import { useI18n } from '@/fsd/shared/i18n';
import { BottomSheet, Button, ErrorState, LoadingState } from '@/fsd/shared/ui';

import type { LibrarySettingsState } from '../../hooks/use-library-settings';

export function LibrarySettingsSheet({
    state,
}: {
    state: LibrarySettingsState;
}) {
    const { locale, t } = useI18n();
    const catalog = state.languages.data?.languages ?? [];
    const current = state.dictionary.data?.dictionary;
    const summary = current ?? state.selected;
    const description = summary
        ? `${summary.name} · ${languageLabel(catalog, summary.sourceLanguage, locale)} → ${languageLabel(catalog, summary.targetLanguage, locale)}`
        : undefined;
    const loadError = state.dictionary.error ?? state.languages.error;
    const updateError = state.update.error
        ? dictionaryErrorMessage(state.update.error, t)
        : null;

    function retry() {
        void state.dictionary.refetch();
        void state.languages.refetch();
    }

    async function save(
        values: Parameters<typeof state.update.mutateAsync>[0],
    ): Promise<void> {
        await state.update.mutateAsync(values);
    }

    return (
        <BottomSheet
            closeLabel={t('common.cancel')}
            description={description}
            dismissible={!state.update.isPending}
            onClose={state.close}
            open={state.selected !== null}
            size='large'
            title={t('dictionary.settings.title')}
        >
            {loadError ? (
                <ErrorState
                    action={
                        <Button onClick={retry} type='button'>
                            {t('common.retry')}
                        </Button>
                    }
                    title={t('dictionary.error.title')}
                >
                    {dictionaryErrorMessage(loadError, t)}
                </ErrorState>
            ) : !current || state.languages.isPending ? (
                <LoadingState>{t('dictionary.editor.loading')}</LoadingState>
            ) : (
                <DictionarySettingsForm
                    dictionary={current}
                    error={updateError}
                    languages={catalog}
                    onCancel={state.close}
                    onSave={save}
                    pending={state.update.isPending}
                />
            )}
        </BottomSheet>
    );
}
