import type { ChatTransport, UIMessageChunk } from 'ai';
import {
    SubmitConversationTurnRequestSchema,
    type ConversationEvent,
    type ConversationTurn,
} from '@languon/contracts';
import {
    conversationApi,
    ConversationApiError,
    type ConversationSessionRequest,
} from './conversation-api';
import type { ConversationUIMessage } from '../lib/conversation-ui-message';

type TransportOptions = {
    request: ConversationSessionRequest;
    shareKey?: string | undefined;
    onAdmitted(turn: ConversationTurn): void;
};

/** Adapts durable admission/replay to AI SDK UI. Abort only disconnects the subscriber. */
export class DurableChatTransport implements ChatTransport<ConversationUIMessage> {
    readonly resumeStreamIsReplay = true;
    private subscription: AbortController | null = null;
    private readonly cursor = { after: 0 };

    constructor(private readonly options: TransportOptions) {}

    close = () => {
        this.subscription?.abort();
    };

    sendMessages: ChatTransport<ConversationUIMessage>['sendMessages'] = async (
        options,
    ) => {
        const input = SubmitConversationTurnRequestSchema.parse(
            options.body && 'turn' in options.body
                ? options.body.turn
                : undefined,
        );
        const { turn } = await this.options.request((token) =>
            conversationApi.submit(
                token,
                options.chatId,
                input,
                this.options.shareKey,
            ),
        );
        this.options.onAdmitted(turn);
        return this.subscribe(options.chatId, options.abortSignal);
    };

    reconnectToStream: ChatTransport<ConversationUIMessage>['reconnectToStream'] =
        async (options) => this.subscribe(options.chatId, options.abortSignal);

    private subscribe(
        id: string,
        signal?: AbortSignal,
    ): ReadableStream<UIMessageChunk> {
        this.close();
        const controller = new AbortController();
        this.subscription = controller;
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) controller.abort();
        const options = this.options;
        const cursor = this.cursor;
        let ended = false;
        return new ReadableStream<UIMessageChunk>({
            start(stream) {
                const connection = (reconnecting: boolean) => {
                    if (!controller.signal.aborted)
                        stream.enqueue({
                            type: 'data-connection',
                            data: { reconnecting },
                            transient: true,
                        });
                };
                async function connect() {
                    while (!controller.signal.aborted) {
                        try {
                            await options.request((token) =>
                                conversationApi.events(
                                    token,
                                    id,
                                    cursor.after,
                                    (event: ConversationEvent) => {
                                        if (controller.signal.aborted) return;
                                        if (
                                            event.id <= cursor.after &&
                                            event.type !== 'snapshot'
                                        )
                                            return;
                                        cursor.after = Math.max(
                                            cursor.after,
                                            event.id,
                                        );
                                        connection(false);
                                        // Canonical replacement avoids replayed text/tool deltas duplicating history.
                                        stream.enqueue({
                                            type: 'data-canonical',
                                            data: event,
                                            transient: true,
                                        });
                                    },
                                    controller.signal,
                                    options.shareKey,
                                ),
                            );
                        } catch (error) {
                            if (controller.signal.aborted) break;
                            if (
                                error instanceof ConversationApiError &&
                                [401, 403, 404, 410].includes(error.status)
                            ) {
                                controller.abort();
                                ended = true;
                                stream.error(error);
                                return;
                            }
                        }
                        if (controller.signal.aborted) break;
                        connection(true);
                        await new Promise<void>((resolve) => {
                            const timer = setTimeout(done, 1500);
                            function done() {
                                clearTimeout(timer);
                                controller.signal.removeEventListener(
                                    'abort',
                                    done,
                                );
                                resolve();
                            }
                            controller.signal.addEventListener('abort', done, {
                                once: true,
                            });
                        });
                    }
                    if (!ended) {
                        ended = true;
                        stream.close();
                    }
                }
                void connect()
                    .catch((error: unknown) => {
                        if (!ended) {
                            ended = true;
                            stream.error(error);
                        }
                    })
                    .finally(() => signal?.removeEventListener('abort', abort));
            },
            cancel() {
                ended = true;
                controller.abort();
            },
        });
    }
}
