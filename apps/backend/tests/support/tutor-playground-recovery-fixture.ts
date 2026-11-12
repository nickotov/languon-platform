import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { expect, vi } from 'vitest';

import {
    ConversationSourceResolver,
    type ConversationsDatabase,
} from '../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { DrizzleConversationStore } from '../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { conversationTurnsTable } from '../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { createTutorPlaygroundService } from '../../src/modules/development-harness/infrastructure/mastra/tutor-playground-service';
import {
    createPlaygroundSessions,
    playgroundAccess,
} from '../../src/modules/development-harness/infrastructure/mastra/tutor-playground-sessions';
import { DrizzleKnowledgeTransactionParticipant } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';

/** Run only inside the mapped disposable playground journey, after fixture provisioning. */
export async function verifyTutorPlaygroundRecovery({
    database,
}: {
    database: ConversationsDatabase;
}) {
    const store = new DrizzleConversationStore({
        database,
        sources: new ConversationSourceResolver({
            verifyDictionaryShare: () => false,
            verifyTextShare: () => false,
            readNote: (tx, owner, id) =>
                new DrizzleKnowledgeTransactionParticipant(tx).getForSource(
                    owner,
                    id,
                ),
        }),
        admitTurn: async () => ({ playground: true }),
        publishNote: (tx, owner, input) =>
            new DrizzleKnowledgeTransactionParticipant(tx).publish(
                owner,
                input,
            ),
    });
    const sessions = createPlaygroundSessions(database, store);
    const staleSession = await sessions.session({ scenarioId: 'empty-owned' });
    const nextSession = await sessions.session({ scenarioId: 'empty-owned' });
    const staleTurn = await store.submit(
        playgroundAccess,
        staleSession.conversationId,
        {
            requestId: randomUUID(),
            content: 'Synthetic interrupted turn A.',
            attachments: [],
            editorContext: await sessions.editor(staleSession.noteId),
        },
    );
    const nextTurn = await store.submit(
        playgroundAccess,
        nextSession.conversationId,
        {
            requestId: randomUUID(),
            content: 'Synthetic exact recovery turn B.',
            attachments: [],
            editorContext: await sessions.editor(nextSession.noteId),
        },
    );

    const staleClaim = await store.claimForTurn(
        staleTurn.id,
        playgroundAccess.ownerId,
    );

    expect(staleClaim?.id).toBe(staleTurn.id);

    // This fixture models a process that died after obtaining a genuine lease;
    // it never manufactures a lease to authorize a provider or a publication.
    await database
        .update(conversationTurnsTable)
        .set({
            leaseUntil: new Date(Date.now() - 1_000),
        })
        .where(eq(conversationTurnsTable.id, staleTurn.id));

    const nextClaim = await store.claimForTurn(
        nextTurn.id,
        playgroundAccess.ownerId,
    );

    expect(nextClaim?.id).toBe(nextTurn.id);
    expect(nextClaim?.conversationId).toBe(nextSession.conversationId);

    const [expired] = await database
        .select()
        .from(conversationTurnsTable)
        .where(eq(conversationTurnsTable.id, staleTurn.id));
    const [recovered] = await database
        .select()
        .from(conversationTurnsTable)
        .where(eq(conversationTurnsTable.id, nextTurn.id));

    expect(expired).toMatchObject({
        status: 'failed',
        failureCode: 'worker_interrupted',
    });

    expect(recovered).toMatchObject({ status: 'running', id: nextTurn.id });

    if (!nextClaim) {
        throw new Error(
            'Exact recovery did not claim the queued synthetic turn.',
        );
    }

    await store.stop(playgroundAccess, nextSession.conversationId, nextTurn.id);
    await store.finish(nextClaim, 'cancelled', 'cancelled');

    const abortSession = await sessions.session({ scenarioId: 'empty-owned' });
    const service = createTutorPlaygroundService({ database });
    const controller = new AbortController();
    const originalSubmit = DrizzleConversationStore.prototype.submit;
    const submitSpy = vi
        .spyOn(DrizzleConversationStore.prototype, 'submit')
        .mockImplementationOnce(async function (
            this: DrizzleConversationStore,
            ...args: Parameters<typeof originalSubmit>
        ) {
            const submitted = await originalSubmit.apply(this, args);
            controller.abort();

            return submitted;
        });

    try {
        await expect(
            service.runTurn(
                {
                    scenarioId: 'empty-owned',
                    sessionId: abortSession.conversationId,
                    message: 'Generate grammar.',
                },
                controller.signal,
            ),
        ).rejects.toThrow();
    } finally {
        submitSpy.mockRestore();
    }

    const aborted = await database
        .select()
        .from(conversationTurnsTable)
        .where(
            eq(
                conversationTurnsTable.conversationId,
                abortSession.conversationId,
            ),
        );

    expect(aborted).toHaveLength(1);
    expect(aborted[0]).toMatchObject({ status: 'cancelled' });

    const followup = await service.runTurn(
        {
            scenarioId: 'empty-owned',
            sessionId: abortSession.conversationId,
            message: 'Generate grammar.',
        },
        new AbortController().signal,
    );

    expect(followup.status).toBe('succeeded');

    const claimSession = await sessions.session({ scenarioId: 'empty-owned' });
    const claimSpy = vi
        .spyOn(DrizzleConversationStore.prototype, 'claimForTurn')
        .mockResolvedValueOnce(null);

    try {
        await expect(
            service.runTurn(
                {
                    scenarioId: 'empty-owned',
                    sessionId: claimSession.conversationId,
                    message: 'Generate grammar.',
                },
                new AbortController().signal,
            ),
        ).rejects.toThrow('could not start');
    } finally {
        claimSpy.mockRestore();
    }

    const unclaimed = await database
        .select()
        .from(conversationTurnsTable)
        .where(
            eq(
                conversationTurnsTable.conversationId,
                claimSession.conversationId,
            ),
        );

    expect(unclaimed).toHaveLength(1);
    expect(unclaimed[0]).toMatchObject({ status: 'cancelled' });

    return {
        expiredTurnStatus: expired!.status,
        recoveredTurnStatus: recovered!.status,
        postSubmitAbortStatus: aborted[0]!.status,
        failedClaimStatus: unclaimed[0]!.status,
    };
}
