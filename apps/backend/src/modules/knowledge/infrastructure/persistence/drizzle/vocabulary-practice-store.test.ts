import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import {
    KnowledgeNoteContentSchema,
    type LearningBlock,
} from '@languon/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleVocabularyPracticeStore } from './vocabulary-practice-store';
import { knowledgeNotesTable } from './schema';
import type { KnowledgeDatabase } from './knowledge-transaction';
const configuration = {
    front: ['source' as const],
    back: ['translation' as const],
};
type Vocabulary = Extract<LearningBlock, { type: 'vocabulary' }>;
const content = (block: Vocabulary) =>
    KnowledgeNoteContentSchema.parse({
        title: 'Vocabulary practice',
        summary: '',
        categories: [],
        studiedLanguage: 'en',
        explanationLanguage: 'es',
        body: {
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [{ type: 'learningBlock', attrs: { block } }],
            },
        },
    });
describe.runIf(isDatabaseIntegrationEnabled())(
    'private note vocabulary PostgreSQL practice',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let notes: DrizzleKnowledgeStore;
        let store: DrizzleVocabularyPracticeStore;
        let owner: string;
        let reader: string;
        let noteId: string;
        let block: Vocabulary;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const crypto = new KnowledgeShareCrypto(
                'synthetic-vocabulary-secret',
            );
            notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            store = new DrizzleVocabularyPracticeStore(db, crypto);
        }, 120_000);
        beforeEach(async () => {
            await db.delete(knowledgeNotesTable);
            owner = randomUUID();
            reader = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
            block = {
                id: randomUUID(),
                type: 'vocabulary',
                language: 'en',
                translationLanguage: 'es',
                entries: [
                    {
                        id: randomUUID(),
                        term: 'walk',
                        translation: 'caminar',
                        example: 'I walk.',
                        exampleTranslation: 'Camino.',
                    },
                    { id: randomUUID(), term: 'read', translation: 'leer' },
                ],
            };
            noteId = (
                await notes.create(owner, {
                    operationId: randomUUID(),
                    content: content(block),
                })
            ).id;
        });
        afterAll(async () => client?.end(), 120_000);
        const source = () => ({ actorId: owner, noteId, blockId: block.id });
        const attempt = () => ({
            operationId: randomUUID(),
            sessionId: randomUUID(),
            entryId: block.entries[0]!.id,
            expectedLearningVersion: 1,
            round: 1,
            rating: 'known' as const,
            configuration,
        });
        it('uses existing projections with no library publication and isolates each learner behind live shared access', async () => {
            const access = {
                kind: 'note' as const,
                ...(await notes.issueShare(owner, noteId)),
            };
            const shared = { ...source(), actorId: reader, access };
            await expect(
                store.progress({ ...shared, access: undefined }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            const prepared = await store.prepare(shared, {
                configuration,
                scope: { type: 'all' },
            });
            expect(prepared.entryIds).toHaveLength(2);
            const items = await store.items(shared, {
                entryIds: prepared.entryIds,
                configuration,
            });
            expect(items.items[0]!.back[0]!.text).toBe('caminar');
            await store.rate(shared, attempt());
            expect((await store.progress(shared)).known).toBe(1);
            expect((await store.progress(source())).known).toBe(0);
            await notes.revokeShare(owner, noteId);
            await expect(store.progress(shared)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
        });
        it('serializes identical concurrent attempts and rejects operation substitution', async () => {
            const input = attempt();
            const results = await Promise.all([
                store.rate(source(), input),
                store.rate(source(), input),
            ]);
            expect(results[0]).toEqual(results[1]);
            expect((await store.progress(source())).known).toBe(1);
            await expect(
                store.rate(source(), { ...input, rating: 'again' }),
            ).rejects.toMatchObject({ reason: 'operation_conflict' });
        });
        it('allows only latest-session latest-entry Undo and keeps retries idempotent', async () => {
            const first = attempt();
            const saved = await store.rate(source(), first);
            const undo = { operationId: randomUUID() };
            expect(
                (await store.undo(source(), saved.attemptId, undo)).rating,
            ).toBeNull();
            expect(await store.undo(source(), saved.attemptId, undo)).toEqual({
                ...saved,
                rating: null,
            });
            const next = await store.rate(source(), {
                ...first,
                operationId: randomUUID(),
                round: 2,
            });
            await store.rate(source(), {
                ...first,
                operationId: randomUUID(),
                entryId: block.entries[1]!.id,
                round: 3,
            });
            await expect(
                store.undo(source(), next.attemptId, {
                    operationId: randomUUID(),
                }),
            ).rejects.toMatchObject({ reason: 'undo_conflict' });
        });
        it('does not resurrect mastery when published vocabulary changes A to B to A', async () => {
            const first = attempt();
            await store.rate(source(), first);
            const original = structuredClone(block);
            block.entries[0]!.translation = 'andar';
            await notes.update(owner, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content(block),
            });
            await notes.update(owner, noteId, {
                operationId: randomUUID(),
                expectedVersion: 2,
                content: content(original),
            });
            expect((await store.progress(source())).known).toBe(0);
            const items = await store.items(source(), {
                entryIds: [first.entryId],
                configuration,
            });
            expect(items.items[0]!.learningVersion).toBe(3);
            await expect(
                store.rate(source(), { ...first, operationId: randomUUID() }),
            ).rejects.toMatchObject({ reason: 'stale_content' });
        });
        it('uses compare-and-swap preferences and invalidates a cursor after publication', async () => {
            const initial = await store.preferences(source());
            expect(initial.version).toBe(0);
            await store.savePreferences(source(), {
                configuration,
                shuffle: false,
                expectedVersion: 0,
            });
            await expect(
                store.savePreferences(source(), {
                    configuration,
                    shuffle: true,
                    expectedVersion: 0,
                }),
            ).rejects.toMatchObject({ reason: 'preferences_conflict' });
            const page = await store.entries(source(), { limit: 1 });
            expect(page.nextCursor).not.toBeNull();
            await notes.update(owner, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content({ ...block, title: 'New title' }),
            });
            await expect(
                store.entries(source(), { limit: 1, cursor: page.nextCursor! }),
            ).rejects.toMatchObject({ reason: 'stale_content' });
        });
    },
);
