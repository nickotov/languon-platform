import {
    AdminSentenceDictionaryResponseSchema,
    AdminSentenceLibraryListResponseSchema,
    AdminSentenceLibraryDetailSchema,
} from '@languon/contracts';
import { createHash, randomUUID } from 'node:crypto';
import {
    and,
    asc,
    eq,
    gt,
    inArray,
    isNotNull,
    isNull,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
    AdminSentenceDictionaryQuery,
    AdminSentenceLibraryItem,
    SentenceLibraryQuery,
    SentenceLibraryFilters,
    SentenceLibraryItem,
    SentenceLibrarySnapshotRequest,
    SentenceLibraryMutationRequest,
    SentenceLibraryMutationResponse,
    AdminSentenceLibraryQuery,
    AdminSentenceLibrarySnapshotRequest,
    AdminSentenceLibraryMutationRequest,
} from '@languon/contracts';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    SentenceLibraryDeletionBusyError,
    type SentenceLibraryStore,
    type SentenceLibraryAdminScope,
    type SentenceLibraryAdminDiscoveryScope,
} from '../../../application/ports/sentence-library-store';
import {
    SentenceCapacityUnavailableError,
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable as cards,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceExercisesTable as exercises,
    sentenceExerciseEntriesTable as entries,
} from './sentence-schema';
import {
    sentencePersonalVisibilityTable as personal,
    sentenceGlobalVisibilityTable as global,
    sentenceLibrarySnapshotsTable as snapshots,
    sentenceLibraryReceiptsTable as receipts,
    type SentenceLibrarySnapshotItem,
} from './sentence-library-schema';
import {
    authorizeSentence,
    sentenceLearner,
    sentenceExerciseEntries,
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    eraseSentenceDerivedContent,
    sentenceDeletionBusy,
} from './sentence-deletion-participant';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
const creator = alias(personal, 'creator_visibility');
type Scope = {
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
function fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
const current = sql<boolean>`exists(select 1 from dictionaries d where d.id=sentence_exercises.dictionary_id and d.lifecycle='active' and sentence_exercises.public_content->>'sourceLanguage'=(case when sentence_exercises.direction='source-to-target' then d.source_language_tag else d.target_language_tag end) and sentence_exercises.public_content->>'targetLanguage'=(case when sentence_exercises.direction='source-to-target' then d.target_language_tag else d.source_language_tag end)) and exists(select 1 from ${entries} e where e.exercise_id=${exercises.id}) and not exists(select 1 from ${entries} e left join ${cards} c on c.id=e.entry_id and c.dictionary_id=e.dictionary_id where e.exercise_id=${exercises.id} and (c.id is null or c.lifecycle<>'active' or c.learning_version<>e.learning_version))`;
const versionState = sql<unknown>`jsonb_build_object('dictionary',(select jsonb_build_object('lifecycle',d.lifecycle,'sourceLanguage',d.source_language_tag,'targetLanguage',d.target_language_tag) from dictionaries d where d.id=sentence_exercises.dictionary_id),'targets',(select coalesce(jsonb_agg(jsonb_build_object('entryId',e.entry_id,'expectedVersion',e.learning_version,'currentVersion',c.learning_version,'lifecycle',c.lifecycle) order by e.entry_id),'[]'::jsonb) from sentence_exercise_entries e left join dictionary_cards c on c.id=e.entry_id and c.dictionary_id=e.dictionary_id where e.exercise_id=sentence_exercises.id))`;
interface LibraryVersionRow {
    learnerId: string;
    creatorId: string;
    personalVersion: number | null;
    globalVersion: number | null;
    creatorVersion: number | null;
    versionState: unknown;
}
function libraryVersion(row: LibraryVersionRow, admin: boolean): number {
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
/** Metadata-only bounded expiry cleanup, safe for ordinary write traffic. */
export async function pruneSentenceLibrarySnapshots(
    tx: SentenceTransaction,
    now: Date,
): Promise<void> {
    await tx.execute(
        sql`delete from sentence_library_snapshots where id in (select id from sentence_library_snapshots where expires_at<=${now.toISOString()}::timestamptz order by expires_at,id limit 100 for update skip locked)`,
    );
}
function filterConditions(
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
export class DrizzleSentenceLibraryStore implements SentenceLibraryStore {
    constructor(
        private readonly database: SentenceDatabase,
        private readonly adminHooks?: SentenceLibraryAdminHooks,
    ) {}
    private async authorize(
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
        if (!this.adminHooks) throw new SentenceUnavailableError();
        await this.adminHooks.authorizeAdmin(tx, access, write, context.now);
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
    private rows(tx: SentenceTransaction, scope: Scope, condition: SQL) {
        return tx
            .select({
                exercise: exercises,
                learnerId: sql<string>`${scope.learnerId}`.as(
                    'library_learner_id',
                ),
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
    private metadataRows(
        tx: SentenceTransaction,
        scope: Scope,
        condition: SQL,
    ) {
        return tx
            .select({
                exerciseId: exercises.id,
                creatorId: exercises.creatorId,
                learnerId: sql<string>`${scope.learnerId}`.as(
                    'library_learner_id',
                ),
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
    private item(
        row: Awaited<ReturnType<DrizzleSentenceLibraryStore['rows']>>[number],
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
    private async listInternal(
        access: LearningAccess | SentenceLibraryAdminScope,
        query: SentenceLibraryQuery | AdminSentenceLibraryQuery,
        context: SentenceContext,
    ) {
        return this.database.transaction(async (tx) => {
            const scope = await this.authorize(tx, access, context, false);
            const cursor = query.cursor;
            if (
                cursor &&
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    cursor,
                )
            )
                throw new SentenceConflictError('stale_content');
            const rows = await this.rows(
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
                    .map((r) => this.item(r, !!scope.admin)),
                nextCursor:
                    rows.length > query.limit
                        ? rows[query.limit - 1]!.exercise.id
                        : null,
            };
        });
    }
    private async detailInternal(
        access: LearningAccess | SentenceLibraryAdminScope,
        exerciseId: string,
        context: SentenceContext,
    ) {
        return this.database.transaction(async (tx) => {
            const scope = await this.authorize(tx, access, context, false);
            const [row] = await this.rows(
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
                item: this.item(row, !!scope.admin),
                exercise: row.exercise.publicContent,
                referenceTranslation: row.exercise.referenceTranslation,
                requiredTargets: linked.map((e) => ({
                    entryId: e.entryId,
                    learningVersion: e.learningVersion,
                })),
            };
        });
    }
    private async snapshotInternal(
        access: LearningAccess | SentenceLibraryAdminScope,
        input:
            | SentenceLibrarySnapshotRequest
            | AdminSentenceLibrarySnapshotRequest,
        context: SentenceContext,
    ) {
        return this.database.transaction(async (tx) => {
            const scope = await this.authorize(tx, access, context, true);
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${`sentence-library-snapshots:${scope.actorId}`},0))`,
            );
            const eligible =
                input.operation === 'delete'
                    ? isNotNull(creator.archivedAt)
                    : input.operation.includes('global')
                      ? input.operation === 'global-archive'
                          ? isNull(global.archivedAt)
                          : isNotNull(global.archivedAt)
                      : input.operation === 'archive'
                        ? isNull(personal.archivedAt)
                        : isNotNull(personal.archivedAt);
            const selected = await this.metadataRows(
                tx,
                scope,
                and(filterConditions(scope, input.query), eligible)!,
            ).limit(10001);
            if (selected.length > 10000)
                throw new SentenceCapacityUnavailableError(60);
            await pruneSentenceLibrarySnapshots(tx, context.now);
            await tx.execute(
                sql`delete from sentence_library_snapshots where id in (select id from sentence_library_snapshots where actor_id=${scope.actorId}::uuid and dictionary_id=${scope.dictionaryId}::uuid order by expires_at desc,id desc offset 4 limit 100)`,
            );
            await tx.execute(
                sql`delete from sentence_library_snapshots where id in (select id from sentence_library_snapshots where actor_id=${scope.actorId}::uuid order by expires_at desc,id desc offset 24 limit 100)`,
            );
            const id = randomUUID();
            const expiresAt = new Date(context.now.getTime() + 15 * 60_000);
            await tx.insert(snapshots).values({
                id,
                actorId: scope.actorId,
                learnerId: scope.learnerId,
                dictionaryId: scope.dictionaryId,
                operation: input.operation,
                scope: scope.admin ? 'admin' : 'personal',
                items: selected.map((r) => ({
                    exerciseId: r.exerciseId,
                    version: libraryVersion(r, !!scope.admin),
                    creatorVersion: r.creatorVersion ?? 0,
                })),
                expiresAt,
            });
            return {
                snapshotToken: id,
                matchingCount: selected.length,
                expiresAt: expiresAt.toISOString(),
            };
        });
    }
    private async mutateInternal(
        access: LearningAccess | SentenceLibraryAdminScope,
        input:
            | SentenceLibraryMutationRequest
            | AdminSentenceLibraryMutationRequest,
        context: SentenceContext,
    ) {
        return this.database.transaction(async (tx) => {
            // Capacity precedes administration/user/dictionary locks, matching admission.
            if (input.operation === 'delete') await lockTextAiCapacity(tx);
            const scope = await this.authorize(tx, access, context, true);
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${`sentence-library:${scope.dictionaryId}`},0))`,
            );
            const digest = fingerprint({
                learnerId: scope.learnerId,
                dictionaryId: scope.dictionaryId,
                input,
            });
            const [prior] = await tx
                .select()
                .from(receipts)
                .where(
                    and(
                        eq(receipts.actorId, scope.actorId),
                        eq(receipts.operationId, input.operationId),
                    ),
                );
            if (prior) {
                if (prior.fingerprint !== digest)
                    throw new SentenceConflictError('operation_conflict');
                return {
                    operationId: input.operationId,
                    affectedCount: prior.affectedCount,
                };
            }
            let chosen: SentenceLibrarySnapshotItem[];
            if (input.selection.type === 'selected')
                chosen = input.selection.items.map((i) => ({
                    exerciseId: i.exerciseId,
                    version: i.expectedVersion,
                    creatorVersion: -1,
                }));
            else {
                if (
                    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                        input.selection.snapshotToken,
                    )
                )
                    throw new SentenceConflictError('stale_content');
                const [snapshot] = await tx
                    .select()
                    .from(snapshots)
                    .where(eq(snapshots.id, input.selection.snapshotToken))
                    .for('share');
                if (
                    !snapshot ||
                    snapshot.actorId !== scope.actorId ||
                    snapshot.learnerId !== scope.learnerId ||
                    snapshot.dictionaryId !== scope.dictionaryId ||
                    snapshot.operation !== input.operation ||
                    snapshot.scope !== (scope.admin ? 'admin' : 'personal') ||
                    snapshot.expiresAt <= context.now
                )
                    throw new SentenceConflictError('stale_content');
                chosen = snapshot.items;
            }
            const rows = chosen.length
                ? await this.metadataRows(
                      tx,
                      scope,
                      and(
                          sql`${exercises.id} in (select value::uuid from jsonb_array_elements_text(${JSON.stringify(chosen.map((i) => i.exerciseId))}::jsonb))`,
                          filterConditions(scope, {
                              personalArchive: 'all',
                              globalArchive: 'all',
                              contentState: 'all',
                          }),
                      )!,
                  )
                : [];
            const expectedById = new Map(chosen.map((i) => [i.exerciseId, i]));
            if (
                rows.length !== chosen.length ||
                rows.some((r) => {
                    const expected = expectedById.get(r.exerciseId)!;
                    return (
                        libraryVersion(r, !!scope.admin) !== expected.version ||
                        (input.operation === 'delete' &&
                            (!r.creatorAt ||
                                (expected.creatorVersion >= 0 &&
                                    expected.creatorVersion !==
                                        (r.creatorVersion ?? 0))))
                    );
                })
            )
                throw new SentenceConflictError('stale_content');
            if (input.operation === 'delete' && chosen.length) {
                const deletion = {
                    exerciseIds: chosen.map((i) => i.exerciseId),
                    now: context.now,
                };
                if (await sentenceDeletionBusy(tx, deletion))
                    throw new SentenceLibraryDeletionBusyError();
                await eraseSentenceDerivedContent(tx, deletion);
            } else {
                const isGlobal = input.operation.startsWith('global-');
                const archivedAt = input.operation.endsWith('archive')
                    ? context.now
                    : null;
                for (let offset = 0; offset < rows.length; offset += 500) {
                    const values = rows
                        .slice(offset, offset + 500)
                        .map((row) => ({
                            exerciseId: row.exerciseId,
                            archivedAt,
                            actorId: scope.actorId,
                            version: 1,
                            updatedAt: context.now,
                        }));
                    if (isGlobal)
                        await tx
                            .insert(global)
                            .values(values)
                            .onConflictDoUpdate({
                                target: global.exerciseId,
                                set: {
                                    archivedAt,
                                    actorId: scope.actorId,
                                    version: sql`${global.version}+1`,
                                    updatedAt: context.now,
                                },
                            });
                    else
                        await tx
                            .insert(personal)
                            .values(
                                values.map((value) => ({
                                    ...value,
                                    learnerId: scope.learnerId,
                                })),
                            )
                            .onConflictDoUpdate({
                                target: [
                                    personal.learnerId,
                                    personal.exerciseId,
                                ],
                                set: {
                                    archivedAt,
                                    actorId: scope.actorId,
                                    version: sql`${personal.version}+1`,
                                    updatedAt: context.now,
                                },
                            });
                }
            }
            const result = {
                operationId: input.operationId,
                affectedCount: chosen.length,
            };
            await tx.insert(receipts).values({
                actorId: scope.actorId,
                operationId: input.operationId,
                learnerId: scope.learnerId,
                dictionaryId: scope.dictionaryId,
                fingerprint: digest,
                affectedCount: result.affectedCount,
                createdAt: context.now,
            });
            if (scope.admin)
                await this.adminHooks!.onAdminMutation(
                    tx,
                    scope.admin,
                    input as AdminSentenceLibraryMutationRequest,
                    result,
                    context.now,
                );
            return result;
        });
    }
    async adminDictionaries(
        scope: SentenceLibraryAdminDiscoveryScope,
        query: AdminSentenceDictionaryQuery,
        context: SentenceContext,
    ) {
        return this.database.transaction(async (tx) => {
            context.signal.throwIfAborted();
            if (!this.adminHooks) throw new SentenceUnavailableError();
            await this.adminHooks.authorizeAdmin(tx, scope, false, context.now);
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
    list(a: LearningAccess, q: SentenceLibraryQuery, c: SentenceContext) {
        return this.listInternal(a, q, c);
    }
    detail(a: LearningAccess, id: string, c: SentenceContext) {
        return this.detailInternal(a, id, c);
    }
    snapshot(
        a: LearningAccess,
        i: SentenceLibrarySnapshotRequest,
        c: SentenceContext,
    ) {
        return this.snapshotInternal(a, i, c);
    }
    mutate(
        a: LearningAccess,
        i: SentenceLibraryMutationRequest,
        c: SentenceContext,
    ) {
        return this.mutateInternal(a, i, c);
    }
    adminList(
        a: SentenceLibraryAdminScope,
        q: AdminSentenceLibraryQuery,
        c: SentenceContext,
    ) {
        return this.listInternal(a, q, c).then((result) =>
            AdminSentenceLibraryListResponseSchema.parse(result),
        );
    }
    adminDetail(a: SentenceLibraryAdminScope, id: string, c: SentenceContext) {
        return this.detailInternal(a, id, c).then((result) =>
            AdminSentenceLibraryDetailSchema.parse(result),
        );
    }
    adminSnapshot(
        a: SentenceLibraryAdminScope,
        i: AdminSentenceLibrarySnapshotRequest,
        c: SentenceContext,
    ) {
        return this.snapshotInternal(a, i, c);
    }
    adminMutate(
        a: SentenceLibraryAdminScope,
        i: AdminSentenceLibraryMutationRequest,
        c: SentenceContext,
    ) {
        return this.mutateInternal(a, i, c);
    }
}
