import { ChatPreferencesSchema } from '@languon/contracts';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import type { TextAiAdmissionExecution } from '../../../../text-ai/application/text-ai-admission-participant';
import { defaultTextAiProviderBudgetPolicy } from '../../../../text-ai/application/text-ai-provider-catalog';
import { ConversationError } from '../../../domain/conversation';
import { conversationEvent } from './conversation-events';
import {
    conversationAuthorize,
    conversationTransaction,
} from './conversation-persistence-authority';
import type { ChatRow, TurnRow } from './conversation-persistence-context';
import {
    turnView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import { conversationTerminal } from './conversation-worker-completion';
import {
    conversationEventsTable as events,
    conversationMessagesTable as messages,
    conversationTurnsTable as turns,
} from './schema';

export async function conversationClaim(
    persistence: ConversationPersistenceContext,
) {
    return conversationTransaction(persistence, async (tx) => {
        const now = persistence.now();
        // Replay is ephemeral; canonical messages and drafts remain independent.
        // Bound cleanup per worker tick and leave conversations with active work alone.
        const expiredEvents = await tx
            .select({ id: events.id })
            .from(events)
            .where(
                and(
                    lt(events.createdAt, new Date(now.getTime() - 86_400_000)),
                    sql`not exists (select 1 from ${turns} where ${turns.conversationId} = ${events.conversationId} and ${turns.status} in ('queued','running'))`,
                ),
            )
            .orderBy(asc(events.id))
            .limit(1000);

        if (expiredEvents.length)
            await tx.delete(events).where(
                inArray(
                    events.id,
                    expiredEvents.map((event) => event.id),
                ),
            );
        const expired = await tx
            .select()
            .from(turns)
            .where(and(eq(turns.status, 'running'), lt(turns.leaseUntil, now)))
            .limit(20);

        for (const row of expired) {
            await persistence.dependencies.settleInterrupted?.(tx, row);
            await conversationTerminal(
                persistence,
                tx,
                row,
                row.cancelRequested ? 'cancelled' : 'failed',
                'worker_interrupted',
            );
        }

        const candidates = await tx
            .select()
            .from(turns)
            .where(eq(turns.status, 'queued'))
            .orderBy(asc(turns.createdAt))
            .limit(100);
        let row: TurnRow | undefined;
        let chat: ChatRow | undefined;
        for (const candidate of candidates) {
            // Avoid retaining actor/source locks for candidates that can
            // already be ruled out by the compact capacity projection.
            const candidateCapacity = await readTextAiCapacity(tx, {
                actorId: candidate.ownerId,
                now,
                budget:
                    (candidate.execution as unknown as TextAiAdmissionExecution)
                        .budget ?? defaultTextAiProviderBudgetPolicy,
            });

            if (candidateCapacity.globalRunning >= 10) return null;
            if (candidateCapacity.actorRunning >= 1) continue;
            let authorized: Awaited<ReturnType<typeof conversationAuthorize>>;
            try {
                // Match Stop's actor -> source/chat -> turn order. Candidate
                // rows stay unlocked until this fence is held so Stop can
                // never hold an actor row while claim waits on its turn.
                authorized = await conversationAuthorize(
                    persistence,
                    tx,
                    { ownerId: candidate.ownerId },
                    candidate.conversationId,
                    false,
                    '',
                    true,
                    true,
                    undefined,
                    candidate.authority,
                );
            } catch (error) {
                if (!(error instanceof ConversationError)) throw error;
                const [unavailable] = await tx
                    .select()
                    .from(turns)
                    .where(eq(turns.id, candidate.id))
                    .for('update', { skipLocked: true });

                if (unavailable?.status === 'queued')
                    await conversationTerminal(
                        persistence,
                        tx,
                        unavailable,
                        'failed',
                        'source_unavailable',
                    );

                // Do not carry locks from a failed source authorization
                // into another learner's candidate.
                return null;
            }

            const [lockedCandidate] = await tx
                .select()
                .from(turns)
                .where(eq(turns.id, candidate.id))
                .for('update', { skipLocked: true });

            if (!lockedCandidate || lockedCandidate.status !== 'queued')
                return null;
            if (lockedCandidate.cancelRequested) {
                await conversationTerminal(
                    persistence,
                    tx,
                    lockedCandidate,
                    'cancelled',
                    'cancelled',
                );

                return null;
            }

            const capacity = await readTextAiCapacity(tx, {
                actorId: lockedCandidate.ownerId,
                now,
                budget:
                    (
                        lockedCandidate.execution as unknown as TextAiAdmissionExecution
                    ).budget ?? defaultTextAiProviderBudgetPolicy,
            });

            if (capacity.globalRunning >= 10) return null;
            if (capacity.actorRunning >= 1) return null;
            row = lockedCandidate;
            chat = authorized.chat;
            break;
        }

        if (!row) return null;
        if (row.cancelRequested) {
            await conversationTerminal(
                persistence,
                tx,
                row,
                'cancelled',
                'cancelled',
            );

            return null;
        }

        if (!chat) return null;
        const [message] = await tx
            .select()
            .from(messages)
            .where(and(eq(messages.turnId, row.id), eq(messages.role, 'user')));

        if (!message)
            throw new ConversationError(
                'invalid_turn',
                'The learner message is missing.',
            );
        const leaseToken = randomUUID();
        const [claimed] = await tx
            .update(turns)
            .set({
                status: 'running',
                leaseToken,
                leaseUntil: new Date(now.getTime() + 60_000),
                updatedAt: now,
            })
            .where(eq(turns.id, row.id))
            .returning();

        await conversationEvent(
            persistence,
            tx,
            row.conversationId,
            'turn',
            turnView(claimed!),
        );

        return {
            id: row.id,
            conversationId: row.conversationId,
            ownerId: row.ownerId,
            leaseToken,
            authority: row.authority,
            sourceSnapshot: row.sourceSnapshot,
            execution: row.execution,
            ...(row.portraitContext
                ? { portraitContext: row.portraitContext }
                : {}),
            preferences: ChatPreferencesSchema.parse(row.preferences),
            source: chat.source,
            conversationCreatedAt: chat.createdAt.toISOString(),
            message: {
                id: message.id,
                role: message.role,
                content: message.content,
                attachments: message.attachments,
                ...(message.editorTarget
                    ? { editorTarget: message.editorTarget }
                    : {}),
                createdAt: message.createdAt.toISOString(),
                ...(message.modelContent?.[0]?.modelContent
                    ? { modelContent: message.modelContent[0].modelContent }
                    : {}),
            },
        };
    });
}
