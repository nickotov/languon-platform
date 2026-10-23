import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { dictionaryGenerationJobsTable } from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import { workerCas } from './generation-job-access';
import { settleCurrentAiCreditAttempt } from './generation-accounting';
import { scheduleDocumentCleanup } from './generation-cancellation';

export async function heartbeat(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['heartbeat']>[0],
) {
    abort(input.context);
    const [updated] = await context.database
        .update(dictionaryGenerationJobsTable)
        .set({
            heartbeatAt: input.context.now,
            leaseDeadline: input.nextLeaseDeadline,
            progressPercent: input.progress?.percent,
            progressStage: input.progress?.stage,
            updatedAt: input.context.now,
        })
        .where(
            and(
                workerCas(input),
                isNull(dictionaryGenerationJobsTable.cancellationRequestedAt),
            ),
        )
        .returning({ id: dictionaryGenerationJobsTable.id });

    return Boolean(updated);
}

export async function markProviderDispatch(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['markProviderDispatch']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        abort(input.context);
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(workerCas(input))
            .for('update');

        if (!job) return false;
        if (usesLegacyAction(job.selectedExecutionSnapshot)) {
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({ aiCreditProviderDispatchedAt: input.context.now })
                .where(workerCas(input));

            return true;
        }

        if (!job.aiCreditAccounted) return true;
        if (!job.aiCreditReservationId)
            throw new Error('AI credit reservation is missing');
        const credits = new DrizzleAiCreditTransactionParticipant(tx);
        await credits.markProviderDispatched({
            dispatchedAt: input.context.now,
            ownerId: job.ownerId,
            reservationId: job.aiCreditReservationId,
        });

        await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditProviderDispatchedAt: input.context.now,
                updatedAt: input.context.now,
            })
            .where(workerCas(input));

        return true;
    });
}

export async function releaseWorkerLeases(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['releaseWorkerLeases']>[0],
) {
    await modelPricingTransaction(context.database, async (tx) => {
        await tx.execute(
            sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
        );

        const jobs = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.executionState, 'running'),
                    eq(dictionaryGenerationJobsTable.workerId, input.workerId),
                ),
            )
            .for('update');

        for (const job of jobs) {
            const terminal =
                !!job.cancellationRequestedAt ||
                (usesLegacyAction(job.selectedExecutionSnapshot) &&
                    (job.aiCreditProviderDispatchedAt !== null ||
                        job.attemptCount >= job.maxAttempts));

            await settleCurrentAiCreditAttempt(tx, job, {
                at: input.context.now,
                terminal,
                outcome: job.cancellationRequestedAt ? 'stopped' : 'failure',
            });

            await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    aiCreditReservationId: job.aiCreditAccounted
                        ? null
                        : job.aiCreditReservationId,
                    completedAt: terminal ? input.context.now : null,
                    executionState: job.cancellationRequestedAt
                        ? 'cancelled'
                        : terminal
                          ? 'failed'
                          : 'queued',
                    failureCategory: job.cancellationRequestedAt
                        ? job.failureCategory === 'access_revoked'
                            ? 'access_revoked'
                            : 'explicit_stop'
                        : terminal
                          ? 'provider_timeout'
                          : job.failureCategory,
                    fencingToken: job.fencingToken + 1n,
                    heartbeatAt: null,
                    inputPayload: terminal ? null : job.inputPayload,
                    leaseDeadline: null,
                    nextAttemptAt: input.context.now,
                    progressPercent: terminal ? 100 : 0,
                    progressStage: terminal ? 'terminal' : 'queued',
                    providerActualCostMicros: terminal
                        ? job.providerReservedCostMicros
                        : null,
                    providerActualInputTokens: terminal
                        ? job.providerReservedInputTokens
                        : null,
                    providerActualOutputTokens: terminal
                        ? job.providerReservedOutputTokens
                        : null,
                    providerReservationSettledAt: terminal
                        ? input.context.now
                        : null,
                    providerReservationState: terminal ? 'settled' : 'active',
                    updatedAt: input.context.now,
                    workerId: null,
                })
                .where(
                    and(
                        eq(dictionaryGenerationJobsTable.id, job.id),
                        eq(
                            dictionaryGenerationJobsTable.workerId,
                            job.workerId!,
                        ),
                        eq(
                            dictionaryGenerationJobsTable.fencingToken,
                            job.fencingToken,
                        ),
                        eq(
                            dictionaryGenerationJobsTable.leaseDeadline,
                            job.leaseDeadline!,
                        ),
                        gt(
                            dictionaryGenerationJobsTable.leaseDeadline,
                            input.context.now,
                        ),
                    ),
                );

            if (job.kind === 'document-terms' && terminal)
                await scheduleDocumentCleanup(
                    tx,
                    job.id,
                    input.context.now,
                    'cancelled',
                );
        }
    });
}
