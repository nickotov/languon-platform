import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KnowledgeNote, KnowledgeNoteContent } from '@languon/contracts';
import {
    knowledgeApi,
    KnowledgeApiError,
    noteContent,
} from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';

type Edit = {
    original: KnowledgeNoteContent;
    content: KnowledgeNoteContent;
    version: number;
};

export function useKnowledgeNote(noteId: string) {
    const { requestWithSession } = useAuth();
    const actorId = useSessionStore((state) => state.user?.id);
    const client = useQueryClient();
    const key = ['knowledge', actorId, 'note', noteId];
    const [edit, setEdit] = useState<Edit | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const operation = useRef<{ key: string; id: string } | null>(null);
    const query = useQuery({
        queryKey: key,
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                knowledgeApi.read(token, noteId, signal),
            ),
        enabled: Boolean(actorId),
        retry: false,
        gcTime: 0,
    });
    const history = useQuery({
        queryKey: [...key, 'revisions'],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                knowledgeApi.revisions(token, noteId, signal),
            ),
        enabled: Boolean(actorId) && historyOpen,
        retry: false,
        gcTime: 0,
    });
    function operationId(value: unknown) {
        const identity = JSON.stringify(value);
        if (operation.current?.key !== identity)
            operation.current = { key: identity, id: crypto.randomUUID() };
        return operation.current.id;
    }
    async function updated(note: KnowledgeNote) {
        if (useSessionStore.getState().user?.id !== actorId) return;
        operation.current = null;
        setEdit(null);
        client.setQueryData(key, note);
        await client.invalidateQueries({ queryKey: ['knowledge', actorId] });
    }
    const save = useMutation({
        mutationFn: (value: Edit) => {
            const input = {
                expectedVersion: value.version,
                content: value.content,
            };
            return requestWithSession((token) =>
                knowledgeApi.update(token, noteId, {
                    ...input,
                    operationId: operationId({ save: input }),
                }),
            );
        },
        onSuccess: updated,
        onError: (error) => {
            if (error instanceof KnowledgeApiError && error.status === 409)
                void query.refetch();
        },
    });
    const saveNew = useMutation({
        mutationFn: (content: KnowledgeNoteContent) =>
            requestWithSession((token) =>
                knowledgeApi.create(token, {
                    content,
                    operationId: operationId({ create: content }),
                }),
            ),
        onSuccess: async () => {
            if (useSessionStore.getState().user?.id !== actorId) return;
            operation.current = null;
            setEdit(null);
            await client.invalidateQueries({
                queryKey: ['knowledge', actorId],
            });
        },
    });
    const remove = useMutation({
        mutationFn: (version: number) =>
            requestWithSession((token) =>
                knowledgeApi.remove(token, noteId, {
                    expectedVersion: version,
                    operationId: operationId({ delete: version }),
                }),
            ),
        onSuccess: async () => {
            if (useSessionStore.getState().user?.id !== actorId) return;
            client.removeQueries({ queryKey: key });
            await client.invalidateQueries({
                queryKey: ['knowledge', actorId],
            });
        },
        onError: (error) => {
            if (error instanceof KnowledgeApiError && error.status === 409)
                void query.refetch();
        },
    });
    const restore = useMutation({
        mutationFn: (revisionVersion: number) => {
            if (!query.data) throw new Error('Note is unavailable');
            const input = {
                expectedVersion: query.data.version,
                revisionVersion,
            };
            return requestWithSession((token) =>
                knowledgeApi.restore(token, noteId, {
                    ...input,
                    operationId: operationId({ restore: input }),
                }),
            );
        },
        onSuccess: updated,
        onError: (error) => {
            if (error instanceof KnowledgeApiError && error.status === 409)
                void query.refetch();
        },
    });
    function startEditing(note: KnowledgeNote) {
        save.reset();
        saveNew.reset();
        const content = noteContent(note);
        setEdit({ content, original: content, version: note.version });
    }
    const busy =
        save.isPending ||
        saveNew.isPending ||
        remove.isPending ||
        restore.isPending;
    const conflict =
        edit !== null &&
        query.data !== undefined &&
        query.data.version !== edit.version;
    return {
        query,
        history,
        historyOpen,
        setHistoryOpen,
        edit,
        setEdit,
        startEditing,
        save,
        saveNew,
        remove,
        restore,
        busy,
        conflict,
    };
}
