import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
    DictionaryGenerationNotAvailableError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import {
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryDocumentUploadsTable,
} from './schema';
import type {
    GenerationStoreContext,
    Transaction,
    JobRow,
} from './generation-context';
import { abort } from './generation-context';
import {
    lockOwnedJob,
    readView,
    lockProposal,
    expireProposal,
} from './generation-job-access';
import { settleCurrentAiCreditAttempt } from './generation-accounting';

export async function cancel(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['cancel']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        await tx.execute(
            sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
        );

        abort(input.context);
        const job = await lockOwnedJob(tx, input.ownerId, input.jobId);
        abort(input.context);
        if (job.executionState === 'cancelled')
            return readView(tx, job, input.context.now);
        if (!['queued', 'running'].includes(job.executionState))
            throw new DictionaryGenerationNotAvailableError();
        if (job.executionState === 'running' && job.cancellationRequestedAt)
            return readView(tx, job, input.context.now);
        const queued = job.executionState === 'queued';
        const incurredProviderCost = queued && job.attemptCount > 0;
        if (queued)
            await settleCurrentAiCreditAttempt(tx, job, {
                at: input.context.now,
                outcome: 'stopped',
            });
        const [updated] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditReservationId:
                    queued && job.aiCreditAccounted
                        ? null
                        : job.aiCreditReservationId,
                awaitingUploadAt: queued ? null : job.awaitingUploadAt,
                cancellationRequestedAt: input.context.now,
                failureCategory: 'explicit_stop',
                completedAt: queued ? input.context.now : null,
                executionState: queued ? 'cancelled' : 'running',
                inputPayload: queued ? null : job.inputPayload,
                progressPercent: queued ? 100 : job.progressPercent,
                progressStage: queued ? 'terminal' : job.progressStage,
                providerActualCostMicros: queued
                    ? incurredProviderCost
                        ? job.providerReservedCostMicros
                        : 0
                    : null,
                providerActualInputTokens: queued
                    ? incurredProviderCost
                        ? job.providerReservedInputTokens
                        : 0
                    : null,
                providerActualOutputTokens: queued
                    ? incurredProviderCost
                        ? job.providerReservedOutputTokens
                        : 0
                    : null,
                providerReservationSettledAt: queued ? input.context.now : null,
                providerReservationState: queued
                    ? incurredProviderCost
                        ? 'settled'
                        : 'released'
                    : 'active',
                updatedAt: input.context.now,
            })
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.id, job.id),
                    inArray(dictionaryGenerationJobsTable.executionState, [
                        'queued',
                        'running',
                    ]),
                ),
            )
            .returning();

        if (queued && job.kind === 'document-terms')
            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    payload: null,
                    reviewState: 'discarded',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(
                    and(
                        eq(dictionaryGenerationProposalsTable.jobId, job.id),
                        isNotNull(
                            dictionaryGenerationProposalsTable.documentStagedAt,
                        ),
                        isNull(
                            dictionaryGenerationProposalsTable.documentPublishedAt,
                        ),
                        eq(
                            dictionaryGenerationProposalsTable.reviewState,
                            'reviewable',
                        ),
                    ),
                );
        if (queued && job.kind === 'document-terms')
            await scheduleDocumentCleanup(
                tx,
                job.id,
                input.context.now,
                'cancelled',
            );

        return readView(tx, updated!, input.context.now);
    });
}

export async function discard(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['discard']>[0],
) {
    const result = await modelPricingTransaction(
        context.database,
        async (tx) => {
            abort(input.context);
            const job = await lockOwnedJob(tx, input.ownerId, input.jobId);
            const proposal = await lockProposal(tx, job.id);
            abort(input.context);
            if (proposal?.reviewState === 'discarded')
                return {
                    expired: false as const,
                    value: await readView(tx, job, input.context.now),
                };
            if (proposal?.reviewState === 'expired')
                return { expired: true as const };
            if (!proposal || proposal.reviewState !== 'reviewable')
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.documentStagedAt && !proposal.documentPublishedAt)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.expiresAt <= input.context.now) {
                await expireProposal(tx, job.id, input.context.now);

                return { expired: true as const };
            }

            abort(input.context);
            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    payload: null,
                    reviewState: 'discarded',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));

            await tx
                .update(dictionaryGenerationJobsTable)
                .set({ inputPayload: null, updatedAt: input.context.now })
                .where(eq(dictionaryGenerationJobsTable.id, job.id));

            return {
                expired: false as const,
                value: await readView(tx, job, input.context.now),
            };
        },
    );

    if (result.expired) throw new DictionaryGenerationProposalExpiredError();

    return result.value;
}

export async function terminalizeCancelled(
    tx: Transaction,
    job: JobRow,
    now: Date,
) {
    await settleCurrentAiCreditAttempt(tx, job, {
        at: now,
        outcome:
            job.failureCategory === 'access_revoked' ? 'failure' : 'stopped',
    });

    await tx
        .update(dictionaryGenerationJobsTable)
        .set({
            aiCreditReservationId: job.aiCreditAccounted
                ? null
                : job.aiCreditReservationId,
            completedAt: now,
            executionState: 'cancelled',
            failureCategory:
                job.failureCategory === 'access_revoked'
                    ? 'access_revoked'
                    : 'explicit_stop',
            heartbeatAt: null,
            inputPayload: null,
            leaseDeadline: null,
            progressPercent: 100,
            progressStage: 'terminal',
            providerActualCostMicros: job.providerReservedCostMicros,
            providerActualInputTokens: job.providerReservedInputTokens,
            providerActualOutputTokens: job.providerReservedOutputTokens,
            providerReservationSettledAt: now,
            providerReservationState: 'settled',
            updatedAt: now,
            workerId: null,
        })
        .where(
            and(
                eq(dictionaryGenerationJobsTable.id, job.id),
                eq(dictionaryGenerationJobsTable.executionState, 'running'),
                eq(dictionaryGenerationJobsTable.workerId, job.workerId!),
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

    if (job.kind === 'document-terms')
        await scheduleDocumentCleanup(tx, job.id, now, 'cancelled');
}

export async function scheduleDocumentCleanup(
    tx: Transaction,
    jobId: string,
    now: Date,
    processingState: 'cancelled' | 'failed',
) {
    await tx
        .update(dictionaryDocumentUploadsTable)
        .set({
            cleanupNextAttemptAt: now,
            cleanupState: 'pending',
            processingState,
            terminalAt: now,
            updatedAt: now,
        })
        .where(eq(dictionaryDocumentUploadsTable.jobId, jobId));
}
