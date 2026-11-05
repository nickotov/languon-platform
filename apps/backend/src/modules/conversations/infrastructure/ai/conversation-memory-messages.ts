import type { MastraDBMessage } from '@mastra/core/memory';
import type { StorageListMessagesInput } from '@mastra/core/storage';
import type {
    TutorMemoryMessage,
    TutorMemoryPort,
} from '../../application/ports/tutor-runner.js';
import { tutorMessageModelContent } from '../../application/tutor-message-context.js';

const unsupported = (): never => {
    throw new Error('This conversation memory operation is not authorized.');
};
const serialize = (value: object): Record<string, unknown> =>
    JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

export function toTutorModelMessage(
    message: TutorMemoryMessage,
    threadId: string,
    resourceId: string,
): MastraDBMessage {
    return {
        id: message.id,
        role: message.role,
        threadId,
        resourceId,
        createdAt: new Date(message.createdAt),
        content: tutorMessageModelContent(
            message,
        ) as MastraDBMessage['content'],
    };
}

function visibleText(message: MastraDBMessage): string {
    return message.content.parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('');
}

/** Canonical message projection, bounded history reads and SDK message persistence. */
export class ConversationMemoryMessages {
    constructor(
        private readonly options: {
            conversationId: string;
            ownerId: string;
            port: TutorMemoryPort;
        },
        private readonly assertScope: (
            threadId: string | null | undefined,
            resourceId?: string,
        ) => void,
    ) {}

    async listMessagesById({ messageIds }: { messageIds: string[] }) {
        const { messages } = await this.options.port.listMessages({
            ids: messageIds,
            offset: 0,
            limit: 500,
            order: 'asc',
        });

        return {
            messages: messages.map((message) =>
                toTutorModelMessage(
                    message,
                    this.options.conversationId,
                    this.options.ownerId,
                ),
            ),
        };
    }

    async listMessages(input: StorageListMessagesInput) {
        for (const id of Array.isArray(input.threadId)
            ? input.threadId
            : [input.threadId]) {
            this.assertScope(id, input.resourceId);
        }

        if (
            input.filter?.metadata &&
            Object.keys(input.filter.metadata).length > 0
        ) {
            unsupported();
        }

        const page = input.page ?? 0;
        const limit =
            input.perPage === false ? 500 : Math.min(input.perPage ?? 100, 500);
        const dateRange = input.filter?.dateRange;
        const { messages: rows, total } = await this.options.port.listMessages({
            offset: page * limit,
            limit,
            order: input.orderBy?.direction === 'ASC' ? 'asc' : 'desc',
            ...(dateRange?.start
                ? {
                      after: new Date(
                          dateRange.start.getTime() +
                              (dateRange.startExclusive ? 1 : 0),
                      ).toISOString(),
                  }
                : {}),
            ...(dateRange?.end
                ? {
                      before: new Date(
                          dateRange.end.getTime() -
                              (dateRange.endExclusive ? 1 : 0),
                      ).toISOString(),
                  }
                : {}),
        });

        if (input.perPage === false && total > limit) {
            throw new Error(
                'Conversation context requires a narrower history window.',
            );
        }

        const messages = rows.map((message) =>
            toTutorModelMessage(
                message,
                this.options.conversationId,
                this.options.ownerId,
            ),
        );

        for (const include of input.include ?? []) {
            if (include.threadId) {
                this.assertScope(include.threadId);
            }

            const found = await this.listMessagesById({
                messageIds: [include.id],
            });

            for (const message of found.messages) {
                if (!messages.some((existing) => existing.id === message.id)) {
                    messages.push(message);
                }

                const [before, after] = await Promise.all([
                    this.options.port.listMessages({
                        before: message.createdAt.toISOString(),
                        offset: 0,
                        limit: Math.min(
                            (include.withPreviousMessages ?? 0) + 1,
                            100,
                        ),
                        order: 'desc',
                    }),
                    this.options.port.listMessages({
                        after: message.createdAt.toISOString(),
                        offset: 0,
                        limit: Math.min(
                            (include.withNextMessages ?? 0) + 1,
                            100,
                        ),
                        order: 'asc',
                    }),
                ]);

                for (const neighbor of [
                    ...before.messages,
                    ...after.messages,
                ]) {
                    if (
                        !messages.some(
                            (existing) => existing.id === neighbor.id,
                        )
                    ) {
                        messages.push(
                            toTutorModelMessage(
                                neighbor,
                                this.options.conversationId,
                                this.options.ownerId,
                            ),
                        );
                    }
                }
            }
        }

        const direction = input.orderBy?.direction === 'ASC' ? 1 : -1;
        messages.sort(
            (a, b) =>
                direction *
                (a.createdAt.getTime() - b.createdAt.getTime() ||
                    a.id.localeCompare(b.id)),
        );

        return {
            messages,
            total,
            page,
            perPage: input.perPage === false ? (false as const) : limit,
            hasMore: (page + 1) * limit < total,
        };
    }

    async saveMessages({ messages }: { messages: MastraDBMessage[] }) {
        const saved: TutorMemoryMessage[] = [];
        for (const message of messages) {
            this.assertScope(message.threadId, message.resourceId);
            if (message.role !== 'user' && message.role !== 'assistant') {
                return unsupported();
            }

            if (message.id === 'om-continuation') {
                continue;
            }

            // User text/copies are admitted by the application. SDK-only source
            // provenance and memory markers must never replace that visible text.
            const canonical =
                message.role === 'user'
                    ? (
                          await this.options.port.listMessages({
                              ids: [message.id],
                              offset: 0,
                              limit: 1,
                              order: 'asc',
                          })
                      ).messages[0]
                    : undefined;

            if (message.role === 'user' && canonical?.role !== 'user') {
                unsupported();
            }

            saved.push({
                id: message.id,
                role: message.role,
                content: canonical?.content ?? visibleText(message),
                ...(canonical?.attachments
                    ? { attachments: canonical.attachments }
                    : {}),
                createdAt: message.createdAt.toISOString(),
                modelContent: serialize(message.content),
            });
        }

        await this.options.port.saveMessages(saved);

        return { messages };
    }
}
