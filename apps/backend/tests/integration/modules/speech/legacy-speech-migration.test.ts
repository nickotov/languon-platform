import { createHmac, randomUUID, randomBytes } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq, sql } from 'drizzle-orm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleDictionaryStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { DrizzleDictionaryAudioStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-audio-store';
import {
    dictionaryAudioAssetsTable,
    dictionaryAudioBindingsTable,
    dictionaryAudioJobsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/audio-schema';
import { HmacDictionaryCryptography } from '../../../../src/modules/dictionaries/infrastructure/crypto/dictionary-cryptography';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { DrizzleSpeechSourceResolver } from '../../../../src/modules/speech/infrastructure/source-resolver';
import {
    LegacySpeechMigration,
    LegacySpeechMigrationBlockedError,
} from '../../../../src/modules/speech/infrastructure/legacy-migration';
import {
    speechBindingsTable,
    speechJobsTable,
    speechRecordingsTable,
} from '../../../../src/modules/speech/infrastructure/schema';
import { createFixtureAudio } from '../../../../src/modules/speech/domain/audio-integrity';
import type { AudioObjectStorage } from '../../../../src/modules/speech/application/ports';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'resumable legacy audio promotion without provider calls',
    () => {
        let client: PostgresClient,
            db: PostgresJsDatabase<typeof databaseSchema>,
            storage: PostgresAudioObjectStorage,
            audio: DrizzleDictionaryAudioStore,
            resolver: DrizzleSpeechSourceResolver;
        let ownerId: string,
            input: Parameters<DrizzleDictionaryAudioStore['enqueue']>[0];
        const secret = 'migration-fingerprint-secret'.padEnd(32, 'x');
        const now = new Date('2026-10-13T12:00:00Z');
        const budget = {
            ownerDailyCost: 100000,
            globalDailyCost: 1000000,
            ownerQueued: 5,
            ownerActive: 2,
            globalActive: 4,
        };
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            storage = new PostgresAudioObjectStorage(db);
            audio = new DrizzleDictionaryAudioStore(db);
            ownerId = randomUUID();
            await db.insert(usersTable).values({
                id: ownerId,
                status: 'active',
                createdAt: now,
                updatedAt: now,
            });
            const store = new DrizzleDictionaryStore(db, {
                generate: randomUUID,
            });
            const context = { now, signal: new AbortController().signal };
            const dictionary = await store.createDictionary({
                ownerId,
                context,
                idempotencyKey: randomUUID(),
                fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
                request: {
                    name: 'Migration fixture',
                    description: null,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
            });
            const { card } = await store.createCard({
                ownerId,
                dictionaryId: dictionary.id,
                context,
                request: {
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settings.version,
                    translationContext: null,
                    values: {
                        source: 'hello',
                        translation: 'hola',
                        transcription: null,
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                    },
                    overrides: {
                        definitionEnabled: null,
                        definitionLanguage: null,
                        exampleEnabled: null,
                        exampleLanguage: null,
                        exampleTranslationEnabled: null,
                        transcriptionEnabled: null,
                        transcriptionNotation: null,
                        transcriptionCustomLabel: null,
                    },
                },
            });
            const fingerprint = createHmac('sha256', secret)
                .update(
                    JSON.stringify([ownerId, card.id, 'source', 'hello', 'en']),
                )
                .digest('hex');
            input = {
                ownerId,
                dictionaryId: dictionary.id,
                cardId: card.id,
                field: 'source',
                fingerprint,
                text: 'hello',
                profile: {
                    configurationId: 'fixture-v1',
                    provider: 'fixture',
                    model: 'tone-v1',
                    voice: 'fixture',
                    language: 'en',
                    settingsVersion: '1',
                    estimatedCostUnitsPerCharacter: 1,
                },
                storage: {
                    ...storage.identity,
                    key: `dictionary-audio/${ownerId}/${randomUUID()}`,
                },
                now,
                budget,
                cardVersion: card.version,
                settingsVersion: dictionary.settings.version,
            };
            resolver = new DrizzleSpeechSourceResolver(
                db,
                new HmacDictionaryCryptography({
                    secret: 'dictionary-hmac-secret'.padEnd(32, 'x'),
                    entropy: { randomBytes },
                }),
            );
        });
        afterAll(() => client.end());
        async function assertSource() {
            const resolved = await db.transaction((tx) =>
                resolver.resolveInTransaction(
                    ownerId,
                    {
                        kind: 'dictionary-field',
                        access: {
                            kind: 'owner',
                            dictionaryId: input.dictionaryId,
                        },
                        cardId: input.cardId,
                        field: 'source',
                    },
                    tx,
                ),
            );
            expect(resolved.text.trim()).toBe(input.text);
            expect(resolved.language).toBe(input.profile.language);
        }

        function migration(target: AudioObjectStorage = storage) {
            return new LegacySpeechMigration({
                database: db,
                resolver,
                storage: target,
                fingerprintSecret: secret,
                now: () => now,
            });
        }
        async function ready() {
            await assertSource();
            const { job } = await audio.enqueue(input);
            const claimed = await audio.claim(now, budget);
            expect(claimed).not.toBeNull();
            await audio.beginWrite(claimed!, now);
            const bytes = createFixtureAudio();
            const reference = await storage.putForReference(
                input.storage,
                bytes,
            );
            expect(
                await audio.complete(
                    claimed!,
                    {
                        storage: reference,
                        checksum: bytes.checksum,
                        mimeType: bytes.mimeType,
                        byteLength: bytes.bytes.byteLength,
                    },
                    now,
                ),
            ).toBe(true);
            return job;
        }
        function intercepted(
            afterPut: () => Promise<void>,
        ): AudioObjectStorage {
            return {
                identity: storage.identity,
                put: (...args) => storage.put(...args),
                putForReference: async (...args) => {
                    const reference = await storage.putForReference(...args);
                    await afterPut();
                    return reference;
                },
                read: (...args) => storage.read(...args),
                delete: (...args) => storage.delete(...args),
            };
        }
        it('promotes existing bytes once and preserves binding identity before retiring the legacy inventory', async () => {
            const job = await ready();
            const [legacyBinding] = await db
                .select()
                .from(dictionaryAudioBindingsTable)
                .where(eq(dictionaryAudioBindingsTable.jobId, job.id));
            expect(await migration().run()).toMatchObject({ promoted: 1 });
            expect(await migration().run()).toMatchObject({
                promoted: 0,
                reused: 0,
                resumed: 0,
            });
            const [recording] = await db.select().from(speechRecordingsTable);
            expect(recording?.state).toBe('ready');
            expect(recording?.text).toBe('hello');
            expect(recording?.storage.key).toBe(`speech/${job.assetId}`);
            const [binding] = await db.select().from(speechBindingsTable);
            expect(binding?.operationId).toBe(legacyBinding?.id);
            expect(binding?.recordingId).toBe(job.assetId);
            const [asset] = await db
                .select()
                .from(dictionaryAudioAssetsTable)
                .where(eq(dictionaryAudioAssetsTable.id, job.assetId));
            expect(asset?.state).toBe('deleting');
            expect(await storage.read(input.storage)).not.toBeNull();
        });
        it('reuses an already approved canonical recording even when a later legacy profile differs', async () => {
            const first = await ready();
            await migration().run();
            input = {
                ...input,
                storage: {
                    ...storage.identity,
                    key: `dictionary-audio/${ownerId}/${randomUUID()}`,
                },
                profile: {
                    ...input.profile,
                    settingsVersion: '2',
                    voice: 'other-fixture-voice',
                },
            };
            await ready();
            expect(await migration().run()).toMatchObject({
                reused: 1,
                promoted: 0,
            });
            const cached = await db
                .select()
                .from(speechRecordingsTable)
                .where(eq(speechRecordingsTable.state, 'ready'));
            expect(cached).toHaveLength(1);
            expect(cached[0]?.id).toBe(first.assetId);
            expect(cached[0]?.profile.voice).toBe('fixture');
        });
        it('recovers an uploaded object after publication interruption without another write', async () => {
            const job = await ready();
            let copies = 0;
            const failing = intercepted(async () => {
                copies++;
                throw new Error('Fixture crash after upload');
            });
            await expect(migration(failing).run()).rejects.toThrow(
                'Fixture crash',
            );
            const [pending] = await db
                .select()
                .from(speechRecordingsTable)
                .where(eq(speechRecordingsTable.id, job.assetId));
            expect(pending?.state).toBe('pending');
            expect(await storage.read(pending!.storage)).not.toBeNull();
            const resumed = await migration(
                intercepted(async () => {
                    copies++;
                }),
            ).run();
            expect(resumed.resumed).toBe(1);
            expect(copies).toBe(1);
        });
        it('does not publish after account access disappears during object copy', async () => {
            await ready();
            const target = intercepted(async () => {
                await db
                    .update(usersTable)
                    .set({ status: 'deletion_pending' })
                    .where(eq(usersTable.id, ownerId));
            });
            expect(await migration(target).run()).toMatchObject({
                skippedSource: 1,
                promoted: 0,
            });
            expect(
                await db
                    .select()
                    .from(speechRecordingsTable)
                    .where(eq(speechRecordingsTable.state, 'ready')),
            ).toHaveLength(0);
            expect(await db.select().from(speechBindingsTable)).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(dictionaryAudioAssetsTable)
                    .where(eq(dictionaryAudioAssetsTable.state, 'ready')),
            ).toHaveLength(1);
        });
        it('rejects distinct uncertain tasks for one canonical text before modifying either owner inventory', async () => {
            const first = await audio.enqueue(input);
            const secondOwner = randomUUID();
            await db.insert(usersTable).values({
                id: secondOwner,
                status: 'active',
                createdAt: now,
                updatedAt: now,
            });
            const store = new DrizzleDictionaryStore(db, {
                generate: randomUUID,
            });
            const context = { now, signal: new AbortController().signal };
            const dictionary = await store.createDictionary({
                ownerId: secondOwner,
                context,
                idempotencyKey: randomUUID(),
                fingerprint: `hmac-sha256:v1:${'B'.repeat(43)}`,
                request: {
                    name: 'Other owner',
                    description: null,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
            });
            const { card } = await store.createCard({
                ownerId: secondOwner,
                dictionaryId: dictionary.id,
                context,
                request: {
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settings.version,
                    translationContext: null,
                    values: {
                        source: 'hello',
                        translation: 'hola',
                        transcription: null,
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                    },
                    overrides: {
                        definitionEnabled: null,
                        definitionLanguage: null,
                        exampleEnabled: null,
                        exampleLanguage: null,
                        exampleTranslationEnabled: null,
                        transcriptionEnabled: null,
                        transcriptionNotation: null,
                        transcriptionCustomLabel: null,
                    },
                },
            });
            const second = await audio.enqueue({
                ...input,
                ownerId: secondOwner,
                dictionaryId: dictionary.id,
                cardId: card.id,
                fingerprint: createHmac('sha256', secret)
                    .update(
                        JSON.stringify([
                            secondOwner,
                            card.id,
                            'source',
                            'hello',
                            'en',
                        ]),
                    )
                    .digest('hex'),
            });
            for (const [jobId, taskId] of [
                [first.job.id, 'provider-task-one'],
                [second.job.id, 'provider-task-two'],
            ])
                await db
                    .update(dictionaryAudioJobsTable)
                    .set({ state: 'submission_unknown', taskId })
                    .where(eq(dictionaryAudioJobsTable.id, jobId!));
            await expect(migration().run()).rejects.toBeInstanceOf(
                LegacySpeechMigrationBlockedError,
            );
            expect(await db.select().from(speechRecordingsTable)).toHaveLength(
                0,
            );
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
            expect(await db.select().from(speechBindingsTable)).toHaveLength(0);
        });
        it('blocks cutover when an uncertain task collides with a ready canonical recording', async () => {
            await ready();
            await migration().run();
            const before = await db.select().from(speechRecordingsTable);
            const beforeBindings = await db.select().from(speechBindingsTable);
            input = {
                ...input,
                storage: {
                    ...storage.identity,
                    key: `dictionary-audio/${ownerId}/${randomUUID()}`,
                },
                profile: {
                    ...input.profile,
                    settingsVersion: '2',
                    voice: 'other-voice',
                },
            };
            const result = await audio.enqueue(input);
            await db
                .update(dictionaryAudioJobsTable)
                .set({
                    state: 'submission_unknown',
                    taskId: 'uncertain-original-task',
                })
                .where(eq(dictionaryAudioJobsTable.id, result.job.id));
            const put = vi.fn(storage.putForReference.bind(storage));
            await expect(
                migration({
                    ...intercepted(async () => {}),
                    putForReference: put,
                }).run(),
            ).rejects.toBeInstanceOf(LegacySpeechMigrationBlockedError);
            expect(put).not.toHaveBeenCalled();
            expect(await db.select().from(speechRecordingsTable)).toEqual(
                before,
            );
            expect(await db.select().from(speechBindingsTable)).toEqual(
                beforeBindings,
            );
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
            const [uncertain] = await db
                .select()
                .from(dictionaryAudioJobsTable)
                .where(eq(dictionaryAudioJobsTable.id, result.job.id));
            expect(uncertain?.state).toBe('submission_unknown');
            expect(uncertain?.taskId).toBe('uncertain-original-task');
        });
        it('rejects a shared blocker with the same legacy UUID but a different provider task identity', async () => {
            const { job } = await audio.enqueue(input);
            await db
                .update(dictionaryAudioJobsTable)
                .set({
                    state: 'submission_unknown',
                    taskId: 'legacy-provider-task',
                })
                .where(eq(dictionaryAudioJobsTable.id, job.id));
            await migration().run();
            await db.delete(speechBindingsTable);
            await db.transaction(async (tx) => {
                await tx.execute(
                    sql`select set_config('languon.speech_worker_version','1',true)`,
                );
                await tx
                    .update(speechJobsTable)
                    .set({ taskId: 'different-shared-provider-task' })
                    .where(eq(speechJobsTable.id, job.id));
            });
            const beforeJobs = await db.select().from(speechJobsTable);
            const beforeRecordings = await db
                .select()
                .from(speechRecordingsTable);
            const beforeLegacy = await db
                .select()
                .from(dictionaryAudioJobsTable);
            await expect(migration().run()).rejects.toBeInstanceOf(
                LegacySpeechMigrationBlockedError,
            );
            expect(await db.select().from(speechBindingsTable)).toHaveLength(0);
            expect(await db.select().from(speechJobsTable)).toEqual(beforeJobs);
            expect(await db.select().from(speechRecordingsTable)).toEqual(
                beforeRecordings,
            );
            expect(await db.select().from(dictionaryAudioJobsTable)).toEqual(
                beforeLegacy,
            );
        });
        it('turns an uncertain submission into an idempotent canonical blocker preserving the original task profile', async () => {
            await assertSource();
            const { job } = await audio.enqueue(input);
            await audio.claim(now, budget);
            const later = new Date(now.getTime() + 61000);
            await audio.claim(later, budget);
            const [legacy] = await db
                .select()
                .from(dictionaryAudioJobsTable)
                .where(eq(dictionaryAudioJobsTable.id, job.id));
            expect(legacy?.state).toBe('submission_unknown');
            expect(legacy?.fingerprint).toBe(input.fingerprint);
            expect(legacy?.text).toBe('');
            expect(legacy?.profile.language).toBe(input.profile.language);
            expect(await migration().run()).toMatchObject({
                blockedUnknown: 1,
            });
            expect(await migration().run()).toMatchObject({
                blockedUnknown: 1,
            });
            const promoted = await db
                .select()
                .from(speechJobsTable)
                .where(eq(speechJobsTable.id, job.id));
            expect(promoted).toHaveLength(1);
            expect(promoted[0]).toMatchObject({
                state: 'submission_unknown',
                billingState: 'free',
                estimatedCostUnits: legacy?.reservedCost,
                taskId: legacy?.taskId,
                credits: 0n,
            });
            const [recording] = await db
                .select()
                .from(speechRecordingsTable)
                .where(eq(speechRecordingsTable.id, job.assetId));
            expect(recording?.profile).toEqual(legacy?.profile);
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, ownerId));
            await expect(migration().run()).rejects.toBeInstanceOf(
                LegacySpeechMigrationBlockedError,
            );
            expect(
                await db
                    .select()
                    .from(speechJobsTable)
                    .where(
                        and(
                            eq(
                                speechJobsTable.canonicalKey,
                                promoted[0]!.canonicalKey,
                            ),
                            eq(speechJobsTable.state, 'submission_unknown'),
                        ),
                    ),
            ).toHaveLength(1);
        });
    },
);
