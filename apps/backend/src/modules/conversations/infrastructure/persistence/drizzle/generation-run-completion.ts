import { generationAdmissionOutcome } from '../../../application/generation-admission-outcome';
import { reconcileGenerationAttempts } from './generation-run-attempts';
import type { GenerationFailureDiagnostic } from '../../../application/generation-failure';
import { eq, sql } from 'drizzle-orm';
import { KnowledgeContentProposalSchema } from '@languon/contracts';
import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    generationContext,
    generationStageHasProgress,
    lockGenerationRun,
} from './generation-run-context';
import {
    generationRunActionsTable as actions,
    generationRunsTable as runs,
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
    failure?: GenerationFailureDiagnostic,
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

    const reconciliation =
        status !== 'succeeded' && action.kind === 'generation'
            ? await reconcileGenerationAttempts(
                  tx,
                  run.id,
                  run.revision,
                  turn.id,
                  persistence.now(),
                  failure,
              )
            : undefined;

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
            if (
                run.pauseReason !== 'budget' ||
                action.proposalId ||
                !(await generationStageHasProgress(tx, run, turn.id))
            ) {
                throw conflict(
                    'The lesson did not finish a usable generation stage.',
                );
            }
        }
    } else if (status === 'succeeded') {
        pauseReason = run.pauseReason ?? 'budget';
    }

    // A lease can expire between a checkpoint and the next dispatch. Admission
    // still verifies settled liabilities and the original financial authority.
    const safeRestart =
        (failureCode === 'worker_interrupted' ||
            (status === 'cancelled' &&
                failureCode === 'response_interrupted')) &&
        failure?.code !== 'provider-outcome-unknown' &&
        action.kind === 'generation' &&
        !turn.cancelRequested &&
        !reconciliation?.uncertain;
    const ready =
        (status === 'succeeded' || safeRestart) &&
        action.kind === 'generation' &&
        !proposalId &&
        run.automation;
    let automation = ready
        ? { ...ready, ready: true, dispatchRetryCount: 0 }
        : null;

    if (safeRestart && automation) {
        pauseReason = 'budget';
    }

    if (
        run.automation &&
        status === 'failed' &&
        !turn.cancelRequested &&
        ((failure?.code === 'admission-blocked' &&
            reconciliation?.undispatched) ||
            reconciliation?.knownRateLimit)
    ) {
        const capacity = generationAdmissionOutcome(
            reconciliation?.knownRateLimit
                ? 'capacity_unavailable'
                : (failureCode ?? ''),
            {
                ...run.automation,
                ready: true,
                admissionRetry: {
                    count: run.automation.dispatchRetryCount ?? 0,
                    retryAt: persistence.now().toISOString(),
                },
            },
            persistence.now(),
            turn.id,
        );

        if (capacity.automation && capacity.automation.admissionRetry) {
            automation = {
                ...capacity.automation,
                dispatchRetryCount: capacity.automation.admissionRetry.count,
            };

            pauseReason = capacity.pauseReason;
        }
    }

    await tx
        .update(runs)
        .set({
            state: proposalId ? 'completed' : 'paused',
            proposalId,
            activeTurnId: null,
            pauseReason: proposalId ? null : pauseReason,
            failure:
                status === 'failed' ||
                (pauseReason === 'interrupted' &&
                    failure?.code === 'provider-outcome-unknown')
                    ? failure
                        ? { ...failure, referenceId: turn.id }
                        : {
                              referenceId: turn.id,
                              code:
                                  failureCode === 'generation_output_limit'
                                      ? 'output-limit'
                                      : failureCode === 'worker_interrupted'
                                        ? 'interrupted'
                                        : 'unknown',
                          }
                    : null,
            automation,
            updatedAt: persistence.now(),
        })
        .where(eq(runs.id, run.id));
}
