'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type ComponentProps } from 'react';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import type { KnowledgeNote, LearningBlock } from '@languon/contracts';
import { useKnowledgeBlockPlayback } from '@/fsd/widgets/knowledge-speech';
import { KnowledgeBilingualStudy } from '@/fsd/widgets/knowledge-private-translation';
import { KnowledgeVocabularyPractice } from '@/fsd/widgets/knowledge-vocabulary';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import {
    useWorkbookLearning,
    LearningProgress,
} from '@/fsd/features/workbook-learning';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    ButtonLink,
    InlineAlert,
    LoadingState,
    type MenuItem,
} from '@/fsd/shared/ui';
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
    const playback = useKnowledgeBlockPlayback({
        noteId: note.id,
        requestWithSession,
    });
    const blocks =
        note.body.document.content?.flatMap((node) =>
            node.attrs?.block ? [node.attrs.block] : [],
        ) ?? [];
    const blockPlayback = playback.options(async () => ({
        origin: { kind: 'saved', expectedNoteVersion: note.version },
        blocks,
    }));
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
        const options = {
            ...model.options(block),
            variant: 'learner' as const,
            playback: blockPlayback,
        };
        return options;
    }
    function renderBlockMenu(block: LearningBlock, items: MenuItem[]) {
        if (!actorId || block.type !== 'vocabulary') return null;
        return (
            <KnowledgeVocabularyPractice
                noteId={note.id}
                block={block}
                actorId={actorId}
                requestWithSession={requestWithSession}
                blockMenu
                commonMenuItems={items}
            />
        );
    }
    const wrapBlock: NonNullable<
        ComponentProps<typeof NotePreview>['wrapBlock']
    > = (block, render) => {
        if (!actorId || block.type !== 'bilingual-text') return render();
        return (
            <KnowledgeBilingualStudy
                actorId={actorId}
                noteId={note.id}
                noteVersion={note.version}
                block={block}
                requestWithSession={requestWithSession}
                viewOptions={blockOptions(block)}
                library={library}
            >
                {render}
            </KnowledgeBilingualStudy>
        );
    };
    return (
        <>
            {playback.confirmation}
            <h1>{note.title}</h1>
            <LearningProgress model={model} />
            <NotePreview
                content={note}
                blockOptions={blockOptions}
                renderBlockMenu={renderBlockMenu}
                wrapBlock={wrapBlock}
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
