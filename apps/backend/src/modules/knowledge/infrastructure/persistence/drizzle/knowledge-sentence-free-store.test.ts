import {
    knowledgeSentenceReviewsTable,
    knowledgeSentenceExercisesTable,
} from './knowledge-sentence-schema';
import { knowledgeSentenceNextReceiptsTable } from './knowledge-sentence-next-schema';
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
import { DrizzleKnowledgeSentenceFreeStore } from './knowledge-sentence-free-store';
import { knowledgeNotesTable } from './schema';
import type { KnowledgeDatabase } from './knowledge-transaction';
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
    'private note prepared sentence PostgreSQL practice',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let notes: DrizzleKnowledgeStore;
        let store: DrizzleKnowledgeSentenceFreeStore;
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
            store = new DrizzleKnowledgeSentenceFreeStore(db, crypto, () => ({
                admitGeneration: async () => {
                    throw new Error('unexpected AI admission');
                },
            }));
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
        const context = () => ({
            now: new Date(),
            signal: AbortSignal.timeout(10_000),
        });
        const setup = {
            direction: 'source-to-target' as const,
            mode: 'saved-first' as const,
            scope: { type: 'all' as const },
        };
        const next = () => ({
            ...setup,
            operationId: randomUUID(),
            sessionId: randomUUID(),
            visitedExerciseIds: [],
        });
        it('privately seeds prepared examples, replays next and records free reveals without an AI check', async () => {
            const prepared = await store.prepare(source(), setup, context());
            expect(prepared.eligibleCount).toBe(2);
            expect(prepared.savedUncheckedCount).toBe(1);
            const input = next();
            const first = await store.next(source(), input, context());
            expect(first.kind).toBe('exercise');
            expect(await store.next(source(), input, context())).toEqual(first);
            if (first.kind !== 'exercise') throw new Error('exercise expected');
            expect(first.exercise.dictionaryId).toBeNull();
            expect(first.exercise.knowledgeSource).toEqual({
                noteId,
                blockId: block.id,
            });
            const reveal = {
                operationId: randomUUID(),
                sessionId: input.sessionId,
            };
            const result = await store.revealReference(
                source(),
                first.exercise.id,
                reveal,
                context(),
            );
            expect(result.review.referenceTranslation).toBe('Camino.');
            expect(
                await store.revealReference(
                    source(),
                    first.exercise.id,
                    reveal,
                    context(),
                ),
            ).toEqual(result);
            const progress = await store.progress(
                source(),
                { direction: setup.direction },
                context(),
            );
            expect(progress).toMatchObject({
                manualReviewCount: 1,
                completedCheckCount: 0,
                usedCount: 1,
            });
            expect(
                (await store.attempts(source(), { limit: 25 }, context()))
                    .attempts,
            ).toEqual([]);
            expect(
                (await store.manualReviews(source(), { limit: 25 }, context()))
                    .reviews,
            ).toHaveLength(1);
        });
        it('keeps learner history private and unavailable after revocation', async () => {
            const access = {
                kind: 'note' as const,
                ...(await notes.issueShare(owner, noteId)),
            };
            const shared = { ...source(), actorId: reader, access };
            const exercise = await store.next(shared, next(), context());
            if (exercise.kind !== 'exercise')
                throw new Error('exercise expected');
            await store.revealReference(
                shared,
                exercise.exercise.id,
                { operationId: randomUUID(), sessionId: randomUUID() },
                context(),
            );
            expect(
                (await store.manualReviews(source(), { limit: 25 }, context()))
                    .reviews,
            ).toHaveLength(0);
            await expect(
                store.revealReference(
                    source(),
                    exercise.exercise.id,
                    { operationId: randomUUID(), sessionId: randomUUID() },
                    context(),
                ),
            ).rejects.toBeDefined();
            await notes.revokeShare(owner, noteId);
            await expect(
                store.manualReviews(shared, { limit: 25 }, context()),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('serializes concurrent operation replay and rejects changed requests', async () => {
            const input = next();
            const results = await Promise.all([
                store.next(source(), input, context()),
                store.next(source(), input, context()),
            ]);
            expect(results[0]).toEqual(results[1]);
            await expect(
                store.next(
                    source(),
                    { ...input, direction: 'target-to-source' },
                    context(),
                ),
            ).rejects.toMatchObject({ reason: 'operation_conflict' });
        });
        it('keeps historical reviews outdated across material changes and deletes them with source', async () => {
            const result = await store.next(source(), next(), context());
            if (result.kind !== 'exercise')
                throw new Error('exercise expected');
            await store.revealReference(
                source(),
                result.exercise.id,
                { operationId: randomUUID(), sessionId: randomUUID() },
                context(),
            );
            const changed = structuredClone(block);
            changed.entries[0]!.translation = 'andar';
            await notes.update(owner, noteId, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content(changed),
            });
            expect(
                (await store.manualReviews(source(), { limit: 25 }, context()))
                    .reviews[0]!.contentState,
            ).toBe('outdated');
            expect(
                (
                    await store.progress(
                        source(),
                        { direction: setup.direction },
                        context(),
                    )
                ).manualReviewCount,
            ).toBe(0);
            await expect(
                store.next(
                    source(),
                    {
                        ...next(),
                        mode: 'review-only',
                        replayExerciseId: result.exercise.id,
                    },
                    context(),
                ),
            ).rejects.toMatchObject({ reason: 'stale_content' });
            await db.delete(knowledgeNotesTable);
            expect(
                await db.select().from(knowledgeSentenceExercisesTable),
            ).toHaveLength(0);
            expect(
                await db.select().from(knowledgeSentenceReviewsTable),
            ).toHaveLength(0);
            expect(
                await db.select().from(knowledgeSentenceNextReceiptsTable),
            ).toHaveLength(0);
            await expect(
                store.manualReviews(source(), { limit: 25 }, context()),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('paginates manual history and binds cursors to the exact actor/source/filter', async () => {
            const result = await store.next(source(), next(), context());
            if (result.kind !== 'exercise')
                throw new Error('exercise expected');
            for (let index = 0; index < 2; index++)
                await store.revealReference(
                    source(),
                    result.exercise.id,
                    { operationId: randomUUID(), sessionId: randomUUID() },
                    context(),
                );
            const first = await store.manualReviews(
                source(),
                { limit: 1 },
                context(),
            );
            expect(first.reviews).toHaveLength(1);
            expect(first.nextCursor).toBeTypeOf('string');
            const second = await store.manualReviews(
                source(),
                { limit: 1, cursor: first.nextCursor! },
                context(),
            );
            expect(second.reviews).toHaveLength(1);
            expect(second.reviews[0]!.id).not.toBe(first.reviews[0]!.id);
            expect(second.nextCursor).toBeNull();
            await expect(
                store.manualReviews(
                    source(),
                    {
                        limit: 1,
                        cursor: first.nextCursor!,
                        direction: 'target-to-source',
                    },
                    context(),
                ),
            ).rejects.toBeDefined();
        });
    },
);
