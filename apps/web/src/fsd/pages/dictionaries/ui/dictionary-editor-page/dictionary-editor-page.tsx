'use client';

import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { DictionaryEditor } from '@/fsd/widgets/dictionary-editor';
import { DictionaryTraining } from '@/fsd/widgets/dictionary-training';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';

import { AuthenticatedDictionaryBoundary } from '../authenticated-dictionary-boundary';

export function DictionaryEditorPage({
    dictionaryId,
}: {
    dictionaryId: string;
}) {
    const { requestWithSession } = useAuth();

    const { t } = useI18n();
    function renderAssistant({
        dictionaryId: id,
        name,
    }: {
        dictionaryId: string;
        name: string;
    }) {
        return (
            <ContextualAssistant
                source={{ kind: 'dictionary', id }}
                contextLabel={name}
            />
        );
    }

    return (
        <AuthenticatedDictionaryBoundary
            loadingMessage={t('dictionary.editor.loading')}
            returnTo={`/dictionaries/${dictionaryId}`}
        >
            <DictionaryEditor
                renderTraining={(props) => <DictionaryTraining {...props} />}
                dictionaryId={dictionaryId}
                requestWithSession={requestWithSession}
                renderAssistant={renderAssistant}
            />
        </AuthenticatedDictionaryBoundary>
    );
}
