import { and, eq } from 'drizzle-orm';
import {
    overdueAccountingActions,
    removeExpiredActionQuotes,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-maintenance';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { conversationUnavailable } from '../../../domain/conversation';
import {
    conversationAuthorize,
    conversationTransaction,
} from './conversation-persistence-authority';
import {
    turnView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import { conversationTerminal } from './conversation-worker-completion';
import { conversationTurnsTable as turns } from './schema';

export async function conversationMaintainAccounting(
    persistence: ConversationPersistenceContext,
) {
    return conversationTransaction(persistence, async (tx) => {
        const now = persistence.now();
        const removedQuotes = await removeExpiredActionQuotes(tx, now);
        const overdue = await overdueAccountingActions(tx, 'conversation', now);
        let recoveredActions = 0;
        for (const action of overdue) {
            const [turn] = await tx
                .select()
                .from(turns)
                .where(
                    and(
                        eq(turns.id, action.id),
                        eq(turns.ownerId, action.ownerId),
                    ),
                )
                .for('update', { skipLocked: true });

            if (!turn) continue;
            if (!['queued', 'running'].includes(turn.status)) continue;
            await conversationTerminal(
                persistence,
                tx,
                turn,
                'failed',
                'worker_interrupted',
            );

            recoveredActions += 1;
        }

        return { removedQuotes, recoveredActions };
    });
}

export async function conversationStop(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    turnId: string,
) {
    return conversationTransaction(
        persistence,
        async (tx) => {
            // Stop mutates only the turn. Shared actor/source/chat locks are
            // enough to block purge and avoid upgrading the actor lock.
            await conversationAuthorize(
                persistence,
                tx,
                access,
                id,
                false,
                '',
                false,
                true,
            );

            const [row] = await tx
                .select()
                .from(turns)
                .where(and(eq(turns.id, turnId), eq(turns.conversationId, id)))
                .for('update');

            if (!row) throw conversationUnavailable();
            if (row.status === 'queued') {
                row.failureCode = 'explicit_stop';
                await conversationTerminal(
                    persistence,
                    tx,
                    row,
                    'cancelled',
                    'cancelled',
                );
            } else if (row.status === 'running')
                await tx
                    .update(turns)
                    .set({
                        cancelRequested: true,
                        failureCode: 'explicit_stop',
                        updatedAt: persistence.now(),
                    })
                    .where(eq(turns.id, turnId));
            const [result] = await tx
                .select()
                .from(turns)
                .where(eq(turns.id, turnId));

            return turnView(result!);
        },
        false,
    );
}
