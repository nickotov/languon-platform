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
import type { TutorMemoryPort } from '../../application/ports/tutor-runner.js';
import { ConversationMemoryMessages } from './conversation-memory-messages.js';
import { ConversationMemoryRecords } from './conversation-memory-records.js';

export { toTutorModelMessage } from './conversation-memory-messages.js';

const unsupported = (): never => {
    throw new Error('This conversation memory operation is not authorized.');
};
const serialize = (value: object): Record<string, unknown> =>
    JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

/** Thread-bound SDK adapter. Persistence owns authorization, transactions and canonical message merging. */
export class ConversationMemoryStorage extends MemoryStorage {
    override readonly supportsObservationalMemory = true;
    private readonly messages: ConversationMemoryMessages;
    private readonly records: ConversationMemoryRecords;

    constructor(
        private readonly options: {
            conversationId: string;
            ownerId: string;
            createdAt: string;
            port: TutorMemoryPort;
        },
    ) {
        super();

        const assertScope = (
            threadId: string | null | undefined,
            resourceId?: string,
        ) => this.assertScope(threadId, resourceId);

        this.messages = new ConversationMemoryMessages(options, assertScope);
        this.records = new ConversationMemoryRecords(options.port, assertScope);
    }

    private assertScope(
        threadId: string | null | undefined,
        resourceId?: string,
    ) {
        if (
            threadId !== this.options.conversationId ||
            (resourceId && resourceId !== this.options.ownerId)
        ) {
            unsupported();
        }
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
        ) {
            unsupported();
        }

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
        return this.messages.listMessagesById({ messageIds });
    }

    async listMessages(input: StorageListMessagesInput) {
        return this.messages.listMessages(input);
    }

    async saveMessages({ messages }: { messages: MastraDBMessage[] }) {
        return this.messages.saveMessages({ messages });
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

            if (!original) {
                return unsupported();
            }

            return {
                ...original,
                ...update,
                content: { ...original.content, ...update.content },
            } as MastraDBMessage;
        });

        await this.saveMessages({ messages: updated });

        return updated;
    }

    override async getObservationalMemory(
        threadId: string | null,
        resourceId: string,
    ) {
        this.assertScope(threadId, resourceId);
        const id = (await this.records.index()).at(-1);

        return id ? this.records.readRecord(id) : null;
    }

    override async getObservationalMemoryHistory(
        threadId: string | null,
        resourceId: string,
        limit = 10,
        options?: ObservationalMemoryHistoryOptions,
    ) {
        this.assertScope(threadId, resourceId);
        const ids = (await this.records.index()).reverse();
        const records = await Promise.all(
            ids.map((id) => this.records.readRecord(id)),
        );

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
        if (input.scope !== 'thread') {
            unsupported();
        }

        const current = await this.getObservationalMemory(
            input.threadId,
            input.resourceId,
        );

        if (current) {
            return current;
        }

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

        await this.records.writeRecord(record, true);

        return record;
    }

    override async updateActiveObservations(
        input: UpdateActiveObservationsInput,
    ) {
        const record = await this.records.readRecord(input.id);
        await this.records.writeRecord({
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
        const current = await this.records.readRecord(input.currentRecord.id);
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

        await this.records.writeRecord(record, true);

        return record;
    }

    override async updateObservationalMemoryConfig(
        input: UpdateObservationalMemoryConfigInput,
    ) {
        const record = await this.records.readRecord(input.id);
        await this.records.writeRecord({
            ...record,
            config: { ...record.config, ...input.config },
        });
    }

    override async setObservingFlag(id: string, isObserving: boolean) {
        await this.records.writeRecord({
            ...(await this.records.readRecord(id)),
            isObserving,
        });
    }

    override async setReflectingFlag(id: string, isReflecting: boolean) {
        await this.records.writeRecord({
            ...(await this.records.readRecord(id)),
            isReflecting,
        });
    }

    override async setPendingMessageTokens(
        id: string,
        pendingMessageTokens: number,
    ) {
        await this.records.writeRecord({
            ...(await this.records.readRecord(id)),
            pendingMessageTokens,
        });
    }

    override async setBufferingObservationFlag(id: string, value: boolean) {
        if (value) {
            unsupported();
        }

        await this.records.writeRecord({
            ...(await this.records.readRecord(id)),
            isBufferingObservation: false,
        });
    }

    override async setBufferingReflectionFlag(id: string, value: boolean) {
        if (value) {
            unsupported();
        }

        await this.records.writeRecord({
            ...(await this.records.readRecord(id)),
            isBufferingReflection: false,
        });
    }

    override async clearObservationalMemory(): Promise<void> {
        unsupported();
    }
}
