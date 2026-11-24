import { recordingAdmissionRequestId } from './generation-request-id';
import { desc, eq } from 'drizzle-orm';
import type {
    ContinueGenerationRunRequest,
    ReviseGenerationRunRequest,
} from '@languon/contracts';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { conversationReadTransaction } from './conversation-persistence-authority';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import {
    generationOwnerContext,
    generationRunDetail,
    generationRunView,
    lockGenerationRun,
} from './generation-run-context';
import { generationRunsTable as runs } from './conversation-generation-schema';
import { conversationSubmit } from './conversation-turn-admission';

export function conversationListGenerationRuns(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    conversationId: string,
) {
    return conversationReadTransaction(persistence, async (tx) => {
        await generationOwnerContext(
            persistence,
            tx,
            access,
            conversationId,
            false,
        );

        const rows = await tx
            .select()
            .from(runs)
            .where(eq(runs.conversationId, conversationId))
            .orderBy(desc(runs.createdAt))
            .limit(100);

        return {
            runs: await Promise.all(
                rows.map((run) =>
                    generationRunView(persistence.now(), tx, run),
                ),
            ),
        };
    });
}

export function conversationGetGenerationRun(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    conversationId: string,
    runId: string,
) {
    return conversationReadTransaction(persistence, async (tx) => {
        await generationOwnerContext(
            persistence,
            tx,
            access,
            conversationId,
            false,
        );

        return generationRunDetail(
            persistence.now(),
            tx,
            await lockGenerationRun(tx, conversationId, runId, access.ownerId),
        );
    });
}

export function conversationContinueGenerationRun(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    conversationId: string,
    runId: string,
    input: ContinueGenerationRunRequest,
) {
    return conversationSubmit(
        persistence,
        access,
        conversationId,
        {
            requestId: input.requestId,
            content: 'Continue the prepared lesson.',
            attachments: [],
            ...(input.confirmedQuoteId
                ? { confirmedQuoteId: input.confirmedQuoteId }
                : {}),
        },
        {
            runId,
            expectedRevision: input.expectedRevision,
            kind: 'generation',
            ...(input.requestId ===
            recordingAdmissionRequestId(runId, input.expectedRevision)
                ? { recordingAdmission: true as const }
                : {}),
            ...(input.acknowledgedUncertainTurnId
                ? {
                      acknowledgedUncertainTurnId:
                          input.acknowledgedUncertainTurnId,
                  }
                : {}),
            ...(input.sourceChoice ? { sourceChoice: input.sourceChoice } : {}),
        },
    );
}

export function conversationReviseGenerationRun(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    conversationId: string,
    runId: string,
    input: ReviseGenerationRunRequest,
) {
    return conversationSubmit(
        persistence,
        access,
        conversationId,
        {
            requestId: input.requestId,
            content: input.instruction,
            attachments: [],
            ...(input.confirmedQuoteId
                ? { confirmedQuoteId: input.confirmedQuoteId }
                : {}),
        },
        {
            runId,
            expectedRevision: input.expectedRevision,
            kind: 'revision',
            ...(input.acknowledgedUncertainTurnId
                ? {
                      acknowledgedUncertainTurnId:
                          input.acknowledgedUncertainTurnId,
                  }
                : {}),
        },
    );
}
