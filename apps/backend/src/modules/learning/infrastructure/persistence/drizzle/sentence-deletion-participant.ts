import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { archiveSentenceProviderUsage } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    sentenceAiJobsTable as jobs,
    sentenceJobEntriesTable as jobEntries,
    sentenceExercisesTable as exercises,
    sentenceExerciseEntriesTable as exerciseEntries,
    sentenceEntryCoverageTable as coverage,
    sentenceNextReceiptsTable as receipts,
    sentenceAttemptsTable as attempts,
    sentenceManualReviewsTable as manualReviews,
    sentenceExposuresTable as exposures,
} from './sentence-schema';
import type { SentenceTransaction } from './sentence-persistence-support';
export interface SentenceDeletionScope {
    dictionaryIds?: readonly string[];
    entryIds?: readonly string[];
    learnerId?: string;
    /** Internal permanent account purge; caller supplies every owned dictionary. */
    accountPurge?: boolean;
}
function copiedEntryList(scope: SentenceDeletionScope) {
    return sql.join(
        (scope.entryIds ?? []).map((id) => sql`${id}::uuid`),
        sql`,`,
    );
}
function affectedExerciseScope(scope: SentenceDeletionScope): SQL {
    const clauses: SQL[] = [];
    if (scope.dictionaryIds?.length)
        clauses.push(inArray(exercises.dictionaryId, [...scope.dictionaryIds]));
    if (scope.learnerId) clauses.push(eq(exercises.creatorId, scope.learnerId));
    if (scope.entryIds?.length)
        clauses.push(
            sql`exists(select 1 from ${exerciseEntries} e where e.exercise_id=${exercises.id} and e.entry_id in (${copiedEntryList(scope)})) or exists(select 1 from ${jobs} g join ${jobEntries} p on p.job_id=g.id where g.result_exercise_id=${exercises.id} and p.entry_id in (${copiedEntryList(scope)}))`,
        );
    return or(...clauses) ?? sql`false`;
}
function jobScope(scope: SentenceDeletionScope): SQL {
    if (scope.accountPurge) {
        if (!scope.learnerId || !scope.dictionaryIds || scope.entryIds?.length)
            throw new Error('Account purge requires complete ownership scope');
        return or(
            eq(jobs.learnerId, scope.learnerId),
            scope.dictionaryIds.length
                ? inArray(jobs.dictionaryId, [...scope.dictionaryIds])
                : undefined,
        )!;
    }
    const clauses: SQL[] = [];
    if (scope.dictionaryIds?.length)
        clauses.push(inArray(jobs.dictionaryId, [...scope.dictionaryIds]));
    if (scope.learnerId) clauses.push(eq(jobs.learnerId, scope.learnerId));
    if (scope.entryIds?.length)
        clauses.push(
            sql`exists(select 1 from ${jobEntries} p where p.job_id=${jobs.id} and p.entry_id in (${copiedEntryList(scope)}))`,
        );
    clauses.push(
        sql`exists(select 1 from ${exercises} where (${exercises.id}::text=${jobs.inputPayload}->>'exerciseId' or ${exercises.id}=${jobs.resultExerciseId}) and (${affectedExerciseScope(scope)}))`,
    );
    return or(...clauses) ?? sql`false`;
}
/** Caller already holds lifecycle/capacity locks. An active reservation is busy
 * even while queued; deletion must release/settle it before removing evidence. */
export async function sentenceDeletionBusy(
    tx: SentenceTransaction,
    scope: SentenceDeletionScope,
): Promise<boolean> {
    const [busy] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
            and(
                jobScope(scope),
                or(
                    eq(jobs.executionState, 'queued'),
                    eq(jobs.executionState, 'running'),
                    eq(jobs.providerReservationState, 'active'),
                ),
            ),
        )
        .limit(1);
    return !!busy;
}
/** Internal lifecycle cancellation may be invoked after the owner became inactive.
 * It never calls public authorization or dispatches work. */
export async function requestSentenceCancellation(
    tx: SentenceTransaction,
    scope: SentenceDeletionScope & { now: Date },
): Promise<void> {
    // Lifecycle callers hold the dictionary owner lock. Never acquire foreign
    // learner/wallet locks here; capable workers settle flagged queued/running jobs.
    await tx
        .update(jobs)
        .set({ cancellationRequestedAt: scope.now, updatedAt: scope.now })
        .where(
            and(
                jobScope(scope),
                inArray(jobs.executionState, ['queued', 'running']),
            ),
        );
}
/** Permanent deletion erases WHOLE copied jobs and multi-entry exercises before
 * entry cascades. Coverage has no exercise FK, so deleting B leaves A's count. */
export async function eraseSentenceDerivedContent(
    tx: SentenceTransaction,
    scope: SentenceDeletionScope & { now: Date },
): Promise<void> {
    if (await sentenceDeletionBusy(tx, scope))
        throw new Error('Sentence work is not quiescent');
    if (scope.accountPurge)
        await tx
            .delete(receipts)
            .where(
                or(
                    eq(receipts.learnerId, scope.learnerId!),
                    scope.dictionaryIds!.length
                        ? inArray(receipts.dictionaryId, [
                              ...scope.dictionaryIds!,
                          ])
                        : undefined,
                ),
            );
    const selected = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(jobScope(scope));
    const selectedExercises = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(affectedExerciseScope(scope));
    const manualConditions: SQL[] = [];
    if (selectedExercises.length)
        manualConditions.push(
            inArray(
                manualReviews.exerciseId,
                selectedExercises.map((e) => e.id),
            ),
        );
    if (scope.learnerId)
        manualConditions.push(eq(manualReviews.learnerId, scope.learnerId));
    if (scope.dictionaryIds?.length)
        manualConditions.push(
            inArray(manualReviews.dictionaryId, [...scope.dictionaryIds]),
        );
    const erasedManuals = await tx
        .select({
            id: manualReviews.id,
            learnerId: manualReviews.learnerId,
            dictionaryId: manualReviews.dictionaryId,
            operationId: manualReviews.operationId,
            requestFingerprint: manualReviews.requestFingerprint,
        })
        .from(manualReviews)
        .where(or(...manualConditions) ?? sql`false`);
    for (const review of scope.accountPurge ? [] : erasedManuals)
        await tx
            .insert(receipts)
            .values({
                learnerId: review.learnerId,
                operationId: review.operationId,
                dictionaryId: review.dictionaryId,
                requestFingerprint: review.requestFingerprint,
                configuration: null,
                invalidatedAt: scope.now,
                createdAt: scope.now,
            })
            .onConflictDoNothing();
    if (erasedManuals.length)
        await tx.delete(manualReviews).where(
            inArray(
                manualReviews.id,
                erasedManuals.map((r) => r.id),
            ),
        );
    // Include other learners' check jobs derived from erased creator exercises.
    const derivedJobs =
        !scope.accountPurge && selectedExercises.length
            ? await tx
                  .select({ id: jobs.id })
                  .from(jobs)
                  .where(
                      sql`${jobs.inputPayload}->>'exerciseId' in (${sql.join(
                          selectedExercises.map((e) => sql`${e.id}`),
                          sql`,`,
                      )})`,
                  )
            : [];
    const ids = [...new Set([...selected, ...derivedJobs].map((j) => j.id))];
    if (ids.length) {
        const erasedJobs = scope.accountPurge
            ? []
            : await tx
                  .select({
                      learnerId: jobs.learnerId,
                      operationId: jobs.operationId,
                      dictionaryId: jobs.dictionaryId,
                      requestFingerprint: jobs.requestFingerprint,
                  })
                  .from(jobs)
                  .where(inArray(jobs.id, ids));
        // Check jobs have no Next receipt. Retain a content-free operation tombstone
        // so deletion cannot turn an old idempotency key into a fresh paid action.
        for (const job of erasedJobs)
            await tx
                .insert(receipts)
                .values({
                    learnerId: job.learnerId,
                    operationId: job.operationId,
                    dictionaryId: job.dictionaryId,
                    requestFingerprint: job.requestFingerprint,
                    configuration: null,
                    invalidatedAt: scope.now,
                    createdAt: scope.now,
                })
                .onConflictDoNothing();
        if (!scope.accountPurge)
            await tx
                .update(receipts)
                .set({
                    invalidatedAt: scope.now,
                    configuration: null,
                    jobId: null,
                    exerciseId: null,
                    emptyReason: null,
                })
                .where(inArray(receipts.jobId, ids));
        const [busy] = await tx
            .select({ id: jobs.id })
            .from(jobs)
            .where(
                and(
                    inArray(jobs.id, ids),
                    or(
                        inArray(jobs.executionState, ['queued', 'running']),
                        eq(jobs.providerReservationState, 'active'),
                    ),
                ),
            )
            .limit(1);
        if (busy) throw new Error('Derived sentence work is not quiescent');
        await archiveSentenceProviderUsage(tx, { jobIds: ids, now: scope.now });
        await tx.delete(jobs).where(inArray(jobs.id, ids));
    }
    if (selectedExercises.length && !scope.accountPurge)
        await tx
            .update(receipts)
            .set({
                invalidatedAt: scope.now,
                configuration: null,
                jobId: null,
                exerciseId: null,
                emptyReason: null,
            })
            .where(
                inArray(
                    receipts.exerciseId,
                    selectedExercises.map((e) => e.id),
                ),
            );
    if (selectedExercises.length)
        await tx.delete(exercises).where(
            inArray(
                exercises.id,
                selectedExercises.map((e) => e.id),
            ),
        );
    if (scope.learnerId) {
        await tx
            .delete(attempts)
            .where(eq(attempts.learnerId, scope.learnerId));
        await tx
            .delete(exposures)
            .where(eq(exposures.learnerId, scope.learnerId));
        await tx
            .delete(coverage)
            .where(eq(coverage.learnerId, scope.learnerId));
        await tx
            .delete(receipts)
            .where(eq(receipts.learnerId, scope.learnerId));
    }
    if (scope.dictionaryIds?.length) {
        await tx
            .delete(coverage)
            .where(inArray(coverage.dictionaryId, [...scope.dictionaryIds]));
        await tx
            .delete(receipts)
            .where(inArray(receipts.dictionaryId, [...scope.dictionaryIds]));
    }
    if (scope.entryIds?.length)
        await tx
            .delete(coverage)
            .where(inArray(coverage.entryId, [...scope.entryIds]));
}
