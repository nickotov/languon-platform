import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { KnowledgeNoteContentSchema } from '@languon/contracts';
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
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import {
    DrizzleKnowledgeTransactionParticipant,
    type KnowledgeDatabase,
} from './knowledge-transaction';
import {
    knowledgeNotesTable,
    knowledgeNoteRevisionsTable,
    knowledgeOperationReceiptsTable,
} from './schema';
import {
    eraseOwnerKnowledge,
    hasOwnerKnowledge,
} from './knowledge-deletion-participant';
import { KnowledgeDomainError } from '../../../domain/knowledge';

const content = KnowledgeNoteContentSchema.parse({
    title: 'Subjunctive',
    summary: 'Express uncertainty.',
    categories: ['grammar'],
    studiedLanguage: 'es',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Ojalá llueva mañana.' }],
                },
            ],
        },
    },
});
describe.runIf(isDatabaseIntegrationEnabled())(
    'Knowledge PostgreSQL ownership, revisions and publication',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let store: DrizzleKnowledgeStore;
        let owner: string;
        let other: string;
        const beforeNoteDeletion = vi.fn(async () => {});
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            store = new DrizzleKnowledgeStore(db, { beforeNoteDeletion });
        }, 120_000);
        beforeEach(async () => {
            beforeNoteDeletion.mockReset();
            await db.delete(knowledgeNotesTable);
            await db.delete(knowledgeOperationReceiptsTable);
            await db.delete(usersTable);
            owner = randomUUID();
            other = randomUUID();
            await db.insert(usersTable).values(
                [owner, other].map((id) => ({
                    id,
                    status: 'active' as const,
                })),
            );
        });
        afterAll(async () => client?.end(), 120_000);
        it('isolates reads and mutations and searches derived content with literal wildcard escaping', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            await expect(store.get(other, note.id)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
            await expect(
                store.update(other, note.id, {
                    operationId: randomUUID(),
                    expectedVersion: 1,
                    content,
                }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(
                (
                    await store.list(owner, {
                        q: 'llueva',
                        offset: 0,
                        limit: 20,
                    })
                ).notes.map((n) => n.id),
            ).toEqual([note.id]);
            expect(
                (await store.list(other, { offset: 0, limit: 20 })).notes,
            ).toEqual([]);
            expect(
                (await store.list(owner, { q: '%', offset: 0, limit: 20 }))
                    .notes,
            ).toEqual([]);
            expect(
                (
                    await store.list(owner, {
                        category: 'culture',
                        offset: 0,
                        limit: 20,
                    })
                ).notes,
            ).toEqual([]);
        });
        it('accepts only one concurrent update and restores content as a fresh immutable revision', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const updates = await Promise.allSettled(
                ['First', 'Second'].map((title) =>
                    store.update(owner, note.id, {
                        operationId: randomUUID(),
                        expectedVersion: 1,
                        content: { ...content, title },
                    }),
                ),
            );
            expect(
                updates.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                updates.filter((result) => result.status === 'rejected'),
            ).toHaveLength(1);
            const current = await store.get(owner, note.id);
            expect(current.version).toBe(2);
            const restored = await store.restore(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                revisionVersion: 1,
            });
            expect(restored).toMatchObject({
                title: content.title,
                version: 3,
            });
            expect(
                (await store.revisions(owner, note.id)).map(
                    (revision) => revision.version,
                ),
            ).toEqual([3, 2, 1]);
        });
        it('replays successful requests without duplicate notes or revisions and rejects changed reuse', async () => {
            const input = { operationId: randomUUID(), content };
            const [left, right] = await Promise.all([
                store.create(owner, input),
                store.create(owner, input),
            ]);
            expect(left).toEqual(right);
            expect(
                (await store.list(owner, { offset: 0, limit: 20 })).total,
            ).toBe(1);
            await expect(
                store.create(owner, {
                    ...input,
                    content: { ...content, title: 'Changed' },
                }),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
            const patch = {
                operationId: randomUUID(),
                expectedVersion: 1,
                content: { ...content, title: 'A revision' },
            };
            const updated = await store.update(owner, left.id, patch);
            await store.update(owner, left.id, {
                operationId: randomUUID(),
                expectedVersion: 2,
                content: { ...content, title: 'Newer revision' },
            });
            expect(await store.update(owner, left.id, patch)).toEqual(updated);
        });
        it('deletes revisions and prevents old creates or pending update drafts from resurrecting notes', async () => {
            const input = { operationId: randomUUID(), content };
            const note = await store.create(owner, input);
            const deletion = { operationId: randomUUID(), expectedVersion: 1 };
            await store.delete(owner, note.id, deletion);
            await store.delete(owner, note.id, deletion);
            expect(beforeNoteDeletion).toHaveBeenCalledOnce();
            expect(
                await db
                    .select()
                    .from(knowledgeNoteRevisionsTable)
                    .where(eq(knowledgeNoteRevisionsTable.noteId, note.id)),
            ).toEqual([]);
            await expect(store.create(owner, input)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
            await expect(
                db.transaction((tx) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).publish(
                        owner,
                        {
                            operationId: randomUUID(),
                            noteId: note.id,
                            expectedVersion: 1,
                            content,
                        },
                    ),
                ),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('rolls back explicit publication together with a failed conversation draft transaction', async () => {
            await expect(
                db.transaction(async (tx) => {
                    await new DrizzleKnowledgeTransactionParticipant(
                        tx,
                    ).publish(owner, { operationId: randomUUID(), content });
                    throw new Error('draft version fence failed');
                }),
            ).rejects.toThrow('draft version fence failed');
            expect(
                (await store.list(owner, { offset: 0, limit: 20 })).notes,
            ).toEqual([]);
            expect(
                await db.select().from(knowledgeOperationReceiptsTable),
            ).toEqual([]);
        });
        it('preserves the note and receipt when source-dependent work blocks deletion', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            beforeNoteDeletion.mockRejectedValueOnce(
                new KnowledgeDomainError(
                    'deletion_busy',
                    'Stop the active turn first.',
                ),
            );
            await expect(
                store.delete(owner, note.id, {
                    operationId: randomUUID(),
                    expectedVersion: 1,
                }),
            ).rejects.toMatchObject({ code: 'deletion_busy' });
            expect((await store.get(owner, note.id)).version).toBe(1);
            expect(
                await db.select().from(knowledgeOperationReceiptsTable),
            ).toHaveLength(1);
        });
        it('account purge erases owned notes, revisions and receipts without deleting other learners notes', async () => {
            await store.create(owner, { operationId: randomUUID(), content });
            const otherNote = await store.create(other, {
                operationId: randomUUID(),
                content,
            });
            await db.transaction((tx) => eraseOwnerKnowledge(tx, owner));
            expect(
                await db.transaction((tx) => hasOwnerKnowledge(tx, owner)),
            ).toBe(false);
            expect(await store.get(other, otherNote.id)).toMatchObject({
                id: otherNote.id,
            });
        });
    },
);
