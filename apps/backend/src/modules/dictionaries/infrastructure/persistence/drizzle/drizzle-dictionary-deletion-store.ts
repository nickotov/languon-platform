import { deleteDictionaryContent } from './dictionary-deletion-content';
import { createHash } from 'node:crypto';

import { DictionaryDeletionReceiptResponseSchema } from '@languon/contracts';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type {
    DictionaryOperationContext,
    DictionaryStore,
} from '../../../application/ports/dictionary-store';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionaryDeletionReceiptsTable,
    dictionaryIdempotencyKeysTable,
} from './schema';

import type { DictionaryIdGenerator } from './dictionary-id-generator';
import { dictionaryGenerationAdmissionLock } from './drizzle-dictionary-generation-store';

type DictionaryDatabase = PostgresJsDatabase<typeof databaseSchema>;
type DictionaryTransaction = Parameters<
    Parameters<DictionaryDatabase['transaction']>[0]
>[0];

const idempotencyLifetimeMs = 24 * 60 * 60 * 1_000;

function abort(context: DictionaryOperationContext): void {
    context.signal.throwIfAborted();
}

function deletionSnapshot(
    targetKind: 'dictionary' | 'card',
    targets: readonly { id: string; version: number }[],
): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                targetKind,
                targets: [...targets].sort((left, right) =>
                    left.id.localeCompare(right.id),
                ),
            }),
        )
        .digest('base64url');
}

export class DrizzleDictionaryDeletionStore {
    public constructor(
        private readonly database: DictionaryDatabase,
        private readonly ids: DictionaryIdGenerator,
    ) {}

    public async previewDictionaryDeletion(
        input: Parameters<DictionaryStore['previewDictionaryDeletion']>[0],
    ) {
        abort(input.context);
        const rows = await this.database
            .select({
                id: dictionariesTable.id,
                version: dictionariesTable.version,
            })
            .from(dictionariesTable)
            .where(
                and(
                    eq(dictionariesTable.ownerId, input.ownerId),
                    eq(dictionariesTable.lifecycle, 'archived'),
                ),
            );

        return {
            eligibleCount: rows.length,
            snapshot: deletionSnapshot('dictionary', rows),
            targetKind: 'dictionary' as const,
        };
    }

    public async previewDictionaryCardDeletion(
        input: Parameters<DictionaryStore['previewDictionaryCardDeletion']>[0],
    ) {
        abort(input.context);
        const [dictionary] = await this.database
            .select({
                id: dictionariesTable.id,
                lifecycle: dictionariesTable.lifecycle,
            })
            .from(dictionariesTable)
            .where(
                and(
                    eq(dictionariesTable.id, input.dictionaryId),
                    eq(dictionariesTable.ownerId, input.ownerId),
                    eq(dictionariesTable.lifecycle, 'active'),
                ),
            )
            .limit(1);

        if (!dictionary) throw new DictionaryNotFoundError();
        const rows = await this.database
            .select({
                id: dictionaryCardsTable.id,
                version: dictionaryCardsTable.version,
            })
            .from(dictionaryCardsTable)
            .where(
                and(
                    eq(dictionaryCardsTable.dictionaryId, input.dictionaryId),
                    eq(dictionaryCardsTable.lifecycle, 'archived'),
                ),
            );

        return {
            eligibleCount: rows.length,
            snapshot: deletionSnapshot('card', rows),
            targetKind: 'card' as const,
        };
    }

    public async deleteDictionaries(
        input: Parameters<DictionaryStore['deleteDictionaries']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            await this.lockDeletion(tx, input.ownerId);
            const replay = await this.deletionReplay(tx, input, 'dictionary');
            if (replay) return replay;
            const selectedIds =
                input.request.scope.kind === 'selected'
                    ? input.request.scope.targets.map(
                          (target) => target.dictionaryId,
                      )
                    : null;
            const archived = await tx
                .select({
                    id: dictionariesTable.id,
                    version: dictionariesTable.version,
                })
                .from(dictionariesTable)
                .where(
                    and(
                        eq(dictionariesTable.ownerId, input.ownerId),
                        eq(dictionariesTable.lifecycle, 'archived'),
                        selectedIds
                            ? inArray(dictionariesTable.id, selectedIds)
                            : undefined,
                    ),
                )
                .for('update');
            const targets =
                input.request.scope.kind === 'all-archived'
                    ? archived
                    : input.request.scope.targets.map((target) => ({
                          id: target.dictionaryId,
                          version: target.expectedVersion,
                      }));

            if (
                targets.length === 0 ||
                (input.request.scope.kind === 'all-archived'
                    ? input.request.scope.snapshot !==
                      deletionSnapshot('dictionary', archived)
                    : !this.exactTargets(archived, targets))
            )
                throw new DictionaryVersionConflictError();
            const ids = targets.map((target) => target.id);
            await deleteDictionaryContent(tx, input, ids, null);
            await tx
                .update(dictionaryIdempotencyKeysTable)
                .set({
                    completedAt: input.context.now,
                    resultDictionaryId: null,
                    resultPayload: null,
                    state: 'completed',
                    updatedAt: input.context.now,
                })
                .where(
                    inArray(
                        dictionaryIdempotencyKeysTable.resultDictionaryId,
                        ids,
                    ),
                );

            await tx
                .delete(dictionariesTable)
                .where(inArray(dictionariesTable.id, ids));

            const receipt = {
                deletedCount: ids.length,
                operationId: this.ids.generate(),
                resultingDictionaryVersion: null,
                targetKind: 'dictionary' as const,
            };

            await this.saveDeletionReceipt(tx, input, receipt);

            return receipt;
        });
    }

    public async deleteDictionaryCards(
        input: Parameters<DictionaryStore['deleteDictionaryCards']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            await this.lockDeletion(tx, input.ownerId);
            const replay = await this.deletionReplay(tx, input, 'card');
            if (replay) return replay;
            const [dictionary] = await tx
                .select({
                    id: dictionariesTable.id,
                    lifecycle: dictionariesTable.lifecycle,
                    version: dictionariesTable.version,
                })
                .from(dictionariesTable)
                .where(
                    and(
                        eq(dictionariesTable.id, input.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .limit(1)
                .for('update');

            if (!dictionary || dictionary.lifecycle !== 'active')
                throw new DictionaryNotFoundError();
            if (dictionary.version !== input.request.expectedDictionaryVersion)
                throw new DictionaryVersionConflictError();
            const selectedIds =
                input.request.scope.kind === 'selected'
                    ? input.request.scope.targets.map((target) => target.cardId)
                    : null;
            const archived = await tx
                .select({
                    id: dictionaryCardsTable.id,
                    version: dictionaryCardsTable.version,
                })
                .from(dictionaryCardsTable)
                .where(
                    and(
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            input.dictionaryId,
                        ),
                        eq(dictionaryCardsTable.lifecycle, 'archived'),
                        selectedIds
                            ? inArray(dictionaryCardsTable.id, selectedIds)
                            : undefined,
                    ),
                )
                .for('update');
            const targets =
                input.request.scope.kind === 'all-archived'
                    ? archived
                    : input.request.scope.targets.map((target) => ({
                          id: target.cardId,
                          version: target.expectedVersion,
                      }));

            if (
                targets.length === 0 ||
                (input.request.scope.kind === 'all-archived'
                    ? input.request.scope.snapshot !==
                      deletionSnapshot('card', archived)
                    : !this.exactTargets(archived, targets))
            )
                throw new DictionaryVersionConflictError();
            const cardIds = targets.map((target) => target.id);
            await deleteDictionaryContent(
                tx,
                input,
                [input.dictionaryId],
                cardIds,
            );

            await tx
                .update(dictionaryIdempotencyKeysTable)
                .set({
                    completedAt: input.context.now,
                    resultDictionaryId: null,
                    resultPayload: null,
                    state: 'completed',
                    updatedAt: input.context.now,
                })
                .where(
                    and(
                        eq(
                            dictionaryIdempotencyKeysTable.ownerId,
                            input.ownerId,
                        ),
                        eq(
                            dictionaryIdempotencyKeysTable.operation,
                            'bulk_commit',
                        ),
                        eq(
                            dictionaryIdempotencyKeysTable.resultDictionaryId,
                            input.dictionaryId,
                        ),
                    ),
                );

            await tx
                .delete(dictionaryCardsTable)
                .where(inArray(dictionaryCardsTable.id, cardIds));

            const [updated] = await tx
                .update(dictionariesTable)
                .set({
                    updatedAt: input.context.now,
                    version: sql`${dictionariesTable.version} + 1`,
                })
                .where(eq(dictionariesTable.id, input.dictionaryId))
                .returning({ version: dictionariesTable.version });

            if (!updated) throw new DictionaryVersionConflictError();
            const receipt = {
                deletedCount: cardIds.length,
                operationId: this.ids.generate(),
                resultingDictionaryVersion: updated.version,
                targetKind: 'card' as const,
            };

            await this.saveDeletionReceipt(tx, input, receipt);

            return receipt;
        });
    }

    private exactTargets(
        eligible: readonly { id: string; version: number }[],
        requested: readonly { id: string; version: number }[],
    ): boolean {
        const byId = new Map(
            eligible.map((target) => [target.id, target.version]),
        );

        return requested.every(
            (target) => byId.get(target.id) === target.version,
        );
    }

    private async lockDeletion(
        tx: DictionaryTransaction,
        ownerId: string,
    ): Promise<void> {
        await tx.execute(
            sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
        );

        await tx.execute(
            sql`select ${usersTable.id} from ${usersTable} where ${usersTable.id} = ${ownerId} for update`,
        );
    }

    private async deletionReplay(
        tx: DictionaryTransaction,
        input: {
            context: DictionaryOperationContext;
            fingerprint: string;
            idempotencyKey: string;
            ownerId: string;
        },
        targetKind: 'dictionary' | 'card',
    ) {
        await tx
            .delete(dictionaryDeletionReceiptsTable)
            .where(
                and(
                    eq(dictionaryDeletionReceiptsTable.ownerId, input.ownerId),
                    eq(dictionaryDeletionReceiptsTable.targetKind, targetKind),
                    eq(
                        dictionaryDeletionReceiptsTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                    lte(
                        dictionaryDeletionReceiptsTable.expiresAt,
                        input.context.now,
                    ),
                ),
            );

        const [existing] = await tx
            .select()
            .from(dictionaryDeletionReceiptsTable)
            .where(
                and(
                    eq(dictionaryDeletionReceiptsTable.ownerId, input.ownerId),
                    eq(dictionaryDeletionReceiptsTable.targetKind, targetKind),
                    eq(
                        dictionaryDeletionReceiptsTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                ),
            )
            .limit(1);

        if (!existing) return null;
        if (existing.requestFingerprint !== input.fingerprint)
            throw new DictionaryIdempotencyConflictError();
        const parsed = DictionaryDeletionReceiptResponseSchema.safeParse(
            existing.resultPayload,
        );

        if (!parsed.success) throw new DictionaryIdempotencyConflictError();

        return parsed.data;
    }

    private async saveDeletionReceipt(
        tx: DictionaryTransaction,
        input: {
            context: DictionaryOperationContext;
            fingerprint: string;
            idempotencyKey: string;
            ownerId: string;
        },
        result: ReturnType<
            typeof DictionaryDeletionReceiptResponseSchema.parse
        >,
    ): Promise<void> {
        await tx.insert(dictionaryDeletionReceiptsTable).values({
            createdAt: input.context.now,
            expiresAt: new Date(
                input.context.now.getTime() + idempotencyLifetimeMs,
            ),
            id: result.operationId,
            idempotencyKey: input.idempotencyKey,
            ownerId: input.ownerId,
            requestFingerprint: input.fingerprint,
            resultPayload: result,
            targetKind: result.targetKind,
        });
    }
}
