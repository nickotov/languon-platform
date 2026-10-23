import { and, count, eq, isNull } from 'drizzle-orm';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import { cleanupCas } from './dictionary-document-cleanup-completion';
import type { DictionaryDocumentPersistenceContext } from './dictionary-document-context';
import { publishStagedDocumentProposal } from './dictionary-document-proposal';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import {
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
} from './schema';

export async function recordCleanupTombstone(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['recordCleanupTombstone']>[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(cleanupCas(input))
            .for('update');

        if (!upload) return false;
        await tx
            .update(dictionaryDocumentObjectVersionsTable)
            .set({ isCurrent: false })
            .where(
                eq(dictionaryDocumentObjectVersionsTable.uploadId, upload.id),
            );

        await tx
            .insert(dictionaryDocumentObjectVersionsTable)
            .values({
                checksumSha256: '0'.repeat(64),
                createdAt: input.context.now,
                id: context.ids.generate(),
                isCurrent: true,
                kind: 'tombstone',
                sizeBytes: 0,
                storageVersionId: input.storageVersionId,
                uploadId: upload.id,
            })
            .onConflictDoUpdate({
                set: { deletedAt: null, isCurrent: true },
                target: [
                    dictionaryDocumentObjectVersionsTable.uploadId,
                    dictionaryDocumentObjectVersionsTable.storageVersionId,
                ],
            });

        const [updated] = await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                tombstoneCreatedAt: input.context.now,
                tombstoneStorageVersionId: input.storageVersionId,
                updatedAt: input.context.now,
            })
            .where(cleanupCas(input))
            .returning({ id: dictionaryDocumentUploadsTable.id });

        return Boolean(updated);
    });
}

export async function recordDataVersionsDeleted(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['recordDataVersionsDeleted']>[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(cleanupCas(input))
            .for('update');

        if (!upload?.tombstoneCreatedAt) return false;
        const deletedDataVersions = input.deletedVersions.filter(
            (version) => version.kind === 'data',
        );
        const existingVersions = await tx
            .select()
            .from(dictionaryDocumentObjectVersionsTable)
            .where(
                eq(dictionaryDocumentObjectVersionsTable.uploadId, upload.id),
            );
        const existingVersionIds = new Set(
            existingVersions.map((version) => version.storageVersionId),
        );
        const newlyObserved = deletedDataVersions.filter(
            (version) => !existingVersionIds.has(version.versionId),
        );

        if (newlyObserved.length)
            await tx.insert(dictionaryDocumentObjectVersionsTable).values(
                newlyObserved.map((version) => ({
                    checksumSha256: version.checksumSha256,
                    createdAt: input.context.now,
                    deletedAt: input.context.now,
                    id: context.ids.generate(),
                    isCurrent: false,
                    kind: 'data' as const,
                    sizeBytes: version.sizeBytes,
                    storageVersionId: version.versionId,
                    uploadId: upload.id,
                })),
            );
        // The cleanup coordinator reaches this fence only after a complete
        // provider listing and successful deletion of every data version.
        // Mark all tracked data absent so a crash after physical deletion
        // but before this transaction can recover from an empty re-list.
        await tx
            .update(dictionaryDocumentObjectVersionsTable)
            .set({ deletedAt: input.context.now, isCurrent: false })
            .where(
                and(
                    eq(
                        dictionaryDocumentObjectVersionsTable.uploadId,
                        upload.id,
                    ),
                    eq(dictionaryDocumentObjectVersionsTable.kind, 'data'),
                ),
            );

        const [remaining] = await tx
            .select({ value: count() })
            .from(dictionaryDocumentObjectVersionsTable)
            .where(
                and(
                    eq(
                        dictionaryDocumentObjectVersionsTable.uploadId,
                        upload.id,
                    ),
                    eq(dictionaryDocumentObjectVersionsTable.kind, 'data'),
                    isNull(dictionaryDocumentObjectVersionsTable.deletedAt),
                ),
            );

        if (Number(remaining?.value ?? 0) > 0) return false;
        const observedPhysicalBytes = [
            ...existingVersions.filter((version) => version.kind === 'data'),
            ...newlyObserved,
        ].reduce((total, version) => total + version.sizeBytes, 0);
        const [updated] = await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupHeartbeatAt: null,
                cleanupLeaseDeadline: null,
                cleanupState: 'waiting_capability_expiry',
                cleanupWorkerId: null,
                dataVersionsDeletedAt: input.context.now,
                accountedPhysicalBytes: Math.max(
                    upload.accountedPhysicalBytes,
                    observedPhysicalBytes,
                ),
                observedPhysicalBytes: Math.max(
                    upload.observedPhysicalBytes,
                    observedPhysicalBytes,
                ),
                quotaReleasedAt: input.context.now,
                updatedAt: input.context.now,
            })
            .where(cleanupCas(input))
            .returning({ id: dictionaryDocumentUploadsTable.id });

        if (updated)
            await publishStagedDocumentProposal(
                tx,
                upload.jobId,
                input.context.now,
            );

        return Boolean(updated);
    });
}
