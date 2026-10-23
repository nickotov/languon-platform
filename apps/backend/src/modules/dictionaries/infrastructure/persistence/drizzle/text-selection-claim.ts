import { and, eq, lt, or } from 'drizzle-orm';
import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    admitLegacyAttempt,
    usesLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { dictionaryTextSelectionJobsTable as jobs } from './selection-card-schema';
import {
    reserveSelectionAttempt,
    selectionBudget,
} from './text-selection-accounting';
import { assertSelectionSource } from './text-selection-source';
import {
    selectionTarget,
    type SelectionTransaction,
} from './text-selection-target';

import type { TextSelectionStoreOptions } from './drizzle-text-selection-store';
import {
    finishSelectionJob,
    lockSelectionOwner,
} from './text-selection-lifecycle';

export async function claimSelectionJob(
    tx: SelectionTransaction,
    options: TextSelectionStoreOptions,
    clock: () => Date,
    workerId: string,
) {
    const now = clock();
    const candidates = await tx
        .select()
        .from(jobs)
        .where(
            or(
                and(
                    eq(jobs.executionState, 'queued'),
                    lt(jobs.nextAttemptAt, new Date(now.getTime() + 1)),
                ),
                and(
                    eq(jobs.executionState, 'running'),
                    lt(jobs.leaseDeadline, now),
                ),
            ),
        )
        .orderBy(jobs.createdAt)
        .limit(20);

    for (const candidate of candidates) {
        const ownerActive = await lockSelectionOwner(
            tx,
            candidate.ownerId,
            true,
        );
        const [job] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, candidate.id))
            .for('update');

        if (!job || !['queued', 'running'].includes(job.executionState))
            continue;
        if (
            job.executionState === 'running' &&
            job.leaseDeadline &&
            job.leaseDeadline > now
        )
            continue;
        if (
            usesLegacyAction(job.selectedExecutionSnapshot) &&
            job.executionState === 'running'
        ) {
            await finishSelectionJob(
                tx,
                job,
                'failed',
                'provider_timeout',
                now,
            );

            continue;
        }

        if (
            !ownerActive ||
            job.expiresAt <= now ||
            job.cancellationRequestedAt
        ) {
            await finishSelectionJob(
                tx,
                job,
                job.cancellationRequestedAt ? 'cancelled' : 'failed',
                job.cancellationRequestedAt ? null : 'expired',
                now,
            );

            continue;
        }

        if (
            job.executionState === 'running' &&
            job.aiCreditProviderDispatchedAt
        ) {
            await finishSelectionJob(
                tx,
                job,
                'failed',
                'worker_interrupted',
                now,
            );

            continue;
        }

        try {
            await assertSelectionSource(tx, options, job.sourceAuthority!, now);
            await selectionTarget(
                tx,
                job.ownerId,
                job.target!,
                job.inputPayload!.sourceLanguage,
                job.inputPayload!.targetLanguage,
                job.inputPayload!.source,
                job.confirmDuplicate,
            );
        } catch {
            await finishSelectionJob(tx, job, 'failed', 'stale_content', now);
            continue;
        }

        const budget = selectionBudget(job),
            capacity = await readTextAiCapacity(tx, {
                actorId: job.ownerId,
                now,
                budget,
            });

        if (
            capacity.globalRunning >= options.globalConcurrency ||
            capacity.actorRunning >= options.ownerConcurrency
        )
            continue;
        const retry = job.providerReservationState !== 'active';
        if (
            retry &&
            !textAiProviderBudgetAllows(capacity.providerUsage, true, budget)
        )
            continue;
        const attempt = retry
            ? job.attemptCount + 1
            : Math.max(1, job.attemptCount);

        if (attempt > job.maxAttempts) {
            await finishSelectionJob(
                tx,
                job,
                'failed',
                'attempts_exhausted',
                now,
            );

            continue;
        }

        if (retry && !usesLegacyAction(job.selectedExecutionSnapshot)) {
            const credits = new DrizzleAiCreditTransactionParticipant(tx);
            const summary = await credits.accountSummary(job.ownerId, now);
            if (
                job.aiCreditPolicyMode === 'limited' &&
                summary.availableCredits <
                    BigInt(job.aiCreditMaxCreditsPerAttempt!)
            ) {
                await finishSelectionJob(
                    tx,
                    job,
                    'failed',
                    'ai_credits_exhausted',
                    now,
                );

                continue;
            }
        }

        const token = job.fencingToken + 1;
        await tx
            .update(jobs)
            .set({
                executionState: 'running',
                workerId,
                fencingToken: token,
                attemptCount: attempt,
                providerReservationState: 'active',
                providerReservationSettledAt: null,
                leaseDeadline: new Date(now.getTime() + options.leaseMs),
                heartbeatAt: now,
                updatedAt: now,
            })
            .where(eq(jobs.id, job.id));

        const actionBudget = usesLegacyAction(job.selectedExecutionSnapshot)
            ? await admitLegacyAttempt(tx, {
                  id: job.id,
                  ownerId: job.ownerId,
                  workerId,
                  fencingToken: String(token),
                  attempt,
                  budget,
                  inputPayload: job.inputPayload,
                  inputOverheadTokens: 32768,
                  at: now,
              })
            : budget;

        if (!actionBudget) {
            await finishSelectionJob(
                tx,
                job,
                'failed',
                'ai_credits_exhausted',
                now,
            );

            continue;
        }

        if (retry) await reserveSelectionAttempt(tx, job, attempt, now);

        return {
            id: job.id,
            ownerId: job.ownerId,
            workerId,
            fencingToken: token,
            attempt,
            input: job.inputPayload!,
            budget: actionBudget,
            execution: usesLegacyAction(job.selectedExecutionSnapshot)
                ? {
                      ...job.selectedExecutionSnapshot,
                      aggregateBudget: actionBudget,
                  }
                : job.selectedExecutionSnapshot,
        };
    }

    return null;
}
