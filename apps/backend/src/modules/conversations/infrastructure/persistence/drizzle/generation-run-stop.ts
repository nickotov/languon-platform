import { and, eq } from 'drizzle-orm';
import type { StopGenerationRunRequest } from '@languon/contracts';
import { generationFingerprint } from '../../../application/generation-run-revisions';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { ConversationError } from '../../../domain/conversation';
import {
    generationRunsTable as runs,
    generationRunMutationsTable as mutations,
} from './conversation-generation-schema';
import { conversationTurnsTable as turns } from './schema';
import { conversationTransaction } from './conversation-persistence-authority';
import {
    generationOwnerContext,
    lockGenerationRun,
    generationRunDetail,
    emitGenerationRun,
} from './generation-run-context';
import { conversationTerminal } from './conversation-worker-completion';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';

/** Stops both active execution and the durable between-stage authorization. */
export function conversationStopGeneration(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    conversationId: string,
    runId: string,
    input: StopGenerationRunRequest,
) {
    return conversationTransaction(persistence, async (tx) => {
        await generationOwnerContext(persistence, tx, access, conversationId);
        let run = await lockGenerationRun(
            tx,
            conversationId,
            runId,
            access.ownerId,
        );
        const fingerprint = generationFingerprint({ kind: 'stop', input });
        const [receipt] = await tx
            .select()
            .from(mutations)
            .where(
                and(
                    eq(mutations.runId, runId),
                    eq(mutations.requestId, input.requestId),
                ),
            );

        if (receipt) {
            if (receipt.fingerprint !== fingerprint) {
                throw new ConversationError(
                    'idempotency_conflict',
                    'This request identifier has already been used.',
                );
            }

            return generationRunDetail(persistence.now(), tx, run);
        }

        if (
            run.revision !== input.expectedRevision ||
            !['running', 'paused'].includes(run.state)
        ) {
            throw conflict('The lesson changed. Review its current progress.');
        }

        const [updated] = await tx
            .update(runs)
            .set({
                automation: null,
                failure: null,
                ...(run.state === 'paused'
                    ? { pauseReason: 'stopped' as const }
                    : {}),
                updatedAt: persistence.now(),
            })
            .where(eq(runs.id, runId))
            .returning();

        run = updated!;
        if (run.activeTurnId) {
            const [turn] = await tx
                .select()
                .from(turns)
                .where(eq(turns.id, run.activeTurnId))
                .for('update');

            if (turn?.status === 'queued') {
                turn.failureCode = 'explicit_stop';
                await conversationTerminal(
                    persistence,
                    tx,
                    turn,
                    'cancelled',
                    'explicit_stop',
                );
            } else if (turn?.status === 'running') {
                await tx
                    .update(turns)
                    .set({
                        cancelRequested: true,
                        failureCode: 'explicit_stop',
                        updatedAt: persistence.now(),
                    })
                    .where(eq(turns.id, turn.id));
            }
        }

        await tx.insert(mutations).values({
            runId,
            requestId: input.requestId,
            fingerprint,
            createdAt: persistence.now(),
        });

        await emitGenerationRun(persistence, tx, runId);

        return generationRunDetail(
            persistence.now(),
            tx,
            await lockGenerationRun(tx, conversationId, runId, access.ownerId),
        );
    });
}
