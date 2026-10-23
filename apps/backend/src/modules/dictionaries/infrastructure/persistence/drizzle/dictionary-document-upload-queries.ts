import { and, asc, eq, lte } from 'drizzle-orm';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { DictionaryDocumentUploadNotFoundError } from '../../../application/dictionary-errors';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import { type DictionaryDocumentMediaType } from '../../../domain/document-ingestion';
import { settleAiCreditAttempt } from './dictionary-document-accounting';
import type {
    DictionaryDocumentPersistenceContext,
    Transaction,
    UploadRow,
} from './dictionary-document-context';
import { abort } from './dictionary-document-validation';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import {
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
} from './schema';

export async function expireUploadAuthorizations(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['expireUploadAuthorizations']>[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        const uploads = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(
                and(
                    eq(
                        dictionaryDocumentUploadsTable.processingState,
                        'authorized',
                    ),
                    lte(
                        dictionaryDocumentUploadsTable.capabilityExpiresAt,
                        input.context.now,
                    ),
                ),
            )
            .orderBy(asc(dictionaryDocumentUploadsTable.capabilityExpiresAt))
            .limit(input.limit)
            .for('update', { skipLocked: true });

        for (const upload of uploads) {
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(eq(dictionaryGenerationJobsTable.id, upload.jobId))
                .for('update');

            if (job && usesLegacyAction(job.selectedExecutionSnapshot))
                await settleAiCreditAttempt(tx, job, input.context.now);
            if (job?.aiCreditReservationId) {
                await new DrizzleAiCreditTransactionParticipant(
                    tx,
                ).releaseUndispatchedAttempt({
                    ownerId: job.ownerId,
                    releasedAt: input.context.now,
                    reservationId: job.aiCreditReservationId,
                });
            }

            await tx
                .update(dictionaryDocumentUploadsTable)
                .set({
                    cleanupNextAttemptAt: input.context.now,
                    cleanupState: 'pending',
                    processingState: 'expired',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryDocumentUploadsTable.id, upload.id));

            await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    aiCreditReservationId: job?.aiCreditAccounted
                        ? null
                        : job?.aiCreditReservationId,
                    awaitingUploadAt: null,
                    completedAt: input.context.now,
                    executionState: 'expired',
                    inputPayload: null,
                    progressPercent: 100,
                    progressStage: 'terminal',
                    providerActualCostMicros: 0,
                    providerActualInputTokens: 0,
                    providerActualOutputTokens: 0,
                    providerReservationSettledAt: input.context.now,
                    providerReservationState: 'released',
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationJobsTable.id, upload.jobId));
        }

        return uploads.length;
    });
}

export async function readUploadAuthorization(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['readUploadAuthorization']>[0],
) {
    abort(input.context.signal);
    const [upload] = await context.database
        .select()
        .from(dictionaryDocumentUploadsTable)
        .where(
            and(
                eq(dictionaryDocumentUploadsTable.id, input.uploadId),
                eq(dictionaryDocumentUploadsTable.ownerId, input.ownerId),
            ),
        )
        .limit(1);

    if (!upload) throw new DictionaryDocumentUploadNotFoundError();
    const job = await context.generationStore.read({
        context: input.context,
        jobId: upload.jobId,
        ownerId: input.ownerId,
    });

    if (job.kind !== 'document-terms')
        throw new DictionaryDocumentUploadNotFoundError();

    return {
        capabilityExpiresAt: upload.capabilityExpiresAt,
        expectedChecksumSha256: upload.expectedChecksumSha256,
        expectedContentType:
            upload.expectedContentType as DictionaryDocumentMediaType,
        expectedSizeBytes: upload.expectedSizeBytes,
        job,
        objectKey: upload.objectKey,
        processingState: upload.processingState,
        verifiedStorageVersionId: upload.verifiedStorageVersionId,
    };
}

export async function loadDocumentUploadForWorker(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<
        DictionaryDocumentStore['loadDocumentUploadForWorker']
    >[0],
) {
    abort(input.context.signal);
    const [row] = await context.database
        .select({
            job: dictionaryGenerationJobsTable,
            upload: dictionaryDocumentUploadsTable,
        })
        .from(dictionaryGenerationJobsTable)
        .innerJoin(
            dictionaryDocumentUploadsTable,
            eq(
                dictionaryDocumentUploadsTable.jobId,
                dictionaryGenerationJobsTable.id,
            ),
        )
        .where(
            and(
                eq(dictionaryGenerationJobsTable.id, input.jobId),
                eq(dictionaryGenerationJobsTable.executionState, 'running'),
                eq(dictionaryGenerationJobsTable.workerId, input.workerId),
                eq(
                    dictionaryGenerationJobsTable.fencingToken,
                    input.fencingToken,
                ),
            ),
        )
        .limit(1);

    if (!row?.upload.verifiedStorageVersionId || !row.upload.detectedFormat)
        return null;

    return {
        checksumSha256: row.upload.verifiedChecksumSha256!,
        contentType: row.upload
            .expectedContentType as DictionaryDocumentMediaType,
        detectedFormat: row.upload.detectedFormat,
        objectKey: row.upload.objectKey,
        sizeBytes: row.upload.verifiedSizeBytes!,
        storageVersionId: row.upload.verifiedStorageVersionId,
        uploadId: row.upload.id,
    };
}

export async function persistObservedVersions(
    context: DictionaryDocumentPersistenceContext,
    tx: Transaction,
    upload: UploadRow,
    versions: Parameters<
        DictionaryDocumentStore['completeUpload']
    >[0]['versions'],
    preserveCurrent: boolean,
) {
    if (versions.length === 0) return;
    await tx.insert(dictionaryDocumentObjectVersionsTable).values(
        versions.map((version) => ({
            checksumSha256: version.checksumSha256,
            createdAt: upload.createdAt,
            id: context.ids.generate(),
            isCurrent: preserveCurrent && version.isCurrent,
            kind: version.kind,
            sizeBytes: version.sizeBytes,
            storageVersionId: version.versionId,
            uploadId: upload.id,
        })),
    );
}
