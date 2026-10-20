import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    LoadingState,
} from '@/fsd/shared/ui';
import { NotePreview } from './note-preview';
import styles from './knowledge-detail-page.module.css';

export function WorkspaceHistory({
    noteId,
    open,
    publishedVersion,
    onClose,
    onBeforeRestore,
    onRestored,
}: {
    noteId: string;
    open: boolean;
    publishedVersion: number;
    onClose(): void;
    onBeforeRestore(): Promise<unknown>;
    onRestored(): Promise<void>;
}) {
    const { t, formatDate } = useI18n();
    const { requestWithSession } = useAuth();
    const [version, setVersion] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const operation = useRef<{
        version: number;
        publishedVersion: number;
        id: string;
    } | null>(null);
    const history = useQuery({
        queryKey: ['knowledge', noteId, 'revisions'],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                knowledgeApi.revisions(token, noteId, signal),
            ),
        enabled: open,
        retry: false,
    });
    const revisions = history.data ?? [];
    const selected =
        revisions.find((revision) => revision.version === version) ??
        revisions[0];
    function select(next: number) {
        setVersion(next);
    }
    async function restore() {
        if (!selected) return;
        setBusy(true);
        setError(false);
        try {
            await onBeforeRestore();
            if (
                !operation.current ||
                operation.current.version !== selected.version ||
                operation.current.publishedVersion !== publishedVersion
            ) {
                operation.current = {
                    version: selected.version,
                    publishedVersion,
                    id: crypto.randomUUID(),
                };
            }
            await requestWithSession((token) =>
                knowledgeApi.restore(token, noteId, {
                    operationId: operation.current!.id,
                    expectedVersion: publishedVersion,
                    revisionVersion: selected.version,
                }),
            );
            await onRestored();
            operation.current = null;
            onClose();
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={t('knowledge.history')}
            closeLabel={t('knowledge.cancel')}
            size='large'
            dismissible={!busy}
            footer={
                <DialogActions>
                    <Button variant='secondary' onClick={onClose}>
                        {t('knowledge.cancel')}
                    </Button>
                    <Button
                        disabled={
                            !selected || selected.version === publishedVersion
                        }
                        loading={busy}
                        onClick={restore}
                    >
                        {t('knowledge.restore')}
                    </Button>
                </DialogActions>
            }
        >
            <p className={styles.description}>{t('knowledge.restoreHelp')}</p>
            {history.isPending && (
                <LoadingState>{t('knowledge.loading')}</LoadingState>
            )}
            {history.isError && (
                <InlineAlert tone='error'>
                    {t('knowledge.historyError')}
                </InlineAlert>
            )}
            {history.isSuccess && (
                <>
                    <div className={styles.revisions}>
                        {revisions.map((revision) => (
                            <RevisionButton
                                key={revision.version}
                                version={revision.version}
                                createdAt={revision.createdAt}
                                selected={
                                    revision.version === selected?.version
                                }
                                onSelect={select}
                                label={t('knowledge.revision', {
                                    version: revision.version,
                                })}
                                date={formatDate(revision.createdAt)}
                            />
                        ))}
                    </div>
                    {selected && <NotePreview content={selected.content} />}
                </>
            )}
            {error && (
                <InlineAlert tone='error'>
                    {t('knowledge.saveError')}
                </InlineAlert>
            )}
        </Dialog>
    );
}

function RevisionButton({
    version,
    selected,
    onSelect,
    label,
    date,
}: {
    version: number;
    createdAt: string;
    selected: boolean;
    onSelect(version: number): void;
    label: string;
    date: string;
}) {
    function select() {
        onSelect(version);
    }
    return (
        <Button variant={selected ? 'primary' : 'secondary'} onClick={select}>
            {label} · {date}
        </Button>
    );
}
