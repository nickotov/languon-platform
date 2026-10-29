import {
    publishPrivateKnowledgeTranslation,
    renewPrivateKnowledgeTranslation,
} from '../../../../knowledge/infrastructure/persistence/drizzle/private-translation-persistence';
import { recheckTextAiDispatch } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-dispatch-guard';
import { TextAiSelectionUnavailableError } from '../../../../text-ai/application/text-ai-admission-participant';
import { lockJob } from './texts-job-admission';
import {
    TextDetectionResultSchema,
    TextSourceSegmentSchema,
    TextTranslationProposalSchema,
} from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import {
    recordTextAiCircuitFailure,
    recordTextAiCircuitSuccess,
} from '../../../../../infrastructure/text-ai/text-ai-circuit';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import type {
    TextJobResult,
    TextsTokenUsage,
} from '../../../application/ports/texts-ai-provider';
import { TextsAiError } from '../../../application/ports/texts-ai-provider';
import type {
    TextJobContext,
    TextsLease,
    TextsWorkerStore,
} from '../../../application/ports/texts-job-store';
import { validateTranslation } from '../../../domain/text';
import { settleTextsAttempt } from './texts-job-accounting';
import { terminal, transaction } from './texts-job-admission';
import {
    clearLease,
    scope,
    type TextsJobStoreContext,
} from './texts-job-persistence-support';
import { textsAiJobsTable as jobs } from './texts-job-schema';

export async function heartbeat(
    persistence: TextsJobStoreContext,
    lease: TextsLease,
    leaseMs: number,
    context: TextJobContext,
) {
    return transaction(persistence, async (tx) => {
        const locked = await lockJob(persistence, tx, lease, context.now);
        if (!locked) return { owned: false, cancellationRequested: false };
        if (locked.invalid) {
            await terminal(
                persistence,
                tx,
                locked.job,
                context.now,
                locked.invalid,
            );

            return { owned: false, cancellationRequested: true };
        }

        await tx
            .update(jobs)
            .set({
                heartbeatAt: context.now,
                leaseDeadline: new Date(context.now.getTime() + leaseMs),
            })
            .where(eq(jobs.id, lease.jobId));

        if (locked.job.externalSourceKind === 'knowledge-block')
            await renewPrivateKnowledgeTranslation(tx, lease);

        return { owned: true, cancellationRequested: false };
    });
}

export async function markDispatched(
    persistence: TextsJobStoreContext,
    lease: TextsLease,
    context: TextJobContext,
) {
    context.signal.throwIfAborted();

    return transaction(persistence, async (tx) => {
        const locked = await lockJob(persistence, tx, lease, context.now);
        if (!locked) return false;
        if (locked.invalid) {
            await terminal(
                persistence,
                tx,
                locked.job,
                context.now,
                locked.invalid,
            );

            return false;
        }

        const job = locked.job;
        if (usesLegacyAction(job.selectedExecutionSnapshot)) {
            if (!job.aiCreditProviderDispatchedAt) {
                try {
                    await recheckTextAiDispatch(tx, {
                        actionId: job.id,
                        jobId: job.id,
                        now: context.now,
                    });
                } catch (error) {
                    if (!(error instanceof TextAiSelectionUnavailableError))
                        throw error;
                    await terminal(
                        persistence,
                        tx,
                        job,
                        context.now,
                        'model_unavailable',
                    );

                    return false;
                }
            }

            await tx
                .update(jobs)
                .set({ aiCreditProviderDispatchedAt: context.now })
                .where(eq(jobs.id, job.id));

            return true;
        }

        if (!job.aiCreditReservationId)
            throw new TextsAiError('generation_not_available');
        await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).markProviderDispatched({
            ownerId: job.ownerId,
            reservationId: job.aiCreditReservationId,
            dispatchedAt: context.now,
        });

        await tx
            .update(jobs)
            .set({ aiCreditProviderDispatchedAt: context.now })
            .where(eq(jobs.id, job.id));

        return true;
    });
}

export async function complete(
    persistence: TextsJobStoreContext,
    lease: TextsLease,
    result: TextJobResult,
    usage: TextsTokenUsage | undefined,
    context: TextJobContext,
) {
    context.signal.throwIfAborted();

    return transaction(persistence, async (tx) => {
        const locked = await lockJob(persistence, tx, lease, context.now);
        if (!locked) return false;
        const { job, invalid } = locked;
        if (invalid) {
            await terminal(persistence, tx, job, context.now, invalid, usage);

            return false;
        }

        const validated =
            job.jobKind === 'text-translation'
                ? TextTranslationProposalSchema.parse(result)
                : TextDetectionResultSchema.parse(result);

        if (job.inputPayload?.kind === 'text-translation') {
            const original = job.inputPayload;
            const proposal = TextTranslationProposalSchema.parse(validated);
            if (
                proposal.id !== job.id ||
                proposal.sourceText !== original.sourceText ||
                proposal.sourceLanguage !== original.sourceLanguage ||
                proposal.targetLanguage !== original.targetLanguage ||
                proposal.textId !== job.textId ||
                proposal.expectedTextVersion !== job.expectedTextVersion ||
                JSON.stringify(proposal.alignment.source) !==
                    JSON.stringify(
                        original.segments.map((segment) =>
                            TextSourceSegmentSchema.parse(segment),
                        ),
                    ) ||
                proposal.alignment.editedPairIds.length
            )
                throw new TextsAiError('invalid_model_output');
            validateTranslation(
                original.segments,
                proposal.alignment.translation,
            );
        }

        await settleTextsAttempt(tx, job, context.now, usage, 'success');
        await recordTextAiCircuitSuccess(tx, scope(job, context.now));
        if (job.externalSourceKind === 'knowledge-block') {
            await publishPrivateKnowledgeTranslation(
                tx,
                job.id,
                job.ownerId,
                TextTranslationProposalSchema.parse(validated),
                lease,
            );
        } else {
            await tx
                .update(jobs)
                .set({
                    ...clearLease,
                    executionState: 'completed',
                    resultPayload: validated,
                    inputPayload: null,
                    completedAt: context.now,
                    updatedAt: context.now,
                    failureCategory: null,
                })
                .where(eq(jobs.id, job.id));
        }

        return true;
    });
}

export async function fail(
    persistence: TextsJobStoreContext,
    lease: TextsLease,
    input: Parameters<TextsWorkerStore['fail']>[1],
    context: TextJobContext,
) {
    return transaction(persistence, async (tx) => {
        const locked = await lockJob(persistence, tx, lease, context.now);
        if (!locked) return false;
        const { job, invalid } = locked;
        const code = invalid ?? input.code;
        const retryAt =
            !invalid &&
            job.attemptCount < job.maxAttempts &&
            (!usesLegacyAction(job.selectedExecutionSnapshot) ||
                !job.aiCreditProviderDispatchedAt ||
                code === 'provider_rate_limited' ||
                (job.selectedExecutionSnapshot.routingAuthority &&
                    job.attemptCount === 1 &&
                    input.retryDisposition === 'conclusive-provider-failure'))
                ? input.retryAt
                : null;

        if (
            job.aiCreditProviderDispatchedAt &&
            (code === 'provider_unavailable' || code === 'provider_timeout')
        )
            await recordTextAiCircuitFailure(tx, {
                ...scope(job, context.now),
                category:
                    code === 'provider_timeout'
                        ? 'provider_timeout'
                        : 'provider_error',
            });
        if (!retryAt) {
            await terminal(
                persistence,
                tx,
                job,
                context.now,
                code,
                input.usage,
            );

            return true;
        }

        await settleTextsAttempt(
            tx,
            job,
            context.now,
            input.usage,
            'failure',
            false,
        );

        await tx
            .update(jobs)
            .set({
                ...clearLease,
                executionState: 'queued',
                failureCategory: null,
                nextAttemptAt: retryAt,
                updatedAt: context.now,
                aiCreditReservationId: null,
                aiCreditProviderDispatchedAt: null,
            })
            .where(eq(jobs.id, job.id));

        return true;
    });
}

export async function releaseWorkerLeases(
    persistence: TextsJobStoreContext,
    workerId: string,
    context: TextJobContext,
) {
    await transaction(persistence, async (tx) => {
        await tx
            .update(jobs)
            .set({ leaseDeadline: context.now })
            .where(
                and(
                    eq(jobs.executionState, 'running'),
                    eq(jobs.workerId, workerId),
                ),
            );
    });
}
