import {
    ChatPreferencesSchema,
    type ChatPreferences,
    type ConversationSource,
    type CreateConversationRequest,
    type UpdateConversationRequest,
} from '@languon/contracts';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { portraitPreferenceFields } from '../../../application/portrait-context';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { ConversationError } from '../../../domain/conversation';
import {
    conversationDeletionBusy,
    eraseConversationContent,
} from './conversation-deletion-participant';
import {
    conversationAuthorize,
    conversationPersonalizedView,
    conversationReadTransaction,
    conversationTransaction,
} from './conversation-persistence-authority';
import type { ChatRow } from './conversation-persistence-context';
import {
    chatView,
    draftView,
    messageView,
    turnView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import {
    conversationsTable as chats,
    conversationDraftsTable as drafts,
    conversationMessagesTable as messages,
    conversationSettingsTable as settings,
    conversationTurnsTable as turns,
} from './schema';

export async function conversationList(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    source: ConversationSource,
) {
    const read = async (tx: ConversationsTransaction) => {
        await persistence.dependencies.sources.resolve(
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
    const rows = await conversationReadTransaction(persistence, read);
    if (
        rows.every(
            (row) =>
                row.source.shareLocator === source.shareLocator &&
                row.source.shareKind === source.shareKind,
        )
    )
        return rows.map(chatView);

    return conversationTransaction(persistence, async (tx) => {
        await persistence.dependencies.sources.resolve(
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

export async function conversationCreate(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    input: CreateConversationRequest,
) {
    return conversationTransaction(persistence, async (tx) => {
        await persistence.dependencies.sources.resolve(
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
        const manual = ChatPreferencesSchema.parse(
            input.preferences ?? saved?.preferences ?? {},
        );

        if (!manual.portrait)
            manual.portrait = {
                enabled: true,
                inheritedFields: input.preferences
                    ? []
                    : [...portraitPreferenceFields],
            };
        const now = persistence.now();
        const [chat] = await tx
            .insert(chats)
            .values({
                id: randomUUID(),
                ownerId: access.ownerId,
                sourceKind: input.source.kind,
                sourceId: input.source.id,
                source: input.source,
                preferences: manual,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        return conversationPersonalizedView(persistence, tx, chat!);
    });
}

export async function conversationReadDetail(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    chat: ChatRow,
) {
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
        conversation: await conversationPersonalizedView(persistence, tx, chat),
        messages: history.map(messageView),
        turns: operations.map(turnView),
        drafts: proposals.map(draftView),
    };
}

export async function conversationDetail(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
) {
    return conversationReadTransaction(persistence, async (tx) =>
        conversationReadDetail(
            persistence,
            tx,
            (
                await conversationAuthorize(
                    persistence,
                    tx,
                    access,
                    id,
                    false,
                    '',
                    false,
                )
            ).chat,
        ),
    );
}

export async function conversationUpdate(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    changes: UpdateConversationRequest,
) {
    return conversationTransaction(persistence, async (tx) => {
        const { chat: original } = await conversationAuthorize(
            persistence,
            tx,
            access,
            id,
        );

        if (changes.preferences && !changes.preferences.portrait) {
            const prior = ChatPreferencesSchema.parse(original.preferences);
            if (prior.portrait)
                changes = {
                    ...changes,
                    preferences: {
                        ...changes.preferences,
                        portrait: {
                            ...prior.portrait,
                            inheritedFields:
                                prior.portrait.inheritedFields.filter(
                                    (field) =>
                                        changes.preferences![field] ===
                                        prior[field],
                                ),
                        },
                    },
                };
        }

        const [chat] = await tx
            .update(chats)
            .set({
                ...(changes.preferences
                    ? {
                          preferences: ChatPreferencesSchema.parse(
                              changes.preferences,
                          ),
                      }
                    : {}),
                ...(changes.title ? { title: changes.title } : {}),
                version: sql`${chats.version}+1`,
                updatedAt: persistence.now(),
            })
            .where(eq(chats.id, id))
            .returning();

        return conversationPersonalizedView(persistence, tx, chat!);
    });
}

export async function conversationDelete(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
) {
    await conversationTransaction(persistence, async (tx) => {
        await conversationAuthorize(persistence, tx, access, id);
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
                persistence.now(),
            )
        )
            throw new ConversationError(
                'deletion_busy',
                'Response usage is still settling. Try again shortly.',
            );
        await eraseConversationContent(
            tx,
            { conversationIds: [id] },
            persistence.now(),
        );
    });
}

export async function conversationSettings(
    persistence: ConversationPersistenceContext,
    ownerId: string,
    preferences?: ChatPreferences,
) {
    const run = async (tx: ConversationsTransaction) => {
        if (preferences) {
            preferences = ChatPreferencesSchema.parse(preferences);
            await tx
                .insert(settings)
                .values({ ownerId, preferences, updatedAt: persistence.now() })
                .onConflictDoUpdate({
                    target: settings.ownerId,
                    set: { preferences, updatedAt: persistence.now() },
                });

            return preferences;
        }

        const [row] = await tx
            .select()
            .from(settings)
            .where(eq(settings.ownerId, ownerId));

        return ChatPreferencesSchema.parse(row?.preferences ?? {});
    };

    return preferences
        ? conversationTransaction(persistence, run)
        : conversationReadTransaction(persistence, run);
}
