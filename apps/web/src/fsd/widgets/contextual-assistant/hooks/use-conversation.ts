import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    ChatPreferences,
    ConversationSource,
    CopiedAttachment,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import {
    conversationApi,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { useConversationStream } from './use-conversation-stream';

export function useConversation(
    actorId: string,
    source: ConversationSource,
    request: ConversationSessionRequest,
    shareKey?: string,
) {
    const client = useQueryClient();
    const [selected, setSelected] = useState<string | null>(null);
    const [question, setQuestion] = useState('');
    const [attachments, setAttachments] = useState<CopiedAttachment[]>([]);
    const [useDraft, setUseDraft] = useState(false);
    const [actionError, setActionError] = useState(false);
    const pendingRequest = useRef<SubmitConversationTurnRequest | null>(null);
    const sourceIdentity = JSON.stringify(source);
    const listKey = ['conversations', actorId, sourceIdentity];
    const list = useQuery({
        queryKey: listKey,
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.list(token, source, shareKey, signal),
            ),
        retry: false,
        gcTime: 0,
    });
    const id = selected ?? list.data?.conversations[0]?.id ?? null;
    const detail = useQuery({
        queryKey: ['conversation', actorId, id],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.detail(token, id!, shareKey, signal),
            ),
        enabled: Boolean(id),
        retry: false,
        gcTime: 0,
    });
    const stream = useConversationStream(
        actorId,
        id,
        request,
        shareKey,
        detail.data,
    );
    useEffect(() => {
        setSelected(null);
        setQuestion('');
        setAttachments([]);
        setUseDraft(false);
        pendingRequest.current = null;
    }, [sourceIdentity, actorId]);
    const active = detail.data?.turns.find(
        (turn) => turn.status === 'queued' || turn.status === 'running',
    );
    async function refresh(conversationId = id) {
        await Promise.all([
            client.invalidateQueries({ queryKey: listKey }),
            client.invalidateQueries({
                queryKey: ['conversation', actorId, conversationId],
            }),
        ]);
    }
    const create = useMutation({
        mutationFn: () =>
            request((token) => conversationApi.create(token, source, shareKey)),
        onSuccess: async ({ conversation }) => {
            setSelected(conversation.id);
            await refresh(conversation.id);
        },
    });
    const submit = useMutation({
        mutationFn: async ({
            content,
            draftContext,
            retryOf,
        }: {
            content: string;
            draftContext?: string | undefined;
            retryOf?: string | undefined;
        }) => {
            if (!id) throw new Error('Conversation is unavailable.');
            const candidate = {
                content,
                attachments,
                draftContext: draftContext
                    ? { content: draftContext }
                    : undefined,
                retryOf,
            };
            const signature = JSON.stringify(candidate);
            const previous = pendingRequest.current;
            if (
                !previous ||
                JSON.stringify({ ...previous, requestId: undefined }) !==
                    signature
            )
                pendingRequest.current = {
                    ...candidate,
                    requestId: crypto.randomUUID(),
                };
            const response = await stream.submit(pendingRequest.current!);
            pendingRequest.current = null;
            return response;
        },
        onSuccess: async ({ turn }) => {
            setQuestion('');
            setAttachments([]);
            setActionError(false);
            await refresh(turn.conversationId);
        },
    });
    async function stop() {
        if (!active || !id) return;
        try {
            await request((token) =>
                conversationApi.stop(token, id, active.id, shareKey),
            );
            await refresh();
        } catch {
            setActionError(true);
        }
    }
    async function updatePreferences(preferences: ChatPreferences) {
        if (!id) return;
        try {
            await request((token) =>
                conversationApi.update(token, id, preferences, shareKey),
            );
            await refresh();
        } catch {
            setActionError(true);
        }
    }
    async function remove() {
        if (!id) return;
        await request((token) => conversationApi.delete(token, id, shareKey));
        client.removeQueries({
            queryKey: ['conversation', actorId, id],
            exact: true,
        });
        setSelected(null);
        await refresh();
    }
    function select(next: string) {
        setSelected(next);
        pendingRequest.current = null;
    }
    return {
        id,
        list,
        detail,
        active,
        stream,
        create,
        submit,
        question,
        setQuestion,
        attachments,
        setAttachments,
        useDraft,
        setUseDraft,
        actionError,
        stop,
        updatePreferences,
        remove,
        select,
        refresh,
    };
}
