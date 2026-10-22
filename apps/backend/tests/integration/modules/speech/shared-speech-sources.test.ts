import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import {
    SentenceExerciseSchema,
    SentenceFeedbackSchema,
    type SpeechSource,
} from '@languon/contracts';
import { eq } from 'drizzle-orm';
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
import { HmacDictionaryCryptography } from '../../../../src/modules/dictionaries/infrastructure/crypto/dictionary-cryptography';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceAttemptsTable,
    sentenceExerciseEntriesTable,
    sentenceExercisesTable,
    sentenceManualReviewsTable,
} from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import {
    sentenceGlobalVisibilityTable,
    sentencePersonalVisibilityTable,
} from '../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-library-schema';
import { SpeechService } from '../../../../src/modules/speech/application/speech-service';
import type {
    SpeechStore,
    AudioObjectStorage,
} from '../../../../src/modules/speech/application/ports';
import { createSpeechRoutes } from '../../../../src/modules/speech/interface/http/speech.routes';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import { DrizzleSpeechSourceResolver } from '../../../../src/modules/speech/infrastructure/source-resolver';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const now = new Date('2026-10-13T12:00:00.000Z');

class DeterministicEntropy {
    randomBytes(length: number) {
        return new Uint8Array(length).fill(7);
    }
}

run('DrizzleSpeechSourceResolver saved-content authority', () => {
    let client: PostgresClient;
    let db: PostgresJsDatabase<typeof databaseSchema>;
    let resolver: DrizzleSpeechSourceResolver;
    let owner: string;
    let reader: string;
    let stranger: string;
    let dictionaryId: string;
    let cardId: string;
    let exerciseId: string;
    let shareId: string;
    let shareKey: string;
    let sessionId: string;
    const cryptography = new HmacDictionaryCryptography({
        entropy: new DeterministicEntropy(),
        secret: 'shared-speech-source-test-secret-that-is-longer-than-thirty-two-bytes',
    });

    const ownerAccess = () => ({ kind: 'owner' as const, dictionaryId });
    const sharedAccess = () => ({
        kind: 'shared' as const,
        shareId,
        shareKey,
    });
    const dictionarySource = (
        field: 'source' | 'translation' | 'example' | 'exampleTranslation',
        expectedVersion?: number,
    ): Extract<SpeechSource, { kind: 'dictionary-field' }> => ({
        kind: 'dictionary-field',
        access: ownerAccess(),
        cardId,
        field,
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
    });

    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        resolver = new DrizzleSpeechSourceResolver(db, cryptography);
    }, 60_000);

    afterAll(async () => {
        await client?.end();
    });

    beforeEach(async () => {
        await db.delete(usersTable);
        owner = randomUUID();
        reader = randomUUID();
        stranger = randomUUID();
        dictionaryId = randomUUID();
        cardId = randomUUID();
        exerciseId = randomUUID();
        sessionId = randomUUID();
        shareId = 'sharedspeechsourcefixture';
        shareKey = 'share-key-for-speech-source';
        await db.insert(usersTable).values([
            { id: owner, status: 'active', createdAt: now, updatedAt: now },
            { id: reader, status: 'active', createdAt: now, updatedAt: now },
            { id: stranger, status: 'active', createdAt: now, updatedAt: now },
        ]);
        await db.insert(dictionariesTable).values({
            id: dictionaryId,
            ownerId: owner,
            name: 'Speech source fixture',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            createdAt: now,
            updatedAt: now,
            visibility: 'unlisted',
            shareLocator: shareId,
            shareKeyDigest: cryptography.shareDigest(shareKey, 1),
            shareKeyVersion: 1,
            shareKeyRotatedAt: now,
        });
        await db.insert(dictionarySettingsTable).values({
            dictionaryId,
            exampleLanguageRole: 'target',
            exampleTranslationEnabled: true,
            createdAt: now,
            updatedAt: now,
        });
        await db.insert(dictionaryCardsTable).values({
            id: cardId,
            dictionaryId,
            source: 'hello',
            normalizedSource: 'hello',
            translation: 'bonjour',
            example: 'good morning',
            exampleTranslation: 'bonjour',
            authorship: 'human',
            sortKey: 1024n,
            createdAt: now,
            updatedAt: now,
        });
        await db.insert(sentenceExercisesTable).values({
            id: exerciseId,
            creatorId: owner,
            dictionaryId,
            direction: 'source-to-target',
            shared: true,
            publicContent: SentenceExerciseSchema.parse({
                id: exerciseId,
                dictionaryId,
                direction: 'source-to-target',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
                sourceText: 'A good morning.',
                segments: [
                    {
                        id: 'segment-1',
                        start: 0,
                        end: 15,
                        text: 'A good morning.',
                        target: {
                            entryId: cardId,
                            occurrenceId: 'occurrence-1',
                            hintId: 'hint-1',
                        },
                    },
                ],
                hints: [{ id: 'hint-1', text: 'bonjour' }],
                generationPolicyVersion: 1,
                createdAt: now.toISOString(),
            }),
            referenceTranslation: 'Un bonjour.',
            generationPolicyVersion: 1,
            createdAt: now,
        });
        await db.insert(sentenceExerciseEntriesTable).values({
            exerciseId,
            dictionaryId,
            entryId: cardId,
            learningVersion: 1,
            sourceText: 'hello',
            targetText: 'bonjour',
        });
    });

    it('rejects owner and shared stale example settings before admission through the real resolver', async () => {
        const admission = vi.fn();
        const service = new SpeechService({
            burstLimiter: { consume: async () => ({ allowed: true }) },
            resolver,
            store: { prepare: admission } as unknown as SpeechStore,
            storage: {} as AudioObjectStorage,
        });
        await expect(
            resolver.resolve(owner, {
                ...dictionarySource('example'),
                expectedDictionaryVersion: 1,
            }),
        ).resolves.toMatchObject({ text: 'good morning', language: 'fr' });
        await db
            .update(dictionarySettingsTable)
            .set({
                exampleLanguageRole: 'source',
                exampleEnabled: false,
                version: 2,
            })
            .where(eq(dictionarySettingsTable.dictionaryId, dictionaryId));
        await db
            .update(dictionariesTable)
            .set({ version: 2 })
            .where(eq(dictionariesTable.id, dictionaryId));
        for (const actorId of [owner, reader]) {
            const app = createSpeechRoutes({
                service,
                authenticate: async () => actorId,
                policy: new AuthHttpPolicy({
                    appEnvironment: 'test',
                    allowedOrigins: ['http://localhost:3333'],
                    refreshTokenTtlSeconds: 60,
                }),
            });
            for (const expectedDictionaryVersion of [1, 2]) {
                const response = await app.request('/speech/prepare', {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer header.payload.signature',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        operationId: randomUUID(),
                        source: {
                            ...dictionarySource('example'),
                            access:
                                actorId === owner
                                    ? { kind: 'owner', dictionaryId }
                                    : sharedAccess(),
                            expectedDictionaryVersion,
                            expectedSettingsVersion: 1,
                        },
                    }),
                });
                expect(response.status).toBe(409);
                expect(await response.json()).toMatchObject({
                    error: { code: 'speech_source_changed' },
                });
            }
        }
        expect(admission).not.toHaveBeenCalled();
    });

    it('returns typed disappearance and hidden-reference errors from actual resolver HTTP requests', async () => {
        const admission = vi.fn();
        const app = createSpeechRoutes({
            service: new SpeechService({
                burstLimiter: { consume: async () => ({ allowed: true }) },
                resolver,
                store: { prepare: admission } as unknown as SpeechStore,
                storage: {} as AudioObjectStorage,
            }),
            authenticate: async () => owner,
            policy: new AuthHttpPolicy({
                appEnvironment: 'test',
                allowedOrigins: ['http://localhost:3333'],
                refreshTokenTtlSeconds: 60,
            }),
        });
        const post = (source: SpeechSource) =>
            app.request('/speech/prepare', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer header.payload.signature',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ operationId: randomUUID(), source }),
            });
        const hidden = await post({
            kind: 'sentence-practice',
            access: { kind: 'owner', dictionaryId },
            exerciseId,
            sessionId,
            field: 'reference',
        });
        expect(hidden.status).toBe(403);
        expect(await hidden.json()).toMatchObject({
            error: { code: 'speech_reference_hidden' },
        });
        await db
            .update(dictionaryCardsTable)
            .set({ lifecycle: 'archived', archivedAt: now })
            .where(eq(dictionaryCardsTable.id, cardId));
        const unavailable = await post(dictionarySource('source'));
        expect(unavailable.status).toBe(404);
        expect(await unavailable.json()).toMatchObject({
            error: { code: 'speech_source_unavailable' },
        });
        expect(admission).not.toHaveBeenCalled();
    });

    it('resolves owner and signed-reader fields with effective example language roles', async () => {
        await expect(
            resolver.resolve(owner, dictionarySource('source')),
        ).resolves.toMatchObject({
            text: 'hello',
            language: 'en',
            dictionaryId,
            cardId,
        });
        await expect(
            resolver.resolve(reader, {
                kind: 'dictionary-field',
                access: sharedAccess(),
                cardId,
                field: 'translation',
            }),
        ).resolves.toMatchObject({ text: 'bonjour', language: 'fr' });
        await expect(
            resolver.resolve(reader, {
                kind: 'flashcard-field',
                access: sharedAccess(),
                cardId,
                field: 'sourceExample',
            }),
        ).resolves.toMatchObject({ text: 'bonjour', language: 'en' });
        await expect(
            resolver.resolve(reader, {
                kind: 'flashcard-field',
                access: sharedAccess(),
                cardId,
                field: 'targetExample',
            }),
        ).resolves.toMatchObject({ text: 'good morning', language: 'fr' });
        await expect(
            resolver.resolve(owner, dictionarySource('exampleTranslation')),
        ).resolves.toMatchObject({
            text: 'bonjour',
            language: 'en',
        });
    });

    it('denies revoked shares, disabled readers, archived dictionaries and archived cards', async () => {
        const shared = {
            kind: 'dictionary-field' as const,
            access: sharedAccess(),
            cardId,
            field: 'source' as const,
        };
        await expect(
            resolver.resolve(reader, {
                ...shared,
                access: { ...sharedAccess(), shareKey: 'wrong-key' },
            }),
        ).rejects.toThrow(/dictionary was not found/i);
        await db
            .update(dictionariesTable)
            .set({
                shareKeyDigest: cryptography.shareDigest(
                    'rotated-share-key',
                    1,
                ),
            })
            .where(eq(dictionariesTable.id, dictionaryId));
        await expect(resolver.resolve(reader, shared)).rejects.toThrow(
            /dictionary was not found/i,
        );
        await db
            .update(dictionariesTable)
            .set({ shareKeyDigest: cryptography.shareDigest(shareKey, 1) })
            .where(eq(dictionariesTable.id, dictionaryId));
        await db
            .update(usersTable)
            .set({ status: 'disabled' })
            .where(eq(usersTable.id, reader));
        await expect(resolver.resolve(reader, shared)).rejects.toThrow(
            /dictionary was not found/i,
        );
        await db
            .update(usersTable)
            .set({ status: 'active' })
            .where(eq(usersTable.id, reader));
        await db
            .update(usersTable)
            .set({ status: 'disabled' })
            .where(eq(usersTable.id, owner));
        await expect(
            resolver.resolve(owner, dictionarySource('source')),
        ).rejects.toThrow(/dictionary was not found/i);
        await db
            .update(usersTable)
            .set({ status: 'active' })
            .where(eq(usersTable.id, owner));
        await db
            .update(dictionariesTable)
            .set({
                lifecycle: 'archived',
                visibility: 'private',
                archivedAt: new Date(now.getTime() + 1),
                shareLocator: null,
                shareKeyDigest: null,
                shareKeyVersion: null,
                shareKeyRotatedAt: null,
            })
            .where(eq(dictionariesTable.id, dictionaryId));
        await expect(
            resolver.resolve(owner, dictionarySource('source')),
        ).rejects.toThrow(/dictionary was not found/i);
        await db
            .update(dictionariesTable)
            .set({
                lifecycle: 'active',
                visibility: 'unlisted',
                archivedAt: null,
                shareLocator: shareId,
                shareKeyDigest: cryptography.shareDigest(shareKey, 1),
                shareKeyVersion: 1,
                shareKeyRotatedAt: now,
            })
            .where(eq(dictionariesTable.id, dictionaryId));
        await db
            .update(dictionaryCardsTable)
            .set({
                lifecycle: 'archived',
                archivedAt: new Date(now.getTime() + 2),
            })
            .where(eq(dictionaryCardsTable.id, cardId));
        await expect(
            resolver.resolve(owner, dictionarySource('source')),
        ).rejects.toThrow('speech_source_unavailable');
    });

    it('fences a stale dictionary card revision and reflects dictionary version changes', async () => {
        const before = await resolver.resolve(
            owner,
            dictionarySource('source', 1),
        );
        await db
            .update(dictionaryCardsTable)
            .set({ version: 2, source: 'welcome', normalizedSource: 'welcome' })
            .where(eq(dictionaryCardsTable.id, cardId));
        await expect(
            resolver.resolve(owner, dictionarySource('source', 1)),
        ).rejects.toThrow('speech_source_unavailable');
        const afterCard = await resolver.resolve(
            owner,
            dictionarySource('source', 2),
        );
        expect(afterCard.revision).not.toBe(before.revision);
        await db
            .update(dictionariesTable)
            .set({ version: 2 })
            .where(eq(dictionariesTable.id, dictionaryId));
        const afterDictionary = await resolver.resolve(
            owner,
            dictionarySource('source', 2),
        );
        expect(afterDictionary.revision).not.toBe(afterCard.revision);
    });

    it('gates sentence references on a revealed completed result or manual review and applies practice visibility', async () => {
        const prompt: SpeechSource = {
            kind: 'sentence-practice',
            access: sharedAccess(),
            exerciseId,
            sessionId,
            field: 'prompt',
        };
        const reference = { ...prompt, field: 'reference' as const };
        await expect(resolver.resolve(reader, prompt)).resolves.toMatchObject({
            text: 'A good morning.',
            language: 'en',
        });
        await expect(resolver.resolve(reader, reference)).rejects.toThrow(
            'speech_reference_hidden',
        );
        await db.insert(sentenceManualReviewsTable).values({
            id: randomUUID(),
            learnerId: reader,
            dictionaryId,
            exerciseId,
            sessionId,
            operationId: randomUUID(),
            requestFingerprint: 'manual-review-fixture',
            createdAt: now,
        });
        await expect(
            resolver.resolve(reader, reference),
        ).resolves.toMatchObject({ text: 'Un bonjour.', language: 'fr' });
        await db.insert(sentencePersonalVisibilityTable).values({
            learnerId: reader,
            exerciseId,
            actorId: reader,
            archivedAt: now,
            updatedAt: now,
        });
        await expect(resolver.resolve(reader, prompt)).rejects.toThrow();
        await expect(
            resolver.resolve(reader, {
                kind: 'sentence-library',
                access: sharedAccess(),
                exerciseId,
                field: 'prompt',
            }),
        ).resolves.toMatchObject({ text: 'A good morning.' });
        await db.insert(sentenceGlobalVisibilityTable).values({
            exerciseId,
            actorId: owner,
            archivedAt: now,
            updatedAt: now,
        });
        await expect(
            resolver.resolve(reader, {
                kind: 'sentence-practice',
                access: sharedAccess(),
                exerciseId,
                sessionId,
                field: 'prompt',
            }),
        ).rejects.toThrow();
    });

    it('allows a checked completed answer only to the learner and preserves historical access', async () => {
        const attemptId = randomUUID();
        await db.insert(sentenceAttemptsTable).values({
            id: attemptId,
            learnerId: reader,
            dictionaryId,
            exerciseId,
            operationId: randomUUID(),
            sessionId,
            answer: 'My checked answer.',
            referenceRevealed: false,
            explanationLanguage: 'en',
            revealedHintIds: [],
            feedback: SentenceFeedbackSchema.parse({
                percentage: 75,
                rating: 'good',
                meaning: 'partial',
                grammar: 'minor-errors',
                targets: [
                    { entryId: cardId, status: 'used', explanation: 'Used.' },
                ],
                issues: [],
                improvedTranslation: 'Ma réponse.',
                explanation: 'Checked.',
            }),
            createdAt: now,
        });
        const answer: SpeechSource = {
            kind: 'checked-answer',
            access: sharedAccess(),
            attemptId,
        };
        await expect(resolver.resolve(reader, answer)).resolves.toMatchObject({
            text: 'My checked answer.',
            language: 'fr',
            attemptId,
        });
        await expect(
            resolver.resolve(owner, { ...answer, access: ownerAccess() }),
        ).rejects.toThrow('speech_source_unavailable');
        await expect(resolver.resolve(stranger, answer)).rejects.toThrow(
            'speech_source_unavailable',
        );
        await db
            .update(dictionariesTable)
            .set({ version: 2 })
            .where(eq(dictionariesTable.id, dictionaryId));
        await expect(resolver.resolve(reader, answer)).resolves.toMatchObject({
            text: 'My checked answer.',
        });
    });
});
