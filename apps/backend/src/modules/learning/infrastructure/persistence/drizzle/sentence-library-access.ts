import type {
    AdminSentenceLibraryItem,
    SentenceLibraryItem,
} from '@languon/contracts';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { LearningAccess } from '../../../application/ports/learning-store';
import { type SentenceLibraryAdminScope } from '../../../application/ports/sentence-library-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { SentenceUnavailableError } from '../../../domain/sentence-errors';
import type { Scope } from './sentence-library-projection';
import {
    creator,
    current,
    libraryVersion,
    versionState,
    type SentenceLibraryPersistenceContext,
} from './sentence-library-projection';
import {
    sentenceGlobalVisibilityTable as global,
    sentencePersonalVisibilityTable as personal,
} from './sentence-library-schema';
import {
    authorizeSentence,
    sentenceLearner,
    type SentenceTransaction,
} from './sentence-persistence-support';
import { sentenceExercisesTable as exercises } from './sentence-schema';

export async function sentenceLibraryAuthorize(
    persistence: SentenceLibraryPersistenceContext,
    tx: SentenceTransaction,
    access: LearningAccess | SentenceLibraryAdminScope,
    context: SentenceContext,
    write: boolean,
): Promise<Scope> {
    context.signal.throwIfAborted();
    if ('kind' in access) {
        const d = await authorizeSentence(tx, access, write);

        return {
            actorId: sentenceLearner(access),
            learnerId: sentenceLearner(access),
            dictionaryId: d.dictionary.id,
            sharedAvailable: d.dictionary.visibility === 'unlisted',
        };
    }

    if (!persistence.adminHooks) throw new SentenceUnavailableError();
    await persistence.adminHooks.authorizeAdmin(tx, access, write, context.now);
    const [d] = await tx
        .select()
        .from(dictionariesTable)
        .where(eq(dictionariesTable.id, access.dictionaryId));

    if (!d) throw new SentenceUnavailableError();
    const ids = [...new Set([access.targetUserId, d.ownerId])].sort();
    const actors = await tx
        .select({ id: usersTable.id, status: usersTable.status })
        .from(usersTable)
        .where(inArray(usersTable.id, ids))
        .orderBy(asc(usersTable.id))
        .for(write ? 'update' : 'share');

    if (
        actors.length !== ids.length ||
        actors.some(
            (a) => a.status === 'deletion_pending' || a.status === 'purged',
        )
    )
        throw new SentenceUnavailableError();
    await tx
        .select({ id: dictionariesTable.id })
        .from(dictionariesTable)
        .where(eq(dictionariesTable.id, d.id))
        .for('share');

    return {
        actorId: access.actorId,
        learnerId: access.targetUserId,
        dictionaryId: d.id,
        sharedAvailable:
            d.lifecycle === 'active' && d.visibility === 'unlisted',
        admin: access,
    };
}

export function sentenceLibraryRows(
    tx: SentenceTransaction,
    scope: Scope,
    condition: SQL,
) {
    return tx
        .select({
            exercise: exercises,
            learnerId: sql<string>`${scope.learnerId}`.as('library_learner_id'),
            personalAt: personal.archivedAt,
            globalAt: global.archivedAt,
            personalVersion: personal.version,
            globalVersion: global.version,
            creatorAt: creator.archivedAt,
            creatorVersion: creator.version,
            current: current.as('library_current'),
            versionState: versionState.as('library_version_state'),
        })
        .from(exercises)
        .leftJoin(
            personal,
            and(
                eq(personal.exerciseId, exercises.id),
                eq(personal.learnerId, scope.learnerId),
            ),
        )
        .leftJoin(global, eq(global.exerciseId, exercises.id))
        .leftJoin(
            creator,
            and(
                eq(creator.exerciseId, exercises.id),
                eq(creator.learnerId, exercises.creatorId),
            ),
        )
        .where(condition)
        .orderBy(asc(exercises.id));
}

export function sentenceLibraryMetadataRows(
    tx: SentenceTransaction,
    scope: Scope,
    condition: SQL,
) {
    return tx
        .select({
            exerciseId: exercises.id,
            creatorId: exercises.creatorId,
            learnerId: sql<string>`${scope.learnerId}`.as('library_learner_id'),
            personalAt: personal.archivedAt,
            globalAt: global.archivedAt,
            personalVersion: personal.version,
            globalVersion: global.version,
            creatorAt: creator.archivedAt,
            creatorVersion: creator.version,
            versionState: versionState.as('library_version_state'),
        })
        .from(exercises)
        .leftJoin(
            personal,
            and(
                eq(personal.exerciseId, exercises.id),
                eq(personal.learnerId, scope.learnerId),
            ),
        )
        .leftJoin(global, eq(global.exerciseId, exercises.id))
        .leftJoin(
            creator,
            and(
                eq(creator.exerciseId, exercises.id),
                eq(creator.learnerId, exercises.creatorId),
            ),
        )
        .where(condition)
        .orderBy(asc(exercises.id));
}

export function sentenceLibraryItem(
    row: Awaited<ReturnType<typeof sentenceLibraryRows>>[number],
    admin = false,
): SentenceLibraryItem | AdminSentenceLibraryItem {
    const e = row.exercise;
    const item: SentenceLibraryItem = {
        exerciseId: e.id,
        dictionaryId: e.dictionaryId,
        direction: e.direction,
        sourceLanguage: e.publicContent.sourceLanguage,
        targetLanguage: e.publicContent.targetLanguage,
        sourceText: e.publicContent.sourceText,
        createdAt: e.createdAt.toISOString(),
        personalArchivedAt: row.personalAt?.toISOString() ?? null,
        globalArchivedAt: row.globalAt?.toISOString() ?? null,
        contentState: row.current ? 'current' : 'outdated',
        version: libraryVersion({ ...row, creatorId: e.creatorId }, admin),
        sharing: e.shared ? 'shared' : 'private',
    };

    return admin
        ? {
              ...item,
              creatorId: e.creatorId,
              creatorArchived: !!row.creatorAt,
          }
        : item;
}
