import type {
    SentenceAttemptsQuery,
    SentenceManualReviewsQuery,
    SentenceProgressQuery,
    SentenceReferenceRevealRequest,
} from '@languon/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { LearningInvalidRequestError } from '../../../domain/errors';
import { SentenceConflictError } from '../../../domain/sentence-errors';
import { assertSentencePracticeVisible } from './sentence-library-visibility';
import {
    authorizeSentence,
    exposeSentence,
    lockSentenceLearner,
    presentSentenceAttempt,
    presentSentenceManualReview,
    readableExercise,
    sentenceCandidates,
    sentenceLearner,
} from './sentence-persistence-support';
import {
    fingerprint,
    historyCursorSchema,
    type SentencePracticePersistenceContext,
} from './sentence-practice-context';
import { sentencePracticeRun } from './sentence-practice-transaction';
import {
    sentenceAttemptsTable as attempts,
    sentenceExercisesTable as exercises,
    sentenceAiJobsTable as jobs,
    sentenceManualReviewsTable as manualReviews,
    sentenceNextReceiptsTable as receipts,
} from './sentence-schema';

export async function sentencePracticeAttempts(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    query: SentenceAttemptsQuery,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
        access,
        context,
        async (tx, owned, id) => {
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
        },
    );
}

export async function sentencePracticeRevealReference(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    exerciseId: string,
    input: SentenceReferenceRevealRequest,
    context: SentenceContext,
) {
    context.signal.throwIfAborted();
    const id = sentenceLearner(access);

    return persistence.database.transaction(async (tx) => {
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
                receipt.invalidatedAt ? 'stale_content' : 'operation_conflict',
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
        await assertSentencePracticeVisible(tx, exerciseId, id);
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

export async function sentencePracticeManualReviews(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    query: SentenceManualReviewsQuery,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
        access,
        context,
        async (tx, owned, id) => {
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
        },
    );
}

export async function sentencePracticeProgress(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    query: SentenceProgressQuery,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
        access,
        context,
        async (tx, owned, id) => {
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
        },
    );
}
