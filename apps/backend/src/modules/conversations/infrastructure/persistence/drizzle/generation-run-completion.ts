import { eq, sql } from 'drizzle-orm';
import { KnowledgeContentProposalSchema } from '@languon/contracts';
import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { generationContext, lockGenerationRun } from './generation-run-context';
import {
    generationRunActionsTable as actions,
    generationRunsTable as runs,
    generationRunArtifactsTable as artifacts,
} from './conversation-generation-schema';
import type { ConversationsTransaction } from './conversation-source';
import {
    conflict,
    type ConversationPersistenceContext,
    type TurnRow,
} from './conversation-persistence-context';

/** Called inside the terminal turn/settlement transaction, including lease recovery. */
export async function completeGenerationAction(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    turn: TurnRow,
    status: 'succeeded' | 'failed' | 'cancelled',
    failureCode?: string,
) {
    const [action] = await tx
        .select()
        .from(actions)
        .where(eq(actions.turnId, turn.id));

    if (!action) {
        return;
    }

    const run = await lockGenerationRun(
        tx,
        turn.conversationId,
        action.runId,
        turn.ownerId,
    );

    if (
        action.kind === 'generation' &&
        turn.execution.actionAccountingVersion === 1
    ) {
        await new DrizzleActionAccountingParticipant(tx).attachSettlementSeries(
            { actionId: turn.id, ownerId: turn.ownerId, seriesId: run.id },
        );
    }

    if (
        run.state === 'discarded' ||
        run.activeTurnId !== turn.id ||
        run.revision !== action.revision
    ) {
        return;
    }

    let proposalId: string | null = null;
    let pauseReason: NonNullable<typeof run.pauseReason> =
        status === 'cancelled'
            ? turn.failureCode === 'explicit_stop'
                ? 'stopped'
                : 'interrupted'
            : status === 'failed'
              ? failureCode === 'worker_interrupted'
                  ? 'interrupted'
                  : 'technical-failure'
              : 'budget';

    if (status === 'succeeded' && action.kind === 'generation') {
        const context = await generationContext(tx, run);
        const complete = new Set(
            context.artifacts
                .filter((artifact) => artifact.taskComplete)
                .map((artifact) => artifact.taskId),
        );

        if (complete.size === context.plan.tasks.length && action.proposalId) {
            const result = await tx.execute(
                sql`select public.languon_read_learning_content_proposal(${turn.id}::uuid, ${turn.leaseToken}::uuid, ${action.proposalId}::uuid) as snapshot`,
            );
            const snapshot = result[0]?.['snapshot'] as
                { id?: string; body?: unknown } | undefined;

            if (snapshot?.id !== action.proposalId) {
                throw conflict('The completed proposal is unavailable.');
            }

            KnowledgeContentProposalSchema.parse(snapshot);
            proposalId = action.proposalId;
        } else {
            const progress = await tx
                .select({ id: artifacts.id })
                .from(artifacts)
                .where(eq(artifacts.turnId, turn.id))
                .limit(1);

            if (
                run.pauseReason !== 'budget' ||
                !progress.length ||
                action.proposalId
            ) {
                throw conflict(
                    'The lesson did not finish a usable generation stage.',
                );
            }
        }
    } else if (status === 'succeeded') {
        pauseReason = run.pauseReason ?? 'budget';
    }

    await tx
        .update(runs)
        .set({
            state: proposalId ? 'completed' : 'paused',
            proposalId,
            activeTurnId: null,
            pauseReason: proposalId ? null : pauseReason,
            updatedAt: persistence.now(),
        })
        .where(eq(runs.id, run.id));
}
