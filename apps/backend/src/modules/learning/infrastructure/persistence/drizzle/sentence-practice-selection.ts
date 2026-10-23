import type {
    SentenceDirection,
    SentenceNextRequest,
    SentencePrepareRequest,
} from '@languon/contracts';
import { SENTENCE_LIMITS, SentenceExerciseSchema } from '@languon/contracts';
import { and, asc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { LearningInvalidRequestError } from '../../../domain/errors';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import { sentencePracticeVisibilityCondition } from './sentence-library-visibility';
import {
    sentenceCandidates,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    languageCondition,
    type SentencePracticePersistenceContext,
} from './sentence-practice-context';
import {
    sentenceAttemptsTable as attempts,
    sentenceExerciseEntriesTable as exerciseEntries,
    sentenceExercisesTable as exercises,
    sentenceManualReviewsTable as manualReviews,
} from './sentence-schema';

export async function sentencePracticePool(
    tx: SentenceTransaction,
    dictionary: {
        id: string;
        sourceLanguageTag: string;
        targetLanguageTag: string;
    },
    learnerId: string,
    direction: SentenceDirection,
    scope: SentencePrepareRequest['scope'],
    selection?: Pick<SentenceNextRequest, 'mode' | 'visitedExerciseIds'>,
    replayExerciseIds: readonly string[] = [],
    manifestExerciseIds?: readonly string[],
) {
    const dictionaryId = dictionary.id;
    const sourceLanguage =
        direction === 'source-to-target'
            ? dictionary.sourceLanguageTag
            : dictionary.targetLanguageTag;
    const targetLanguage =
        direction === 'source-to-target'
            ? dictionary.targetLanguageTag
            : dictionary.sourceLanguageTag;
    const { candidates: eligibleCandidates, skippedCount } =
        await sentenceCandidates(tx, dictionaryId, scope, direction, learnerId);
    // Keep a stable batch across prepare, saved reuse and fresh generation.
    // Lifetime dictionary progress deliberately uses the full candidate set.
    const candidates = eligibleCandidates.slice(
        0,
        SENTENCE_LIMITS.selectedEntries,
    );
    const checked = sql<boolean>`exists(select 1 from ${attempts} a where a.exercise_id=${exercises.id} and a.learner_id=${learnerId}::uuid) or exists(select 1 from ${manualReviews} r where r.exercise_id=${exercises.id} and r.learner_id=${learnerId}::uuid)`;
    // Exact replay keeps the original bounded sequence even if All's stable
    // default batch changed; explicit manual scope remains authoritative.
    const validFor = (validCandidates: typeof candidates) =>
        and(
            eq(exercises.dictionaryId, dictionaryId),
            eq(exercises.direction, direction),
            sentencePracticeVisibilityCondition(learnerId),
            manifestExerciseIds
                ? manifestExerciseIds.length
                    ? inArray(exercises.id, [...manifestExerciseIds])
                    : sql`false`
                : undefined,
            sql`${exercises.publicContent}->>'sourceLanguage' = ${sourceLanguage} and ${exercises.publicContent}->>'targetLanguage' = ${targetLanguage}`,
            languageCondition(
                sql`${exercises.publicContent}->>'sourceText'`,
                sourceLanguage,
                targetLanguage,
            ),
            languageCondition(
                sql`${exercises.referenceTranslation}`,
                targetLanguage,
                sourceLanguage,
            ),
            or(eq(exercises.shared, true), eq(exercises.creatorId, learnerId)),
            validCandidates.length
                ? sql`exists(select 1 from ${exerciseEntries} e where e.exercise_id=${exercises.id}) and not exists(select 1 from ${exerciseEntries} e left join ${cards} c on c.id=e.entry_id and c.dictionary_id=e.dictionary_id where e.exercise_id=${exercises.id} and (c.id is null or c.learning_version<>e.learning_version or c.lifecycle<>'active' or e.entry_id not in (${sql.join(
                      validCandidates.map((c) => sql`${c.entryId}::uuid`),
                      sql`,`,
                  )})))`
                : sql`false`,
        );
    const valid = validFor(candidates);
    const replayExercises = replayExerciseIds.length
        ? await tx
              .select()
              .from(exercises)
              .where(
                  and(
                      validFor(eligibleCandidates),
                      inArray(exercises.id, [...replayExerciseIds]),
                  ),
              )
        : [];

    if (replayExercises.length !== replayExerciseIds.length)
        throw new SentenceConflictError('stale_content');
    if (
        replayExercises.some(
            (exercise) =>
                !SentenceExerciseSchema.safeParse(exercise.publicContent)
                    .success,
        )
    )
        throw new SentenceConflictError('stale_content');
    const replayTargetIds = new Set(
        replayExercises.flatMap((exercise) =>
            exercise.publicContent.segments.flatMap((segment) =>
                segment.target ? [segment.target.entryId] : [],
            ),
        ),
    );

    if (replayTargetIds.size > SENTENCE_LIMITS.selectedEntries)
        throw new LearningInvalidRequestError();

    const covered = selection?.visitedExerciseIds.length
        ? await tx
              .selectDistinct({ entryId: exerciseEntries.entryId })
              .from(exerciseEntries)
              .innerJoin(
                  exercises,
                  eq(exercises.id, exerciseEntries.exerciseId),
              )
              .where(
                  and(
                      valid,
                      inArray(exercises.id, selection.visitedExerciseIds),
                  ),
              )
        : [];
    const coveredIds = new Set(covered.map((entry) => entry.entryId));
    const remaining = candidates.filter(
        (candidate) => !coveredIds.has(candidate.entryId),
    );
    const [counts] = await tx
        .select({
            review: sql<number>`count(*)::int`,
            unchecked: sql<number>`count(*) filter(where not (${checked}))::int`,
        })
        .from(exercises)
        .where(valid);
    const [saved] =
        selection && selection.mode !== 'new-only'
            ? await tx
                  .select()
                  .from(exercises)
                  .where(
                      and(
                          valid,
                          remaining.length
                              ? sql`exists(select 1 from ${exerciseEntries} needed where needed.exercise_id=${exercises.id} and needed.entry_id in (${sql.join(
                                    remaining.map(
                                        (entry) => sql`${entry.entryId}::uuid`,
                                    ),
                                    sql`,`,
                                )}))`
                              : sql`false`,
                          selection.visitedExerciseIds.length
                              ? notInArray(
                                    exercises.id,
                                    selection.visitedExerciseIds,
                                )
                              : undefined,
                      ),
                  )
                  .orderBy(asc(exercises.createdAt), asc(exercises.id))
                  .limit(1)
            : [];

    return {
        candidates,
        replayExercises,
        remaining,
        skippedCount,
        saved,
        savedReviewCount: counts?.review ?? 0,
        savedUncheckedCount: counts?.unchecked ?? 0,
    };
}

export async function sentencePracticePreparedSelection(
    persistence: SentencePracticePersistenceContext,
    tx: SentenceTransaction,
    access: LearningAccess,
    input: SentencePrepareRequest,
    context: SentenceContext,
) {
    if (!input.preparedBatchId) return undefined;
    if (!persistence.policy.resolvePreparedBatch)
        throw new SentenceUnavailableError();
    const batch = await persistence.policy.resolvePreparedBatch(
        tx,
        access,
        input.preparedBatchId,
        context,
    );

    if (
        batch.direction !== input.direction ||
        (input.scope.type === 'manual' &&
            input.scope.entryIds.some((id) => !batch.entryIds.includes(id)))
    )
        throw new SentenceConflictError('stale_content');
    const requested =
        input.scope.type === 'manual'
            ? new Set(input.scope.entryIds)
            : undefined;

    return {
        ...batch,
        scope: {
            type: 'manual' as const,
            entryIds: batch.preparedEntryIds.filter(
                (id) => !requested || requested.has(id),
            ),
        },
    };
}
