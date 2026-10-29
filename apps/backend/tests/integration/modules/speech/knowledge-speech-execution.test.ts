import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { SpeechSource } from '@languon/contracts';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { DrizzleProviderPriceStore } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { aiAccountingSettingsRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { DrizzleKnowledgeMediaStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/media-store';
import { verifyKnowledgeAudio } from '../../../../src/modules/knowledge/infrastructure/media-audio-validation';
import { loadDictionaryAudioEnvironment } from '../../../../src/modules/speech/infrastructure/audio/dictionary-audio-environment';
import { FixtureSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { createSpeechInfrastructure } from '../../../../src/modules/speech/infrastructure/composition';
import {
    speechRecordingsTable,
    speechJobsTable,
} from '../../../../src/modules/speech/infrastructure/schema';
import { SpeechSubmissionError } from '../../../../src/modules/speech/application/ports/speech-synthesis-provider';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Private knowledge narration production composition',
    () => {
        let client: PostgresClient,
            db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>,
            notes: DrizzleKnowledgeStore,
            media: DrizzleKnowledgeMediaStore,
            speech: ReturnType<typeof createSpeechInfrastructure>,
            owner: string,
            other: string;
        const crypto = new KnowledgeShareCrypto(
            'knowledge-speech-private-test-secret',
        );
        const provider = new FixtureSpeechProvider();
        let failure = false;
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        afterAll(async () => client?.end());
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            owner = randomUUID();
            other = randomUUID();
            failure = false;
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: other, status: 'active' },
            ]);
            await db.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: owner,
                role: 'owner',
                grantedByUserId: owner,
                grantReason: 'Disposable narration test administrator',
            });
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: new Date(),
                reason: 'Synthetic narration limits',
            });
            await new DrizzleProviderPriceStore(db).publish(
                {
                    expectedVersion: 0,
                    providerId: 'fixture',
                    modelId: 'tone-v1',
                    meter: 'speech-characters',
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: '0.01',
                    effectiveAt: '2020-01-01T00:00:00.000Z',
                    sourceReference: 'Synthetic fixture',
                    sourceUrl: null,
                    reason: 'Synthetic disposable tariff',
                },
                owner,
                new Date(),
            );
            notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            media = new DrizzleKnowledgeMediaStore(db, crypto);
            const environment = loadDictionaryAudioEnvironment(
                {
                    SPEECH_PLAYBACK_ENABLED: 'true',
                    SPEECH_GENERATION_ENABLED: 'true',
                    DICTIONARY_AUDIO_PROVIDER: 'fixture',
                    DICTIONARY_AUDIO_FINGERPRINT_SECRET:
                        'synthetic-private-knowledge-speech-fingerprint',
                },
                { deployed: false, role: 'worker' },
            );
            speech = createSpeechInfrastructure({
                database: db,
                dictionaryHmacSecret:
                    'synthetic-knowledge-speech-dictionary-secret',
                environment,
                storage: new PostgresAudioObjectStorage(db),
                provider,
                providers: new Map([
                    [
                        provider.configurationId,
                        {
                            configurationId: provider.configurationId,
                            supports: provider.supports.bind(provider),
                            submit: async (input) => {
                                if (failure)
                                    throw new SpeechSubmissionError(
                                        'not_submitted',
                                        false,
                                    );
                                return provider.submit(input);
                            },
                            poll: provider.poll.bind(provider),
                        },
                    ],
                ]),
                generationEnabled: true,
                playbackEnabled: true,
                burstLimiter: { consume: async () => ({ allowed: true }) },
            });
        }, 120000);
        async function source(actor = owner) {
            const blockId = randomUUID();
            const note = await notes.create(actor, {
                operationId: randomUUID(),
                content: {
                    title: 'Private narration',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'fr',
                    explanationLanguage: 'en',
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'learningBlock',
                                    attrs: {
                                        block: {
                                            id: blockId,
                                            type: 'bilingual-text',
                                            language: 'fr',
                                            segments: [
                                                {
                                                    id: randomUUID(),
                                                    text: 'Bonjour de mon carnet.',
                                                },
                                            ],
                                            translations: [],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            });
            const workspace = await notes.getWorkspace(actor, note.id);
            const branch = workspace.branches[0]!;
            return {
                note,
                source: {
                    kind: 'knowledge-block',
                    noteId: note.id,
                    branchId: branch.id,
                    blockId,
                    expectedBranchVersion: branch.version,
                } satisfies SpeechSource,
            };
        }
        it('authorizes immutable branches, isolates private cache and explicitly copies preview audio to owned media', async () => {
            const first = await source(),
                second = await source(other);
            await expect(
                speech.service.prepare(other, {
                    source: first.source,
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ code: 'speech_source_unavailable' });
            const prepared = await speech.service.prepare(owner, {
                source: first.source,
                operationId: randomUUID(),
            });
            await speech.service.prepare(other, {
                source: second.source,
                operationId: randomUUID(),
            });
            expect(await db.select().from(speechJobsTable)).toHaveLength(2);
            await expect(
                notes.delete(owner, first.note.id, {
                    operationId: randomUUID(),
                    expectedVersion: first.note.version,
                }),
            ).rejects.toMatchObject({ code: 'deletion_busy' });
            await speech.worker.runOnce();
            await speech.worker.runOnce();
            const ready = await speech.service.status(
                owner,
                prepared.requestId!,
            );
            expect(ready.state).toBe('ready');
            const preview = await speech.service.content(
                owner,
                ready.playbackId!,
            );
            const destination = await source(owner);
            const asset = await media.upload(
                owner,
                destination.note.id,
                verifyKnowledgeAudio(
                    preview.audio.bytes,
                    preview.audio.mimeType,
                ),
            );
            await notes.delete(owner, first.note.id, {
                operationId: randomUUID(),
                expectedVersion: first.note.version,
            });
            expect(
                (
                    await media.read(destination.note.id, asset.id, {
                        ownerId: owner,
                    })
                ).bytes.length,
            ).toBeGreaterThan(0);
            const rows = await db.select().from(speechRecordingsTable);
            expect(rows.filter((r) => r.text === '')).toHaveLength(1);
            expect(
                rows.filter(
                    (r) =>
                        r.text === 'bonjour de mon carnet.' ||
                        r.text === 'Bonjour de mon carnet.',
                ),
            ).toHaveLength(1);
            await expect(
                speech.service.content(owner, ready.playbackId!),
            ).rejects.toBeDefined();
        }, 60000);
        it('persists technical failure without a customer charge and permits source cleanup', async () => {
            const input = await source();
            failure = true;
            const prepared = await speech.service.prepare(owner, {
                source: input.source,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            expect(
                await speech.service.status(owner, prepared.requestId!),
            ).toMatchObject({ state: 'failed', billingState: 'free' });
            await notes.delete(owner, input.note.id, {
                operationId: randomUUID(),
                expectedVersion: input.note.version,
            });
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('');
        }, 60000);
        it('restricts private narration account erasure to its due fenced purge lease', async () => {
            const input = await source();
            const prepared = await speech.service.prepare(owner, {
                source: input.source,
                operationId: randomUUID(),
            });
            await speech.worker.runOnce();
            expect(
                (await speech.service.status(owner, prepared.requestId!)).state,
            ).toBe('ready');
            const at = new Date();
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            await db.insert(accountDeletionRequestsTable).values({
                userId: owner,
                state: 'running',
                scheduledAt: new Date(at.getTime() - 120000),
                purgeAt: new Date(at.getTime() - 60000),
                nextAttemptAt: new Date(at.getTime() - 60000),
                leaseDeadline: new Date(at.getTime() + 120000),
                leaseWorkerId: 'synthetic-knowledge-purge',
                fencingToken: 1,
                updatedAt: at,
            });
            const role = `knowledge_purge_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`create role ${role}`);
            try {
                await client.unsafe(`grant usage on schema public to ${role}`);
                await client.unsafe(
                    `grant execute on function languon_purge_private_knowledge_speech(uuid,text,integer) to ${role}`,
                );
                await expect(
                    db.transaction(async (tx) => {
                        await tx.execute(sql.raw(`set local role ${role}`));
                        await tx.execute(
                            sql`select text from speech_recordings`,
                        );
                    }),
                ).rejects.toBeDefined();
                await expect(
                    db.transaction(async (tx) => {
                        await tx.execute(sql.raw(`set local role ${role}`));
                        await tx.execute(
                            sql`select languon_purge_private_knowledge_speech(${owner}::uuid,'wrong-worker',1)`,
                        );
                    }),
                ).rejects.toBeDefined();
                await db.transaction(async (tx) => {
                    await tx.execute(
                        sql`select languon_finalize_speech_accounting_for_purge(${owner}::uuid,'synthetic-knowledge-purge',1)`,
                    );
                });
                expect(
                    (await db.select().from(speechRecordingsTable))[0]?.text,
                ).not.toBe('');
                await db.transaction(async (tx) => {
                    await tx.execute(sql.raw(`set local role ${role}`));
                    await tx.execute(
                        sql`select languon_purge_private_knowledge_speech(${owner}::uuid,'synthetic-knowledge-purge',1)`,
                    );
                });
                expect(
                    (await db.select().from(speechRecordingsTable))[0]?.text,
                ).toBe('');
            } finally {
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        }, 60000);
    },
);
