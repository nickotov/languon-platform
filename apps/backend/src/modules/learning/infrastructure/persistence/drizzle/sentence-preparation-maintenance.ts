import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { pruneSentenceLibrarySnapshots } from './drizzle-sentence-library-store';
import {
    lockSentenceLearner,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    sentencePreparationBatchesTable as batches,
    sentencePreparationChildrenTable as children,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';
import { type SentencePreparationPersistenceContext } from './sentence-preparation-state';
import { sentenceAiJobsTable as jobs } from './sentence-schema';

export async function sentencePreparationPruneInactive(
    tx: SentenceTransaction,
    learnerId: string,
    now: Date,
) {
    const deadline = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const expired = await tx
        .select()
        .from(preparations)
        .where(
            and(
                eq(preparations.learnerId, learnerId),
                sql`${preparations.activeJobId} is null`,
                sql`not exists(select 1 from ${children} c join ${jobs} j on j.id=c.job_id where c.preparation_id=${preparations.id} and (j.execution_state in ('queued','running') or j.provider_reservation_state='active'))`,
                sql`${preparations.updatedAt}<${deadline.toISOString()}::timestamptz`,
                sql`(${preparations.state} in ('completed','failed') or (${preparations.state}='paused' and ${preparations.pauseReason} in ('stale','access')))`,
                sql`exists(select 1 from ${batches} b where b.preparation_id=${preparations.id})`,
            ),
        )
        .orderBy(asc(preparations.updatedAt))
        .limit(1)
        .for('update');

    for (const row of expired) {
        const ids = await tx
            .select({ id: batches.id })
            .from(batches)
            .where(eq(batches.preparationId, row.id))
            .orderBy(asc(batches.ordinal))
            .limit(100);

        if (ids.length)
            await tx.delete(batches).where(
                inArray(
                    batches.id,
                    ids.map((item) => item.id),
                ),
            );
        // A content-free header preserves the operation identity after bounded pruning.
        await tx
            .update(preparations)
            .set({
                state: 'paused',
                pauseReason: 'stale',
                authority: { kind: 'owner' },
            })
            .where(eq(preparations.id, row.id));
    }
}

export async function sentencePreparationPruneExpired(
    persistence: SentencePreparationPersistenceContext,
    context: SentenceContext,
) {
    await modelPricingTransaction(persistence.database, (tx) =>
        pruneSentenceLibrarySnapshots(tx, context.now),
    );

    const deadline = new Date(context.now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [expired] = await persistence.database
        .select({ learnerId: preparations.learnerId })
        .from(preparations)
        .where(
            and(
                sql`${preparations.activeJobId} is null`,
                sql`not exists(select 1 from ${children} c join ${jobs} j on j.id=c.job_id where c.preparation_id=${preparations.id} and (j.execution_state in ('queued','running') or j.provider_reservation_state='active'))`,
                sql`${preparations.updatedAt}<${deadline.toISOString()}::timestamptz`,
                sql`(${preparations.state} in ('completed','failed') or (${preparations.state}='paused' and ${preparations.pauseReason} in ('stale','access')))`,
                sql`exists(select 1 from ${batches} b where b.preparation_id=${preparations.id})`,
            ),
        )
        .orderBy(asc(preparations.updatedAt), asc(preparations.id))
        .limit(1);

    if (expired)
        await modelPricingTransaction(persistence.database, async (tx) => {
            await lockSentenceLearner(tx, expired.learnerId);
            await sentencePreparationPruneInactive(
                tx,
                expired.learnerId,
                context.now,
            );
        });

    return expired;
}
