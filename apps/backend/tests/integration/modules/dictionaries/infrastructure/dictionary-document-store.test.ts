import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import {
    DictionaryDocumentUploadConflictError,
    DictionaryGenerationNotAvailableError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { dictionaryDocumentGenerationFormat } from '../../../../../src/modules/dictionaries/domain/document-ingestion';
import { dictionaryPastedTermsGenerationFormat } from '../../../../../src/modules/dictionaries/domain/generation';
import { DrizzleDictionaryDocumentStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-document-store';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const instant = (offset = 0) =>
    new Date(Date.parse('2026-08-26T12:00:00.000Z') + offset);
const operationContext = (offset = 0) => ({
    now: instant(offset),
    signal: new AbortController().signal,
});
const fingerprint = (character: string) =>
    `hmac-sha256:v1:${character.repeat(43)}`;
const proposal = {
    candidates: [
        {
            candidate: {
                overrides: {
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                    transcriptionCustomLabel: null,
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                },
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'canvas',
                    transcription: null,
                    translation: 'toile',
                },
            },
            fieldFeedback: [],
            input: 'canvas',
            rowIndex: 0,
        },
    ],
    failures: [],
    warnings: [],
};

run('dictionary document persistence', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let documentStore: DrizzleDictionaryDocumentStore;
    let dictionaryStore: DrizzleDictionaryStore;
    let generationStore: DrizzleDictionaryGenerationStore;
    let ownerId: string;

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        generationStore = new DrizzleDictionaryGenerationStore(database, {
            generate: randomUUID,
        });
        documentStore = new DrizzleDictionaryDocumentStore(
            database,
            { generate: randomUUID },
            generationStore,
        );
        dictionaryStore = new DrizzleDictionaryStore(database, {
            generate: randomUUID,
        });
    });

    beforeEach(async () => {
        await database.delete(dictionaryDocumentExtractionsTable);
        await database.delete(dictionaryGenerationProposalsTable);
        await database.delete(dictionaryDocumentObjectVersionsTable);
        await database.delete(dictionaryDocumentUploadsTable);
        await database.delete(dictionaryGenerationJobsTable);
        await database.delete(usersTable);
        ownerId = randomUUID();
        await database.insert(usersTable).values({
            createdAt: instant(),
            id: ownerId,
            status: 'active',
            updatedAt: instant(),
        });
    });

    afterAll(async () => client.end());

    async function createDictionary() {
        return dictionaryStore.createDictionary({
            context: operationContext(),
            fingerprint: fingerprint('A'),
            idempotencyKey: `dictionary-create-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'Document ingestion',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
    }

    async function authorize(
        character = 'B',
        instruction: string | null = null,
    ) {
        const dictionary = await createDictionary();
        const input = {
            capabilityExpiresAt: instant(600_000),
            context: operationContext(1),
            dictionaryId: dictionary.id,
            expectedChecksumSha256: 'a'.repeat(64),
            expectedContentType: 'text/plain' as const,
            expectedDictionaryVersion: dictionary.version,
            expectedSettingsVersion: dictionary.settings.version,
            expectedSizeBytes: 12,
            fingerprint: fingerprint(character),
            idempotencyKey: `document-upload-${character.repeat(16)}`,
            instruction,
            ownerId,
        };
        return { authorization: await documentStore.authorize(input), input };
    }

    it('idempotently authorizes one awaiting job and excludes it from claims until exact completion', async () => {
        const { authorization, input } = await authorize();
        const replay = await documentStore.authorize(input);
        expect(replay).toMatchObject({
            job: { id: authorization.job.id, state: 'awaiting-upload' },
            uploadId: authorization.uploadId,
        });
        const [counts] = await database
            .select({ value: count() })
            .from(dictionaryDocumentUploadsTable);
        expect(Number(counts?.value)).toBe(1);

        await expect(
            generationStore.claim({
                context: operationContext(2),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryDocumentGenerationFormat],
                workerId: 'document-worker',
            }),
        ).resolves.toBeNull();

        const queued = await documentStore.completeUpload({
            context: operationContext(3),
            detectedFormat: 'txt',
            ownerId,
            requestedVersionId: 'version-1',
            uploadId: authorization.uploadId,
            versions: [
                {
                    checksumSha256: 'a'.repeat(64),
                    contentType: 'text/plain',
                    isCurrent: true,
                    kind: 'data',
                    sizeBytes: 12,
                    versionId: 'version-1',
                },
            ],
        });
        expect(queued.state).toBe('queued');
        const claim = await generationStore.claim({
            context: operationContext(4),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryDocumentGenerationFormat],
            workerId: 'document-worker',
        });
        expect(claim).toMatchObject({ id: authorization.job.id });

        await expect(
            documentStore.stageDocumentProposal({
                context: operationContext(5),
                extractionFingerprint: fingerprint('D'),
                failureUnitCount: 0,
                fencingToken: claim!.fencingToken,
                jobId: claim!.id,
                observedUnitCount: 1,
                proposal,
                providerUsage: { inputTokens: 12, outputTokens: 8 },
                reviewExpiresAt: instant(86_400_000),
                scanAttestation: {
                    completedAt: instant(5),
                    engineVersion: 'scanner-1',
                    signatureUpdatedAt: instant(0),
                    signatureVersion: 'signatures-1',
                },
                validUnitCount: 1,
                workerId: claim!.workerId,
            }),
        ).resolves.toBe(true);
        await expect(
            generationStore.read({
                context: operationContext(6),
                jobId: authorization.job.id,
                ownerId,
            }),
        ).resolves.toMatchObject({ proposal: null, state: 'running' });

        const cleanup = await documentStore.claimCleanup({
            context: operationContext(7),
            leaseDurationMs: 1_000,
            workerId: 'cleanup-worker',
        });
        expect(cleanup).toMatchObject({
            jobId: authorization.job.id,
            phase: 'delete_data',
        });
        await expect(
            documentStore.recordCleanupTombstone({
                context: operationContext(8),
                fencingToken: cleanup!.fencingToken,
                storageVersionId: 'tombstone-1',
                uploadId: cleanup!.uploadId,
                workerId: cleanup!.workerId,
            }),
        ).resolves.toBe(true);
        await expect(
            documentStore.recordDataVersionsDeleted({
                context: operationContext(9),
                deletedVersions: cleanup!.versions.filter(
                    (version) => version.kind === 'data',
                ),
                fencingToken: cleanup!.fencingToken,
                uploadId: cleanup!.uploadId,
                workerId: cleanup!.workerId,
            }),
        ).resolves.toBe(true);
        await expect(
            generationStore.read({
                context: operationContext(10),
                jobId: authorization.job.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            proposal: { candidates: [{ rowIndex: 0 }] },
            state: 'review',
        });

        const tombstoneCleanup = await documentStore.claimCleanup({
            context: operationContext(600_001),
            leaseDurationMs: 1_000,
            workerId: 'cleanup-worker-2',
        });
        expect(tombstoneCleanup).toMatchObject({
            phase: 'delete_tombstone',
            uploadId: authorization.uploadId,
        });
    });

    it('accounts every unexpected physical version and schedules cleanup without queueing work', async () => {
        const { authorization } = await authorize('C');
        await expect(
            documentStore.completeUpload({
                context: operationContext(3),
                detectedFormat: 'txt',
                ownerId,
                requestedVersionId: 'version-2',
                uploadId: authorization.uploadId,
                versions: [
                    {
                        checksumSha256: 'b'.repeat(64),
                        contentType: 'text/plain',
                        isCurrent: false,
                        kind: 'data',
                        sizeBytes: 12,
                        versionId: 'version-1',
                    },
                    {
                        checksumSha256: 'a'.repeat(64),
                        contentType: 'text/plain',
                        isCurrent: true,
                        kind: 'data',
                        sizeBytes: 12,
                        versionId: 'version-2',
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryDocumentUploadConflictError);

        const [upload] = await database
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(
                eq(dictionaryDocumentUploadsTable.id, authorization.uploadId),
            );
        expect(upload).toMatchObject({
            accountedPhysicalBytes: 24,
            cleanupState: 'pending',
            observedPhysicalBytes: 24,
            processingState: 'failed',
        });
        const job = await generationStore.read({
            context: operationContext(4),
            jobId: authorization.job.id,
            ownerId,
        });
        expect(job).toMatchObject({
            failure: { code: 'invalid_document' },
            state: 'failed',
        });
    });

    it('expires bounded awaiting authorizations and keeps cleanup claimable after the attempt counter saturates', async () => {
        const { authorization } = await authorize('E');
        await database
            .update(dictionaryDocumentUploadsTable)
            .set({ cleanupAttemptCount: 100 })
            .where(
                eq(dictionaryDocumentUploadsTable.id, authorization.uploadId),
            );

        await expect(
            documentStore.expireUploadAuthorizations({
                context: operationContext(600_001),
                limit: 1,
            }),
        ).resolves.toBe(1);
        await expect(
            generationStore.read({
                context: operationContext(600_002),
                jobId: authorization.job.id,
                ownerId,
            }),
        ).resolves.toMatchObject({ state: 'expired' });

        const cleanup = await documentStore.claimCleanup({
            context: operationContext(600_003),
            leaseDurationMs: 1_000,
            workerId: 'cleanup-after-saturation',
        });
        expect(cleanup).toMatchObject({ uploadId: authorization.uploadId });
        const [upload] = await database
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(
                eq(dictionaryDocumentUploadsTable.id, authorization.uploadId),
            );
        expect(upload?.cleanupAttemptCount).toBe(100);
        expect(upload?.cleanupState).toBe('running');
    });

    it('serializes concurrent upload completion against provider admission limits', async () => {
        const authorizations = await Promise.all(
            ['F', 'G', 'H', 'I'].map(async (character) => authorize(character)),
        );

        const results = await Promise.allSettled(
            authorizations.map(({ authorization }, index) =>
                documentStore.completeUpload({
                    context: operationContext(10 + index),
                    detectedFormat: 'txt',
                    ownerId,
                    requestedVersionId: `version-${index}`,
                    uploadId: authorization.uploadId,
                    versions: [
                        {
                            checksumSha256: 'a'.repeat(64),
                            contentType: 'text/plain',
                            isCurrent: true,
                            kind: 'data',
                            sizeBytes: 12,
                            versionId: `version-${index}`,
                        },
                    ],
                }),
            ),
        );
        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(3);
        const [rejected] = results.filter(
            (result) => result.status === 'rejected',
        );
        expect(rejected).toMatchObject({
            reason: expect.any(DictionaryGenerationNotAvailableError),
        });
        const [active] = await database
            .select({ value: count() })
            .from(dictionaryGenerationJobsTable)
            .where(
                eq(
                    dictionaryGenerationJobsTable.providerReservationState,
                    'active',
                ),
            );
        expect(Number(active?.value)).toBe(3);
    });

    it('enqueues selected retryable document failures as a redacted pasted successor with lineage', async () => {
        const { authorization, input } = await authorize(
            'J',
            'Prefer practical banking vocabulary',
        );
        await documentStore.completeUpload({
            context: operationContext(2),
            detectedFormat: 'txt',
            ownerId,
            requestedVersionId: 'document-version',
            uploadId: authorization.uploadId,
            versions: [
                {
                    checksumSha256: 'a'.repeat(64),
                    contentType: 'text/plain',
                    isCurrent: true,
                    kind: 'data',
                    sizeBytes: 12,
                    versionId: 'document-version',
                },
            ],
        });
        const documentClaim = await generationStore.claim({
            context: operationContext(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryDocumentGenerationFormat],
            workerId: 'document-retry-source',
        });
        await documentStore.stageDocumentProposal({
            context: operationContext(4),
            extractionFingerprint: fingerprint('K'),
            failureUnitCount: 1,
            fencingToken: documentClaim!.fencingToken,
            jobId: documentClaim!.id,
            observedUnitCount: 1,
            proposal: {
                candidates: [],
                failures: [
                    {
                        code: 'generation_failed',
                        input: 'bank',
                        message: 'Generation failed for this row.',
                        retryable: true,
                        rowIndex: 7,
                    },
                ],
                warnings: [],
            },
            providerUsage: { inputTokens: 12, outputTokens: 8 },
            reviewExpiresAt: instant(86_400_000),
            scanAttestation: {
                completedAt: instant(4),
                engineVersion: 'scanner-1',
                signatureUpdatedAt: instant(0),
                signatureVersion: 'signatures-1',
            },
            validUnitCount: 0,
            workerId: documentClaim!.workerId,
        });
        const cleanup = await documentStore.claimCleanup({
            context: operationContext(5),
            leaseDurationMs: 1_000,
            workerId: 'cleanup-document-retry-source',
        });
        await documentStore.recordCleanupTombstone({
            context: operationContext(6),
            fencingToken: cleanup!.fencingToken,
            storageVersionId: 'document-tombstone',
            uploadId: cleanup!.uploadId,
            workerId: cleanup!.workerId,
        });
        await documentStore.recordDataVersionsDeleted({
            context: operationContext(7),
            deletedVersions: cleanup!.versions.filter(
                (version) => version.kind === 'data',
            ),
            fencingToken: cleanup!.fencingToken,
            uploadId: cleanup!.uploadId,
            workerId: cleanup!.workerId,
        });

        const successor = await generationStore.enqueueDocumentFailureRetry({
            context: operationContext(8),
            dictionaryId: input.dictionaryId,
            expectedDictionaryVersion: input.expectedDictionaryVersion,
            expectedSettingsVersion: input.expectedSettingsVersion,
            fingerprint: fingerprint('L'),
            idempotencyKey: 'document-failure-retry-key',
            ownerId,
            predecessorJobId: authorization.job.id,
            rowIndexes: [7],
        });
        expect(successor).toMatchObject({
            format: dictionaryPastedTermsGenerationFormat,
            kind: 'pasted-terms',
            state: 'queued',
        });
        const [predecessor] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, authorization.job.id));
        expect(predecessor?.inputPayload).toBeNull();
        const successorClaim = await generationStore.claim({
            context: operationContext(9),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryPastedTermsGenerationFormat],
            workerId: 'pasted-document-retry',
        });
        expect(successorClaim?.input).toMatchObject({
            format: dictionaryPastedTermsGenerationFormat,
            predecessor: {
                jobId: authorization.job.id,
                rowIndexes: [7],
            },
            rows: [{ input: 'bank', rowIndex: 0 }],
            sharedContext: null,
        });
    });
});
