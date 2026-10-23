import type {
    AdminSentenceLibrarySnapshotRequest,
    SentenceLibrarySnapshotRequest,
} from '@languon/contracts';
import { and, isNotNull, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { LearningAccess } from '../../../application/ports/learning-store';
import { type SentenceLibraryAdminScope } from '../../../application/ports/sentence-library-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { SentenceCapacityUnavailableError } from '../../../domain/sentence-errors';
import {
    sentenceLibraryAuthorize,
    sentenceLibraryMetadataRows,
} from './sentence-library-access';
import {
    creator,
    filterConditions,
    libraryVersion,
    pruneSentenceLibrarySnapshots,
    type SentenceLibraryPersistenceContext,
} from './sentence-library-projection';
import {
    sentenceGlobalVisibilityTable as global,
    sentencePersonalVisibilityTable as personal,
    sentenceLibrarySnapshotsTable as snapshots,
} from './sentence-library-schema';

export async function sentenceLibrarySnapshotInternal(
    persistence: SentenceLibraryPersistenceContext,
    access: LearningAccess | SentenceLibraryAdminScope,
    input: SentenceLibrarySnapshotRequest | AdminSentenceLibrarySnapshotRequest,
    context: SentenceContext,
) {
    return persistence.database.transaction(async (tx) => {
        const scope = await sentenceLibraryAuthorize(
            persistence,
            tx,
            access,
            context,
            true,
        );

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
        const selected = await sentenceLibraryMetadataRows(
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
