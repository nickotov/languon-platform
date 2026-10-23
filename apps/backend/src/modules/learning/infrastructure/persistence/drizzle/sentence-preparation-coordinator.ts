import { SentenceExerciseSchema } from '@languon/contracts';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { aiCreditActionsTable as accountingActions } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    SentenceCapacityUnavailableError,
    SentenceCreditsExhaustedError,
    SentenceModelUnavailableError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import { sentenceLanguageMatches } from '../../../domain/sentence-language';
import {
    sentenceGlobalVisibilityTable as global,
    sentencePersonalVisibilityTable as personal,
} from './sentence-library-schema';
import {
    authorizeSentence,
    isSentenceCurrent,
    lockSentenceLearner,
    sentenceExerciseEntries,
} from './sentence-persistence-support';
import {
    sentencePreparationParentAvailable,
    sentencePreparationSettleParent,
} from './sentence-preparation-accounting';
import { sentencePreparationPruneExpired } from './sentence-preparation-maintenance';
import { sentencePreparationNextCandidate } from './sentence-preparation-scheduling';
import {
    sentencePreparationBatchesTable as batches,
    sentencePreparationChildrenTable as children,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';
import type { Preparation } from './sentence-preparation-state';
import {
    accessFor,
    covered,
    type SentencePreparationPersistenceContext,
} from './sentence-preparation-state';
import {
    sentencePreparationFresh,
    sentencePreparationRefreshManifest,
    sentencePreparationRows,
    sentencePreparationVisible,
} from './sentence-preparation-visibility';
import {
    sentenceExerciseEntriesTable as exerciseEntries,
    sentenceExercisesTable as exercises,
    sentenceAiJobsTable as jobs,
} from './sentence-schema';

export async function sentencePreparationTick(
    persistence: SentencePreparationPersistenceContext,
    context: SentenceContext,
): Promise<boolean> {
    context.signal.throwIfAborted();
    const expired = await sentencePreparationPruneExpired(persistence, context);
    const candidate = await sentencePreparationNextCandidate(
        persistence,
        context,
    );

    if (!candidate) return !!expired;

    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        // Actor/dictionary locks precede the preparation row, matching normal admission.
        let accessValid = true;
        try {
            await authorizeSentence(tx, accessFor(candidate), true);
        } catch (error) {
            if (!(error instanceof SentenceUnavailableError)) throw error;
            accessValid = false;
        }

        await lockSentenceLearner(tx, candidate.learnerId);
        const [row] = await tx
            .select()
            .from(preparations)
            .where(
                and(
                    eq(preparations.id, candidate.id),
                    inArray(preparations.state, [
                        'queued',
                        'running',
                        'stopping',
                        'paused',
                    ]),
                ),
            )
            .for('update');

        if (!row) return false;
        const pause = async (
            pauseReason: NonNullable<Preparation['pauseReason']>,
        ) => {
            await tx
                .update(preparations)
                .set({
                    state: row.activeJobId ? 'stopping' : 'paused',
                    pauseReason,
                    updatedAt: context.now,
                })
                .where(eq(preparations.id, row.id));

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
        };
        const partitions = await sentencePreparationRows(tx, row.id);

        if (!accessValid) {
            await pause('access');
        } else if (!(await sentencePreparationFresh(tx, row, partitions))) {
            await pause('stale');
        }

        if (row.activeJobId) {
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, row.activeJobId));

            if (job && ['queued', 'running'].includes(job.executionState)) {
                await tx
                    .update(preparations)
                    .set({ updatedAt: context.now })
                    .where(eq(preparations.id, row.id));

                return true;
            }

            if (job?.executionState === 'completed' && job.resultExerciseId) {
                const [child] = await tx
                    .select()
                    .from(children)
                    .where(eq(children.jobId, job.id));
                const batch = partitions.find(
                    (item) => item.id === child?.batchId,
                );

                if (
                    batch &&
                    (await sentencePreparationVisible(
                        tx,
                        row.learnerId,
                        job.resultExerciseId,
                    ))
                ) {
                    const linked = await sentenceExerciseEntries(
                        tx,
                        job.resultExerciseId,
                    );

                    if (
                        linked.length &&
                        linked.every((entry) =>
                            batch.entries.some(
                                (candidate) =>
                                    candidate.entryId === entry.entryId &&
                                    candidate.learningVersion ===
                                        entry.learningVersion,
                            ),
                        )
                    ) {
                        batch.manifest.push({
                            exerciseId: job.resultExerciseId,
                            entryIds: linked.map((entry) => entry.entryId),
                            origin: 'generated',
                        });

                        await tx
                            .update(batches)
                            .set({ manifest: batch.manifest })
                            .where(eq(batches.id, batch.id));
                    }
                }
            }

            const [current] = await tx
                .select()
                .from(preparations)
                .where(eq(preparations.id, row.id));
            const stopping = current?.state === 'stopping';
            const failed =
                !job ||
                job.executionState === 'failed' ||
                job.executionState === 'cancelled';

            if (stopping || failed)
                await sentencePreparationSettleParent(
                    tx,
                    row,
                    context.now,
                    stopping && current!.pauseReason === 'user',
                );
            await tx
                .update(preparations)
                .set({
                    activeJobId: null,
                    state: stopping || failed ? 'paused' : 'running',
                    pauseReason: stopping
                        ? current!.pauseReason
                        : failed
                          ? job?.failureCategory === 'credits_exhausted'
                              ? 'credits'
                              : 'provider'
                          : null,
                    updatedAt: context.now,
                })
                .where(eq(preparations.id, row.id));

            return true;
        }

        if (row.currentActionId) {
            const [parent] = await tx
                .select()
                .from(accountingActions)
                .where(eq(accountingActions.id, row.currentActionId));

            if (
                parent?.state === 'active' &&
                parent.deadlineAt <= context.now
            ) {
                await sentencePreparationSettleParent(tx, row, context.now);

                await pause('budget');

                return true;
            }
        }

        const [currentPreparation] = await tx
            .select()
            .from(preparations)
            .where(eq(preparations.id, row.id));
        const lifecycleCancelled =
            currentPreparation?.pauseReason === 'access' ||
            currentPreparation?.pauseReason === 'stale';

        if (
            !accessValid ||
            lifecycleCancelled ||
            ['stopping', 'paused'].includes(currentPreparation!.state)
        ) {
            if (!accessValid || lifecycleCancelled)
                await sentencePreparationSettleParent(tx, row, context.now);
            await tx
                .update(preparations)
                .set({ state: 'paused', updatedAt: context.now })
                .where(eq(preparations.id, row.id));

            return true;
        }

        for (const batch of partitions)
            await sentencePreparationRefreshManifest(
                persistence,
                tx,
                row,
                batch,
            );
        const pending = partitions.find(
            (batch) =>
                covered(batch).size < batch.entries.length &&
                !(row.mode === 'review-only' && batch.reviewed),
        );

        if (!pending) {
            await sentencePreparationSettleParent(tx, row, context.now);

            await tx
                .update(preparations)
                .set({
                    state: 'completed',
                    pauseReason: null,
                    updatedAt: context.now,
                })
                .where(eq(preparations.id, row.id));

            return true;
        }

        if (
            row.mode !== 'review-only' &&
            !(await sentencePreparationParentAvailable(tx, row, context.now))
        ) {
            await sentencePreparationSettleParent(tx, row, context.now);

            await pause('budget');

            return true;
        }

        if (row.mode !== 'new-only') {
            const ready = covered(pending);
            let cursor = pending.scanCursor
                ? {
                      createdAt: new Date(pending.scanCursor.createdAt),
                      id: pending.scanCursor.id,
                  }
                : undefined;
            let exhausted: boolean;
            {
                const saved = await tx
                    .select()
                    .from(exercises)
                    .where(
                        and(
                            eq(exercises.dictionaryId, row.dictionaryId),
                            eq(exercises.direction, row.direction),
                            or(
                                eq(exercises.creatorId, row.learnerId),
                                eq(exercises.shared, true),
                            ),
                            sql`exists(select 1 from ${exerciseEntries} linked where linked.exercise_id=${exercises.id})`,
                            sql`not exists(select 1 from ${exerciseEntries} linked where linked.exercise_id=${exercises.id} and not (${sql.join(
                                pending.entries.map(
                                    (entry) =>
                                        sql`(linked.entry_id=${entry.entryId}::uuid and linked.learning_version=${entry.learningVersion})`,
                                ),
                                sql` or `,
                            )}))`,
                            sql`not exists(select 1 from ${personal} pv where pv.exercise_id=${exercises.id} and pv.learner_id=${row.learnerId}::uuid and pv.archived_at is not null)`,
                            sql`not exists(select 1 from ${global} gv where gv.exercise_id=${exercises.id} and gv.archived_at is not null)`,
                            cursor
                                ? sql`(${exercises.createdAt},${exercises.id})>(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id}::uuid)`
                                : sql`true`,
                        ),
                    )
                    .orderBy(asc(exercises.createdAt), asc(exercises.id))
                    .limit(100);

                exhausted = saved.length < 100;
                for (const exercise of saved) {
                    if (
                        !SentenceExerciseSchema.safeParse(
                            exercise.publicContent,
                        ).success ||
                        exercise.publicContent.sourceLanguage !==
                            row.sourceLanguage ||
                        exercise.publicContent.targetLanguage !==
                            row.targetLanguage ||
                        !sentenceLanguageMatches(
                            exercise.publicContent.sourceText,
                            row.sourceLanguage,
                            row.targetLanguage,
                        ) ||
                        !sentenceLanguageMatches(
                            exercise.referenceTranslation,
                            row.targetLanguage,
                            row.sourceLanguage,
                        ) ||
                        !(await sentencePreparationVisible(
                            tx,
                            row.learnerId,
                            exercise.id,
                        ))
                    )
                        continue;
                    const linked = await sentenceExerciseEntries(
                        tx,
                        exercise.id,
                    );

                    if (
                        !linked.length ||
                        !linked.every((entry) =>
                            pending.entries.some(
                                (candidate) =>
                                    candidate.entryId === entry.entryId &&
                                    candidate.learningVersion ===
                                        entry.learningVersion,
                            ),
                        ) ||
                        !linked.some((entry) => !ready.has(entry.entryId)) ||
                        !(await isSentenceCurrent(tx, exercise.id))
                    )
                        continue;
                    pending.manifest.push({
                        exerciseId: exercise.id,
                        entryIds: linked.map((entry) => entry.entryId),
                        origin: 'saved',
                    });

                    linked.forEach((entry) => ready.add(entry.entryId));
                    if (ready.size === pending.entries.length) break;
                }

                if (saved.length)
                    cursor = {
                        createdAt: saved.at(-1)!.createdAt,
                        id: saved.at(-1)!.id,
                    };
            }

            await tx
                .update(batches)
                .set({
                    manifest: pending.manifest,
                    scanCursor: cursor
                        ? {
                              createdAt: cursor.createdAt.toISOString(),
                              id: cursor.id,
                          }
                        : null,
                })
                .where(eq(batches.id, pending.id));

            if (ready.size === pending.entries.length) {
                await tx
                    .update(preparations)
                    .set({ state: 'running', updatedAt: context.now })
                    .where(eq(preparations.id, row.id));

                return true;
            }

            if (!exhausted) {
                await tx
                    .update(preparations)
                    .set({ state: 'running', updatedAt: context.now })
                    .where(eq(preparations.id, row.id));

                return true;
            }

            if (row.mode === 'review-only') {
                await tx
                    .update(batches)
                    .set({ reviewed: true })
                    .where(eq(batches.id, pending.id));

                await tx
                    .update(preparations)
                    .set({ state: 'running', updatedAt: context.now })
                    .where(eq(preparations.id, row.id));

                return true;
            }
        }

        try {
            // Savepoint rolls back partial reservation/admission writes before persisting pause.
            await tx.transaction(async (childTx) => {
                const { jobId } = await persistence.policy.admitGeneration(
                    childTx,
                    accessFor(row),
                    {
                        preparationId: row.id,
                        batchId: pending.id,
                        coordinatorFence: row.coordinatorFence,
                    },
                    context,
                );

                if (!jobId) throw new SentenceCreditsExhaustedError();
            });
        } catch (error) {
            if (error instanceof SentenceCreditsExhaustedError) {
                await sentencePreparationSettleParent(tx, row, context.now);

                await pause('budget');
            } else if (error instanceof SentenceCapacityUnavailableError)
                await pause('capacity');
            else if (error instanceof SentenceModelUnavailableError)
                await pause('model');
            else throw error;
        }

        context.signal.throwIfAborted();

        return true;
    });
}
