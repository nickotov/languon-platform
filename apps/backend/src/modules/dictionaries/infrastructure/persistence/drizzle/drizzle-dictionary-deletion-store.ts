import { createHash } from 'node:crypto';

import { DictionaryDeletionReceiptResponseSchema } from '@languon/contracts';
import { and, eq, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    DictionaryDeletionBusyError,
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type {
    DictionaryOperationContext,
    DictionaryStore,
} from '../../../application/ports/dictionary-store';
import {
    dictionaryAudioAssetsTable,
    dictionaryAudioBindingsTable,
    dictionaryAudioJobsTable,
} from './audio-schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryDeletionReceiptsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderUsageArchiveTable,
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
            await this.deleteContent(tx, input, ids, null);
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
            await this.deleteContent(tx, input, [input.dictionaryId], cardIds);
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

    private async deleteContent(
        tx: DictionaryTransaction,
        input: {
            context: DictionaryOperationContext;
            ownerId: string;
        },
        dictionaryIds: readonly string[],
        cardIds: readonly string[] | null,
    ): Promise<void> {
        abort(input.context);
        const directJobCondition = cardIds
            ? inArray(dictionaryGenerationJobsTable.cardId, [...cardIds])
            : inArray(dictionaryGenerationJobsTable.dictionaryId, [
                  ...dictionaryIds,
              ]);
        const directJobs = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(directJobCondition)
            .for('update');
        const relatedJobIds = new Set(directJobs.map((job) => job.id));
        if (cardIds) {
            const revisionJobs = await tx
                .select({
                    id: dictionaryCardRevisionsTable.acceptedGenerationJobId,
                })
                .from(dictionaryCardRevisionsTable)
                .where(
                    inArray(dictionaryCardRevisionsTable.cardId, [...cardIds]),
                );
            const proposalJobs = await tx
                .select({ id: dictionaryGenerationProposalsTable.jobId })
                .from(dictionaryGenerationProposalsTable)
                .where(
                    inArray(dictionaryGenerationProposalsTable.acceptedCardId, [
                        ...cardIds,
                    ]),
                );
            for (const row of [...revisionJobs, ...proposalJobs])
                if (row.id) relatedJobIds.add(row.id);
        }
        const jobs =
            relatedJobIds.size === 0
                ? []
                : await tx
                      .select()
                      .from(dictionaryGenerationJobsTable)
                      .where(
                          inArray(dictionaryGenerationJobsTable.id, [
                              ...relatedJobIds,
                          ]),
                      )
                      .for('update');
        if (
            jobs.some(
                (job) =>
                    job.executionState === 'queued' ||
                    job.executionState === 'running' ||
                    job.providerReservationState === 'active',
            )
        )
            throw new DictionaryDeletionBusyError();
        const jobIds = directJobs.map((job) => job.id);
        const contentJobIds = [...relatedJobIds];
        if (contentJobIds.length > 0) {
            const uploads = await tx
                .select()
                .from(dictionaryDocumentUploadsTable)
                .where(
                    inArray(
                        dictionaryDocumentUploadsTable.jobId,
                        contentJobIds,
                    ),
                )
                .for('update');
            if (
                uploads.some(
                    (upload) =>
                        upload.cleanupState !== 'complete' ||
                        upload.dataVersionsDeletedAt === null ||
                        upload.quotaReleasedAt === null,
                )
            )
                throw new DictionaryDeletionBusyError();
        }

        const audioCondition = cardIds
            ? inArray(dictionaryAudioJobsTable.cardId, [...cardIds])
            : inArray(dictionaryAudioJobsTable.dictionaryId, [
                  ...dictionaryIds,
              ]);
        const audioJobs = await tx
            .select()
            .from(dictionaryAudioJobsTable)
            .where(audioCondition)
            .for('update');
        if (
            audioJobs.some(
                (job) =>
                    !['ready', 'failed', 'cancelled'].includes(job.state) ||
                    (job.leaseExpiresAt !== null &&
                        job.leaseExpiresAt > input.context.now),
            )
        )
            throw new DictionaryDeletionBusyError();
        const audioJobIds = audioJobs.map((job) => job.id);
        if (audioJobIds.length > 0) {
            const assets = await tx
                .select()
                .from(dictionaryAudioAssetsTable)
                .where(
                    inArray(
                        dictionaryAudioAssetsTable.id,
                        audioJobs.map((job) => job.assetId),
                    ),
                )
                .for('update');
            if (
                assets.some(
                    (asset) =>
                        asset.writerExpiresAt !== null &&
                        asset.writerExpiresAt > input.context.now,
                )
            )
                throw new DictionaryDeletionBusyError();
            await tx
                .delete(dictionaryAudioBindingsTable)
                .where(
                    inArray(dictionaryAudioBindingsTable.jobId, audioJobIds),
                );
            await tx
                .update(dictionaryAudioJobsTable)
                .set({ state: 'cancelled', text: '' })
                .where(inArray(dictionaryAudioJobsTable.id, audioJobIds));
            await tx
                .update(dictionaryAudioAssetsTable)
                .set({ state: 'deleting' })
                .where(
                    inArray(
                        dictionaryAudioAssetsTable.id,
                        audioJobs.map((job) => job.assetId),
                    ),
                );
        }

        const settledJobs = directJobs.filter(
            (job) =>
                job.providerReservationState === 'settled' &&
                job.providerReservationSettledAt !== null &&
                job.providerActualCostMicros !== null &&
                job.providerActualInputTokens !== null &&
                job.providerActualOutputTokens !== null,
        );
        if (settledJobs.length > 0)
            await tx
                .insert(dictionaryGenerationProviderUsageArchiveTable)
                .values(
                    settledJobs.map((job) => ({
                        actualCostMicros: job.providerActualCostMicros!,
                        actualInputTokens: job.providerActualInputTokens!,
                        actualOutputTokens: job.providerActualOutputTokens!,
                        archivedAt: input.context.now,
                        id: job.id,
                        inputCostMicrosPerMillionTokens:
                            job.providerInputCostMicrosPerMillionTokens,
                        maxCostMicrosPerAttempt:
                            job.providerMaxCostMicrosPerAttempt,
                        maxInputTokensPerAttempt:
                            job.providerMaxInputTokensPerAttempt,
                        maxOutputTokensPerAttempt:
                            job.providerMaxOutputTokensPerAttempt,
                        outputCostMicrosPerMillionTokens:
                            job.providerOutputCostMicrosPerMillionTokens,
                        ownerId: job.ownerId,
                        settledAt: job.providerReservationSettledAt!,
                    })),
                )
                .onConflictDoNothing();

        if (contentJobIds.length > 0) {
            const uploadIds = await tx
                .select({ id: dictionaryDocumentUploadsTable.id })
                .from(dictionaryDocumentUploadsTable)
                .where(
                    inArray(
                        dictionaryDocumentUploadsTable.jobId,
                        contentJobIds,
                    ),
                );
            if (uploadIds.length > 0) {
                const ids = uploadIds.map((upload) => upload.id);
                await tx
                    .delete(dictionaryDocumentExtractionsTable)
                    .where(
                        inArray(
                            dictionaryDocumentExtractionsTable.uploadId,
                            ids,
                        ),
                    );
                await tx
                    .delete(dictionaryDocumentObjectVersionsTable)
                    .where(
                        inArray(
                            dictionaryDocumentObjectVersionsTable.uploadId,
                            ids,
                        ),
                    );
                await tx
                    .delete(dictionaryDocumentUploadsTable)
                    .where(inArray(dictionaryDocumentUploadsTable.id, ids));
            }
        }
        const proposalConditions: SQL[] = [];
        if (contentJobIds.length > 0)
            proposalConditions.push(
                inArray(
                    dictionaryGenerationProposalsTable.jobId,
                    contentJobIds,
                ),
            );
        if (cardIds && cardIds.length > 0)
            proposalConditions.push(
                inArray(dictionaryGenerationProposalsTable.acceptedCardId, [
                    ...cardIds,
                ]),
            );
        if (proposalConditions.length > 0)
            await tx
                .delete(dictionaryGenerationProposalsTable)
                .where(or(...proposalConditions));
        if (cardIds)
            await tx
                .delete(dictionaryCardRevisionsTable)
                .where(
                    inArray(dictionaryCardRevisionsTable.cardId, [...cardIds]),
                );
        else
            await tx
                .delete(dictionaryCardRevisionsTable)
                .where(
                    inArray(dictionaryCardRevisionsTable.dictionaryId, [
                        ...dictionaryIds,
                    ]),
                );
        if (jobIds.length > 0)
            await tx
                .delete(dictionaryGenerationJobsTable)
                .where(inArray(dictionaryGenerationJobsTable.id, jobIds));
        const retainedRelatedJobIds = [...relatedJobIds].filter(
            (id) => !jobIds.includes(id),
        );
        if (retainedRelatedJobIds.length > 0)
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    inputPayload: null,
                    updatedAt: input.context.now,
                })
                .where(
                    inArray(
                        dictionaryGenerationJobsTable.id,
                        retainedRelatedJobIds,
                    ),
                );
    }
}
