import { seedLegacyActionFixture } from '../../../../support/legacy-action-fixture';
import { aiCreditActionsTable } from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { DrizzleSentencePreparationStore } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-preparation-store';
import { sentenceExposuresTable } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import type { SentenceDatabase } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-persistence-support';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryGenerationProviderUsageArchiveTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { dictionaryAiConfigurationRevisionsTable } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { aiCreditAccountsTable } from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { DrizzleSentencePracticeStore } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-practice-store';
import { DrizzleSentenceWorkerStore } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-worker-store';
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
run('restricted sentence worker role', () => {
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
                    'sentence-generation:v2',
                    'sentence-preparation:v1',
                    'sentence-preparation:v2',
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
            { userId: owner, mode: 'limited' },
            { userId: reader, mode: 'limited' },
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
            creditPricing: {
                ...model.creditPricing!,
                inputCreditsPerMillionTokens: 100,
                outputCreditsPerMillionTokens: 300,
                maxCreditsPerAttempt: 100000,
            },
            enabledModelIds: [model.id],
            modelId: model.id,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            providerId: model.providerId,
            supportedFormats: [
                'sentence-generation:v1',
                'sentence-generation:v2',
                'sentence-check:v1',
            ],
        };
        await db.insert(dictionaryAiConfigurationRevisionsTable).values({
            id: revisionId,
            createdByUserId: owner,
            version: 1,
            catalogSnapshot: snapshot,
        });
        await seedLegacyActionFixture(db, '100');
        store = new DrizzleSentencePracticeStore(db, {
            resolveExecution: async (_tx, _user, format) => ({
                budget: snapshot.aggregateBudget,
                revisionId,
                snapshot: { ...snapshot, supportedFormats: [format] },
                selectionVersion: 1,
            }),
        });
    });
    it('claims, dispatches, settles and publishes through least privilege grants', async () => {
        const role = `sentence_worker_${randomUUID().replaceAll('-', '')}`;
        await db.transaction((tx) =>
            new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                amount: 100_000_000n,
                createdAt: new Date(),
                expiresAt: null,
                ownerId: owner,
                source: 'admin',
                sourceReference: `worker-role:${randomUUID()}`,
            }),
        );
        await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
        try {
            const raw = await readFile(
                new URL(
                    '../../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );
            const grants = raw
                .split('\n')
                .filter((line) => !line.startsWith('\\'))
                .join('\n')
                .replaceAll(':"dictionary_worker_role"', `"${role}"`);
            await client.unsafe(grants);
            const restricted = Object.create(db) as SentenceDatabase;
            restricted.transaction = async (callback) =>
                db.transaction(async (tx) => {
                    await tx.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
                    return callback(tx);
                });
            worker = new DrizzleSentenceWorkerStore(restricted);
            const saved = await generated();
            const checkJob = await store.enqueueCheck(
                access(),
                saved.exercise.id,
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
                throw new Error('No check job');
            expect(checking.lease.jobId).toBe(checkJob.id);
            expect(await worker.markDispatched(checking.lease, context())).toBe(
                'dispatch',
            );
            expect(
                await worker.completeCheck(
                    checking.lease,
                    {
                        feedback: {
                            percentage: 100,
                            rating: 'perfect',
                            meaning: 'correct',
                            grammar: 'correct',
                            targets: checking.input.targets.map((target) => ({
                                entryId: target.entryId,
                                status: 'used',
                                explanation: 'Used required target.',
                            })),
                            issues: [],
                            improvedTranslation: 'hola adiós',
                            explanation: 'Correct.',
                        },
                        usage: { inputTokens: 100, outputTokens: 20 },
                    },
                    context(),
                ),
            ).toBe('committed');
            expect(
                (await store.attempts(access(), { limit: 25 }, context()))
                    .attempts,
            ).toHaveLength(1);
            const actions = await db
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.ownerId, owner));
            expect(actions).toHaveLength(2);
            expect(
                actions.every(
                    (action) =>
                        action.funding === 'customer' &&
                        action.state === 'settled' &&
                        (action.chargedMilli ?? 0n) > 0n,
                ),
            ).toBe(true);
            const preparation = new DrizzleSentencePreparationStore(
                restricted,
                {
                    authorizeAction: async () => {
                        throw new Error(
                            'Worker cannot authorize a parent action',
                        );
                    },
                    admitGeneration:
                        store.admitPreparationGeneration.bind(store),
                },
            );
            const ownedPreparation = new DrizzleSentencePreparationStore(db, {
                authorizeAction: store.preparePreparationAction.bind(store),
                admitGeneration: store.admitPreparationGeneration.bind(store),
            });
            const prepared = await ownedPreparation.start(
                access(),
                {
                    operationId: randomUUID(),
                    direction: 'source-to-target',
                    mode: 'new-only',
                    initialRoundScope: { type: 'manual', entryIds: [a, b] },
                },
                context(),
            );
            const exposureBefore = await db
                .select()
                .from(sentenceExposuresTable);
            const expiredSnapshotId = randomUUID();
            await db
                .insert(databaseSchema.sentenceLibrarySnapshotsTable)
                .values({
                    id: expiredSnapshotId,
                    actorId: owner,
                    learnerId: owner,
                    dictionaryId,
                    operation: 'archive',
                    scope: 'personal',
                    items: [],
                    expiresAt: new Date(context().now.getTime() - 1),
                });
            expect(await preparation.tick(context())).toBe(true);
            expect(
                await db
                    .select()
                    .from(databaseSchema.sentenceLibrarySnapshotsTable)
                    .where(
                        eq(
                            databaseSchema.sentenceLibrarySnapshotsTable.id,
                            expiredSnapshotId,
                        ),
                    ),
            ).toHaveLength(0);

            const preparedJob = await claim();
            if (!preparedJob || preparedJob.kind !== 'sentence-generation')
                throw new Error('No prepared generation job');
            expect(
                await worker.markDispatched(preparedJob.lease, context()),
            ).toBe('dispatch');
            expect(
                await worker.completeGeneration(
                    preparedJob.lease,
                    {
                        content: content(preparedJob.input),
                        usage: { inputTokens: 100, outputTokens: 20 },
                    },
                    context(),
                ),
            ).toBe('committed');
            expect(await preparation.tick(context())).toBe(true);
            expect(await preparation.tick(context())).toBe(true);
            expect(
                (await ownedPreparation.get(access(), prepared.id, context()))
                    .state,
            ).toBe('completed');
            expect(await db.select().from(sentenceExposuresTable)).toHaveLength(
                exposureBefore.length,
            );
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(
                        sql`update sentence_personal_visibility set archived_at=now()`,
                    ),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(sql`select * from sentence_library_snapshots`),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(sql`delete from sentence_preparation_commands`),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(
                        sql`update user_text_ai_preferences set mode='automatic'`,
                    ),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });

            const archiveId = randomUUID();
            await restricted.transaction((tx) =>
                tx
                    .insert(dictionaryGenerationProviderUsageArchiveTable)
                    .values({
                        id: archiveId,
                        ownerId: owner,
                        jobKind: 'sentence-check',
                        actualCostMicros: 1,
                        actualInputTokens: 1,
                        actualOutputTokens: 1,
                        inputCostMicrosPerMillionTokens: 1,
                        outputCostMicrosPerMillionTokens: 1,
                        maxCostMicrosPerAttempt: 100,
                        maxInputTokensPerAttempt: 100,
                        maxOutputTokensPerAttempt: 100,
                        settledAt: new Date(),
                    }),
            );
            expect(
                await restricted.transaction((tx) =>
                    tx
                        .select()
                        .from(dictionaryGenerationProviderUsageArchiveTable)
                        .where(
                            eq(
                                dictionaryGenerationProviderUsageArchiveTable.id,
                                archiveId,
                            ),
                        ),
                ),
            ).toHaveLength(1);
            await restricted.transaction((tx) =>
                tx
                    .update(dictionaryGenerationProviderUsageArchiveTable)
                    .set({ actualCostMicros: 2 })
                    .where(
                        eq(
                            dictionaryGenerationProviderUsageArchiveTable.id,
                            archiveId,
                        ),
                    ),
            );
            await restricted.transaction((tx) =>
                tx
                    .delete(dictionaryGenerationProviderUsageArchiveTable)
                    .where(
                        eq(
                            dictionaryGenerationProviderUsageArchiveTable.id,
                            archiveId,
                        ),
                    ),
            );
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(
                        sql`update users set status='purged' where id=${owner}`,
                    ),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(
                        sql`update dictionary_cards set source='unauthorized' where id=${a}`,
                    ),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(sql`select handle from users where id=${owner}`),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            // This is the combined dictionary/text worker role: existing text publication
            // grants dictionary reads, including translation context. It still cannot
            // read account handles or mutate learner/account/vocabulary fields above.
            expect(
                await restricted.transaction((tx) =>
                    tx.execute(
                        sql`select translation_context from dictionaries where id=${dictionaryId}`,
                    ),
                ),
            ).toEqual([{ translation_context: null }]);
        } finally {
            await client.unsafe(`DROP OWNED BY "${role}"`);
            await client.unsafe(`DROP ROLE "${role}"`);
        }
    });
});
