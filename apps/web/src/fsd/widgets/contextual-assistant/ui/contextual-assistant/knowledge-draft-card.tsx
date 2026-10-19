import { useEffect, useRef, useState } from 'react';
import type { KnowledgeDraft, KnowledgeNoteContent } from '@languon/contracts';
import {
    conversationApi,
    ConversationApiError,
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { KnowledgeNoteForm } from '@/fsd/features/knowledge-notes';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink } from '@/fsd/shared/ui';
import styles from './contextual-assistant.module.css';

export function KnowledgeDraftCard({
    draft,
    request,
    shareKey,
    onChanged,
    onDirtyChange,
    discardRevision,
}: {
    draft: KnowledgeDraft;
    request: ConversationSessionRequest;
    shareKey?: string | undefined;
    onChanged(): Promise<void>;
    onDirtyChange(id: string, dirty: boolean): void;
    discardRevision: number;
}) {
    const { locale, href } = useI18n();
    const copy = conversationCopy(locale);
    const [content, setContent] = useState(draft.content);
    const [valid, setValid] = useState(true);
    const [savedContent, setSavedContent] = useState(draft.content);
    const discarding = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<'conflict' | 'error' | null>(null);
    const latest = useRef(draft.content);
    const stored = useRef(draft);
    const flight = useRef<Promise<void> | null>(null);
    const operation = useRef(crypto.randomUUID());
    useEffect(() => {
        latest.current = stored.current.content;
        setContent(stored.current.content);
        setValid(true);
        setError(null);
    }, [discardRevision]);
    async function persist() {
        if (discarding.current) return;
        while (flight.current) await flight.current;
        if (
            JSON.stringify(latest.current) ===
            JSON.stringify(stored.current.content)
        )
            return;
        const next = latest.current;
        const saving = request((token) =>
            conversationApi.updateDraft(
                token,
                draft.conversationId,
                draft.id,
                stored.current.version,
                next,
                shareKey,
            ),
        ).then(({ draft: updated }) => {
            stored.current = updated;
            setSavedContent(updated.content);
        });
        flight.current = saving;
        try {
            await saving;
        } finally {
            if (flight.current === saving) flight.current = null;
        }
    }
    function change(next: KnowledgeNoteContent) {
        latest.current = next;
        setContent(next);
        setError(null);
        operation.current = crypto.randomUUID();
    }
    const dirty =
        !valid || JSON.stringify(content) !== JSON.stringify(savedContent);
    useEffect(() => {
        onDirtyChange(draft.id, dirty);
        return () => onDirtyChange(draft.id, false);
    }, [draft.id, dirty, onDirtyChange]);
    useEffect(() => {
        if (!valid) return;
        const timer = setTimeout(() => {
            void persist().catch(() => setError('error'));
        }, 600);
        return () => clearTimeout(timer);
    }, [content, valid]);
    async function publish(mode: 'new' | 'update') {
        setBusy(true);
        setError(null);
        try {
            await persist();
            await request((token) =>
                conversationApi.publishDraft(
                    token,
                    draft.conversationId,
                    draft.id,
                    {
                        operationId: operation.current,
                        expectedVersion: stored.current.version,
                        mode,
                        ...(mode === 'update' && draft.expectedNoteVersion
                            ? { expectedNoteVersion: draft.expectedNoteVersion }
                            : {}),
                    },
                    shareKey,
                ),
            );
            await onChanged();
        } catch (cause) {
            setError(
                cause instanceof ConversationApiError && cause.status === 409
                    ? 'conflict'
                    : 'error',
            );
        } finally {
            setBusy(false);
        }
    }
    function saveNew() {
        void publish('new');
    }
    function update() {
        void publish('update');
    }
    async function discard() {
        discarding.current = true;
        setBusy(true);
        try {
            if (flight.current) await flight.current;
            await request((token) =>
                conversationApi.deleteDraft(
                    token,
                    draft.conversationId,
                    draft.id,
                    shareKey,
                ),
            );
            await onChanged();
        } catch {
            discarding.current = false;
            setError('error');
        } finally {
            setBusy(false);
        }
    }
    const compareHref = draft.targetNoteId
        ? href(`/knowledge/${draft.targetNoteId}`)
        : '';
    return (
        <section className={styles.draft}>
            <h3>{copy.draft}</h3>
            <KnowledgeNoteForm
                key={discardRevision}
                value={content}
                onChange={change}
                onValidityChange={setValid}
                disabled={busy}
            />
            {error && (
                <p role='alert' className={styles.error}>
                    {error === 'conflict' ? copy.conflict : copy.error}
                </p>
            )}
            {error === 'conflict' && compareHref && (
                <ButtonLink
                    href={compareHref}
                    target='_blank'
                    variant='secondary'
                >
                    {copy.compare}
                </ButtonLink>
            )}
            <div className={styles.toolbar}>
                {draft.targetNoteId && (
                    <Button onClick={update} disabled={!valid || busy}>
                        {copy.updateNote}
                    </Button>
                )}
                <Button onClick={saveNew} disabled={!valid || busy}>
                    {draft.targetNoteId ? copy.saveNew : copy.saveNote}
                </Button>
                <Button onClick={discard} disabled={busy} variant='quiet'>
                    {copy.discard}
                </Button>
            </div>
        </section>
    );
}
