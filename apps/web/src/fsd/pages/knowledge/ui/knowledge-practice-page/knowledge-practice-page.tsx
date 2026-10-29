'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import type { KnowledgeNote, LearningBlock } from '@languon/contracts';
import { KnowledgePrivateTranslation } from '@/fsd/widgets/knowledge-private-translation';
import { KnowledgeVocabularyPractice } from '@/fsd/widgets/knowledge-vocabulary';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import {
    useWorkbookLearning,
    LearningProgress,
} from '@/fsd/features/workbook-learning';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { KnowledgeAuthBoundary } from '../knowledge-auth-boundary/knowledge-auth-boundary';
import { NotePreview } from '../knowledge-detail-page/note-preview';
import styles from './knowledge-practice-page.module.css';

export function KnowledgePracticePage({ noteId }: { noteId: string }) {
    const actor = useSessionStore((state) => state.user?.id);
    return (
        <KnowledgeAuthBoundary returnTo={`/knowledge/${noteId}/practice`}>
            <SavedNote key={`${actor}:${noteId}`} noteId={noteId} />
        </KnowledgeAuthBoundary>
    );
}

function SavedNote({ noteId }: { noteId: string }) {
    const { requestWithSession } = useAuth();
    const actor = useSessionStore((state) => state.user?.id);
    const { t, href } = useI18n();
    const query = useQuery({
        queryKey: ['knowledge-practice', actor, noteId],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                knowledgeApi.read(token, noteId, signal),
            ),
        enabled: Boolean(actor),
        retry: false,
        gcTime: 0,
    });
    function retry() {
        void query.refetch();
    }
    let content;
    if (query.isPending)
        content = <LoadingState>{t('knowledge.loading')}</LoadingState>;
    else if (query.isError || !query.data)
        content = (
            <InlineAlert
                tone='error'
                actions={
                    <Button onClick={retry}>{t('knowledge.retry')}</Button>
                }
            >
                {t('knowledge.loadError')}
            </InlineAlert>
        );
    else
        content = (
            <SavedPractice
                key={`${actor}:${query.data.id}:${query.data.version}`}
                note={query.data}
            />
        );
    return (
        <main className={styles.page}>
            <ButtonLink href={href(`/knowledge/${noteId}`)} variant='ghost'>
                {t('knowledge.back')}
            </ButtonLink>
            {content}
        </main>
    );
}

function SavedPractice({ note }: { note: KnowledgeNote }) {
    const [request, setRequest] = useState<{ id: string; prompt: string }>();
    const actorId = useSessionStore((state) => state.user?.id);
    const { requestWithSession } = useAuth();
    const { locale } = useI18n();
    const model = useWorkbookLearning({
        noteId: note.id,
        noteVersion: note.version,
        body: note.body,
        actorId,
        locale,
        requestWithSession,
        onAiRequest: setRequest,
    });
    const library = {
        requestWithSession,
        noteId: note.id,
        noteVersion: note.version,
    };
    const source = {
        kind: 'knowledge' as const,
        id: note.id,
        view: 'saved' as const,
    };
    const blockCopy = {
        requestWithSession,
        source: {
            kind: 'saved' as const,
            noteId: note.id,
            expectedVersion: note.version,
        },
    };
    function blockOptions(block: LearningBlock) {
        const options = model.options(block);
        if (actorId && block.type === 'vocabulary') {
            return {
                ...options,
                actions: (
                    <KnowledgeVocabularyPractice
                        noteId={note.id}
                        block={block}
                        actorId={actorId}
                        requestWithSession={requestWithSession}
                    />
                ),
            };
        }
        if (actorId && block.type === 'bilingual-text')
            return {
                ...options,
                actions: (
                    <KnowledgePrivateTranslation
                        actorId={actorId}
                        noteId={note.id}
                        noteVersion={note.version}
                        block={block}
                        requestWithSession={requestWithSession}
                    />
                ),
            };
        return options;
    }
    return (
        <>
            <h1>{note.title}</h1>
            <LearningProgress model={model} />
            <NotePreview
                content={note}
                blockOptions={blockOptions}
                library={library}
                blockCopy={blockCopy}
            />
            <ContextualAssistant
                source={source}
                contextLabel={note.title}
                request={request}
            />
        </>
    );
}
