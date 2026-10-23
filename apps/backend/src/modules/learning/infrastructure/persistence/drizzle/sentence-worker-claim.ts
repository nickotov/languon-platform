import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    isTextAiCircuitOpen,
    recordTextAiCircuitFailure,
} from '../../../../../infrastructure/text-ai/text-ai-circuit';
import {
    admitLegacyAttempt,
    usesLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import type {
    ClaimedSentenceJob,
    SentenceWorkerStore,
} from '../../../application/ports/sentence-worker-store';
import { SentenceCreditsExhaustedError } from '../../../domain/sentence-errors';
import type {
    SentenceCheckInput,
    SentenceGenerationInput,
} from '../../../domain/sentence-types';
import {
    reserveSentenceAttempt,
    sentenceBudget,
    settleSentenceAttempt,
} from './sentence-job-accounting';
import {
    lockSentenceActorBatch,
    lockSentenceLearner,
} from './sentence-persistence-support';
import { sentenceAiJobsTable as jobs } from './sentence-schema';
import {
    sentenceWorkerTerminal,
    sentenceWorkerValid,
} from './sentence-worker-authority';
import {
    circuitScope,
    clearLease,
    type SentenceWorkerPersistenceContext,
} from './sentence-worker-context';

export async function sentenceWorkerClaimNext(
    persistence: SentenceWorkerPersistenceContext,
    input: Parameters<SentenceWorkerStore['claimNext']>[0],
    context: SentenceContext,
): Promise<ClaimedSentenceJob | null> {
    context.signal.throwIfAborted();
    if (
        input.learningExecutionRevision !== 1 ||
        input.textAiSelectionRevision !== 1 ||
        input.creditSettlementRevision !== 1
    )
        return null;

    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        await tx.execute(
            sql`select set_config('languon.learning_execution_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
        );

        // Recover a bounded expired lease first, settling its reserved attempt once.
        const expired = await tx
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.executionState, 'running'),
                    lte(jobs.leaseDeadline, context.now),
                ),
            )
            .orderBy(asc(jobs.leaseDeadline))
            .limit(10);
        const pendingActors = await tx
            .select({
                learnerId: jobs.learnerId,
                dictionaryId: jobs.dictionaryId,
            })
            .from(jobs)
            .where(
                and(
                    eq(jobs.executionState, 'queued'),
                    lte(jobs.nextAttemptAt, context.now),
                    inArray(jobs.format, [...input.supportedFormats]),
                ),
            )
            .orderBy(asc(jobs.createdAt), asc(jobs.id))
            .limit(25);

        // Recovery may process several learners. Lock their complete bounded
        // actor union once, so later candidates never introduce a lock inversion.
        await lockSentenceActorBatch(tx, [...expired, ...pendingActors]);
        for (const candidate of expired) {
            const invalid = await sentenceWorkerValid(tx, candidate);

            await lockSentenceLearner(tx, candidate.learnerId);
            const [job] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.id, candidate.id),
                        eq(jobs.executionState, 'running'),
                        lte(jobs.leaseDeadline, context.now),
                    ),
                )
                .for('update');

            if (!job) continue;
            if (invalid || job.cancellationRequestedAt) {
                await sentenceWorkerTerminal(tx, job, context.now, invalid);

                continue;
            }

            if (
                usesLegacyAction(job.selectedExecutionSnapshot) &&
                (job.aiCreditProviderDispatchedAt ||
                    job.attemptCount >= job.maxAttempts)
            ) {
                await sentenceWorkerTerminal(
                    tx,
                    job,
                    context.now,
                    'provider_timeout',
                );

                continue;
            }

            await settleSentenceAttempt(
                tx,
                job,
                context.now,
                undefined,
                'failure',
                false,
            );

            if (job.aiCreditProviderDispatchedAt)
                await recordTextAiCircuitFailure(tx, {
                    ...circuitScope(job, context.now),
                    category: 'provider_timeout',
                });
            if (
                job.cancellationRequestedAt ||
                job.attemptCount >= job.maxAttempts
            )
                await tx
                    .update(jobs)
                    .set({
                        ...clearLease,
                        executionState: job.cancellationRequestedAt
                            ? 'cancelled'
                            : 'failed',
                        failureCategory: job.cancellationRequestedAt
                            ? null
                            : 'provider_timeout',
                        completedAt: context.now,
                        updatedAt: context.now,
                    })
                    .where(eq(jobs.id, job.id));
            else
                await tx
                    .update(jobs)
                    .set({
                        ...clearLease,
                        executionState: 'queued',
                        nextAttemptAt: context.now,
                        updatedAt: context.now,
                        aiCreditReservationId: null,
                        aiCreditProviderDispatchedAt: null,
                    })
                    .where(eq(jobs.id, job.id));
        }

        const candidates = await tx
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.executionState, 'queued'),
                    lte(jobs.nextAttemptAt, context.now),
                    inArray(jobs.format, [...input.supportedFormats]),
                ),
            )
            .orderBy(asc(jobs.createdAt), asc(jobs.id))
            .limit(25);

        for (const candidate of candidates) {
            const invalid = await sentenceWorkerValid(tx, candidate);

            await lockSentenceLearner(tx, candidate.learnerId);
            const [job] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.id, candidate.id),
                        eq(jobs.executionState, 'queued'),
                    ),
                )
                .for('update');

            if (!job) continue;
            if (job.cancellationRequestedAt || invalid) {
                await sentenceWorkerTerminal(tx, job, context.now, invalid);

                continue;
            }

            if (await isTextAiCircuitOpen(tx, circuitScope(job, context.now)))
                continue;
            const budget = sentenceBudget(job);
            const capacity = await readTextAiCapacity(tx, {
                actorId: job.learnerId,
                now: context.now,
                budget,
            });

            if (
                capacity.globalRunning >= input.globalConcurrency ||
                capacity.actorRunning >= input.learnerConcurrency ||
                !textAiProviderBudgetAllows(
                    capacity.providerUsage,
                    job.providerReservationState !== 'active',
                    budget,
                )
            )
                continue;
            if (job.attemptCount > 0) {
                try {
                    await reserveSentenceAttempt(
                        tx,
                        job,
                        job.attemptCount + 1,
                        context.now,
                    );
                } catch (error) {
                    if (error instanceof SentenceCreditsExhaustedError) {
                        await sentenceWorkerTerminal(
                            tx,
                            job,
                            context.now,
                            'ai_credits_exhausted',
                        );

                        continue;
                    }

                    throw error;
                }

                await tx
                    .update(jobs)
                    .set({
                        providerReservationState: 'active',
                        providerReservedAttempts:
                            job.providerReservedAttempts + 1,
                        providerReservedCostMicros:
                            (job.providerActualCostMicros ?? 0) +
                            budget.maxCostMicrosPerAttempt,
                        providerReservedInputTokens:
                            (job.providerActualInputTokens ?? 0) +
                            budget.maxInputTokensPerAttempt,
                        providerReservedOutputTokens:
                            (job.providerActualOutputTokens ?? 0) +
                            budget.maxOutputTokensPerAttempt,
                        providerReservationSettledAt: null,
                    })
                    .where(eq(jobs.id, job.id));
            }

            const fencingToken = Number(job.fencingToken + 1n);
            if (!Number.isSafeInteger(fencingToken))
                throw new Error(
                    'Sentence fencing token exceeds supported range',
                );
            const leaseDeadline = new Date(
                context.now.getTime() + input.leaseMs,
            );

            await tx
                .update(jobs)
                .set({
                    executionState: 'running',
                    workerId: input.workerId,
                    fencingToken: BigInt(fencingToken),
                    attemptCount: job.attemptCount + 1,
                    leaseDeadline,
                    heartbeatAt: context.now,
                    updatedAt: context.now,
                })
                .where(eq(jobs.id, job.id));

            const actionBudget = usesLegacyAction(job.selectedExecutionSnapshot)
                ? await admitLegacyAttempt(tx, {
                      id: job.id,
                      actionId:
                          job.selectedExecutionSnapshot.actionParentId ??
                          job.id,
                      ownerId: job.learnerId,
                      workerId: input.workerId,
                      fencingToken: String(fencingToken),
                      attempt: job.attemptCount + 1,
                      budget,
                      inputPayload: job.inputPayload,
                      at: context.now,
                  })
                : budget;

            if (!actionBudget) {
                await sentenceWorkerTerminal(
                    tx,
                    job,
                    context.now,
                    'ai_credits_exhausted',
                );

                continue;
            }

            context.signal.throwIfAborted();

            return {
                lease: {
                    jobId: job.id,
                    workerId: input.workerId,
                    fencingToken,
                    attempt: job.attemptCount + 1,
                },
                leaseDeadline,
                execution: usesLegacyAction(job.selectedExecutionSnapshot)
                    ? {
                          ...job.selectedExecutionSnapshot,
                          aggregateBudget: actionBudget,
                      }
                    : job.selectedExecutionSnapshot,
                budget: actionBudget,
                providerIdempotencyKey: `sentence:${job.id}:${job.attemptCount + 1}`,
                ...(job.jobKind === 'sentence-generation'
                    ? {
                          kind: 'sentence-generation' as const,
                          format: job.format as
                              | 'sentence-generation:v1'
                              | 'sentence-generation:v2'
                              | 'sentence-preparation:v1'
                              | 'sentence-preparation:v2',
                          input: job.inputPayload as SentenceGenerationInput,
                      }
                    : {
                          kind: 'sentence-check' as const,
                          format: 'sentence-check:v1' as const,
                          input: job.inputPayload as SentenceCheckInput,
                      }),
            };
        }

        return null;
    });
}
