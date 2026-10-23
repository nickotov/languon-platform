import { type ConversationEvent } from '@languon/contracts';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { conversationReadDetail } from './conversation-chat-queries';
import {
    conversationAuthorize,
    conversationReadTransaction,
} from './conversation-persistence-authority';
import { type ConversationPersistenceContext } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { conversationEventsTable as events } from './schema';

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
                    data: await conversationReadDetail(persistence, tx, chat),
                    createdAt: persistence.now().toISOString(),
                },
            ];
        }

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
