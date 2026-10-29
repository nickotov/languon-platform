import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import {
    KnowledgeNoteContentSchema,
    type ExerciseLearningBlock,
    type LearningBlock,
} from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
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
import { DrizzleLearnerStore } from './learner-store';
import { knowledgeNotesTable } from './schema';
import { knowledgeLearningEpochsTable as epochs } from './learning-epoch-schema';
import {
    learningEpochKey,
    readLearningEpochs,
    requireLearningEpoch,
    syncLearningEpochs,
} from './learning-epochs';
import type { KnowledgeDatabase } from './knowledge-transaction';

const content = (blocks: LearningBlock[]) =>
    KnowledgeNoteContentSchema.parse({
        title: 'Epoch tests',
        summary: '',
        categories: [],
        studiedLanguage: 'en',
        explanationLanguage: 'en',
        body: {
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Learning material.' }],
                    },
                    ...blocks.map((block) => ({
                        type: 'learningBlock',
                        attrs: { block },
                    })),
                ],
            },
        },
    });
const exercise = (): ExerciseLearningBlock => ({
    id: randomUUID(),
    type: 'exercise',
    format: 'free-text',
    question: 'When?',
    referenceAnswer: 'Noon',
    explanation: 'The passage says noon.',
});
describe.runIf(isDatabaseIntegrationEnabled())(
    'published learning epochs against PostgreSQL',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let notes: DrizzleKnowledgeStore;
        let learners: DrizzleLearnerStore;
        let owner: string;
        let reader: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const crypto = new KnowledgeShareCrypto('synthetic-epoch-test-key');
            notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            learners = new DrizzleLearnerStore(db, crypto);
        }, 120_000);
        beforeEach(async () => {
            await db.delete(knowledgeNotesTable);
            owner = randomUUID();
            reader = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
        });
        afterAll(async () => client?.end(), 120_000);
        async function revision(noteId: string) {
            return (await learners.read(owner, noteId)).exerciseRevisions[0]!
                .revision;
        }
        async function epoch(
            noteId: string,
            blockId: string,
            itemId = blockId,
            kind: 'exercise' | 'vocabulary' = 'exercise',
        ) {
            return db.transaction(async (tx) =>
                requireLearningEpoch(
                    await readLearningEpochs(tx, noteId),
                    kind,
                    blockId,
                    itemId,
                ),
            );
        }

        it('A → B → restored A never resurrects a previous attempt revision', async () => {
            const block = exercise();
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: content([block]),
            });
            const first = await revision(note.id);
            await learners.attempt(owner, note.id, {
                id: randomUUID(),
                noteVersion: 1,
                exerciseId: block.id,
                exerciseRevision: first,
                answer: { format: 'free-text', text: 'Noon' },
            });
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content([{ ...block, question: 'What time?' }]),
            });
            const second = await revision(note.id);
            await notes.restore(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                revisionVersion: 1,
            });
            const third = await revision(note.id);
            expect(new Set([first, second, third]).size).toBe(3);
            expect((await epoch(note.id, block.id)).epoch).toBe(3);
            const history = await learners.read(owner, note.id);
            expect(history.attempts).toHaveLength(1);
            expect(history.attempts[0]?.exerciseRevision).toBe(first);
            await expect(
                learners.attempt(owner, note.id, {
                    id: randomUUID(),
                    noteVersion: 3,
                    exerciseId: block.id,
                    exerciseRevision: first,
                    answer: { format: 'free-text', text: 'Noon' },
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });
        });
        it('cosmetic publication preserves the epoch; removal and reintroduction create tombstoned history', async () => {
            const block = exercise();
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: content([block]),
            });
            const first = await revision(note.id);
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content([
                    {
                        ...block,
                        title: 'A presentation title',
                        explanation: 'A clearer explanation.',
                    },
                ]),
            });
            expect(await revision(note.id)).toBe(first);
            expect((await epoch(note.id, block.id)).epoch).toBe(1);
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                content: KnowledgeNoteContentSchema.parse({
                    ...content([]),
                    body: {
                        schemaVersion: 1,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'Prose remains.',
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                }),
            });
            const [tombstone] = await db
                .select()
                .from(epochs)
                .where(eq(epochs.noteId, note.id));
            expect(tombstone).toMatchObject({
                active: false,
                epoch: 2,
                lastPublishedVersion: 3,
            });
            await notes.restore(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 3,
                revisionVersion: 1,
            });
            expect(await revision(note.id)).not.toBe(first);
            expect((await epoch(note.id, block.id)).epoch).toBe(3);
        });
        it('vocabulary scopes identities by block and entry and advances through A → B → A', async () => {
            const entryId = randomUUID();
            const first: Extract<LearningBlock, { type: 'vocabulary' }> = {
                id: randomUUID(),
                type: 'vocabulary',
                language: 'en',
                translationLanguage: 'fr',
                entries: [{ id: entryId, term: 'cat', translation: 'chat' }],
            };
            const other = { ...first, id: randomUUID() };
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: content([first, other]),
            });
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content([
                    {
                        ...first,
                        entries: [{ ...first.entries[0]!, term: 'dog' }],
                    },
                    other,
                ]),
            });
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                content: content([
                    first,
                    { ...other, title: 'Cosmetic title' },
                ]),
            });
            expect(
                (await epoch(note.id, first.id, entryId, 'vocabulary')).epoch,
            ).toBe(3);
            expect(
                (await epoch(note.id, other.id, entryId, 'vocabulary')).epoch,
            ).toBe(1);
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 3,
                content: content([other]),
            });
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 4,
                content: content([first, other]),
            });
            expect(
                (await epoch(note.id, first.id, entryId, 'vocabulary')).epoch,
            ).toBe(5);
        });
        it('source passage changes advance exercise epochs, while unrelated passages do not', async () => {
            const block = exercise();
            const sourceId = randomUUID();
            const segmentId = randomUUID();
            const unrelatedId = randomUUID();
            const source: Extract<LearningBlock, { type: 'bilingual-text' }> = {
                id: sourceId,
                type: 'bilingual-text',
                language: 'en',
                segments: [
                    { id: segmentId, text: 'At noon.' },
                    { id: unrelatedId, text: 'Other material.' },
                ],
                translations: [],
            };
            const linked = {
                ...block,
                source: { blockId: sourceId, segmentIds: [segmentId] },
            };
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: content([source, linked]),
            });
            const first = await revision(note.id);
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: content([
                    {
                        ...source,
                        segments: [
                            source.segments[0]!,
                            { id: unrelatedId, text: 'Unrelated edit.' },
                        ],
                    },
                    linked,
                ]),
            });
            expect(await revision(note.id)).toBe(first);
            await notes.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                content: content([
                    {
                        ...source,
                        segments: [
                            { id: segmentId, text: 'At midnight.' },
                            source.segments[1]!,
                        ],
                    },
                    linked,
                ]),
            });
            expect(await revision(note.id)).not.toBe(first);
        });
        it('copies start independent epochs and source deletion cascades only source history', async () => {
            const block = exercise();
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: content([block]),
            });
            const original = await revision(note.id);
            const share = await notes.issueShare(owner, note.id);
            const copied = await notes.copyShared(
                reader,
                share.locator,
                share.key,
                { operationId: randomUUID(), expectedVersion: 1 },
            );
            const copyState = await learners.read(reader, copied.id);
            expect(copyState.exerciseRevisions[0]?.revision).not.toBe(original);
            const [copiedEpoch] = await db
                .select()
                .from(epochs)
                .where(eq(epochs.noteId, copied.id));
            expect(copiedEpoch).toMatchObject({ epoch: 1, active: true });
            await db
                .delete(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, note.id));
            expect(
                await db
                    .select()
                    .from(epochs)
                    .where(eq(epochs.noteId, note.id)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(epochs)
                    .where(eq(epochs.noteId, copied.id)),
            ).toHaveLength(1);
        });
        it('draft edits do not synchronize epochs and explicit Save creates the published identity', async () => {
            const block = exercise();
            const workspace = await notes.createDraft(owner, {
                operationId: randomUUID(),
            });
            const branch = workspace.branches[0]!;
            const edited = await notes.updateWorking(owner, workspace.noteId, {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedVersion: branch.version,
                content: content([block]),
            });
            expect(
                await db
                    .select()
                    .from(epochs)
                    .where(eq(epochs.noteId, workspace.noteId)),
            ).toHaveLength(0);
            const saved = await notes.saveWorkspace(owner, workspace.noteId, {
                operationId: randomUUID(),
                branchId: edited.branch.id,
                expectedVersion: edited.branch.version,
                expectedPublishedVersion: 0,
            });
            expect((await epoch(workspace.noteId, block.id)).epoch).toBe(1);
            const first = await revision(workspace.noteId);
            await notes.saveWorkspace(owner, workspace.noteId, {
                operationId: randomUUID(),
                branchId: edited.branch.id,
                expectedVersion: edited.branch.version,
                expectedPublishedVersion: saved.version,
            });
            expect(await revision(workspace.noteId)).toBe(first);
            expect(
                (await epoch(workspace.noteId, block.id)).lastPublishedVersion,
            ).toBe(saved.version + 1);
        });
        it('epoch updates roll back with failed publication and constraints reject invalid counters', async () => {
            const block = exercise();
            const note = await notes.create(owner, {
                operationId: randomUUID(),
                content: content([block]),
            });
            const original = await epoch(note.id, block.id);
            await expect(
                db.transaction(async (tx) => {
                    await tx
                        .select()
                        .from(knowledgeNotesTable)
                        .where(eq(knowledgeNotesTable.id, note.id))
                        .for('update');
                    await syncLearningEpochs(
                        tx,
                        note.id,
                        content([{ ...block, question: 'Changed?' }]).body,
                        2,
                    );
                    throw new Error('synthetic publication failure');
                }),
            ).rejects.toThrow('synthetic publication failure');
            expect(await epoch(note.id, block.id)).toEqual(original);
            await expect(
                db.execute(
                    sql`update ${epochs} set epoch = 0 where note_id = ${note.id}::uuid`,
                ),
            ).rejects.toThrow();
            expect(
                (
                    await db
                        .select()
                        .from(epochs)
                        .where(
                            and(
                                eq(epochs.noteId, note.id),
                                eq(epochs.itemId, block.id),
                            ),
                        )
                )[0]?.epoch,
            ).toBe(1);
            expect(learningEpochKey('exercise', block.id, block.id)).not.toBe(
                learningEpochKey('vocabulary', block.id, block.id),
            );
        });
    },
);
