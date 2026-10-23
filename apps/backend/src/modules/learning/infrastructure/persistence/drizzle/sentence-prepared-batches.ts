import { type SentencePreparationBatch } from '@languon/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import {
    authorizeSentence,
    sentenceLearner,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    sentencePreparationBatchesTable as batches,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';
import {
    presentBatch,
    type SentencePreparationPersistenceContext,
} from './sentence-preparation-state';
import {
    sentencePreparationFresh,
    sentencePreparationRefreshManifest,
} from './sentence-preparation-visibility';

export async function sentencePreparationResolvePreparedBatch(
    persistence: SentencePreparationPersistenceContext,
    tx: SentenceTransaction,
    access: LearningAccess,
    id: string,
    context: SentenceContext,
) {
    context.signal.throwIfAborted();
    const { dictionary } = await authorizeSentence(tx, access);
    const [batch] = await tx.select().from(batches).where(eq(batches.id, id));
    if (!batch) throw new SentenceUnavailableError();
    const [row] = await tx
        .select()
        .from(preparations)
        .where(
            and(
                eq(preparations.id, batch.preparationId),
                eq(preparations.dictionaryId, dictionary.id),
                eq(preparations.learnerId, sentenceLearner(access)),
            ),
        );

    if (!row) throw new SentenceUnavailableError();
    if (row.pauseReason === 'stale' || row.pauseReason === 'access')
        throw new SentenceConflictError('stale_content');
    if (!(await sentencePreparationFresh(tx, row, [batch])))
        throw new SentenceConflictError('stale_content');
    await sentencePreparationRefreshManifest(
        persistence,
        tx,
        row,
        batch,
        false,
    );

    return {
        ...presentBatch(batch),
        direction: row.direction,
        preparationId: row.id,
    };
}

export async function sentencePreparationBatch(
    persistence: SentencePreparationPersistenceContext,
    access: LearningAccess,
    id: string,
    context: SentenceContext,
) {
    const {
        direction: _direction,
        preparationId: _preparationId,
        ...batch
    } = await modelPricingTransaction(persistence.database, (tx) =>
        sentencePreparationResolvePreparedBatch(
            persistence,
            tx,
            access,
            id,
            context,
        ),
    );

    return batch;
}

export async function sentencePreparationListBatches(
    persistence: SentencePreparationPersistenceContext,
    access: LearningAccess,
    id: string,
    query: { offset: number; limit: number },
    context: SentenceContext,
) {
    context.signal.throwIfAborted();

    return modelPricingTransaction(persistence.database, async (tx) => {
        const { dictionary } = await authorizeSentence(tx, access);
        const [row] = await tx
            .select()
            .from(preparations)
            .where(
                and(
                    eq(preparations.id, id),
                    eq(preparations.dictionaryId, dictionary.id),
                    eq(preparations.learnerId, sentenceLearner(access)),
                ),
            );

        if (!row) throw new SentenceUnavailableError();
        const page = await tx
            .select()
            .from(batches)
            .where(eq(batches.preparationId, id))
            .orderBy(asc(batches.ordinal))
            .offset(query.offset)
            .limit(query.limit + 1);
        const items: SentencePreparationBatch[] = [];
        for (const batch of page.slice(0, query.limit)) {
            await sentencePreparationRefreshManifest(
                persistence,
                tx,
                row,
                batch,
                false,
            );

            items.push(presentBatch(batch));
        }

        return {
            items,
            nextOffset:
                page.length > query.limit ? query.offset + query.limit : null,
        };
    });
}
