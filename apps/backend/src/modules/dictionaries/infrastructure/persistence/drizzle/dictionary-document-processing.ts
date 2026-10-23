import { and, eq } from 'drizzle-orm';
import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import { settleAiCreditAttempt } from './dictionary-document-accounting';
import type { DictionaryDocumentPersistenceContext } from './dictionary-document-context';
import { validScanAttestation } from './dictionary-document-validation';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import {
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
} from './schema';

export async function terminalizeExtraction(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['terminalizeExtraction']>[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        if (
            !validScanAttestation(input.scanAttestation) ||
            input.scanAttestation.completedAt > input.context.now
        )
            return false;
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(workerCas(input))
            .for('update');

        if (!job || job.kind !== 'document-terms') return false;
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(eq(dictionaryDocumentUploadsTable.jobId, job.id))
            .for('update');

        if (!upload) return false;
        if (
            upload.uploadCompletedAt &&
            input.scanAttestation.completedAt < upload.uploadCompletedAt
        )
            return false;
        await tx.insert(dictionaryDocumentExtractionsTable).values({
            createdAt: input.context.now,
            failureUnitCount: 0,
            jobId: job.id,
            observedUnitCount: input.outcome === 'too_many_terms' ? 101 : 0,
            payload: null,
            payloadFingerprint: input.extractionFingerprint,
            redactedAt: input.context.now,
            state: input.outcome,
            updatedAt: input.context.now,
            uploadId: upload.id,
            validUnitCount: 0,
        });

        await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupNextAttemptAt: input.context.now,
                cleanupState: 'pending',
                processingState: 'rejected',
                scanCompletedAt: input.scanAttestation.completedAt,
                scannerEngineVersion: input.scanAttestation.engineVersion,
                scannerOutcome: 'clean',
                scannerSignatureUpdatedAt:
                    input.scanAttestation.signatureUpdatedAt,
                scannerSignatureVersion: input.scanAttestation.signatureVersion,
                terminalAt: input.context.now,
                updatedAt: input.context.now,
            })
            .where(eq(dictionaryDocumentUploadsTable.id, upload.id));

        await settleAiCreditAttempt(tx, job, input.context.now);
        const [updated] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditReservationId: job.aiCreditAccounted
                    ? null
                    : job.aiCreditReservationId,
                completedAt: input.context.now,
                executionState: 'failed',
                failureCategory: input.outcome,
                heartbeatAt: null,
                inputPayload: null,
                leaseDeadline: null,
                progressPercent: 100,
                progressStage: 'terminal',
                providerActualCostMicros:
                    Math.max(0, job.attemptCount - 1) *
                    job.providerMaxCostMicrosPerAttempt,
                providerActualInputTokens:
                    Math.max(0, job.attemptCount - 1) *
                    job.providerMaxInputTokensPerAttempt,
                providerActualOutputTokens:
                    Math.max(0, job.attemptCount - 1) *
                    job.providerMaxOutputTokensPerAttempt,
                providerReservationSettledAt: input.context.now,
                providerReservationState: 'settled',
                updatedAt: input.context.now,
                workerId: null,
            })
            .where(workerCas(input))
            .returning({ id: dictionaryGenerationJobsTable.id });

        return Boolean(updated);
    });
}

export async function recordDocumentProcessingFailure(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<
        DictionaryDocumentStore['recordDocumentProcessingFailure']
    >[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        if (
            !validScanAttestation(input.scanAttestation) ||
            input.scanAttestation.completedAt > input.context.now
        )
            return false;
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(workerCas(input))
            .for('update');

        if (!job || job.kind !== 'document-terms') return false;
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(eq(dictionaryDocumentUploadsTable.jobId, job.id))
            .for('update');

        if (!upload) return false;
        if (
            upload.uploadCompletedAt &&
            input.scanAttestation.completedAt < upload.uploadCompletedAt
        )
            return false;
        const retry = Boolean(
            input.retryAt && job.attemptCount < job.maxAttempts,
        );

        await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupNextAttemptAt: retry
                    ? upload.cleanupNextAttemptAt
                    : input.context.now,
                cleanupState: retry ? upload.cleanupState : 'pending',
                processingState: retry ? 'clean' : 'failed',
                scanCompletedAt: input.scanAttestation.completedAt,
                scannerEngineVersion: input.scanAttestation.engineVersion,
                scannerOutcome: 'clean',
                scannerSignatureUpdatedAt:
                    input.scanAttestation.signatureUpdatedAt,
                scannerSignatureVersion: input.scanAttestation.signatureVersion,
                terminalAt: retry ? null : input.context.now,
                updatedAt: input.context.now,
            })
            .where(eq(dictionaryDocumentUploadsTable.id, upload.id));

        const priorAttempts = Math.max(0, job.attemptCount - 1);
        await settleAiCreditAttempt(
            tx,
            job,
            input.context.now,
            undefined,
            'failure',
            !retry,
        );

        const [updated] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditProviderDispatchedAt:
                    job.aiCreditAccounted ||
                    usesLegacyAction(job.selectedExecutionSnapshot)
                        ? null
                        : job.aiCreditProviderDispatchedAt,
                aiCreditReservationId: job.aiCreditAccounted
                    ? null
                    : job.aiCreditReservationId,
                completedAt: retry ? null : input.context.now,
                executionState: retry ? 'queued' : 'failed',
                failureCategory: retry ? null : input.category,
                heartbeatAt: null,
                inputPayload: retry ? job.inputPayload : null,
                leaseDeadline: null,
                nextAttemptAt: input.retryAt ?? input.context.now,
                progressPercent: retry ? 0 : 100,
                progressStage: retry ? 'queued' : 'terminal',
                providerActualCostMicros: retry
                    ? null
                    : priorAttempts * job.providerMaxCostMicrosPerAttempt,
                providerActualInputTokens: retry
                    ? null
                    : priorAttempts * job.providerMaxInputTokensPerAttempt,
                providerActualOutputTokens: retry
                    ? null
                    : priorAttempts * job.providerMaxOutputTokensPerAttempt,
                providerReservationSettledAt: retry ? null : input.context.now,
                providerReservationState: retry ? 'active' : 'settled',
                updatedAt: input.context.now,
                workerId: null,
            })
            .where(workerCas(input))
            .returning({ id: dictionaryGenerationJobsTable.id });

        return Boolean(updated);
    });
}

export function workerCas(input: {
    context: { now: Date };
    fencingToken: bigint;
    jobId: string;
    workerId: string;
}) {
    return and(
        eq(dictionaryGenerationJobsTable.id, input.jobId),
        eq(dictionaryGenerationJobsTable.executionState, 'running'),
        eq(dictionaryGenerationJobsTable.workerId, input.workerId),
        eq(dictionaryGenerationJobsTable.fencingToken, input.fencingToken),
    );
}
