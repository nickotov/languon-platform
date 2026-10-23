import { type SentencePreparationStartRequest } from '@languon/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    SentenceCapacityUnavailableError,
    SentenceConflictError,
} from '../../../domain/sentence-errors';
import { partitionSentencePreparation } from '../../../domain/sentence-preparation-policy';
import {
    authorizeSentence,
    lockSentenceLearner,
    sentenceCandidates,
    sentenceLearner,
} from './sentence-persistence-support';
import { sentencePreparationAuthorizeParent } from './sentence-preparation-accounting';
import { sentencePreparationPruneInactive } from './sentence-preparation-maintenance';
import {
    sentencePreparationBatchesTable as batches,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';
import {
    hash,
    type SentencePreparationPersistenceContext,
} from './sentence-preparation-state';
import { sentencePreparationPresent } from './sentence-preparation-visibility';

export async function sentencePreparationStart(
    persistence: SentencePreparationPersistenceContext,
    access: LearningAccess,
    input: SentencePreparationStartRequest,
    context: SentenceContext,
) {
    context.signal.throwIfAborted();

    return modelPricingTransaction(persistence.database, async (tx) => {
        const { dictionary } = await authorizeSentence(tx, access, true);
        const learnerId = sentenceLearner(access);
        await lockSentenceLearner(tx, learnerId);
        const fingerprint = hash({
            ...input,
            initialRoundScope:
                input.initialRoundScope.type === 'manual'
                    ? {
                          type: 'manual',
                          entryIds: [
                              ...input.initialRoundScope.entryIds,
                          ].sort(),
                      }
                    : input.initialRoundScope,
        });
        const [previous] = await tx
            .select()
            .from(preparations)
            .where(
                and(
                    eq(preparations.learnerId, learnerId),
                    eq(preparations.operationId, input.operationId),
                ),
            );

        if (previous) {
            if (
                previous.fingerprint !== fingerprint ||
                previous.dictionaryId !== dictionary.id
            )
                throw new SentenceConflictError('operation_conflict');

            return sentencePreparationPresent(persistence, tx, previous);
        }

        await sentencePreparationPruneInactive(tx, learnerId, context.now);

        const [active] = await tx
            .select({ id: preparations.id })
            .from(preparations)
            .where(
                and(
                    eq(preparations.learnerId, learnerId),
                    eq(preparations.dictionaryId, dictionary.id),
                    eq(preparations.direction, input.direction),
                    inArray(preparations.state, [
                        'queued',
                        'running',
                        'stopping',
                    ]),
                ),
            )
            .limit(1);

        if (active) throw new SentenceConflictError('operation_conflict');
        const contentRows = await tx
            .select({ id: preparations.id })
            .from(preparations)
            .where(
                and(
                    eq(preparations.learnerId, learnerId),
                    sql`exists(select 1 from ${batches} b where b.preparation_id=${preparations.id})`,
                ),
            )
            .limit(20);

        if (contentRows.length >= 20)
            throw new SentenceCapacityUnavailableError();
        const all = (
            await sentenceCandidates(
                tx,
                dictionary.id,
                { type: 'all' },
                input.direction,
                learnerId,
            )
        ).candidates;
        const initial = (
            await sentenceCandidates(
                tx,
                dictionary.id,
                input.initialRoundScope,
                input.direction,
                learnerId,
            )
        ).candidates.slice(0, 100);
        const sourceLanguage =
            input.direction === 'source-to-target'
                ? dictionary.sourceLanguageTag
                : dictionary.targetLanguageTag;
        const targetLanguage =
            input.direction === 'source-to-target'
                ? dictionary.targetLanguageTag
                : dictionary.sourceLanguageTag;
        const [row] = await tx
            .insert(preparations)
            .values({
                id: randomUUID(),
                learnerId,
                dictionaryId: dictionary.id,
                operationId: input.operationId,
                fingerprint,
                direction: input.direction,
                mode: input.mode,
                authority:
                    access.kind === 'owner'
                        ? { kind: 'owner' }
                        : {
                              kind: 'shared',
                              shareId: access.shareId,
                              keyDigest: access.keyDigest,
                          },
                sourceLanguage,
                targetLanguage,
                state: all.length ? 'queued' : 'completed',
                createdAt: context.now,
                updatedAt: context.now,
            })
            .returning();
        const partitions = partitionSentencePreparation(
            all,
            initial.map((entry) => entry.entryId),
        );

        if (partitions.length)
            await tx.insert(batches).values(
                partitions.map((entries, ordinal) => ({
                    id: randomUUID(),
                    preparationId: row!.id,
                    ordinal,
                    entries: entries.map(
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
                    manifest: [],
                })),
            );
        if (all.length && input.mode !== 'review-only') {
            await sentencePreparationAuthorizeParent(
                persistence,
                tx,
                row!,
                input.operationId,
                fingerprint,
                partitions,
                context,
            );

            const [admitted] = await tx
                .select()
                .from(preparations)
                .where(eq(preparations.id, row!.id));

            return sentencePreparationPresent(persistence, tx, admitted!);
        }

        context.signal.throwIfAborted();

        return sentencePreparationPresent(persistence, tx, row!);
    });
}
