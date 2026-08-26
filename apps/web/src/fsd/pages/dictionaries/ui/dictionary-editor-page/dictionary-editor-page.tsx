'use client';

import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { DictionaryEditor } from '@/fsd/widgets/dictionary-editor';

import { AuthenticatedDictionaryBoundary } from '../authenticated-dictionary-boundary';

export function DictionaryEditorPage({
    dictionaryId,
}: {
    dictionaryId: string;
}) {
    const { requestWithSession } = useAuth();
    const { t } = useI18n();
    return (
        <AuthenticatedDictionaryBoundary
            loadingMessage={t('dictionary.editor.loading')}
            returnTo={`/dictionaries/${dictionaryId}`}
        >
            <DictionaryEditor
                dictionaryId={dictionaryId}
                requestWithSession={requestWithSession}
            />
        </AuthenticatedDictionaryBoundary>
    );
}
