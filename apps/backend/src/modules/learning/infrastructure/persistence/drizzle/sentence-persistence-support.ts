import { readActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DictionaryLanguageTagSchema } from '@languon/contracts';
import type {
    SentenceAttempt,
    SentenceJob,
    SentenceScope,
    SentenceDirection,
    SentenceManualReview,
} from '@languon/contracts';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type { LearningAccess } from '../../../application/ports/learning-store';
import { LearningAuthenticationRequiredError } from '../../../domain/errors';
import { SentenceUnavailableError } from '../../../domain/sentence-errors';
import {
    authorizeLearningDictionary,
    type LearningDictionary,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/dictionary-learning-participant';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { DictionaryNotFoundError } from '../../../../dictionaries/application/dictionary-errors';
import {
    dictionaryCardsTable as cards,
    dictionariesTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceExercisesTable as exercises,
    sentenceExerciseEntriesTable as entries,
    sentenceAttemptsTable as attempts,
    type sentenceManualReviewsTable as manualReviews,
    sentenceExposuresTable as exposures,
    sentenceEntryCoverageTable as coverage,
    type sentenceAiJobsTable as jobs,
} from './sentence-schema';
export type SentenceDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type SentenceTransaction = Parameters<
    Parameters<SentenceDatabase['transaction']>[0]
>[0];
export type SentenceJobRow = typeof jobs.$inferSelect;
export function sentenceLearner(access: LearningAccess): string {
    if (!access.learnerId) throw new LearningAuthenticationRequiredError();
    return access.learnerId;
}
export async function authorizeSentence(
    tx: SentenceTransaction,
    access: LearningAccess,
    write = false,
): Promise<LearningDictionary> {
    const learnerId = sentenceLearner(access);
    if (write) {
        // Lock every involved actor in one stable order before dictionary/personal
        // locks. Later credit writes can reuse these locks without an upgrade.
        const [candidate] = await tx
            .select({ ownerId: dictionariesTable.ownerId })
            .from(dictionariesTable)
            .where(
                access.kind === 'owner'
                    ? and(
                          eq(dictionariesTable.id, access.dictionaryId),
                          eq(dictionariesTable.ownerId, learnerId),
                      )
                    : eq(dictionariesTable.shareLocator, access.shareId),
            )
            .limit(1);
        if (!candidate) throw new SentenceUnavailableError();
        const ids = [...new Set([learnerId, candidate.ownerId])].sort();
        await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(inArray(usersTable.id, ids))
            .orderBy(asc(usersTable.id))
            .for('update');
    }
    try {
        return await authorizeLearningDictionary(tx, access);
    } catch (error) {
        if (error instanceof DictionaryNotFoundError)
            throw new SentenceUnavailableError();
        throw error;
    }
}
export async function lockSentenceActorBatch(
    tx: SentenceTransaction,
    rows: readonly { learnerId: string; dictionaryId: string }[],
) {
    if (!rows.length) return;
    const owners = await tx
        .select({ id: dictionariesTable.ownerId })
        .from(dictionariesTable)
        .where(
            inArray(dictionariesTable.id, [
                ...new Set(rows.map((r) => r.dictionaryId)),
            ]),
        );
    const ids = [
        ...new Set([
            ...rows.map((r) => r.learnerId),
            ...owners.map((r) => r.id),
        ]),
    ].sort();
    await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.id, ids))
        .orderBy(asc(usersTable.id))
        .for('update');
}
export async function lockSentenceLearner(tx: SentenceTransaction, id: string) {
    await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`sentence:${id}`},0))`,
    );
}
export async function sentenceCandidates(
    tx: SentenceTransaction,
    dictionaryId: string,
    scope: SentenceScope,
    direction: SentenceDirection,
    learnerId: string,
) {
    const all = await tx
        .select({
            id: cards.id,
            dictionaryId: cards.dictionaryId,
            lifecycle: cards.lifecycle,
            source: cards.source,
            translation: cards.translation,
            sortKey: cards.sortKey,
            learningVersion: cards.learningVersion,
        })
        .from(cards)
        .where(eq(cards.dictionaryId, dictionaryId))
        .orderBy(asc(cards.sortKey), asc(cards.id));
    const selected = new Set(
        scope.type === 'manual' ? scope.entryIds : all.map((c) => c.id),
    );
    if (
        scope.type === 'manual' &&
        scope.entryIds.some((id) => !all.some((c) => c.id === id))
    )
        throw new SentenceUnavailableError();
    const eligible = all.filter(
        (c) =>
            selected.has(c.id) &&
            c.lifecycle === 'active' &&
            c.source.trim() &&
            c.translation.trim(),
    );
    const counts = await tx
        .select()
        .from(coverage)
        .where(
            and(
                eq(coverage.dictionaryId, dictionaryId),
                eq(coverage.learnerId, learnerId),
                eq(coverage.direction, direction),
            ),
        );
    return {
        skippedCount: [...selected].length - eligible.length,
        candidates: eligible.map((c) => ({
            entryId: c.id,
            learningVersion: c.learningVersion,
            sourceText:
                direction === 'source-to-target' ? c.source : c.translation,
            targetText:
                direction === 'source-to-target' ? c.translation : c.source,
            sortKey: c.sortKey,
            exposureCount:
                counts.find(
                    (p) =>
                        p.entryId === c.id &&
                        p.learningVersion === c.learningVersion,
                )?.exposureCount ?? 0,
        })),
    };
}
export async function sentenceExerciseEntries(
    tx: SentenceTransaction,
    exerciseId: string,
) {
    return tx.select().from(entries).where(eq(entries.exerciseId, exerciseId));
}
export async function isSentenceCurrent(
    tx: SentenceTransaction,
    exerciseId: string,
) {
    const linked = await sentenceExerciseEntries(tx, exerciseId);
    if (!linked.length) return false;
    const current = await tx
        .select({
            id: cards.id,
            dictionaryId: cards.dictionaryId,
            lifecycle: cards.lifecycle,
            learningVersion: cards.learningVersion,
        })
        .from(cards)
        .where(
            inArray(
                cards.id,
                linked.map((e) => e.entryId),
            ),
        );
    return linked.every((e) =>
        current.some(
            (c) =>
                c.id === e.entryId &&
                c.dictionaryId === e.dictionaryId &&
                c.lifecycle === 'active' &&
                c.learningVersion === e.learningVersion,
        ),
    );
}
export async function readableExercise(
    tx: SentenceTransaction,
    id: string,
    dictionaryId: string,
    learnerId: string,
    current = false,
) {
    const [exercise] = await tx
        .select()
        .from(exercises)
        .where(
            and(eq(exercises.id, id), eq(exercises.dictionaryId, dictionaryId)),
        );
    if (
        !exercise ||
        (!exercise.shared && exercise.creatorId !== learnerId) ||
        (current && !(await isSentenceCurrent(tx, id)))
    )
        throw new SentenceUnavailableError();
    return exercise;
}
export async function exposeSentence(
    tx: SentenceTransaction,
    learnerId: string,
    exercise: typeof exercises.$inferSelect,
    now: Date,
) {
    const inserted = await tx
        .insert(exposures)
        .values({
            learnerId,
            dictionaryId: exercise.dictionaryId,
            exerciseId: exercise.id,
            createdAt: now,
        })
        .onConflictDoNothing()
        .returning();
    if (!inserted.length) return;
    const linked = await sentenceExerciseEntries(tx, exercise.id);
    for (const entry of linked)
        await tx
            .insert(coverage)
            .values({
                learnerId,
                dictionaryId: exercise.dictionaryId,
                direction: exercise.direction,
                entryId: entry.entryId,
                learningVersion: entry.learningVersion,
                exposureCount: 1,
            })
            .onConflictDoUpdate({
                target: [
                    coverage.learnerId,
                    coverage.entryId,
                    coverage.direction,
                    coverage.learningVersion,
                ],
                set: { exposureCount: sql`${coverage.exposureCount}+1` },
            });
}
export async function presentSentenceAttempt(
    tx: SentenceTransaction,
    row: typeof attempts.$inferSelect,
): Promise<SentenceAttempt> {
    const [exercise] = await tx
        .select()
        .from(exercises)
        .where(eq(exercises.id, row.exerciseId));
    if (!exercise) throw new SentenceUnavailableError();
    return {
        id: row.id,
        exercise: exercise.publicContent,
        contentState: (await isSentenceCurrent(tx, exercise.id))
            ? 'current'
            : 'outdated',
        sessionId: row.sessionId,
        answer: row.answer,
        explanationLanguage: DictionaryLanguageTagSchema.parse(
            row.explanationLanguage,
        ),
        revealedHintIds: row.revealedHintIds,
        referenceRevealed: row.referenceRevealed,
        assisted: row.revealedHintIds.length > 0 || row.referenceRevealed,
        feedback: row.feedback,
        createdAt: row.createdAt.toISOString(),
    };
}
export async function presentSentenceJob(
    tx: SentenceTransaction,
    row: SentenceJobRow,
): Promise<SentenceJob> {
    let result: SentenceJob['result'] = null;
    if (row.executionState === 'completed') {
        if (row.resultExerciseId) {
            const [exercise] = await tx
                .select()
                .from(exercises)
                .where(eq(exercises.id, row.resultExerciseId));
            if (exercise)
                result = { kind: 'exercise', exercise: exercise.publicContent };
        } else if (row.resultAttemptId) {
            const [attempt] = await tx
                .select()
                .from(attempts)
                .where(eq(attempts.id, row.resultAttemptId));
            if (attempt)
                result = {
                    kind: 'attempt',
                    attempt: await presentSentenceAttempt(tx, attempt),
                };
        }
        if (!result) throw new SentenceUnavailableError();
    }
    const actionId = usesLegacyAction(row.selectedExecutionSnapshot)
        ? (row.selectedExecutionSnapshot.actionParentId ?? row.id)
        : row.id;
    const billing = await readActionBilling(tx, actionId, row.learnerId);
    return {
        ...(billing ? { billing } : {}),
        id: row.id,
        kind: row.jobKind,
        state: row.executionState,
        cancellationRequested: row.cancellationRequestedAt !== null,
        attemptCount: row.attemptCount,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        failureCode:
            row.executionState === 'failed'
                ? (row.failureCategory as SentenceJob['failureCode'])
                : null,
        result,
    };
}

export async function presentSentenceManualReview(
    tx: SentenceTransaction,
    row: typeof manualReviews.$inferSelect,
): Promise<SentenceManualReview> {
    const exercise = await readableExercise(
        tx,
        row.exerciseId,
        row.dictionaryId,
        row.learnerId,
    );
    return {
        id: row.id,
        exercise: exercise.publicContent,
        contentState: (await isSentenceCurrent(tx, row.exerciseId))
            ? 'current'
            : 'outdated',
        sessionId: row.sessionId,
        referenceTranslation: exercise.referenceTranslation,
        createdAt: row.createdAt.toISOString(),
    };
}
