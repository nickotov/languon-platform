import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    KnowledgeWorkingContent,
    KnowledgeWorkingBranch,
    KnowledgeWorkspace,
} from '@languon/contracts';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';

type WorkingEdit = {
    branchId: string;
    version: number;
    content: KnowledgeWorkingContent;
    synced: KnowledgeWorkingContent;
};

type RecoveryStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';

function editFromBranch(branch: KnowledgeWorkingBranch): WorkingEdit {
    return {
        branchId: branch.id,
        version: branch.version,
        content: branch.content,
        synced: branch.content,
    };
}

function contentChanged(edit: WorkingEdit) {
    return JSON.stringify(edit.content) !== JSON.stringify(edit.synced);
}

export function useKnowledgeWorkspace(noteId: string) {
    const { requestWithSession } = useAuth();
    const actorId = useSessionStore((state) => state.user?.id);
    const client = useQueryClient();
    const key = ['knowledge', actorId, 'workspace', noteId] as const;
    const query = useQuery({
        queryKey: key,
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                knowledgeApi.workspace(token, noteId, signal),
            ),
        enabled: Boolean(actorId),
        retry: false,
        gcTime: 0,
    });
    const [workspace, setWorkspace] = useState<KnowledgeWorkspace | null>(null);
    const [edit, setEdit] = useState<WorkingEdit | null>(null);
    const editRef = useRef<WorkingEdit | null>(null);
    const [status, setStatus] = useState<RecoveryStatus>('saved');
    const [error, setError] = useState<unknown>(null);
    const pending = useRef<Promise<boolean> | null>(null);
    const failedContent = useRef<string | null>(null);
    const operations = useRef(new Map<string, string>());

    function operationId(kind: string, value: unknown) {
        const key = JSON.stringify({ kind, value });
        const existing = operations.current.get(key);
        if (existing) return existing;
        const id = crypto.randomUUID();
        operations.current.set(key, id);
        return id;
    }

    function completeOperation(kind: string, value: unknown) {
        operations.current.delete(JSON.stringify({ kind, value }));
    }

    useEffect(() => {
        if (!query.data || workspace) return;
        setWorkspace(query.data);
        const preferred = query.data.branches.find(
            (branch) => branch.id === query.data.preferredBranchId,
        );
        const branch = preferred ?? query.data.branches[0];
        if (branch) {
            const initial = editFromBranch(branch);
            editRef.current = initial;
            setEdit(initial);
        }
    }, [query.data, workspace]);

    function change(
        update: (current: KnowledgeWorkingContent) => KnowledgeWorkingContent,
    ) {
        const current = editRef.current;
        if (!current) return;
        const content = update(current.content);
        if (JSON.stringify(content) === JSON.stringify(current.content)) return;
        const next = { ...current, content };
        editRef.current = next;
        setEdit(next);
        setStatus(
            pending.current
                ? 'saving'
                : contentChanged(next)
                  ? 'unsaved'
                  : 'saved',
        );
        setError(null);
        failedContent.current = null;
    }

    function chooseBranch(branch: KnowledgeWorkingBranch) {
        const next = editFromBranch(branch);
        editRef.current = next;
        setEdit(next);
        setStatus('saved');
        setError(null);
        failedContent.current = null;
    }

    async function persist(): Promise<boolean> {
        if (pending.current) {
            const previous = await pending.current;
            if (!previous) return false;
        }
        const current = editRef.current;
        if (!current || !contentChanged(current)) return true;
        const content = current.content;
        const snapshot = JSON.stringify(content);
        if (failedContent.current === snapshot) return false;
        setStatus('saving');
        const operation = {
            branchId: current.branchId,
            expectedVersion: current.version,
            content,
        };
        const work = (async () => {
            try {
                const result = await requestWithSession((token) =>
                    knowledgeApi.updateWorking(token, noteId, {
                        operationId: operationId('working', operation),
                        ...operation,
                    }),
                );
                completeOperation('working', operation);
                const latest = editRef.current;
                if (latest?.branchId === current.branchId) {
                    const next: WorkingEdit = {
                        branchId: result.branch.id,
                        version: result.branch.version,
                        content: latest.content,
                        synced: content,
                    };
                    editRef.current = next;
                    setEdit(next);
                    setStatus(
                        result.conflict
                            ? 'conflict'
                            : contentChanged(next)
                              ? 'unsaved'
                              : 'saved',
                    );
                }
                setWorkspace((previous) =>
                    previous
                        ? {
                              ...previous,
                              branches: result.branches,
                              preferredBranchId: result.branch.id,
                          }
                        : previous,
                );
                await client.invalidateQueries({
                    queryKey: ['knowledge', actorId, 'library'],
                });
                return true;
            } catch (caught) {
                failedContent.current = snapshot;
                setStatus('error');
                setError(caught);
                return false;
            }
        })();
        pending.current = work;
        const result = await work;
        if (pending.current === work) pending.current = null;
        return result;
    }

    useEffect(() => {
        if (!edit || !contentChanged(edit)) return;
        const timer = window.setTimeout(() => {
            void persist();
        }, 800);
        return () => window.clearTimeout(timer);
        // Persist reads the current editor snapshot; unrelated query updates
        // must not postpone draft recovery.
    }, [edit?.content, edit?.version, edit?.branchId]);

    async function flush(): Promise<WorkingEdit> {
        if (!(await persist()))
            throw new Error('Working draft was not recovered');
        const latest = editRef.current;
        if (!latest) throw new Error('Working draft is unavailable');
        if (contentChanged(latest)) return flush();
        return latest;
    }

    async function save() {
        const current = await flush();
        const publishedVersion = workspace?.published?.version ?? 0;
        const operation = {
            branchId: current.branchId,
            expectedVersion: current.version,
            expectedPublishedVersion: publishedVersion,
        };
        const note = await requestWithSession((token) =>
            knowledgeApi.saveWorkspace(token, noteId, {
                operationId: operationId('save', operation),
                ...operation,
            }),
        );
        completeOperation('save', operation);
        setWorkspace((previous) =>
            previous
                ? { ...previous, status: 'saved', published: note }
                : previous,
        );
        await client.invalidateQueries({ queryKey: ['knowledge', actorId] });
        return note;
    }

    async function saveCopy() {
        const current = await flush();
        const operation = {
            branchId: current.branchId,
            expectedVersion: current.version,
        };
        const note = await requestWithSession((token) =>
            knowledgeApi.saveCopy(token, noteId, {
                operationId: operationId('copy', operation),
                ...operation,
            }),
        );
        completeOperation('copy', operation);
        await client.invalidateQueries({ queryKey: ['knowledge', actorId] });
        return note;
    }

    async function resolveCurrent() {
        const current = await flush();
        const alternatives =
            workspace?.branches.filter(
                (branch) => branch.id !== current.branchId,
            ) ?? [];
        if (!alternatives.length) return;
        const operation = {
            keepBranchId: current.branchId,
            keepVersion: current.version,
            discardBranches: alternatives.map((branch) => ({
                id: branch.id,
                expectedVersion: branch.version,
            })),
        };
        const resolved = await requestWithSession((token) =>
            knowledgeApi.resolveWorking(token, noteId, {
                operationId: operationId('resolve', operation),
                ...operation,
            }),
        );
        completeOperation('resolve', operation);
        setWorkspace(resolved);
        const branch = resolved.branches.find(
            (item) => item.id === current.branchId,
        );
        if (branch && !contentChanged(editRef.current ?? current))
            chooseBranch(branch);
    }

    async function retryRecovery() {
        failedContent.current = null;
        return persist();
    }

    function setShareEnabled(enabled: boolean) {
        setWorkspace((previous) =>
            previous ? { ...previous, shareEnabled: enabled } : previous,
        );
    }

    async function reload() {
        const result = await query.refetch();
        if (result.data) {
            setWorkspace(result.data);
            const branch = result.data.branches.find(
                (item) => item.id === editRef.current?.branchId,
            );
            if (branch && editRef.current && !contentChanged(editRef.current)) {
                chooseBranch(branch);
            }
        }
    }

    return {
        query,
        // Query success precedes the effect that hydrates the local draft. Keep
        // that render in loading state; a branchless response still fails closed.
        isInitializing:
            query.isPending ||
            (!workspace && query.isSuccess && query.data.branches.length > 0),
        workspace,
        edit,
        status,
        error,
        change,
        chooseBranch,
        retryRecovery,
        flush,
        save,
        saveCopy,
        resolveCurrent,
        setShareEnabled,
        reload,
        hasLocalChanges: Boolean(edit && contentChanged(edit)),
    };
}
