import type {
    EnqueueTextDetectionRequest,
    EnqueueTextTranslationRequest,
    TextAiJob,
} from '@languon/contracts';
import {
    EnqueueTextDetectionRequestSchema,
    EnqueueTextTranslationRequestSchema,
} from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { ProviderCostAdmissionUnavailableError } from '../../../../ai-credits/domain/provider-cost-admission';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { OperatorBudgetUnavailableError } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { prepareLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type {
    TextJobInput,
    TextJobKind,
    TextsTokenUsage,
} from '../../../application/ports/texts-ai-provider';
import { TextsAiError } from '../../../application/ports/texts-ai-provider';
import type {
    TextJobContext,
    TextsLease,
} from '../../../application/ports/texts-job-store';
import { segmentText } from '../../../domain/text';
import { preflightTextsRequest } from '../../ai/texts-ai-provider';
import {
    reserveTextsAttempt,
    settleTextsAttempt,
} from './texts-job-accounting';
import {
    clearLease,
    owned,
    type TextsJobStoreContext,
} from './texts-job-persistence-support';
import { textsAiJobsTable as jobs } from './texts-job-schema';
import {
    authorizeTextsJob,
    exposeTextsJob,
    type TextsJobRow,
    type TextsTransaction,
} from './texts-job-support';

export function transaction<T>(
    persistence: TextsJobStoreContext,
    work: (tx: TextsTransaction) => Promise<T>,
) {
    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        await tx.execute(
            sql`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
        );

        return work(tx);
    });
}

export async function enqueue(
    persistence: TextsJobStoreContext,
    ownerId: string,
    kind: TextJobKind,
    raw: EnqueueTextDetectionRequest | EnqueueTextTranslationRequest,
    context: TextJobContext,
): Promise<TextAiJob> {
    context.signal.throwIfAborted();
    if (!persistence.policy) throw new TextsAiError('generation_not_available');
    const input: TextJobInput =
        kind === 'text-detection'
            ? { kind, ...EnqueueTextDetectionRequestSchema.parse(raw) }
            : (() => {
                  const parsed = EnqueueTextTranslationRequestSchema.parse(raw);

                  return {
                      kind,
                      ...parsed,
                      segments: segmentText(
                          parsed.sourceText,
                          parsed.sourceLanguage,
                          randomUUID,
                      ),
                  };
              })();
    const fingerprint = createHmac(
        'sha256',
        persistence.policy.fingerprintSecret,
    )
        .update('texts-job:v1:')
        .update(
            JSON.stringify({
                kind,
                request:
                    kind === 'text-detection'
                        ? EnqueueTextDetectionRequestSchema.parse(raw)
                        : EnqueueTextTranslationRequestSchema.parse(raw),
            }),
        )
        .digest('hex');

    return transaction(persistence, async (tx) => {
        await authorizeTextsJob(tx, { ownerId, ...input });
        const [previous] = await tx
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.ownerId, ownerId),
                    eq(jobs.operationId, input.operationId),
                ),
            )
            .for('update');

        if (previous) {
            if (previous.expiresAt <= context.now)
                throw new TextsAiError('generation_proposal_expired');
            if (previous.requestFingerprint !== fingerprint)
                throw new TextsAiError('idempotency_conflict');

            return withActionBilling(
                tx,
                exposeTextsJob(previous),
                previous.id,
                previous.ownerId,
            );
        }

        const format =
            kind === 'text-translation'
                ? input.folderId === null
                    ? 'text-translation:v3'
                    : 'text-translation:v2'
                : input.folderId === null
                  ? 'text-detection:v2'
                  : 'text-detection:v1';
        const execution = await persistence.policy!.resolveExecution(
            tx,
            ownerId,
            format,
            context.now,
        );

        if (
            !execution.snapshot ||
            !execution.revisionId ||
            execution.selectionVersion !== 1 ||
            !execution.snapshot.creditPricing
        )
            throw new TextsAiError('generation_not_available');
        try {
            execution.snapshot = await prepareLegacyAction(
                tx,
                ownerId,
                kind,
                execution.snapshot!,
                context.now,
            );
        } catch (error) {
            if (
                error instanceof OperatorBudgetUnavailableError ||
                error instanceof ProviderCostAdmissionUnavailableError
            )
                throw new TextsAiError('generation_not_available');

            throw error;
        }

        execution.budget = execution.snapshot.aggregateBudget;
        preflightTextsRequest(input, execution.snapshot, execution.budget);
        const capacity = await readTextAiCapacity(tx, {
            actorId: ownerId,
            now: context.now,
            budget: execution.budget,
        });

        if (
            capacity.globalQueued + capacity.globalRunning >=
                (persistence.policy!.globalQueueLimit ?? 1000) ||
            capacity.actorQueued + capacity.actorRunning >=
                (persistence.policy!.userQueueLimit ?? 5) ||
            !textAiProviderBudgetAllows(
                capacity.providerUsage,
                true,
                execution.budget,
            )
        )
            throw new TextsAiError('rate_limited');
        const budget = execution.budget,
            pricing = execution.snapshot.creditPricing!;
        const creditSummary = await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).accountSummary(ownerId, context.now);
        const [job] = await tx
            .insert(jobs)
            .values({
                id: randomUUID(),
                ownerId,
                folderId: input.folderId,
                textId:
                    input.kind === 'text-translation'
                        ? (input.textId ?? null)
                        : null,
                expectedTextVersion:
                    input.kind === 'text-translation'
                        ? (input.expectedTextVersion ?? null)
                        : null,
                operationId: input.operationId,
                requestFingerprint: fingerprint,
                jobKind: kind,
                format,
                inputPayload: input,
                expiresAt: new Date(context.now.getTime() + 86_400_000),
                selectedExecutionSnapshot: execution.snapshot,
                executionRevisionId: execution.revisionId,
                maxAttempts: Math.min(2, persistence.policy!.maxAttempts ?? 2),
                createdAt: context.now,
                updatedAt: context.now,
                nextAttemptAt: context.now,
                providerInputCostMicrosPerMillionTokens:
                    budget.inputCostMicrosPerMillionTokens,
                providerOutputCostMicrosPerMillionTokens:
                    budget.outputCostMicrosPerMillionTokens,
                providerMaxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt,
                providerMaxInputTokensPerAttempt:
                    budget.maxInputTokensPerAttempt,
                providerMaxOutputTokensPerAttempt:
                    budget.maxOutputTokensPerAttempt,
                providerReservationState: 'active',
                providerReservedAttempts: 1,
                providerReservedCostMicros: budget.maxCostMicrosPerAttempt,
                providerReservedInputTokens: budget.maxInputTokensPerAttempt,
                providerReservedOutputTokens: budget.maxOutputTokensPerAttempt,
                aiCreditAccounted: false,
                aiCreditPolicyMode: creditSummary.policy.effectiveMode,
                aiCreditInputCreditsPerMillionTokens:
                    pricing.inputCreditsPerMillionTokens,
                aiCreditOutputCreditsPerMillionTokens:
                    pricing.outputCreditsPerMillionTokens,
                aiCreditMaxCreditsPerAttempt: pricing.maxCreditsPerAttempt,
                aiCreditPricingRevision: pricing.revision,
            })
            .returning();

        await reserveTextsAttempt(tx, job!, 1, context.now);

        return withActionBilling(
            tx,
            exposeTextsJob(job!),
            job!.id,
            job!.ownerId,
        );
    });
}

export async function find(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    ownerId: string,
    jobId: string,
) {
    const [candidate] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.ownerId, ownerId)));

    if (!candidate) throw new TextsAiError('generation_job_not_found');
    await authorizeTextsJob(tx, { ownerId, folderId: candidate.folderId });
    const [job] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .for('update');

    return job!;
}

export async function get(
    persistence: TextsJobStoreContext,
    ownerId: string,
    jobId: string,
    context: TextJobContext,
) {
    context.signal.throwIfAborted();

    return transaction(persistence, async (tx) => {
        const job = await find(persistence, tx, ownerId, jobId);
        if (job.expiresAt <= context.now)
            throw new TextsAiError('generation_proposal_expired');

        return withActionBilling(tx, exposeTextsJob(job), job.id, job.ownerId);
    });
}

export async function cancel(
    persistence: TextsJobStoreContext,
    ownerId: string,
    jobId: string,
    context: TextJobContext,
) {
    context.signal.throwIfAborted();

    return transaction(persistence, async (tx) => {
        const job = await find(persistence, tx, ownerId, jobId);
        if (job.expiresAt <= context.now && job.executionState === 'completed')
            throw new TextsAiError('generation_proposal_expired');
        if (
            job.executionState === 'queued' ||
            job.executionState === 'running'
        ) {
            await terminal(persistence, tx, job, context.now, null);
            const [updated] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));

            return withActionBilling(
                tx,
                exposeTextsJob(updated!),
                updated!.id,
                updated!.ownerId,
            );
        }

        if (
            job.executionState === 'completed' &&
            job.jobKind === 'text-translation' &&
            !job.appliedTextId
        ) {
            const [discarded] = await tx
                .update(jobs)
                .set({
                    cancellationRequestedAt: context.now,
                    resultPayload: null,
                    updatedAt: context.now,
                })
                .where(eq(jobs.id, job.id))
                .returning();

            return withActionBilling(
                tx,
                exposeTextsJob(discarded!),
                discarded!.id,
                discarded!.ownerId,
            );
        }

        return withActionBilling(tx, exposeTextsJob(job), job.id, job.ownerId);
    });
}

export async function valid(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    job: TextsJobRow,
    now: Date,
) {
    if (job.expiresAt <= now) return 'generation_proposal_expired';
    if (!job.inputPayload) return 'stale_content';
    try {
        await authorizeTextsJob(tx, job);

        return null;
    } catch (error) {
        if (error instanceof TextsAiError)
            return error.code === 'version_conflict'
                ? 'stale_content'
                : 'access_revoked';

        throw error;
    }
}

export async function terminal(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    job: TextsJobRow,
    now: Date,
    failure: string | null,
    usage?: TextsTokenUsage,
) {
    await settleTextsAttempt(
        tx,
        job,
        now,
        usage,
        failure || job.failureCategory === 'access_revoked'
            ? 'failure'
            : 'stopped',
    );

    await tx
        .update(jobs)
        .set({
            ...clearLease,
            executionState: failure ? 'failed' : 'cancelled',
            failureCategory:
                failure ??
                (job.failureCategory === 'access_revoked'
                    ? 'access_revoked'
                    : 'explicit_stop'),
            cancellationRequestedAt: failure
                ? job.cancellationRequestedAt
                : (job.cancellationRequestedAt ?? now),
            completedAt: now,
            updatedAt: now,
            inputPayload: null,
            resultPayload: null,
        })
        .where(eq(jobs.id, job.id));
}

export async function lockJob(
    persistence: TextsJobStoreContext,
    tx: TextsTransaction,
    lease: TextsLease,
    now: Date,
) {
    const [candidate] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, lease.jobId));

    if (!candidate) return null;
    const invalid = await valid(persistence, tx, candidate, now);
    const [job] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, lease.jobId))
        .for('update');

    if (!job || !owned(job, lease, now)) return null;

    return { job, invalid };
}
