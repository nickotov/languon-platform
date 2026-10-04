import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    dictionaryGenerationProviderCircuitTable as circuits,
    dictionaryGenerationJobsTable,
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    aiCreditAccountsTable,
    aiCreditReservationsTable,
} from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { textAiCapacityObservationId } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleSentencePracticeStore } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-practice-store';
import { DrizzleSentenceWorkerStore } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-worker-store';
import {
    sentenceAiJobsTable,
    sentenceExercisesTable,
    sentenceEntryCoverageTable,
    sentenceJobEntriesTable,
    sentenceNextReceiptsTable,
    sentenceManualReviewsTable,
} from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import {
    eraseSentenceDerivedContent,
    requestSentenceCancellation,
    sentenceDeletionBusy,
} from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-deletion-participant';
import {
    isTextAiCircuitOpen,
    recordTextAiCircuitFailure,
    textAiCircuitKey,
} from '../../../../../src/infrastructure/text-ai/text-ai-circuit';
import { lockTextAiCapacity } from '../../../../../src/infrastructure/text-ai/text-ai-capacity';
import {
    SentenceConflictError,
    SentenceUnavailableError,
    SentenceModelUnavailableError,
    SentenceCapacityUnavailableError,
} from '../../../../../src/modules/learning/domain/sentence-errors';
import type {
    SentenceGenerationInput,
    SentenceGeneratedContent,
} from '../../../../../src/modules/learning/domain/sentence-types';
import type { LearningAccess } from '../../../../../src/modules/learning/application/ports/learning-store';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';
const run = describe.runIf(isDatabaseIntegrationEnabled());
run('sentence persistence', () => {
    let client: PostgresClient;
    let db: PostgresJsDatabase<typeof databaseSchema>;
    let store: DrizzleSentencePracticeStore;
    let worker: DrizzleSentenceWorkerStore;
    let owner: string;
    let reader: string;
    let dictionaryId: string;
    let a: string;
    let b: string;
    let revisionId: string;
    let executionOverride: TextAiExecutionSnapshot | null = null;
    const shareId = 'b'.repeat(24),
        keyDigest = `hmac-sha256:v1:${'B'.repeat(43)}`;
    const context = () => ({
        now: new Date(),
        signal: new AbortController().signal,
    });
    const access = (id = owner): LearningAccess =>
        id === owner
            ? { kind: 'owner', dictionaryId, learnerId: id }
            : { kind: 'shared', shareId, keyDigest, learnerId: id };
    const config = {
        direction: 'source-to-target' as const,
        mode: 'new-only' as const,
        scope: { type: 'all' as const },
    };
    const next = (overrides = {}) => ({
        ...config,
        operationId: randomUUID(),
        sessionId: randomUUID(),
        visitedExerciseIds: [],
        ...overrides,
    });
    const claim = () =>
        worker.claimNext(
            {
                workerId: 'sentence-persistence-fixture',
                supportedFormats: [
                    'sentence-generation:v1',
                    'sentence-check:v1',
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
    function content(
        input: SentenceGenerationInput,
        targets = input.candidates.slice(0, 2),
    ): SentenceGeneratedContent {
        return {
            sourceText: 'hello goodbye',
            referenceTranslation: 'hola adiós',
            segments: [
                {
                    id: 'segment-1',
                    start: 0,
                    end: 5,
                    text: 'hello',
                    target: {
                        entryId: targets[0]!.entryId,
                        occurrenceId: 'occurrence-1',
                        hintId: 'hint-1',
                    },
                },
                { id: 'segment-2', start: 5, end: 6, text: ' ', target: null },
                {
                    id: 'segment-3',
                    start: 6,
                    end: 13,
                    text: 'goodbye',
                    target:
                        targets.length > 1
                            ? {
                                  entryId: targets[1]!.entryId,
                                  occurrenceId: 'occurrence-2',
                                  hintId: 'hint-2',
                              }
                            : null,
                },
            ],
            hints: targets.map((_, i) => ({
                id: `hint-${i + 1}`,
                text: i === 0 ? 'hola' : 'adiós',
            })),
            targets,
        };
    }
    async function generated(id = owner, targetCount = 2) {
        const response = await store.next(access(id), next(), context());
        expect(response.kind).toBe('job');
        const job = await claim();
        expect(job?.kind).toBe('sentence-generation');
        if (!job || job.kind !== 'sentence-generation')
            throw new Error('No generation');
        expect(await worker.markDispatched(job.lease, context())).toBe(
            'dispatch',
        );
        expect(
            await worker.completeGeneration(
                job.lease,
                {
                    content: content(
                        job.input,
                        job.input.candidates.slice(0, targetCount),
                    ),
                    usage: { inputTokens: 100, outputTokens: 20 },
                },
                context(),
            ),
        ).toBe('committed');
        const result = await store.getJob(
            access(id),
            job.lease.jobId,
            context(),
        );
        if (result.result?.kind !== 'exercise') throw new Error('No exercise');
        return { exercise: result.result.exercise, lease: job.lease };
    }

    async function seedDictionaryJob(actorId = owner) {
        const id = randomUUID(),
            entryId = randomUUID();
        await db.insert(dictionariesTable).values({
            id,
            ownerId: actorId,
            name: 'Capacity cohort',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
            createdAt: new Date('2026-01-01T00:00:00Z'),
        });
        await db.insert(dictionarySettingsTable).values({ dictionaryId: id });
        await db.insert(dictionaryCardsTable).values({
            id: entryId,
            dictionaryId: id,
            source: 'hello',
            normalizedSource: 'hello',
            translation: 'hola',
            authorship: 'human',
            sortKey: 1024n,
        });
        const model = textAiModelCatalog[1]!,
            capturedRevision = randomUUID(),
            at = new Date();
        const snapshot: TextAiExecutionSnapshot = {
            adapterRevision: model.adapterRevision,
            aggregateBudget: model.aggregateBudget,
            credentialReference: model.credentialReference,
            creditPricing: model.creditPricing,
            enabledModelIds: textAiModelCatalog.map((m) => m.id),
            modelId: model.id,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            providerId: model.providerId,
            supportedFormats: [...model.supportedFormats],
        };
        await db
            .insert(dictionaryAiConfigurationRevisionsTable)
            .values({
                id: capturedRevision,
                version: 2,
                createdByUserId: actorId,
                catalogSnapshot: snapshot,
            });
        await db
            .insert(dictionaryAiConfigurationTable)
            .values({
                id: 'global',
                version: 2,
                activeRevisionId: capturedRevision,
            });
        await db
            .insert(dictionaryAiWorkerObservationsTable)
            .values({
                id: textAiCapacityObservationId(
                    'mixed-boundary',
                    model.providerId,
                    model.id,
                ),
                workerId: 'mixed-boundary',
                providerId: model.providerId,
                modelId: model.id,
                adapterRevision: model.adapterRevision,
                textAiSelectionRevision: 1,
                textAiCapacityRevision: 1,
                textAiSupportedFormats: [...model.supportedFormats],
                status: 'available',
                message: 'synthetic capacity readiness',
                checkedAt: at,
                expiresAt: new Date(at.getTime() + 60000),
            });
        const result = await new DrizzleDictionaryGenerationStore(db, {
            generate: randomUUID,
        }).enqueue({
            cardId: entryId,
            dictionaryId: id,
            ownerId: actorId,
            expectedCardVersion: 1,
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            idempotencyKey: `boundary-${randomUUID()}`,
            fingerprint: `hmac-sha256:v1:${'Z'.repeat(43)}`,
            instruction: 'Improve articles',
            context: context(),
        });
        const [job] = await db
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, result.id));
        if (!job) throw new Error('No dictionary boundary job');
        return job;
    }
    async function startDictionaryJob(id: string) {
        await db.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            const now = new Date();
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    executionState: 'running',
                    workerId: 'mixed-boundary-fixture',
                    fencingToken: 1n,
                    attemptCount: 1,
                    heartbeatAt: now,
                    leaseDeadline: new Date(now.getTime() + 60000),
                    updatedAt: now,
                })
                .where(eq(dictionaryGenerationJobsTable.id, id));
        });
    }
    async function expectCapacityRejection(policy: {
        globalQueueLimit?: number;
        userQueueLimit?: number;
    }) {
        const jobsBefore = await db.select().from(sentenceAiJobsTable),
            creditsBefore = await db.select().from(aiCreditReservationsTable),
            receiptsBefore = await db.select().from(sentenceNextReceiptsTable),
            walletsBefore = await db.select().from(aiCreditAccountsTable);
        const selected = jobsBefore[0]?.selectedExecutionSnapshot;
        if (!selected)
            throw new Error('Capacity fixture needs one admitted sentence');
        const constrained = new DrizzleSentencePracticeStore(db, {
            ...policy,
            resolveExecution: async () => ({
                budget: selected.aggregateBudget,
                revisionId,
                snapshot: selected,
                selectionVersion: 1,
            }),
        });
        await expect(
            constrained.next(access(), next(), context()),
        ).rejects.toBeInstanceOf(SentenceCapacityUnavailableError);
        expect(await db.select().from(sentenceAiJobsTable)).toEqual(jobsBefore);
        expect(await db.select().from(aiCreditReservationsTable)).toEqual(
            creditsBefore,
        );
        expect(await db.select().from(sentenceNextReceiptsTable)).toEqual(
            receiptsBefore,
        );
        expect(await db.select().from(aiCreditAccountsTable)).toEqual(
            walletsBefore,
        );
    }
    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        worker = new DrizzleSentenceWorkerStore(db);
    }, 60000);
    afterAll(async () => {
        await client?.end();
    });
    beforeEach(async () => {
        await client.unsafe('truncate users cascade');
        await db.delete(circuits);
        await db.delete(dictionaryAiWorkerObservationsTable);
        executionOverride = null;
        owner = randomUUID();
        reader = randomUUID();
        dictionaryId = randomUUID();
        a = randomUUID();
        b = randomUUID();
        revisionId = randomUUID();
        await db.insert(usersTable).values([
            { id: owner, status: 'active' },
            { id: reader, status: 'active' },
        ]);
        await db.insert(aiCreditAccountsTable).values([
            { userId: owner, mode: 'unlimited' },
            { userId: reader, mode: 'unlimited' },
        ]);
        await db.insert(dictionariesTable).values({
            id: dictionaryId,
            ownerId: owner,
            name: 'Sentences',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
            visibility: 'unlisted',
            shareLocator: shareId,
            shareKeyDigest: keyDigest,
            shareKeyVersion: 1,
            shareKeyRotatedAt: new Date(),
        });
        await db.insert(dictionarySettingsTable).values({ dictionaryId });
        await db.insert(dictionaryCardsTable).values([
            {
                id: a,
                dictionaryId,
                source: 'hello',
                normalizedSource: 'hello',
                translation: 'hola',
                authorship: 'human',
                sortKey: 1024n,
            },
            {
                id: b,
                dictionaryId,
                source: 'goodbye',
                normalizedSource: 'goodbye',
                translation: 'adiós',
                authorship: 'human',
                sortKey: 2048n,
            },
        ]);
        const model = textAiModelCatalog[0]!;
        const snapshot: TextAiExecutionSnapshot = {
            adapterRevision: model.adapterRevision,
            aggregateBudget: model.aggregateBudget,
            credentialReference: model.credentialReference,
            creditPricing: model.creditPricing,
            enabledModelIds: [model.id],
            modelId: model.id,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            providerId: model.providerId,
            supportedFormats: ['sentence-generation:v1', 'sentence-check:v1'],
        };
        await db.insert(dictionaryAiConfigurationRevisionsTable).values({
            id: revisionId,
            createdByUserId: owner,
            version: 1,
            catalogSnapshot: snapshot,
        });
        store = new DrizzleSentencePracticeStore(db, {
            resolveExecution: async (tx, _user, format, now) => {
                const selected = executionOverride ?? snapshot;
                if (
                    await isTextAiCircuitOpen(tx, {
                        execution: selected,
                        format,
                        now,
                    })
                )
                    throw new SentenceModelUnavailableError();
                return {
                    budget: selected.aggregateBudget,
                    revisionId,
                    snapshot: { ...selected, supportedFormats: [format] },
                    selectionVersion: 1,
                };
            },
        });
    });
    it('serializes Next replay, exposes once, keeps personal attempts and retires edited content', async () => {
        const request = next();
        const admitted = await Promise.all([
            store.next(access(), request, context()),
            store.next(access(), request, context()),
        ]);
        expect(admitted[0]).toEqual(admitted[1]);
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(1);
        const job = await claim();
        if (!job || job.kind !== 'sentence-generation')
            throw new Error('No job');
        await worker.markDispatched(job.lease, context());
        await worker.completeGeneration(
            job.lease,
            { content: content(job.input) },
            context(),
        );
        const saved = await store.next(
            access(),
            next({ mode: 'saved-first' }),
            context(),
        );
        expect(saved.kind).toBe('exercise');
        expect(await db.select().from(sentenceEntryCoverageTable)).toHaveLength(
            2,
        );
        expect(
            (await db.select().from(sentenceEntryCoverageTable)).every(
                (c) => c.exposureCount === 1,
            ),
        ).toBe(true);
        if (saved.kind !== 'exercise') throw new Error('No saved');
        const checkRequest = {
            operationId: randomUUID(),
            sessionId: randomUUID(),
            answer: 'hola adiós',
            explanationLanguage: 'en' as const,
            revealedHintIds: ['hint-1'],
        };
        const queued = await store.enqueueCheck(
            access(),
            saved.exercise.id,
            checkRequest,
            context(),
        );
        expect(
            (
                await store.enqueueCheck(
                    access(),
                    saved.exercise.id,
                    checkRequest,
                    context(),
                )
            ).id,
        ).toBe(queued.id);
        await expect(
            store.enqueueCheck(
                access(),
                saved.exercise.id,
                { ...checkRequest, answer: 'different' },
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceConflictError);
        const checking = await claim();
        if (!checking || checking.kind !== 'sentence-check')
            throw new Error('No check');
        await worker.markDispatched(checking.lease, context());
        await worker.completeCheck(
            checking.lease,
            {
                feedback: {
                    percentage: 100,
                    rating: 'perfect',
                    meaning: 'correct',
                    grammar: 'correct',
                    targets: checking.input.targets.map((t) => ({
                        entryId: t.entryId,
                        status: 'used',
                        explanation: 'Required target used.',
                    })),
                    issues: [],
                    improvedTranslation: 'hola adiós',
                    explanation: 'Correct.',
                },
            },
            context(),
        );
        expect(
            (await store.attempts(access(), { limit: 25 }, context()))
                .attempts[0]?.assisted,
        ).toBe(true);
        expect(
            (await store.attempts(access(reader), { limit: 25 }, context()))
                .attempts,
        ).toHaveLength(0);
        const progress = await store.progress(
            access(),
            { direction: 'source-to-target' },
            context(),
        );
        expect(progress.completedCheckCount).toBe(1);
        expect(progress.assistedCheckCount).toBe(1);
        expect(progress.ratings.perfect).toBe(1);
        expect(progress.usedCount).toBe(2);
        const fresh = await store.next(
            access(),
            next({ mode: 'saved-first' }),
            context(),
        );
        expect(fresh.kind).toBe('job');
        if (fresh.kind === 'job')
            await store.cancelJob(access(), fresh.job.id, context());
        await db
            .update(dictionaryCardsTable)
            .set({ learningVersion: 2 })
            .where(eq(dictionaryCardsTable.id, b));
        expect(
            (
                await store.prepare(
                    access(),
                    { ...config, mode: 'review-only' },
                    context(),
                )
            ).savedReviewCount,
        ).toBe(0);
        expect(
            (await store.attempts(access(), { limit: 25 }, context()))
                .attempts[0]?.contentState,
        ).toBe('outdated');
    });
    it('keeps reader-generated content private and denies a rotated share before dispatch', async () => {
        await generated(reader);
        expect(
            (
                await store.prepare(
                    access(),
                    { ...config, mode: 'review-only' },
                    context(),
                )
            ).savedReviewCount,
        ).toBe(0);
        expect(
            (
                await store.prepare(
                    access(reader),
                    { ...config, mode: 'review-only' },
                    context(),
                )
            ).savedReviewCount,
        ).toBe(1);
        await store.next(access(reader), next(), context());
        const job = await claim();
        if (!job) throw new Error('No job');
        await db
            .update(dictionariesTable)
            .set({ shareKeyDigest: `hmac-sha256:v1:${'C'.repeat(43)}` })
            .where(eq(dictionariesTable.id, dictionaryId));
        expect(await worker.markDispatched(job.lease, context())).toBe(
            'terminalized',
        );
        await expect(
            store.getJob(access(reader), job.lease.jobId, context()),
        ).rejects.toBeInstanceOf(SentenceUnavailableError);
        expect(
            (
                await db
                    .select()
                    .from(sentenceAiJobsTable)
                    .where(eq(sentenceAiJobsTable.id, job.lease.jobId))
            )[0]?.failureCategory,
        ).toBe('access_revoked');
    });
    it('erases all copied candidates and A+B content while preserving unchanged A coverage and replay tombstones', async () => {
        const generatedExercise = await generated(owner, 1);
        const pendingRequest = next();
        const pending = await store.next(access(), pendingRequest, context());
        if (pending.kind !== 'job') throw new Error('No pending');
        expect(
            await db
                .select()
                .from(sentenceJobEntriesTable)
                .where(eq(sentenceJobEntriesTable.jobId, pending.job.id)),
        ).toHaveLength(2);
        await store.enqueueCheck(
            access(),
            generatedExercise.exercise.id,
            {
                operationId: randomUUID(),
                sessionId: randomUUID(),
                answer: 'hola',
                explanationLanguage: 'en',
                revealedHintIds: [],
            },
            context(),
        );
        const receipt = await store.next(
            access(),
            next({ mode: 'review-only' }),
            context(),
        );
        expect(receipt.kind).toBe('exercise');
        await db.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            expect(await sentenceDeletionBusy(tx, { entryIds: [b] })).toBe(
                true,
            );
            await requestSentenceCancellation(tx, {
                entryIds: [b],
                now: new Date(),
            });
        });
        expect(await claim()).toBeNull(); // flagged jobs drain and settle without dispatch
        await db.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            await eraseSentenceDerivedContent(tx, {
                entryIds: [b],
                now: new Date(),
            });
            await tx
                .delete(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.id, b));
        });
        expect(await db.select().from(sentenceExercisesTable)).toHaveLength(0);
        expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
        await expect(
            store.next(access(), pendingRequest, context()),
        ).rejects.toBeInstanceOf(SentenceConflictError);
        expect(
            (await db.select().from(sentenceEntryCoverageTable)).map((c) => [
                c.entryId,
                c.exposureCount,
            ]),
        ).toEqual([[a, 1]]);
        expect(
            (await db.select().from(sentenceNextReceiptsTable)).every(
                (r) => r.invalidatedAt !== null,
            ),
        ).toBe(true);
        expect(
            (await db.select().from(aiCreditReservationsTable)).every(
                (r) => r.state !== 'active',
            ),
        ).toBe(true);
    });
    it('fences stale completions and requests cancellation without publishing results', async () => {
        await store.next(access(), next(), context());
        const job = await claim();
        if (!job || job.kind !== 'sentence-generation')
            throw new Error('No job');
        expect(
            await worker.markDispatched(
                { ...job.lease, fencingToken: job.lease.fencingToken + 1 },
                context(),
            ),
        ).toBe('lost');
        await worker.markDispatched(job.lease, context());
        await store.cancelJob(access(), job.lease.jobId, context());
        expect(
            await worker.completeGeneration(
                job.lease,
                { content: content(job.input) },
                context(),
            ),
        ).toBe('terminalized');
        expect(await db.select().from(sentenceExercisesTable)).toHaveLength(0);
        expect(
            (await db.select().from(sentenceAiJobsTable))[0]?.executionState,
        ).toBe('cancelled');
    });
    it('requires compatible claims and immutable admission snapshots at the SQL boundary', async () => {
        const admitted = await store.next(access(), next(), context());
        if (admitted.kind !== 'job') throw new Error('No job');
        await expect(
            db
                .update(sentenceAiJobsTable)
                .set({ inputPayload: {} as SentenceGenerationInput })
                .where(eq(sentenceAiJobsTable.id, admitted.job.id)),
        ).rejects.toMatchObject({ cause: { code: '23514' } });
        const now = new Date();
        await expect(
            db
                .update(sentenceAiJobsTable)
                .set({
                    executionState: 'running',
                    workerId: 'legacy-worker',
                    heartbeatAt: now,
                    leaseDeadline: new Date(now.getTime() + 60000),
                    attemptCount: 1,
                    fencingToken: 1n,
                })
                .where(eq(sentenceAiJobsTable.id, admitted.job.id)),
        ).rejects.toMatchObject({ cause: { code: '55000' } });
        expect(
            (await db.select().from(sentenceAiJobsTable))[0]?.executionState,
        ).toBe('queued');
    });
    it('reserves each retry once and retains prior provider usage after cancellation', async () => {
        await store.next(access(), next(), context());
        const first = await claim();
        if (!first) throw new Error('No first job');
        await worker.markDispatched(first.lease, context());
        expect(
            await worker.fail(
                first.lease,
                {
                    code: 'provider_timeout',
                    retryAt: new Date(),
                    usage: { inputTokens: 100, outputTokens: 20 },
                },
                context(),
            ),
        ).toBe('committed');
        const second = await claim();
        if (!second) throw new Error('No second job');
        expect(second.lease.attempt).toBe(2);
        expect(await worker.markDispatched(first.lease, context())).toBe(
            'lost',
        );
        expect(await db.select().from(aiCreditReservationsTable)).toHaveLength(
            2,
        );
        await store.cancelJob(access(), second.lease.jobId, context());
        expect(await worker.markDispatched(second.lease, context())).toBe(
            'terminalized',
        );
        const [job] = await db.select().from(sentenceAiJobsTable);
        expect(job?.providerActualInputTokens).toBe(100);
        expect(job?.providerActualOutputTokens).toBe(20);
        expect(job?.providerActualCostMicros).toBe(160);
        expect(job?.providerReservationState).toBe('settled');
        expect(
            (await db.select().from(aiCreditReservationsTable)).every(
                (r) => r.state !== 'active',
            ),
        ).toBe(true);
    });
    it('reveals a persisted reference freely, replays once and keeps completion and history personal', async () => {
        const { exercise } = await generated();
        const beforeJobs = await db.select().from(sentenceAiJobsTable);
        const beforeReservations = await db
            .select()
            .from(aiCreditReservationsTable);
        const beforeCoverage = await db
            .select()
            .from(sentenceEntryCoverageTable);
        await db
            .update(aiCreditAccountsTable)
            .set({ mode: 'limited' })
            .where(eq(aiCreditAccountsTable.userId, owner));
        const beforeWallet = await db.select().from(aiCreditAccountsTable);
        store = new DrizzleSentencePracticeStore(db, {
            resolveExecution: async () => {
                throw new Error('Free reference must not resolve an AI model');
            },
        });
        const request = { operationId: randomUUID(), sessionId: randomUUID() };
        const reveals = await Promise.all([
            store.revealReference(access(), exercise.id, request, context()),
            store.revealReference(access(), exercise.id, request, context()),
        ]);
        expect(reveals[0]).toEqual(reveals[1]);
        expect(reveals[0]?.review.referenceTranslation).toBe('hola adiós');
        expect(await db.select().from(sentenceManualReviewsTable)).toHaveLength(
            1,
        );
        expect(await db.select().from(sentenceAiJobsTable)).toEqual(beforeJobs);
        expect(await db.select().from(aiCreditReservationsTable)).toEqual(
            beforeReservations,
        );
        expect(await db.select().from(aiCreditAccountsTable)).toEqual(
            beforeWallet,
        );
        expect(await db.select().from(sentenceEntryCoverageTable)).toEqual(
            beforeCoverage,
        );
        expect(
            (
                await store.prepare(
                    access(),
                    { ...config, mode: 'saved-first' },
                    context(),
                )
            ).savedUncheckedCount,
        ).toBe(0);
        expect(
            (
                await store.prepare(
                    access(reader),
                    { ...config, mode: 'saved-first' },
                    context(),
                )
            ).savedUncheckedCount,
        ).toBe(1);
        const progress = await store.progress(
            access(),
            { direction: 'source-to-target' },
            context(),
        );
        expect(progress.manualReviewCount).toBe(1);
        expect(progress.completedCheckCount).toBe(0);
        expect(progress.assistedCheckCount).toBe(0);
        expect(progress.ratings).toEqual({
            perfect: 0,
            good: 0,
            notBad: 0,
            practiseAgainLater: 0,
        });
        expect(
            (
                await store.manualReviews(
                    access(reader),
                    { limit: 25 },
                    context(),
                )
            ).reviews,
        ).toHaveLength(0);
        await expect(
            store.revealReference(
                access(),
                exercise.id,
                { ...request, sessionId: randomUUID() },
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceConflictError);
        await expect(
            store.next(
                access(),
                next({ operationId: request.operationId }),
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceConflictError);
        await store.revealReference(
            access(),
            exercise.id,
            { operationId: randomUUID(), sessionId: request.sessionId },
            context(),
        );
        const readerRevealRequest = {
            operationId: randomUUID(),
            sessionId: randomUUID(),
        };
        await store.revealReference(
            access(reader),
            exercise.id,
            readerRevealRequest,
            context(),
        );
        expect(
            (
                await store.progress(
                    access(reader),
                    { direction: 'source-to-target' },
                    context(),
                )
            ).manualReviewCount,
        ).toBe(1);
        const readerEvents = (
            await db.select().from(sentenceManualReviewsTable)
        ).length;
        await db
            .update(dictionariesTable)
            .set({ shareKeyDigest: `hmac-sha256:v1:${'D'.repeat(43)}` })
            .where(eq(dictionariesTable.id, dictionaryId));
        await expect(
            store.revealReference(
                access(reader),
                exercise.id,
                {
                    operationId: randomUUID(),
                    sessionId: readerRevealRequest.sessionId,
                },
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceUnavailableError);
        await expect(
            store.manualReviews(access(reader), { limit: 25 }, context()),
        ).rejects.toBeInstanceOf(SentenceUnavailableError);
        expect(
            (await db.select().from(sentenceManualReviewsTable)).length,
        ).toBe(readerEvents);
        const page = await store.manualReviews(
            access(),
            { limit: 1 },
            context(),
        );
        expect(page.reviews).toHaveLength(1);
        expect(page.nextCursor).not.toBeNull();
        const second = await store.manualReviews(
            access(),
            { limit: 1, cursor: page.nextCursor! },
            context(),
        );
        expect(second.reviews).toHaveLength(1);
        expect(second.reviews[0]?.id).not.toBe(page.reviews[0]?.id);
        await expect(
            store.attempts(
                access(),
                { limit: 1, cursor: page.nextCursor! },
                context(),
            ),
        ).rejects.toThrow();
        await db
            .update(dictionaryCardsTable)
            .set({ learningVersion: 2 })
            .where(eq(dictionaryCardsTable.id, b));
        expect(
            (
                await store.manualReviews(access(), { limit: 25 }, context())
            ).reviews.every((r) => r.contentState === 'outdated'),
        ).toBe(true);
        await expect(
            store.revealReference(
                access(),
                exercise.id,
                { operationId: randomUUID(), sessionId: randomUUID() },
                context(),
            ),
        ).rejects.toBeInstanceOf(SentenceUnavailableError);
    });
    it('captures same-session reference assistance at check admission without changing AI ratings', async () => {
        const { exercise } = await generated();
        const sessionId = randomUUID();
        await store.revealReference(
            access(),
            exercise.id,
            { operationId: randomUUID(), sessionId },
            context(),
        );
        const queued = await store.enqueueCheck(
            access(),
            exercise.id,
            {
                operationId: randomUUID(),
                sessionId,
                answer: 'hola adiós',
                explanationLanguage: 'en',
                revealedHintIds: [],
            },
            context(),
        );
        const job = await claim();
        if (!job || job.kind !== 'sentence-check') throw new Error('No check');
        expect(job.lease.jobId).toBe(queued.id);
        await worker.markDispatched(job.lease, context());
        await worker.completeCheck(
            job.lease,
            {
                feedback: {
                    percentage: 100,
                    rating: 'perfect',
                    meaning: 'correct',
                    grammar: 'correct',
                    targets: job.input.targets.map((t) => ({
                        entryId: t.entryId,
                        status: 'used',
                        explanation: 'Required target used.',
                    })),
                    issues: [],
                    improvedTranslation: 'hola adiós',
                    explanation: 'Correct.',
                },
            },
            context(),
        );
        const [attempt] = (
            await store.attempts(access(), { limit: 25 }, context())
        ).attempts;
        expect(attempt?.referenceRevealed).toBe(true);
        expect(attempt?.assisted).toBe(true);
        expect(attempt?.feedback.percentage).toBe(100);
        expect(attempt?.feedback.rating).toBe('perfect');
        const totals = await store.progress(
            access(),
            { direction: 'source-to-target' },
            context(),
        );
        expect(totals.completedCheckCount).toBe(1);
        expect(totals.assistedCheckCount).toBe(1);
        expect(totals.manualReviewCount).toBe(1);
        const newSession = await store.enqueueCheck(
            access(),
            exercise.id,
            {
                operationId: randomUUID(),
                sessionId: randomUUID(),
                answer: 'hola adiós',
                explanationLanguage: 'en',
                revealedHintIds: [],
            },
            context(),
        );
        expect(
            (
                await db
                    .select()
                    .from(sentenceAiJobsTable)
                    .where(eq(sentenceAiJobsTable.id, newSession.id))
            )[0]?.referenceRevealed,
        ).toBe(false);
        await store.cancelJob(access(), newSession.id, context());
    });
    it('erases manual reference history and retains a content-free invalid operation on candidate deletion', async () => {
        const { exercise } = await generated(owner, 1);
        const request = { operationId: randomUUID(), sessionId: randomUUID() };
        await store.revealReference(access(), exercise.id, request, context());
        await db.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            await eraseSentenceDerivedContent(tx, {
                entryIds: [b],
                now: new Date(),
            });
            await tx
                .delete(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.id, b));
        });
        expect(await db.select().from(sentenceManualReviewsTable)).toHaveLength(
            0,
        );
        expect(await db.select().from(sentenceExercisesTable)).toHaveLength(0);
        const tombstone = (
            await db.select().from(sentenceNextReceiptsTable)
        ).find((r) => r.operationId === request.operationId);
        expect(tombstone?.invalidatedAt).toBeInstanceOf(Date);
        expect(tombstone?.configuration).toBeNull();
        await expect(
            store.revealReference(access(), randomUUID(), request, context()),
        ).rejects.toBeInstanceOf(SentenceConflictError);
        expect(
            (await db.select().from(sentenceEntryCoverageTable)).map((c) => [
                c.entryId,
                c.exposureCount,
            ]),
        ).toEqual([[a, 1]]);
    });
    it('serializes concurrent free reveal and paid checks across database connections without a lock-upgrade deadlock', async () => {
        const { exercise } = await generated();
        const sessionId = randomUUID();
        const operations = await Promise.all(
            Array.from({ length: 4 }, (_, index) =>
                index % 2
                    ? store.enqueueCheck(
                          access(),
                          exercise.id,
                          {
                              operationId: randomUUID(),
                              sessionId,
                              answer: 'hola adiós',
                              explanationLanguage: 'en',
                              revealedHintIds: [],
                          },
                          context(),
                      )
                    : store.revealReference(
                          access(),
                          exercise.id,
                          { operationId: randomUUID(), sessionId },
                          context(),
                      ),
            ),
        );
        expect(operations).toHaveLength(4);
        expect(await db.select().from(sentenceManualReviewsTable)).toHaveLength(
            2,
        );
        const checks = (await db.select().from(sentenceAiJobsTable)).filter(
            (j) => j.jobKind === 'sentence-check',
        );
        expect(checks).toHaveLength(2);
        for (const check of checks)
            await store.cancelJob(access(), check.id, context());
    }, 10000);
    it('purges foreign-dictionary manual review data for a deleted learner while preserving other learners', async () => {
        const { exercise } = await generated();
        await store.revealReference(
            access(),
            exercise.id,
            { operationId: randomUUID(), sessionId: randomUUID() },
            context(),
        );
        await store.revealReference(
            access(reader),
            exercise.id,
            { operationId: randomUUID(), sessionId: randomUUID() },
            context(),
        );
        await db
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, reader));
        await db.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            await eraseSentenceDerivedContent(tx, {
                learnerId: reader,
                dictionaryIds: [],
                accountPurge: true,
                now: new Date(),
            });
        });
        const remaining = await db.select().from(sentenceManualReviewsTable);
        expect(remaining.map((r) => r.learnerId)).toEqual([owner]);
        expect(await db.select().from(sentenceExercisesTable)).toHaveLength(1);
        expect(
            (await db.select().from(sentenceEntryCoverageTable)).every(
                (c) => c.learnerId === owner,
            ),
        ).toBe(true);
    });
    it('opens the pinned sentence circuit after three provider faults, isolates formats/models, and resets after cooldown success', async () => {
        const { exercise } = await generated();
        // Keep established per-learner reservations within capacity while
        // building three failures and one already-admitted blocked job.
        for (let index = 0; index < 2; index++)
            await store.next(access(), next(), context());
        const failedIds: string[] = [];
        for (let index = 0; index < 3; index++) {
            const job = await claim();
            if (!job || job.kind !== 'sentence-generation')
                throw new Error('No failure candidate');
            failedIds.push(job.lease.jobId);
            await worker.markDispatched(job.lease, context());
            await worker.fail(
                job.lease,
                {
                    code:
                        index === 0
                            ? 'provider_unavailable'
                            : index === 1
                              ? 'provider_timeout'
                              : 'provider_rate_limited',
                    retryAt: null,
                    usage: { inputTokens: 100, outputTokens: 20 },
                },
                context(),
            );
            if (index < 2) await store.next(access(), next(), context());
        }
        const [queued] = await db
            .select()
            .from(sentenceAiJobsTable)
            .where(eq(sentenceAiJobsTable.executionState, 'queued'));
        if (!queued) throw new Error('No blocked candidate');
        const key = textAiCircuitKey(
            queued.selectedExecutionSnapshot,
            queued.format,
        );
        const [opened] = await db
            .select()
            .from(circuits)
            .where(eq(circuits.id, key));
        expect(opened?.consecutiveFailures).toBe(3);
        expect(opened?.openUntil!.getTime()).toBeGreaterThan(Date.now());
        expect(await claim()).toBeNull();
        const reservationsBefore = await db
            .select()
            .from(aiCreditReservationsTable);
        await expect(
            store.next(access(), next(), context()),
        ).rejects.toBeInstanceOf(SentenceModelUnavailableError);
        expect(await db.select().from(aiCreditReservationsTable)).toEqual(
            reservationsBefore,
        );
        const dictionaryScope = {
            execution: queued.selectedExecutionSnapshot,
            format: 'single-card:v1',
            now: new Date(),
        };
        await db.transaction(async (tx) => {
            expect(await isTextAiCircuitOpen(tx, dictionaryScope)).toBe(false);
            expect(
                await isTextAiCircuitOpen(tx, {
                    ...dictionaryScope,
                    format: 'sentence-check:v1',
                }),
            ).toBe(false);
            expect(
                await isTextAiCircuitOpen(tx, {
                    ...dictionaryScope,
                    execution: { providerId: 'kie', modelId: 'gemini-2.5-pro' },
                    format: 'sentence-generation:v1',
                }),
            ).toBe(false);
            await recordTextAiCircuitFailure(tx, {
                ...dictionaryScope,
                category: 'provider_error',
            });
        });
        const check = await store.enqueueCheck(
            access(),
            exercise.id,
            {
                operationId: randomUUID(),
                sessionId: randomUUID(),
                answer: 'hola adiós',
                explanationLanguage: 'en',
                revealedHintIds: [],
            },
            context(),
        );
        const checking = await claim();
        if (!checking || checking.kind !== 'sentence-check')
            throw new Error('Independent checker should claim');
        expect(checking.lease.jobId).toBe(check.id);
        await worker.markDispatched(checking.lease, context());
        await worker.completeCheck(
            checking.lease,
            {
                feedback: {
                    percentage: 100,
                    rating: 'perfect',
                    meaning: 'correct',
                    grammar: 'correct',
                    targets: checking.input.targets.map((t) => ({
                        entryId: t.entryId,
                        status: 'used',
                        explanation: 'Required target used.',
                    })),
                    issues: [],
                    improvedTranslation: 'hola adiós',
                    explanation: 'Correct.',
                },
                usage: { inputTokens: 100, outputTokens: 20 },
            },
            context(),
        );
        expect(
            (await db.select().from(circuits).where(eq(circuits.id, key)))[0]
                ?.consecutiveFailures,
        ).toBe(3);
        const model = textAiModelCatalog[1]!;
        executionOverride = {
            adapterRevision: model.adapterRevision,
            aggregateBudget: model.aggregateBudget,
            credentialReference: model.credentialReference,
            creditPricing: model.creditPricing,
            enabledModelIds: [model.id],
            modelId: model.id,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            providerId: model.providerId,
            supportedFormats: ['sentence-generation:v1', 'sentence-check:v1'],
        };
        await store.next(access(), next(), context());
        const other = await claim();
        if (!other || other.kind !== 'sentence-generation')
            throw new Error('Independent model should claim');
        expect(other.execution.modelId).toBe(model.id);
        await worker.markDispatched(other.lease, context());
        await worker.completeGeneration(
            other.lease,
            {
                content: content(other.input),
                usage: { inputTokens: 100, outputTokens: 20 },
            },
            context(),
        );
        expect(
            (await db.select().from(circuits).where(eq(circuits.id, key)))[0]
                ?.consecutiveFailures,
        ).toBe(3);
        executionOverride = null;
        const future = { ...context(), now: new Date(Date.now() + 61000) };
        const recovered = await worker.claimNext(
            {
                workerId: 'sentence-persistence-fixture',
                supportedFormats: [
                    'sentence-generation:v1',
                    'sentence-check:v1',
                ],
                learningExecutionRevision: 1,
                textAiSelectionRevision: 1,
                creditSettlementRevision: 1,
                leaseMs: 60000,
                globalConcurrency: 10,
                learnerConcurrency: 3,
            },
            future,
        );
        if (!recovered || recovered.kind !== 'sentence-generation')
            throw new Error('Cooldown should permit pinned job');
        expect(recovered.lease.jobId).toBe(queued.id);
        await worker.markDispatched(recovered.lease, future);
        await worker.completeGeneration(
            recovered.lease,
            {
                content: content(recovered.input),
                usage: { inputTokens: 100, outputTokens: 20 },
            },
            future,
        );
        const [reset] = await db
            .select()
            .from(circuits)
            .where(eq(circuits.id, key));
        expect(reset?.consecutiveFailures).toBe(0);
        expect(reset?.openUntil).toBeNull();
        expect(
            (
                await db
                    .select()
                    .from(circuits)
                    .where(
                        eq(
                            circuits.id,
                            textAiCircuitKey(
                                dictionaryScope.execution,
                                dictionaryScope.format,
                            ),
                        ),
                    )
            )[0]?.consecutiveFailures,
        ).toBe(1);
        expect(failedIds).toHaveLength(3);
    });
    it('does not count invalid model output, cancellation, stale authority, or undispatched failures as provider circuit faults', async () => {
        const { exercise } = await generated();
        await store.next(access(), next(), context());
        const noDispatch = await claim();
        if (!noDispatch) throw new Error('No undispatched job');
        await worker.fail(
            noDispatch.lease,
            { code: 'provider_unavailable', retryAt: null },
            context(),
        );
        for (let index = 0; index < 3; index++) {
            await store.next(access(), next(), context());
            const invalid = await claim();
            if (!invalid) throw new Error('No invalid-output candidate');
            await worker.markDispatched(invalid.lease, context());
            await worker.fail(
                invalid.lease,
                {
                    code: 'invalid_model_output',
                    retryAt: null,
                    usage: { inputTokens: 100, outputTokens: 20 },
                },
                context(),
            );
        }
        await store.next(access(), next(), context());
        const cancelled = await claim();
        if (!cancelled) throw new Error('No cancellation job');
        await worker.markDispatched(cancelled.lease, context());
        await store.cancelJob(access(), cancelled.lease.jobId, context());
        expect(
            await worker.fail(
                cancelled.lease,
                { code: 'provider_timeout', retryAt: null },
                context(),
            ),
        ).toBe('terminalized');
        await store.next(access(), next(), context());
        const stale = await claim();
        if (!stale) throw new Error('No stale job');
        await worker.markDispatched(stale.lease, context());
        await db
            .update(dictionaryCardsTable)
            .set({ learningVersion: 2 })
            .where(eq(dictionaryCardsTable.id, b));
        expect(
            await worker.fail(
                stale.lease,
                { code: 'provider_timeout', retryAt: null },
                context(),
            ),
        ).toBe('terminalized');
        const [row] = await db
            .select()
            .from(circuits)
            .where(
                eq(
                    circuits.id,
                    textAiCircuitKey(stale.execution, 'sentence-generation:v1'),
                ),
            );
        expect(row?.consecutiveFailures).toBe(0);
        expect(row?.openUntil).toBeNull();
        expect(exercise.id).toBeTruthy();
    });
    it('counts another learner dictionary running job together with sentence queued work at the global boundary despite differing pinned budgets', async () => {
        const dictionary = await seedDictionaryJob(reader);
        await startDictionaryJob(dictionary.id);
        const sentence = await store.next(access(), next(), context());
        if (sentence.kind !== 'job') throw new Error('No queued sentence');
        const [row] = await db
            .select()
            .from(sentenceAiJobsTable)
            .where(eq(sentenceAiJobsTable.id, sentence.job.id));
        expect(dictionary.executionRevisionId).not.toBeNull();
        expect(dictionary.providerMaxCostMicrosPerAttempt).not.toBe(
            row!.providerMaxCostMicrosPerAttempt,
        );
        await expectCapacityRejection({
            globalQueueLimit: 2,
            userQueueLimit: 100,
        });
    });
    it('counts the learner sentence running job and dictionary queued work together at the personal queue boundary across budget cohorts', async () => {
        await store.next(access(), next(), context());
        const running = await claim();
        if (!running) throw new Error('No running sentence');
        const dictionary = await seedDictionaryJob();
        expect(dictionary.executionState).toBe('queued');
        expect(dictionary.executionRevisionId).not.toBeNull();
        expect(dictionary.providerMaxCostMicrosPerAttempt).not.toBe(
            running.budget.maxCostMicrosPerAttempt,
        );
        await expectCapacityRejection({
            globalQueueLimit: 100,
            userQueueLimit: 2,
        });
    });
    it('returns retryable capacity pressure for provider reservations without creating more jobs, credits, or operation receipts', async () => {
        for (let index = 0; index < 3; index++)
            await store.next(access(), next(), context());
        await expectCapacityRejection({
            globalQueueLimit: 100,
            userQueueLimit: 100,
        });
    });
    it('returns retryable capacity pressure for an aged runnable mixed dictionary queue without creating work or credits', async () => {
        const dictionary = await seedDictionaryJob();
        await store.next(access(), next(), context());
        await db
            .update(dictionaryGenerationJobsTable)
            .set({ createdAt: new Date(Date.now() - 301000) })
            .where(eq(dictionaryGenerationJobsTable.id, dictionary.id));
        await expectCapacityRejection({
            globalQueueLimit: 100,
            userQueueLimit: 100,
        });
    });
});
