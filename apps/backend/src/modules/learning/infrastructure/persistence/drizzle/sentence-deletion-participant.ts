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
    exerciseIds?: readonly string[];
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
    if (
        scope.exerciseIds &&
        (scope.dictionaryIds ||
            scope.entryIds ||
            scope.learnerId ||
            scope.accountPurge)
    )
        throw new Error(
            'Explicit exercise deletion cannot combine broader scopes',
        );
    const clauses: SQL[] = [];
    if (scope.exerciseIds?.length)
        clauses.push(
            sql`${exercises.id} in (select value::uuid from jsonb_array_elements_text(${JSON.stringify(scope.exerciseIds)}::jsonb))`,
        );
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
        if (
            !scope.learnerId ||
            !scope.dictionaryIds ||
            scope.entryIds?.length ||
            scope.exerciseIds?.length
        )
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
/** Preparation ownership includes captured words and saved manifests, not only a running child. */
function preparationScope(scope: SentenceDeletionScope): SQL {
    const direct: SQL[] = [];
    if (scope.learnerId)
        direct.push(sql`p.learner_id=${scope.learnerId}::uuid`);
    if (scope.dictionaryIds?.length)
        direct.push(
            sql`p.dictionary_id in (${sql.join(
                scope.dictionaryIds.map((id) => sql`${id}::uuid`),
                sql`,`,
            )})`,
        );
    const selected = sql`select id from ${exercises} where ${affectedExerciseScope(scope)}`;
    direct.push(sql`exists(select 1 from sentence_preparation_batches b where b.preparation_id=p.id and (
        exists(select 1 from jsonb_array_elements(b.manifest) item where (item->>'exerciseId')::uuid in (${selected}))
        ${
            scope.entryIds?.length
                ? sql`or exists(select 1 from jsonb_array_elements(b.entries) item where item->>'entryId' in (${sql.join(
                      scope.entryIds.map((id) => sql`${id}`),
                      sql`,`,
                  )}))`
                : sql``
        }
    ))`);
    return or(...direct)!;
}
/** Caller already holds lifecycle/capacity locks. An active reservation is busy
 * even while queued; deletion must release/settle it before removing evidence. */
export async function sentenceDeletionBusy(
    tx: SentenceTransaction,
    scope: SentenceDeletionScope,
): Promise<boolean> {
    const [activeParent] =
        await tx.execute(sql`select 1 from sentence_preparations p
        join ai_credit_actions a on a.id=p.current_action_id
        where a.state='active' and (${preparationScope(scope)}) limit 1`);
    if (activeParent) return true;
    const selected = sql`select id from ${exercises} where ${affectedExerciseScope(scope)}`;
    const deletedEntries = scope.entryIds?.length
        ? sql`item->>'entryId' in (${sql.join(
              scope.entryIds.map((id) => sql`${id}`),
              sql`,`,
          )})`
        : sql`false`;
    const copiedEntryCondition = scope.entryIds?.length
        ? sql`or exists(select 1 from jsonb_array_elements(b.entries) item where ${deletedEntries})`
        : sql``;
    const [preparationBusy] = await tx.execute(
        sql`select 1 from sentence_preparations p join sentence_ai_jobs j on j.id=p.active_job_id where (j.execution_state in ('queued','running') or j.provider_reservation_state='active') and exists(select 1 from sentence_preparation_batches b where b.preparation_id=p.id and (exists(select 1 from jsonb_array_elements(b.manifest) item where (item->>'exerciseId')::uuid in (${selected})) ${copiedEntryCondition})) limit 1`,
    );
    if (preparationBusy) return true;
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
        .set({
            cancellationRequestedAt: scope.now,
            failureCategory: 'access_revoked',
            updatedAt: scope.now,
        })
        .where(
            and(
                jobScope(scope),
                inArray(jobs.executionState, ['queued', 'running']),
            ),
        );
    // Do not acquire another learner's wallet while the lifecycle owner is locked.
    // The coordinator closes the existing authorization after child fences settle.
    await tx.execute(sql`update sentence_preparations p set
        state=case when exists(select 1 from sentence_ai_jobs j where j.id=p.active_job_id and j.execution_state in ('queued','running')) then 'stopping' else 'queued' end,
        pause_reason='access',updated_at=${scope.now.toISOString()}::timestamptz
        where (${preparationScope(scope)}) and exists(select 1 from ai_credit_actions a where a.id=p.current_action_id and a.state='active')`);
}
/** Permanent deletion erases WHOLE copied jobs and multi-entry exercises before
 * entry cascades. Coverage has no exercise FK, so deleting B leaves A's count. */
/** Remove copied preparation content without broadening selected-exercise erasure. */
async function scrubPreparationContent(
    tx: SentenceTransaction,
    scope: SentenceDeletionScope & { now: Date },
): Promise<void> {
    if (scope.accountPurge && scope.learnerId) {
        await tx.execute(
            sql`delete from sentence_personal_visibility where learner_id=${scope.learnerId}::uuid`,
        );
        await tx.execute(
            sql`update sentence_personal_visibility set actor_id=null where actor_id=${scope.learnerId}::uuid`,
        );
        await tx.execute(
            sql`update sentence_global_visibility set actor_id=null where actor_id=${scope.learnerId}::uuid`,
        );
    }
    if (scope.learnerId || scope.dictionaryIds?.length) {
        const dictionaryList = scope.dictionaryIds?.length
            ? sql`dictionary_id in (${sql.join(
                  scope.dictionaryIds.map((id) => sql`${id}::uuid`),
                  sql`,`,
              )})`
            : sql`false`;
        const learner = scope.learnerId
            ? sql`learner_id=${scope.learnerId}::uuid`
            : sql`false`;
        await tx.execute(
            sql`delete from sentence_preparations where (${learner}) or (${dictionaryList})`,
        );
        await tx.execute(
            sql`delete from sentence_library_snapshots where (${learner}) or (${dictionaryList})${scope.accountPurge ? sql` or actor_id=${scope.learnerId}::uuid` : sql``}`,
        );
        if (scope.accountPurge)
            await tx.execute(
                sql`delete from sentence_library_receipts where (${learner}) or (${dictionaryList}) or actor_id=${scope.learnerId}::uuid`,
            );
    }
    const selected = sql`select id from ${exercises} where ${affectedExerciseScope(scope)}`;
    const deletedEntries = scope.entryIds?.length
        ? sql`item->>'entryId' in (${sql.join(
              scope.entryIds.map((id) => sql`${id}`),
              sql`,`,
          )})`
        : sql`false`;
    const copiedEntryCondition = scope.entryIds?.length
        ? sql`or exists(select 1 from jsonb_array_elements(b.entries) item where ${deletedEntries})`
        : sql``;
    const relevant = sql`exists(select 1 from jsonb_array_elements(b.manifest) item where (item->>'exerciseId')::uuid in (${selected})) ${copiedEntryCondition}`;
    await tx.execute(
        sql`update sentence_preparations p set state='paused',pause_reason='stale',active_job_id=null,updated_at=${scope.now.toISOString()}::timestamptz where exists(select 1 from sentence_preparation_batches b where b.preparation_id=p.id and (${relevant}))`,
    );
    if (scope.entryIds?.length) {
        await tx.execute(
            sql`delete from sentence_preparation_batches b where (${relevant}) and not exists(select 1 from jsonb_array_elements(b.entries) item where not (${deletedEntries}))`,
        );
        await tx.execute(
            sql`update sentence_preparation_batches b set entries=(select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(b.entries) item where not (${deletedEntries})),manifest=(select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(b.manifest) item where (item->>'exerciseId')::uuid not in (${selected})) where (${relevant})`,
        );
    } else {
        await tx.execute(
            sql`update sentence_preparation_batches b set manifest=(select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(b.manifest) item where (item->>'exerciseId')::uuid not in (${selected})) where (${relevant})`,
        );
    }
    await tx.execute(
        sql`delete from sentence_library_snapshots s where exists(select 1 from jsonb_array_elements(s.items) item where (item->>'exerciseId')::uuid in (${selected}))`,
    );
}

export async function eraseSentenceDerivedContent(
    tx: SentenceTransaction,
    scope: SentenceDeletionScope & { now: Date },
): Promise<void> {
    if (await sentenceDeletionBusy(tx, scope))
        throw new Error('Sentence work is not quiescent');
    await scrubPreparationContent(tx, scope);
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
