import { privateSentenceQuery } from './sentence-worker-jobs';
import type { SentenceFeedback } from '@languon/contracts';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { recordTextAiCircuitSuccess } from '../../../../../infrastructure/text-ai/text-ai-circuit';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { SentenceTokenUsage } from '../../../application/ports/sentence-ai-provider';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import type {
    SentenceLease,
    SentenceWriteResult,
} from '../../../application/ports/sentence-worker-store';
import type {
    SentenceCheckInput,
    SentenceGeneratedContent,
    SentenceGenerationInput,
} from '../../../domain/sentence-types';
import { settleSentenceAttempt } from './sentence-job-accounting';
import {
    exposeSentence,
    type SentenceJobRow,
    type SentenceTransaction,
} from './sentence-persistence-support';
import { sentencePreparationChildrenTable as preparationChildren } from './sentence-preparation-schema';
import {
    sentenceAttemptsTable as attempts,
    sentenceExerciseEntriesTable as exerciseEntries,
    sentenceExercisesTable as exercises,
    sentenceAiJobsTable as jobs,
} from './sentence-schema';
import {
    sentenceWorkerLocked,
    sentenceWorkerTerminal,
} from './sentence-worker-authority';
import {
    circuitScope,
    clearLease,
    type SentenceWorkerPersistenceContext,
} from './sentence-worker-context';

export async function sentenceWorkerComplete(
    persistence: SentenceWorkerPersistenceContext,
    lease: SentenceLease,
    context: SentenceContext,
    usage: SentenceTokenUsage | undefined,
    write: (tx: SentenceTransaction, job: SentenceJobRow) => Promise<void>,
): Promise<SentenceWriteResult> {
    context.signal.throwIfAborted();

    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        const locked = await sentenceWorkerLocked(
            persistence,
            tx,
            lease,
            context.now,
        );

        if (!locked) return 'lost';
        const { job, invalid } = locked;
        if (invalid || job.cancellationRequestedAt) {
            await sentenceWorkerTerminal(tx, job, context.now, invalid, usage);

            return 'terminalized';
        }

        if (!job.aiCreditProviderDispatchedAt)
            throw new Error(
                'Sentence publication requires dispatched provider attempt',
            );
        await write(tx, job);
        await settleSentenceAttempt(tx, job, context.now, usage, 'success');
        await recordTextAiCircuitSuccess(tx, circuitScope(job, context.now));
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

export async function sentenceWorkerCompleteGeneration(
    persistence: SentenceWorkerPersistenceContext,
    lease: SentenceLease,
    result: {
        content: SentenceGeneratedContent;
        usage?: SentenceTokenUsage;
    },
    context: SentenceContext,
) {
    return sentenceWorkerComplete(
        persistence,
        lease,
        context,
        result.usage,
        async (tx, job) => {
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
            if (job.sourceKind === 'knowledge-vocabulary') {
                if (!job.knowledgeSource)
                    throw new Error('Missing knowledge source');
                await privateSentenceQuery(
                    tx,
                    sql`select public.languon_publish_knowledge_sentence_generation(${job.id}::uuid,${lease.workerId},${lease.fencingToken}::bigint,${JSON.stringify(content)}::jsonb)`,
                );

                return;
            }

            if (!job.dictionaryId) throw new Error('Missing dictionary source');
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
                generationPolicyVersion: input.generationPolicyVersion,
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
                    generationPolicyVersion: input.generationPolicyVersion,
                    createdAt: context.now,
                })
                .returning();

            await tx.insert(exerciseEntries).values(
                content.targets.map((t) => ({
                    exerciseId: id,
                    dictionaryId: job.dictionaryId!,
                    ...t,
                })),
            );

            const [preparationChild] = await tx
                .select()
                .from(preparationChildren)
                .where(eq(preparationChildren.jobId, job.id));

            if (
                job.format.startsWith('sentence-preparation:') &&
                !preparationChild
            )
                throw new Error('Preparation job has no durable parent');
            if (!preparationChild)
                await exposeSentence(tx, job.learnerId, exercise!, context.now);
            await tx
                .update(jobs)
                .set({ resultExerciseId: id })
                .where(eq(jobs.id, job.id));
        },
    );
}

export async function sentenceWorkerCompleteCheck(
    persistence: SentenceWorkerPersistenceContext,
    lease: SentenceLease,
    result: { feedback: SentenceFeedback; usage?: SentenceTokenUsage },
    context: SentenceContext,
) {
    return sentenceWorkerComplete(
        persistence,
        lease,
        context,
        result.usage,
        async (tx, job) => {
            if (job.jobKind !== 'sentence-check')
                throw new Error('Wrong sentence job kind');
            const input = job.inputPayload as SentenceCheckInput;
            if (job.sourceKind === 'knowledge-vocabulary') {
                if (!job.knowledgeSource)
                    throw new Error('Missing knowledge source');
                await privateSentenceQuery(
                    tx,
                    sql`select public.languon_publish_knowledge_sentence_check(${job.id}::uuid,${lease.workerId},${lease.fencingToken}::bigint,${JSON.stringify(result.feedback)}::jsonb)`,
                );

                return;
            }

            if (!job.dictionaryId) throw new Error('Missing dictionary source');
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
        },
    );
}
