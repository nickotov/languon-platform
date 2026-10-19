import { randomUUID } from 'node:crypto';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import {
    MemoryStorage,
    type CreateObservationalMemoryInput,
    type CreateReflectionGenerationInput,
    type ObservationalMemoryHistoryOptions,
    type ObservationalMemoryRecord,
    type StorageListMessagesInput,
    type StorageListThreadsInput,
    type UpdateActiveObservationsInput,
    type UpdateObservationalMemoryConfigInput,
} from '@mastra/core/storage';
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
const recordKey = (id: string) => `observations:${id}`;

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

/** Thread-bound SDK adapter. Persistence owns authorization, transactions and canonical message merging. */
export class ConversationMemoryStorage extends MemoryStorage {
    override readonly supportsObservationalMemory = true;
    constructor(
        private readonly options: {
            conversationId: string;
            ownerId: string;
            createdAt: string;
            port: TutorMemoryPort;
        },
    ) {
        super();
    }

    private assertScope(
        threadId: string | null | undefined,
        resourceId?: string,
    ) {
        if (
            threadId !== this.options.conversationId ||
            (resourceId && resourceId !== this.options.ownerId)
        )
            unsupported();
    }

    async dangerouslyClearAll(): Promise<void> {
        unsupported();
    }
    override async init(): Promise<void> {
        /* Application migrations own the schema. */
    }

    async getThreadById({
        threadId,
    }: {
        threadId: string;
    }): Promise<StorageThreadType> {
        this.assertScope(threadId);
        const state = await this.options.port.readState('thread');
        return {
            id: threadId,
            resourceId: this.options.ownerId,
            title:
                typeof state?.title === 'string'
                    ? state.title
                    : 'Language discussion',
            metadata:
                (state?.metadata as Record<string, unknown> | undefined) ?? {},
            createdAt: new Date(this.options.createdAt),
            updatedAt: new Date(
                typeof state?.updatedAt === 'string'
                    ? state.updatedAt
                    : this.options.createdAt,
            ),
        };
    }

    async saveThread({ thread }: { thread: StorageThreadType }) {
        this.assertScope(thread.id, thread.resourceId);
        await this.options.port.writeState({ thread: serialize(thread) });
        return thread;
    }

    async updateThread(input: {
        id: string;
        title: string;
        metadata: Record<string, unknown>;
    }) {
        const thread = await this.getThreadById({ threadId: input.id });
        return this.saveThread({
            thread: {
                ...thread,
                title: input.title,
                metadata: { ...thread.metadata, ...input.metadata },
                updatedAt: new Date(),
            },
        });
    }

    async deleteThread(): Promise<void> {
        unsupported();
    }
    override async cloneThread(): Promise<never> {
        return unsupported();
    }
    override async getResourceById(): Promise<never> {
        return unsupported();
    }
    override async saveResource(): Promise<never> {
        return unsupported();
    }
    override async updateResource(): Promise<never> {
        return unsupported();
    }
    override async listMessagesByResourceId(): Promise<never> {
        return unsupported();
    }

    async listThreads(input: StorageListThreadsInput) {
        if (
            input.filter?.resourceId &&
            input.filter.resourceId !== this.options.ownerId
        )
            unsupported();
        const thread = await this.getThreadById({
            threadId: this.options.conversationId,
        });
        const matches = Object.entries(input.filter?.metadata ?? {}).every(
            ([key, value]) => thread.metadata?.[key] === value,
        );
        const page = input.page ?? 0;
        return {
            threads: page === 0 && matches ? [thread] : [],
            total: matches ? 1 : 0,
            page,
            perPage: input.perPage ?? 100,
            hasMore: false,
        };
    }

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
            : [input.threadId])
            this.assertScope(id, input.resourceId);
        if (
            input.filter?.metadata &&
            Object.keys(input.filter.metadata).length > 0
        )
            unsupported();
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
        if (input.perPage === false && total > limit)
            throw new Error(
                'Conversation context requires a narrower history window.',
            );
        const messages = rows.map((message) =>
            toTutorModelMessage(
                message,
                this.options.conversationId,
                this.options.ownerId,
            ),
        );
        for (const include of input.include ?? []) {
            if (include.threadId) this.assertScope(include.threadId);
            const found = await this.listMessagesById({
                messageIds: [include.id],
            });
            for (const message of found.messages) {
                if (!messages.some((existing) => existing.id === message.id))
                    messages.push(message);
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
                    )
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
            if (message.role !== 'user' && message.role !== 'assistant')
                return unsupported();
            if (message.id === 'om-continuation') continue;
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
            if (message.role === 'user' && canonical?.role !== 'user')
                unsupported();
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

    async updateMessages({
        messages,
    }: Parameters<MemoryStorage['updateMessages']>[0]) {
        const existing = await this.listMessagesById({
            messageIds: messages.map((message) => message.id),
        });
        const updated = messages.map((update) => {
            const original = existing.messages.find(
                (message) => message.id === update.id,
            );
            if (!original) return unsupported();
            return {
                ...original,
                ...update,
                content: { ...original.content, ...update.content },
            } as MastraDBMessage;
        });
        await this.saveMessages({ messages: updated });
        return updated;
    }

    private async index(): Promise<string[]> {
        const state = await this.options.port.readState('observations:index');
        return Array.isArray(state?.ids)
            ? state.ids.filter((id): id is string => typeof id === 'string')
            : [];
    }

    private async readRecord(id: string): Promise<ObservationalMemoryRecord> {
        if (!(await this.index()).includes(id)) return unsupported();
        const raw = await this.options.port.readState(recordKey(id));
        if (!raw) throw new Error('Conversation memory record is unavailable.');
        const record = {
            ...raw,
            createdAt: new Date(String(raw.createdAt)),
            updatedAt: new Date(String(raw.updatedAt)),
            lastObservedAt: raw.lastObservedAt
                ? new Date(String(raw.lastObservedAt))
                : undefined,
            lastBufferedAtTime: raw.lastBufferedAtTime
                ? new Date(String(raw.lastBufferedAtTime))
                : null,
        } as ObservationalMemoryRecord;
        this.assertScope(record.threadId, record.resourceId);
        return record;
    }

    private async writeRecord(
        record: ObservationalMemoryRecord,
        append = false,
    ) {
        this.assertScope(record.threadId, record.resourceId);
        const ids = await this.index();
        if (!append && !ids.includes(record.id)) unsupported();
        await this.options.port.writeState({
            [recordKey(record.id)]: serialize({
                ...record,
                updatedAt: new Date(),
            }),
            ...(append
                ? {
                      'observations:index': {
                          ids: [...new Set([...ids, record.id])],
                      },
                  }
                : {}),
        });
    }

    override async getObservationalMemory(
        threadId: string | null,
        resourceId: string,
    ) {
        this.assertScope(threadId, resourceId);
        const id = (await this.index()).at(-1);
        return id ? this.readRecord(id) : null;
    }

    override async getObservationalMemoryHistory(
        threadId: string | null,
        resourceId: string,
        limit = 10,
        options?: ObservationalMemoryHistoryOptions,
    ) {
        this.assertScope(threadId, resourceId);
        const ids = (await this.index()).reverse();
        const records = await Promise.all(ids.map((id) => this.readRecord(id)));
        return records
            .filter(
                (record) =>
                    (!options?.from || record.createdAt >= options.from) &&
                    (!options?.to || record.createdAt <= options.to),
            )
            .slice(
                options?.offset ?? 0,
                (options?.offset ?? 0) + Math.min(limit, 100),
            );
    }

    override async initializeObservationalMemory(
        input: CreateObservationalMemoryInput,
    ) {
        this.assertScope(input.threadId, input.resourceId);
        if (input.scope !== 'thread') unsupported();
        const current = await this.getObservationalMemory(
            input.threadId,
            input.resourceId,
        );
        if (current) return current;
        const record: ObservationalMemoryRecord = {
            id: randomUUID(),
            scope: 'thread',
            threadId: input.threadId,
            resourceId: input.resourceId,
            createdAt: new Date(),
            updatedAt: new Date(),
            originType: 'initial',
            generationCount: 0,
            activeObservations: '',
            totalTokensObserved: 0,
            observationTokenCount: 0,
            pendingMessageTokens: 0,
            isReflecting: false,
            isObserving: false,
            isBufferingObservation: false,
            isBufferingReflection: false,
            lastBufferedAtTokens: 0,
            lastBufferedAtTime: null,
            config: input.config,
            ...(input.observedTimezone
                ? { observedTimezone: input.observedTimezone }
                : {}),
        };
        await this.writeRecord(record, true);
        return record;
    }

    override async updateActiveObservations(
        input: UpdateActiveObservationsInput,
    ) {
        const record = await this.readRecord(input.id);
        await this.writeRecord({
            ...record,
            activeObservations: input.observations,
            observationTokenCount: input.tokenCount,
            totalTokensObserved:
                record.totalTokensObserved + record.pendingMessageTokens,
            pendingMessageTokens: 0,
            lastObservedAt: input.lastObservedAt,
            observedMessageIds: [
                ...new Set([
                    ...(record.observedMessageIds ?? []),
                    ...(input.observedMessageIds ?? []),
                ]),
            ],
            ...(input.observedTimezone
                ? { observedTimezone: input.observedTimezone }
                : {}),
        });
    }

    override async createReflectionGeneration(
        input: CreateReflectionGenerationInput,
    ) {
        const current = await this.readRecord(input.currentRecord.id);
        const record: ObservationalMemoryRecord = {
            ...current,
            id: randomUUID(),
            originType: 'reflection',
            generationCount: current.generationCount + 1,
            activeObservations: input.reflection,
            observationTokenCount: input.tokenCount,
            createdAt: new Date(),
            updatedAt: new Date(),
            isReflecting: false,
            isObserving: false,
            observedMessageIds: [],
        };
        await this.writeRecord(record, true);
        return record;
    }

    override async updateObservationalMemoryConfig(
        input: UpdateObservationalMemoryConfigInput,
    ) {
        const record = await this.readRecord(input.id);
        await this.writeRecord({
            ...record,
            config: { ...record.config, ...input.config },
        });
    }

    override async setObservingFlag(id: string, isObserving: boolean) {
        await this.writeRecord({ ...(await this.readRecord(id)), isObserving });
    }
    override async setReflectingFlag(id: string, isReflecting: boolean) {
        await this.writeRecord({
            ...(await this.readRecord(id)),
            isReflecting,
        });
    }
    override async setPendingMessageTokens(
        id: string,
        pendingMessageTokens: number,
    ) {
        await this.writeRecord({
            ...(await this.readRecord(id)),
            pendingMessageTokens,
        });
    }
    override async setBufferingObservationFlag(id: string, value: boolean) {
        if (value) unsupported();
        await this.writeRecord({
            ...(await this.readRecord(id)),
            isBufferingObservation: false,
        });
    }
    override async setBufferingReflectionFlag(id: string, value: boolean) {
        if (value) unsupported();
        await this.writeRecord({
            ...(await this.readRecord(id)),
            isBufferingReflection: false,
        });
    }
    override async clearObservationalMemory(): Promise<void> {
        unsupported();
    }
}
