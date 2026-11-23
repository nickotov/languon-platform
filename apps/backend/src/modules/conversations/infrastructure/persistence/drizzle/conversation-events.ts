import { type ConversationEvent } from '@languon/contracts';
import { and, asc, desc, eq, exists, gt, ne, or, sql } from 'drizzle-orm';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { conversationReadDetail } from './conversation-chat-queries';
import {
    conversationAuthorize,
    conversationReadTransaction,
} from './conversation-persistence-authority';
import { type ConversationPersistenceContext } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import {
    conversationEventsTable as events,
    conversationMessagesTable as messages,
} from './schema';
import { transcriptMessage } from './conversation-transcript';

export async function conversationEvents(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    after: number,
): Promise<ConversationEvent[]> {
    return conversationReadTransaction(persistence, async (tx) => {
        const { chat } = await conversationAuthorize(
            persistence,
            tx,
            access,
            id,
            false,
            '',
            false,
        );
        const cutoff = new Date(persistence.now().getTime() - 86_400_000);
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
                    data: await conversationReadDetail(persistence, tx, chat),
                    createdAt: persistence.now().toISOString(),
                },
            ];
        }

        // Some other event payloads use non-message identifiers. Only cast IDs
        // from message events, then check the same transcript used for snapshots.
        const messageId = sql<string>`(case when ${events.type} = 'message' then ${events.data}->>'id' end)::uuid`;
        const visibleMessage = tx
            .select({ id: messages.id })
            .from(messages)
            .where(
                and(
                    eq(messages.conversationId, events.conversationId),
                    eq(messages.id, messageId),
                    transcriptMessage(),
                ),
            );
        const rows = await tx
            .select()
            .from(events)
            .where(
                and(
                    eq(events.conversationId, id),
                    gt(events.id, after),
                    gt(events.createdAt, cutoff),
                    or(ne(events.type, 'message'), exists(visibleMessage)),
                ),
            )
            .orderBy(asc(events.id))
            .limit(100);

        return rows.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
        })) as ConversationEvent[];
    });
}

export async function conversationEvent(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    conversationId: string,
    type: typeof events.$inferInsert.type,
    data: Record<string, unknown>,
) {
    await tx
        .insert(events)
        .values({ conversationId, type, data, createdAt: persistence.now() });
}
