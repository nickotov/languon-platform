import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { and, asc, desc, eq, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DictionaryLanguageTagSchema } from '@languon/contracts';
import type {
    SentencePrepareRequest,
    SentenceNextRequest,
    SentenceCheckRequest,
    SentenceAttemptsQuery,
    SentenceProgressQuery,
    SentenceDirection,
    SentenceReferenceRevealRequest,
    SentenceManualReviewsQuery,
} from '@languon/contracts';
import type {
    SentenceContext,
    SentencePracticeStore,
} from '../../../application/ports/sentence-practice-store';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { TextAiAdmissionExecution } from '../../../../text-ai/application/text-ai-admission-participant';
import type {
    SentenceCheckInput,
    SentenceGenerationInput,
} from '../../../domain/sentence-types';
import {
    SentenceConflictError,
    SentenceCapacityUnavailableError,
    SentenceModelUnavailableError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import { LearningInvalidRequestError } from '../../../domain/errors';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceExercisesTable as exercises,
    sentenceExerciseEntriesTable as exerciseEntries,
    sentenceAttemptsTable as attempts,
    sentenceManualReviewsTable as manualReviews,
    sentenceAiJobsTable as jobs,
    sentenceJobEntriesTable as jobEntries,
    sentenceNextReceiptsTable as receipts,
} from './sentence-schema';
import {
    authorizeSentence,
    lockSentenceLearner,
    sentenceCandidates,
    sentenceLearner,
    exposeSentence,
    readableExercise,
    presentSentenceAttempt,
    presentSentenceManualReview,
    presentSentenceJob,
    sentenceExerciseEntries,
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    reserveSentenceAttempt,
    settleSentenceAttempt,
} from './sentence-job-accounting';
export interface SentencePersistencePolicy {
    resolveExecution: (
        tx: SentenceTransaction,
        userId: string,
        format: string,
        now: Date,
    ) => Promise<TextAiAdmissionExecution>;
    defaultMaxAttempts?: number;
    globalQueueLimit?: number;
    userQueueLimit?: number;
    globalConcurrency?: number;
    userConcurrency?: number;
}
function fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function normalized(input: SentenceNextRequest) {
    return {
        ...input,
        scope:
            input.scope.type === 'all'
                ? input.scope
                : {
                      type: 'manual',
                      entryIds: [...input.scope.entryIds].sort(),
                  },
        visitedExerciseIds: [...input.visitedExerciseIds].sort(),
    };
}
const historyCursorSchema = z
    .object({
        kind: z.enum(['attempts', 'manual-reviews']),
        date: z.iso.datetime(),
        id: z.uuid(),
        learnerId: z.uuid(),
        dictionaryId: z.uuid(),
        direction: z.enum(['source-to-target', 'target-to-source']).nullable(),
        exerciseId: z.uuid().nullable(),
    })
    .strict();
export class DrizzleSentencePracticeStore implements SentencePracticeStore {
    constructor(
        private readonly database: SentenceDatabase,
        private readonly policy: SentencePersistencePolicy,
    ) {}
    private async run<T>(
        access: LearningAccess,
        context: SentenceContext,
        work: (
            tx: SentenceTransaction,
            owned: Awaited<ReturnType<typeof authorizeSentence>>,
            id: string,
        ) => Promise<T>,
        write = false,
    ) {
        context.signal.throwIfAborted();
        return this.database.transaction(async (tx) => {
            if (write) await lockTextAiCapacity(tx);
            const owned = await authorizeSentence(tx, access, write);
            const id = sentenceLearner(access);
            if (write) await lockSentenceLearner(tx, id);
            const result = await work(tx, owned, id);
            context.signal.throwIfAborted();
            return result;
        });
    }
    private async pool(
        tx: SentenceTransaction,
        dictionaryId: string,
        learnerId: string,
        direction: SentenceDirection,
        scope: SentencePrepareRequest['scope'],
        selection?: Pick<SentenceNextRequest, 'mode' | 'visitedExerciseIds'>,
    ) {
        const { candidates, skippedCount } = await sentenceCandidates(
            tx,
            dictionaryId,
            scope,
            direction,
            learnerId,
        );
        const checked = sql<boolean>`exists(select 1 from ${attempts} a where a.exercise_id=${exercises.id} and a.learner_id=${learnerId}::uuid) or exists(select 1 from ${manualReviews} r where r.exercise_id=${exercises.id} and r.learner_id=${learnerId}::uuid)`;
        const valid = and(
            eq(exercises.dictionaryId, dictionaryId),
            eq(exercises.direction, direction),
            or(eq(exercises.shared, true), eq(exercises.creatorId, learnerId)),
            candidates.length
                ? sql`exists(select 1 from ${exerciseEntries} e where e.exercise_id=${exercises.id}) and not exists(select 1 from ${exerciseEntries} e left join ${cards} c on c.id=e.entry_id and c.dictionary_id=e.dictionary_id where e.exercise_id=${exercises.id} and (c.id is null or c.learning_version<>e.learning_version or c.lifecycle<>'active' or e.entry_id not in (${sql.join(
                      candidates.map((c) => sql`${c.entryId}::uuid`),
                      sql`,`,
                  )})))`
                : sql`false`,
        );
        const [counts] = await tx
            .select({
                review: sql<number>`count(*)::int`,
                unchecked: sql<number>`count(*) filter(where not (${checked}))::int`,
            })
            .from(exercises)
            .where(valid);
        const [saved] =
            selection && selection.mode !== 'new-only'
                ? await tx
                      .select()
                      .from(exercises)
                      .where(
                          and(
                              valid,
                              selection.mode === 'saved-first'
                                  ? sql`not (${checked})`
                                  : undefined,
                              selection.visitedExerciseIds.length
                                  ? notInArray(
                                        exercises.id,
                                        selection.visitedExerciseIds,
                                    )
                                  : undefined,
                          ),
                      )
                      .orderBy(asc(exercises.createdAt), asc(exercises.id))
                      .limit(1)
                : [];
        return {
            candidates,
            skippedCount,
            saved,
            savedReviewCount: counts?.review ?? 0,
            savedUncheckedCount: counts?.unchecked ?? 0,
        };
    }

    async prepare(
        access: LearningAccess,
        input: SentencePrepareRequest,
        context: SentenceContext,
    ) {
        return this.run(access, context, async (tx, owned, id) => {
            const pool = await this.pool(
                tx,
                owned.dictionary.id,
                id,
                input.direction,
                input.scope,
            );
            const sourceLanguage = DictionaryLanguageTagSchema.parse(
                input.direction === 'source-to-target'
                    ? owned.dictionary.sourceLanguageTag
                    : owned.dictionary.targetLanguageTag,
            );
            const targetLanguage = DictionaryLanguageTagSchema.parse(
                input.direction === 'source-to-target'
                    ? owned.dictionary.targetLanguageTag
                    : owned.dictionary.sourceLanguageTag,
            );
            return {
                direction: input.direction,
                mode: input.mode,
                sourceLanguage,
                targetLanguage,
                explanationLanguage:
                    input.explanationLanguage ?? sourceLanguage,
                eligibleCount: pool.candidates.length,
                skippedCount: pool.skippedCount,
                usedCount: pool.candidates.filter((c) => c.exposureCount > 0)
                    .length,
                remainingCount: pool.candidates.filter((c) => !c.exposureCount)
                    .length,
                savedUncheckedCount: pool.savedUncheckedCount,
                savedReviewCount: pool.savedReviewCount,
            };
        });
    }
    private async admit(
        tx: SentenceTransaction,
        access: LearningAccess,
        dictionaryId: string,
        input: { operationId: string; sessionId: string },
        payload: SentenceGenerationInput | SentenceCheckInput,
        kind: 'sentence-generation' | 'sentence-check',
        direction: SentenceDirection,
        hash: string,
        now: Date,
    ) {
        await tx.execute(
            sql`select set_config('languon.learning_execution_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
        );
        const learnerId = sentenceLearner(access);
        const format = `${kind}:v1`;
        const execution = await this.policy.resolveExecution(
            tx,
            learnerId,
            format,
            now,
        );
        if (
            !execution.snapshot ||
            !execution.revisionId ||
            execution.selectionVersion !== 1 ||
            !execution.snapshot.creditPricing
        )
            throw new SentenceModelUnavailableError();
        const capacity = await readTextAiCapacity(tx, {
            actorId: learnerId,
            now,
            budget: execution.budget,
        });
        if (
            capacity.globalQueued + capacity.globalRunning >=
                (this.policy.globalQueueLimit ?? 1000) ||
            capacity.actorQueued + capacity.actorRunning >=
                (this.policy.userQueueLimit ?? 5) ||
            (capacity.oldestRunnableAt &&
                now.getTime() - capacity.oldestRunnableAt.getTime() > 300000) ||
            !textAiProviderBudgetAllows(
                capacity.providerUsage,
                true,
                execution.budget,
            )
        )
            throw new SentenceCapacityUnavailableError();
        const pricing = execution.snapshot.creditPricing;
        const budget = execution.budget;
        const [referenceReview] =
            kind === 'sentence-check'
                ? await tx
                      .select({ id: manualReviews.id })
                      .from(manualReviews)
                      .where(
                          and(
                              eq(manualReviews.learnerId, learnerId),
                              eq(
                                  manualReviews.exerciseId,
                                  (payload as SentenceCheckInput).exerciseId,
                              ),
                              eq(manualReviews.sessionId, input.sessionId),
                          ),
                      )
                      .limit(1)
                : [];
        const [job] = await tx
            .insert(jobs)
            .values({
                id: randomUUID(),
                learnerId,
                dictionaryId,
                jobKind: kind,
                format,
                direction,
                authority:
                    access.kind === 'owner'
                        ? { kind: 'owner' }
                        : {
                              kind: 'shared',
                              shareId: access.shareId,
                              keyDigest: access.keyDigest,
                          },
                operationId: input.operationId,
                sessionId: input.sessionId,
                requestFingerprint: hash,
                referenceRevealed: !!referenceReview,
                inputPayload: payload,
                selectedExecutionSnapshot: execution.snapshot,
                selectedExecutionVersion: 1,
                executionRevisionId: execution.revisionId,
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now,
                maxAttempts: this.policy.defaultMaxAttempts ?? 3,
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
                aiCreditAccounted: true,
                aiCreditInputCreditsPerMillionTokens:
                    pricing.inputCreditsPerMillionTokens,
                aiCreditOutputCreditsPerMillionTokens:
                    pricing.outputCreditsPerMillionTokens,
                aiCreditMaxCreditsPerAttempt: pricing.maxCreditsPerAttempt,
                aiCreditPricingRevision: pricing.revision,
            })
            .returning();
        const provenance =
            'candidates' in payload ? payload.candidates : payload.targets;
        await tx.insert(jobEntries).values(
            provenance.map((e) => ({
                jobId: job!.id,
                dictionaryId,
                entryId: e.entryId,
                learningVersion: e.learningVersion,
            })),
        );
        await reserveSentenceAttempt(tx, job!, 1, now);
        const [updated] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, job!.id));
        return updated!;
    }
    async next(
        access: LearningAccess,
        input: SentenceNextRequest,
        context: SentenceContext,
    ) {
        return this.run(
            access,
            context,
            async (tx, owned, id) => {
                const hash = fingerprint({
                    dictionaryId: owned.dictionary.id,
                    ...normalized(input),
                });
                const [prior] = await tx
                    .select()
                    .from(receipts)
                    .where(
                        and(
                            eq(receipts.learnerId, id),
                            eq(receipts.operationId, input.operationId),
                        ),
                    );
                if (prior) {
                    if (prior.invalidatedAt)
                        throw new SentenceConflictError('stale_content');
                    if (prior.requestFingerprint !== hash)
                        throw new SentenceConflictError('operation_conflict');
                    if (prior.exerciseId)
                        return {
                            kind: 'exercise' as const,
                            exercise: (
                                await readableExercise(
                                    tx,
                                    prior.exerciseId,
                                    owned.dictionary.id,
                                    id,
                                    true,
                                )
                            ).publicContent,
                        };
                    if (prior.jobId) {
                        const [job] = await tx
                            .select()
                            .from(jobs)
                            .where(
                                and(
                                    eq(jobs.id, prior.jobId),
                                    eq(jobs.learnerId, id),
                                ),
                            );
                        if (!job) throw new SentenceUnavailableError();
                        return {
                            kind: 'job' as const,
                            job: await presentSentenceJob(tx, job),
                        };
                    }
                    return {
                        kind: 'empty' as const,
                        reason: prior.emptyReason!,
                    };
                }
                const [manualConflict] = await tx
                    .select({ id: manualReviews.id })
                    .from(manualReviews)
                    .where(
                        and(
                            eq(manualReviews.learnerId, id),
                            eq(manualReviews.operationId, input.operationId),
                        ),
                    );
                if (manualConflict)
                    throw new SentenceConflictError('operation_conflict');
                const [conflict] = await tx
                    .select({ id: jobs.id })
                    .from(jobs)
                    .where(
                        and(
                            eq(jobs.learnerId, id),
                            eq(jobs.operationId, input.operationId),
                        ),
                    );
                if (conflict)
                    throw new SentenceConflictError('operation_conflict');
                const pool = await this.pool(
                    tx,
                    owned.dictionary.id,
                    id,
                    input.direction,
                    input.scope,
                    input,
                );
                const saved = pool.saved;
                const receipt = {
                    learnerId: id,
                    operationId: input.operationId,
                    dictionaryId: owned.dictionary.id,
                    requestFingerprint: hash,
                    configuration: {
                        direction: input.direction,
                        mode: input.mode,
                        scope: input.scope,
                        ...(input.explanationLanguage
                            ? { explanationLanguage: input.explanationLanguage }
                            : {}),
                    },
                    createdAt: context.now,
                };
                if (saved) {
                    await exposeSentence(tx, id, saved, context.now);
                    await tx
                        .insert(receipts)
                        .values({ ...receipt, exerciseId: saved.id });
                    return {
                        kind: 'exercise' as const,
                        exercise: saved.publicContent,
                    };
                }
                if (input.mode === 'review-only' || !pool.candidates.length) {
                    const reason =
                        input.mode === 'review-only' && pool.candidates.length
                            ? ('review-exhausted' as const)
                            : ('no-eligible-entries' as const);
                    await tx
                        .insert(receipts)
                        .values({ ...receipt, emptyReason: reason });
                    return { kind: 'empty' as const, reason };
                }
                const shortlist = [...pool.candidates]
                    .sort(
                        (a, b) =>
                            a.exposureCount - b.exposureCount ||
                            (a.sortKey < b.sortKey
                                ? -1
                                : a.sortKey > b.sortKey
                                  ? 1
                                  : a.entryId.localeCompare(b.entryId)),
                    )
                    .slice(0, 12);
                const payload: SentenceGenerationInput = {
                    schemaVersion: 1,
                    generationPolicyVersion: 1,
                    dictionaryId: owned.dictionary.id,
                    direction: input.direction,
                    sourceLanguage: DictionaryLanguageTagSchema.parse(
                        input.direction === 'source-to-target'
                            ? owned.dictionary.sourceLanguageTag
                            : owned.dictionary.targetLanguageTag,
                    ),
                    targetLanguage: DictionaryLanguageTagSchema.parse(
                        input.direction === 'source-to-target'
                            ? owned.dictionary.targetLanguageTag
                            : owned.dictionary.sourceLanguageTag,
                    ),
                    priorityEntryId: shortlist[0]!.entryId,
                    candidates: shortlist.map(
                        ({
                            entryId,
                            learningVersion,
                            sourceText,
                            targetText,
                        }) => ({
                            entryId,
                            learningVersion,
                            sourceText,
                            targetText,
                        }),
                    ),
                };
                const job = await this.admit(
                    tx,
                    access,
                    owned.dictionary.id,
                    input,
                    payload,
                    'sentence-generation',
                    input.direction,
                    hash,
                    context.now,
                );
                await tx.insert(receipts).values({ ...receipt, jobId: job.id });
                return {
                    kind: 'job' as const,
                    job: await presentSentenceJob(tx, job),
                };
            },
            true,
        );
    }
    async getJob(
        access: LearningAccess,
        jobId: string,
        context: SentenceContext,
    ) {
        return this.run(access, context, async (tx, owned, id) => {
            const [job] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.id, jobId),
                        eq(jobs.learnerId, id),
                        eq(jobs.dictionaryId, owned.dictionary.id),
                    ),
                );
            if (!job) throw new SentenceUnavailableError();
            return presentSentenceJob(tx, job);
        });
    }
    async cancelJob(
        access: LearningAccess,
        jobId: string,
        context: SentenceContext,
    ) {
        return this.run(
            access,
            context,
            async (tx, owned, id) => {
                const [job] = await tx
                    .select()
                    .from(jobs)
                    .where(
                        and(
                            eq(jobs.id, jobId),
                            eq(jobs.learnerId, id),
                            eq(jobs.dictionaryId, owned.dictionary.id),
                        ),
                    )
                    .for('update');
                if (!job) throw new SentenceUnavailableError();
                if (job.executionState === 'queued') {
                    await settleSentenceAttempt(tx, job, context.now);
                    await tx
                        .update(jobs)
                        .set({
                            executionState: 'cancelled',
                            completedAt: context.now,
                            updatedAt: context.now,
                            cancellationRequestedAt: context.now,
                        })
                        .where(eq(jobs.id, job.id));
                } else if (job.executionState === 'running')
                    await tx
                        .update(jobs)
                        .set({
                            cancellationRequestedAt: context.now,
                            updatedAt: context.now,
                        })
                        .where(eq(jobs.id, job.id));
                const [updated] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, job.id));
                return presentSentenceJob(tx, updated!);
            },
            true,
        );
    }
    async enqueueCheck(
        access: LearningAccess,
        exerciseId: string,
        input: SentenceCheckRequest,
        context: SentenceContext,
    ) {
        return this.run(
            access,
            context,
            async (tx, owned, id) => {
                const hash = fingerprint({
                    dictionaryId: owned.dictionary.id,
                    exerciseId,
                    ...input,
                    revealedHintIds: [...input.revealedHintIds].sort(),
                });
                const [manualConflict] = await tx
                    .select({ id: manualReviews.id })
                    .from(manualReviews)
                    .where(
                        and(
                            eq(manualReviews.learnerId, id),
                            eq(manualReviews.operationId, input.operationId),
                        ),
                    );
                if (manualConflict)
                    throw new SentenceConflictError('operation_conflict');
                const [receipt] = await tx
                    .select()
                    .from(receipts)
                    .where(
                        and(
                            eq(receipts.learnerId, id),
                            eq(receipts.operationId, input.operationId),
                        ),
                    );
                if (receipt)
                    throw new SentenceConflictError('operation_conflict');
                const [prior] = await tx
                    .select()
                    .from(jobs)
                    .where(
                        and(
                            eq(jobs.learnerId, id),
                            eq(jobs.operationId, input.operationId),
                        ),
                    );
                if (prior) {
                    if (
                        prior.jobKind !== 'sentence-check' ||
                        prior.dictionaryId !== owned.dictionary.id ||
                        prior.requestFingerprint !== hash
                    )
                        throw new SentenceConflictError('operation_conflict');
                    return presentSentenceJob(tx, prior);
                }
                const exercise = await readableExercise(
                    tx,
                    exerciseId,
                    owned.dictionary.id,
                    id,
                    true,
                );
                if (
                    input.revealedHintIds.some(
                        (h) =>
                            !exercise.publicContent.hints.some(
                                (v) => v.id === h,
                            ),
                    )
                )
                    throw new LearningInvalidRequestError();
                const targets = await sentenceExerciseEntries(tx, exerciseId);
                const payload: SentenceCheckInput = {
                    schemaVersion: 1,
                    exerciseId,
                    sourceText: exercise.publicContent.sourceText,
                    referenceTranslation: exercise.referenceTranslation,
                    sourceLanguage: exercise.publicContent.sourceLanguage,
                    targetLanguage: exercise.publicContent.targetLanguage,
                    targets: targets.map(
                        ({
                            entryId,
                            learningVersion,
                            sourceText,
                            targetText,
                        }) => ({
                            entryId,
                            learningVersion,
                            sourceText,
                            targetText,
                        }),
                    ),
                    answer: input.answer,
                    explanationLanguage: input.explanationLanguage,
                    revealedHintIds: input.revealedHintIds,
                };
                return presentSentenceJob(
                    tx,
                    await this.admit(
                        tx,
                        access,
                        owned.dictionary.id,
                        input,
                        payload,
                        'sentence-check',
                        exercise.direction,
                        hash,
                        context.now,
                    ),
                );
            },
            true,
        );
    }
    async attempts(
        access: LearningAccess,
        query: SentenceAttemptsQuery,
        context: SentenceContext,
    ) {
        return this.run(access, context, async (tx, owned, id) => {
            let cursor: z.infer<typeof historyCursorSchema> | null = null;
            if (query.cursor) {
                try {
                    cursor = historyCursorSchema.parse(
                        JSON.parse(
                            Buffer.from(query.cursor, 'base64url').toString(),
                        ),
                    );
                    if (
                        cursor.kind !== 'attempts' ||
                        cursor.learnerId !== id ||
                        cursor.dictionaryId !== owned.dictionary.id ||
                        cursor.direction !== (query.direction ?? null) ||
                        cursor.exerciseId !== (query.exerciseId ?? null)
                    )
                        throw new Error();
                } catch {
                    throw new LearningInvalidRequestError();
                }
            }
            const rows = await tx
                .select({ attempt: attempts, direction: exercises.direction })
                .from(attempts)
                .innerJoin(exercises, eq(exercises.id, attempts.exerciseId))
                .where(
                    and(
                        eq(attempts.learnerId, id),
                        eq(attempts.dictionaryId, owned.dictionary.id),
                        query.direction
                            ? eq(exercises.direction, query.direction)
                            : undefined,
                        query.exerciseId
                            ? eq(attempts.exerciseId, query.exerciseId)
                            : undefined,
                        cursor
                            ? sql`(${attempts.createdAt},${attempts.id}) < (${new Date(cursor.date).toISOString()}::timestamptz,${cursor.id}::uuid)`
                            : undefined,
                    ),
                )
                .orderBy(desc(attempts.createdAt), desc(attempts.id))
                .limit(query.limit + 1);
            const page = rows.slice(0, query.limit);
            const last = page.at(-1)?.attempt;
            return {
                attempts: await Promise.all(
                    page.map((r) => presentSentenceAttempt(tx, r.attempt)),
                ),
                nextCursor:
                    rows.length > query.limit && last
                        ? Buffer.from(
                              JSON.stringify({
                                  kind: 'attempts',
                                  date: last.createdAt.toISOString(),
                                  id: last.id,
                                  learnerId: id,
                                  dictionaryId: owned.dictionary.id,
                                  direction: query.direction ?? null,
                                  exerciseId: query.exerciseId ?? null,
                              }),
                          ).toString('base64url')
                        : null,
            };
        });
    }

    async revealReference(
        access: LearningAccess,
        exerciseId: string,
        input: SentenceReferenceRevealRequest,
        context: SentenceContext,
    ) {
        context.signal.throwIfAborted();
        const id = sentenceLearner(access);
        return this.database.transaction(async (tx) => {
            // Free and paid writes use the same actor-before-personal lock order.
            // This operation never reads capacity, execution policy or a wallet.
            const owned = await authorizeSentence(tx, access, true);
            await lockSentenceLearner(tx, id);
            const hash = fingerprint({
                kind: 'manual-reference-review',
                dictionaryId: owned.dictionary.id,
                exerciseId,
                ...input,
            });
            const [receipt] = await tx
                .select()
                .from(receipts)
                .where(
                    and(
                        eq(receipts.learnerId, id),
                        eq(receipts.operationId, input.operationId),
                    ),
                );
            if (receipt)
                throw new SentenceConflictError(
                    receipt.invalidatedAt
                        ? 'stale_content'
                        : 'operation_conflict',
                );
            const [paid] = await tx
                .select({ id: jobs.id })
                .from(jobs)
                .where(
                    and(
                        eq(jobs.learnerId, id),
                        eq(jobs.operationId, input.operationId),
                    ),
                );
            if (paid) throw new SentenceConflictError('operation_conflict');
            const exercise = await readableExercise(
                tx,
                exerciseId,
                owned.dictionary.id,
                id,
                true,
            );
            const [prior] = await tx
                .select()
                .from(manualReviews)
                .where(
                    and(
                        eq(manualReviews.learnerId, id),
                        eq(manualReviews.operationId, input.operationId),
                    ),
                );
            if (prior) {
                if (prior.requestFingerprint !== hash)
                    throw new SentenceConflictError('operation_conflict');
                return { review: await presentSentenceManualReview(tx, prior) };
            }
            await exposeSentence(tx, id, exercise, context.now);
            const [review] = await tx
                .insert(manualReviews)
                .values({
                    id: randomUUID(),
                    learnerId: id,
                    dictionaryId: owned.dictionary.id,
                    exerciseId,
                    operationId: input.operationId,
                    sessionId: input.sessionId,
                    requestFingerprint: hash,
                    createdAt: context.now,
                })
                .returning();
            context.signal.throwIfAborted();
            return { review: await presentSentenceManualReview(tx, review!) };
        });
    }
    async manualReviews(
        access: LearningAccess,
        query: SentenceManualReviewsQuery,
        context: SentenceContext,
    ) {
        return this.run(access, context, async (tx, owned, id) => {
            let cursor: z.infer<typeof historyCursorSchema> | null = null;
            if (query.cursor) {
                try {
                    cursor = historyCursorSchema.parse(
                        JSON.parse(
                            Buffer.from(query.cursor, 'base64url').toString(),
                        ),
                    );
                    if (
                        cursor.kind !== 'manual-reviews' ||
                        cursor.learnerId !== id ||
                        cursor.dictionaryId !== owned.dictionary.id ||
                        cursor.direction !== (query.direction ?? null) ||
                        cursor.exerciseId !== (query.exerciseId ?? null)
                    )
                        throw new Error();
                } catch {
                    throw new LearningInvalidRequestError();
                }
            }
            const rows = await tx
                .select({ review: manualReviews })
                .from(manualReviews)
                .innerJoin(
                    exercises,
                    eq(exercises.id, manualReviews.exerciseId),
                )
                .where(
                    and(
                        eq(manualReviews.learnerId, id),
                        eq(manualReviews.dictionaryId, owned.dictionary.id),
                        query.direction
                            ? eq(exercises.direction, query.direction)
                            : undefined,
                        query.exerciseId
                            ? eq(manualReviews.exerciseId, query.exerciseId)
                            : undefined,
                        cursor
                            ? sql`(${manualReviews.createdAt},${manualReviews.id}) < (${new Date(cursor.date).toISOString()}::timestamptz,${cursor.id}::uuid)`
                            : undefined,
                    ),
                )
                .orderBy(desc(manualReviews.createdAt), desc(manualReviews.id))
                .limit(query.limit + 1);
            const page = rows.slice(0, query.limit);
            const last = page.at(-1)?.review;
            return {
                reviews: await Promise.all(
                    page.map((r) => presentSentenceManualReview(tx, r.review)),
                ),
                nextCursor:
                    rows.length > query.limit && last
                        ? Buffer.from(
                              JSON.stringify({
                                  kind: 'manual-reviews',
                                  date: last.createdAt.toISOString(),
                                  id: last.id,
                                  learnerId: id,
                                  dictionaryId: owned.dictionary.id,
                                  direction: query.direction ?? null,
                                  exerciseId: query.exerciseId ?? null,
                              }),
                          ).toString('base64url')
                        : null,
            };
        });
    }

    async progress(
        access: LearningAccess,
        query: SentenceProgressQuery,
        context: SentenceContext,
    ) {
        return this.run(access, context, async (tx, owned, id) => {
            const pool = await sentenceCandidates(
                tx,
                owned.dictionary.id,
                { type: 'all' },
                query.direction,
                id,
            );
            const [totals] = await tx
                .select({
                    completed: sql<number>`count(*)::int`,
                    assisted: sql<number>`count(*) filter(where jsonb_array_length(${attempts.revealedHintIds})>0 or ${attempts.referenceRevealed})::int`,
                    perfect: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='perfect')::int`,
                    good: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='good')::int`,
                    notBad: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='not-bad')::int`,
                    practiseAgainLater: sql<number>`count(*) filter(where ${attempts.feedback}->>'rating'='practise-again-later')::int`,
                })
                .from(attempts)
                .innerJoin(exercises, eq(exercises.id, attempts.exerciseId))
                .where(
                    and(
                        eq(attempts.learnerId, id),
                        eq(attempts.dictionaryId, owned.dictionary.id),
                        eq(exercises.direction, query.direction),
                    ),
                );
            const [manualTotal] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(manualReviews)
                .innerJoin(
                    exercises,
                    eq(exercises.id, manualReviews.exerciseId),
                )
                .where(
                    and(
                        eq(manualReviews.learnerId, id),
                        eq(manualReviews.dictionaryId, owned.dictionary.id),
                        eq(exercises.direction, query.direction),
                    ),
                );
            return {
                direction: query.direction,
                eligibleCount: pool.candidates.length,
                usedCount: pool.candidates.filter((c) => c.exposureCount > 0)
                    .length,
                remainingCount: pool.candidates.filter((c) => !c.exposureCount)
                    .length,
                manualReviewCount: manualTotal?.count ?? 0,
                completedCheckCount: totals?.completed ?? 0,
                assistedCheckCount: totals?.assisted ?? 0,
                ratings: {
                    perfect: totals?.perfect ?? 0,
                    good: totals?.good ?? 0,
                    notBad: totals?.notBad ?? 0,
                    practiseAgainLater: totals?.practiseAgainLater ?? 0,
                },
            };
        });
    }
}
