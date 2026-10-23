import type {
    AdminSentenceLibraryMutationRequest,
    SentenceLibraryMutationRequest,
} from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import type { LearningAccess } from '../../../application/ports/learning-store';
import {
    SentenceLibraryDeletionBusyError,
    type SentenceLibraryAdminScope,
} from '../../../application/ports/sentence-library-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { SentenceConflictError } from '../../../domain/sentence-errors';
import {
    eraseSentenceDerivedContent,
    sentenceDeletionBusy,
} from './sentence-deletion-participant';
import {
    sentenceLibraryAuthorize,
    sentenceLibraryMetadataRows,
} from './sentence-library-access';
import {
    filterConditions,
    fingerprint,
    libraryVersion,
    type SentenceLibraryPersistenceContext,
} from './sentence-library-projection';
import {
    sentenceGlobalVisibilityTable as global,
    sentencePersonalVisibilityTable as personal,
    sentenceLibraryReceiptsTable as receipts,
    sentenceLibrarySnapshotsTable as snapshots,
    type SentenceLibrarySnapshotItem,
} from './sentence-library-schema';
import { sentenceExercisesTable as exercises } from './sentence-schema';

export async function sentenceLibraryMutateInternal(
    persistence: SentenceLibraryPersistenceContext,
    access: LearningAccess | SentenceLibraryAdminScope,
    input: SentenceLibraryMutationRequest | AdminSentenceLibraryMutationRequest,
    context: SentenceContext,
) {
    return persistence.database.transaction(async (tx) => {
        // Capacity precedes administration/user/dictionary locks, matching admission.
        if (input.operation === 'delete') await lockTextAiCapacity(tx);
        const scope = await sentenceLibraryAuthorize(
            persistence,
            tx,
            access,
            context,
            true,
        );

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
            ? await sentenceLibraryMetadataRows(
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
                const values = rows.slice(offset, offset + 500).map((row) => ({
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
                            target: [personal.learnerId, personal.exerciseId],
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
            await persistence.adminHooks!.onAdminMutation(
                tx,
                scope.admin,
                input as AdminSentenceLibraryMutationRequest,
                result,
                context.now,
            );

        return result;
    });
}
