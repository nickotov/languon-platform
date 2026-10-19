import { ArrowLeft } from 'lucide-react';
import type { KnowledgeDraft } from '@languon/contracts';
import {
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { TutorNoteForm } from './tutor-note-form';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { messagesCopy } from '../../lib/messages-copy';
import { useKnowledgeDraft } from '../../hooks/use-knowledge-draft';
import { DraftComparison } from './draft-comparison';
import styles from './knowledge-draft-card.module.css';

export function KnowledgeDraftCard({
    draft,
    request,
    shareKey,
    onChanged,
    onDirtyChange,
    discardRevision,
    expanded = true,
    onOpen,
    onBack,
    onPublished,
}: {
    draft: KnowledgeDraft;
    request: ConversationSessionRequest;
    shareKey?: string | undefined;
    onChanged(): Promise<void>;
    onDirtyChange(id: string, dirty: boolean): void;
    discardRevision: number;
    expanded?: boolean;
    onPublished?:
        | ((
              id: string,
              title: string,
              conversationId: string,
              draftId: string,
          ) => void)
        | undefined;
    onOpen?: ((id: string) => void) | undefined;
    onBack?: (() => void) | undefined;
}) {
    const { locale, t } = useI18n();
    const labels = messagesCopy(locale);
    const copy = conversationCopy(locale);
    const {
        content,
        valid,
        setValid,
        busy,
        error,
        dirty,
        change,
        saveNew,
        update,
        discard,
    } = useKnowledgeDraft({
        draft,
        request,
        shareKey,
        onChanged,
        onDirtyChange,
        discardRevision,
        onPublished,
    });
    function open() {
        onOpen?.(draft.id);
    }
    const statusLabel = dirty ? labels.editing : labels.kept;
    return (
        <section className={expanded ? styles.editor : styles.draft}>
            {expanded ? (
                <header className={styles.header}>
                    <Button size='compact' variant='quiet' onClick={onBack}>
                        <ArrowLeft size={16} aria-hidden />
                        {labels.back}
                    </Button>
                    <span className={styles.badge}>{copy.draft}</span>
                </header>
            ) : (
                <>
                    <div className={styles.row}>
                        <span className={styles.badge}>{copy.draft}</span>
                        <span className={styles.status}>{statusLabel}</span>
                    </div>
                    <h3 className={styles.title}>{content.title}</h3>
                    <p className={styles.summary}>{content.summary}</p>
                    <ul className={styles.categories}>
                        {content.categories.map((category) => (
                            <li key={category}>
                                {t(knowledgeCategoryKeys[category])}
                            </li>
                        ))}
                    </ul>
                    <div className={styles.toolbar}>
                        <Button
                            className={styles.primaryAction}
                            size='compact'
                            onClick={open}
                        >
                            {labels.review}
                        </Button>
                        <Button
                            size='compact'
                            variant='quiet'
                            disabled={busy}
                            onClick={discard}
                        >
                            {copy.discard}
                        </Button>
                    </div>
                    {error && (
                        <p role='alert' className={styles.error}>
                            {copy.error}
                        </p>
                    )}
                </>
            )}
            <div className={styles.editorBody} hidden={!expanded}>
                <TutorNoteForm
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
                {error === 'conflict' && draft.targetNoteId && (
                    <DraftComparison
                        noteId={draft.targetNoteId}
                        content={content}
                        request={request}
                    />
                )}
            </div>
            <footer className={styles.footer} hidden={!expanded}>
                <p className={styles.status}>{labels.free}</p>
                <div className={styles.toolbar}>
                    <Button
                        size='compact'
                        onClick={discard}
                        disabled={busy}
                        variant='quiet'
                    >
                        {copy.discard}
                    </Button>
                    {draft.targetNoteId && (
                        <Button
                            size='compact'
                            className={styles.primaryAction}
                            onClick={update}
                            disabled={!valid || busy || error === 'conflict'}
                        >
                            {copy.updateNote}
                        </Button>
                    )}
                    <Button
                        size='compact'
                        className={styles.primaryAction}
                        onClick={saveNew}
                        disabled={!valid || busy}
                    >
                        {draft.targetNoteId ? copy.saveNew : copy.saveNote}
                    </Button>
                </div>
            </footer>
        </section>
    );
}
