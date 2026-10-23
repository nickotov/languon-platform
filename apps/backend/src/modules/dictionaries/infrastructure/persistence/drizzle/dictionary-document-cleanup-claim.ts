import { and, asc, desc, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import type { DictionaryDocumentPersistenceContext } from './dictionary-document-context';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import {
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
} from './schema';

export async function claimCleanup(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['claimCleanup']>[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(
                and(
                    or(
                        and(
                            eq(
                                dictionaryDocumentUploadsTable.cleanupState,
                                'pending',
                            ),
                            lte(
                                dictionaryDocumentUploadsTable.cleanupNextAttemptAt,
                                input.context.now,
                            ),
                            isNull(
                                dictionaryDocumentUploadsTable.quotaReleasedAt,
                            ),
                        ),
                        and(
                            eq(
                                dictionaryDocumentUploadsTable.cleanupState,
                                'waiting_capability_expiry',
                            ),
                            lte(
                                dictionaryDocumentUploadsTable.capabilityExpiresAt,
                                input.context.now,
                            ),
                            isNotNull(
                                dictionaryDocumentUploadsTable.quotaReleasedAt,
                            ),
                        ),
                        and(
                            eq(
                                dictionaryDocumentUploadsTable.cleanupState,
                                'running',
                            ),
                            lte(
                                dictionaryDocumentUploadsTable.cleanupLeaseDeadline,
                                input.context.now,
                            ),
                        ),
                    ),
                ),
            )
            .orderBy(
                asc(dictionaryDocumentUploadsTable.cleanupNextAttemptAt),
                asc(dictionaryDocumentUploadsTable.id),
            )
            .limit(1)
            .for('update', { skipLocked: true });

        if (!upload) return null;
        const fencingToken = upload.cleanupFencingToken + 1n;
        const leaseDeadline = new Date(
            input.context.now.getTime() + input.leaseDurationMs,
        );

        await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupAttemptCount: Math.min(
                    upload.cleanupAttemptCount + 1,
                    100,
                ),
                cleanupFencingToken: fencingToken,
                cleanupHeartbeatAt: input.context.now,
                cleanupLeaseDeadline: leaseDeadline,
                cleanupState: 'running',
                cleanupWorkerId: input.workerId,
                updatedAt: input.context.now,
            })
            .where(eq(dictionaryDocumentUploadsTable.id, upload.id));

        const versions = await tx
            .select()
            .from(dictionaryDocumentObjectVersionsTable)
            .where(
                and(
                    eq(
                        dictionaryDocumentObjectVersionsTable.uploadId,
                        upload.id,
                    ),
                    isNull(dictionaryDocumentObjectVersionsTable.deletedAt),
                ),
            )
            .orderBy(
                desc(dictionaryDocumentObjectVersionsTable.isCurrent),
                desc(dictionaryDocumentObjectVersionsTable.createdAt),
            );

        return {
            capabilityExpiresAt: upload.capabilityExpiresAt,
            designatedTombstoneVersionId: upload.tombstoneStorageVersionId,
            fencingToken,
            jobId: upload.jobId,
            objectKey: upload.objectKey,
            phase:
                upload.dataVersionsDeletedAt &&
                input.context.now >= upload.capabilityExpiresAt
                    ? ('delete_tombstone' as const)
                    : ('delete_data' as const),
            uploadId: upload.id,
            versions: versions.map((version) => ({
                checksumSha256: version.checksumSha256,
                contentType: upload.expectedContentType,
                isCurrent: version.isCurrent,
                kind: version.kind as 'data' | 'tombstone',
                sizeBytes: version.sizeBytes,
                versionId: version.storageVersionId,
            })),
            workerId: input.workerId,
        };
    });
}
