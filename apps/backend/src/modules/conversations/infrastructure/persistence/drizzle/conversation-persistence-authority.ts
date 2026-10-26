import {
    ChatPreferencesSchema,
    type ConversationSource,
} from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { resolveConversationPortrait } from '../../../application/portrait-context';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import {
    conversationUnavailable,
    type SourceAuthority,
} from '../../../domain/conversation';
import type { ChatRow } from './conversation-persistence-context';
import {
    chatView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { conversationsTable as chats } from './schema';

export async function conversationTransaction<T>(
    persistence: ConversationPersistenceContext,
    run: (tx: ConversationsTransaction) => Promise<T>,
    acquireCapacity = true,
    prepareCapacity?: (
        tx: ConversationsTransaction,
    ) => Promise<void> | undefined,
) {
    return persistence.dependencies.database.transaction(async (tx) => {
        if (acquireCapacity) {
            await prepareCapacity?.(tx);
            await lockTextAiCapacity(tx);
        }

        return run(tx);
    });
}

export async function conversationReadTransaction<T>(
    persistence: ConversationPersistenceContext,
    run: (tx: ConversationsTransaction) => Promise<T>,
) {
    // Reads retain short source/chat share locks for lifecycle authorization,
    // without joining the global mutation/admission capacity critical section.
    return persistence.dependencies.database.transaction(run);
}

export async function conversationAuthorize(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    access: ConversationAccess,
    id: string,
    material = false,
    query = '',
    write = true,
    lockRows = true,
    sourceOverride?: ConversationSource,
    authorityOverride?: SourceAuthority,
) {
    // Mutation callbacks may acquire the Knowledge owner's exclusive fence.
    // Take that actor fence before source/chat locks, avoiding a SHARE upgrade
    // behind a reader that already holds the actor and is waiting on this chat.
    if (write)
        await persistence.dependencies.sources.assertActiveActor(
            tx,
            access.ownerId,
            'update',
        );
    const [candidate] = sourceOverride
        ? []
        : await tx
              .select()
              .from(chats)
              .where(and(eq(chats.id, id), eq(chats.ownerId, access.ownerId)));

    if (!sourceOverride && !candidate) throw conversationUnavailable();
    const source = await persistence.dependencies.sources.resolve(
        tx,
        access.ownerId,
        sourceOverride ?? candidate!.source,
        access.shareKey
            ? { key: access.shareKey }
            : authorityOverride
              ? { authority: authorityOverride }
              : {},
        material,
        query,
        lockRows,
        write && lockRows,
    );
    const chatQuery = tx
        .select()
        .from(chats)
        .where(and(eq(chats.id, id), eq(chats.ownerId, access.ownerId)));
    const [chat] = !lockRows
        ? await chatQuery
        : write
          ? await chatQuery.for('update')
          : await chatQuery.for('share');

    if (!chat) throw conversationUnavailable();

    return { chat, ...source };
}

export async function conversationPersonalizedView(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    chat: ChatRow,
) {
    const resolved = resolveConversationPortrait(
        ChatPreferencesSchema.parse(chat.preferences),
        await conversationPortraitPolicy(persistence, tx, chat.ownerId),
    );

    return {
        ...chatView(chat),
        effectivePreferences: resolved.preferences,
        preferenceOrigins: resolved.origins,
    };
}

export async function conversationPortraitPolicy(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    ownerId: string,
) {
    return (
        persistence.dependencies.readPortrait?.(tx, ownerId) ?? {
            enabled: false,
            portrait: null,
        }
    );
}
