import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    ConversationDetail,
    ConversationTurn,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import {
    conversationUIMessages,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { createConversationStreamSession } from '../lib/conversation-stream-session';

export function useConversationStream(
    actorId: string,
    id: string | null,
    request: ConversationSessionRequest,
    shareKey: string | undefined,
    detail: ConversationDetail | undefined,
) {
    const client = useQueryClient();
    const session = useMemo(
        () =>
            createConversationStreamSession({
                actorId,
                id,
                request,
                shareKey,
                client,
            }),
        [actorId, id, request, shareKey, client],
    );
    const { state, chat, transport, resetPublication } = session;
    const sdk = useChat({ chat });
    const flags = useSyncExternalStore(
        session.subscribe,
        session.getSnapshot,
        session.getSnapshot,
    );

    // Commit owns activation. A speculative/suspended render creates an inert owner;
    // it cannot redirect callbacks or invalidate the still-committed subscription.
    useLayoutEffect(() => {
        state.mounted = true;
        resetPublication(true);
        session.updateFlags({ unavailable: false, reconnecting: false });
        if (id) void chat.resumeStream();
        return () => {
            state.mounted = false;
            resetPublication(false);
            transport.close();
            void chat.stop();
            state.admission?.reject(new Error('Conversation disconnected.'));
            state.admission = null;
        };
    }, [session, state, resetPublication, transport, chat, id]);
    useLayoutEffect(() => {
        if (!state.active || detail?.conversation.id !== id) return;
        state.detail = detail;
        if (!state.bootstrapped && detail) {
            state.bootstrapped = true;
            chat.messages = conversationUIMessages(detail);
        }
    }, [detail, id, state, chat]);

    async function submit(
        input: SubmitConversationTurnRequest,
    ): Promise<{ turn: ConversationTurn }> {
        if (!id || !state.mounted)
            throw new Error('Conversation is unavailable.');
        const epoch = state.epoch;
        await chat.stop();
        if (!state.mounted || state.epoch !== epoch)
            throw new Error('Conversation is unavailable.');
        resetPublication(true);
        chat.clearError();
        const accepted = new Promise<ConversationTurn>((resolve, reject) => {
            state.admission = { resolve, reject };
        });
        void chat
            .sendMessage(
                {
                    id: input.requestId,
                    role: 'user',
                    parts: [{ type: 'text', text: input.content }],
                },
                { body: { turn: input } },
            )
            .catch((error: unknown) => {
                state.admission?.reject(
                    error instanceof Error
                        ? error
                        : new Error('Admission failed.'),
                );
                state.admission = null;
            });
        return { turn: await accepted };
    }
    async function reconnect() {
        await chat.stop();
        if (!state.mounted) return;
        resetPublication(true);
        session.updateFlags({ unavailable: false, reconnecting: false });
        chat.clearError();
        void chat.resumeStream();
    }
    return { ...flags, submit, reconnect, messages: sdk.messages };
}
