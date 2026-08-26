import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { asc, count, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import {
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationNotAvailableError,
    DictionaryVersionConflictError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import type {
    DictionaryBatchGenerationProposalPayload,
    DictionaryImportPairsGenerationProposalPayload,
} from '../../../../../src/modules/dictionaries/domain/batch-generation';
import {
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../../../../../src/modules/dictionaries/domain/generation';
import { DictionaryCardCapacityError } from '../../../../../src/modules/dictionaries/domain/ordering';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
    dictionarySettingsTable,
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
    new Date(Date.parse('2026-08-25T12:00:00.000Z') + offset);
const operationContext = (offset = 0) => ({
    now: instant(offset),
    signal: new AbortController().signal,
});
const fingerprint = (character: string) =>
    `hmac-sha256:v1:${character.repeat(43)}`;
const overrides = {
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
    transcriptionCustomLabel: null,
    transcriptionEnabled: null,
    transcriptionNotation: null,
};
const proposal: DictionaryBatchGenerationProposalPayload = {
    candidates: [
        {
            candidate: {
                overrides,
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
        {
            candidate: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'paint',
                    transcription: null,
                    translation: 'peinture',
                },
            },
            fieldFeedback: [],
            input: 'paint',
            rowIndex: 1,
        },
    ],
    failures: [],
    warnings: [],
};

run('pasted-term generation persistence', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let dictionaryStore: DrizzleDictionaryStore;
    let generationStore: DrizzleDictionaryGenerationStore;
    let ownerId: string;

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        dictionaryStore = new DrizzleDictionaryStore(database, {
            generate: randomUUID,
        });
        generationStore = new DrizzleDictionaryGenerationStore(database, {
            generate: randomUUID,
        });
    });

    beforeEach(async () => {
        await database.delete(dictionaryGenerationProposalsTable);
        await database.delete(dictionaryCardRevisionsTable);
        await database.delete(dictionaryGenerationJobsTable);
        await database.delete(dictionaryGenerationProviderCircuitTable);
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

    it('atomically creates and replays a new-target import-pairs job whose accepted cards stay mixed', async () => {
        const idempotencyKey = `import-pairs-${randomUUID()}`;
        const enqueue = {
            context: operationContext(1),
            fingerprint: fingerprint('I'),
            idempotencyKey,
            importFingerprint: fingerprint('L'),
            instruction: 'Add a useful example',
            ownerId,
            rows: [{ rowIndex: 7, source: 'bank', translation: 'banco' }],
            target: {
                description: null,
                kind: 'new' as const,
                name: 'Imported with AI',
                sourceLanguage: 'en' as const,
                targetLanguage: 'es' as const,
            },
        };
        const created = await generationStore.enqueueImportPairs(enqueue);
        const replay = await generationStore.enqueueImportPairs({
            ...enqueue,
            context: operationContext(2),
        });
        expect(replay).toEqual(created);
        expect(created).toMatchObject({
            dictionary: { activeCardCount: 0, version: 1 },
            job: { kind: 'import-pairs', state: 'queued' },
            mode: 'ai',
        });
        expect(
            await database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, ownerId)),
        ).toHaveLength(1);
        expect(
            await database
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(eq(dictionaryGenerationJobsTable.ownerId, ownerId)),
        ).toHaveLength(1);
        await database
            .update(dictionaryGenerationJobsTable)
            .set({ nextAttemptAt: instant(10_000) })
            .where(eq(dictionaryGenerationJobsTable.id, created.job.id));
        await expect(
            generationStore.observeOperationalState({
                context: operationContext(2),
                windowStartedAt: instant(-60_000),
            }),
        ).resolves.toMatchObject({
            queueImportPairsDepth: 1,
            queueImportPairsOldestAgeMs: 0,
            queueOldestRunnableAgeMs: 0,
        });
        await database
            .update(dictionaryGenerationJobsTable)
            .set({ nextAttemptAt: instant(1) })
            .where(eq(dictionaryGenerationJobsTable.id, created.job.id));
        await expect(
            generationStore.observeOperationalState({
                context: operationContext(2),
                windowStartedAt: instant(-60_000),
            }),
        ).resolves.toMatchObject({
            queueImportPairsDepth: 1,
            queueImportPairsOldestAgeMs: 1,
            queueSingleCardDepth: 0,
            queuePastedTermsDepth: 0,
            queueDocumentTermsDepth: 0,
            providerActiveReservationCount: 1,
            providerActiveCapacityRemaining: 9,
            generationQueueCapacityRemaining: 999,
        });

        const claim = await generationStore.claim({
            context: operationContext(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryImportPairsGenerationFormat],
            workerId: 'import-worker',
        });
        expect(claim).toMatchObject({
            id: created.job.id,
            input: {
                importFingerprint: fingerprint('L'),
                rows: [
                    {
                        lineage: {
                            importFingerprint: fingerprint('L'),
                            importedRowIndex: 7,
                        },
                        rowIndex: 7,
                        source: 'bank',
                        translation: 'banco',
                    },
                ],
            },
        });
        const candidate = {
            overrides,
            values: {
                definition: null,
                example: 'The bank opens early.',
                exampleTranslation: 'El banco abre temprano.',
                source: 'bank',
                transcription: null,
                translation: 'banco',
            },
        };
        const importProposal: DictionaryImportPairsGenerationProposalPayload = {
            candidates: [
                {
                    candidate,
                    fieldFeedback: [],
                    rowIndex: 7,
                    source: 'bank',
                    translation: 'banco',
                },
            ],
            failures: [],
            warnings: [],
        };
        await expect(
            generationStore.complete({
                context: operationContext(4),
                fencingToken: claim!.fencingToken,
                jobId: claim!.id,
                leaseDeadline: claim!.leaseDeadline,
                proposal: importProposal,
                providerUsage: { inputTokens: 10, outputTokens: 10 },
                reviewExpiresAt: operationContext(60_000).now,
                workerId: claim!.workerId,
            }),
        ).resolves.toBe(true);
        const accepted = await generationStore.acceptBatch({
            acceptanceFingerprint: fingerprint('M'),
            context: operationContext(6),
            jobId: created.job.id,
            ownerId,
            selected: [{ candidate, rowIndex: 7 }],
        });
        expect(accepted).toMatchObject({
            job: { kind: 'import-pairs', state: 'accepted' },
            outcome: { authorship: 'mixed', dictionaryVersion: 2 },
        });
        const [card] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(
                eq(dictionaryCardsTable.dictionaryId, created.dictionary.id),
            );
        expect(card).toMatchObject({ authorship: 'mixed', source: 'bank' });
        await database
            .update(dictionaryGenerationJobsTable)
            .set({ providerReservedAttempts: 3 })
            .where(eq(dictionaryGenerationJobsTable.id, created.job.id));
        const measurement = await generationStore.observeOperationalState({
            context: operationContext(7),
            windowStartedAt: instant(-60_000),
        });
        expect(measurement).toEqual({
            schemaVersion: 1,
            windowSeconds: 60,
            queueAwaitingUploadDepth: 0,
            queueQueuedDepth: 0,
            queueRunningDepth: 0,
            queueRetryDepth: 0,
            queueOldestRunnableAgeMs: 0,
            queueSingleCardDepth: 0,
            queuePastedTermsDepth: 0,
            queueDocumentTermsDepth: 0,
            queueImportPairsDepth: 0,
            queueSingleCardOldestAgeMs: 0,
            queuePastedTermsOldestAgeMs: 0,
            queueDocumentTermsOldestAgeMs: 0,
            queueImportPairsOldestAgeMs: 0,
            expiredRunningLeaseDepth: 0,
            generationQueueCapacityRemaining: 1_000,
            ownersAtGenerationQueueCapacity: 0,
            outcomeCompletedCount: 1,
            outcomeFailedCount: 0,
            outcomeCancelledCount: 0,
            outcomeExpiredCount: 0,
            reviewAcceptedCount: 1,
            reviewDiscardedCount: 0,
            reviewExpiredCount: 0,
            processingAverageDurationMs: 3,
            processingMaximumDurationMs: 3,
            retryAttemptCount: 0,
            failureInvalidModelOutputCount: 0,
            settledProviderBudgetInputTokenCount: 10,
            settledProviderBudgetOutputTokenCount: 10,
            settledProviderBudgetCostMicros: 0,
            settledProviderReservationAttemptCount: 3,
            failureProviderUnavailableCount: 0,
            failureProviderTimeoutCount: 0,
            failureProviderRateLimitedCount: 0,
            failureMalwareDetectedCount: 0,
            failureScanCount: 0,
            failureInvalidDocumentCount: 0,
            failureExtractionCount: 0,
            failureNoTermsFoundCount: 0,
            failureTooManyTermsCount: 0,
            providerActiveReservationCount: 0,
            providerActiveCapacityRemaining: 10,
            providerCircuitOpenCount: 0,
            providerCircuitFailureCount: 0,
            providerReservedInputTokenCount: 0,
            providerReservedOutputTokenCount: 0,
            providerReservedCostMicros: 0,
            scannerFailureCount: 0,
            ocrFailureCount: 0,
            uploadAuthorizationCount: 0,
            uploadCompletionCount: 0,
            uploadAuthorizedByteCount: 0,
            uploadSmallSizeCount: 0,
            uploadMediumSizeCount: 0,
            uploadLargeSizeCount: 0,
            uploadPendingPhysicalByteCount: 0,
            scanCompletionCount: 0,
            scanAverageDurationMs: 0,
            scanCleanCount: 0,
            scanInfectedCount: 0,
            scanUnavailableCount: 0,
            scanTimeoutCount: 0,
            scanLimitExceededCount: 0,
            scanInvalidResponseCount: 0,
            scanStaleSignatureCount: 0,
            parserFailureCount: 0,
            scannerLatestSignatureAgeMs: 0,
            cleanupPendingDepth: 0,
            cleanupRunningDepth: 0,
            cleanupWaitingCapabilityExpiryDepth: 0,
            cleanupFailureDepth: 0,
            cleanupOldestLagMs: 0,
            cleanupRetryAttemptCount: 0,
            cleanupLagBreachDepth: 0,
        });
    });

    it('keeps periodic observation windows on dedicated timestamp indexes', async () => {
        const plans = await database.transaction(async (tx) => {
            await tx.execute(sql`set local enable_seqscan = off`);
            return Promise.all([
                tx.execute(sql`explain (format json)
                    select count(*) from dictionary_generation_jobs
                    where completed_at >= ${instant(-60_000).toISOString()}::timestamptz`),
                tx.execute(sql`explain (format json)
                    select count(*) from dictionary_generation_jobs
                    where execution_state in ('queued', 'running')`),
                tx.execute(sql`explain (format json)
                    select count(*) from dictionary_generation_jobs
                    where provider_reservation_state in ('settled', 'released')
                      and provider_reservation_settled_at >= ${instant(-60_000).toISOString()}::timestamptz`),
                tx.execute(sql`explain (format json)
                    select count(*) from dictionary_generation_proposals
                    where terminal_at >= ${instant(-60_000).toISOString()}::timestamptz`),
                tx.execute(sql`explain (format json)
                    select count(*) from dictionary_document_uploads
                    where created_at >= ${instant(-60_000).toISOString()}::timestamptz`),
                tx.execute(sql`explain (format json)
                    select count(*) from dictionary_document_uploads
                    where upload_completed_at >= ${instant(-60_000).toISOString()}::timestamptz`),
                tx.execute(sql`explain (format json)
                    select count(*) from dictionary_document_uploads
                    where scan_completed_at >= ${instant(-60_000).toISOString()}::timestamptz`),
            ]);
        });
        const serialized = JSON.stringify(plans);
        for (const indexName of [
            'dictionary_generation_jobs_completed_idx',
            'dictionary_generation_jobs_current_observation_idx',
            'dictionary_generation_jobs_provider_budget_idx',
            'dictionary_generation_proposals_terminal_idx',
            'dictionary_document_uploads_created_idx',
            'dictionary_document_uploads_upload_completed_idx',
            'dictionary_document_uploads_scan_completed_idx',
        ])
            expect(serialized).toContain(indexName);
    });

    it('retries only persisted retryable import-pairs failures with trusted lineage', async () => {
        const created = await generationStore.enqueueImportPairs({
            context: operationContext(1),
            fingerprint: fingerprint('N'),
            idempotencyKey: `import-pairs-${randomUUID()}`,
            importFingerprint: fingerprint('O'),
            instruction: null,
            ownerId,
            rows: [
                { rowIndex: 4, source: 'bank', translation: 'banco' },
                { rowIndex: 8, source: 'shore', translation: 'orilla' },
            ],
            target: {
                description: null,
                kind: 'new',
                name: 'Retry pairs',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
        });
        const claim = await generationStore.claim({
            context: operationContext(2),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryImportPairsGenerationFormat],
            workerId: 'import-retry-worker',
        });
        await generationStore.complete({
            context: operationContext(3),
            fencingToken: claim!.fencingToken,
            jobId: claim!.id,
            leaseDeadline: claim!.leaseDeadline,
            proposal: {
                candidates: [],
                failures: [
                    {
                        code: 'generation_failed',
                        input: 'bank',
                        message: 'Transient provider failure.',
                        retryable: true,
                        rowIndex: 4,
                        source: 'bank',
                        translation: 'banco',
                    },
                    {
                        code: 'invalid_term',
                        input: 'shore',
                        message: 'This row is invalid.',
                        retryable: false,
                        rowIndex: 8,
                        source: 'shore',
                        translation: 'orilla',
                    },
                ],
                warnings: [],
            },
            providerUsage: { inputTokens: 10, outputTokens: 10 },
            reviewExpiresAt: operationContext(60_000).now,
            workerId: claim!.workerId,
        });
        const retryInput = {
            context: operationContext(4),
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            fingerprint: fingerprint('P'),
            idempotencyKey: `import-pairs-retry-${randomUUID()}`,
            ownerId,
            predecessorJobId: created.job.id,
            rowIndexes: [4],
        };
        const successor =
            await generationStore.enqueueImportPairsRetry(retryInput);
        const replay = await generationStore.enqueueImportPairsRetry({
            ...retryInput,
            context: operationContext(5),
        });
        expect(replay).toEqual(successor);
        const [persisted] = await database
            .select({ input: dictionaryGenerationJobsTable.inputPayload })
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, successor.id));
        expect(persisted?.input).toMatchObject({
            importFingerprint: fingerprint('O'),
            predecessor: { jobId: created.job.id, rowIndexes: [4] },
            rows: [
                {
                    lineage: {
                        importFingerprint: fingerprint('O'),
                        importedRowIndex: 4,
                    },
                    rowIndex: 4,
                    source: 'bank',
                    translation: 'banco',
                },
            ],
        });
        await expect(
            generationStore.enqueueImportPairsRetry({
                ...retryInput,
                fingerprint: fingerprint('Q'),
                idempotencyKey: `import-pairs-retry-${randomUUID()}`,
                rowIndexes: [8],
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCandidateConflictError);
    });

    it('rejects AI import when every optional enrichment field is disabled', async () => {
        const dictionary = await createDictionary();
        await database
            .update(dictionarySettingsTable)
            .set({
                definitionEnabled: false,
                exampleEnabled: false,
                exampleTranslationEnabled: false,
                transcriptionEnabled: false,
            })
            .where(eq(dictionarySettingsTable.dictionaryId, dictionary.id));

        await expect(
            generationStore.enqueueImportPairs({
                context: operationContext(1),
                fingerprint: fingerprint('R'),
                idempotencyKey: `import-pairs-${randomUUID()}`,
                importFingerprint: fingerprint('S'),
                instruction: null,
                ownerId,
                rows: [{ rowIndex: 0, source: 'bank', translation: 'banque' }],
                target: {
                    dictionaryId: dictionary.id,
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settings.version,
                    kind: 'existing',
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
    });

    async function createDictionary() {
        return dictionaryStore.createDictionary({
            context: operationContext(),
            fingerprint: fingerprint('A'),
            idempotencyKey: `dictionary-create-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'Batch generation',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
    }

    async function enqueueAndComplete(
        dictionary: Awaited<ReturnType<typeof createDictionary>>,
    ) {
        const job = await generationStore.enqueuePastedTerms({
            context: operationContext(1),
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: dictionary.version,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('B'),
            idempotencyKey: `batch-generation-${randomUUID()}`,
            ownerId,
            sharedContext: 'Art vocabulary',
            text: 'canvas\npaint',
        });
        const claim = await generationStore.claim({
            context: operationContext(2),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryPastedTermsGenerationFormat],
            workerId: 'batch-worker',
        });
        expect(claim).toMatchObject({
            id: job.id,
            input: {
                effectiveSettings: expect.any(Object),
                rows: [
                    { input: 'canvas', rowIndex: 0 },
                    { input: 'paint', rowIndex: 1 },
                ],
                sharedContext: 'Art vocabulary',
            },
        });
        await expect(
            generationStore.complete({
                context: operationContext(3),
                fencingToken: claim!.fencingToken,
                jobId: job.id,
                leaseDeadline: claim!.leaseDeadline,
                proposal,
                reviewExpiresAt: instant(60_000),
                workerId: claim!.workerId,
            }),
        ).resolves.toBe(true);
        return job;
    }

    it('atomically accepts ordered cards, derives authorship, redacts, and replays exactly', async () => {
        const dictionary = await createDictionary();
        const job = await enqueueAndComplete(dictionary);
        const editedSecond = {
            ...proposal.candidates[1]!.candidate,
            values: {
                ...proposal.candidates[1]!.candidate.values,
                source: 'canvas',
                translation: 'peindre',
            },
        };
        const acceptanceFingerprint = fingerprint('C');
        const accepted = await generationStore.acceptPastedTerms({
            acceptanceFingerprint,
            context: operationContext(4),
            jobId: job.id,
            ownerId,
            selected: [
                { candidate: editedSecond, rowIndex: 1 },
                { candidate: proposal.candidates[0]!.candidate, rowIndex: 0 },
            ],
        });

        expect(accepted.outcome.dictionaryVersion).toBe(dictionary.version + 1);
        expect(accepted.outcome.cards.map((card) => card.rowIndex)).toEqual([
            0, 1,
        ]);
        expect(accepted.outcome.warnings).toEqual([
            expect.objectContaining({
                code: 'duplicate_source',
                duplicateCardId: null,
                rowIndex: 1,
            }),
        ]);
        const cards = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.dictionaryId, dictionary.id))
            .orderBy(asc(dictionaryCardsTable.sortKey));
        expect(cards).toMatchObject([
            { authorship: 'ai-generated', source: 'canvas', version: 1 },
            {
                authorship: 'mixed',
                source: 'canvas',
                translation: 'peindre',
                version: 1,
            },
        ]);
        const revisions = await database
            .select()
            .from(dictionaryCardRevisionsTable)
            .where(
                eq(dictionaryCardRevisionsTable.dictionaryId, dictionary.id),
            );
        expect(revisions).toHaveLength(2);
        expect(
            revisions.every(
                (revision) => revision.acceptedGenerationJobId === job.id,
            ),
        ).toBe(true);
        const [persistedJob] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        const [persistedProposal] = await database
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));
        expect(persistedJob?.inputPayload).toBeNull();
        expect(persistedProposal).toMatchObject({
            acceptedBatchOutcome: accepted.outcome,
            acceptedCandidateFingerprint: acceptanceFingerprint,
            payload: null,
            reviewState: 'accepted',
        });

        await expect(
            generationStore.acceptPastedTerms({
                acceptanceFingerprint,
                context: operationContext(5),
                jobId: job.id,
                ownerId,
                selected: [
                    {
                        candidate: proposal.candidates[0]!.candidate,
                        rowIndex: 0,
                    },
                    { candidate: editedSecond, rowIndex: 1 },
                ],
            }),
        ).resolves.toEqual(accepted);
        await expect(
            generationStore.acceptPastedTerms({
                acceptanceFingerprint: fingerprint('D'),
                context: operationContext(6),
                jobId: job.id,
                ownerId,
                selected: [
                    {
                        candidate: proposal.candidates[0]!.candidate,
                        rowIndex: 0,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCandidateConflictError);
        await expect(
            database
                .select()
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, dictionary.id)),
        ).resolves.toHaveLength(2);
    });

    it('conflicts after a legal empty-dictionary pair change without partial writes', async () => {
        const dictionary = await createDictionary();
        const job = await enqueueAndComplete(dictionary);
        await database
            .update(dictionariesTable)
            .set({
                sourceLanguageTag: 'de',
                updatedAt: instant(4),
                version: dictionary.version + 1,
            })
            .where(eq(dictionariesTable.id, dictionary.id));

        await expect(
            generationStore.acceptPastedTerms({
                acceptanceFingerprint: fingerprint('E'),
                context: operationContext(5),
                jobId: job.id,
                ownerId,
                selected: [
                    {
                        candidate: proposal.candidates[0]!.candidate,
                        rowIndex: 0,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
        await expect(
            database
                .select()
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, dictionary.id)),
        ).resolves.toHaveLength(0);
    });

    it('conflicts after a settings-only version change without partial writes', async () => {
        const dictionary = await createDictionary();
        const job = await enqueueAndComplete(dictionary);
        await database
            .update(dictionarySettingsTable)
            .set({
                updatedAt: instant(4),
                version: dictionary.settings.version + 1,
            })
            .where(eq(dictionarySettingsTable.dictionaryId, dictionary.id));

        await expect(
            generationStore.acceptPastedTerms({
                acceptanceFingerprint: fingerprint('S'),
                context: operationContext(5),
                jobId: job.id,
                ownerId,
                selected: [
                    {
                        candidate: proposal.candidates[0]!.candidate,
                        rowIndex: 0,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
        await expect(
            database
                .select()
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, dictionary.id)),
        ).resolves.toHaveLength(0);
    });

    it('retries selected failures as a context-preserving successor', async () => {
        const dictionary = await createDictionary();
        const prior = await generationStore.enqueuePastedTerms({
            context: operationContext(1),
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: dictionary.version,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('R'),
            idempotencyKey: `batch-generation-${randomUUID()}`,
            ownerId,
            sharedContext: 'Art and finance vocabulary',
            text: 'canvas\nledger',
        });
        const priorClaim = await generationStore.claim({
            context: operationContext(2),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryPastedTermsGenerationFormat],
            workerId: 'batch-worker',
        });
        await generationStore.complete({
            context: operationContext(3),
            fencingToken: priorClaim!.fencingToken,
            jobId: prior.id,
            leaseDeadline: priorClaim!.leaseDeadline,
            proposal: {
                candidates: [proposal.candidates[0]!],
                failures: [
                    {
                        code: 'generation_failed',
                        input: 'ledger',
                        message: 'Try this row again.',
                        retryable: true,
                        rowIndex: 1,
                    },
                ],
                warnings: [],
            },
            reviewExpiresAt: instant(60_000),
            workerId: priorClaim!.workerId,
        });

        const successor = await generationStore.enqueuePastedTerms({
            context: operationContext(4),
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: dictionary.version,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('S'),
            idempotencyKey: `batch-generation-${randomUUID()}`,
            ownerId,
            retry: { jobId: prior.id, rowIndexes: [1] },
        });
        const successorClaim = await generationStore.claim({
            context: operationContext(5),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryPastedTermsGenerationFormat],
            workerId: 'batch-worker',
        });

        expect(successor.id).not.toBe(prior.id);
        expect(successorClaim).toMatchObject({
            id: successor.id,
            input: {
                predecessor: { jobId: prior.id, rowIndexes: [1] },
                rows: [{ input: 'ledger', rowIndex: 0 }],
                sharedContext: 'Art and finance vocabulary',
            },
        });
    });

    it('derives duplicate warnings from persisted rows and retained dictionary cards', async () => {
        const dictionary = await createDictionary();
        const existing = await dictionaryStore.createCard({
            context: operationContext(1),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'canvas',
                    transcription: null,
                    translation: 'toile existante',
                },
            },
        });
        const job = await generationStore.enqueuePastedTerms({
            context: operationContext(2),
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: existing.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('F'),
            idempotencyKey: `batch-generation-${randomUUID()}`,
            ownerId,
            sharedContext: null,
            text: 'canvas\nbank\nbank',
        });
        const claim = await generationStore.claim({
            context: operationContext(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryPastedTermsGenerationFormat],
            workerId: 'duplicate-worker',
        });
        const duplicateProposal: DictionaryBatchGenerationProposalPayload = {
            candidates: ['canvas', 'bank', 'bank'].map((source, rowIndex) => ({
                candidate: {
                    overrides,
                    values: {
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                        source,
                        transcription: null,
                        translation: `${source}-fr`,
                    },
                },
                fieldFeedback: [],
                input: source,
                rowIndex,
            })),
            failures: [],
            warnings: [],
        };
        await generationStore.complete({
            context: operationContext(4),
            fencingToken: claim!.fencingToken,
            jobId: job.id,
            leaseDeadline: claim!.leaseDeadline,
            proposal: duplicateProposal,
            reviewExpiresAt: instant(60_000),
            workerId: claim!.workerId,
        });
        await expect(
            generationStore.read({
                context: operationContext(5),
                jobId: job.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            proposal: {
                warnings: [
                    {
                        duplicateCardId: existing.card.id,
                        rowIndex: 0,
                    },
                    { duplicateCardId: null, rowIndex: 2 },
                ],
            },
        });
    });

    it('claims a supported pasted job while the single-card format circuit is open', async () => {
        const dictionary = await createDictionary();
        const created = await dictionaryStore.createCard({
            context: operationContext(1),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'existing',
                    transcription: null,
                    translation: 'existant',
                },
            },
        });
        await generationStore.enqueue({
            cardId: created.card.id,
            context: operationContext(2),
            dictionaryId: dictionary.id,
            expectedCardVersion: created.card.version,
            expectedDictionaryVersion: created.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('G'),
            idempotencyKey: `single-generation-${randomUUID()}`,
            instruction: null,
            ownerId,
        });
        const batch = await generationStore.enqueuePastedTerms({
            context: operationContext(3),
            dictionaryId: dictionary.id,
            expectedDictionaryVersion: created.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('H'),
            idempotencyKey: `batch-generation-${randomUUID()}`,
            ownerId,
            sharedContext: null,
            text: 'canvas',
        });
        await database.insert(dictionaryGenerationProviderCircuitTable).values({
            consecutiveFailures: 3,
            id: 'single-card:v1',
            openUntil: instant(60_000),
            updatedAt: instant(4),
        });

        await expect(
            generationStore.claim({
                context: operationContext(5),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 2,
                supportedFormats: [
                    'single-card:v1',
                    dictionaryPastedTermsGenerationFormat,
                ],
                workerId: 'multi-format-worker',
            }),
        ).resolves.toMatchObject({
            id: batch.id,
            input: { format: dictionaryPastedTermsGenerationFormat },
        });
    });

    it('rejects the whole selection at dictionary capacity without terminalizing review', async () => {
        const dictionary = await createDictionary();
        const job = await enqueueAndComplete(dictionary);
        await database.execute(sql`
            insert into ${dictionaryCardsTable} (
                id,
                dictionary_id,
                source,
                translation,
                normalized_source,
                sort_key,
                authorship,
                lifecycle,
                version,
                created_at,
                updated_at
            )
            select
                md5('batch-capacity-' || row_number)::uuid,
                ${dictionary.id}::uuid,
                'source-' || row_number,
                'translation-' || row_number,
                'source-' || row_number,
                row_number * 1024,
                'human',
                'active',
                1,
                ${instant(4).toISOString()}::timestamptz,
                ${instant(4).toISOString()}::timestamptz
            from generate_series(1, 10000) as row_number
        `);

        await expect(
            generationStore.acceptPastedTerms({
                acceptanceFingerprint: fingerprint('I'),
                context: operationContext(5),
                jobId: job.id,
                ownerId,
                selected: [
                    {
                        candidate: proposal.candidates[0]!.candidate,
                        rowIndex: 0,
                    },
                    {
                        candidate: proposal.candidates[1]!.candidate,
                        rowIndex: 1,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryCardCapacityError);

        const [cardCount] = await database
            .select({ value: count() })
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.dictionaryId, dictionary.id));
        const [revisionCount] = await database
            .select({ value: count() })
            .from(dictionaryCardRevisionsTable)
            .where(
                eq(dictionaryCardRevisionsTable.dictionaryId, dictionary.id),
            );
        const [persistedJob] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        const [persistedProposal] = await database
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));
        expect(cardCount?.value).toBe(10_000);
        expect(revisionCount?.value).toBe(0);
        expect(persistedJob?.inputPayload).not.toBeNull();
        expect(persistedProposal).toMatchObject({
            acceptedBatchOutcome: null,
            acceptedCandidateFingerprint: null,
            reviewState: 'reviewable',
            terminalAt: null,
        });
        expect(persistedProposal?.payload).not.toBeNull();
    });
});
