import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import type {
    ClaimedSentenceJob,
    SentenceLease,
    SentenceWorkerStore,
    SentenceWriteResult,
} from '../../../application/ports/sentence-worker-store';
import type {
    SentenceGeneratedContent,
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../../domain/sentence-types';
import type { SentenceFeedback, SentenceJobFailure } from '@languon/contracts';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    isTextAiCircuitOpen,
    recordTextAiCircuitFailure,
    recordTextAiCircuitSuccess,
    type TextAiCircuitFailureCategory,
} from '../../../../../infrastructure/text-ai/text-ai-circuit';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceAiJobsTable as jobs,
    sentenceJobEntriesTable as jobEntries,
    sentenceExercisesTable as exercises,
    sentenceExerciseEntriesTable as exerciseEntries,
    sentenceAttemptsTable as attempts,
} from './sentence-schema';
import {
    authorizeSentence,
    lockSentenceLearner,
    lockSentenceActorBatch,
    exposeSentence,
    readableExercise,
    type SentenceDatabase,
    type SentenceTransaction,
    type SentenceJobRow,
} from './sentence-persistence-support';
import {
    reserveSentenceAttempt,
    settleSentenceAttempt,
    sentenceBudget,
} from './sentence-job-accounting';
import {
    SentenceCreditsExhaustedError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import type { SentenceTokenUsage } from '../../../application/ports/sentence-ai-provider';
type Usage = { inputTokens: number; outputTokens: number };
function leased(job: SentenceJobRow, lease: SentenceLease, now: Date) {
    return (
        job.executionState === 'running' &&
        job.workerId === lease.workerId &&
        job.fencingToken === BigInt(lease.fencingToken) &&
        job.attemptCount === lease.attempt &&
        job.leaseDeadline !== null &&
        job.leaseDeadline > now
    );
}
function circuitFailureCategory(
    code: SentenceJobFailure,
): TextAiCircuitFailureCategory | null {
    switch (code) {
        case 'provider_unavailable':
        case 'provider_rate_limited':
            return 'provider_error';
        case 'provider_timeout':
            return 'provider_timeout';
        default:
            return null;
    }
}
function circuitScope(job: SentenceJobRow, now: Date) {
    return {
        execution: job.selectedExecutionSnapshot,
        format: job.format,
        now,
    };
}
const clearLease = { workerId: null, leaseDeadline: null, heartbeatAt: null };
export class DrizzleSentenceWorkerStore implements SentenceWorkerStore {
    constructor(private readonly database: SentenceDatabase) {}
    private async valid(
        tx: SentenceTransaction,
        job: SentenceJobRow,
    ): Promise<SentenceJobFailure | null> {
        try {
            const access =
                job.authority.kind === 'owner'
                    ? {
                          kind: 'owner' as const,
                          dictionaryId: job.dictionaryId,
                          learnerId: job.learnerId,
                      }
                    : {
                          kind: 'shared' as const,
                          shareId: job.authority.shareId,
                          keyDigest: job.authority.keyDigest,
                          learnerId: job.learnerId,
                      };
            await authorizeSentence(tx, access, true);
        } catch (error) {
            if (error instanceof SentenceUnavailableError)
                return 'access_revoked';
            throw error;
        }
        const provenance = await tx
            .select()
            .from(jobEntries)
            .where(eq(jobEntries.jobId, job.id));
        if (!provenance.length) return 'stale_content';
        const current = await tx
            .select({
                id: cards.id,
                dictionaryId: cards.dictionaryId,
                lifecycle: cards.lifecycle,
                learningVersion: cards.learningVersion,
            })
            .from(cards)
            .where(
                inArray(
                    cards.id,
                    provenance.map((e) => e.entryId),
                ),
            );
        if (
            provenance.some(
                (e) =>
                    !current.some(
                        (c) =>
                            c.id === e.entryId &&
                            c.dictionaryId === job.dictionaryId &&
                            c.lifecycle === 'active' &&
                            c.learningVersion === e.learningVersion,
                    ),
            )
        )
            return 'stale_content';
        if (job.jobKind === 'sentence-check') {
            try {
                await readableExercise(
                    tx,
                    (job.inputPayload as SentenceCheckInput).exerciseId,
                    job.dictionaryId,
                    job.learnerId,
                    true,
                );
            } catch (error) {
                if (error instanceof SentenceUnavailableError)
                    return 'stale_content';
                throw error;
            }
        }
        return null;
    }
    private async terminal(
        tx: SentenceTransaction,
        job: SentenceJobRow,
        now: Date,
        failure: SentenceJobFailure | null,
        usage?: Usage,
    ) {
        await settleSentenceAttempt(tx, job, now, usage);
        await tx
            .update(jobs)
            .set({
                ...clearLease,
                executionState: failure ? 'failed' : 'cancelled',
                failureCategory: failure,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(jobs.id, job.id));
    }
    private async locked(
        tx: SentenceTransaction,
        lease: SentenceLease,
        now: Date,
    ) {
        const [candidate] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, lease.jobId));
        if (!candidate) return null;
        const invalid = await this.valid(tx, candidate);
        await lockSentenceLearner(tx, candidate.learnerId);
        const [job] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, lease.jobId))
            .for('update');
        if (!job || !leased(job, lease, now)) return null;
        return { job, invalid };
    }
    async claimNext(
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
        return this.database.transaction(async (tx) => {
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
                const invalid = await this.valid(tx, candidate);
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
                    await this.terminal(tx, job, context.now, invalid);
                    continue;
                }
                await settleSentenceAttempt(tx, job, context.now);
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
                const invalid = await this.valid(tx, candidate);
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
                    await this.terminal(tx, job, context.now, invalid);
                    continue;
                }
                if (
                    await isTextAiCircuitOpen(
                        tx,
                        circuitScope(job, context.now),
                    )
                )
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
                context.signal.throwIfAborted();
                return {
                    lease: {
                        jobId: job.id,
                        workerId: input.workerId,
                        fencingToken,
                        attempt: job.attemptCount + 1,
                    },
                    leaseDeadline,
                    execution: job.selectedExecutionSnapshot,
                    budget,
                    providerIdempotencyKey: `sentence:${job.id}:${job.attemptCount + 1}`,
                    ...(job.jobKind === 'sentence-generation'
                        ? {
                              kind: 'sentence-generation' as const,
                              input: job.inputPayload as SentenceGenerationInput,
                          }
                        : {
                              kind: 'sentence-check' as const,
                              input: job.inputPayload as SentenceCheckInput,
                          }),
                };
            }
            return null;
        });
    }
    async heartbeat(
        lease: SentenceLease,
        leaseMs: number,
        context: SentenceContext,
    ) {
        context.signal.throwIfAborted();
        return this.database.transaction(async (tx) => {
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
    async markDispatched(
        lease: SentenceLease,
        context: SentenceContext,
    ): Promise<'dispatch' | 'terminalized' | 'lost'> {
        context.signal.throwIfAborted();
        return this.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            const locked = await this.locked(tx, lease, context.now);
            if (!locked) return 'lost';
            const { job, invalid } = locked;
            if (invalid || job.cancellationRequestedAt) {
                await this.terminal(tx, job, context.now, invalid);
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
    private async complete(
        lease: SentenceLease,
        context: SentenceContext,
        usage: SentenceTokenUsage | undefined,
        write: (tx: SentenceTransaction, job: SentenceJobRow) => Promise<void>,
    ): Promise<SentenceWriteResult> {
        context.signal.throwIfAborted();
        return this.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            const locked = await this.locked(tx, lease, context.now);
            if (!locked) return 'lost';
            const { job, invalid } = locked;
            if (invalid || job.cancellationRequestedAt) {
                await this.terminal(tx, job, context.now, invalid, usage);
                return 'terminalized';
            }
            if (!job.aiCreditProviderDispatchedAt)
                throw new Error(
                    'Sentence publication requires dispatched provider attempt',
                );
            await write(tx, job);
            await settleSentenceAttempt(tx, job, context.now, usage);
            await recordTextAiCircuitSuccess(
                tx,
                circuitScope(job, context.now),
            );
            await tx
                .update(jobs)
                .set({
                    ...clearLease,
                    executionState: 'completed',
                    completedAt: context.now,
                    updatedAt: context.now,
                    failureCategory: null,
                })
                .where(eq(jobs.id, job.id));
            context.signal.throwIfAborted();
            return 'committed';
        });
    }
    async completeGeneration(
        lease: SentenceLease,
        result: {
            content: SentenceGeneratedContent;
            usage?: SentenceTokenUsage;
        },
        context: SentenceContext,
    ) {
        return this.complete(lease, context, result.usage, async (tx, job) => {
            if (job.jobKind !== 'sentence-generation')
                throw new Error('Wrong sentence job kind');
            const input = job.inputPayload as SentenceGenerationInput;
            const content = result.content;
            if (
                !content.targets.length ||
                content.targets.length > 3 ||
                !content.targets.some(
                    (t) => t.entryId === input.priorityEntryId,
                ) ||
                content.targets.some(
                    (t) =>
                        !input.candidates.some(
                            (c) =>
                                c.entryId === t.entryId &&
                                c.learningVersion === t.learningVersion &&
                                c.sourceText === t.sourceText &&
                                c.targetText === t.targetText,
                        ),
                ) ||
                new Set(content.targets.map((t) => t.entryId)).size !==
                    content.targets.length
            )
                throw new Error('Invalid sentence targets');
            const id = randomUUID();
            const publicContent = {
                id,
                dictionaryId: job.dictionaryId,
                direction: job.direction,
                sourceLanguage: input.sourceLanguage,
                targetLanguage: input.targetLanguage,
                sourceText: content.sourceText,
                segments: content.segments,
                hints: content.hints,
                generationPolicyVersion: 1 as const,
                createdAt: context.now.toISOString(),
            };
            const [owned] = await tx.execute(
                sql`select owner_id from dictionaries where id=${job.dictionaryId}::uuid`,
            );
            const [exercise] = await tx
                .insert(exercises)
                .values({
                    id,
                    creatorId: job.learnerId,
                    dictionaryId: job.dictionaryId,
                    direction: job.direction,
                    shared: owned?.owner_id === job.learnerId,
                    publicContent,
                    referenceTranslation: content.referenceTranslation,
                    createdAt: context.now,
                })
                .returning();
            await tx.insert(exerciseEntries).values(
                content.targets.map((t) => ({
                    exerciseId: id,
                    dictionaryId: job.dictionaryId,
                    ...t,
                })),
            );
            await exposeSentence(tx, job.learnerId, exercise!, context.now);
            await tx
                .update(jobs)
                .set({ resultExerciseId: id })
                .where(eq(jobs.id, job.id));
        });
    }
    async completeCheck(
        lease: SentenceLease,
        result: { feedback: SentenceFeedback; usage?: SentenceTokenUsage },
        context: SentenceContext,
    ) {
        return this.complete(lease, context, result.usage, async (tx, job) => {
            if (job.jobKind !== 'sentence-check')
                throw new Error('Wrong sentence job kind');
            const input = job.inputPayload as SentenceCheckInput;
            const id = randomUUID();
            await tx.insert(attempts).values({
                id,
                learnerId: job.learnerId,
                dictionaryId: job.dictionaryId,
                exerciseId: input.exerciseId,
                operationId: job.operationId,
                sessionId: job.sessionId,
                answer: input.answer,
                referenceRevealed: job.referenceRevealed,
                explanationLanguage: input.explanationLanguage,
                revealedHintIds: [...input.revealedHintIds],
                feedback: result.feedback,
                createdAt: context.now,
            });
            await tx
                .update(jobs)
                .set({ resultAttemptId: id })
                .where(eq(jobs.id, job.id));
        });
    }
    async fail(
        lease: SentenceLease,
        failure: {
            code: SentenceJobFailure;
            retryAt: Date | null;
            usage?: SentenceTokenUsage;
        },
        context: SentenceContext,
    ): Promise<SentenceWriteResult> {
        context.signal.throwIfAborted();
        return this.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            const locked = await this.locked(tx, lease, context.now);
            if (!locked) return 'lost';
            const { job, invalid } = locked;
            if (invalid || job.cancellationRequestedAt) {
                await this.terminal(
                    tx,
                    job,
                    context.now,
                    invalid,
                    failure.usage,
                );
                return 'terminalized';
            }
            await settleSentenceAttempt(tx, job, context.now, failure.usage);
            const category = circuitFailureCategory(failure.code);
            if (category && job.aiCreditProviderDispatchedAt)
                await recordTextAiCircuitFailure(tx, {
                    ...circuitScope(job, context.now),
                    category,
                });
            if (failure.retryAt && job.attemptCount < job.maxAttempts) {
                await tx
                    .update(jobs)
                    .set({
                        ...clearLease,
                        executionState: 'queued',
                        nextAttemptAt: failure.retryAt,
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
    async releaseWorkerLeases(workerId: string, context: SentenceContext) {
        const rows = await this.database
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.workerId, workerId),
                    eq(jobs.executionState, 'running'),
                ),
            );
        for (const row of rows)
            await this.fail(
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
}
