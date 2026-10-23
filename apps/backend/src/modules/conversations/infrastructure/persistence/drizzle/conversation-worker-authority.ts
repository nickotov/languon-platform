import { and, eq } from 'drizzle-orm';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import {
    ConversationError,
    conversationUnavailable,
} from '../../../domain/conversation';
import { conversationTransaction } from './conversation-persistence-authority';
import type { TurnRow } from './conversation-persistence-context';
import { type ConversationPersistenceContext } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import {
    conversationsTable as chats,
    conversationTurnsTable as turns,
} from './schema';

export async function conversationWithOperation<T>(
    persistence: ConversationPersistenceContext,
    operation: ClaimedConversationTurn,
    run: (tx: ConversationsTransaction, row: TurnRow) => Promise<T>,
    allowCancelled = false,
) {
    return conversationTransaction(persistence, (tx) =>
        conversationFencedOperation(
            persistence,
            tx,
            operation,
            run,
            allowCancelled,
            'update',
        ),
    );
}

export async function conversationWithProgress(
    persistence: ConversationPersistenceContext,
    operation: ClaimedConversationTurn,
    run: (tx: ConversationsTransaction, row: TurnRow) => Promise<void>,
) {
    // Only append/heartbeat use this path. They cannot alter admission,
    // capacity, billing or publication. Shared lifecycle fences avoid both
    // global admission contention and crossed shared-source actor upgrades.
    return persistence.dependencies.database.transaction((tx) =>
        conversationFencedOperation(
            persistence,
            tx,
            operation,
            run,
            false,
            'share',
        ),
    );
}

export async function conversationFencedOperation<T>(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    operation: ClaimedConversationTurn,
    run: (tx: ConversationsTransaction, row: TurnRow) => Promise<T>,
    allowCancelled: boolean,
    actorLock: 'share' | 'update',
) {
    await persistence.dependencies.sources.assertActiveActor(
        tx,
        operation.ownerId,
        actorLock,
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
    await persistence.dependencies.sources.resolve(
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
        row.leaseUntil <= persistence.now() ||
        (!allowCancelled && row.cancelRequested)
    )
        throw new ConversationError(
            'operation_interrupted',
            'The response is no longer active.',
        );

    return run(tx, row);
}
