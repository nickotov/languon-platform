'use client';
import { useState } from 'react';
import type { KnowledgeNoteRevision } from '@languon/contracts';
import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    LoadingState,
} from '@/fsd/shared/ui';
import type { useKnowledgeNote } from '../../hooks/use-knowledge-note';
import { NotePreview } from './note-preview';
import styles from './knowledge-detail-page.module.css';

type NoteState = ReturnType<typeof useKnowledgeNote>;

export function NoteHistory({ state }: { state: NoteState }) {
    const { t } = useI18n();
    const [version, setVersion] = useState<number | null>(null);
    const revisions = state.history.data ?? [];
    const selected =
        revisions.find((revision) => revision.version === version) ??
        revisions[0];
    function close() {
        if (!state.busy) state.setHistoryOpen(false);
    }
    function reload() {
        void state.history.refetch();
    }
    function select(next: number) {
        state.restore.reset();
        setVersion(next);
    }
    async function restore() {
        if (!selected) return;
        try {
            await state.restore.mutateAsync(selected.version);
            state.setHistoryOpen(false);
            setVersion(null);
        } catch {
            /* Keep the chosen revision visible for retry or comparison. */
        }
    }
    const restoreConflict =
        state.restore.error instanceof KnowledgeApiError &&
        state.restore.error.status === 409;
    const footer = selected && (
        <DialogActions>
            <Button variant='secondary' disabled={state.busy} onClick={close}>
                {t('knowledge.cancel')}
            </Button>
            <Button
                loading={state.restore.isPending}
                disabled={
                    state.busy || selected.version === state.query.data?.version
                }
                onClick={restore}
            >
                {t(
                    state.restore.isPending
                        ? 'knowledge.restoring'
                        : 'knowledge.restore',
                )}
            </Button>
        </DialogActions>
    );
    return (
        <Dialog
            open={state.historyOpen}
            onClose={close}
            title={t('knowledge.history')}
            closeLabel={t('knowledge.cancel')}
            size='large'
            dismissible={!state.busy}
            footer={footer}
        >
            <p className={styles.description}>{t('knowledge.restoreHelp')}</p>
            {state.history.isPending && (
                <LoadingState>{t('knowledge.loading')}</LoadingState>
            )}
            {state.history.isError && (
                <InlineAlert
                    tone='error'
                    actions={
                        <Button onClick={reload}>{t('knowledge.retry')}</Button>
                    }
                >
                    {t('knowledge.historyError')}
                </InlineAlert>
            )}
            {state.history.isSuccess && (
                <>
                    <div className={styles.revisions}>
                        {revisions.map((revision) => (
                            <RevisionChoice
                                key={revision.version}
                                revision={revision}
                                selected={
                                    selected?.version === revision.version
                                }
                                onSelect={select}
                            />
                        ))}
                    </div>
                    {selected ? (
                        <section aria-label={t('knowledge.readOnlyVersion')}>
                            <h2 dir='auto'>{selected.content.title}</h2>
                            <NotePreview content={selected.content} />
                        </section>
                    ) : (
                        <p>{t('knowledge.historyEmpty')}</p>
                    )}
                </>
            )}
            {state.restore.isError && (
                <InlineAlert tone='error'>
                    {t(
                        restoreConflict
                            ? 'knowledge.conflict'
                            : 'knowledge.saveError',
                    )}
                </InlineAlert>
            )}
        </Dialog>
    );
}

function RevisionChoice({
    revision,
    selected,
    onSelect,
}: {
    revision: KnowledgeNoteRevision;
    selected: boolean;
    onSelect(version: number): void;
}) {
    const { t, formatDate } = useI18n();
    function select() {
        onSelect(revision.version);
    }
    return (
        <Button
            variant={selected ? 'primary' : 'secondary'}
            aria-pressed={selected}
            onClick={select}
        >
            {t('knowledge.revision', { version: revision.version })} ·{' '}
            {formatDate(revision.createdAt)}
        </Button>
    );
}
