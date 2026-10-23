import { createFixtureAudio } from '../../../../../src/modules/speech/domain/audio-integrity';
import { speechAudioBlobsTable } from '../../../../../src/modules/speech/infrastructure/blob-schema';
import { speechRecordingsTable } from '../../../../../src/modules/speech/infrastructure/schema';
import { PostgresAudioObjectStorage } from '../../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { sentenceExercisesTable } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import {
    sentencePersonalVisibilityTable,
    sentenceGlobalVisibilityTable,
} from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-library-schema';
import {
    sentencePreparationsTable,
    sentencePreparationBatchesTable,
} from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-preparation-schema';
import {
    sentenceLibrarySnapshotsTable,
    sentenceLibraryReceiptsTable,
} from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-library-schema';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { DrizzleAccountPurgeStore } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { textAiPreferencesTable } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import { flashcardPreferencesTable } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import {
    userEmailsTable,
    usersTable,
} from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    authSecurityEventsTable,
    passwordCredentialsTable,
} from '../../../../../src/modules/authentication/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

let client: PostgresClient;
let database: PostgresJsDatabase<typeof databaseSchema>;
let store: DrizzleAccountPurgeStore;
// Checked deletion leases use PostgreSQL's real clock.
const now = new Date();

async function scheduledIdentity() {
    const userId = randomUUID();
    await database
        .insert(usersTable)
        .values({ id: userId, status: 'deletion_pending' });
    await database.insert(accountDeletionRequestsTable).values({
        nextAttemptAt: now,
        purgeAt: now,
        scheduledAt: new Date(now.getTime() - 30 * 24 * 60 * 60_000),
        updatedAt: now,
        userId,
    });
    return userId;
}

describe.runIf(isDatabaseIntegrationEnabled())(
    'DrizzleAccountPurgeStore',
    () => {
        beforeAll(async () => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            store = new DrizzleAccountPurgeStore(database);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        });
        beforeEach(async () => {
            await database.delete(accountDeletionRequestsTable);
            await database.delete(dictionariesTable);
            await database.delete(usersTable);
        });
        afterAll(async () => {
            await client.end();
        });

        it('retains current shared recording text and PostgreSQL bytes after full account purge', async () => {
            const userId = await scheduledIdentity();
            const storage = new PostgresAudioObjectStorage(database);
            const audio = createFixtureAudio();
            const reference = await storage.put(
                `speech/retained/${randomUUID()}`,
                audio,
            );
            const recordingId = randomUUID();
            await database.insert(speechRecordingsTable).values({
                id: recordingId,
                canonicalKey: `synthetic-${recordingId}`,
                text: 'Retained pronunciation',
                language: 'en',
                normalizationRevision: 'test',
                profile: {
                    configurationId: 'fixture-v1',
                    provider: 'fixture',
                    model: 'fixture',
                    voice: 'fixture',
                    language: 'en',
                    settingsVersion: '1',
                    estimatedCostUnitsPerCharacter: 0,
                },
                state: 'ready',
                storage: reference,
                createdAt: now,
                lastAccessedAt: now,
            });
            const claim = await store.claimDue({
                now,
                workerId: 'retention-proof',
            });
            expect(claim?.userId).toBe(userId);
            expect(
                await store.inspectOwner({
                    ...claim!,
                    workerId: 'retention-proof',
                }),
            ).toEqual({
                activeJobs: 0,
                objects: [],
            });
            expect(
                await store.finish({
                    ...claim!,
                    now,
                    workerId: 'retention-proof',
                }),
            ).toBe(true);
            expect(
                (
                    await database
                        .select()
                        .from(speechRecordingsTable)
                        .where(eq(speechRecordingsTable.id, recordingId))
                )[0]?.text,
            ).toBe('Retained pronunciation');
            expect(await storage.read(reference)).toMatchObject({
                bytes: audio.bytes,
            });
            await database
                .delete(speechRecordingsTable)
                .where(eq(speechRecordingsTable.id, recordingId));
            await database.delete(speechAudioBlobsTable);
        });

        it('claims only a due pending account and fences a stale worker', async () => {
            const userId = await scheduledIdentity();
            const claim = await store.claimDue({ now, workerId: 'worker-a' });
            expect(claim).toEqual({ fencingToken: 1, userId });
            expect(
                await store.claimDue({ now, workerId: 'worker-b' }),
            ).toBeNull();
            await store.retry({ ...claim!, now, workerId: 'worker-a' });
            expect(
                await store.claimDue({ now: new Date(), workerId: 'worker-b' }),
            ).toBeNull();
            // Simulate elapsed backoff in persisted due state, rather than
            // bypassing the database's real-clock claim guard with a future now.
            const retryNow = new Date();
            await database
                .update(accountDeletionRequestsTable)
                .set({ nextAttemptAt: new Date(retryNow.getTime() - 1) })
                .where(eq(accountDeletionRequestsTable.userId, userId));
            const next = await store.claimDue({
                now: retryNow,
                workerId: 'worker-b',
            });
            expect(next?.fencingToken).toBe(2);
            expect(
                await store.finish({
                    ...claim!,
                    now: retryNow,
                    workerId: 'worker-a',
                }),
            ).toBe(false);
        });

        it('leaves an ID-only tombstone and preserves independent forks', async () => {
            const userId = await scheduledIdentity();
            await database.insert(userEmailsTable).values({
                id: randomUUID(),
                userId,
                email: 'purge@example.test',
                canonicalEmail: 'purge@example.test',
            });
            await database.insert(passwordCredentialsTable).values({
                userId,
                algorithmVersion: 19,
                hash: `$argon2id$${'A'.repeat(64)}`,
                memoryCostKiB: 19456,
                parallelism: 1,
                timeCost: 2,
            });
            const securityEventId = randomUUID();
            await database.insert(authSecurityEventsTable).values({
                id: securityEventId,
                correlationId: randomUUID(),
                eventType: 'auth.account_deletion_scheduled',
                metadata: { email: 'purge@example.test' },
                outcome: 'success',
                userId,
            });
            const otherUserId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: otherUserId, status: 'active' });
            await database.insert(textAiPreferencesTable).values([
                {
                    userId,
                    mode: 'explicit',
                    modelId: 'deepseek-flash',
                    version: 1,
                },
                {
                    userId: otherUserId,
                    mode: 'explicit',
                    modelId: 'gemini-2.5-pro',
                    version: 2,
                },
            ]);
            const sourceId = randomUUID();
            const forkId = randomUUID();
            await database.insert(dictionariesTable).values({
                id: sourceId,
                name: 'Source',
                ownerId: userId,
                sourceLanguageTag: 'en',
                targetLanguageTag: 'ru',
            });
            await database.insert(dictionariesTable).values({
                id: forkId,
                name: 'Independent fork',
                ownerId: otherUserId,
                sourceDictionaryId: sourceId,
                sourceLanguageTag: 'en',
                targetLanguageTag: 'ru',
            });
            const claim = await store.claimDue({ now, workerId: 'worker-a' });
            expect(claim).not.toBeNull();
            expect(
                await store.finish({ ...claim!, now, workerId: 'worker-a' }),
            ).toBe(true);
            const [user] = await database
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, userId));
            expect(user?.status).toBe('purged');
            expect(user?.handle).toBeNull();
            expect(
                await database.select().from(textAiPreferencesTable),
            ).toMatchObject([
                {
                    userId: otherUserId,
                    mode: 'explicit',
                    modelId: 'gemini-2.5-pro',
                    version: 2,
                },
            ]);
            expect(
                await database
                    .select()
                    .from(userEmailsTable)
                    .where(eq(userEmailsTable.userId, userId)),
            ).toHaveLength(0);
            expect(
                await database
                    .select()
                    .from(passwordCredentialsTable)
                    .where(eq(passwordCredentialsTable.userId, userId)),
            ).toHaveLength(0);
            const [event] = await database
                .select()
                .from(authSecurityEventsTable)
                .where(eq(authSecurityEventsTable.id, securityEventId));
            expect(event?.metadata).toEqual({});
            const [fork] = await database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, forkId));
            expect(fork?.sourceDictionaryId).toBeNull();
            const [source] = await database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, sourceId));
            expect(source).toBeUndefined();
        });
        it('purges preferences under the dedicated role without reading preference or learning content', async () => {
            const userId = await scheduledIdentity();
            const otherUserId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: otherUserId, status: 'active' });
            await database.insert(textAiPreferencesTable).values([
                {
                    userId,
                    mode: 'explicit',
                    modelId: 'deepseek-flash',
                    version: 1,
                },
                { userId: otherUserId, mode: 'auto', version: 3 },
            ]);
            const dictionaryId = randomUUID();
            await database.insert(dictionariesTable).values({
                id: dictionaryId,
                ownerId: otherUserId,
                name: 'Independent learner content',
                sourceLanguageTag: 'en',
                targetLanguageTag: 'es',
            });
            await database.insert(flashcardPreferencesTable).values([
                {
                    learnerId: userId,
                    dictionaryId,
                    shuffle: true,
                    configuration: { front: ['source'], back: ['translation'] },
                },
                {
                    learnerId: otherUserId,
                    dictionaryId,
                    shuffle: false,
                    configuration: { front: ['translation'], back: ['source'] },
                },
            ]);
            const sharedExerciseId = randomUUID();
            await database.insert(sentenceExercisesTable).values({
                id: sharedExerciseId,
                creatorId: otherUserId,
                dictionaryId,
                direction: 'source-to-target',
                shared: true,
                referenceTranslation: 'hola',
                publicContent: {
                    id: sharedExerciseId,
                    dictionaryId,
                    direction: 'source-to-target',
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                    sourceText: 'hello',
                    generationPolicyVersion: 1,
                    createdAt: now.toISOString(),
                    segments: [
                        {
                            id: 'segment-1',
                            start: 0,
                            end: 5,
                            text: 'hello',
                            target: {
                                entryId: randomUUID(),
                                occurrenceId: 'occurrence-1',
                                hintId: 'hint-1',
                            },
                        },
                    ],
                    hints: [{ id: 'hint-1', text: 'hola', kind: 'dictionary' }],
                },
            });
            await database.insert(sentencePersonalVisibilityTable).values(
                [userId, otherUserId].map((learnerId) => ({
                    learnerId,
                    exerciseId: sharedExerciseId,
                    archivedAt: now,
                    actorId: userId,
                    updatedAt: now,
                })),
            );
            await database.insert(sentenceGlobalVisibilityTable).values({
                exerciseId: sharedExerciseId,
                archivedAt: now,
                actorId: userId,
                updatedAt: now,
            });
            const erasedPreparationId = randomUUID();
            const survivingPreparationId = randomUUID();
            await database.insert(sentencePreparationsTable).values(
                [userId, otherUserId].map((learnerId, index) => ({
                    id: index ? survivingPreparationId : erasedPreparationId,
                    learnerId,
                    dictionaryId,
                    authority: { kind: 'owner' } as const,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                    direction: 'source-to-target' as const,
                    mode: 'saved-first' as const,
                    state: 'paused' as const,
                    operationId: randomUUID(),
                    fingerprint: 'fixture',
                    createdAt: now,
                    updatedAt: now,
                })),
            );
            await database.insert(sentencePreparationBatchesTable).values(
                [erasedPreparationId, survivingPreparationId].map(
                    (preparationId) => ({
                        id: randomUUID(),
                        preparationId,
                        ordinal: 0,
                        entries: [
                            {
                                entryId: randomUUID(),
                                learningVersion: 1,
                                sourceText: 'private vocabulary',
                                targetText: 'private translation',
                            },
                        ],
                        manifest: [],
                    }),
                ),
            );
            await database.insert(sentenceLibrarySnapshotsTable).values({
                id: randomUUID(),
                actorId: userId,
                learnerId: userId,
                dictionaryId,
                operation: 'archive',
                scope: 'personal',
                items: [],
                expiresAt: new Date(now.getTime() + 60000),
            });
            await database.insert(sentenceLibraryReceiptsTable).values({
                actorId: userId,
                operationId: randomUUID(),
                learnerId: userId,
                dictionaryId,
                fingerprint: 'opaque-idempotency',
                affectedCount: 0,
                createdAt: now,
            });
            const role = `account_purge_test_${randomUUID().replaceAll('-', '')}`;
            const script = await readFile(
                new URL(
                    '../../../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );
            await client.unsafe(`create role ${role}`);
            const connection = createPostgresClient({
                databaseUrl: getTestDatabaseUrl(),
                maxConnections: 1,
            });
            try {
                await client.unsafe(
                    script
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"account_purge_role"', role),
                );
                await connection.unsafe(`set role ${role}`);
                for (const query of [
                    'select model_id from user_text_ai_preferences',
                    'select mode from user_text_ai_preferences',
                    'select configuration from flashcard_preferences',
                    'select rating from flashcard_attempts',
                    'select handle from users',
                    'select entries from sentence_preparation_batches',
                    'select input_payload from sentence_ai_jobs',
                ])
                    await expect(connection.unsafe(query)).rejects.toThrow();
                await expect(
                    connection.unsafe(
                        "update user_text_ai_preferences set mode='auto' where false",
                    ),
                ).rejects.toThrow();
                const workerStore = new DrizzleAccountPurgeStore(
                    createDrizzleDatabase(connection, databaseSchema),
                );
                const claim = await workerStore.claimDue({
                    now,
                    workerId: 'narrow-purge-worker',
                });
                expect(claim).toEqual({ userId, fencingToken: 1 });
                expect(
                    (
                        await workerStore.inspectOwner({
                            ...claim!,
                            workerId: 'narrow-purge-worker',
                        })
                    ).activeJobs,
                ).toBe(0);
                await expect(
                    workerStore.finish({
                        ...claim!,
                        now,
                        workerId: 'narrow-purge-worker',
                    }),
                ).resolves.toBe(true);
                expect(
                    await database
                        .select()
                        .from(sentencePersonalVisibilityTable),
                ).toMatchObject([
                    {
                        learnerId: otherUserId,
                        exerciseId: sharedExerciseId,
                        actorId: null,
                        archivedAt: now,
                    },
                ]);
                expect(
                    await database.select().from(sentenceGlobalVisibilityTable),
                ).toMatchObject([
                    {
                        exerciseId: sharedExerciseId,
                        actorId: null,
                        archivedAt: now,
                    },
                ]);
                expect(
                    await database.select().from(sentencePreparationsTable),
                ).toMatchObject([
                    { id: survivingPreparationId, learnerId: otherUserId },
                ]);
                expect(
                    await database
                        .select()
                        .from(sentencePreparationBatchesTable),
                ).toHaveLength(1);
                expect(
                    await database.select().from(sentenceLibrarySnapshotsTable),
                ).toHaveLength(0);
                expect(
                    await database.select().from(sentenceLibraryReceiptsTable),
                ).toHaveLength(0);
                expect(
                    await database.select().from(textAiPreferencesTable),
                ).toMatchObject([
                    { userId: otherUserId, mode: 'auto', version: 3 },
                ]);
                expect(
                    await database.select().from(flashcardPreferencesTable),
                ).toMatchObject([
                    { learnerId: otherUserId, dictionaryId, shuffle: false },
                ]);
                expect(
                    (
                        await database
                            .select()
                            .from(usersTable)
                            .where(eq(usersTable.id, userId))
                    )[0]?.status,
                ).toBe('purged');
                expect(
                    (
                        await database
                            .select()
                            .from(usersTable)
                            .where(eq(usersTable.id, otherUserId))
                    )[0]?.status,
                ).toBe('active');
            } finally {
                await connection.unsafe('reset role');
                await connection.end({ timeout: 1 });
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        });
    },
);
