import { and, asc, eq, inArray, isNotNull, lte, or } from 'drizzle-orm';
import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { isTextAiCircuitOpen } from '../../../../../infrastructure/text-ai/text-ai-circuit';
import {
    admitLegacyAttempt,
    usesLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { TextsCreditsExhaustedError } from '../../../application/ports/texts-ai-provider';
import type {
    ClaimedTextsJob,
    TextJobContext,
    TextsWorkerStore,
} from '../../../application/ports/texts-job-store';
import {
    reserveTextsAttempt,
    settleTextsAttempt,
    textsBudget,
} from './texts-job-accounting';
import { terminal, transaction, valid } from './texts-job-admission';
import {
    clearLease,
    scope,
    type TextsJobStoreContext,
} from './texts-job-persistence-support';
import { textsAiJobsTable as jobs } from './texts-job-schema';

export async function claimNext(
    persistence: TextsJobStoreContext,
    input: Parameters<TextsWorkerStore['claimNext']>[0],
    context: TextJobContext,
): Promise<ClaimedTextsJob | null> {
    context.signal.throwIfAborted();
    if (!input.supportedFormats.length) return null;
    await transaction(persistence, async (tx) => {
        // Bounded retention cleanup preserves operation receipts and accounting while removing text.
        const expiredTerminal = await tx
            .select({ id: jobs.id })
            .from(jobs)
            .where(
                and(
                    inArray(jobs.executionState, [
                        'completed',
                        'failed',
                        'cancelled',
                    ]),
                    lte(jobs.expiresAt, context.now),
                    or(
                        isNotNull(jobs.inputPayload),
                        isNotNull(jobs.resultPayload),
                    ),
                ),
            )
            .limit(100);

        if (expiredTerminal.length)
            await tx
                .update(jobs)
                .set({ inputPayload: null, resultPayload: null })
                .where(
                    inArray(
                        jobs.id,
                        expiredTerminal.map((j) => j.id),
                    ),
                );
    });

    return transaction(persistence, async (tx) => {
        const expired = await tx
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.executionState, 'running'),
                    inArray(jobs.format, [...input.supportedFormats]),
                    lte(jobs.leaseDeadline, context.now),
                ),
            )
            .orderBy(asc(jobs.leaseDeadline))
            .limit(10);

        for (const job of expired) {
            const invalid = await valid(persistence, tx, job, context.now);
            if (
                invalid ||
                job.attemptCount >= job.maxAttempts ||
                (usesLegacyAction(job.selectedExecutionSnapshot) &&
                    job.aiCreditProviderDispatchedAt)
            ) {
                await terminal(
                    persistence,
                    tx,
                    job,
                    context.now,
                    invalid ?? 'provider_timeout',
                );

                continue;
            }

            await settleTextsAttempt(
                tx,
                job,
                context.now,
                undefined,
                'failure',
                false,
            );

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
                    inArray(jobs.format, [...input.supportedFormats]),
                    lte(jobs.nextAttemptAt, context.now),
                ),
            )
            .orderBy(asc(jobs.createdAt), asc(jobs.id))
            .limit(25);

        for (const candidate of candidates) {
            const invalid = await valid(
                persistence,
                tx,
                candidate,
                context.now,
            );
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, candidate.id))
                .for('update');

            if (!job || job.executionState !== 'queued') continue;
            if (invalid) {
                await terminal(persistence, tx, job, context.now, invalid);
                continue;
            }

            if (await isTextAiCircuitOpen(tx, scope(job, context.now)))
                continue;
            const budget = textsBudget(job),
                capacity = await readTextAiCapacity(tx, {
                    actorId: job.ownerId,
                    now: context.now,
                    budget,
                });

            if (
                capacity.globalRunning >= input.globalConcurrency ||
                capacity.actorRunning >= input.userConcurrency ||
                !textAiProviderBudgetAllows(
                    capacity.providerUsage,
                    job.providerReservationState !== 'active',
                    budget,
                )
            )
                continue;
            if (job.attemptCount > 0) {
                try {
                    await reserveTextsAttempt(
                        tx,
                        job,
                        job.attemptCount + 1,
                        context.now,
                    );
                } catch (error) {
                    if (error instanceof TextsCreditsExhaustedError) {
                        await terminal(
                            persistence,
                            tx,
                            job,
                            context.now,
                            'ai_credits_exhausted',
                        );

                        continue;
                    }

                    throw error;
                }
            }

            const attempt = job.attemptCount + 1,
                fence = job.fencingToken + 1n;

            await tx
                .update(jobs)
                .set({
                    executionState: 'running',
                    attemptCount: attempt,
                    fencingToken: fence,
                    workerId: input.workerId,
                    leaseDeadline: new Date(
                        context.now.getTime() + input.leaseMs,
                    ),
                    heartbeatAt: context.now,
                    updatedAt: context.now,
                    providerReservationState: 'active',
                    providerReservedAttempts: attempt,
                    providerReservedCostMicros: budget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        budget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        budget.maxOutputTokensPerAttempt,
                    providerReservationSettledAt: null,
                })
                .where(eq(jobs.id, job.id));

            const actionBudget = usesLegacyAction(job.selectedExecutionSnapshot)
                ? await admitLegacyAttempt(tx, {
                      id: job.id,
                      ownerId: job.ownerId,
                      workerId: input.workerId,
                      fencingToken: String(fence),
                      attempt: job.attemptCount + 1,
                      budget,
                      inputPayload: job.inputPayload,
                      at: context.now,
                  })
                : budget;

            if (!actionBudget) {
                await terminal(
                    persistence,
                    tx,
                    job,
                    context.now,
                    'ai_credits_exhausted',
                );

                continue;
            }

            return {
                lease: {
                    jobId: job.id,
                    workerId: input.workerId,
                    fencingToken: String(fence),
                    attempt,
                },
                input: job.inputPayload!,
                execution: usesLegacyAction(job.selectedExecutionSnapshot)
                    ? {
                          ...job.selectedExecutionSnapshot,
                          aggregateBudget: actionBudget,
                      }
                    : job.selectedExecutionSnapshot,
                budget: actionBudget,
                providerIdempotencyKey: `texts:${job.id}:${attempt}`,
            };
        }

        return null;
    });
}
