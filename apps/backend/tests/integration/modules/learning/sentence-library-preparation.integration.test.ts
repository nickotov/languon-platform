import {
    requestSentenceCancellation,
    sentenceDeletionBusy,
} from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-deletion-participant';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import {
    aiCreditActionsTable,
    aiCreditActionAttemptsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { sentencePreparationActionsTable } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-preparation-schema';
import { SentenceExerciseSchema } from '@languon/contracts';
import { isSentenceCurrent } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-persistence-support';
import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { textAiCapacityLock } from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    aiCreditAccountsTable,
    aiCreditGrantsTable,
    aiCreditReservationsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import { dictionaryAiConfigurationRevisionsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { DrizzleSentencePracticeStore } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-practice-store';
import { DrizzleSentenceWorkerStore } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-worker-store';
import { DrizzleSentenceLibraryStore } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-library-store';
import { DrizzleSentencePreparationStore } from '../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-preparation-store';
import {
    sentencePreparationsTable,
    sentencePreparationBatchesTable,
} from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-preparation-schema';
import type { SentenceLibraryAdminScope } from '../../../../src/modules/learning/application/ports/sentence-library-store';
import { SentenceLibraryDeletionBusyError } from '../../../../src/modules/learning/application/ports/sentence-library-store';
import {
    sentenceExercisesTable,
    sentenceAiJobsTable,
    sentenceExposuresTable,
    sentenceExerciseEntriesTable,
} from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import type {
    SentenceGeneratedContent,
    SentenceGenerationInput,
} from '../../../../src/modules/learning/domain/sentence-types';
import type { LearningAccess } from '../../../../src/modules/learning/application/ports/learning-store';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

/*
 * This suite deliberately composes the real stores and worker against a reset
 * PostgreSQL schema.  It does not use a provider: generated content is fed to
 * the already-admitted worker lease, preserving admission/settlement paths.
 */
const run = describe.runIf(isDatabaseIntegrationEnabled());

run('sentence library persistence', () => {
    let client: PostgresClient;
    let db: PostgresJsDatabase<typeof databaseSchema>;
    let practice: DrizzleSentencePracticeStore;
    let library: DrizzleSentenceLibraryStore;
    let administratorLibrary: DrizzleSentenceLibraryStore;
    let preparation: DrizzleSentencePreparationStore;
    let worker: DrizzleSentenceWorkerStore;
    let owner: string;
    let reader: string;
    let dictionaryId: string;
    let firstEntryId: string;
    let secondEntryId: string;
    let executionRevisionId: string;
    let administrator: string;
    const shareId = 'c'.repeat(24);
    const keyDigest = `hmac-sha256:v1:${'C'.repeat(43)}`;

    const testNow = new Date();
    const context = () => ({
        now: testNow,
        signal: new AbortController().signal,
    });
    const ownerAccess = (): LearningAccess => ({
        kind: 'owner',
        dictionaryId,
        learnerId: owner,
    });
    const readerAccess = (): LearningAccess => ({
        kind: 'shared',
        learnerId: reader,
        shareId,
        keyDigest,
    });
    const adminScope = (): SentenceLibraryAdminScope => ({
        actorId: administrator,
        actorSessionId: randomUUID(),
        targetUserId: owner,
        dictionaryId,
        audit: {
            id: randomUUID(),
            correlationId: randomUUID(),
            expiresAt: new Date(testNow.getTime() + 86400_000),
        },
    });
    const activeLibraryQuery = {
        limit: 25,
        personalArchive: 'active' as const,
        globalArchive: 'all' as const,
        contentState: 'all' as const,
    };

    function generatedContent(
        input: SentenceGenerationInput,
    ): SentenceGeneratedContent {
        const target = input.candidates[0]!;
        return {
            sourceText: target.sourceText,
            referenceTranslation: target.targetText,
            segments: [
                {
                    id: 'segment-1',
                    start: 0,
                    end: target.sourceText.length,
                    text: target.sourceText,
                    target: {
                        entryId: target.entryId,
                        occurrenceId: 'occurrence-1',
                        hintId: 'hint-1',
                    },
                },
            ],
            hints: [{ id: 'hint-1', text: target.targetText }],
            targets: [target],
        };
    }

    async function createSharedExercise(entryId = firstEntryId) {
        const response = await practice.next(
            ownerAccess(),
            {
                direction: 'source-to-target',
                mode: 'new-only',
                scope: { type: 'manual', entryIds: [entryId] },
                operationId: randomUUID(),
                sessionId: randomUUID(),
                visitedExerciseIds: [],
            },
            context(),
        );
        expect(response.kind).toBe('job');
        if (response.kind !== 'job') throw new Error('Expected generation job');
        const job = await worker.claimNext(
            {
                workerId: 'sentence-library-test',
                supportedFormats: [
                    'sentence-generation:v1',
                    'sentence-generation:v2',
                    'sentence-preparation:v1',
                    'sentence-preparation:v2',
                    'sentence-check:v1',
                ],
                learningExecutionRevision: 1,
                textAiSelectionRevision: 1,
                creditSettlementRevision: 1,
                leaseMs: 60_000,
                globalConcurrency: 10,
                learnerConcurrency: 3,
            },
            context(),
        );
        if (!job || job.kind !== 'sentence-generation')
            throw new Error('Expected claimed generation job');
        expect(await worker.markDispatched(job.lease, context())).toBe(
            'dispatch',
        );
        expect(
            await worker.completeGeneration(
                job.lease,
                {
                    content: generatedContent(job.input),
                    usage: { inputTokens: 1, outputTokens: 1 },
                },
                context(),
            ),
        ).toBe('committed');
        const result = await practice.getJob(
            ownerAccess(),
            job.lease.jobId,
            context(),
        );
        if (result.result?.kind !== 'exercise')
            throw new Error('Expected generated exercise');
        expect(
            (
                await db
                    .select({ creatorId: sentenceExercisesTable.creatorId })
                    .from(sentenceExercisesTable)
                    .where(
                        eq(
                            sentenceExercisesTable.id,
                            result.result.exercise.id,
                        ),
                    )
            )[0]?.creatorId,
        ).toBe(owner);
        return result.result.exercise.id;
    }

    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        worker = new DrizzleSentenceWorkerStore(db);
    }, 60_000);

    afterAll(async () => {
        await client?.end();
    });

    beforeEach(async () => {
        await client.unsafe('truncate users cascade');
        await seedLegacyActionFixture(db);
        owner = randomUUID();
        reader = randomUUID();
        administrator = randomUUID();
        dictionaryId = randomUUID();
        firstEntryId = randomUUID();
        secondEntryId = randomUUID();
        executionRevisionId = randomUUID();
        await db.insert(usersTable).values([
            { id: owner, status: 'active' },
            { id: reader, status: 'active' },
            { id: administrator, status: 'active' },
        ]);
        await db.insert(aiCreditAccountsTable).values([
            { userId: owner, mode: 'unlimited' },
            { userId: reader, mode: 'unlimited' },
        ]);
        await db.insert(dictionariesTable).values({
            id: dictionaryId,
            ownerId: owner,
            name: 'Sentence library',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
            visibility: 'unlisted',
            shareLocator: shareId,
            shareKeyDigest: keyDigest,
            shareKeyVersion: 1,
            shareKeyRotatedAt: context().now,
            createdAt: context().now,
            updatedAt: context().now,
        });
        await db.insert(dictionarySettingsTable).values({ dictionaryId });
        await db.insert(dictionaryCardsTable).values([
            {
                id: firstEntryId,
                dictionaryId,
                source: 'hello',
                normalizedSource: 'hello',
                translation: 'hola',
                authorship: 'human',
                sortKey: 1n,
            },
            {
                id: secondEntryId,
                dictionaryId,
                source: 'goodbye',
                normalizedSource: 'goodbye',
                translation: 'adiós',
                authorship: 'human',
                sortKey: 2n,
            },
        ]);
        const model = textAiModelCatalog[0]!;
        const snapshot: TextAiExecutionSnapshot = {
            adapterRevision: model.adapterRevision,
            aggregateBudget: {
                ...model.aggregateBudget,
                maxOutputTokensPerAttempt: model.perCallMaxOutputTokens,
            },
            credentialReference: model.credentialReference,
            creditPricing: {
                ...model.creditPricing!,
                inputCreditsPerMillionTokens: 100,
                outputCreditsPerMillionTokens: 300,
                maxCreditsPerAttempt: 10000,
            },
            enabledModelIds: [model.id],
            modelId: model.id,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            providerId: model.providerId,
            supportedFormats: [
                'sentence-generation:v1',
                'sentence-generation:v2',
                'sentence-preparation:v1',
                'sentence-preparation:v2',
                'sentence-check:v1',
            ],
        };
        await db.insert(dictionaryAiConfigurationRevisionsTable).values({
            id: executionRevisionId,
            createdByUserId: owner,
            version: 1,
            catalogSnapshot: snapshot,
        });
        practice = new DrizzleSentencePracticeStore(db, {
            resolvePreparedBatch: (tx, access, id, ctx) =>
                preparation.resolvePreparedBatch(tx, access, id, ctx),
            resolveExecution: async (_tx, _user, format) => ({
                budget: snapshot.aggregateBudget,
                revisionId: executionRevisionId,
                snapshot: { ...snapshot, supportedFormats: [format] },
                selectionVersion: 1,
            }),
        });
        library = new DrizzleSentenceLibraryStore(db);
        administratorLibrary = new DrizzleSentenceLibraryStore(db, {
            authorizeAdmin: async () => undefined,
            onAdminMutation: async () => undefined,
        });
        preparation = new DrizzleSentencePreparationStore(db, {
            authorizeAction: practice.preparePreparationAction.bind(practice),
            admitGeneration: practice.admitPreparationGeneration.bind(practice),
        });
    });

    it('keeps a personal archive personal, then excludes a globally archived example from practice', async () => {
        const exerciseId = await createSharedExercise();
        const ownerList = await library.list(
            ownerAccess(),
            activeLibraryQuery,
            context(),
        );
        expect(ownerList.items.map((item) => item.exerciseId)).toContain(
            exerciseId,
        );
        expect(ownerList.items[0]).not.toHaveProperty('creatorArchived');
        const item = ownerList.items.find(
            (entry) => entry.exerciseId === exerciseId,
        )!;
        await library.mutate(
            ownerAccess(),
            {
                operationId: randomUUID(),
                operation: 'archive',
                selection: {
                    type: 'selected',
                    items: [{ exerciseId, expectedVersion: item.version }],
                },
            },
            context(),
        );
        expect(
            (await library.list(ownerAccess(), activeLibraryQuery, context()))
                .items,
        ).toHaveLength(0);
        expect(
            (
                await library.list(
                    readerAccess(),
                    activeLibraryQuery,
                    context(),
                )
            ).items.map((entry) => entry.exerciseId),
        ).toContain(exerciseId);
        expect(
            await library.detail(ownerAccess(), exerciseId, context()),
        ).toMatchObject({ item: { exerciseId } });

        const adminItem = (
            await administratorLibrary.adminList(
                adminScope(),
                {
                    ...activeLibraryQuery,
                    relation: 'all',
                    personalArchive: 'archived',
                },
                context(),
            )
        ).items.find((entry) => entry.exerciseId === exerciseId)!;
        expect(adminItem).toMatchObject({ creatorArchived: true });
        await administratorLibrary.adminMutate(
            adminScope(),
            {
                operationId: randomUUID(),
                operation: 'global-archive',
                reason: 'Synthetic sentence-library visibility test',
                selection: {
                    type: 'selected',
                    items: [
                        {
                            exerciseId,
                            expectedVersion: adminItem.version,
                        },
                    ],
                },
            },
            context(),
        );
        await expect(
            practice.next(
                readerAccess(),
                {
                    direction: 'source-to-target',
                    mode: 'review-only',
                    scope: { type: 'manual', entryIds: [firstEntryId] },
                    operationId: randomUUID(),
                    sessionId: randomUUID(),
                    visitedExerciseIds: [],
                },
                context(),
            ),
        ).resolves.toMatchObject({ kind: 'empty' });
        const exposureBefore = await db
            .select()
            .from(sentenceExposuresTable)
            .where(eq(sentenceExposuresTable.exerciseId, exerciseId));
        expect(exposureBefore).toHaveLength(1);
    });

    it('uses an all-matching snapshot as a stable bulk selection and replays its receipt safely', async () => {
        const exerciseId = await createSharedExercise();
        const snapshot = await library.snapshot(
            ownerAccess(),
            {
                operation: 'archive',
                query: {
                    personalArchive: 'active',
                    globalArchive: 'all',
                    contentState: 'all',
                },
            },
            context(),
        );
        expect(snapshot.matchingCount).toBe(1);
        const operationId = randomUUID();
        const input = {
            operationId,
            operation: 'archive' as const,
            selection: {
                type: 'all-matching' as const,
                snapshotToken: snapshot.snapshotToken,
            },
        };
        await expect(
            library.mutate(ownerAccess(), input, context()),
        ).resolves.toEqual({
            operationId,
            affectedCount: 1,
        });
        await expect(
            library.mutate(ownerAccess(), input, context()),
        ).resolves.toEqual({
            operationId,
            affectedCount: 1,
        });
        await expect(
            library.mutate(
                ownerAccess(),
                { ...input, operation: 'restore' },
                context(),
            ),
        ).rejects.toMatchObject({ reason: 'operation_conflict' });
        expect(
            (
                await library.list(
                    ownerAccess(),
                    {
                        limit: 25,
                        personalArchive: 'archived',
                        globalArchive: 'all',
                        contentState: 'all',
                    },
                    context(),
                )
            ).items.map((item) => item.exerciseId),
        ).toEqual([exerciseId]);
    });

    it('discovers only sentence-relevant dictionaries for the administrative target', async () => {
        await createSharedExercise();
        const { dictionaryId: _dictionaryId, ...discoveryScope } = adminScope();
        await expect(
            administratorLibrary.adminDictionaries(
                discoveryScope,
                { limit: 25 },
                context(),
            ),
        ).resolves.toMatchObject({
            items: [
                {
                    dictionaryId,
                    title: 'Sentence library',
                    generatedCount: 1,
                },
            ],
            nextCursor: null,
        });
    });

    it('permanently deletes only a creator-archived settled exercise while retaining credit accounting', async () => {
        const exerciseId = await createSharedExercise();
        const ownerItem = (
            await library.list(ownerAccess(), activeLibraryQuery, context())
        ).items.find((item) => item.exerciseId === exerciseId)!;
        await library.mutate(
            ownerAccess(),
            {
                operationId: randomUUID(),
                operation: 'archive',
                selection: {
                    type: 'selected',
                    items: [{ exerciseId, expectedVersion: ownerItem.version }],
                },
            },
            context(),
        );
        const adminItem = (
            await administratorLibrary.adminList(
                adminScope(),
                {
                    ...activeLibraryQuery,
                    relation: 'all',
                    personalArchive: 'archived',
                },
                context(),
            )
        ).items[0]!;
        const reservationsBefore = await db
            .select()
            .from(aiCreditReservationsTable);
        await administratorLibrary.adminMutate(
            adminScope(),
            {
                operationId: randomUUID(),
                operation: 'delete',
                reason: 'Synthetic irreversible deletion test',
                selection: {
                    type: 'selected',
                    items: [{ exerciseId, expectedVersion: adminItem.version }],
                },
            },
            context(),
        );
        expect(await db.select().from(sentenceExercisesTable)).toHaveLength(0);
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
        expect(await db.select().from(aiCreditReservationsTable)).toEqual(
            reservationsBefore,
        );
    });

    it('rejects permanent deletion while a dependent check job is unsettled', async () => {
        const exerciseId = await createSharedExercise();
        const ownerItem = (
            await library.list(ownerAccess(), activeLibraryQuery, context())
        ).items[0]!;
        await practice.enqueueCheck(
            ownerAccess(),
            exerciseId,
            {
                operationId: randomUUID(),
                sessionId: randomUUID(),
                answer: 'hola',
                explanationLanguage: 'en',
                revealedHintIds: [],
            },
            context(),
        );
        await library.mutate(
            ownerAccess(),
            {
                operationId: randomUUID(),
                operation: 'archive',
                selection: {
                    type: 'selected',
                    items: [{ exerciseId, expectedVersion: ownerItem.version }],
                },
            },
            context(),
        );
        const adminItem = (
            await administratorLibrary.adminList(
                adminScope(),
                {
                    ...activeLibraryQuery,
                    relation: 'all',
                    personalArchive: 'archived',
                },
                context(),
            )
        ).items[0]!;
        await expect(
            administratorLibrary.adminMutate(
                adminScope(),
                {
                    operationId: randomUUID(),
                    operation: 'delete',
                    reason: 'Busy deletion test',
                    selection: {
                        type: 'selected',
                        items: [
                            { exerciseId, expectedVersion: adminItem.version },
                        ],
                    },
                },
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceLibraryDeletionBusyError);
    });

    it('partitions a large dictionary and admits at most one preparation child without exposing it as practice', async () => {
        const extraEntries = Array.from({ length: 99 }, (_, index) => ({
            id: randomUUID(),
            dictionaryId,
            source: `word-${index}`,
            normalizedSource: `word-${index}`,
            translation: `palabra-${index}`,
            authorship: 'human' as const,
            sortKey: BigInt(index + 3),
        }));
        await db.insert(dictionaryCardsTable).values(extraEntries);
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: {
                    type: 'manual',
                    entryIds: [firstEntryId, secondEntryId],
                },
            },
            context(),
        );
        expect(started.batchCount).toBe(2);
        expect(started.initialBatch?.entryIds).toEqual([
            firstEntryId,
            secondEntryId,
        ]);

        expect(await preparation.tick(context())).toBe(true);
        const admitted = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(admitted.state).toBe('running');
        expect(admitted.activeJobId).not.toBeNull();

        // A second coordinator tick must observe the active child rather than
        // enqueueing a concurrent paid generation attempt.
        expect(await preparation.tick(context())).toBe(true);
        const afterSecondTick = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(afterSecondTick.activeJobId).toBe(admitted.activeJobId);

        const job = await worker.claimNext(
            {
                workerId: 'sentence-preparation-test',
                supportedFormats: [
                    'sentence-generation:v1',
                    'sentence-generation:v2',
                    'sentence-preparation:v1',
                    'sentence-preparation:v2',
                    'sentence-check:v1',
                ],
                learningExecutionRevision: 1,
                textAiSelectionRevision: 1,
                creditSettlementRevision: 1,
                leaseMs: 60_000,
                globalConcurrency: 10,
                learnerConcurrency: 3,
            },
            context(),
        );
        if (!job || job.kind !== 'sentence-generation')
            throw new Error('Expected preparation generation job');
        expect(job.format).toMatch(/^sentence-preparation:v[12]$/);
        await worker.markDispatched(job.lease, context());
        expect(
            await worker.completeGeneration(
                job.lease,
                {
                    content: generatedContent(job.input),
                    usage: { inputTokens: 1, outputTokens: 1 },
                },
                context(),
            ),
        ).toBe('committed');
        expect(await preparation.tick(context())).toBe(true);
        const progressed = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(progressed.preparedCount).toBe(1);
        expect(await db.select().from(sentenceExposuresTable)).toHaveLength(0);
    });
    it('completed preparation projects stale after a selected word changes', async () => {
        await createSharedExercise();
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'review-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        for (let i = 0; i < 4; i++) await preparation.tick(context());
        expect(
            (await preparation.get(ownerAccess(), started.id, context())).state,
        ).toBe('completed');
        await db
            .update(dictionaryCardsTable)
            .set({
                learningVersion: 2,
                source: 'changed',
                normalizedSource: 'changed',
            })
            .where(eq(dictionaryCardsTable.id, firstEntryId));
        const stale = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(stale).toMatchObject({
            state: 'paused',
            pauseReason: 'stale',
            preparedCount: 0,
        });
        await expect(
            preparation.batch(
                ownerAccess(),
                started.initialBatch!.id,
                context(),
            ),
        ).rejects.toThrow('stale_content');
    });
    it('Stop cancels a running child, retains earlier usable coverage, and requires explicit Continue', async () => {
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        const claim = () =>
            worker.claimNext(
                {
                    workerId: 'stop-parent-proof',
                    supportedFormats: [
                        'sentence-preparation:v1',
                        'sentence-preparation:v2',
                    ],
                    learningExecutionRevision: 1,
                    textAiSelectionRevision: 1,
                    creditSettlementRevision: 1,
                    leaseMs: 60000,
                    globalConcurrency: 10,
                    learnerConcurrency: 3,
                },
                context(),
            );
        await preparation.tick(context());
        const first = await claim();
        if (!first || first.kind !== 'sentence-generation')
            throw new Error('Expected first usable child');
        await worker.markDispatched(first.lease, context());
        await worker.completeGeneration(
            first.lease,
            {
                content: generatedContent(first.input),
                usage: { inputTokens: 1, outputTokens: 1 },
            },
            context(),
        );
        await preparation.tick(context());
        await preparation.tick(context());
        const second = await claim();
        if (!second || second.kind !== 'sentence-generation')
            throw new Error('Expected next running child');
        await worker.markDispatched(second.lease, context());
        const stopped = await preparation.command(
            ownerAccess(),
            started.id,
            { operationId: randomUUID(), action: 'stop' },
            context(),
        );
        expect(stopped.state).toBe('stopping');
        expect(
            (
                await db
                    .select()
                    .from(sentenceAiJobsTable)
                    .where(eq(sentenceAiJobsTable.id, second.lease.jobId))
            )[0]!.cancellationRequestedAt,
        ).not.toBeNull();
        await expect(
            preparation.command(
                ownerAccess(),
                started.id,
                { operationId: randomUUID(), action: 'resume' },
                context(),
            ),
        ).rejects.toThrow('stale_content');
        expect(
            await worker.completeGeneration(
                second.lease,
                {
                    content: generatedContent(second.input),
                    usage: { inputTokens: 1, outputTokens: 1 },
                },
                context(),
            ),
        ).toBe('terminalized');
        await preparation.tick(context());
        const paused = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(paused).toMatchObject({
            state: 'paused',
            pauseReason: 'user',
            preparedCount: 1,
            activeJobId: null,
            requiresNewBudget: true,
        });
        await expect(
            preparation.command(
                ownerAccess(),
                started.id,
                { operationId: randomUUID(), action: 'resume' },
                context(),
            ),
        ).rejects.toThrow();
        await preparation.command(
            ownerAccess(),
            started.id,
            { operationId: randomUUID(), action: 'continue' },
            context(),
        );
        await preparation.tick(context());
        const continued = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(continued.preparedCount).toBe(1);
        expect(continued.activeJobId).not.toBe(second.lease.jobId);
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(3);
    });
    it('discovers the second bounded preparation round and never generates during partial practice', async () => {
        const extra = Array.from({ length: 99 }, (_, index) => ({
            id: randomUUID(),
            dictionaryId,
            source: `other-${index}`,
            normalizedSource: `other-${index}`,
            translation: `otro-${index}`,
            authorship: 'human' as const,
            sortKey: BigInt(index + 3),
        }));
        await db.insert(dictionaryCardsTable).values(extra);
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'review-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        const first = await preparation.listBatches(
            ownerAccess(),
            started.id,
            { offset: 0, limit: 1 },
            context(),
        );
        expect(first.items[0]!.entryIds).toHaveLength(100);
        expect(first.nextOffset).toBe(1);
        const second = await preparation.listBatches(
            ownerAccess(),
            started.id,
            { offset: first.nextOffset!, limit: 1 },
            context(),
        );
        expect(second.items[0]!.entryIds).toHaveLength(1);
        expect(second.nextOffset).toBeNull();
        const result = await practice.next(
            ownerAccess(),
            {
                direction: 'source-to-target',
                mode: 'new-only',
                scope: { type: 'all' },
                preparedBatchId: second.items[0]!.id,
                operationId: randomUUID(),
                sessionId: randomUUID(),
                visitedExerciseIds: [],
            },
            context(),
        );
        expect(result.kind).toBe('empty');
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
    });
    it('bounds retained snapshots and preserves old resumable preparations', async () => {
        for (let i = 0; i < 20; i++) {
            const started = await preparation.start(
                ownerAccess(),
                {
                    operationId: randomUUID(),
                    direction: 'source-to-target',
                    mode: 'review-only',
                    initialRoundScope: { type: 'all' },
                },
                context(),
            );
            await db
                .update(sentencePreparationsTable)
                .set({
                    state: 'paused',
                    pauseReason: 'user',
                    updatedAt: new Date('2026-09-01T00:00:00Z'),
                })
                .where(eq(sentencePreparationsTable.id, started.id));
        }
        expect(await preparation.tick(context())).toBe(false);
        expect(
            await db.select().from(sentencePreparationBatchesTable),
        ).toHaveLength(20);
        await expect(
            preparation.start(
                ownerAccess(),
                {
                    operationId: randomUUID(),
                    direction: 'source-to-target',
                    mode: 'review-only',
                    initialRoundScope: { type: 'all' },
                },
                context(),
            ),
        ).rejects.toThrow('temporarily unavailable');
    });
    it('expires settled inactive snapshots while preserving operation replay identity', async () => {
        const request = {
            operationId: randomUUID(),
            direction: 'source-to-target' as const,
            mode: 'review-only' as const,
            initialRoundScope: { type: 'all' as const },
        };
        const started = await preparation.start(
            ownerAccess(),
            request,
            context(),
        );
        await db
            .update(sentencePreparationsTable)
            .set({
                state: 'completed',
                updatedAt: new Date('2026-09-01T00:00:00Z'),
            })
            .where(eq(sentencePreparationsTable.id, started.id));
        expect(await preparation.tick(context())).toBe(true);
        expect(
            await db.select().from(sentencePreparationBatchesTable),
        ).toHaveLength(0);
        const replay = await preparation.start(
            ownerAccess(),
            request,
            context(),
        );
        expect(replay).toMatchObject({
            id: started.id,
            state: 'paused',
            pauseReason: 'stale',
            batchCount: 0,
            activeJobId: null,
        });
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
    });
    it('scans saved examples in bounded durable pages without prematurely generating', async () => {
        const originalId = await createSharedExercise();
        const [original] = await db
            .select()
            .from(sentenceExercisesTable)
            .where(eq(sentenceExercisesTable.id, originalId));
        const duplicates = Array.from({ length: 100 }, (_, index) => {
            const id = randomUUID();
            return {
                ...original!,
                id,
                publicContent: { ...original!.publicContent, id },
                createdAt: new Date(context().now.getTime() + index + 1),
            };
        });
        await db.insert(sentenceExercisesTable).values(duplicates);
        const [originalEntry] = await db
            .select()
            .from(sentenceExerciseEntriesTable)
            .where(eq(sentenceExerciseEntriesTable.exerciseId, originalId));
        await db.insert(sentenceExerciseEntriesTable).values(
            duplicates.map((exercise) => ({
                ...originalEntry!,
                exerciseId: exercise.id,
                dictionaryId,
                entryId: firstEntryId,
                learningVersion: 1,
            })),
        );
        const laterId = await createSharedExercise(secondEntryId);
        await db
            .update(sentenceExercisesTable)
            .set({ createdAt: new Date(context().now.getTime() + 1000) })
            .where(eq(sentenceExercisesTable.id, laterId));
        expect(
            SentenceExerciseSchema.safeParse(original!.publicContent).success,
        ).toBe(true);
        expect(
            await db.transaction((tx) => isSentenceCurrent(tx, originalId)),
        ).toBe(true);
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'saved-first',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        await preparation.tick(context());
        const first = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(first).toMatchObject({ preparedCount: 1, activeJobId: null });
        expect(
            (await db.select().from(sentencePreparationBatchesTable))[0]!
                .scanCursor,
        ).not.toBeNull();
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(2);
        await preparation.tick(context());
        const second = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(second).toMatchObject({ preparedCount: 2, activeJobId: null });
        expect(second.initialBatch!.exerciseIds).toContain(laterId);
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(2);
    });
    it('rejects an unfunded parent before background work and creates one hold after an explicit funded Start', async () => {
        await db
            .update(aiCreditAccountsTable)
            .set({ mode: 'limited', unlimitedUntil: null })
            .where(eq(aiCreditAccountsTable.userId, owner));
        const input = {
            operationId: randomUUID(),
            direction: 'source-to-target' as const,
            mode: 'new-only' as const,
            initialRoundScope: { type: 'all' as const },
        };
        await expect(
            preparation.start(ownerAccess(), input, context()),
        ).rejects.toThrow();
        expect(await db.select().from(sentencePreparationsTable)).toHaveLength(
            0,
        );
        expect(await db.select().from(aiCreditActionsTable)).toHaveLength(0);
        await db.insert(aiCreditGrantsTable).values({
            id: randomUUID(),
            ownerId: owner,
            amount: 20000n,
            source: 'admin',
            sourceReference: 'synthetic-parent-budget',
            createdAt: context().now,
        });
        const started = await preparation.start(
            ownerAccess(),
            input,
            context(),
        );
        await preparation.tick(context());
        await preparation.tick(context());
        const parent = await db.select().from(aiCreditActionsTable);
        expect(parent).toHaveLength(1);
        expect(parent[0]!.heldMilli).toBeGreaterThan(0n);
        expect(parent[0]!.heldMilli).toBeLessThanOrEqual(20000n);
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(1);
        expect(
            (await preparation.get(ownerAccess(), started.id, context()))
                .billing?.state,
        ).toBe('held');
    });
    it('closes an idle parent after account lifecycle cancellation before allowing private erasure', async () => {
        await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        const scope = {
            learnerId: owner,
            dictionaryIds: [dictionaryId],
            accountPurge: true,
        };
        await db.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(${textAiCapacityLock})`,
            );
            await requestSentenceCancellation(tx, {
                ...scope,
                now: context().now,
            });
            await tx
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            expect(await sentenceDeletionBusy(tx, scope)).toBe(true);
        });
        await preparation.tick(context());
        expect((await db.select().from(aiCreditActionsTable))[0]).toMatchObject(
            { state: 'settled', outcome: 'failure', chargedMilli: 0n },
        );
        expect(
            await db.transaction((tx) => sentenceDeletionBusy(tx, scope)),
        ).toBe(false);
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
    });
    it('recovers an expired paused parent without refreshing its authorization', async () => {
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        await db
            .update(sentencePreparationsTable)
            .set({ state: 'paused', pauseReason: 'capacity' })
            .where(eq(sentencePreparationsTable.id, started.id));
        await preparation.tick({
            ...context(),
            now: new Date(context().now.getTime() + 16 * 60000),
        });
        const [parent] = await db.select().from(aiCreditActionsTable);
        expect(parent).toMatchObject({
            state: 'settled',
            outcome: 'failure',
            chargedMilli: 0n,
        });
        expect(
            await preparation.get(ownerAccess(), started.id, context()),
        ).toMatchObject({
            state: 'paused',
            pauseReason: 'budget',
            requiresNewBudget: true,
        });
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
    });
    it('shares the single safe automatic retry across all preparation children', async () => {
        await db
            .update(aiCreditAccountsTable)
            .set({ mode: 'limited', unlimitedUntil: null })
            .where(eq(aiCreditAccountsTable.userId, owner));
        await db.insert(aiCreditGrantsTable).values({
            id: randomUUID(),
            ownerId: owner,
            amount: 100000n,
            source: 'admin',
            sourceReference: 'synthetic-parent-retry',
            createdAt: context().now,
        });
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: { type: 'manual', entryIds: [firstEntryId] },
            },
            context(),
        );
        const claim = () =>
            worker.claimNext(
                {
                    workerId: 'shared-parent-retry',
                    supportedFormats: [
                        'sentence-preparation:v1',
                        'sentence-preparation:v2',
                    ],
                    learningExecutionRevision: 1,
                    textAiSelectionRevision: 1,
                    creditSettlementRevision: 1,
                    leaseMs: 60000,
                    globalConcurrency: 10,
                    learnerConcurrency: 3,
                },
                context(),
            );
        await preparation.tick(context());
        const first = await claim();
        if (!first || first.kind !== 'sentence-generation')
            throw new Error('Expected first child');
        await worker.markDispatched(first.lease, context());
        await worker.fail(
            first.lease,
            {
                code: 'invalid_model_output',
                retryAt: context().now,
                usage: { inputTokens: 1, outputTokens: 1 },
            },
            context(),
        );
        const retry = await claim();
        if (!retry || retry.kind !== 'sentence-generation')
            throw new Error('Expected single safe retry');
        expect(retry.lease.jobId).toBe(first.lease.jobId);
        expect(retry.lease.attempt).toBe(2);
        await worker.markDispatched(retry.lease, context());
        await worker.completeGeneration(
            retry.lease,
            {
                content: generatedContent(retry.input),
                usage: { inputTokens: 1, outputTokens: 1 },
            },
            context(),
        );
        await preparation.tick(context());
        await preparation.tick(context());
        const next = await claim();
        if (!next || next.kind !== 'sentence-generation')
            throw new Error('Expected another necessary child');
        expect(
            (
                await db
                    .select()
                    .from(sentenceAiJobsTable)
                    .where(eq(sentenceAiJobsTable.id, next.lease.jobId))
            )[0]!.maxAttempts,
        ).toBe(1);
        await worker.markDispatched(next.lease, context());
        await worker.fail(
            next.lease,
            {
                code: 'invalid_model_output',
                retryAt: context().now,
                usage: { inputTokens: 1, outputTokens: 1 },
            },
            context(),
        );
        expect(await claim()).toBeNull();
        await preparation.tick(context());
        const [settled] = await db.select().from(aiCreditActionsTable);
        expect(settled).toMatchObject({
            state: 'settled',
            outcome: 'success',
            chargedMilli: 1n,
        });
        expect(
            await db.select().from(aiCreditActionAttemptsTable),
        ).toHaveLength(3);
        expect(
            (await preparation.get(ownerAccess(), started.id, context()))
                .requiresNewBudget,
        ).toBe(true);
    });
    it('keeps multiple successful batches within one pinned parent and rejects a stale coordinator fence', async () => {
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: { type: 'manual', entryIds: [firstEntryId] },
            },
            context(),
        );
        const [parent] = await db.select().from(aiCreditActionsTable);
        for (let index = 0; index < 2; index++) {
            await preparation.tick(context());
            const child = await worker.claimNext(
                {
                    workerId: 'multi-batch-parent',
                    supportedFormats: [
                        'sentence-preparation:v1',
                        'sentence-preparation:v2',
                    ],
                    learningExecutionRevision: 1,
                    textAiSelectionRevision: 1,
                    creditSettlementRevision: 1,
                    leaseMs: 60000,
                    globalConcurrency: 10,
                    learnerConcurrency: 3,
                },
                context(),
            );
            if (!child || child.kind !== 'sentence-generation')
                throw new Error('Expected another authorized child');
            await worker.markDispatched(child.lease, context());
            await worker.completeGeneration(
                child.lease,
                {
                    content: generatedContent(child.input),
                    usage: { inputTokens: 1, outputTokens: 1 },
                },
                context(),
            );
            await preparation.tick(context());
        }
        await preparation.tick(context());
        expect(await db.select().from(aiCreditActionsTable)).toHaveLength(1);
        expect((await db.select().from(aiCreditActionsTable))[0]).toMatchObject(
            { state: 'settled', outcome: 'success' },
        );
        expect(
            await db.select().from(aiCreditActionAttemptsTable),
        ).toHaveLength(2);
        const childRows = await db.select().from(sentenceAiJobsTable);
        expect(childRows).toHaveLength(2);
        expect(
            childRows.every(
                (child) =>
                    (
                        child.selectedExecutionSnapshot as {
                            actionParentId?: string;
                        }
                    ).actionParentId === parent!.id,
            ),
        ).toBe(true);
        const [batch] = await db.select().from(sentencePreparationBatchesTable);
        await expect(
            db.execute(
                sql`select languon_admit_sentence_preparation_child(${started.id}::uuid,${batch!.id}::uuid,0::bigint,${context().now.toISOString()}::timestamptz)`,
            ),
        ).rejects.toThrow();
        expect(
            (await preparation.get(ownerAccess(), started.id, context()))
                .preparedCount,
        ).toBe(2);
    });
    it('shares one parent across batches, pauses at its total output limit, and requires explicit Continue', async () => {
        const started = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: { type: 'manual', entryIds: [firstEntryId] },
            },
            context(),
        );
        await preparation.tick(context());
        const [parent] = await db.select().from(aiCreditActionsTable);
        const claimed = await worker.claimNext(
            {
                workerId: 'parent-budget-proof',
                supportedFormats: [
                    'sentence-preparation:v1',
                    'sentence-preparation:v2',
                ],
                learningExecutionRevision: 1,
                textAiSelectionRevision: 1,
                creditSettlementRevision: 1,
                leaseMs: 60000,
                globalConcurrency: 10,
                learnerConcurrency: 3,
            },
            context(),
        );
        if (!claimed || claimed.kind !== 'sentence-generation')
            throw new Error('Expected pinned preparation child');
        await worker.markDispatched(claimed.lease, context());
        await worker.completeGeneration(
            claimed.lease,
            {
                content: generatedContent(claimed.input),
                usage: { inputTokens: 1, outputTokens: parent!.outputLimit },
            },
            context(),
        );
        await preparation.tick(context());
        await preparation.tick(context());
        const paused = await preparation.get(
            ownerAccess(),
            started.id,
            context(),
        );
        expect(paused).toMatchObject({
            state: 'paused',
            pauseReason: 'budget',
            requiresNewBudget: true,
            remainingOutputTokens: 0,
            preparedCount: 1,
        });
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(1);
        expect(await db.select().from(aiCreditActionsTable)).toHaveLength(1);
        expect(
            await db.select().from(aiCreditActionAttemptsTable),
        ).toHaveLength(1);
        await expect(
            preparation.command(
                ownerAccess(),
                started.id,
                { operationId: randomUUID(), action: 'resume' },
                context(),
            ),
        ).rejects.toThrow();
        const continuation = {
            operationId: randomUUID(),
            action: 'continue' as const,
        };
        await preparation.command(
            ownerAccess(),
            started.id,
            continuation,
            context(),
        );
        await preparation.command(
            ownerAccess(),
            started.id,
            continuation,
            context(),
        );
        await preparation.tick(context());
        expect(await db.select().from(aiCreditActionsTable)).toHaveLength(2);
        expect(
            await db.select().from(sentencePreparationActionsTable),
        ).toHaveLength(2);
        const children = await db.select().from(sentenceAiJobsTable);
        expect(children).toHaveLength(2);
        expect(
            children.filter(
                (child) =>
                    (
                        child.selectedExecutionSnapshot as {
                            actionParentId?: string;
                        }
                    ).actionParentId === parent!.id,
            ),
        ).toHaveLength(1);
        expect(
            (await db.select().from(aiCreditActionsTable)).find(
                (action) => action.id === parent!.id,
            )?.state,
        ).toBe('settled');
    });
    it('starting preparation cannot monopolize the global AI admission lock', async () => {
        let unblock!: () => void;
        const gate = new Promise<void>((resolve) => {
            unblock = resolve;
        });
        let signalLocked!: (pid: number) => void;
        const locked = new Promise<number>((resolve) => {
            signalLocked = resolve;
        });
        const blocking = db.transaction(async (tx) => {
            await tx
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, owner))
                .for('update');
            const [backend] = await tx.execute<{ pid: number }>(
                sql`select pg_backend_pid() as pid`,
            );
            signalLocked(backend!.pid);
            await gate;
        });
        const blockerPid = await locked;
        const starting = preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        try {
            await expect
                .poll(
                    async () => {
                        const [waiting] = await db.execute<{
                            blocked: boolean;
                        }>(
                            sql`select exists(select 1 from pg_stat_activity a where ${blockerPid} = any(pg_blocking_pids(a.pid))) as blocked`,
                        );
                        return waiting!.blocked;
                    },
                    { timeout: 5000 },
                )
                .toBe(true);
            const available = await db.transaction(async (tx) => {
                const [result] = await tx.execute<{ available: boolean }>(
                    sql`select pg_try_advisory_xact_lock(${textAiCapacityLock}) as available`,
                );
                return result!.available;
            });
            expect(available).toBe(true);
        } finally {
            unblock();
            await blocking;
            await starting;
        }
    });
    it('expired content is pruned even while another learner has active work', async () => {
        const old = await preparation.start(
            ownerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'review-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        await db
            .update(sentencePreparationsTable)
            .set({
                state: 'completed',
                updatedAt: new Date('2026-09-01T00:00:00Z'),
            })
            .where(eq(sentencePreparationsTable.id, old.id));
        const active = await preparation.start(
            readerAccess(),
            {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'review-only',
                initialRoundScope: { type: 'all' },
            },
            context(),
        );
        expect(active.state).toBe('queued');
        await preparation.tick(context());
        expect(
            await db
                .select()
                .from(sentencePreparationBatchesTable)
                .where(
                    eq(sentencePreparationBatchesTable.preparationId, old.id),
                ),
        ).toHaveLength(0);
        expect(
            (await preparation.get(ownerAccess(), old.id, context()))
                .pauseReason,
        ).toBe('stale');
        expect(
            await db
                .select()
                .from(sentencePreparationBatchesTable)
                .where(
                    eq(
                        sentencePreparationBatchesTable.preparationId,
                        active.id,
                    ),
                ),
        ).toHaveLength(1);
    });
    it('returns the explicit stale tombstone for an expired shared preparation', async () => {
        const request = {
            operationId: randomUUID(),
            direction: 'source-to-target' as const,
            mode: 'review-only' as const,
            initialRoundScope: { type: 'all' as const },
        };
        const started = await preparation.start(
            readerAccess(),
            request,
            context(),
        );
        await db
            .update(sentencePreparationsTable)
            .set({
                state: 'completed',
                updatedAt: new Date('2026-09-01T00:00:00Z'),
            })
            .where(eq(sentencePreparationsTable.id, started.id));
        await preparation.tick(context());
        expect(
            await preparation.get(readerAccess(), started.id, context()),
        ).toMatchObject({
            state: 'paused',
            pauseReason: 'stale',
            batchCount: 0,
        });
        expect(
            await preparation.start(readerAccess(), request, context()),
        ).toMatchObject({
            id: started.id,
            state: 'paused',
            pauseReason: 'stale',
        });
        await expect(
            preparation.command(
                readerAccess(),
                started.id,
                { operationId: randomUUID(), action: 'resume' },
                context(),
            ),
        ).rejects.toThrow('stale_content');
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
    });
});
