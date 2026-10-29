import { readKnowledgeSentenceJobSource } from './knowledge-sentence-job-source';
import { knowledgeSentenceNextReceiptsTable as receipts } from './knowledge-sentence-next-schema';
import { and, eq } from 'drizzle-orm';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { sentencePracticeAdmit } from '../../../../learning/infrastructure/persistence/drizzle/sentence-practice-admission';
import { settleSentenceAttempt } from '../../../../learning/infrastructure/persistence/drizzle/sentence-job-accounting';
import type { SentencePersistencePolicy } from '../../../../learning/infrastructure/persistence/drizzle/sentence-practice-context';
import { sentenceAiJobsTable as jobs } from '../../../../learning/infrastructure/persistence/drizzle/sentence-schema';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../../learning/domain/sentence-errors';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../../../learning/domain/sentence-types';
import type {
    KnowledgeSentencePaidAdmission,
    KnowledgeSentencePaidOperations,
} from '../../../application/knowledge-sentence-paid';
import type {
    KnowledgeDatabase,
    KnowledgeTransaction,
} from './knowledge-transaction';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { pinKnowledgeLearningSource } from './learning-source-binding';
import {
    assertRequestedHints,
    sentenceRequestFingerprint,
    currentKnowledgeSentence,
} from './knowledge-sentence-context';
import { readVocabularyPracticeSource } from './vocabulary-practice-source';
import {
    knowledgeSentenceExercisesTable as exercises,
    knowledgeSentenceReviewsTable as reviews,
    knowledgeSentenceAttemptsTable as attempts,
} from './knowledge-sentence-schema';
import { presentKnowledgeSentenceJob } from './knowledge-sentence-paid-presentation';

export class DrizzleKnowledgeSentencePaid implements KnowledgeSentencePaidOperations {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly crypto: KnowledgeShareCrypto,
        private readonly policy: SentencePersistencePolicy,
    ) {}

    admission(tx: KnowledgeTransaction): KnowledgeSentencePaidAdmission {
        return {
            admitGeneration: async (source, input, context, candidates) => {
                const pinned = await pinKnowledgeLearningSource(
                    tx,
                    this.crypto,
                    source.actorId,
                    source.noteId,
                    source.blockId,
                    source.access,
                );
                const content = await readVocabularyPracticeSource(
                    tx,
                    this.crypto,
                    source,
                );
                const shortlist = [...candidates]
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

                if (!shortlist.length) throw new SentenceUnavailableError();
                const forward = input.direction === 'source-to-target';
                const payload: SentenceGenerationInput = {
                    schemaVersion: 1,
                    generationPolicyVersion:
                        this.policy.generationFormat ===
                        'sentence-generation:v2'
                            ? 2
                            : 1,
                    dictionaryId: null,
                    knowledgeSource: {
                        noteId: source.noteId,
                        blockId: source.blockId,
                    },
                    direction: input.direction,
                    sourceLanguage: forward
                        ? content.sourceLanguage
                        : content.targetLanguage,
                    targetLanguage: forward
                        ? content.targetLanguage
                        : content.sourceLanguage,
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
                const [reviewConflict] = await tx
                    .select({ id: reviews.id })
                    .from(reviews)
                    .where(
                        and(
                            eq(reviews.actorId, source.actorId),
                            eq(reviews.operationId, input.operationId),
                        ),
                    );
                const [attemptConflict] = await tx
                    .select({ id: attempts.id })
                    .from(attempts)
                    .where(
                        and(
                            eq(attempts.actorId, source.actorId),
                            eq(attempts.operationId, input.operationId),
                        ),
                    );

                if (reviewConflict || attemptConflict)
                    throw new SentenceConflictError('operation_conflict');
                const hash = sentenceRequestFingerprint(source, input);
                const [prior] = await tx
                    .select()
                    .from(jobs)
                    .where(
                        and(
                            eq(jobs.learnerId, source.actorId),
                            eq(jobs.operationId, input.operationId),
                        ),
                    );

                if (prior) {
                    if (
                        prior.sourceKind !== 'knowledge-vocabulary' ||
                        prior.sourceNoteId !== source.noteId ||
                        prior.requestFingerprint !== hash
                    )
                        throw new SentenceConflictError('operation_conflict');

                    await readKnowledgeSentenceJobSource(tx, {
                        jobId: prior.id,
                        actorId: source.actorId,
                        noteId: source.noteId,
                        blockId: source.blockId,
                    });

                    return presentKnowledgeSentenceJob(tx, prior);
                }

                const job = await sentencePracticeAdmit(
                    { database: this.database, policy: this.policy },
                    tx,
                    { learnerId: source.actorId },
                    null,
                    input,
                    payload,
                    'sentence-generation',
                    input.direction,
                    hash,
                    context.now,
                    undefined,
                    pinned.binding,
                );

                return presentKnowledgeSentenceJob(tx, job);
            },
        };
    }

    async enqueueCheck(
        ...[source, exerciseId, input, context]: Parameters<
            KnowledgeSentencePaidOperations['enqueueCheck']
        >
    ) {
        context.signal.throwIfAborted();

        return modelPricingTransaction(this.database, async (tx) => {
            await lockTextAiCapacity(tx);
            const pinned = await pinKnowledgeLearningSource(
                tx,
                this.crypto,
                source.actorId,
                source.noteId,
                source.blockId,
                source.access,
            );
            const content = await readVocabularyPracticeSource(
                tx,
                this.crypto,
                source,
            );
            const [exercise] = await tx
                .select()
                .from(exercises)
                .where(
                    and(
                        eq(exercises.id, exerciseId),
                        eq(exercises.actorId, source.actorId),
                        eq(exercises.noteId, source.noteId),
                        eq(exercises.blockId, source.blockId),
                    ),
                );

            if (!exercise || !currentKnowledgeSentence(exercise, content))
                throw new SentenceUnavailableError();
            assertRequestedHints(exercise.publicContent, input.revealedHintIds);
            const hash = sentenceRequestFingerprint(source, {
                ...input,
                direction: exercise.publicContent.direction,
                mode: 'saved-first',
                scope: { type: 'all' },
                visitedExerciseIds: [],
            });
            const [prior] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.learnerId, source.actorId),
                        eq(jobs.operationId, input.operationId),
                    ),
                );

            if (prior) {
                if (
                    prior.sourceKind !== 'knowledge-vocabulary' ||
                    prior.requestFingerprint !== hash
                )
                    throw new SentenceConflictError('operation_conflict');

                const provenance = await readKnowledgeSentenceJobSource(tx, {
                    jobId: prior.id,
                    actorId: source.actorId,
                    noteId: source.noteId,
                    blockId: source.blockId,
                });

                if (provenance.sourceExerciseId !== exerciseId)
                    throw new SentenceConflictError('operation_conflict');

                return presentKnowledgeSentenceJob(tx, prior);
            }

            const [receiptConflict] = await tx
                .select({ operationId: receipts.operationId })
                .from(receipts)
                .where(
                    and(
                        eq(receipts.actorId, source.actorId),
                        eq(receipts.operationId, input.operationId),
                    ),
                );
            const [reviewConflict] = await tx
                .select({ id: reviews.id })
                .from(reviews)
                .where(
                    and(
                        eq(reviews.actorId, source.actorId),
                        eq(reviews.operationId, input.operationId),
                    ),
                );

            if (receiptConflict || reviewConflict)
                throw new SentenceConflictError('operation_conflict');
            const payload: SentenceCheckInput = {
                schemaVersion: 1,
                exerciseId,
                sourceText: exercise.publicContent.sourceText,
                referenceTranslation: exercise.referenceTranslation,
                sourceLanguage: exercise.publicContent.sourceLanguage,
                targetLanguage: exercise.publicContent.targetLanguage,
                targets: exercise.provenance,
                answer: input.answer,
                explanationLanguage: input.explanationLanguage,
                revealedHintIds: input.revealedHintIds,
            };
            const job = await sentencePracticeAdmit(
                { database: this.database, policy: this.policy },
                tx,
                { learnerId: source.actorId },
                null,
                input,
                payload,
                'sentence-check',
                exercise.publicContent.direction,
                hash,
                context.now,
                undefined,
                pinned.binding,
            );
            const [review] = await tx
                .select()
                .from(reviews)
                .where(
                    and(
                        eq(reviews.actorId, source.actorId),
                        eq(reviews.exerciseId, exerciseId),
                        eq(reviews.sessionId, input.sessionId),
                    ),
                );

            if (review)
                await tx
                    .update(jobs)
                    .set({ referenceRevealed: true })
                    .where(eq(jobs.id, job.id));

            return presentKnowledgeSentenceJob(tx, {
                ...job,
                referenceRevealed: !!review,
            });
        });
    }

    async getJob(
        ...[source, jobId, context]: Parameters<
            KnowledgeSentencePaidOperations['getJob']
        >
    ) {
        return this.read(source, jobId, context, false);
    }

    async cancelJob(
        ...[source, jobId, context]: Parameters<
            KnowledgeSentencePaidOperations['cancelJob']
        >
    ) {
        return this.read(source, jobId, context, true);
    }

    private async read(
        source: Parameters<KnowledgeSentencePaidOperations['getJob']>[0],
        jobId: string,
        context: Parameters<KnowledgeSentencePaidOperations['getJob']>[2],
        cancel: boolean,
    ) {
        context.signal.throwIfAborted();

        return modelPricingTransaction(this.database, async (tx) => {
            await lockTextAiCapacity(tx);
            await readVocabularyPracticeSource(tx, this.crypto, source);
            const [job] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.id, jobId),
                        eq(jobs.learnerId, source.actorId),
                        eq(jobs.sourceNoteId, source.noteId),
                    ),
                )
                .for('update');

            if (!job || job.sourceKind !== 'knowledge-vocabulary')
                throw new SentenceUnavailableError();
            await readKnowledgeSentenceJobSource(tx, {
                jobId: job.id,
                actorId: source.actorId,
                noteId: source.noteId,
                blockId: source.blockId,
            });

            if (cancel && job.executionState === 'queued') {
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
            } else if (cancel && job.executionState === 'running')
                await tx
                    .update(jobs)
                    .set({
                        cancellationRequestedAt: context.now,
                        updatedAt: context.now,
                        failureCategory: 'explicit_stop',
                    })
                    .where(eq(jobs.id, job.id));
            const [updated] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));

            return presentKnowledgeSentenceJob(tx, updated!);
        });
    }
}
