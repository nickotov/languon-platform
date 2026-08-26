import {
    and,
    asc,
    count,
    desc,
    eq,
    isNotNull,
    isNull,
    lte,
    or,
    sql,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    DictionaryDocumentUploadCapacityError,
    DictionaryDocumentUploadConflictError,
    DictionaryDocumentUploadNotFoundError,
    DictionaryGenerationJobNotFoundError,
    DictionaryGenerationNotAvailableError,
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import {
    defaultDictionaryGenerationProviderBudgetPolicy,
    dictionaryGenerationProviderUsageCostMicros,
    type DictionaryGenerationProviderBudgetPolicy,
} from '../../../application/ports/dictionary-generation-provider-policy';
import {
    dictionaryDocumentGenerationFormat,
    documentIngestionLimitsV1,
    type DictionaryDocumentMediaType,
} from '../../../domain/document-ingestion';
import {
    createDictionaryBatchDuplicateWarnings,
    parseDictionaryBatchGenerationProposal,
} from '../../../domain/batch-generation';
import { resolveCardSettings } from '../../../domain/settings';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionaryGenerationProviderBudgetAllows,
    dictionaryGenerationAdmissionLock,
    type DictionaryGenerationProviderBudgetUsage,
    type DictionaryGenerationIdGenerator,
} from './drizzle-dictionary-generation-store';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionarySettingsTable,
} from './schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type UploadRow = typeof dictionaryDocumentUploadsTable.$inferSelect;

const documentAdmissionLock = 4_312_189_073;
const documentQuota = {
    globalBytes: 1_024 * 1_024 * 1_024,
    globalUploads: 50,
    ownerBytes: 100 * 1_024 * 1_024,
    ownerUploads: 5,
} as const;
const documentQueueQuota = { global: 1_000, owner: 5 } as const;

const formatByMediaType: Record<DictionaryDocumentMediaType, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'text/markdown': 'markdown',
    'text/plain': 'txt',
};

function abort(signal: AbortSignal): void {
    signal.throwIfAborted();
}

function validScanAttestation(input: {
    completedAt: Date;
    engineVersion: string;
    signatureUpdatedAt: Date;
    signatureVersion: string;
}): boolean {
    return (
        input.engineVersion.trim().length > 0 &&
        input.engineVersion.length <= 128 &&
        input.signatureVersion.trim().length > 0 &&
        input.signatureVersion.length <= 128 &&
        input.signatureUpdatedAt <= input.completedAt &&
        input.completedAt.getTime() - input.signatureUpdatedAt.getTime() <=
            documentIngestionLimitsV1.scanner.maximumSignatureAgeMs
    );
}

function effectiveSettings(row: typeof dictionarySettingsTable.$inferSelect) {
    const resolved = resolveCardSettings({
        dictionary: {
            customNotationLabel: row.customNotationLabel,
            definitionEnabled: row.definitionEnabled,
            definitionLanguageRole: row.definitionLanguageRole,
            exampleEnabled: row.exampleEnabled,
            exampleLanguageRole: row.exampleLanguageRole,
            exampleTranslationEnabled: row.exampleTranslationEnabled,
            transcriptionEnabled: row.transcriptionEnabled,
            transcriptionNotation: row.transcriptionNotation,
            version: row.version,
        },
        overrides: {
            customNotationLabel: null,
            definitionEnabled: null,
            definitionLanguageRole: null,
            exampleEnabled: null,
            exampleLanguageRole: null,
            exampleTranslationEnabled: null,
            transcriptionEnabled: null,
            transcriptionNotation: null,
        },
    });
    return {
        definitionEnabled: resolved.definitionEnabled,
        definitionLanguage: resolved.definitionLanguageRole,
        exampleEnabled: resolved.exampleEnabled,
        exampleLanguage: resolved.exampleLanguageRole,
        exampleTranslationEnabled: resolved.exampleTranslationEnabled,
        exampleTranslationLanguage: resolved.exampleTranslationLanguageRole,
        transcriptionCustomLabel: resolved.customNotationLabel,
        transcriptionEnabled: resolved.transcriptionEnabled,
        transcriptionNotation: resolved.transcriptionNotation,
    };
}

export class DrizzleDictionaryDocumentStore implements DictionaryDocumentStore {
    public constructor(
        private readonly database: Database,
        private readonly ids: DictionaryGenerationIdGenerator,
        private readonly generationStore: DictionaryGenerationStore,
        private readonly providerBudget: DictionaryGenerationProviderBudgetPolicy = defaultDictionaryGenerationProviderBudgetPolicy,
    ) {}

    public async expireUploadAuthorizations(
        input: Parameters<
            DictionaryDocumentStore['expireUploadAuthorizations']
        >[0],
    ) {
        return this.database.transaction(async (tx) => {
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
                .orderBy(
                    asc(dictionaryDocumentUploadsTable.capabilityExpiresAt),
                )
                .limit(input.limit)
                .for('update', { skipLocked: true });
            for (const upload of uploads) {
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

    public async readUploadAuthorization(
        input: Parameters<
            DictionaryDocumentStore['readUploadAuthorization']
        >[0],
    ) {
        abort(input.context.signal);
        const [upload] = await this.database
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
        const job = await this.generationStore.read({
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

    public async authorize(
        input: Parameters<DictionaryDocumentStore['authorize']>[0],
    ) {
        const authorization = await this.database.transaction(async (tx) => {
            abort(input.context.signal);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${documentAdmissionLock})`,
            );
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');

            const [replayJob] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.ownerId,
                            input.ownerId,
                        ),
                        eq(
                            dictionaryGenerationJobsTable.kind,
                            'document-terms',
                        ),
                        eq(
                            dictionaryGenerationJobsTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
                .for('share');
            if (replayJob) {
                if (replayJob.requestFingerprint !== input.fingerprint)
                    throw new DictionaryIdempotencyConflictError();
                const [upload] = await tx
                    .select()
                    .from(dictionaryDocumentUploadsTable)
                    .where(
                        eq(dictionaryDocumentUploadsTable.jobId, replayJob.id),
                    )
                    .limit(1);
                if (!upload) throw new DictionaryDocumentUploadNotFoundError();
                return { jobId: replayJob.id, upload };
            }

            const [current] = await tx
                .select({
                    dictionary: dictionariesTable,
                    settings: dictionarySettingsTable,
                })
                .from(dictionariesTable)
                .innerJoin(
                    dictionarySettingsTable,
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(
                    and(
                        eq(dictionariesTable.id, input.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .for('update');
            if (!current || current.dictionary.lifecycle !== 'active')
                throw new DictionaryNotFoundError();
            if (
                current.dictionary.version !==
                    input.expectedDictionaryVersion ||
                current.settings.version !== input.expectedSettingsVersion
            )
                throw new DictionaryVersionConflictError();

            const [queue] = await tx
                .select({
                    global: count(),
                    owner: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId})`,
                })
                .from(dictionaryGenerationJobsTable)
                .where(
                    sql`${dictionaryGenerationJobsTable.executionState} in ('queued', 'running')`,
                );
            if (
                Number(queue?.global ?? 0) >= documentQueueQuota.global ||
                Number(queue?.owner ?? 0) >= documentQueueQuota.owner
            )
                throw new DictionaryGenerationNotAvailableError();

            const [quota] = await tx
                .select({
                    globalBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.accountedPhysicalBytes}) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null), 0)`,
                    globalUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null)`,
                    ownerBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.accountedPhysicalBytes}) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null and ${dictionaryDocumentUploadsTable.ownerId} = ${input.ownerId}), 0)`,
                    ownerUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null and ${dictionaryDocumentUploadsTable.ownerId} = ${input.ownerId})`,
                })
                .from(dictionaryDocumentUploadsTable);
            if (
                Number(quota?.ownerUploads ?? 0) >=
                    documentQuota.ownerUploads ||
                Number(quota?.globalUploads ?? 0) >=
                    documentQuota.globalUploads ||
                Number(quota?.ownerBytes ?? 0) + input.expectedSizeBytes >
                    documentQuota.ownerBytes ||
                Number(quota?.globalBytes ?? 0) + input.expectedSizeBytes >
                    documentQuota.globalBytes
            )
                throw new DictionaryDocumentUploadCapacityError();

            const jobId = this.ids.generate();
            const uploadId = this.ids.generate();
            const objectKey = `dictionary-documents/${input.ownerId}/${uploadId}`;
            await tx.insert(dictionaryGenerationJobsTable).values({
                awaitingUploadAt: input.context.now,
                createdAt: input.context.now,
                dictionaryId: input.dictionaryId,
                expectedCardVersion: null,
                expectedDictionaryVersion: input.expectedDictionaryVersion,
                expectedSettingsVersion: input.expectedSettingsVersion,
                format: dictionaryDocumentGenerationFormat,
                id: jobId,
                idempotencyKey: input.idempotencyKey,
                inputPayload: {
                    context: {
                        dictionaryId: input.dictionaryId,
                        expectedDictionaryVersion:
                            input.expectedDictionaryVersion,
                        expectedSettingsVersion: input.expectedSettingsVersion,
                        sourceLanguage: current.dictionary.sourceLanguageTag,
                        targetLanguage: current.dictionary.targetLanguageTag,
                    },
                    effectiveSettings: effectiveSettings(current.settings),
                    format: dictionaryDocumentGenerationFormat,
                    instruction: input.instruction,
                    uploadId,
                },
                kind: 'document-terms',
                nextAttemptAt: input.context.now,
                ownerId: input.ownerId,
                progressPercent: 0,
                progressStage: 'awaiting_upload',
                requestFingerprint: input.fingerprint,
                sourceLanguageTag: current.dictionary.sourceLanguageTag,
                targetLanguageTag: current.dictionary.targetLanguageTag,
                updatedAt: input.context.now,
            });
            const [upload] = await tx
                .insert(dictionaryDocumentUploadsTable)
                .values({
                    accountedPhysicalBytes: input.expectedSizeBytes,
                    capabilityExpiresAt: input.capabilityExpiresAt,
                    cleanupNextAttemptAt: input.context.now,
                    createdAt: input.context.now,
                    dictionaryId: input.dictionaryId,
                    expectedChecksumSha256: input.expectedChecksumSha256,
                    expectedContentType: input.expectedContentType,
                    expectedFormat:
                        formatByMediaType[input.expectedContentType],
                    expectedSizeBytes: input.expectedSizeBytes,
                    id: uploadId,
                    jobId,
                    objectKey,
                    ownerId: input.ownerId,
                    updatedAt: input.context.now,
                })
                .returning();
            return { jobId, upload: upload! };
        });
        const job = await this.generationStore.read({
            context: input.context,
            jobId: authorization.jobId,
            ownerId: input.ownerId,
        });
        if (job.kind !== 'document-terms')
            throw new DictionaryGenerationJobNotFoundError();
        return {
            capabilityExpiresAt: authorization.upload.capabilityExpiresAt,
            job,
            objectKey: authorization.upload.objectKey,
            uploadId: authorization.upload.id,
        };
    }

    public async completeUpload(
        input: Parameters<DictionaryDocumentStore['completeUpload']>[0],
    ) {
        const completion = await this.database.transaction(async (tx) => {
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
                        eq(
                            dictionaryDocumentUploadsTable.ownerId,
                            input.ownerId,
                        ),
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
                    upload.verifiedStorageVersionId !==
                        input.requestedVersionId ||
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
                await this.persistObservedVersions(
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

            const windowStart = new Date(
                input.context.now.getTime() - 86_400_000,
            ).toISOString();
            const [providerAdmission] = await tx
                .select({
                    globalActiveCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)`,
                    globalActiveInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)`,
                    globalActiveOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)`,
                    globalSettledCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                    globalSettledInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                    globalSettledOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                    ownerActiveCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active' and ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId}), 0)`,
                    ownerActiveInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active' and ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId}), 0)`,
                    ownerActiveOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active' and ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId}), 0)`,
                    ownerSettledCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId} and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                    ownerSettledInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId} and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                    ownerSettledOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId} and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                })
                .from(dictionaryGenerationJobsTable);
            if (
                !dictionaryGenerationProviderBudgetAllows(
                    Object.fromEntries(
                        (
                            [
                                'globalActiveCostMicros',
                                'globalActiveInputTokens',
                                'globalActiveOutputTokens',
                                'globalSettledCostMicros',
                                'globalSettledInputTokens',
                                'globalSettledOutputTokens',
                                'ownerActiveCostMicros',
                                'ownerActiveInputTokens',
                                'ownerActiveOutputTokens',
                                'ownerSettledCostMicros',
                                'ownerSettledInputTokens',
                                'ownerSettledOutputTokens',
                            ] as const
                        ).map((key) => [
                            key,
                            Number(providerAdmission?.[key] ?? 0),
                        ]),
                    ) as unknown as DictionaryGenerationProviderBudgetUsage,
                    true,
                    this.providerBudget,
                )
            )
                throw new DictionaryGenerationNotAvailableError();

            await this.persistObservedVersions(
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
                        this.providerBudget.inputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    providerOutputCostMicrosPerMillionTokens:
                        this.providerBudget.outputCostMicrosPerMillionTokens,
                    providerReservationState: 'active',
                    providerReservedAttempts: 1,
                    providerReservedCostMicros:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            return { conflict: false as const, jobId: job.id };
        });
        if (completion.conflict)
            throw new DictionaryDocumentUploadConflictError();
        const job = await this.generationStore.read({
            context: input.context,
            jobId: completion.jobId,
            ownerId: input.ownerId,
        });
        if (job.kind !== 'document-terms')
            throw new DictionaryGenerationJobNotFoundError();
        return job;
    }

    public async loadDocumentUploadForWorker(
        input: Parameters<
            DictionaryDocumentStore['loadDocumentUploadForWorker']
        >[0],
    ) {
        abort(input.context.signal);
        const [row] = await this.database
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

    private async persistObservedVersions(
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
                id: this.ids.generate(),
                isCurrent: preserveCurrent && version.isCurrent,
                kind: version.kind,
                sizeBytes: version.sizeBytes,
                storageVersionId: version.versionId,
                uploadId: upload.id,
            })),
        );
    }

    // Worker staging and cleanup methods are kept in this store so all fences are checked in PostgreSQL.
    public async stageDocumentProposal(
        input: Parameters<DictionaryDocumentStore['stageDocumentProposal']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            if (
                !validScanAttestation(input.scanAttestation) ||
                input.scanAttestation.completedAt > input.context.now
            )
                return false;
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(this.workerCas(input))
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
                    scannerSignatureVersion:
                        input.scanAttestation.signatureVersion,
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryDocumentUploadsTable.id, upload.id));
            const [updated] = await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    executionState: 'queued',
                    heartbeatAt: null,
                    leaseDeadline: null,
                    progressPercent: 95,
                    progressStage: 'cleaning',
                    updatedAt: input.context.now,
                    workerId: null,
                })
                .where(this.workerCas(input))
                .returning({ id: dictionaryGenerationJobsTable.id });
            return Boolean(updated);
        });
    }

    public async publishDocumentProposalAfterCleanup(
        input: Parameters<
            DictionaryDocumentStore['publishDocumentProposalAfterCleanup']
        >[0],
    ) {
        return this.database.transaction(async (tx) => {
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
                .where(
                    eq(dictionaryGenerationProposalsTable.jobId, input.jobId),
                )
                .for('update');
            if (!proposal?.documentStagedAt) return false;
            if (proposal.documentPublishedAt) return true;
            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    documentPublishedAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(
                    eq(dictionaryGenerationProposalsTable.jobId, input.jobId),
                );
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
                    providerActualInputTokens:
                        proposal.stagedProviderInputTokens,
                    providerActualOutputTokens:
                        proposal.stagedProviderOutputTokens,
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

    public async terminalizeExtraction(
        input: Parameters<DictionaryDocumentStore['terminalizeExtraction']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            if (
                !validScanAttestation(input.scanAttestation) ||
                input.scanAttestation.completedAt > input.context.now
            )
                return false;
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(this.workerCas(input))
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
                    scannerSignatureVersion:
                        input.scanAttestation.signatureVersion,
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryDocumentUploadsTable.id, upload.id));
            const [updated] = await tx
                .update(dictionaryGenerationJobsTable)
                .set({
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
                .where(this.workerCas(input))
                .returning({ id: dictionaryGenerationJobsTable.id });
            return Boolean(updated);
        });
    }

    public async recordDocumentProcessingFailure(
        input: Parameters<
            DictionaryDocumentStore['recordDocumentProcessingFailure']
        >[0],
    ) {
        return this.database.transaction(async (tx) => {
            if (
                !validScanAttestation(input.scanAttestation) ||
                input.scanAttestation.completedAt > input.context.now
            )
                return false;
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(this.workerCas(input))
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
                    scannerSignatureVersion:
                        input.scanAttestation.signatureVersion,
                    terminalAt: retry ? null : input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryDocumentUploadsTable.id, upload.id));
            const priorAttempts = Math.max(0, job.attemptCount - 1);
            const [updated] = await tx
                .update(dictionaryGenerationJobsTable)
                .set({
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
                    providerReservationSettledAt: retry
                        ? null
                        : input.context.now,
                    providerReservationState: retry ? 'active' : 'settled',
                    updatedAt: input.context.now,
                    workerId: null,
                })
                .where(this.workerCas(input))
                .returning({ id: dictionaryGenerationJobsTable.id });
            return Boolean(updated);
        });
    }

    public async claimCleanup(
        input: Parameters<DictionaryDocumentStore['claimCleanup']>[0],
    ) {
        return this.database.transaction(async (tx) => {
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

    public async recordCleanupTombstone(
        input: Parameters<DictionaryDocumentStore['recordCleanupTombstone']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            const [upload] = await tx
                .select()
                .from(dictionaryDocumentUploadsTable)
                .where(this.cleanupCas(input))
                .for('update');
            if (!upload) return false;
            await tx
                .update(dictionaryDocumentObjectVersionsTable)
                .set({ isCurrent: false })
                .where(
                    eq(
                        dictionaryDocumentObjectVersionsTable.uploadId,
                        upload.id,
                    ),
                );
            await tx
                .insert(dictionaryDocumentObjectVersionsTable)
                .values({
                    checksumSha256: '0'.repeat(64),
                    createdAt: input.context.now,
                    id: this.ids.generate(),
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
                .where(this.cleanupCas(input))
                .returning({ id: dictionaryDocumentUploadsTable.id });
            return Boolean(updated);
        });
    }

    public async recordDataVersionsDeleted(
        input: Parameters<
            DictionaryDocumentStore['recordDataVersionsDeleted']
        >[0],
    ) {
        return this.database.transaction(async (tx) => {
            const [upload] = await tx
                .select()
                .from(dictionaryDocumentUploadsTable)
                .where(this.cleanupCas(input))
                .for('update');
            if (!upload?.tombstoneCreatedAt) return false;
            const deletedDataVersions = input.deletedVersions.filter(
                (version) => version.kind === 'data',
            );
            const existingVersions = await tx
                .select()
                .from(dictionaryDocumentObjectVersionsTable)
                .where(
                    eq(
                        dictionaryDocumentObjectVersionsTable.uploadId,
                        upload.id,
                    ),
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
                        id: this.ids.generate(),
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
                ...existingVersions.filter(
                    (version) => version.kind === 'data',
                ),
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
                .where(this.cleanupCas(input))
                .returning({ id: dictionaryDocumentUploadsTable.id });
            if (updated)
                await this.publishStagedDocumentProposal(
                    tx,
                    upload.jobId,
                    input.context.now,
                );
            return Boolean(updated);
        });
    }

    public async completeCleanup(
        input: Parameters<DictionaryDocumentStore['completeCleanup']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            const [upload] = await tx
                .select()
                .from(dictionaryDocumentUploadsTable)
                .where(this.cleanupCas(input))
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
                .where(this.cleanupCas(input))
                .returning({ id: dictionaryDocumentUploadsTable.id });
            return Boolean(updated);
        });
    }

    public async failCleanup(
        input: Parameters<DictionaryDocumentStore['failCleanup']>[0],
    ) {
        const [updated] = await this.database
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
            .where(this.cleanupCas(input))
            .returning({ id: dictionaryDocumentUploadsTable.id });
        return Boolean(updated);
    }

    public async heartbeatCleanup(
        input: Parameters<DictionaryDocumentStore['heartbeatCleanup']>[0],
    ) {
        const [updated] = await this.database
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupHeartbeatAt: input.context.now,
                cleanupLeaseDeadline: input.nextLeaseDeadline,
                updatedAt: input.context.now,
            })
            .where(this.cleanupCas(input))
            .returning({ id: dictionaryDocumentUploadsTable.id });
        return Boolean(updated);
    }

    private workerCas(input: {
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

    private cleanupCas(input: {
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

    private async publishStagedDocumentProposal(
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
}
