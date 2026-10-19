import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    ConversationDetail,
    ConversationTurn,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import {
    DurableChatTransport,
    ConversationApiError,
    conversationUIMessages,
    reduceConversationEvent,
    type ConversationSessionRequest,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';

export function useConversationStream(
    actorId: string,
    id: string | null,
    request: ConversationSessionRequest,
    shareKey: string | undefined,
    detail: ConversationDetail | undefined,
) {
    const client = useQueryClient();
    const [reconnecting, setReconnecting] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const admission = useRef<{
        resolve(turn: ConversationTurn): void;
        reject(error: Error): void;
    } | null>(null);
    const transport = useMemo(
        () =>
            new DurableChatTransport({
                request,
                shareKey,
                onAdmitted(turn) {
                    admission.current?.resolve(turn);
                    admission.current = null;
                },
            }),
        [request, shareKey, id],
    );
    const sdk = useChat<ConversationUIMessage>({
        id: id ?? `pending:${actorId}`,
        transport,
        // Tools run only in the durable worker. Receiving an output never submits a turn.
        sendAutomaticallyWhen: () => false,
        onData(part) {
            if (part.type === 'data-connection') {
                setReconnecting(part.data.reconnecting);
                return;
            }
            if (
                part.type !== 'data-canonical' ||
                part.data.conversationId !== id
            )
                return;
            client.setQueryData<ConversationDetail>(
                ['conversation', actorId, id],
                (current) => reduceConversationEvent(current, part.data),
            );
        },
        onError(error) {
            admission.current?.reject(error);
            admission.current = null;
            if (
                error instanceof ConversationApiError &&
                [401, 403, 404, 410].includes(error.status)
            ) {
                client.removeQueries({
                    queryKey: ['conversation', actorId, id],
                    exact: true,
                });
                setUnavailable(true);
            }
        },
    });
    const { resumeStream, setMessages, stop: disconnect } = sdk;
    useEffect(() => {
        if (detail) setMessages(conversationUIMessages(detail));
    }, [detail, setMessages]);
    useEffect(() => {
        setUnavailable(false);
        setReconnecting(false);
        if (id) void resumeStream();
        return () => {
            // SDK stop/transport close only detach HTTP; the server keeps working.
            transport.close();
            void disconnect();
        };
    }, [id, resumeStream, disconnect, transport]);
    async function submit(
        input: SubmitConversationTurnRequest,
    ): Promise<{ turn: ConversationTurn }> {
        if (!id) throw new Error('Conversation is unavailable.');
        await disconnect();
        sdk.clearError();
        const accepted = new Promise<ConversationTurn>((resolve, reject) => {
            admission.current = { resolve, reject };
        });
        void sdk
            .sendMessage(
                {
                    id: input.requestId,
                    role: 'user',
                    parts: [{ type: 'text', text: input.content }],
                },
                { body: { turn: input } },
            )
            .catch((error: unknown) => {
                admission.current?.reject(
                    error instanceof Error
                        ? error
                        : new Error('Admission failed.'),
                );
                admission.current = null;
            });
        return { turn: await accepted };
    }
    async function reconnect() {
        await disconnect();
        setUnavailable(false);
        sdk.clearError();
        void resumeStream();
    }
    return {
        reconnecting,
        unavailable,
        submit,
        reconnect,
        messages: sdk.messages,
    };
}
