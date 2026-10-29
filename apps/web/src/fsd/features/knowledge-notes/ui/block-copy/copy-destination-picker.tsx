'use client';
import { useEffect, useState, type ChangeEvent } from 'react';
import type {
    KnowledgeWorkspaceSummary,
    KnowledgeWorkingBranch,
} from '@languon/contracts';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { BlockCopyLabels } from './block-copy-labels';
import styles from './block-copy.module.css';
import type { CopyDestination } from '../../types';
export function CopyDestinationPicker({
    request,
    labels,
    onSelect,
    disabled,
    initialDestination,
}: {
    request: RequestWithSession;
    labels: BlockCopyLabels;
    onSelect(destination: CopyDestination | null): void;
    disabled: boolean;
    initialDestination?: CopyDestination | undefined;
}) {
    const [notes, setNotes] = useState<KnowledgeWorkspaceSummary[]>([]);
    const [noteId, setNoteId] = useState(initialDestination?.noteId ?? '');
    const [branches, setBranches] = useState<KnowledgeWorkingBranch[]>([]);
    const [branchId, setBranchId] = useState('');
    const [total, setTotal] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        void request((token) =>
            knowledgeApi.listWorkspaces(
                token,
                { limit: 50, offset: 0 },
                controller.signal,
            ),
        )
            .then((result) => {
                if (!controller.signal.aborted) {
                    setNotes(result.workspaces);
                    setTotal(result.total);
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) setError(true);
            });
        return () => controller.abort();
    }, [request]);
    useEffect(() => {
        const controller = new AbortController();
        setBranches([]);
        setBranchId('');
        onSelect(null);
        setBusy(false);
        if (!noteId) return;
        setBusy(true);
        setError(false);
        void request((token) =>
            knowledgeApi.workspace(token, noteId, controller.signal),
        )
            .then((workspace) => {
                if (controller.signal.aborted) return;
                setBranches(workspace.branches);
                const preferred =
                    workspace.branches.find(
                        (branch) => branch.id === initialDestination?.branchId,
                    ) ??
                    workspace.branches.find(
                        (branch) => branch.id === workspace.preferredBranchId,
                    ) ??
                    workspace.branches[0];
                if (preferred) {
                    setBranchId(preferred.id);
                    onSelect({ noteId, branchId: preferred.id });
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) setError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
            });
        return () => controller.abort();
    }, [noteId, request, onSelect, initialDestination?.branchId]);
    function chooseNote(event: ChangeEvent<HTMLSelectElement>) {
        setNoteId(event.target.value);
    }
    function chooseBranch(event: ChangeEvent<HTMLSelectElement>) {
        const id = event.target.value;
        setBranchId(id);
        onSelect(id ? { noteId, branchId: id } : null);
    }
    async function more() {
        if (busy) return;
        setBusy(true);
        try {
            const result = await request((token) =>
                knowledgeApi.listWorkspaces(token, {
                    limit: 50,
                    offset: notes.length,
                }),
            );
            setNotes((current) => [...current, ...result.workspaces]);
            setTotal(result.total);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    const hasMore = notes.length < total;
    const showCurrentNote =
        Boolean(noteId) &&
        !notes.some((note) => note.id === noteId) &&
        branches.length > 0;
    const currentNoteTitle = branches[0]?.content.title || labels.draft;
    return (
        <div className={styles.form} aria-busy={busy}>
            <label>
                {labels.destination}
                <select
                    value={noteId}
                    onChange={chooseNote}
                    disabled={disabled || busy}
                >
                    <option value=''>{labels.choose}</option>
                    {showCurrentNote && (
                        <option value={noteId}>{currentNoteTitle}</option>
                    )}
                    {notes.map((note) => (
                        <option key={note.id} value={note.id}>
                            {note.title || labels.draft}
                        </option>
                    ))}
                </select>
            </label>
            {hasMore && (
                <Button
                    type='button'
                    variant='secondary'
                    onClick={more}
                    disabled={disabled || busy}
                >
                    {labels.more}
                </Button>
            )}
            {branches.length > 0 && (
                <label>
                    {labels.branch}
                    <select
                        value={branchId}
                        onChange={chooseBranch}
                        disabled={disabled || busy}
                    >
                        {branches.map((branch, index) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.content.title || labels.draft} —{' '}
                                {labels.draft} {index + 1}, {labels.version}{' '}
                                {branch.version}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
        </div>
    );
}
