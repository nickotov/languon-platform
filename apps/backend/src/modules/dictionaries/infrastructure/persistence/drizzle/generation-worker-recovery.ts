import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { dictionaryGenerationJobsTable } from './schema';
import type { GenerationStoreContext, Transaction } from './generation-context';

import { settleCurrentAiCreditAttempt } from './generation-accounting';
import { scheduleDocumentCleanup } from './generation-cancellation';

export async function recoverGenerationJobs(
    context: GenerationStoreContext,
    tx: Transaction,
    input: Parameters<DictionaryGenerationStore['claim']>[0],
) {
    const stale = await tx
        .select()
        .from(dictionaryGenerationJobsTable)
        .where(
            and(
                eq(dictionaryGenerationJobsTable.executionState, 'running'),
                lte(
                    dictionaryGenerationJobsTable.leaseDeadline,
                    input.context.now,
                ),
                input.textAiSelectionRevision === 1
                    ? undefined
                    : isNull(
                          dictionaryGenerationJobsTable.selectedExecutionVersion,
                      ),
                input.creditSettlementRevision === 1
                    ? undefined
                    : eq(
                          dictionaryGenerationJobsTable.aiCreditAccounted,
                          false,
                      ),
            ),
        )
        .orderBy(asc(dictionaryGenerationJobsTable.leaseDeadline))
        .limit(25)
        .for('update', { skipLocked: true });

    for (const job of stale) {
        const cancelled = job.cancellationRequestedAt !== null;
        const exhausted =
            job.attemptCount >= job.maxAttempts ||
            (usesLegacyAction(job.selectedExecutionSnapshot) &&
                job.aiCreditProviderDispatchedAt !== null);

        await settleCurrentAiCreditAttempt(tx, job, {
            at: input.context.now,
            terminal: cancelled || exhausted,
            outcome:
                cancelled && job.failureCategory !== 'access_revoked'
                    ? 'stopped'
                    : 'failure',
        });

        await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditReservationId: job.aiCreditAccounted
                    ? null
                    : job.aiCreditReservationId,
                completedAt: cancelled || exhausted ? input.context.now : null,
                executionState: cancelled
                    ? 'cancelled'
                    : exhausted
                      ? 'failed'
                      : 'queued',
                failureCategory: cancelled
                    ? job.failureCategory === 'access_revoked'
                        ? 'access_revoked'
                        : 'explicit_stop'
                    : exhausted
                      ? 'retry_exhausted'
                      : null,
                fencingToken: job.fencingToken + 1n,
                heartbeatAt: null,
                inputPayload: cancelled || exhausted ? null : job.inputPayload,
                leaseDeadline: null,
                nextAttemptAt: input.context.now,
                progressPercent: cancelled || exhausted ? 100 : 0,
                progressStage: cancelled || exhausted ? 'terminal' : 'queued',
                providerActualCostMicros: cancelled
                    ? job.providerReservedCostMicros
                    : exhausted
                      ? job.providerReservedCostMicros
                      : null,
                providerActualInputTokens: cancelled
                    ? job.providerReservedInputTokens
                    : exhausted
                      ? job.providerReservedInputTokens
                      : null,
                providerActualOutputTokens: cancelled
                    ? job.providerReservedOutputTokens
                    : exhausted
                      ? job.providerReservedOutputTokens
                      : null,
                providerReservationSettledAt:
                    cancelled || exhausted ? input.context.now : null,
                providerReservationState: cancelled
                    ? 'settled'
                    : exhausted
                      ? 'settled'
                      : 'active',
                updatedAt: input.context.now,
                workerId: null,
            })
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.id, job.id),
                    eq(
                        dictionaryGenerationJobsTable.fencingToken,
                        job.fencingToken,
                    ),
                    eq(
                        dictionaryGenerationJobsTable.leaseDeadline,
                        job.leaseDeadline!,
                    ),
                ),
            );

        if (job.kind === 'document-terms' && (cancelled || exhausted))
            await scheduleDocumentCleanup(
                tx,
                job.id,
                input.context.now,
                cancelled ? 'cancelled' : 'failed',
            );
    }

    const cancelledQueued = await tx
        .select()
        .from(dictionaryGenerationJobsTable)
        .where(
            and(
                eq(dictionaryGenerationJobsTable.executionState, 'queued'),
                isNull(dictionaryGenerationJobsTable.awaitingUploadAt),
                isNotNull(
                    dictionaryGenerationJobsTable.cancellationRequestedAt,
                ),
                input.textAiSelectionRevision === 1
                    ? undefined
                    : isNull(
                          dictionaryGenerationJobsTable.selectedExecutionVersion,
                      ),
                input.creditSettlementRevision === 1
                    ? undefined
                    : eq(
                          dictionaryGenerationJobsTable.aiCreditAccounted,
                          false,
                      ),
            ),
        )
        .limit(25)
        .for('update', { skipLocked: true });

    for (const job of cancelledQueued) {
        const incurredProviderCost = job.attemptCount > 0;
        await settleCurrentAiCreditAttempt(tx, job, {
            at: input.context.now,
            outcome:
                job.failureCategory === 'access_revoked'
                    ? 'failure'
                    : 'stopped',
        });

        await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditReservationId: job.aiCreditAccounted
                    ? null
                    : job.aiCreditReservationId,
                completedAt: input.context.now,
                executionState: 'cancelled',
                failureCategory:
                    job.failureCategory === 'access_revoked'
                        ? 'access_revoked'
                        : 'explicit_stop',
                inputPayload: null,
                progressPercent: 100,
                progressStage: 'terminal',
                providerActualCostMicros: incurredProviderCost
                    ? job.providerReservedCostMicros
                    : 0,
                providerActualInputTokens: incurredProviderCost
                    ? job.providerReservedInputTokens
                    : 0,
                providerActualOutputTokens: incurredProviderCost
                    ? job.providerReservedOutputTokens
                    : 0,
                providerReservationSettledAt: input.context.now,
                providerReservationState: incurredProviderCost
                    ? 'settled'
                    : 'released',
                updatedAt: input.context.now,
            })
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.id, job.id),
                    eq(dictionaryGenerationJobsTable.executionState, 'queued'),
                ),
            );

        if (job.kind === 'document-terms' && job.cancellationRequestedAt)
            await scheduleDocumentCleanup(
                tx,
                job.id,
                input.context.now,
                'cancelled',
            );
    }
}
