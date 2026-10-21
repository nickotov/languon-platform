import { createHmac, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import type {
    EnqueueTextDetectionRequest,
    EnqueueTextTranslationRequest,
    TextAiJob,
} from '@languon/contracts';
import {
    EnqueueTextDetectionRequestSchema,
    EnqueueTextTranslationRequestSchema,
    TextTranslationProposalSchema,
    TextDetectionResultSchema,
    TextSourceSegmentSchema,
} from '@languon/contracts';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    isTextAiCircuitOpen,
    recordTextAiCircuitFailure,
    recordTextAiCircuitSuccess,
} from '../../../../../infrastructure/text-ai/text-ai-circuit';
import type { TextAiAdmissionExecution } from '../../../../text-ai/application/text-ai-admission-participant';
import type {
    TextJobContext,
    TextsJobStore,
    TextsWorkerStore,
    TextsLease,
    ClaimedTextsJob,
} from '../../../application/ports/texts-job-store';
import type {
    TextJobKind,
    TextJobInput,
    TextJobResult,
    TextsTokenUsage,
} from '../../../application/ports/texts-ai-provider';
import {
    TextsAiError,
    TextsCreditsExhaustedError,
} from '../../../application/ports/texts-ai-provider';
import { segmentText, validateTranslation } from '../../../domain/text';
import { preflightTextsRequest } from '../../ai/texts-ai-provider';
import { textsAiJobsTable as jobs } from './texts-job-schema';
import {
    authorizeTextsJob,
    exposeTextsJob,
    type TextsDatabase,
    type TextsTransaction,
    type TextsJobRow,
} from './texts-job-support';
import {
    textsBudget,
    reserveTextsAttempt,
    settleTextsAttempt,
} from './texts-job-accounting';
const clearLease = { workerId: null, leaseDeadline: null, heartbeatAt: null };
const scope = (job: TextsJobRow, now: Date) => ({
    execution: job.selectedExecutionSnapshot,
    format: job.format,
    now,
});
function owned(job: TextsJobRow, lease: TextsLease, now: Date) {
    return (
        job.executionState === 'running' &&
        job.workerId === lease.workerId &&
        job.fencingToken === BigInt(lease.fencingToken) &&
        job.attemptCount === lease.attempt &&
        job.leaseDeadline !== null &&
        job.leaseDeadline > now
    );
}
export interface TextsJobAdmissionPolicy {
    fingerprintSecret: string;
    resolveExecution(
        tx: TextsTransaction,
        userId: string,
        format: string,
        now: Date,
    ): Promise<TextAiAdmissionExecution>;
    globalQueueLimit?: number;
    userQueueLimit?: number;
    maxAttempts?: number;
}
/** All writes use the existing global admission lock; no private queue or provider budget. */
export class DrizzleTextsJobStore implements TextsJobStore, TextsWorkerStore {
    constructor(
        private readonly database: TextsDatabase,
        private readonly policy?: TextsJobAdmissionPolicy,
    ) {}
    private transaction<T>(work: (tx: TextsTransaction) => Promise<T>) {
        return modelPricingTransaction(this.database, async (tx) => {
            await lockTextAiCapacity(tx);
            await tx.execute(
                sql`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
            );
            return work(tx);
        });
    }
    async enqueue(
        ownerId: string,
        kind: TextJobKind,
        raw: EnqueueTextDetectionRequest | EnqueueTextTranslationRequest,
        context: TextJobContext,
    ): Promise<TextAiJob> {
        context.signal.throwIfAborted();
        if (!this.policy) throw new TextsAiError('generation_not_available');
        const input: TextJobInput =
            kind === 'text-detection'
                ? { kind, ...EnqueueTextDetectionRequestSchema.parse(raw) }
                : (() => {
                      const parsed =
                          EnqueueTextTranslationRequestSchema.parse(raw);
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
        const fingerprint = createHmac('sha256', this.policy.fingerprintSecret)
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
        return this.transaction(async (tx) => {
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
                return exposeTextsJob(previous);
            }
            const format =
                kind === 'text-translation'
                    ? input.folderId === null
                        ? 'text-translation:v3'
                        : 'text-translation:v2'
                    : input.folderId === null
                      ? 'text-detection:v2'
                      : 'text-detection:v1';
            const execution = await this.policy!.resolveExecution(
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
            preflightTextsRequest(input, execution.snapshot, execution.budget);
            const capacity = await readTextAiCapacity(tx, {
                actorId: ownerId,
                now: context.now,
                budget: execution.budget,
            });
            if (
                capacity.globalQueued + capacity.globalRunning >=
                    (this.policy!.globalQueueLimit ?? 1000) ||
                capacity.actorQueued + capacity.actorRunning >=
                    (this.policy!.userQueueLimit ?? 5) ||
                !textAiProviderBudgetAllows(
                    capacity.providerUsage,
                    true,
                    execution.budget,
                )
            )
                throw new TextsAiError('rate_limited');
            const budget = execution.budget,
                pricing = execution.snapshot.creditPricing;
            const creditSummary =
                await new DrizzleAiCreditTransactionParticipant(
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
                    maxAttempts: this.policy!.maxAttempts ?? 3,
                    createdAt: context.now,
                    updatedAt: context.now,
                    nextAttemptAt: context.now,
                    providerInputCostMicrosPerMillionTokens:
                        budget.inputCostMicrosPerMillionTokens,
                    providerOutputCostMicrosPerMillionTokens:
                        budget.outputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        budget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        budget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        budget.maxOutputTokensPerAttempt,
                    providerReservationState: 'active',
                    providerReservedAttempts: 1,
                    providerReservedCostMicros: budget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        budget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        budget.maxOutputTokensPerAttempt,
                    aiCreditAccounted: true,
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
            return exposeTextsJob(job!);
        });
    }
    private async find(tx: TextsTransaction, ownerId: string, jobId: string) {
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
    async get(ownerId: string, jobId: string, context: TextJobContext) {
        context.signal.throwIfAborted();
        return this.transaction(async (tx) => {
            const job = await this.find(tx, ownerId, jobId);
            if (job.expiresAt <= context.now)
                throw new TextsAiError('generation_proposal_expired');
            return exposeTextsJob(job);
        });
    }
    async cancel(ownerId: string, jobId: string, context: TextJobContext) {
        context.signal.throwIfAborted();
        return this.transaction(async (tx) => {
            const job = await this.find(tx, ownerId, jobId);
            if (
                job.expiresAt <= context.now &&
                job.executionState === 'completed'
            )
                throw new TextsAiError('generation_proposal_expired');
            if (
                job.executionState === 'queued' ||
                job.executionState === 'running'
            ) {
                await this.terminal(tx, job, context.now, null);
                const [updated] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, job.id));
                return exposeTextsJob(updated!);
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
                return exposeTextsJob(discarded!);
            }
            return exposeTextsJob(job);
        });
    }
    private async valid(tx: TextsTransaction, job: TextsJobRow, now: Date) {
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
    private async terminal(
        tx: TextsTransaction,
        job: TextsJobRow,
        now: Date,
        failure: string | null,
        usage?: TextsTokenUsage,
    ) {
        await settleTextsAttempt(tx, job, now, usage);
        await tx
            .update(jobs)
            .set({
                ...clearLease,
                executionState: failure ? 'failed' : 'cancelled',
                failureCategory: failure,
                completedAt: now,
                updatedAt: now,
                inputPayload: null,
                resultPayload: null,
            })
            .where(eq(jobs.id, job.id));
    }
    private async locked(tx: TextsTransaction, lease: TextsLease, now: Date) {
        const [candidate] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, lease.jobId));
        if (!candidate) return null;
        const invalid = await this.valid(tx, candidate, now);
        const [job] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, lease.jobId))
            .for('update');
        if (!job || !owned(job, lease, now)) return null;
        return { job, invalid };
    }
    async claimNext(
        input: Parameters<TextsWorkerStore['claimNext']>[0],
        context: TextJobContext,
    ): Promise<ClaimedTextsJob | null> {
        context.signal.throwIfAborted();
        if (!input.supportedFormats.length) return null;
        await this.transaction(async (tx) => {
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
        return this.transaction(async (tx) => {
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
                const invalid = await this.valid(tx, job, context.now);
                if (invalid || job.attemptCount >= job.maxAttempts) {
                    await this.terminal(
                        tx,
                        job,
                        context.now,
                        invalid ?? 'provider_timeout',
                    );
                    continue;
                }
                await settleTextsAttempt(tx, job, context.now);
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
                const invalid = await this.valid(tx, candidate, context.now);
                const [job] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, candidate.id))
                    .for('update');
                if (!job || job.executionState !== 'queued') continue;
                if (invalid) {
                    await this.terminal(tx, job, context.now, invalid);
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
                            await this.terminal(
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
                        providerReservedCostMicros:
                            budget.maxCostMicrosPerAttempt,
                        providerReservedInputTokens:
                            budget.maxInputTokensPerAttempt,
                        providerReservedOutputTokens:
                            budget.maxOutputTokensPerAttempt,
                        providerReservationSettledAt: null,
                    })
                    .where(eq(jobs.id, job.id));
                return {
                    lease: {
                        jobId: job.id,
                        workerId: input.workerId,
                        fencingToken: String(fence),
                        attempt,
                    },
                    input: job.inputPayload!,
                    execution: job.selectedExecutionSnapshot,
                    budget,
                    providerIdempotencyKey: `texts:${job.id}:${attempt}`,
                };
            }
            return null;
        });
    }
    async heartbeat(
        lease: TextsLease,
        leaseMs: number,
        context: TextJobContext,
    ) {
        return this.transaction(async (tx) => {
            const locked = await this.locked(tx, lease, context.now);
            if (!locked) return { owned: false, cancellationRequested: false };
            if (locked.invalid) {
                await this.terminal(
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
            return { owned: true, cancellationRequested: false };
        });
    }
    async markDispatched(lease: TextsLease, context: TextJobContext) {
        context.signal.throwIfAborted();
        return this.transaction(async (tx) => {
            const locked = await this.locked(tx, lease, context.now);
            if (!locked) return false;
            if (locked.invalid) {
                await this.terminal(
                    tx,
                    locked.job,
                    context.now,
                    locked.invalid,
                );
                return false;
            }
            const job = locked.job;
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
    async complete(
        lease: TextsLease,
        result: TextJobResult,
        usage: TextsTokenUsage | undefined,
        context: TextJobContext,
    ) {
        context.signal.throwIfAborted();
        return this.transaction(async (tx) => {
            const locked = await this.locked(tx, lease, context.now);
            if (!locked) return false;
            const { job, invalid } = locked;
            if (invalid) {
                await this.terminal(tx, job, context.now, invalid, usage);
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
            await settleTextsAttempt(tx, job, context.now, usage);
            await recordTextAiCircuitSuccess(tx, scope(job, context.now));
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
            return true;
        });
    }
    async fail(
        lease: TextsLease,
        input: Parameters<TextsWorkerStore['fail']>[1],
        context: TextJobContext,
    ) {
        return this.transaction(async (tx) => {
            const locked = await this.locked(tx, lease, context.now);
            if (!locked) return false;
            const { job, invalid } = locked;
            const code = invalid ?? input.code;
            const retryAt =
                !invalid && job.attemptCount < job.maxAttempts
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
                await this.terminal(tx, job, context.now, code, input.usage);
                return true;
            }
            await settleTextsAttempt(tx, job, context.now, input.usage);
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
    async releaseWorkerLeases(workerId: string, context: TextJobContext) {
        await this.transaction(async (tx) => {
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
}
