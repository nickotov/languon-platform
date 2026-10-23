import { type SentencePreparationCommandRequest } from '@languon/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { aiCreditActionsTable as accountingActions } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import {
    authorizeSentence,
    lockSentenceLearner,
    sentenceLearner,
} from './sentence-persistence-support';
import {
    sentencePreparationAuthorizeParent,
    sentencePreparationParentAvailable,
    sentencePreparationSettleParent,
} from './sentence-preparation-accounting';
import {
    sentencePreparationCommandsTable as commands,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';
import {
    covered,
    hash,
    type SentencePreparationPersistenceContext,
} from './sentence-preparation-state';
import {
    sentencePreparationFresh,
    sentencePreparationPresent,
    sentencePreparationRefreshManifest,
    sentencePreparationRows,
} from './sentence-preparation-visibility';
import { sentenceAiJobsTable as jobs } from './sentence-schema';

export async function sentencePreparationGet(
    persistence: SentencePreparationPersistenceContext,
    access: LearningAccess,
    id: string,
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
        const partitions = await sentencePreparationRows(tx, id);
        for (const batch of partitions)
            await sentencePreparationRefreshManifest(
                persistence,
                tx,
                row,
                batch,
                false,
            );
        const current = await sentencePreparationFresh(tx, row, partitions);

        return sentencePreparationPresent(
            persistence,
            tx,
            current ? row : { ...row, state: 'paused', pauseReason: 'stale' },
            partitions,
        );
    });
}

export async function sentencePreparationCommand(
    persistence: SentencePreparationPersistenceContext,
    access: LearningAccess,
    id: string,
    input: SentencePreparationCommandRequest,
    context: SentenceContext,
) {
    context.signal.throwIfAborted();

    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        const { dictionary } = await authorizeSentence(tx, access, true);
        const learnerId = sentenceLearner(access);
        await lockSentenceLearner(tx, learnerId);
        const [row] = await tx
            .select()
            .from(preparations)
            .where(
                and(
                    eq(preparations.id, id),
                    eq(preparations.dictionaryId, dictionary.id),
                    eq(preparations.learnerId, learnerId),
                ),
            )
            .for('update');

        if (!row) throw new SentenceUnavailableError();
        const [receipt] = await tx
            .select()
            .from(commands)
            .where(
                and(
                    eq(commands.learnerId, learnerId),
                    eq(commands.operationId, input.operationId),
                ),
            );

        if (receipt) {
            if (receipt.preparationId !== id || receipt.action !== input.action)
                throw new SentenceConflictError('operation_conflict');

            return sentencePreparationPresent(persistence, tx, row);
        }

        if (input.action === 'resume' || input.action === 'continue') {
            if (
                row.state !== 'paused' ||
                row.pauseReason === 'access' ||
                row.pauseReason === 'stale'
            )
                throw new SentenceConflictError('stale_content');
            if (
                !(await sentencePreparationFresh(
                    tx,
                    row,
                    await sentencePreparationRows(tx, id),
                ))
            )
                throw new SentenceConflictError('stale_content');
            const [otherActive] = await tx
                .select({ id: preparations.id })
                .from(preparations)
                .where(
                    and(
                        eq(preparations.learnerId, learnerId),
                        eq(preparations.dictionaryId, row.dictionaryId),
                        eq(preparations.direction, row.direction),
                        sql`${preparations.id}<>${row.id}::uuid`,
                        inArray(preparations.state, [
                            'queued',
                            'running',
                            'stopping',
                        ]),
                    ),
                )
                .limit(1);

            if (otherActive)
                throw new SentenceConflictError('operation_conflict');
            const available =
                row.mode === 'review-only' ||
                (await sentencePreparationParentAvailable(
                    tx,
                    row,
                    context.now,
                ));

            if (input.action === 'resume' && !available)
                throw new SentenceConflictError('operation_conflict');
            if (input.action === 'continue') {
                if (available || row.mode === 'review-only')
                    throw new SentenceConflictError('operation_conflict');
                await sentencePreparationSettleParent(tx, row, context.now);

                const [old] = row.currentActionId
                    ? await tx
                          .select()
                          .from(accountingActions)
                          .where(eq(accountingActions.id, row.currentActionId))
                    : [];

                if (old?.state === 'active')
                    throw new SentenceConflictError('operation_conflict');
                await sentencePreparationAuthorizeParent(
                    persistence,
                    tx,
                    row,
                    input.operationId,
                    hash({
                        preparationId: row.id,
                        operationId: input.operationId,
                        action: 'continue',
                    }),
                    (await sentencePreparationRows(tx, id)).map((batch) =>
                        batch.entries.filter(
                            (entry) => !covered(batch).has(entry.entryId),
                        ),
                    ),
                    context,
                );
            }

            await tx
                .update(preparations)
                .set({
                    state: 'queued',
                    pauseReason: null,
                    updatedAt: context.now,
                })
                .where(eq(preparations.id, id));
        } else if (row.state !== 'completed' && row.state !== 'failed') {
            await tx
                .update(preparations)
                .set({
                    state: row.activeJobId ? 'stopping' : 'paused',
                    pauseReason: 'user',
                    updatedAt: context.now,
                })
                .where(eq(preparations.id, id));
        }

        await tx.insert(commands).values({
            learnerId,
            operationId: input.operationId,
            preparationId: id,
            action: input.action,
            authorizationActionId: row.currentActionId,
            createdAt: context.now,
        });

        if (input.action === 'stop') {
            if (row.activeJobId)
                await tx
                    .update(jobs)
                    .set({
                        cancellationRequestedAt: context.now,
                        updatedAt: context.now,
                    })
                    .where(
                        and(
                            eq(jobs.id, row.activeJobId),
                            inArray(jobs.executionState, ['queued', 'running']),
                        ),
                    );
            else
                await sentencePreparationSettleParent(
                    tx,
                    row,
                    context.now,
                    true,
                );
        }

        const [updated] = await tx
            .select()
            .from(preparations)
            .where(eq(preparations.id, id));

        return sentencePreparationPresent(persistence, tx, updated!);
    });
}
