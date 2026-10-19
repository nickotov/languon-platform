import { Chat } from '@ai-sdk/react';
import type { QueryClient } from '@tanstack/react-query';
import type { ConversationDetail, ConversationTurn } from '@languon/contracts';
import {
    DurableChatTransport,
    ConversationApiError,
    conversationUIMessages,
    reduceConversationEvent,
    type ConversationSessionRequest,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';

type Admission = {
    resolve(turn: ConversationTurn): void;
    reject(error: Error): void;
};

/** One committed subscription owns its callbacks, Chat, cache key and publications. */
export function createConversationStreamSession({
    actorId,
    id,
    request,
    shareKey,
    client,
}: {
    actorId: string;
    id: string | null;
    request: ConversationSessionRequest;
    shareKey: string | undefined;
    client: QueryClient;
}) {
    const queryKey = ['conversation', actorId, id];
    const state = {
        mounted: false,
        active: false,
        epoch: 0,
        queue: Promise.resolve(),
        bootstrapped: false,
        detail: undefined as ConversationDetail | undefined,
        admission: null as Admission | null,
    };
    let flags = { reconnecting: false, unavailable: false };
    const listeners = new Set<() => void>();
    function updateFlags(next: Partial<typeof flags>) {
        flags = { ...flags, ...next };
        for (const listener of listeners) listener();
    }
    function resetPublication(active: boolean) {
        state.epoch += 1;
        state.active = active;
        state.queue = Promise.resolve();
    }
    const transport = new DurableChatTransport({
        request,
        shareKey,
        getDetail: () => state.detail,
        onAdmitted(turn) {
            if (!state.active) return;
            state.admission?.resolve(turn);
            state.admission = null;
        },
    });
    // Externally managed Chat binds callbacks to this owner. useChat's ordinary
    // options wrappers redirect old instances to the latest render's callbacks.
    const chat: Chat<ConversationUIMessage> = new Chat<ConversationUIMessage>({
        id: id ?? `pending:${actorId}`,
        transport,
        sendAutomaticallyWhen: () => false,
        onData(part) {
            if (!state.active) return;
            if (part.type === 'data-connection') {
                updateFlags({ reconnecting: part.data.reconnecting });
                return;
            }
            if (part.type === 'data-reconcile') {
                if (part.data.conversation.id === id) {
                    state.bootstrapped = true;
                    chat.messages = conversationUIMessages(part.data);
                }
                return;
            }
            if (
                part.type !== 'data-canonical' ||
                part.data.conversationId !== id
            )
                return;
            state.bootstrapped = true;
            const epoch = state.epoch;
            // Cancellation may finish after a GET success continuation. Wait before
            // publishing, and serialize because SDK transient onData is synchronous.
            const cancelled = client.cancelQueries({ queryKey, exact: true });
            state.queue = state.queue.then(async () => {
                await cancelled;
                if (!state.active || state.epoch !== epoch) return;
                client.setQueryData<ConversationDetail>(queryKey, (current) =>
                    reduceConversationEvent(current, part.data),
                );
                state.detail =
                    client.getQueryData<ConversationDetail>(queryKey);
            });
        },
        onError(error) {
            if (!state.active) return;
            state.admission?.reject(error);
            state.admission = null;
            if (
                error instanceof ConversationApiError &&
                [401, 403, 404, 410].includes(error.status)
            ) {
                resetPublication(false);
                state.detail = undefined;
                state.bootstrapped = false;
                chat.messages = [];
                client.removeQueries({ queryKey, exact: true });
                updateFlags({ unavailable: true, reconnecting: false });
            }
        },
    });
    return {
        state,
        chat,
        transport,
        resetPublication,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot: () => flags,
        updateFlags,
    };
}
