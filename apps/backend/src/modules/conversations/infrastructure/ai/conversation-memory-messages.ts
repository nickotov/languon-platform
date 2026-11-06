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
        // Mastra stamps mutable per-part metadata during conversion. Keep those
        // writes inside an SDK-owned copy of the admitted canonical envelope.
        content: structuredClone(
            tutorMessageModelContent(message),
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
    private readonly emittedAssistantIds = new Set<string>();

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

            const canonical = (
                await this.options.port.listMessages({
                    ids: [message.id],
                    offset: 0,
                    limit: 1,
                    order: 'asc',
                })
            ).messages[0];

            if (message.role === 'user') {
                if (canonical?.role !== 'user') {
                    unsupported();
                }

                // Admission owns text, editor copies and private provenance.
                // SDK observation markers belong to memory state, not this envelope.
                continue;
            }

            if (canonical && !this.emittedAssistantIds.has(message.id)) {
                if (canonical.role !== 'assistant') {
                    unsupported();
                }

                // Historical SDK replays are read-only, including tool arguments.
                continue;
            }

            this.emittedAssistantIds.add(message.id);
            saved.push({
                id: message.id,
                role: message.role,
                content: visibleText(message),
                createdAt: message.createdAt.toISOString(),
                modelContent: serialize(message.content),
            });
        }

        if (saved.length > 0) {
            await this.options.port.saveMessages(saved);
        }

        return { messages };
    }
}
