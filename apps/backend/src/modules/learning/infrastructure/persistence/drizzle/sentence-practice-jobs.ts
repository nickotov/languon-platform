import type { SentenceCheckRequest } from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { LearningInvalidRequestError } from '../../../domain/errors';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import type { SentenceCheckInput } from '../../../domain/sentence-types';
import { settleSentenceAttempt } from './sentence-job-accounting';
import { assertSentencePracticeVisible } from './sentence-library-visibility';
import {
    presentSentenceJob,
    readableExercise,
    sentenceExerciseEntries,
} from './sentence-persistence-support';
import { sentencePracticeAdmit } from './sentence-practice-admission';
import {
    fingerprint,
    type SentencePracticePersistenceContext,
} from './sentence-practice-context';
import { sentencePracticeRun } from './sentence-practice-transaction';
import {
    sentenceAiJobsTable as jobs,
    sentenceManualReviewsTable as manualReviews,
    sentenceNextReceiptsTable as receipts,
} from './sentence-schema';

export async function sentencePracticeGetJob(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    jobId: string,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
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
                );

            if (!job || job.format.startsWith('sentence-preparation:'))
                throw new SentenceUnavailableError();

            return presentSentenceJob(tx, job);
        },
    );
}

export async function sentencePracticeCancelJob(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    jobId: string,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
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

            if (!job || job.format.startsWith('sentence-preparation:'))
                throw new SentenceUnavailableError();
            if (job.executionState === 'queued') {
                await settleSentenceAttempt(
                    tx,
                    job,
                    context.now,
                    undefined,
                    'stopped',
                );

                await tx
                    .update(jobs)
                    .set({
                        executionState: 'cancelled',
                        completedAt: context.now,
                        updatedAt: context.now,
                        cancellationRequestedAt: context.now,
                        failureCategory: 'explicit_stop',
                    })
                    .where(eq(jobs.id, job.id));
            } else if (job.executionState === 'running')
                await tx
                    .update(jobs)
                    .set({
                        cancellationRequestedAt: context.now,
                        failureCategory: 'explicit_stop',
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

export async function sentencePracticeEnqueueCheck(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    exerciseId: string,
    input: SentenceCheckRequest,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
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

            if (receipt) throw new SentenceConflictError('operation_conflict');
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

            await assertSentencePracticeVisible(tx, exerciseId, id);
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
                        !exercise.publicContent.hints.some((v) => v.id === h),
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
                    ({ entryId, learningVersion, sourceText, targetText }) => ({
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
                await sentencePracticeAdmit(
                    persistence,
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
