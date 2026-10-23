import { and, eq, sql } from 'drizzle-orm';
import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    DictionaryDocumentUploadConflictError,
    DictionaryDocumentUploadNotFoundError,
    DictionaryGenerationJobNotFoundError,
    DictionaryGenerationNotAvailableError,
} from '../../../application/dictionary-errors';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import { settleAiCreditAttempt } from './dictionary-document-accounting';
import type { DictionaryDocumentPersistenceContext } from './dictionary-document-context';
import { persistObservedVersions } from './dictionary-document-upload-queries';
import { abort } from './dictionary-document-validation';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import { dictionaryGenerationAdmissionLock } from './drizzle-dictionary-generation-store';
import {
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
} from './schema';

export async function completeUpload(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['completeUpload']>[0],
) {
    const completion = await context.database.transaction(async (tx) => {
        await enableAiCreditSettlement(tx);
        abort(input.context.signal);
        await tx.execute(
            sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
        );

        await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, input.ownerId))
            .for('update');

        abort(input.context.signal);
        const [upload] = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(
                and(
                    eq(dictionaryDocumentUploadsTable.id, input.uploadId),
                    eq(dictionaryDocumentUploadsTable.ownerId, input.ownerId),
                ),
            )
            .for('update');

        if (!upload) throw new DictionaryDocumentUploadNotFoundError();
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, upload.jobId))
            .for('update');

        if (!job) throw new DictionaryDocumentUploadNotFoundError();
        const providerBudget = {
            inputCostMicrosPerMillionTokens:
                job.providerInputCostMicrosPerMillionTokens,
            maxCostMicrosPerAttempt: job.providerMaxCostMicrosPerAttempt,
            maxInputTokensPerAttempt: job.providerMaxInputTokensPerAttempt,
            maxOutputTokensPerAttempt: job.providerMaxOutputTokensPerAttempt,
            outputCostMicrosPerMillionTokens:
                job.providerOutputCostMicrosPerMillionTokens,
        };

        if (upload.uploadCompletedAt) {
            const replayDataVersions = input.versions.filter(
                (version) => version.kind === 'data',
            );
            const replayCurrent = replayDataVersions.find(
                (version) =>
                    version.versionId === input.requestedVersionId &&
                    version.isCurrent,
            );

            if (
                upload.verifiedStorageVersionId !== input.requestedVersionId ||
                replayDataVersions.length !== 1 ||
                replayCurrent?.checksumSha256 !==
                    upload.verifiedChecksumSha256 ||
                replayCurrent.sizeBytes !== upload.verifiedSizeBytes ||
                replayCurrent.contentType !== upload.expectedContentType ||
                input.detectedFormat !== upload.detectedFormat
            )
                throw new DictionaryDocumentUploadConflictError();

            return { conflict: false as const, jobId: job.id };
        }

        if (
            upload.processingState !== 'authorized' ||
            upload.capabilityExpiresAt <= input.context.now
        )
            return { conflict: true as const, jobId: job.id };

        const dataVersions = input.versions.filter(
            (version) => version.kind === 'data',
        );
        const current = dataVersions.find(
            (version) =>
                version.versionId === input.requestedVersionId &&
                version.isCurrent,
        );
        const observedBytes = dataVersions.reduce(
            (total, version) => total + version.sizeBytes,
            0,
        );

        if (
            dataVersions.length !== 1 ||
            !current ||
            current.sizeBytes !== upload.expectedSizeBytes ||
            current.checksumSha256 !== upload.expectedChecksumSha256 ||
            current.contentType !== upload.expectedContentType ||
            input.detectedFormat !== upload.expectedFormat
        ) {
            if (usesLegacyAction(job.selectedExecutionSnapshot))
                await settleAiCreditAttempt(tx, job, input.context.now);
            if (job.aiCreditReservationId)
                await new DrizzleAiCreditTransactionParticipant(
                    tx,
                ).releaseUndispatchedAttempt({
                    ownerId: job.ownerId,
                    releasedAt: input.context.now,
                    reservationId: job.aiCreditReservationId,
                });
            await persistObservedVersions(
                context,
                tx,
                upload,
                input.versions,
                false,
            );

            await tx
                .update(dictionaryDocumentUploadsTable)
                .set({
                    accountedPhysicalBytes: Math.max(
                        upload.accountedPhysicalBytes,
                        observedBytes,
                    ),
                    cleanupNextAttemptAt: input.context.now,
                    cleanupState: 'pending',
                    observedPhysicalBytes: observedBytes,
                    processingState: 'failed',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryDocumentUploadsTable.id, upload.id));

            await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    aiCreditReservationId: job.aiCreditAccounted
                        ? null
                        : job.aiCreditReservationId,
                    awaitingUploadAt: null,
                    completedAt: input.context.now,
                    executionState: 'failed',
                    failureCategory: 'invalid_document',
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
                .where(eq(dictionaryGenerationJobsTable.id, job.id));

            return { conflict: true as const, jobId: job.id };
        }

        const capacity = await readTextAiCapacity(tx, {
            actorId: input.ownerId,
            now: input.context.now,
            budget: providerBudget,
        });

        if (
            !textAiProviderBudgetAllows(
                capacity.providerUsage,
                true,
                providerBudget,
            )
        )
            throw new DictionaryGenerationNotAvailableError();

        await persistObservedVersions(
            context,
            tx,
            upload,
            input.versions,
            true,
        );

        await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                accountedPhysicalBytes: Math.max(
                    upload.accountedPhysicalBytes,
                    observedBytes,
                ),
                detectedFormat: input.detectedFormat,
                observedPhysicalBytes: observedBytes,
                processingState: 'quarantined',
                updatedAt: input.context.now,
                uploadCompletedAt: input.context.now,
                verifiedChecksumSha256: current.checksumSha256,
                verifiedSizeBytes: current.sizeBytes,
                verifiedStorageVersionId: current.versionId,
            })
            .where(eq(dictionaryDocumentUploadsTable.id, upload.id));

        await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                awaitingUploadAt: null,
                progressPercent: 0,
                progressStage: 'queued',
                providerInputCostMicrosPerMillionTokens:
                    providerBudget.inputCostMicrosPerMillionTokens,
                providerMaxCostMicrosPerAttempt:
                    providerBudget.maxCostMicrosPerAttempt,
                providerMaxInputTokensPerAttempt:
                    providerBudget.maxInputTokensPerAttempt,
                providerMaxOutputTokensPerAttempt:
                    providerBudget.maxOutputTokensPerAttempt,
                providerOutputCostMicrosPerMillionTokens:
                    providerBudget.outputCostMicrosPerMillionTokens,
                providerReservationState: 'active',
                providerReservedAttempts: 1,
                providerReservedCostMicros:
                    providerBudget.maxCostMicrosPerAttempt,
                providerReservedInputTokens:
                    providerBudget.maxInputTokensPerAttempt,
                providerReservedOutputTokens:
                    providerBudget.maxOutputTokensPerAttempt,
                updatedAt: input.context.now,
            })
            .where(eq(dictionaryGenerationJobsTable.id, job.id));

        return { conflict: false as const, jobId: job.id };
    });

    if (completion.conflict) throw new DictionaryDocumentUploadConflictError();
    const job = await context.generationStore.read({
        context: input.context,
        jobId: completion.jobId,
        ownerId: input.ownerId,
    });

    if (job.kind !== 'document-terms')
        throw new DictionaryGenerationJobNotFoundError();

    return job;
}
