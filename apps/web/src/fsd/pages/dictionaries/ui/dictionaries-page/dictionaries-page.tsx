'use client';

import { useAuth } from '@/fsd/features/auth';
import { DictionaryLibrary } from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';

import { AuthenticatedDictionaryBoundary } from '../authenticated-dictionary-boundary';
import { useLibrarySettings } from '../../hooks/use-library-settings';
import { LibrarySettingsSheet } from '../library-settings-sheet/library-settings-sheet';

export function DictionariesPage() {
    const { requestWithSession } = useAuth();
    const { t } = useI18n();
    const settings = useLibrarySettings(requestWithSession);
    return (
        <AuthenticatedDictionaryBoundary
            loadingMessage={t('dictionary.library.loading')}
            returnTo='/dictionaries'
        >
            <DictionaryLibrary
                onOpenSettings={settings.open}
                requestWithSession={requestWithSession}
            />
            <LibrarySettingsSheet state={settings} />
        </AuthenticatedDictionaryBoundary>
    );
}
