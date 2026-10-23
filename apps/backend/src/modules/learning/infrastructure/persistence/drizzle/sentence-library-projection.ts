import type {
    AdminSentenceLibraryMutationRequest,
    SentenceLibraryFilters,
    SentenceLibraryMutationResponse,
} from '@languon/contracts';
import { and, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    type SentenceLibraryAdminDiscoveryScope,
    type SentenceLibraryAdminScope,
} from '../../../application/ports/sentence-library-store';
import {
    sentenceGlobalVisibilityTable as global,
    sentencePersonalVisibilityTable as personal,
} from './sentence-library-schema';
import {
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    sentenceExerciseEntriesTable as entries,
    sentenceExercisesTable as exercises,
} from './sentence-schema';

export const creator = alias(personal, 'creator_visibility');

export type Scope = {
    actorId: string;
    learnerId: string;
    dictionaryId: string;
    admin?: SentenceLibraryAdminScope;
    sharedAvailable: boolean;
};

export interface SentenceLibraryAdminHooks {
    authorizeAdmin(
        tx: SentenceTransaction,
        scope: SentenceLibraryAdminScope | SentenceLibraryAdminDiscoveryScope,
        write: boolean,
        now: Date,
    ): Promise<void>;
    onAdminMutation(
        tx: SentenceTransaction,
        scope: SentenceLibraryAdminScope,
        input: AdminSentenceLibraryMutationRequest,
        result: SentenceLibraryMutationResponse,
        now: Date,
    ): Promise<void>;
}

export function fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export const current = sql<boolean>`exists(select 1 from dictionaries d where d.id=sentence_exercises.dictionary_id and d.lifecycle='active' and sentence_exercises.public_content->>'sourceLanguage'=(case when sentence_exercises.direction='source-to-target' then d.source_language_tag else d.target_language_tag end) and sentence_exercises.public_content->>'targetLanguage'=(case when sentence_exercises.direction='source-to-target' then d.target_language_tag else d.source_language_tag end)) and exists(select 1 from ${entries} e where e.exercise_id=${exercises.id}) and not exists(select 1 from ${entries} e left join ${cards} c on c.id=e.entry_id and c.dictionary_id=e.dictionary_id where e.exercise_id=${exercises.id} and (c.id is null or c.lifecycle<>'active' or c.learning_version<>e.learning_version))`;

export const versionState = sql<unknown>`jsonb_build_object('dictionary',(select jsonb_build_object('lifecycle',d.lifecycle,'sourceLanguage',d.source_language_tag,'targetLanguage',d.target_language_tag) from dictionaries d where d.id=sentence_exercises.dictionary_id),'targets',(select coalesce(jsonb_agg(jsonb_build_object('entryId',e.entry_id,'expectedVersion',e.learning_version,'currentVersion',c.learning_version,'lifecycle',c.lifecycle) order by e.entry_id),'[]'::jsonb) from sentence_exercise_entries e left join dictionary_cards c on c.id=e.entry_id and c.dictionary_id=e.dictionary_id where e.exercise_id=sentence_exercises.id))`;

export interface LibraryVersionRow {
    learnerId: string;
    creatorId: string;
    personalVersion: number | null;
    globalVersion: number | null;
    creatorVersion: number | null;
    versionState: unknown;
}

export function libraryVersion(row: LibraryVersionRow, admin: boolean): number {
    return Number.parseInt(
        fingerprint({
            personal: row.personalVersion ?? 0,
            global: row.globalVersion ?? 0,
            creator:
                admin && row.creatorId !== row.learnerId
                    ? (row.creatorVersion ?? 0)
                    : 0,
            content: row.versionState,
        }).slice(0, 13),
        16,
    );
}

export async function pruneSentenceLibrarySnapshots(
    tx: SentenceTransaction,
    now: Date,
): Promise<void> {
    await tx.execute(
        sql`delete from sentence_library_snapshots where id in (select id from sentence_library_snapshots where expires_at<=${now.toISOString()}::timestamptz order by expires_at,id limit 100 for update skip locked)`,
    );
}

export function filterConditions(
    scope: Scope,
    q: SentenceLibraryFilters & {
        relation?: string | undefined;
        creatorArchived?: boolean | undefined;
        creatorId?: string | undefined;
    },
): SQL {
    const available = or(
        eq(exercises.creatorId, scope.learnerId),
        scope.sharedAvailable ? eq(exercises.shared, true) : undefined,
    )!;
    const conditions = [
        eq(exercises.dictionaryId, scope.dictionaryId),
        q.relation === 'generated'
            ? eq(exercises.creatorId, scope.learnerId)
            : q.relation === 'available'
              ? available
              : available,
    ];

    if (q.direction) conditions.push(eq(exercises.direction, q.direction));
    if (scope.admin && q.creatorId)
        conditions.push(eq(exercises.creatorId, q.creatorId));
    if (q.personalArchive !== 'all')
        conditions.push(
            q.personalArchive === 'archived'
                ? isNotNull(personal.archivedAt)
                : isNull(personal.archivedAt),
        );
    if (q.globalArchive !== 'all')
        conditions.push(
            q.globalArchive === 'archived'
                ? isNotNull(global.archivedAt)
                : isNull(global.archivedAt),
        );
    if (scope.admin && q.creatorArchived !== undefined)
        conditions.push(
            q.creatorArchived
                ? isNotNull(creator.archivedAt)
                : isNull(creator.archivedAt),
        );
    if (q.contentState !== 'all')
        conditions.push(
            q.contentState === 'current' ? current : sql`not (${current})`,
        );

    return and(...conditions)!;
}

export interface SentenceLibraryPersistenceContext {
    database: SentenceDatabase;
    adminHooks: SentenceLibraryAdminHooks | undefined;
}
