import type {
    AdminSentenceDictionaryQuery,
    AdminSentenceLibraryQuery,
    SentenceLibraryQuery,
} from '@languon/contracts';
import { AdminSentenceDictionaryResponseSchema } from '@languon/contracts';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { LearningAccess } from '../../../application/ports/learning-store';
import {
    type SentenceLibraryAdminDiscoveryScope,
    type SentenceLibraryAdminScope,
} from '../../../application/ports/sentence-library-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import {
    sentenceLibraryAuthorize,
    sentenceLibraryItem,
    sentenceLibraryRows,
} from './sentence-library-access';
import {
    filterConditions,
    type SentenceLibraryPersistenceContext,
} from './sentence-library-projection';
import { sentenceExerciseEntries } from './sentence-persistence-support';
import { sentenceExercisesTable as exercises } from './sentence-schema';

export async function sentenceLibraryListInternal(
    persistence: SentenceLibraryPersistenceContext,
    access: LearningAccess | SentenceLibraryAdminScope,
    query: SentenceLibraryQuery | AdminSentenceLibraryQuery,
    context: SentenceContext,
) {
    return persistence.database.transaction(async (tx) => {
        const scope = await sentenceLibraryAuthorize(
            persistence,
            tx,
            access,
            context,
            false,
        );
        const cursor = query.cursor;
        if (
            cursor &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                cursor,
            )
        )
            throw new SentenceConflictError('stale_content');
        const rows = await sentenceLibraryRows(
            tx,
            scope,
            and(
                filterConditions(scope, query),
                cursor ? gt(exercises.id, cursor) : undefined,
            )!,
        ).limit(query.limit + 1);

        return {
            items: rows
                .slice(0, query.limit)
                .map((r) => sentenceLibraryItem(r, !!scope.admin)),
            nextCursor:
                rows.length > query.limit
                    ? rows[query.limit - 1]!.exercise.id
                    : null,
        };
    });
}

export async function sentenceLibraryDetailInternal(
    persistence: SentenceLibraryPersistenceContext,
    access: LearningAccess | SentenceLibraryAdminScope,
    exerciseId: string,
    context: SentenceContext,
) {
    return persistence.database.transaction(async (tx) => {
        const scope = await sentenceLibraryAuthorize(
            persistence,
            tx,
            access,
            context,
            false,
        );
        const [row] = await sentenceLibraryRows(
            tx,
            scope,
            and(
                eq(exercises.id, exerciseId),
                filterConditions(scope, {
                    personalArchive: 'all',
                    globalArchive: 'all',
                    contentState: 'all',
                }),
            )!,
        );

        if (!row) throw new SentenceUnavailableError();
        const linked = await sentenceExerciseEntries(tx, exerciseId);

        return {
            item: sentenceLibraryItem(row, !!scope.admin),
            exercise: row.exercise.publicContent,
            referenceTranslation: row.exercise.referenceTranslation,
            requiredTargets: linked.map((e) => ({
                entryId: e.entryId,
                learningVersion: e.learningVersion,
            })),
        };
    });
}

export async function sentenceLibraryAdminDictionaries(
    persistence: SentenceLibraryPersistenceContext,
    scope: SentenceLibraryAdminDiscoveryScope,
    query: AdminSentenceDictionaryQuery,
    context: SentenceContext,
) {
    return persistence.database.transaction(async (tx) => {
        context.signal.throwIfAborted();
        if (!persistence.adminHooks) throw new SentenceUnavailableError();
        await persistence.adminHooks.authorizeAdmin(
            tx,
            scope,
            false,
            context.now,
        );

        const [target] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, scope.targetUserId))
            .for('share');

        if (
            !target ||
            target.status === 'deletion_pending' ||
            target.status === 'purged'
        )
            throw new SentenceUnavailableError();
        if (
            query.cursor &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                query.cursor,
            )
        )
            throw new SentenceConflictError('stale_content');
        // Single-table SELECT projections dequalify Drizzle Column chunks;
        // literal outer identifiers keep these scalar subqueries correlated.
        const generated = sql<number>`(select count(*)::int from sentence_exercises e where e.dictionary_id=dictionaries.id and e.creator_id=${scope.targetUserId}::uuid)`;
        const available = sql<number>`(select count(*)::int from sentence_exercises e where e.dictionary_id=dictionaries.id and (e.creator_id=${scope.targetUserId}::uuid or (e.shared and dictionaries.lifecycle='active' and (dictionaries.owner_id=${scope.targetUserId}::uuid or dictionaries.visibility='unlisted'))) and not exists(select 1 from sentence_personal_visibility p where p.exercise_id=e.id and p.learner_id=${scope.targetUserId}::uuid and p.archived_at is not null) and not exists(select 1 from sentence_global_visibility g where g.exercise_id=e.id and g.archived_at is not null))`;
        const discovered = sql`${dictionariesTable.id} in (select id from dictionaries where owner_id=${scope.targetUserId}::uuid union select dictionary_id from sentence_exercises where creator_id=${scope.targetUserId}::uuid union select dictionary_id from sentence_exposures where learner_id=${scope.targetUserId}::uuid union select dictionary_id from sentence_preparations where learner_id=${scope.targetUserId}::uuid)`;
        const rows = await tx
            .select({
                dictionaryId: dictionariesTable.id,
                title: dictionariesTable.name,
                sourceLanguage: dictionariesTable.sourceLanguageTag,
                targetLanguage: dictionariesTable.targetLanguageTag,
                generatedCount: generated.as('generated_count'),
                availableCount: available.as('available_count'),
            })
            .from(dictionariesTable)
            .where(
                and(
                    sql`(${discovered})`,
                    query.cursor
                        ? gt(dictionariesTable.id, query.cursor)
                        : undefined,
                ),
            )
            .orderBy(asc(dictionariesTable.id))
            .limit(query.limit + 1);

        return AdminSentenceDictionaryResponseSchema.parse({
            items: rows.slice(0, query.limit),
            nextCursor:
                rows.length > query.limit
                    ? rows[query.limit - 1]!.dictionaryId
                    : null,
        });
    });
}
