import { selectKnowledgeSentencePool } from './knowledge-sentence-free-selection';
import { sentenceAiJobsTable as jobs } from '../../../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { presentKnowledgeSentenceJob } from './knowledge-sentence-paid-presentation';
import { readPinnedKnowledgeLearningSource } from './learning-source-binding';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { and, eq } from 'drizzle-orm';
import type {
    SentenceNextRequest,
    SentencePrepareRequest,
} from '@languon/contracts';
import { SentenceNextResponseSchema } from '@languon/contracts';
import type { KnowledgeSentenceFreeStore } from '../../../application/knowledge-sentence-free-store';
import type { KnowledgeSentencePaidAdmission } from '../../../application/knowledge-sentence-paid';
import type { VocabularyPracticeActor } from '../../../application/vocabulary-practice-store';
import type { SentenceContext } from '../../../../learning/application/ports/sentence-practice-store';
import { LearningInvalidRequestError } from '../../../../learning/domain/errors';
import { SentenceConflictError } from '../../../../learning/domain/sentence-errors';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import type {
    KnowledgeDatabase,
    KnowledgeTransaction,
} from './knowledge-transaction';
import {
    readVocabularyPracticeSource,
    type VocabularyPracticeContent,
} from './vocabulary-practice-source';
import {
    sourceSentenceEntries,
    currentKnowledgeSentence,
    sentenceRequestFingerprint,
} from './knowledge-sentence-context';
import { seedKnowledgeSentenceExamples } from './knowledge-sentence-examples';
import {
    knowledgeSentenceExercisesTable as exercises,
    knowledgeSentenceExposuresTable as exposures,
    knowledgeSentenceReviewsTable as reviews,
} from './knowledge-sentence-schema';
import { knowledgeSentenceNextReceiptsTable as receipts } from './knowledge-sentence-next-schema';
import {
    knowledgeSentenceAttempts,
    knowledgeSentenceReviews,
    knowledgeSentenceReveal,
    knowledgeSentenceProgress,
} from './knowledge-sentence-free-history';

export class DrizzleKnowledgeSentenceFreeStore implements KnowledgeSentenceFreeStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly crypto: KnowledgeShareCrypto,
        private readonly paid: (
            tx: KnowledgeTransaction,
        ) => KnowledgeSentencePaidAdmission,
    ) {}

    private run<T>(
        source: VocabularyPracticeActor,
        context: SentenceContext,
        operation: (
            tx: KnowledgeTransaction,
            material: VocabularyPracticeContent,
        ) => Promise<T>,
        financialWrite = false,
    ) {
        context.signal.throwIfAborted();

        const work = async (tx: KnowledgeTransaction) => {
            if (financialWrite) await lockTextAiCapacity(tx);
            const material = await readVocabularyPracticeSource(
                tx,
                this.crypto,
                source,
            );
            const result = await operation(tx, material);
            context.signal.throwIfAborted();

            return result;
        };

        return financialWrite
            ? modelPricingTransaction(this.database, work)
            : this.database.transaction(work);
    }

    async authorize(source: VocabularyPracticeActor) {
        await this.database.transaction((tx) =>
            readVocabularyPracticeSource(tx, this.crypto, source),
        );
    }

    private async pool(
        tx: KnowledgeTransaction,
        source: VocabularyPracticeActor,
        material: VocabularyPracticeContent,
        input: SentencePrepareRequest | SentenceNextRequest,
        context: SentenceContext,
    ) {
        if (input.preparedBatchId) throw new LearningInvalidRequestError();
        const selected = sourceSentenceEntries(
            material,
            input.direction,
            input.scope,
        );

        await seedKnowledgeSentenceExamples(
            tx,
            source,
            material,
            input.direction,
            selected.entries,
            context.now,
        );

        return selectKnowledgeSentencePool(tx, source, material, input);
    }

    prepare(
        source: VocabularyPracticeActor,
        input: SentencePrepareRequest,
        context: SentenceContext,
    ) {
        return this.run(source, context, async (tx, material) => {
            const pool = await this.pool(tx, source, material, input, context);
            if (
                input.replayExerciseIds?.some(
                    (id) => !pool.saved.some((row) => row.id === id),
                )
            )
                throw new SentenceConflictError('stale_content');

            return {
                direction: input.direction,
                mode: input.mode,
                sourceLanguage: pool.sourceLanguage,
                targetLanguage: pool.targetLanguage,
                explanationLanguage:
                    input.explanationLanguage ?? material.targetLanguage,
                eligibleCount: pool.entries.length,
                skippedCount: pool.skippedCount,
                usedCount: pool.used.size,
                remainingCount: pool.entries.length - pool.used.size,
                savedUncheckedCount: pool.savedUncheckedCount,
                savedReviewCount: pool.savedReviewCount,
            };
        });
    }

    next(
        source: VocabularyPracticeActor,
        input: SentenceNextRequest,
        context: SentenceContext,
    ) {
        return this.run(
            source,
            context,
            async (tx, material) => {
                const hash = sentenceRequestFingerprint(source, input);
                const [prior] = await tx
                    .select()
                    .from(receipts)
                    .where(
                        and(
                            eq(receipts.actorId, source.actorId),
                            eq(receipts.operationId, input.operationId),
                        ),
                    );

                if (prior) {
                    if (
                        prior.requestFingerprint !== hash ||
                        prior.noteId !== source.noteId ||
                        prior.blockId !== source.blockId
                    )
                        throw new SentenceConflictError('operation_conflict');
                    if (!prior.result)
                        throw new SentenceConflictError('stale_content');
                    if (prior.result.kind === 'exercise') {
                        const [row] = await tx
                            .select()
                            .from(exercises)
                            .where(eq(exercises.id, prior.result.exercise.id));

                        if (!row || !currentKnowledgeSentence(row, material))
                            throw new SentenceConflictError('stale_content');
                    }

                    if (prior.result.kind === 'job') {
                        const [job] = await tx
                            .select()
                            .from(jobs)
                            .where(
                                and(
                                    eq(jobs.id, prior.result.job.id),
                                    eq(jobs.learnerId, source.actorId),
                                    eq(jobs.sourceNoteId, source.noteId),
                                ),
                            );

                        if (
                            !job ||
                            job.sourceKind !== 'knowledge-vocabulary' ||
                            job.knowledgeSource?.blockId !== source.blockId
                        )
                            throw new SentenceConflictError('stale_content');
                        await readPinnedKnowledgeLearningSource(
                            tx,
                            job.knowledgeSource,
                        );

                        return {
                            kind: 'job' as const,
                            job: await presentKnowledgeSentenceJob(tx, job),
                        };
                    }

                    return SentenceNextResponseSchema.parse(prior.result);
                }

                const [conflict] = await tx
                    .select({ id: reviews.id })
                    .from(reviews)
                    .where(
                        and(
                            eq(reviews.actorId, source.actorId),
                            eq(reviews.operationId, input.operationId),
                        ),
                    );

                if (conflict)
                    throw new SentenceConflictError('operation_conflict');
                const [paidConflict] = await tx
                    .select({ id: jobs.id })
                    .from(jobs)
                    .where(
                        and(
                            eq(jobs.learnerId, source.actorId),
                            eq(jobs.operationId, input.operationId),
                        ),
                    );

                if (paidConflict)
                    throw new SentenceConflictError('operation_conflict');
                const pool = await this.pool(
                    tx,
                    source,
                    material,
                    input,
                    context,
                );
                const saved = pool.saved[0];

                if (input.replayExerciseId && !saved)
                    throw new SentenceConflictError('stale_content');
                let result;
                if (saved) {
                    await tx
                        .insert(exposures)
                        .values({
                            actorId: source.actorId,
                            noteId: source.noteId,
                            blockId: source.blockId,
                            exerciseId: saved.id,
                            createdAt: context.now,
                        })
                        .onConflictDoNothing();

                    result = {
                        kind: 'exercise' as const,
                        exercise: saved.publicContent,
                    };
                } else if (
                    input.mode === 'review-only' ||
                    !pool.entries.length ||
                    pool.entries.every((entry) => pool.used.has(entry.entryId))
                ) {
                    result = {
                        kind: 'empty' as const,
                        reason: pool.entries.length
                            ? ('review-exhausted' as const)
                            : ('no-eligible-entries' as const),
                    };
                } else {
                    const candidates = pool.entries
                        .filter((entry) => !pool.used.has(entry.entryId))
                        .slice(0, 12);

                    result = {
                        kind: 'job' as const,
                        job: await this.paid(tx).admitGeneration(
                            source,
                            input,
                            context,
                            candidates,
                        ),
                    };
                }

                const parsed = SentenceNextResponseSchema.parse(result);
                await tx.insert(receipts).values({
                    actorId: source.actorId,
                    operationId: input.operationId,
                    noteId: source.noteId,
                    blockId: source.blockId,
                    requestFingerprint: hash,
                    result: parsed,
                    createdAt: context.now,
                });

                return parsed;
            },
            true,
        );
    }

    revealReference(
        source: VocabularyPracticeActor,
        exerciseId: string,
        input: Parameters<KnowledgeSentenceFreeStore['revealReference']>[2],
        context: SentenceContext,
    ) {
        return this.run(source, context, (tx, material) =>
            knowledgeSentenceReveal(
                tx,
                source,
                material,
                exerciseId,
                input,
                context,
            ),
        );
    }

    attempts(
        source: VocabularyPracticeActor,
        query: Parameters<KnowledgeSentenceFreeStore['attempts']>[1],
        context: SentenceContext,
    ) {
        return this.run(source, context, (tx, material) =>
            knowledgeSentenceAttempts(tx, source, material, query),
        );
    }

    manualReviews(
        source: VocabularyPracticeActor,
        query: Parameters<KnowledgeSentenceFreeStore['manualReviews']>[1],
        context: SentenceContext,
    ) {
        return this.run(source, context, (tx, material) =>
            knowledgeSentenceReviews(tx, source, material, query),
        );
    }

    progress(
        source: VocabularyPracticeActor,
        query: Parameters<KnowledgeSentenceFreeStore['progress']>[1],
        context: SentenceContext,
    ) {
        return this.run(source, context, async (tx, material) => {
            const pool = await this.pool(
                tx,
                source,
                material,
                {
                    direction: query.direction,
                    scope: { type: 'all' },
                    mode: 'saved-first',
                },
                context,
            );

            return knowledgeSentenceProgress(
                tx,
                source,
                material,
                query,
                pool.entries.length,
                pool.used.size,
            );
        });
    }
}
