import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    SentenceExerciseSchema,
    SentenceFeedbackSchema,
} from '@languon/contracts';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { lockTextAiCapacity } from '../../../src/infrastructure/text-ai/text-ai-capacity';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleAccountPurgeStore } from '../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { DrizzleOwnerDeletionPreparation } from '../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-owner-deletion-preparation';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
    dictionaryGenerationProviderUsageArchiveTable,
} from '../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { DrizzleDictionaryDeletionStore } from '../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-deletion-store';
import { DictionaryDeletionBusyError } from '../../../src/modules/dictionaries/application/dictionary-errors';
import { DrizzleSentencePracticeStore } from '../../../src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-practice-store';
import { dictionaryAiConfigurationRevisionsTable } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    sentenceAiJobsTable,
    sentenceExercisesTable,
    sentenceExerciseEntriesTable,
    sentenceAttemptsTable,
    sentenceManualReviewsTable,
    sentenceEntryCoverageTable,
    sentenceNextReceiptsTable,
    sentenceJobEntriesTable,
} from '../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'sentence permanent lifecycle integration',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let owner: string,
            reader: string,
            dictionaryId: string,
            foreignId: string,
            a: string,
            b: string,
            foreignEntry: string,
            revisionId: string;
        let snapshot: TextAiExecutionSnapshot;
        const now = new Date();
        const context = () => ({ now, signal: new AbortController().signal });
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 60000);
        afterAll(async () => {
            await client?.end();
        });
        beforeEach(async () => {
            await client.unsafe('truncate users cascade');
            owner = randomUUID();
            reader = randomUUID();
            dictionaryId = randomUUID();
            foreignId = randomUUID();
            a = randomUUID();
            b = randomUUID();
            foreignEntry = randomUUID();
            revisionId = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
            await db.insert(dictionariesTable).values([
                {
                    id: dictionaryId,
                    ownerId: owner,
                    name: 'Owner sentences',
                    createdAt: new Date(now.getTime() - 86400000),
                    sourceLanguageTag: 'en',
                    targetLanguageTag: 'es',
                },
                {
                    id: foreignId,
                    ownerId: reader,
                    name: 'Independent dictionary',
                    createdAt: new Date(now.getTime() - 86400000),
                    sourceLanguageTag: 'en',
                    targetLanguageTag: 'es',
                },
            ]);
            await db
                .insert(dictionarySettingsTable)
                .values([{ dictionaryId }, { dictionaryId: foreignId }]);
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
                {
                    id: foreignEntry,
                    dictionaryId: foreignId,
                    source: 'hello',
                    normalizedSource: 'hello',
                    translation: 'hola',
                    authorship: 'human',
                    sortKey: 1024n,
                },
            ]);
            const model = textAiModelCatalog[0]!;
            snapshot = {
                adapterRevision: model.adapterRevision,
                aggregateBudget: model.aggregateBudget,
                credentialReference: model.credentialReference,
                creditPricing: model.creditPricing,
                enabledModelIds: [model.id],
                modelId: model.id,
                perCallMaxInputTokens: model.perCallMaxInputTokens,
                perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                providerId: model.providerId,
                supportedFormats: [
                    'sentence-generation:v1',
                    'sentence-check:v1',
                ],
            };
            await db.insert(dictionaryAiConfigurationRevisionsTable).values({
                id: revisionId,
                version: 1,
                createdByUserId: reader,
                catalogSnapshot: snapshot,
            });
        });
        async function exercise(
            creatorId = owner,
            dictionary = dictionaryId,
            entry = a,
            shared = true,
        ) {
            const id = randomUUID();
            const publicContent = SentenceExerciseSchema.parse({
                id,
                dictionaryId: dictionary,
                direction: 'source-to-target',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                sourceText: 'hello',
                segments: [
                    {
                        id: 'segment-1',
                        start: 0,
                        end: 5,
                        text: 'hello',
                        target: {
                            entryId: entry,
                            occurrenceId: 'occurrence-1',
                            hintId: 'hint-1',
                        },
                    },
                ],
                hints: [{ id: 'hint-1', text: 'hola' }],
                generationPolicyVersion: 1,
                createdAt: now.toISOString(),
            });
            await db.insert(sentenceExercisesTable).values({
                id,
                creatorId,
                dictionaryId: dictionary,
                direction: 'source-to-target',
                shared,
                publicContent,
                referenceTranslation: 'private reference',
            });
            await db.insert(sentenceExerciseEntriesTable).values({
                exerciseId: id,
                dictionaryId: dictionary,
                entryId: entry,
                learningVersion: 1,
                sourceText: 'hello',
                targetText: 'hola',
            });
            return id;
        }
        async function personal(
            exerciseId: string,
            learnerId = reader,
            dictionary = dictionaryId,
            entry = a,
        ) {
            const attemptId = randomUUID();
            const feedback = SentenceFeedbackSchema.parse({
                percentage: 100,
                rating: 'perfect',
                meaning: 'correct',
                grammar: 'correct',
                targets: [
                    {
                        entryId: entry,
                        status: 'used',
                        explanation: 'Correct word',
                    },
                ],
                issues: [],
                improvedTranslation: 'hola',
                explanation: 'Correct',
            });
            await db.insert(sentenceAttemptsTable).values({
                id: attemptId,
                learnerId,
                dictionaryId: dictionary,
                exerciseId,
                operationId: randomUUID(),
                sessionId: randomUUID(),
                answer: 'private answer',
                explanationLanguage: 'en',
                revealedHintIds: [],
                feedback,
            });
            await db.insert(sentenceManualReviewsTable).values({
                id: randomUUID(),
                learnerId,
                dictionaryId: dictionary,
                exerciseId,
                operationId: randomUUID(),
                sessionId: randomUUID(),
                requestFingerprint: 'synthetic-manual',
            });
            await db
                .insert(sentenceEntryCoverageTable)
                .values({
                    learnerId,
                    dictionaryId: dictionary,
                    entryId: entry,
                    learningVersion: 1,
                    direction: 'source-to-target',
                    exposureCount: 1,
                })
                .onConflictDoNothing();
            await db.insert(sentenceNextReceiptsTable).values({
                learnerId,
                dictionaryId: dictionary,
                operationId: randomUUID(),
                requestFingerprint: 'synthetic-next',
                configuration: {
                    direction: 'source-to-target',
                    mode: 'saved-first',
                    scope: { type: 'all' },
                },
                exerciseId,
            });
            return attemptId;
        }
        async function job(
            exerciseId: string,
            learnerId = reader,
            dictionary = dictionaryId,
            entries = [a, b],
            active = false,
            check = false,
        ) {
            const id = randomUUID();
            const targets = entries.map((entryId) => ({
                entryId,
                learningVersion: 1,
                sourceText: 'hello',
                targetText: 'hola',
            }));
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.execute(
                    sql`select set_config('languon.learning_execution_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
                );
                await tx.insert(sentenceAiJobsTable).values({
                    id,
                    learnerId,
                    dictionaryId: dictionary,
                    jobKind: check ? 'sentence-check' : 'sentence-generation',
                    format: check
                        ? 'sentence-check:v1'
                        : 'sentence-generation:v1',
                    direction: 'source-to-target',
                    authority: { kind: 'owner' },
                    operationId: randomUUID(),
                    sessionId: randomUUID(),
                    requestFingerprint: 'synthetic-job',
                    inputPayload: check
                        ? {
                              schemaVersion: 1,
                              exerciseId,
                              sourceText: 'hello',
                              referenceTranslation: 'private reference',
                              sourceLanguage: 'en',
                              targetLanguage: 'es',
                              targets,
                              answer: 'private answer',
                              explanationLanguage: 'en',
                              revealedHintIds: [],
                          }
                        : {
                              schemaVersion: 1,
                              generationPolicyVersion: 1,
                              dictionaryId: dictionary,
                              direction: 'source-to-target',
                              sourceLanguage: 'en',
                              targetLanguage: 'es',
                              priorityEntryId: entries[0]!,
                              candidates: targets,
                          },
                    selectedExecutionSnapshot: snapshot,
                    executionRevisionId: revisionId,
                    executionState: active ? 'queued' : 'completed',
                    completedAt: active ? null : now,
                    resultExerciseId: check ? null : exerciseId,
                    providerMaxCostMicrosPerAttempt: 1,
                    providerMaxInputTokensPerAttempt: 100,
                    providerMaxOutputTokensPerAttempt: 100,
                    providerReservationState: active ? 'released' : 'settled',
                    providerReservationSettledAt: active ? null : now,
                    providerActualCostMicros: active ? null : 1,
                    providerActualInputTokens: active ? null : 10,
                    providerActualOutputTokens: active ? null : 5,
                });
                await tx.insert(sentenceJobEntriesTable).values(
                    entries.map((entryId) => ({
                        jobId: id,
                        dictionaryId: dictionary,
                        entryId,
                        learningVersion: 1,
                    })),
                );
            });
            return id;
        }
        const deleteB = () =>
            new DrizzleDictionaryDeletionStore(db, {
                generate: randomUUID,
            }).deleteDictionaryCards({
                ownerId: owner,
                dictionaryId,
                idempotencyKey: randomUUID(),
                fingerprint: `hmac-sha256:v1:${'a'.repeat(43)}`,
                request: {
                    expectedDictionaryVersion: 1,
                    scope: {
                        kind: 'selected',
                        targets: [{ cardId: b, expectedVersion: 1 }],
                    },
                },
                context: context(),
            });
        it('entry deletion blocks copied candidate work, then erases whole derived exercises/checks while preserving unchanged coverage', async () => {
            const id = await exercise();
            await personal(id);
            const generationId = await job(id);
            const checkId = await job(
                id,
                reader,
                dictionaryId,
                [a],
                true,
                true,
            );
            await db
                .update(dictionaryCardsTable)
                .set({ lifecycle: 'archived', archivedAt: new Date() })
                .where(eq(dictionaryCardsTable.id, b));
            await expect(deleteB()).rejects.toBeInstanceOf(
                DictionaryDeletionBusyError,
            );
            expect(await db.select().from(sentenceExercisesTable)).toHaveLength(
                1,
            );
            await db
                .update(sentenceAiJobsTable)
                .set({ executionState: 'cancelled', completedAt: now })
                .where(eq(sentenceAiJobsTable.id, checkId));
            await expect(deleteB()).resolves.toMatchObject({ deletedCount: 1 });
            expect(await db.select().from(sentenceExercisesTable)).toHaveLength(
                0,
            );
            expect(await db.select().from(sentenceAttemptsTable)).toHaveLength(
                0,
            );
            expect(
                await db.select().from(sentenceManualReviewsTable),
            ).toHaveLength(0);
            expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(0);
            expect(
                await db.select().from(sentenceEntryCoverageTable),
            ).toMatchObject([{ entryId: a, exposureCount: 1 }]);
            expect(
                await db
                    .select()
                    .from(dictionaryGenerationProviderUsageArchiveTable),
            ).toMatchObject([
                { id: generationId, ownerId: reader, actualCostMicros: 1 },
            ]);
            expect(
                (await db.select().from(sentenceNextReceiptsTable)).every(
                    (receipt) =>
                        receipt.configuration === null &&
                        receipt.invalidatedAt !== null,
                ),
            ).toBe(true);
        });
        it('archive denies live practice without erasing history, restore retains it, and permanent dictionary deletion erases all derived content', async () => {
            const id = await exercise();
            await personal(id);
            await job(id);
            const other = await exercise(reader, foreignId, foreignEntry, true);
            const practice = new DrizzleSentencePracticeStore(db, {
                resolveExecution: async () => {
                    throw new Error('Progress must not admit AI work');
                },
            });
            const access = {
                kind: 'owner' as const,
                learnerId: owner,
                dictionaryId,
            };
            await expect(
                practice.progress(
                    access,
                    { direction: 'source-to-target' },
                    context(),
                ),
            ).resolves.toMatchObject({ direction: 'source-to-target' });
            await db
                .update(dictionariesTable)
                .set({ lifecycle: 'archived', archivedAt: now })
                .where(eq(dictionariesTable.id, dictionaryId));
            await expect(
                practice.progress(
                    access,
                    { direction: 'source-to-target' },
                    context(),
                ),
            ).rejects.toThrow();
            expect(await db.select().from(sentenceExercisesTable)).toHaveLength(
                2,
            );
            expect(await db.select().from(sentenceAttemptsTable)).toHaveLength(
                1,
            );
            await db
                .update(dictionariesTable)
                .set({ lifecycle: 'active', archivedAt: null })
                .where(eq(dictionariesTable.id, dictionaryId));
            await expect(
                practice.progress(
                    access,
                    { direction: 'source-to-target' },
                    context(),
                ),
            ).resolves.toMatchObject({ direction: 'source-to-target' });
            expect(await db.select().from(sentenceAttemptsTable)).toHaveLength(
                1,
            );
            await db
                .update(dictionariesTable)
                .set({ lifecycle: 'archived', archivedAt: now })
                .where(eq(dictionariesTable.id, dictionaryId));
            await expect(
                new DrizzleDictionaryDeletionStore(db, {
                    generate: randomUUID,
                }).deleteDictionaries({
                    ownerId: owner,
                    idempotencyKey: randomUUID(),
                    fingerprint: `hmac-sha256:v1:${'a'.repeat(43)}`,
                    request: {
                        scope: {
                            kind: 'selected',
                            targets: [{ dictionaryId, expectedVersion: 1 }],
                        },
                    },
                    context: context(),
                }),
            ).resolves.toMatchObject({ deletedCount: 1 });
            expect(
                await db.select().from(sentenceExercisesTable),
            ).toMatchObject([{ id: other, dictionaryId: foreignId }]);
            expect(await db.select().from(sentenceAttemptsTable)).toHaveLength(
                0,
            );
            expect(
                await db.select().from(sentenceManualReviewsTable),
            ).toHaveLength(0);
            expect(
                await db.select().from(sentenceEntryCoverageTable),
            ).toHaveLength(0);
        });
        it('account deletion flags its foreign jobs and other learners owned-dictionary jobs without settling either', async () => {
            const owned = await exercise();
            const foreign = await exercise(
                owner,
                foreignId,
                foreignEntry,
                false,
            );
            const ownedJob = await job(owned, reader, dictionaryId, [a], true);
            const foreignJob = await job(
                foreign,
                owner,
                foreignId,
                [foreignEntry],
                true,
            );
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            await db.insert(accountDeletionRequestsTable).values({
                userId: owner,
                scheduledAt: new Date(now.getTime() - 30 * 24 * 60 * 60000),
                purgeAt: now,
                nextAttemptAt: now,
                updatedAt: now,
            });
            await new DrizzleOwnerDeletionPreparation(db).requestCancellation(
                owner,
            );
            const rows = await db.select().from(sentenceAiJobsTable);
            expect(rows.map((row) => row.id).sort()).toEqual(
                [ownedJob, foreignJob].sort(),
            );
            expect(
                rows.every(
                    (row) =>
                        row.cancellationRequestedAt !== null &&
                        row.executionState === 'queued',
                ),
            ).toBe(true);
            const purge = new DrizzleAccountPurgeStore(db);
            const claim = await purge.claimDue({
                workerId: 'busy-sentence-purge',
                now,
            });
            expect(
                (
                    await purge.inspectOwner({
                        ...claim!,
                        workerId: 'busy-sentence-purge',
                    })
                ).activeJobs,
            ).toBeGreaterThan(0);
            await expect(
                purge.finish({
                    ...claim!,
                    workerId: 'busy-sentence-purge',
                    now,
                }),
            ).rejects.toThrow('Sentence work is not quiescent');
            expect(await db.select().from(sentenceAiJobsTable)).toHaveLength(2);
            expect(
                (
                    await db
                        .select()
                        .from(usersTable)
                        .where(eq(usersTable.id, owner))
                )[0]?.status,
            ).toBe('deletion_pending');
        });
        it('restricted account purge erases foreign private reviews and all learners owned content without reading sentence text', async () => {
            const owned = await exercise();
            const privateForeign = await exercise(
                owner,
                foreignId,
                foreignEntry,
                false,
            );
            const unaffected = await exercise(
                reader,
                foreignId,
                foreignEntry,
                true,
            );
            await personal(owned);
            await personal(privateForeign, owner, foreignId, foreignEntry);
            await personal(unaffected, reader, foreignId, foreignEntry);
            const archivedOther = await job(owned, reader, dictionaryId, [a]);
            await job(privateForeign, owner, foreignId, [foreignEntry]);
            await db
                .update(usersTable)
                .set({
                    status: 'deletion_pending',
                })
                .where(eq(usersTable.id, owner));
            await db.insert(accountDeletionRequestsTable).values({
                userId: owner,
                scheduledAt: new Date(now.getTime() - 30 * 24 * 60 * 60000),
                purgeAt: now,
                nextAttemptAt: now,
                updatedAt: now,
            });
            const role = `sentence_purge_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`create role ${role}`);
            const connection = createPostgresClient({
                databaseUrl: getTestDatabaseUrl(),
                maxConnections: 1,
            });
            try {
                const sql = await readFile(
                    new URL(
                        '../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                );
                await client.unsafe(
                    sql
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"account_purge_role"', role),
                );
                await connection.unsafe(`set role ${role}`);
                for (const query of [
                    'select input_payload from sentence_ai_jobs',
                    'select public_content from sentence_exercises',
                    'select reference_translation from sentence_exercises',
                    'select answer from sentence_attempts',
                    'select feedback from sentence_attempts',
                    'select configuration from sentence_next_receipts',
                ])
                    await expect(connection.unsafe(query)).rejects.toThrow();
                const purge = new DrizzleAccountPurgeStore(
                    createDrizzleDatabase(connection, databaseSchema),
                );
                const claim = await purge.claimDue({
                    workerId: 'restricted-sentence-purge',
                    now,
                });
                expect(claim?.userId).toBe(owner);
                expect(
                    (
                        await purge.inspectOwner({
                            ...claim!,
                            workerId: 'restricted-sentence-purge',
                        })
                    ).activeJobs,
                ).toBe(0);
                await expect(
                    purge.finish({
                        ...claim!,
                        workerId: 'restricted-sentence-purge',
                        now,
                    }),
                ).resolves.toBe(true);
                expect(
                    await db.select().from(sentenceExercisesTable),
                ).toMatchObject([{ id: unaffected, creatorId: reader }]);
                expect(
                    await db.select().from(sentenceAttemptsTable),
                ).toMatchObject([
                    { learnerId: reader, exerciseId: unaffected },
                ]);
                expect(
                    await db.select().from(sentenceManualReviewsTable),
                ).toMatchObject([
                    { learnerId: reader, exerciseId: unaffected },
                ]);
                expect(
                    await db.select().from(sentenceEntryCoverageTable),
                ).toMatchObject([
                    { learnerId: reader, dictionaryId: foreignId },
                ]);
                expect(
                    await db.select().from(sentenceAiJobsTable),
                ).toHaveLength(0);
                expect(
                    await db
                        .select()
                        .from(dictionaryGenerationProviderUsageArchiveTable),
                ).toMatchObject([{ id: archivedOther, ownerId: reader }]);
            } finally {
                await connection.unsafe('reset role');
                await connection.end({ timeout: 1 });
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        });
    },
);
