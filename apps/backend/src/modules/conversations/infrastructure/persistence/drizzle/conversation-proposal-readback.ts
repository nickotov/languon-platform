import { sql } from 'drizzle-orm';
import { KnowledgeContentProposalSchema } from '@languon/contracts';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import {
    conversationUnavailable,
    isReadOnlyKnowledgeSource,
} from '../../../domain/conversation';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import { conversationWithOperation } from './conversation-worker-authority';

/** Read immutable content without granting the worker access to unrelated proposals. */
export function conversationReadContentProposal(
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
                sql`select public.languon_read_learning_content_proposal(
            ${turn.id}::uuid, ${turn.leaseToken}::uuid, ${proposalId}::uuid
        ) as snapshot`,
            )
            .catch(() => {
                throw conversationUnavailable();
            });

        const proposal = KnowledgeContentProposalSchema.parse(
            result[0]?.['snapshot'],
        );

        return { id: proposal.id, body: proposal.body };
    });
}
