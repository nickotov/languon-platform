import { sql } from 'drizzle-orm';
import { LearningBlockSchema } from '@languon/contracts';
import { z } from 'zod';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import {
    conversationUnavailable,
    isReadOnlyKnowledgeSource,
} from '../../../domain/conversation';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import { conversationWithOperation } from './conversation-worker-authority';

const snapshotSchema = z
    .object({ id: z.uuid(), blocks: z.array(LearningBlockSchema).max(25) })
    .strict();

/** Read immutable content without granting the worker access to unrelated proposals. */
export function conversationReadBlockProposal(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    proposalId: string,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        if (
            turn.source.kind !== 'knowledge' ||
            isReadOnlyKnowledgeSource(turn.source) ||
            turn.authority.sourceOwnerId !== turn.ownerId
        ) {
            throw conversationUnavailable();
        }

        const result = await tx
            .execute(
                sql`select public.languon_read_learning_block_proposal(
            ${turn.id}::uuid, ${turn.leaseToken}::uuid, ${proposalId}::uuid
        ) as snapshot`,
            )
            .catch(() => {
                throw conversationUnavailable();
            });

        return snapshotSchema.parse(result[0]?.['snapshot']);
    });
}
