'use client';

import { useAuth } from '@/fsd/features/auth';
import { DictionaryLibrary } from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';

import { AuthenticatedDictionaryBoundary } from '../authenticated-dictionary-boundary';

export function DictionariesPage() {
    const { requestWithSession } = useAuth();
    const { t } = useI18n();
    return (
        <AuthenticatedDictionaryBoundary
            loadingMessage={t('dictionary.library.loading')}
            returnTo='/dictionaries'
        >
            <DictionaryLibrary requestWithSession={requestWithSession} />
        </AuthenticatedDictionaryBoundary>
    );
}
