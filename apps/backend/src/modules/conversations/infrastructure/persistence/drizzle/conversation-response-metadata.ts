import { and, eq } from 'drizzle-orm';
import {
    ConversationResponseMetadataSchema,
    type ConversationResponseMetadata,
} from '@languon/contracts';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import { conversationUnavailable } from '../../../domain/conversation';
import { conversationEvent } from './conversation-events';
import {
    messageView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import { conversationWithOperation } from './conversation-worker-authority';
import { conversationMessagesTable as messages } from './schema';

/** Presentation decisions are written only by the active, source-authorized worker. */
export async function conversationRecordResponseMetadata(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    candidate: ConversationResponseMetadata,
) {
    const responseMetadata =
        ConversationResponseMetadataSchema.parse(candidate);

    await conversationWithOperation(persistence, turn, async (tx) => {
        const [row] = await tx
            .update(messages)
            .set({ responseMetadata })
            .where(
                and(
                    eq(messages.turnId, turn.id),
                    eq(messages.role, 'assistant'),
                ),
            )
            .returning();

        if (!row) {
            throw conversationUnavailable();
        }

        await conversationEvent(
            persistence,
            tx,
            turn.conversationId,
            'message',
            messageView(row),
        );
    });
}
