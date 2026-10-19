'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, History, Pencil, Trash2 } from 'lucide-react';
import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import { useI18n } from '@/fsd/shared/i18n';
import { useDirtyNavigation } from '@/fsd/shared/lib/navigation/use-dirty-navigation';
import { Button, ButtonLink, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useKnowledgeNote } from '../../hooks/use-knowledge-note';
import { KnowledgeAuthBoundary } from '../knowledge-auth-boundary/knowledge-auth-boundary';
import { NotePreview } from './note-preview';
import { NoteHistory } from './note-history';
import { NoteEditForm } from './note-edit-form';
import { NoteDialogs } from './note-dialogs';
import styles from './knowledge-detail-page.module.css';

export function KnowledgeDetailPage({ noteId }: { noteId: string }) {
    const actorId = useSessionStore((state) => state.user?.id);
    return (
        <KnowledgeAuthBoundary returnTo={`/knowledge/${noteId}`}>
            <DetailContent key={`${actorId}:${noteId}`} noteId={noteId} />
        </KnowledgeAuthBoundary>
    );
}

function DetailContent({ noteId }: { noteId: string }) {
    const { t, href } = useI18n();
    const router = useRouter();
    const state = useKnowledgeNote(noteId);
    const navigation = useDirtyNavigation();
    const [valid, setValid] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [compare, setCompare] = useState(false);
    const note = state.query.data;
    const dirty =
        state.edit !== null &&
        (!valid ||
            JSON.stringify(state.edit.content) !==
                JSON.stringify(state.edit.original));
    useEffect(() => {
        navigation.setDirty(dirty);
    }, [dirty, navigation.setDirty]);
    const missing =
        state.query.error instanceof KnowledgeApiError &&
        state.query.error.status === 404;
    const conflict =
        state.conflict ||
        (state.save.error instanceof KnowledgeApiError &&
            state.save.error.status === 409);
    function edit() {
        if (note) {
            setValid(true);
            state.startEditing(note);
        }
    }
    function history() {
        state.setHistoryOpen(true);
    }
    function requestDelete() {
        state.remove.reset();
        setDeleting(true);
    }
    function showCompare() {
        setCompare(true);
    }
    function reload() {
        void state.query.refetch();
    }
    async function deleteNote() {
        if (!note) return;
        try {
            await state.remove.mutateAsync(note.version);
            router.push(href('/knowledge'));
        } catch {
            /* Confirmation remains open with a retryable error. */
        }
    }
    const back = (
        <ButtonLink
            href={href('/knowledge')}
            variant='ghost'
            leadingIcon={<ArrowLeft aria-hidden size={18} />}
        >
            {t('knowledge.back')}
        </ButtonLink>
    );
    if (!note && state.query.isPending)
        return (
            <main className={styles.page}>
                {back}
                <LoadingState>{t('knowledge.loading')}</LoadingState>
            </main>
        );
    if (!note)
        return (
            <main className={styles.page}>
                {back}
                <InlineAlert
                    tone='error'
                    actions={
                        !missing && (
                            <Button variant='secondary' onClick={reload}>
                                {t('knowledge.retry')}
                            </Button>
                        )
                    }
                >
                    {t(missing ? 'knowledge.missing' : 'knowledge.loadError')}
                </InlineAlert>
            </main>
        );
    const source = { kind: 'knowledge' as const, id: note.id };
    return (
        <main className={styles.page}>
            {back}
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>
                        {t(
                            state.edit
                                ? 'knowledge.editing'
                                : 'knowledge.navigation',
                        )}
                    </p>
                    <h1 dir='auto'>{note.title}</h1>
                </div>
                {!state.edit && (
                    <div className={styles.actions}>
                        <ContextualAssistant
                            source={source}
                            contextLabel={note.title}
                        />
                        <Button
                            variant='secondary'
                            leadingIcon={<Pencil aria-hidden size={18} />}
                            onClick={edit}
                            disabled={state.busy}
                        >
                            {t('knowledge.edit')}
                        </Button>
                        <Button
                            variant='ghost'
                            leadingIcon={<History aria-hidden size={18} />}
                            onClick={history}
                            disabled={state.busy}
                        >
                            {t('knowledge.history')}
                        </Button>
                        <Button
                            variant='ghost'
                            leadingIcon={<Trash2 aria-hidden size={18} />}
                            onClick={requestDelete}
                            disabled={state.busy}
                        >
                            {t('knowledge.delete')}
                        </Button>
                    </div>
                )}
            </header>
            {missing && (
                <InlineAlert tone='warning'>
                    {t('knowledge.missing')}
                </InlineAlert>
            )}
            {state.edit ? (
                <NoteEditForm
                    state={state}
                    navigation={navigation}
                    valid={valid}
                    dirty={dirty}
                    conflict={conflict}
                    missing={missing}
                    onValidity={setValid}
                    onCompare={showCompare}
                />
            ) : (
                <article className={styles.article}>
                    <NotePreview content={note} />
                    <p className={styles.disclaimer}>
                        {t('knowledge.notVerified')}
                    </p>
                </article>
            )}
            <NoteDialogs
                state={state}
                navigation={navigation}
                deleting={deleting}
                compare={compare}
                onDeleting={setDeleting}
                onCompare={setCompare}
                onDelete={deleteNote}
                onValidity={setValid}
            />
            <NoteHistory state={state} />
        </main>
    );
}
