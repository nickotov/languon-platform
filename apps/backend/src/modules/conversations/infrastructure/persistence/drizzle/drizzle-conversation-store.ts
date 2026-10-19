import { createHash, randomUUID } from 'node:crypto';
import { and, eq, asc, desc, inArray, gt, lt, isNull, sql } from 'drizzle-orm';
import {
    ChatPreferencesSchema,
    KnowledgeNoteContentSchema,
    ConversationToolCallSchema,
    type ConversationToolCall,
    type ChatPreferences,
    type ConversationSource,
    type CreateConversationRequest,
    type SubmitConversationTurnRequest,
    type KnowledgeNoteContent,
    type KnowledgeNote,
    type PublishKnowledgeDraftRequest,
    type ConversationEvent,
} from '@languon/contracts';
import type {
    ConversationStore,
    ConversationAccess,
    ClaimedConversationTurn,
} from '../../../application/ports/conversation-store';
import type {
    TutorMemoryMessage,
    TutorMemoryPort,
} from '../../../application/ports/tutor-runner';
import {
    assertTutorCurrentMessageFits,
    projectTutorUserMessage,
} from '../../../application/tutor-message-context';
import {
    ConversationError,
    conversationUnavailable,
    type SourceMaterial,
} from '../../../domain/conversation';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { defaultTextAiProviderBudgetPolicy } from '../../../../text-ai/application/text-ai-provider-catalog';
import type { TextAiAdmissionExecution } from '../../../../text-ai/application/text-ai-admission-participant';
import type {
    ConversationSourceResolver,
    ConversationsDatabase,
    ConversationsTransaction,
} from './conversation-source';
import {
    conversationDeletionBusy,
    eraseConversationContent,
} from './conversation-deletion-participant';
import {
    conversationsTable as chats,
    conversationTurnsTable as turns,
    conversationMessagesTable as messages,
    conversationEventsTable as events,
    conversationDraftsTable as drafts,
    conversationMemoryTable as memory,
    conversationSettingsTable as settings,
} from './schema';

type ChatRow = typeof chats.$inferSelect;
type TurnRow = typeof turns.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type DraftRow = typeof drafts.$inferSelect;
const chatView = (r: ChatRow) => ({
    id: r.id,
    source: r.source,
    preferences: r.preferences,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
});
const turnView = (r: TurnRow) => ({
    id: r.id,
    conversationId: r.conversationId,
    status: r.status,
    failureCode: r.failureCode,
    usage: r.usage,
    modelId:
        typeof (r.execution.snapshot as Record<string, unknown> | undefined)
            ?.modelId === 'string'
            ? (r.execution.snapshot as { modelId: string }).modelId
            : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
});
const messageView = (r: MessageRow) => ({
    id: r.id,
    conversationId: r.conversationId,
    turnId: r.turnId,
    role: r.role,
    content: r.content,
    attachments: r.attachments,
    toolCalls: r.toolCalls,
    status: r.status,
    sourceVersion: r.sourceVersion,
    sourceProvenance: r.sourceProvenance,
    createdAt: r.createdAt.toISOString(),
});
const draftView = (r: DraftRow) => ({
    id: r.id,
    conversationId: r.conversationId,
    version: r.version,
    targetNoteId: r.targetNoteId,
    expectedNoteVersion: r.expectedNoteVersion,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
});
const conflict = (message: string) =>
    new ConversationError('version_conflict', message);
export interface ConversationPersistenceDependencies {
    database: ConversationsDatabase;
    sources: ConversationSourceResolver;
    now?: () => Date;
    admitTurn: (
        tx: ConversationsTransaction,
        input: { ownerId: string; turnId: string; conversationId: string },
    ) => Promise<Record<string, unknown>>;
    publishNote: (
        tx: ConversationsTransaction,
        ownerId: string,
        input: {
            operationId: string;
            content: KnowledgeNoteContent;
            noteId?: string;
            expectedVersion?: number;
        },
    ) => Promise<KnowledgeNote>;
    settleInterrupted?: (
        tx: ConversationsTransaction,
        turn: TurnRow,
    ) => Promise<void>;
}
export class DrizzleConversationStore implements ConversationStore {
    private readonly now: () => Date;
    constructor(
        private readonly dependencies: ConversationPersistenceDependencies,
    ) {
        this.now = dependencies.now ?? (() => new Date());
    }
    private async transaction<T>(
        run: (tx: ConversationsTransaction) => Promise<T>,
    ) {
        return this.dependencies.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            return run(tx);
        });
    }
    private async readTransaction<T>(
        run: (tx: ConversationsTransaction) => Promise<T>,
    ) {
        // Reads retain short source/chat share locks for lifecycle authorization,
        // without joining the global mutation/admission capacity critical section.
        return this.dependencies.database.transaction(run);
    }
    private async authorize(
        tx: ConversationsTransaction,
        access: ConversationAccess,
        id: string,
        material = false,
        query = '',
        write = true,
    ) {
        // Mutation callbacks may acquire the Knowledge owner's exclusive fence.
        // Take that actor fence before source/chat locks, avoiding a SHARE upgrade
        // behind a reader that already holds the actor and is waiting on this chat.
        if (write)
            await this.dependencies.sources.assertActiveActor(
                tx,
                access.ownerId,
                'update',
            );
        const [candidate] = await tx
            .select()
            .from(chats)
            .where(and(eq(chats.id, id), eq(chats.ownerId, access.ownerId)));
        if (!candidate) throw conversationUnavailable();
        const source = await this.dependencies.sources.resolve(
            tx,
            access.ownerId,
            candidate.source,
            access.shareKey ? { key: access.shareKey } : {},
            material,
            query,
        );
        const [chat] = await tx
            .select()
            .from(chats)
            .where(and(eq(chats.id, id), eq(chats.ownerId, access.ownerId)))
            .for(write ? 'update' : 'share');
        if (!chat) throw conversationUnavailable();
        return { chat, ...source };
    }
    async list(access: ConversationAccess, source: ConversationSource) {
        const read = async (tx: ConversationsTransaction) => {
            await this.dependencies.sources.resolve(
                tx,
                access.ownerId,
                source,
                access.shareKey ? { key: access.shareKey } : {},
                false,
            );
            return tx
                .select()
                .from(chats)
                .where(
                    and(
                        eq(chats.ownerId, access.ownerId),
                        eq(chats.sourceKind, source.kind),
                        eq(chats.sourceId, source.id),
                    ),
                )
                .orderBy(desc(chats.updatedAt))
                .limit(100)
                .for('share');
        };
        const rows = await this.readTransaction(read);
        if (
            rows.every(
                (row) =>
                    row.source.shareLocator === source.shareLocator &&
                    row.source.shareKind === source.shareKind,
            )
        )
            return rows.map(chatView);
        return this.transaction(async (tx) => {
            await this.dependencies.sources.resolve(
                tx,
                access.ownerId,
                source,
                access.shareKey ? { key: access.shareKey } : {},
                false,
            );
            // Reopening through a newly authorized share restores the actor's existing
            // history for the same source. Running turns retain their admitted proof.
            await tx
                .update(chats)
                .set({ source })
                .where(
                    and(
                        eq(chats.ownerId, access.ownerId),
                        eq(chats.sourceKind, source.kind),
                        eq(chats.sourceId, source.id),
                    ),
                );
            return (
                await tx
                    .select()
                    .from(chats)
                    .where(
                        and(
                            eq(chats.ownerId, access.ownerId),
                            eq(chats.sourceKind, source.kind),
                            eq(chats.sourceId, source.id),
                        ),
                    )
                    .orderBy(desc(chats.updatedAt))
                    .limit(100)
            ).map(chatView);
        });
    }
    async create(access: ConversationAccess, input: CreateConversationRequest) {
        return this.transaction(async (tx) => {
            await this.dependencies.sources.resolve(
                tx,
                access.ownerId,
                input.source,
                access.shareKey ? { key: access.shareKey } : {},
                false,
            );
            const [saved] = await tx
                .select()
                .from(settings)
                .where(eq(settings.ownerId, access.ownerId));
            const now = this.now();
            const [chat] = await tx
                .insert(chats)
                .values({
                    id: randomUUID(),
                    ownerId: access.ownerId,
                    sourceKind: input.source.kind,
                    sourceId: input.source.id,
                    source: input.source,
                    preferences:
                        input.preferences ??
                        saved?.preferences ??
                        ChatPreferencesSchema.parse({}),
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            return chatView(chat!);
        });
    }
    private async readDetail(tx: ConversationsTransaction, chat: ChatRow) {
        const [history, operations, proposals] = await Promise.all([
            tx
                .select()
                .from(messages)
                .where(eq(messages.conversationId, chat.id))
                .orderBy(asc(messages.createdAt), asc(messages.id)),
            tx
                .select()
                .from(turns)
                .where(eq(turns.conversationId, chat.id))
                .orderBy(asc(turns.createdAt)),
            tx
                .select()
                .from(drafts)
                .where(
                    and(
                        eq(drafts.conversationId, chat.id),
                        isNull(drafts.publishedAt),
                    ),
                )
                .orderBy(asc(drafts.createdAt)),
        ]);
        return {
            conversation: chatView(chat),
            messages: history.map(messageView),
            turns: operations.map(turnView),
            drafts: proposals.map(draftView),
        };
    }
    async detail(access: ConversationAccess, id: string) {
        return this.readTransaction(async (tx) =>
            this.readDetail(
                tx,
                (await this.authorize(tx, access, id, false, '', false)).chat,
            ),
        );
    }
    async update(
        access: ConversationAccess,
        id: string,
        preferences: ChatPreferences,
    ) {
        return this.transaction(async (tx) => {
            await this.authorize(tx, access, id);
            const [chat] = await tx
                .update(chats)
                .set({
                    preferences,
                    version: sql`${chats.version}+1`,
                    updatedAt: this.now(),
                })
                .where(eq(chats.id, id))
                .returning();
            return chatView(chat!);
        });
    }
    async delete(access: ConversationAccess, id: string) {
        await this.transaction(async (tx) => {
            await this.authorize(tx, access, id);
            const [active] = await tx
                .select()
                .from(turns)
                .where(
                    and(
                        eq(turns.conversationId, id),
                        inArray(turns.status, ['queued', 'running']),
                    ),
                );
            if (active)
                throw new ConversationError(
                    'deletion_busy',
                    'Stop the active response before deleting this conversation.',
                );
            if (
                await conversationDeletionBusy(
                    tx,
                    { conversationIds: [id] },
                    this.now(),
                )
            )
                throw new ConversationError(
                    'deletion_busy',
                    'Response usage is still settling. Try again shortly.',
                );
            await eraseConversationContent(
                tx,
                { conversationIds: [id] },
                this.now(),
            );
        });
    }
    async settings(ownerId: string, preferences?: ChatPreferences) {
        const run = async (tx: ConversationsTransaction) => {
            if (preferences) {
                await tx
                    .insert(settings)
                    .values({ ownerId, preferences, updatedAt: this.now() })
                    .onConflictDoUpdate({
                        target: settings.ownerId,
                        set: { preferences, updatedAt: this.now() },
                    });
                return preferences;
            }
            const [row] = await tx
                .select()
                .from(settings)
                .where(eq(settings.ownerId, ownerId));
            return row?.preferences ?? ChatPreferencesSchema.parse({});
        };
        return preferences ? this.transaction(run) : this.readTransaction(run);
    }
    async submit(
        access: ConversationAccess,
        id: string,
        input: SubmitConversationTurnRequest,
    ) {
        return this.transaction(async (tx) => {
            const { chat, authority, snapshot } = await this.authorize(
                tx,
                access,
                id,
                true,
            );
            const fingerprint = createHash('sha256')
                .update(JSON.stringify(input))
                .digest('hex');
            const [existing] = await tx
                .select()
                .from(turns)
                .where(
                    and(
                        eq(turns.conversationId, id),
                        eq(turns.requestId, input.requestId),
                    ),
                );
            if (existing) {
                if (existing.requestFingerprint !== fingerprint)
                    throw new ConversationError(
                        'idempotency_conflict',
                        'This request identifier has already been used.',
                    );
                return turnView(existing);
            }
            const [active] = await tx
                .select()
                .from(turns)
                .where(
                    and(
                        eq(turns.conversationId, id),
                        inArray(turns.status, ['queued', 'running']),
                    ),
                );
            if (active)
                throw new ConversationError(
                    'response_active',
                    'A response is already active.',
                );
            let learnerContent = input.content;
            let learnerAttachments = input.attachments;
            if (input.retryOf) {
                const [previous] = await tx
                    .select()
                    .from(turns)
                    .where(
                        and(
                            eq(turns.id, input.retryOf),
                            eq(turns.conversationId, id),
                        ),
                    );
                if (
                    !previous ||
                    !['failed', 'cancelled'].includes(previous.status)
                )
                    throw conflict(
                        'Only an incomplete response can be retried.',
                    );
                const [original] = await tx
                    .select()
                    .from(messages)
                    .where(
                        and(
                            eq(messages.turnId, previous.id),
                            eq(messages.role, 'user'),
                        ),
                    );
                if (!original) throw conversationUnavailable();
                learnerContent = original.content;
                learnerAttachments = original.attachments;
                Object.assign(snapshot, previous.sourceSnapshot);
            }
            if (input.draftContext && !input.retryOf) {
                snapshot.provenance = 'draft';
                snapshot.version = `draft:${snapshot.version}`;
                snapshot.material = [
                    {
                        id: chat.sourceId,
                        label: 'Current draft',
                        content: input.draftContext.content,
                    },
                ];
            }
            const modelContent = projectTutorUserMessage({
                content: learnerContent,
                attachments: learnerAttachments,
                source: {
                    sourceKind: chat.sourceKind,
                    version: snapshot.version,
                    provenance: snapshot.provenance,
                    title: snapshot.title,
                    studiedLanguage: snapshot.studiedLanguage,
                },
            });
            // Reject synchronously before reserving credits or inserting queued
            // work. Accepted visible copies are retained whole and unchanged.
            assertTutorCurrentMessageFits(modelContent);
            const turnId = randomUUID();
            const execution = await this.dependencies.admitTurn(tx, {
                ownerId: access.ownerId,
                turnId,
                conversationId: id,
            });
            const now = this.now();
            const [turn] = await tx
                .insert(turns)
                .values({
                    id: turnId,
                    conversationId: id,
                    ownerId: access.ownerId,
                    requestId: input.requestId,
                    requestFingerprint: fingerprint,
                    status: 'queued',
                    authority,
                    sourceSnapshot: snapshot,
                    preferences: chat.preferences,
                    execution,
                    usage: {
                        inputTokens: 0,
                        outputTokens: 0,
                        chargedCredits: '0',
                        estimated: false,
                    },
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            const userId = randomUUID();
            const modelUserMessage: TutorMemoryMessage = {
                id: userId,
                role: 'user',
                content: learnerContent,
                attachments: learnerAttachments,
                createdAt: now.toISOString(),
                modelContent,
            };
            const [user] = await tx
                .insert(messages)
                .values({
                    id: userId,
                    conversationId: id,
                    turnId,
                    role: 'user',
                    content: learnerContent,
                    attachments: learnerAttachments,
                    modelContent: [modelUserMessage],
                    status: 'complete',
                    sourceVersion: snapshot.version,
                    sourceProvenance: snapshot.provenance,
                    createdAt: now,
                })
                .returning();
            const [assistant] = await tx
                .insert(messages)
                .values({
                    id: randomUUID(),
                    conversationId: id,
                    turnId,
                    role: 'assistant',
                    content: '',
                    attachments: [],
                    status: 'streaming',
                    sourceVersion: snapshot.version,
                    sourceProvenance: snapshot.provenance,
                    createdAt: new Date(now.getTime() + 1),
                })
                .returning();
            await tx
                .update(chats)
                .set({ updatedAt: now })
                .where(eq(chats.id, id));
            await this.event(tx, id, 'message', messageView(user!));
            await this.event(tx, id, 'message', messageView(assistant!));
            await this.event(tx, id, 'turn', turnView(turn!));
            return turnView(turn!);
        });
    }
    async stop(access: ConversationAccess, id: string, turnId: string) {
        return this.transaction(async (tx) => {
            await this.authorize(tx, access, id);
            const [row] = await tx
                .select()
                .from(turns)
                .where(and(eq(turns.id, turnId), eq(turns.conversationId, id)))
                .for('update');
            if (!row) throw conversationUnavailable();
            if (row.status === 'queued')
                await this.terminal(tx, row, 'cancelled', 'cancelled');
            else if (row.status === 'running')
                await tx
                    .update(turns)
                    .set({ cancelRequested: true, updatedAt: this.now() })
                    .where(eq(turns.id, turnId));
            const [result] = await tx
                .select()
                .from(turns)
                .where(eq(turns.id, turnId));
            return turnView(result!);
        });
    }
    async context(access: ConversationAccess, id: string, query: string) {
        return this.readTransaction(async (tx) => {
            const { snapshot } = await this.authorize(
                tx,
                access,
                id,
                true,
                query,
                false,
            );
            const normalized = query.toLocaleLowerCase();
            const matches = snapshot.material.filter(
                (item) =>
                    !query ||
                    `${item.label}\n${item.content}`
                        .toLocaleLowerCase()
                        .includes(normalized),
            );
            return { material: matches.slice(0, 24), total: matches.length };
        });
    }
    async events(
        access: ConversationAccess,
        id: string,
        after: number,
    ): Promise<ConversationEvent[]> {
        return this.readTransaction(async (tx) => {
            const { chat } = await this.authorize(
                tx,
                access,
                id,
                false,
                '',
                false,
            );
            const cutoff = new Date(this.now().getTime() - 86_400_000);
            const rows = await tx
                .select()
                .from(events)
                .where(
                    and(
                        eq(events.conversationId, id),
                        gt(events.id, after),
                        gt(events.createdAt, cutoff),
                    ),
                )
                .orderBy(asc(events.id))
                .limit(100);
            const [first] = await tx
                .select()
                .from(events)
                .where(
                    and(
                        eq(events.conversationId, id),
                        gt(events.createdAt, cutoff),
                    ),
                )
                .orderBy(asc(events.id))
                .limit(1);
            const [last] = await tx
                .select()
                .from(events)
                .where(eq(events.conversationId, id))
                .orderBy(desc(events.id))
                .limit(1);
            if (
                after === 0 ||
                (first && after < first.id - 1) ||
                (!first && last && after < last.id) ||
                after > (last?.id ?? 0)
            ) {
                return [
                    {
                        id: last?.id ?? 0,
                        conversationId: id,
                        type: 'snapshot',
                        data: await this.readDetail(tx, chat),
                        createdAt: this.now().toISOString(),
                    },
                ];
            }
            return rows.map((row) => ({
                ...row,
                createdAt: row.createdAt.toISOString(),
            })) as ConversationEvent[];
        });
    }
    private async event(
        tx: ConversationsTransaction,
        conversationId: string,
        type: typeof events.$inferInsert.type,
        data: Record<string, unknown>,
    ) {
        await tx
            .insert(events)
            .values({ conversationId, type, data, createdAt: this.now() });
    }
    async updateDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
        version: number,
        content: KnowledgeNoteContent,
    ) {
        return this.transaction(async (tx) => {
            await this.authorize(tx, access, id);
            const [row] = await tx
                .update(drafts)
                .set({
                    content: KnowledgeNoteContentSchema.parse(content),
                    version: sql`${drafts.version}+1`,
                    updatedAt: this.now(),
                })
                .where(
                    and(
                        eq(drafts.id, draftId),
                        eq(drafts.conversationId, id),
                        eq(drafts.version, version),
                        isNull(drafts.publishedAt),
                    ),
                )
                .returning();
            if (!row)
                throw conflict('The draft changed. Reload it before saving.');
            const result = draftView(row);
            await this.event(tx, id, 'draft', result);
            return result;
        });
    }
    async discardDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
    ) {
        await this.transaction(async (tx) => {
            await this.authorize(tx, access, id);
            await tx
                .delete(drafts)
                .where(
                    and(
                        eq(drafts.id, draftId),
                        eq(drafts.conversationId, id),
                        isNull(drafts.publishedAt),
                    ),
                );
            await this.event(tx, id, 'draft-deleted', { draftId });
        });
    }
    async publishDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
        input: PublishKnowledgeDraftRequest,
    ) {
        return this.transaction(async (tx) => {
            await this.authorize(tx, access, id);
            const [row] = await tx
                .select()
                .from(drafts)
                .where(
                    and(eq(drafts.id, draftId), eq(drafts.conversationId, id)),
                )
                .for('update');
            if (!row) throw conversationUnavailable();
            if (
                row.publishedAt &&
                row.publicationOperationId !== input.operationId
            )
                throw conflict('This draft has already been saved.');
            if (row.version !== input.expectedVersion)
                throw conflict('The draft changed. Reload it before saving.');
            if (
                input.mode === 'update' &&
                (!row.targetNoteId ||
                    row.expectedNoteVersion !== input.expectedNoteVersion)
            )
                throw conflict('Compare the changed note before updating it.');
            const note = await this.dependencies.publishNote(
                tx,
                access.ownerId,
                {
                    operationId: input.operationId,
                    content: row.content,
                    ...(input.mode === 'update'
                        ? {
                              noteId: row.targetNoteId!,
                              expectedVersion: input.expectedNoteVersion!,
                          }
                        : {}),
                },
            );
            await tx
                .update(drafts)
                .set({
                    publishedAt: this.now(),
                    publicationOperationId: input.operationId,
                })
                .where(eq(drafts.id, draftId));
            await this.event(tx, id, 'draft-deleted', { draftId });
            return note;
        });
    }
    async withOperation<T>(
        operation: ClaimedConversationTurn,
        run: (tx: ConversationsTransaction, row: TurnRow) => Promise<T>,
        allowCancelled = false,
    ) {
        return this.transaction(async (tx) => {
            await this.dependencies.sources.assertActiveActor(
                tx,
                operation.ownerId,
                'update',
            );
            const [candidate] = await tx
                .select()
                .from(chats)
                .where(
                    and(
                        eq(chats.id, operation.conversationId),
                        eq(chats.ownerId, operation.ownerId),
                    ),
                );
            if (!candidate) throw conversationUnavailable();
            await this.dependencies.sources.resolve(
                tx,
                operation.ownerId,
                candidate.source,
                { authority: operation.authority },
                false,
            );
            await tx
                .select({ id: chats.id })
                .from(chats)
                .where(eq(chats.id, candidate.id))
                .for('update');
            const [row] = await tx
                .select()
                .from(turns)
                .where(eq(turns.id, operation.id))
                .for('update');
            if (
                !row ||
                row.status !== 'running' ||
                row.leaseToken !== operation.leaseToken ||
                !row.leaseUntil ||
                row.leaseUntil <= this.now() ||
                (!allowCancelled && row.cancelRequested)
            )
                throw new ConversationError(
                    'operation_interrupted',
                    'The response is no longer active.',
                );
            return run(tx, row);
        });
    }
    async claim() {
        return this.transaction(async (tx) => {
            const now = this.now();
            // Replay is ephemeral; canonical messages and drafts remain independent.
            // Bound cleanup per worker tick and leave conversations with active work alone.
            const expiredEvents = await tx
                .select({ id: events.id })
                .from(events)
                .where(
                    and(
                        lt(
                            events.createdAt,
                            new Date(now.getTime() - 86_400_000),
                        ),
                        sql`not exists (select 1 from ${turns} where ${turns.conversationId} = ${events.conversationId} and ${turns.status} in ('queued','running'))`,
                    ),
                )
                .orderBy(asc(events.id))
                .limit(1000);
            if (expiredEvents.length)
                await tx.delete(events).where(
                    inArray(
                        events.id,
                        expiredEvents.map((event) => event.id),
                    ),
                );
            const expired = await tx
                .select()
                .from(turns)
                .where(
                    and(eq(turns.status, 'running'), lt(turns.leaseUntil, now)),
                )
                .limit(20);
            for (const row of expired) {
                await this.dependencies.settleInterrupted?.(tx, row);
                await this.terminal(
                    tx,
                    row,
                    row.cancelRequested ? 'cancelled' : 'failed',
                    'worker_interrupted',
                );
            }
            const candidates = await tx
                .select()
                .from(turns)
                .where(eq(turns.status, 'queued'))
                .orderBy(asc(turns.createdAt))
                .limit(100)
                .for('update', { skipLocked: true });
            let row: TurnRow | undefined;
            for (const candidate of candidates) {
                if (candidate.cancelRequested) {
                    await this.terminal(
                        tx,
                        candidate,
                        'cancelled',
                        'cancelled',
                    );
                    continue;
                }
                const capacity = await readTextAiCapacity(tx, {
                    actorId: candidate.ownerId,
                    now,
                    budget:
                        (
                            candidate.execution as unknown as TextAiAdmissionExecution
                        ).budget ?? defaultTextAiProviderBudgetPolicy,
                });
                if (capacity.globalRunning >= 10) return null;
                if (capacity.actorRunning >= 1) continue;
                row = candidate;
                break;
            }
            if (!row) return null;
            if (row.cancelRequested) {
                await this.terminal(tx, row, 'cancelled', 'cancelled');
                return null;
            }
            const [chat] = await tx
                .select()
                .from(chats)
                .where(eq(chats.id, row.conversationId));
            if (!chat) return null;
            try {
                await this.dependencies.sources.resolve(
                    tx,
                    row.ownerId,
                    chat.source,
                    { authority: row.authority },
                    false,
                );
            } catch (error) {
                if (!(error instanceof ConversationError)) throw error;
                await this.terminal(tx, row, 'failed', 'source_unavailable');
                return null;
            }
            const [message] = await tx
                .select()
                .from(messages)
                .where(
                    and(eq(messages.turnId, row.id), eq(messages.role, 'user')),
                );
            if (!message)
                throw new ConversationError(
                    'invalid_turn',
                    'The learner message is missing.',
                );
            const leaseToken = randomUUID();
            const [claimed] = await tx
                .update(turns)
                .set({
                    status: 'running',
                    leaseToken,
                    leaseUntil: new Date(now.getTime() + 60_000),
                    updatedAt: now,
                })
                .where(eq(turns.id, row.id))
                .returning();
            await this.event(
                tx,
                row.conversationId,
                'turn',
                turnView(claimed!),
            );
            return {
                id: row.id,
                conversationId: row.conversationId,
                ownerId: row.ownerId,
                leaseToken,
                authority: row.authority,
                sourceSnapshot: row.sourceSnapshot,
                execution: row.execution,
                preferences: row.preferences,
                source: chat.source,
                conversationCreatedAt: chat.createdAt.toISOString(),
                message: {
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    attachments: message.attachments,
                    createdAt: message.createdAt.toISOString(),
                    ...(message.modelContent?.[0]?.modelContent
                        ? { modelContent: message.modelContent[0].modelContent }
                        : {}),
                },
            };
        });
    }
    async heartbeat(turn: ClaimedConversationTurn) {
        await this.withOperation(turn, async (tx) => {
            await tx
                .update(turns)
                .set({
                    leaseUntil: new Date(this.now().getTime() + 60_000),
                    updatedAt: this.now(),
                })
                .where(eq(turns.id, turn.id));
        });
    }
    async append(turn: ClaimedConversationTurn, delta: string) {
        if (!delta) return;
        await this.withOperation(turn, async (tx) => {
            const [row] = await tx
                .update(messages)
                .set({
                    content: sql`left(${messages.content} || ${delta},160000)`,
                })
                .where(
                    and(
                        eq(messages.turnId, turn.id),
                        eq(messages.role, 'assistant'),
                    ),
                )
                .returning();
            if (row)
                await this.event(
                    tx,
                    turn.conversationId,
                    'message',
                    messageView(row),
                );
        });
    }
    async recordMaterial(
        turn: ClaimedConversationTurn,
        material: SourceMaterial[],
    ) {
        await this.withOperation(turn, async (tx) => {
            const [row] = await tx
                .select()
                .from(messages)
                .where(
                    and(
                        eq(messages.turnId, turn.id),
                        eq(messages.role, 'assistant'),
                    ),
                );
            if (!row) throw conversationUnavailable();
            const combined = [...row.attachments];
            for (const item of material) {
                if (!combined.some((existing) => existing.id === item.id))
                    combined.push(item);
            }
            const [updated] = await tx
                .update(messages)
                .set({ attachments: combined.slice(0, 100) })
                .where(eq(messages.id, row.id))
                .returning();
            await this.event(
                tx,
                turn.conversationId,
                'message',
                messageView(updated!),
            );
        });
    }
    async recordTool(
        turn: ClaimedConversationTurn,
        input: ConversationToolCall,
    ) {
        const call = ConversationToolCallSchema.parse(input);
        await this.withOperation(turn, async (tx) => {
            const [row] = await tx
                .select()
                .from(messages)
                .where(
                    and(
                        eq(messages.turnId, turn.id),
                        eq(messages.role, 'assistant'),
                    ),
                );
            if (!row) throw conversationUnavailable();
            const current = row.toolCalls.find((item) => item.id === call.id);
            if (current && current.name !== call.name)
                throw conflict('The tool call identifier was already used.');
            if (current && current.state !== 'running') return;
            const toolCalls = [
                ...row.toolCalls.filter((item) => item.id !== call.id),
                call,
            ];
            if (toolCalls.length > 10)
                throw conflict('The response tool limit was reached.');
            const [updated] = await tx
                .update(messages)
                .set({ toolCalls })
                .where(eq(messages.id, row.id))
                .returning();
            await this.event(
                tx,
                turn.conversationId,
                'message',
                messageView(updated!),
            );
        });
    }
    async propose(
        turn: ClaimedConversationTurn,
        content: KnowledgeNoteContent,
        target?: { noteId: string; version: number },
    ) {
        return this.withOperation(turn, async (tx) => {
            const now = this.now();
            const [row] = await tx
                .insert(drafts)
                .values({
                    id: randomUUID(),
                    conversationId: turn.conversationId,
                    content: KnowledgeNoteContentSchema.parse(content),
                    targetNoteId: target?.noteId ?? null,
                    expectedNoteVersion: target?.version ?? null,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            const result = draftView(row!);
            await this.event(tx, turn.conversationId, 'draft', result);
            return result;
        });
    }
    private async terminal(
        tx: ConversationsTransaction,
        row: TurnRow,
        status: 'succeeded' | 'failed' | 'cancelled',
        failureCode?: string,
    ) {
        const [turn] = await tx
            .update(turns)
            .set({
                status,
                failureCode: failureCode ?? null,
                leaseToken: null,
                leaseUntil: null,
                updatedAt: this.now(),
            })
            .where(eq(turns.id, row.id))
            .returning();
        const [message] = await tx
            .update(messages)
            .set({
                status: status === 'succeeded' ? 'complete' : 'incomplete',
                toolCalls: sql`coalesce((select jsonb_agg(case when item->>'state' = 'running' then jsonb_set(item, '{state}', '"failed"'::jsonb) else item end) from jsonb_array_elements(${messages.toolCalls}) as item), '[]'::jsonb)`,
            })
            .where(
                and(
                    eq(messages.turnId, row.id),
                    eq(messages.role, 'assistant'),
                ),
            )
            .returning();
        if (message)
            await this.event(
                tx,
                row.conversationId,
                'message',
                messageView(message),
            );
        await this.event(tx, row.conversationId, 'turn', turnView(turn!));
    }
    async finish(
        turn: ClaimedConversationTurn,
        status: 'succeeded' | 'failed' | 'cancelled',
        failureCode?: string,
    ) {
        await this.withOperation(
            turn,
            async (tx, row) =>
                this.terminal(
                    tx,
                    row,
                    row.cancelRequested ? 'cancelled' : status,
                    row.cancelRequested ? 'cancelled' : failureCode,
                ),
            true,
        );
    }
    memory(turn: ClaimedConversationTurn): TutorMemoryPort {
        return {
            listMessages: (input) =>
                this.withOperation(turn, async (tx) => {
                    const rows = await tx
                        .select()
                        .from(messages)
                        .where(eq(messages.conversationId, turn.conversationId))
                        .orderBy(asc(messages.createdAt));
                    let values: TutorMemoryMessage[] = rows.flatMap((row) =>
                        row.modelContent?.length
                            ? row.modelContent
                            : row.role === 'user'
                              ? [
                                    {
                                        id: row.id,
                                        role: row.role,
                                        content: row.content,
                                        attachments: row.attachments,
                                        createdAt: row.createdAt.toISOString(),
                                    },
                                ]
                              : [],
                    );
                    values = values.filter(
                        (item) =>
                            (!input.ids || input.ids.includes(item.id)) &&
                            (!input.after || item.createdAt >= input.after) &&
                            (!input.before || item.createdAt <= input.before),
                    );
                    if (input.order === 'desc') values.reverse();
                    return {
                        messages: values.slice(
                            input.offset,
                            input.offset + input.limit,
                        ),
                        total: values.length,
                    };
                }),
            saveMessages: (values) =>
                this.withOperation(turn, async (tx) => {
                    const rows = await tx
                        .select()
                        .from(messages)
                        .where(
                            eq(messages.conversationId, turn.conversationId),
                        );
                    for (const value of values) {
                        const original = rows.find(
                            (row) =>
                                row.id === value.id ||
                                row.modelContent?.some(
                                    (segment) => segment.id === value.id,
                                ),
                        );
                        if (value.role === 'user') {
                            if (
                                !original ||
                                original.role !== 'user' ||
                                original.content !== value.content
                            )
                                throw new ConversationError(
                                    'memory_conflict',
                                    'Original learner messages cannot be rewritten.',
                                );
                            await tx
                                .update(messages)
                                .set({
                                    modelContent: [
                                        {
                                            ...value,
                                            content: original.content,
                                            attachments: original.attachments,
                                        },
                                    ],
                                })
                                .where(eq(messages.id, original.id));
                            continue;
                        }
                        const target =
                            original ??
                            rows.find(
                                (row) =>
                                    row.turnId === turn.id &&
                                    row.role === 'assistant',
                            );
                        if (!target || target.role !== 'assistant')
                            throw new ConversationError(
                                'memory_conflict',
                                'The message does not belong to this response.',
                            );
                        const segments = [...(target.modelContent ?? [])];
                        const index = segments.findIndex(
                            (segment) => segment.id === value.id,
                        );
                        if (index < 0) segments.push(value);
                        else segments[index] = value;
                        target.modelContent = segments;
                        await tx
                            .update(messages)
                            .set({ modelContent: segments })
                            .where(eq(messages.id, target.id));
                    }
                }),
            readState: (key) =>
                this.withOperation(turn, async (tx) => {
                    const [row] = await tx
                        .select()
                        .from(memory)
                        .where(
                            and(
                                eq(memory.conversationId, turn.conversationId),
                                eq(memory.key, key),
                            ),
                        );
                    return (
                        (row?.value as Record<string, unknown> | null) ?? null
                    );
                }),
            writeState: (entries) =>
                this.withOperation(turn, async (tx) => {
                    for (const [key, value] of Object.entries(entries))
                        await tx
                            .insert(memory)
                            .values({
                                conversationId: turn.conversationId,
                                key,
                                value,
                                updatedAt: this.now(),
                            })
                            .onConflictDoUpdate({
                                target: [memory.conversationId, memory.key],
                                set: { value, updatedAt: this.now() },
                            });
                }),
        };
    }
}
