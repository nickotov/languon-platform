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
import { accountDeletionRequestsTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import {
    userEmailsTable,
    usersTable,
} from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    authSecurityEventsTable,
    passwordCredentialsTable,
} from '../../../../../src/modules/authentication/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    dictionaryAudioAssetsTable,
    dictionaryAudioBindingsTable,
    dictionaryAudioBlobsTable,
    dictionaryAudioJobsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/audio-schema';
import { DrizzleOwnerDeletionPreparation } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-owner-deletion-preparation';
import { PostgresAudioObjectStorage } from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-object-storages';
import { AccountPurgeService } from '../../../../../src/modules/users/application/account-purge-service';
import { DrizzleDictionaryAudioStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-audio-store';
import { DrizzleDictionaryAudioMeasurements } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-audio-measurements';
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
const now = new Date('2026-09-15T00:00:00Z');

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
        it.each([
            ['deletion_pending', 'waiting_provider'],
            ['deletion_pending', 'submission_unknown'],
            ['disabled', 'waiting_provider'],
            ['disabled', 'submission_unknown'],
        ] as const)(
            'does not resubmit %s -> restored %s audio',
            async (inactiveStatus, originalState) => {
                const userId = await scheduledIdentity();
                await database
                    .update(usersTable)
                    .set({ status: 'active' })
                    .where(eq(usersTable.id, userId));
                const dictionaryId = randomUUID(),
                    cardId = randomUUID();
                await database
                    .insert(dictionariesTable)
                    .values({
                        id: dictionaryId,
                        ownerId: userId,
                        name: 'Restoration test',
                        sourceLanguageTag: 'en',
                        targetLanguageTag: 'es',
                    });
                await database
                    .insert(dictionarySettingsTable)
                    .values({ dictionaryId });
                await database
                    .insert(dictionaryCardsTable)
                    .values({
                        id: cardId,
                        dictionaryId,
                        source: 'hello',
                        translation: 'hola',
                        normalizedSource: 'hello',
                        sortKey: 1n,
                        authorship: 'human',
                    });
                const audio = new DrizzleDictionaryAudioStore(database);
                const budget = {
                    ownerDailyCost: 10000,
                    globalDailyCost: 100000,
                    ownerQueued: 10,
                    ownerActive: 2,
                    globalActive: 4,
                };
                const input = {
                    ownerId: userId,
                    dictionaryId,
                    cardId,
                    cardVersion: 1,
                    settingsVersion: 1,
                    field: 'source' as const,
                    fingerprint: 'same-private-content',
                    text: 'hello',
                    now,
                    budget,
                    profile: {
                        configurationId: 'fixture-v1',
                        provider: 'fixture',
                        model: 'fixture',
                        voice: 'fixture',
                        language: 'en',
                        settingsVersion: '1',
                        estimatedCostUnitsPerCharacter: 1,
                    },
                    storage: {
                        backend: 'postgres' as const,
                        namespace: 'dictionary-audio-v1',
                        key: 'dictionary-audio/restore-test',
                    },
                };
                const original = await audio.enqueue(input);
                const taskId =
                    originalState === 'waiting_provider'
                        ? 'known-upstream-task'
                        : null;
                await database
                    .update(dictionaryAudioJobsTable)
                    .set({ state: originalState, taskId })
                    .where(eq(dictionaryAudioJobsTable.id, original.job.id));
                await database
                    .update(usersTable)
                    .set({ status: inactiveStatus })
                    .where(eq(usersTable.id, userId));
                if (inactiveStatus === 'deletion_pending')
                    await new DrizzleOwnerDeletionPreparation(
                        database,
                    ).requestCancellation(userId);
                else await audio.claim(now, budget, true);
                await database
                    .update(usersTable)
                    .set({ status: 'active' })
                    .where(eq(usersTable.id, userId));
                const replay = await audio.enqueue(input);
                expect(replay.job.id).toBe(original.job.id);
                expect(replay.job.state).toBe('submission_unknown');
                expect(replay.job.taskId).toBe(taskId);
                expect(await audio.claim(now, budget, true)).toBeNull();
                expect(
                    await database.select().from(dictionaryAudioJobsTable),
                ).toHaveLength(1);
                expect(
                    await database.select().from(dictionaryAudioBindingsTable),
                ).toHaveLength(1);
            },
        );
        it('runs audio claim/cleanup under narrow worker privileges without identity write authority', async () => {
            const role = `audio_worker_test_${randomUUID().replaceAll('-', '')}`;
            const roleScript = await readFile(
                new URL(
                    '../../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
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
                    roleScript
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"dictionary_worker_role"', role),
                );
                await connection.unsafe(`set role ${role}`);
                const workerDatabase = createDrizzleDatabase(
                    connection,
                    databaseSchema,
                );
                const audioStore = new DrizzleDictionaryAudioStore(
                    workerDatabase,
                    'test-audio-fingerprint-secret-32characters',
                );
                const measurements =
                    await new DrizzleDictionaryAudioMeasurements(
                        workerDatabase,
                    ).observe({
                        now: new Date(),
                        signal: new AbortController().signal,
                    });
                expect(measurements).toEqual({
                    schemaVersion: 1,
                    queueQueuedCount: 0,
                    queueSubmittingCount: 0,
                    queueWaitingProviderCount: 0,
                    queueStoringCount: 0,
                    submissionUnknownCount: 0,
                    liveLeaseCount: 0,
                    reservedDailyCostUnits: 0,
                    cleanupPendingCount: 0,
                    cleanupOldestAgeMs: 0,
                });
                expect(
                    await audioStore.cleanupCandidate(new Date()),
                ).toBeNull();
                expect(
                    await audioStore.claim(
                        new Date(),
                        {
                            ownerDailyCost: 10000,
                            globalDailyCost: 100000,
                            ownerQueued: 10,
                            ownerActive: 2,
                            globalActive: 4,
                        },
                        true,
                    ),
                ).toBeNull();
                await expect(
                    connection.unsafe('select handle from users'),
                ).rejects.toThrow();
                await expect(
                    connection.unsafe(
                        "update users set status='active' where false",
                    ),
                ).rejects.toThrow();
            } finally {
                await connection.unsafe('reset role');
                await connection.end({ timeout: 1 });
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        });
        it('keeps pending audio until writers quiesce and deletes bytes before tombstoning', async () => {
            const userId = await scheduledIdentity();
            const assetId = randomUUID();
            const dictionaryId = randomUUID();
            const cardId = randomUUID();
            const jobId = randomUUID();
            const reference = {
                backend: 'postgres' as const,
                namespace: 'dictionary-audio-v1',
                key: `dictionary-audio/${userId}/${assetId}`,
            };
            await database.insert(dictionaryAudioAssetsTable).values({
                id: assetId,
                ownerId: userId,
                dictionaryId,
                cardId,
                field: 'source',
                fingerprint: 'test',
                storage: reference,
                state: 'pending',
                createdAt: now,
                lastAccessedAt: now,
                writerExpiresAt: new Date(Date.now() + 90000),
            });
            await database.insert(dictionaryAudioJobsTable).values({
                id: jobId,
                ownerId: userId,
                dictionaryId,
                cardId,
                field: 'source',
                fingerprint: 'test',
                assetId,
                text: 'private text',
                cardVersion: 1,
                settingsVersion: 1,
                profile: {
                    configurationId: 'fixture-v1',
                    provider: 'fixture',
                    model: 'fixture',
                    voice: 'fixture',
                    language: 'en',
                    settingsVersion: '1',
                    estimatedCostUnitsPerCharacter: 1,
                },
                state: 'submitting',
                leaseToken: randomUUID(),
                leaseExpiresAt: new Date(Date.now() + 60000),
                nextPollAt: now,
                deadlineAt: new Date(Date.now() + 120000),
                reservedCost: 12,
                createdAt: now,
            });
            await database.insert(dictionaryAudioBlobsTable).values({
                namespace: reference.namespace,
                key: reference.key,
                bytes: Buffer.from('test audio'),
                checksum: 'fake',
                mimeType: 'audio/wav',
            });
            await new DrizzleOwnerDeletionPreparation(
                database,
            ).requestCancellation(userId);
            const audioMeasurement =
                await new DrizzleDictionaryAudioMeasurements(database).observe({
                    now,
                    signal: new AbortController().signal,
                });
            expect(audioMeasurement.reservedDailyCostUnits).toBe(12);
            expect(audioMeasurement.liveLeaseCount).toBe(1);
            expect(audioMeasurement.cleanupPendingCount).toBe(0);
            const [cancelled] = await database
                .select()
                .from(dictionaryAudioJobsTable);
            expect(cancelled).toMatchObject({
                state: 'submission_unknown',
                text: '',
            });
            expect(cancelled?.leaseExpiresAt).not.toBeNull();
            const claim = await store.claimDue({
                now,
                workerId: 'purge-audio',
            });
            expect(claim).not.toBeNull();
            expect(
                (await store.inspectOwner(claim!)).activeJobs,
            ).toBeGreaterThan(0);
            await expect(
                store.finish({ ...claim!, now, workerId: 'purge-audio' }),
            ).rejects.toThrow('not quiescent');
            await database
                .update(dictionaryAudioJobsTable)
                .set({ leaseExpiresAt: new Date(now.getTime() - 1000) });
            await expect(
                store.finish({ ...claim!, now, workerId: 'purge-audio' }),
            ).rejects.toThrow('storage writes are not quiescent');
            await database
                .update(dictionaryAudioAssetsTable)
                .set({ writerExpiresAt: new Date(now.getTime() - 1000) });
            expect((await store.inspectOwner(claim!)).objects).toEqual([
                {
                    kind: 'pronunciation-audio',
                    cleanupState: 'complete',
                    reference,
                },
            ]);
            await store.releaseWorkerLeases({ now, workerId: 'purge-audio' });
            const audioStorage = new PostgresAudioObjectStorage(database);
            const service = new AccountPurgeService(store, {
                removeAllVersions: async () => {
                    throw new Error('Unexpected document inventory');
                },
                removeAudioVersions: async (object) => {
                    await audioStorage.delete(object);
                },
            });
            await expect(
                service.processNext({
                    now: new Date(),
                    workerId: 'purge-audio',
                    signal: new AbortController().signal,
                }),
            ).resolves.toBe(true);
            expect(
                await database.select().from(dictionaryAudioAssetsTable),
            ).toEqual([]);
            expect(
                await database.select().from(dictionaryAudioJobsTable),
            ).toEqual([]);
            expect(
                await database.select().from(dictionaryAudioBlobsTable),
            ).toEqual([]);
            const [user] = await database.select().from(usersTable);
            expect(user?.status).toBe('purged');
        });
        beforeAll(async () => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
            store = new DrizzleAccountPurgeStore(database);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        });
        beforeEach(async () => {
            await database.delete(dictionaryAudioBindingsTable);
            await database.delete(dictionaryAudioBlobsTable);
            await database.delete(dictionaryAudioJobsTable);
            await database.delete(dictionaryAudioAssetsTable);
            await database.delete(accountDeletionRequestsTable);
            await database.delete(dictionariesTable);
            await database.delete(usersTable);
        });
        afterAll(async () => {
            await client.end();
        });

        it('claims only a due pending account and fences a stale worker', async () => {
            const userId = await scheduledIdentity();
            const claim = await store.claimDue({ now, workerId: 'worker-a' });
            expect(claim).toEqual({ fencingToken: 1, userId });
            expect(
                await store.claimDue({ now, workerId: 'worker-b' }),
            ).toBeNull();
            await store.retry({ ...claim!, now, workerId: 'worker-a' });
            const next = await store.claimDue({
                now: new Date(now.getTime() + 5 * 60_000),
                workerId: 'worker-b',
            });
            expect(next?.fencingToken).toBe(2);
            expect(
                await store.finish({
                    ...claim!,
                    now: new Date(now.getTime() + 5 * 60_000),
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
    },
);
