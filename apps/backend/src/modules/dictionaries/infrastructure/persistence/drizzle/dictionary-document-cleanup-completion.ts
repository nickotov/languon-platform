import { and, eq } from 'drizzle-orm';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import type { DictionaryDocumentPersistenceContext } from './dictionary-document-context';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import {
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
} from './schema';

export async function completeCleanup(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['completeCleanup']>[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(cleanupCas(input))
            .for('update');

        if (
            !upload ||
            input.context.now < upload.capabilityExpiresAt ||
            upload.tombstoneStorageVersionId !==
                input.deletedTombstoneVersionId ||
            !upload.dataVersionsDeletedAt
        )
            return false;
        await tx
            .update(dictionaryDocumentObjectVersionsTable)
            .set({ deletedAt: input.context.now, isCurrent: false })
            .where(
                and(
                    eq(
                        dictionaryDocumentObjectVersionsTable.uploadId,
                        upload.id,
                    ),
                    eq(
                        dictionaryDocumentObjectVersionsTable.storageVersionId,
                        input.deletedTombstoneVersionId,
                    ),
                ),
            );

        const [updated] = await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupCompletedAt: input.context.now,
                cleanupHeartbeatAt: null,
                cleanupLeaseDeadline: null,
                cleanupState: 'complete',
                cleanupWorkerId: null,
                quotaReleasedAt: input.context.now,
                updatedAt: input.context.now,
            })
            .where(cleanupCas(input))
            .returning({ id: dictionaryDocumentUploadsTable.id });

        return Boolean(updated);
    });
}

export async function failCleanup(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['failCleanup']>[0],
) {
    const [updated] = await context.database
        .update(dictionaryDocumentUploadsTable)
        .set({
            cleanupFailureCategory: input.failureCategory,
            cleanupHeartbeatAt: null,
            cleanupLeaseDeadline: null,
            cleanupNextAttemptAt: input.retryAt,
            cleanupState: 'pending',
            cleanupWorkerId: null,
            updatedAt: input.context.now,
        })
        .where(cleanupCas(input))
        .returning({ id: dictionaryDocumentUploadsTable.id });

    return Boolean(updated);
}

export async function heartbeatCleanup(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['heartbeatCleanup']>[0],
) {
    const [updated] = await context.database
        .update(dictionaryDocumentUploadsTable)
        .set({
            cleanupHeartbeatAt: input.context.now,
            cleanupLeaseDeadline: input.nextLeaseDeadline,
            updatedAt: input.context.now,
        })
        .where(cleanupCas(input))
        .returning({ id: dictionaryDocumentUploadsTable.id });

    return Boolean(updated);
}

export function cleanupCas(input: {
    fencingToken: bigint;
    uploadId: string;
    workerId: string;
}) {
    return and(
        eq(dictionaryDocumentUploadsTable.id, input.uploadId),
        eq(dictionaryDocumentUploadsTable.cleanupState, 'running'),
        eq(dictionaryDocumentUploadsTable.cleanupWorkerId, input.workerId),
        eq(
            dictionaryDocumentUploadsTable.cleanupFencingToken,
            input.fencingToken,
        ),
    );
}
