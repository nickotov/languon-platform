import { and, asc, eq } from 'drizzle-orm';
import {
    settleLegacyAction,
    usesLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import { dictionaryGenerationProviderUsageCostMicros } from '../../../application/ports/dictionary-generation-provider-policy';
import {
    createDictionaryBatchDuplicateWarnings,
    parseDictionaryBatchGenerationProposal,
} from '../../../domain/batch-generation';
import { settleAiCreditAttempt } from './dictionary-document-accounting';
import type {
    DictionaryDocumentPersistenceContext,
    Transaction,
} from './dictionary-document-context';
import { workerCas } from './dictionary-document-processing';
import { validScanAttestation } from './dictionary-document-validation';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import {
    dictionaryCardsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
} from './schema';

export async function stageDocumentProposal(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['stageDocumentProposal']>[0],
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
        if (
            !Number.isSafeInteger(input.providerUsage.inputTokens) ||
            input.providerUsage.inputTokens < 0 ||
            input.providerUsage.inputTokens >
                job.providerMaxInputTokensPerAttempt ||
            !Number.isSafeInteger(input.providerUsage.outputTokens) ||
            input.providerUsage.outputTokens < 0 ||
            input.providerUsage.outputTokens >
                job.providerMaxOutputTokensPerAttempt
        )
            throw new Error('Invalid document provider usage');
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
        const parsedProposal = parseDictionaryBatchGenerationProposal(
            input.proposal,
        );

        if (
            parsedProposal.candidates.length +
                parsedProposal.failures.length !==
            input.observedUnitCount
        )
            throw new Error(
                'Document proposal rows do not match extracted unit count',
            );
        const existingSources = await tx
            .select({
                cardId: dictionaryCardsTable.id,
                source: dictionaryCardsTable.source,
            })
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId))
            .orderBy(
                asc(dictionaryCardsTable.sortKey),
                asc(dictionaryCardsTable.id),
            );
        const proposal = parseDictionaryBatchGenerationProposal({
            ...parsedProposal,
            warnings: createDictionaryBatchDuplicateWarnings(
                parsedProposal.candidates.map((candidate) => ({
                    input: candidate.candidate.values.source,
                    rowIndex: candidate.rowIndex,
                })),
                existingSources,
            ),
        });

        await tx.insert(dictionaryGenerationProposalsTable).values({
            createdAt: input.context.now,
            documentStagedAt: input.context.now,
            expiresAt: input.reviewExpiresAt,
            jobId: job.id,
            payload: proposal,
            reviewState: 'reviewable',
            stagedProviderCostMicros:
                Math.max(0, job.attemptCount - 1) *
                    job.providerMaxCostMicrosPerAttempt +
                dictionaryGenerationProviderUsageCostMicros(
                    {
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
                    },
                    input.providerUsage,
                ),
            stagedProviderInputTokens:
                Math.max(0, job.attemptCount - 1) *
                    job.providerMaxInputTokensPerAttempt +
                input.providerUsage.inputTokens,
            stagedProviderOutputTokens:
                Math.max(0, job.attemptCount - 1) *
                    job.providerMaxOutputTokensPerAttempt +
                input.providerUsage.outputTokens,
            updatedAt: input.context.now,
        });

        await tx.insert(dictionaryDocumentExtractionsTable).values({
            createdAt: input.context.now,
            failureUnitCount: input.failureUnitCount,
            jobId: job.id,
            observedUnitCount: input.observedUnitCount,
            payload: null,
            payloadFingerprint: input.extractionFingerprint,
            proposalJobId: job.id,
            redactedAt: input.context.now,
            state: 'proposed',
            updatedAt: input.context.now,
            uploadId: upload.id,
            validUnitCount: input.validUnitCount,
        });

        await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupNextAttemptAt: input.context.now,
                cleanupState: 'pending',
                processingState: 'proposed',
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

        await settleAiCreditAttempt(
            tx,
            job,
            input.context.now,
            input.providerUsage,
            'success',
            false,
        );

        const [updated] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditReservationId: job.aiCreditAccounted
                    ? null
                    : job.aiCreditReservationId,
                executionState: 'queued',
                heartbeatAt: null,
                leaseDeadline: null,
                progressPercent: 95,
                progressStage: 'cleaning',
                updatedAt: input.context.now,
                workerId: null,
            })
            .where(workerCas(input))
            .returning({ id: dictionaryGenerationJobsTable.id });

        return Boolean(updated);
    });
}

export async function publishDocumentProposalAfterCleanup(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<
        DictionaryDocumentStore['publishDocumentProposalAfterCleanup']
    >[0],
) {
    return context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(
                and(
                    eq(dictionaryDocumentUploadsTable.id, input.uploadId),
                    eq(dictionaryDocumentUploadsTable.jobId, input.jobId),
                    eq(
                        dictionaryDocumentUploadsTable.cleanupFencingToken,
                        input.fencingToken,
                    ),
                ),
            )
            .for('share');

        if (
            !upload?.dataVersionsDeletedAt ||
            !['waiting_capability_expiry', 'complete'].includes(
                upload.cleanupState,
            )
        )
            return false;
        const [proposal] = await tx
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(eq(dictionaryGenerationProposalsTable.jobId, input.jobId))
            .for('update');

        if (!proposal?.documentStagedAt) return false;
        if (proposal.documentPublishedAt) return true;
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, input.jobId))
            .for('update');

        if (
            !job ||
            job.cancellationRequestedAt ||
            ['cancelled', 'failed', 'expired'].includes(job.executionState)
        )
            return false;
        if (usesLegacyAction(job.selectedExecutionSnapshot))
            await settleLegacyAction(tx, {
                id: job.id,
                ownerId: job.ownerId,
                outcome: 'success',
                at: input.context.now,
            });

        await tx
            .update(dictionaryGenerationProposalsTable)
            .set({
                documentPublishedAt: input.context.now,
                updatedAt: input.context.now,
            })
            .where(eq(dictionaryGenerationProposalsTable.jobId, input.jobId));

        const [updated] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                completedAt: input.context.now,
                executionState: 'completed',
                heartbeatAt: null,
                inputPayload: null,
                leaseDeadline: null,
                progressPercent: 100,
                progressStage: 'review_ready',
                providerActualCostMicros: proposal.stagedProviderCostMicros,
                providerActualInputTokens: proposal.stagedProviderInputTokens,
                providerActualOutputTokens: proposal.stagedProviderOutputTokens,
                providerReservationSettledAt: input.context.now,
                providerReservationState: 'settled',
                updatedAt: input.context.now,
                workerId: null,
            })
            .where(eq(dictionaryGenerationJobsTable.id, input.jobId))
            .returning({ id: dictionaryGenerationJobsTable.id });

        return Boolean(updated);
    });
}

export async function publishStagedDocumentProposal(
    tx: Transaction,
    jobId: string,
    now: Date,
): Promise<boolean> {
    const [proposal] = await tx
        .select()
        .from(dictionaryGenerationProposalsTable)
        .where(eq(dictionaryGenerationProposalsTable.jobId, jobId))
        .for('update');

    if (!proposal?.documentStagedAt) return false;
    if (proposal.documentPublishedAt) return true;
    const [job] = await tx
        .select()
        .from(dictionaryGenerationJobsTable)
        .where(eq(dictionaryGenerationJobsTable.id, jobId))
        .for('update');

    if (!job) return false;
    if (job.cancellationRequestedAt || job.executionState === 'cancelled') {
        await tx
            .update(dictionaryGenerationProposalsTable)
            .set({
                payload: null,
                reviewState: 'discarded',
                terminalAt: now,
                updatedAt: now,
            })
            .where(eq(dictionaryGenerationProposalsTable.jobId, jobId));

        return false;
    }

    if (usesLegacyAction(job.selectedExecutionSnapshot))
        await settleLegacyAction(tx, {
            id: job.id,
            ownerId: job.ownerId,
            outcome: 'success',
            at: now,
        });
    await tx
        .update(dictionaryGenerationProposalsTable)
        .set({ documentPublishedAt: now, updatedAt: now })
        .where(eq(dictionaryGenerationProposalsTable.jobId, jobId));

    await tx
        .update(dictionaryGenerationJobsTable)
        .set({
            completedAt: now,
            executionState: 'completed',
            heartbeatAt: null,
            inputPayload: null,
            leaseDeadline: null,
            progressPercent: 100,
            progressStage: 'review_ready',
            providerActualCostMicros: proposal.stagedProviderCostMicros,
            providerActualInputTokens: proposal.stagedProviderInputTokens,
            providerActualOutputTokens: proposal.stagedProviderOutputTokens,
            providerReservationSettledAt: now,
            providerReservationState: 'settled',
            updatedAt: now,
            workerId: null,
        })
        .where(eq(dictionaryGenerationJobsTable.id, jobId));

    return true;
}
