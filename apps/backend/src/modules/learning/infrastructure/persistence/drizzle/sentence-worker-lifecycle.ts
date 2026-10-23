import type { SentenceJobFailure } from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { recordTextAiCircuitFailure } from '../../../../../infrastructure/text-ai/text-ai-circuit';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { readProviderTokenUsage } from '../../../../text-ai/infrastructure/ai/provider-token-usage';
import type { SentenceTokenUsage } from '../../../application/ports/sentence-ai-provider';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import type {
    SentenceLease,
    SentenceWriteResult,
} from '../../../application/ports/sentence-worker-store';
import { settleSentenceAttempt } from './sentence-job-accounting';
import { sentenceAiJobsTable as jobs } from './sentence-schema';
import {
    sentenceWorkerLocked,
    sentenceWorkerTerminal,
} from './sentence-worker-authority';
import {
    circuitFailureCategory,
    circuitScope,
    clearLease,
    leased,
    type SentenceWorkerPersistenceContext,
} from './sentence-worker-context';

export async function sentenceWorkerHeartbeat(
    persistence: SentenceWorkerPersistenceContext,
    lease: SentenceLease,
    leaseMs: number,
    context: SentenceContext,
) {
    context.signal.throwIfAborted();

    return modelPricingTransaction(persistence.database, async (tx) => {
        const [job] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, lease.jobId))
            .for('update');

        if (!job || !leased(job, lease, context.now))
            return { owned: false, cancellationRequested: false };
        await tx
            .update(jobs)
            .set({
                heartbeatAt: context.now,
                leaseDeadline: new Date(context.now.getTime() + leaseMs),
                updatedAt: context.now,
            })
            .where(eq(jobs.id, job.id));

        return {
            owned: true,
            cancellationRequested: job.cancellationRequestedAt !== null,
        };
    });
}

export async function sentenceWorkerMarkDispatched(
    persistence: SentenceWorkerPersistenceContext,
    lease: SentenceLease,
    context: SentenceContext,
): Promise<'dispatch' | 'terminalized' | 'lost'> {
    context.signal.throwIfAborted();

    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        const locked = await sentenceWorkerLocked(
            persistence,
            tx,
            lease,
            context.now,
        );

        if (!locked) return 'lost';
        const { job, invalid } = locked;
        if (invalid || job.cancellationRequestedAt) {
            await sentenceWorkerTerminal(tx, job, context.now, invalid);

            return 'terminalized';
        }

        if (!job.aiCreditProviderDispatchedAt) {
            if (job.aiCreditAccounted && job.aiCreditReservationId)
                await new DrizzleAiCreditTransactionParticipant(
                    tx,
                ).markProviderDispatched({
                    ownerId: job.learnerId,
                    reservationId: job.aiCreditReservationId,
                    dispatchedAt: context.now,
                });
            await tx
                .update(jobs)
                .set({
                    aiCreditProviderDispatchedAt: context.now,
                    updatedAt: context.now,
                })
                .where(eq(jobs.id, job.id));
        }

        return 'dispatch';
    });
}

export async function sentenceWorkerFail(
    persistence: SentenceWorkerPersistenceContext,
    lease: SentenceLease,
    failure: {
        code: SentenceJobFailure;
        retryAt: Date | null;
        usage?: SentenceTokenUsage;
    },
    context: SentenceContext,
): Promise<SentenceWriteResult> {
    context.signal.throwIfAborted();

    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        const locked = await sentenceWorkerLocked(
            persistence,
            tx,
            lease,
            context.now,
        );

        if (!locked) return 'lost';
        const { job, invalid } = locked;
        if (invalid || job.cancellationRequestedAt) {
            await sentenceWorkerTerminal(
                tx,
                job,
                context.now,
                invalid,
                failure.usage,
            );

            return 'terminalized';
        }

        let completedInvalidWithUsage = false;
        if (failure.code === 'invalid_model_output' && failure.usage) {
            try {
                readProviderTokenUsage(failure.usage, {
                    maxInputTokens: job.providerMaxInputTokensPerAttempt,
                    maxOutputTokens: job.providerMaxOutputTokensPerAttempt,
                });

                completedInvalidWithUsage = true;
            } catch {
                // Uncertain/invalid measurement cannot establish a safe repeat.
            }
        }

        const safeRetry =
            failure.retryAt &&
            job.attemptCount < job.maxAttempts &&
            (!usesLegacyAction(job.selectedExecutionSnapshot) ||
                !job.aiCreditProviderDispatchedAt ||
                failure.code === 'provider_rate_limited' ||
                completedInvalidWithUsage);

        await settleSentenceAttempt(
            tx,
            job,
            context.now,
            failure.usage,
            'failure',
            !safeRetry,
        );

        const category = circuitFailureCategory(failure.code);
        if (category && job.aiCreditProviderDispatchedAt)
            await recordTextAiCircuitFailure(tx, {
                ...circuitScope(job, context.now),
                category,
            });
        if (safeRetry) {
            await tx
                .update(jobs)
                .set({
                    ...clearLease,
                    executionState: 'queued',
                    nextAttemptAt: failure.retryAt!,
                    updatedAt: context.now,
                    aiCreditReservationId: null,
                    aiCreditProviderDispatchedAt: null,
                })
                .where(eq(jobs.id, job.id));
        } else
            await tx
                .update(jobs)
                .set({
                    ...clearLease,
                    executionState: 'failed',
                    failureCategory: failure.code,
                    completedAt: context.now,
                    updatedAt: context.now,
                })
                .where(eq(jobs.id, job.id));

        return 'committed';
    });
}

export async function sentenceWorkerReleaseWorkerLeases(
    persistence: SentenceWorkerPersistenceContext,
    workerId: string,
    context: SentenceContext,
) {
    const rows = await persistence.database
        .select()
        .from(jobs)
        .where(
            and(
                eq(jobs.workerId, workerId),
                eq(jobs.executionState, 'running'),
            ),
        );

    for (const row of rows)
        await sentenceWorkerFail(
            persistence,
            {
                jobId: row.id,
                workerId,
                fencingToken: Number(row.fencingToken),
                attempt: row.attemptCount,
            },
            { code: 'provider_timeout', retryAt: context.now },
            context,
        );
}
