import type { SentenceNextRequest } from '@languon/contracts';
import { DictionaryLanguageTagSchema } from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { LearningInvalidRequestError } from '../../../domain/errors';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import type { SentenceGenerationInput } from '../../../domain/sentence-types';
import { assertSentencePracticeVisible } from './sentence-library-visibility';
import {
    exposeSentence,
    presentSentenceJob,
    readableExercise,
} from './sentence-persistence-support';
import { sentencePracticeAdmit } from './sentence-practice-admission';
import {
    fingerprint,
    normalized,
    type SentencePracticePersistenceContext,
} from './sentence-practice-context';
import {
    sentencePracticePool,
    sentencePracticePreparedSelection,
} from './sentence-practice-selection';
import { sentencePracticeRun } from './sentence-practice-transaction';
import {
    sentenceAiJobsTable as jobs,
    sentenceManualReviewsTable as manualReviews,
    sentenceNextReceiptsTable as receipts,
} from './sentence-schema';

export async function sentencePracticeNext(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    input: SentenceNextRequest,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
        access,
        context,
        async (tx, owned, id) => {
            if (input.replayExerciseId && input.mode !== 'review-only')
                throw new LearningInvalidRequestError();
            const hash = fingerprint({
                dictionaryId: owned.dictionary.id,
                ...normalized(input),
            });
            const prepared = await sentencePracticePreparedSelection(
                persistence,
                tx,
                access,
                input,
                context,
            );
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
                if (prior.exerciseId && input.replayExerciseId) {
                    const exact = await sentencePracticePool(
                        tx,
                        owned.dictionary,
                        id,
                        input.direction,
                        prepared?.scope ?? input.scope,
                        undefined,
                        [input.replayExerciseId],
                        prepared?.exerciseIds,
                    );

                    return {
                        kind: 'exercise' as const,
                        exercise: exact.replayExercises[0]!.publicContent,
                    };
                }

                if (prior.exerciseId) {
                    await assertSentencePracticeVisible(
                        tx,
                        prior.exerciseId,
                        id,
                    );

                    if (
                        prepared &&
                        !prepared.exerciseIds.includes(prior.exerciseId)
                    )
                        throw new SentenceConflictError('stale_content');

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
                }

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

            if (conflict) throw new SentenceConflictError('operation_conflict');
            const pool = await sentencePracticePool(
                tx,
                owned.dictionary,
                id,
                input.direction,
                prepared?.scope ?? input.scope,
                input.replayExerciseId
                    ? undefined
                    : prepared
                      ? {
                            mode: 'saved-first',
                            visitedExerciseIds: input.visitedExerciseIds,
                        }
                      : input,
                input.replayExerciseId ? [input.replayExerciseId] : [],
                prepared?.exerciseIds,
            );
            const saved = input.replayExerciseId
                ? pool.replayExercises[0]
                : pool.saved;
            const receipt = {
                learnerId: id,
                operationId: input.operationId,
                dictionaryId: owned.dictionary.id,
                requestFingerprint: hash,
                configuration: {
                    direction: input.direction,
                    mode: input.mode,
                    scope: input.scope,
                    ...(input.preparedBatchId
                        ? { preparedBatchId: input.preparedBatchId }
                        : {}),
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

            if (
                prepared ||
                input.mode === 'review-only' ||
                !pool.remaining.length
            ) {
                const reason = pool.candidates.length
                    ? ('review-exhausted' as const)
                    : ('no-eligible-entries' as const);

                await tx
                    .insert(receipts)
                    .values({ ...receipt, emptyReason: reason });

                return { kind: 'empty' as const, reason };
            }

            const shortlist = [...pool.remaining]
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
                generationPolicyVersion:
                    persistence.policy.generationFormat ===
                    'sentence-generation:v2'
                        ? 2
                        : 1,
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
                    ({ entryId, learningVersion, sourceText, targetText }) => ({
                        entryId,
                        learningVersion,
                        sourceText,
                        targetText,
                    }),
                ),
            };
            const job = await sentencePracticeAdmit(
                persistence,
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
