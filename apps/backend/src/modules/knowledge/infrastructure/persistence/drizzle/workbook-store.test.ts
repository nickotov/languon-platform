import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { KnowledgeNoteContentSchema } from '@languon/contracts';
import { eq } from 'drizzle-orm';
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
import { DrizzleWorkbookStore } from './workbook-store';
import { knowledgeNotesTable } from './schema';
import { knowledgeWorkbooksTable } from './workbook-schema';
import { knowledgeBodyPlainText } from '../../../domain/knowledge';
import {
    eraseOwnerKnowledge,
    hasOwnerKnowledge,
} from './knowledge-deletion-participant';
import { readWorkbookSharedNote } from './workbook-access';
import type { KnowledgeDatabase } from './knowledge-transaction';

const crypto = new KnowledgeShareCrypto(
    'workbook-integration-synthetic-secret',
);
describe.runIf(isDatabaseIntegrationEnabled())(
    'Workbook PostgreSQL ownership and lifecycle',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let store: DrizzleWorkbookStore;
        let owner: string;
        let reader: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            store = new DrizzleWorkbookStore(db, crypto);
        }, 120_000);
        beforeEach(async () => {
            await db.delete(knowledgeWorkbooksTable);
            await db.delete(knowledgeNotesTable);
            await db.delete(usersTable);
            owner = randomUUID();
            reader = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
        });
        afterAll(async () => {
            await client?.end();
        });
        async function note(
            status: 'draft' | 'saved' = 'saved',
            contentOwner = owner,
            interactive = false,
        ) {
            const id = randomUUID();
            const content = KnowledgeNoteContentSchema.parse({
                title: 'Study',
                summary: '',
                categories: [],
                studiedLanguage: 'es',
                explanationLanguage: 'en',
                body: interactive
                    ? {
                          schemaVersion: 2,
                          document: {
                              type: 'doc',
                              content: [
                                  {
                                      type: 'learningBlock',
                                      attrs: {
                                          block: {
                                              id: randomUUID(),
                                              type: 'exercise',
                                              format: 'free-text',
                                              question: 'Why?',
                                              referenceAnswer: 'Because.',
                                              explanation: 'Reason.',
                                          },
                                      },
                                  },
                              ],
                          },
                      }
                    : {
                          schemaVersion: 1,
                          document: {
                              type: 'doc',
                              content: [
                                  {
                                      type: 'paragraph',
                                      content: [
                                          {
                                              type: 'text',
                                              text: 'Study material',
                                          },
                                      ],
                                  },
                              ],
                          },
                      },
            });
            const now = new Date();
            await db.insert(knowledgeNotesTable).values({
                id,
                ownerId: contentOwner,
                ...content,
                status,
                version: status === 'saved' ? 1 : 0,
                plainText: knowledgeBodyPlainText(content.body),
                createdAt: now,
                updatedAt: now,
            });
            return id;
        }
        it('rejects owner workbook copies with draft members atomically while shared copies expose only saved material', async () => {
            const saved = await note();
            const draft = await note('draft');
            const workbook = await store.create(owner, {
                id: randomUUID(),
                title: 'Mixed private workbook',
            });
            const ordered = await store.setNotes(owner, workbook.id, {
                expectedVersion: workbook.version,
                noteIds: [saved, draft],
                acknowledgeSharedAddition: false,
            });
            const destinationId = randomUUID();
            const originalWorkbooks = await db
                .select()
                .from(knowledgeWorkbooksTable);
            const originalNotes = await db.select().from(knowledgeNotesTable);
            await expect(
                store.copy(owner, workbook.id, {
                    id: destinationId,
                    title: 'Must not be partial',
                    expectedVersion: ordered.version,
                }),
            ).rejects.toMatchObject({
                code: 'version_conflict',
                message: 'Save all notes before copying this workbook.',
            });
            expect(await db.select().from(knowledgeWorkbooksTable)).toEqual(
                originalWorkbooks,
            );
            expect(await db.select().from(knowledgeNotesTable)).toEqual(
                originalNotes,
            );
            expect(
                (await store.get(owner, workbook.id)).notes.map(
                    (item) => item.id,
                ),
            ).toEqual([saved, draft]);
            const share = await store.issueShare(
                owner,
                workbook.id,
                ordered.version,
            );
            const shared = await store.readShared(share.locator, share.key);
            expect(shared.notes.map((item) => item.id)).toEqual([saved]);
            expect(JSON.stringify(shared)).not.toContain(draft);
            const sharedCopy = await store.copyShared(
                reader,
                share.locator,
                share.key,
                { id: randomUUID(), title: 'Accessible saved material' },
            );
            expect(sharedCopy.notes).toHaveLength(1);
        });
        it('retains explicit ordering, excludes drafts from sharing and isolates owners', async () => {
            const first = await note();
            const draft = await note('draft');
            const second = await note();
            const workbook = await store.create(owner, {
                id: randomUUID(),
                title: 'Workbook',
            });
            const ordered = await store.setNotes(owner, workbook.id, {
                expectedVersion: 1,
                noteIds: [second, draft, first],
                acknowledgeSharedAddition: false,
            });
            expect(ordered.notes.map((item) => item.id)).toEqual([
                second,
                draft,
                first,
            ]);
            await expect(store.get(reader, workbook.id)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
            const share = await store.issueShare(
                owner,
                workbook.id,
                ordered.version,
            );
            expect(
                (await store.readShared(share.locator, share.key)).notes.map(
                    (item) => item.id,
                ),
            ).toEqual([second, first]);
            await expect(
                store.readShared(share.locator, 'x'.repeat(43)),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('rejects foreign membership, duplicate workbook membership and stale concurrent writes', async () => {
            const mine = await note();
            const foreign = await note('saved', reader);
            const a = await store.create(owner, {
                id: randomUUID(),
                title: 'A',
            });
            const b = await store.create(owner, {
                id: randomUUID(),
                title: 'B',
            });
            await expect(
                store.setNotes(owner, a.id, {
                    expectedVersion: 1,
                    noteIds: [foreign],
                    acknowledgeSharedAddition: false,
                }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            await store.setNotes(owner, a.id, {
                expectedVersion: 1,
                noteIds: [mine],
                acknowledgeSharedAddition: false,
            });
            await expect(
                store.setNotes(owner, b.id, {
                    expectedVersion: 1,
                    noteIds: [mine],
                    acknowledgeSharedAddition: false,
                }),
            ).rejects.toMatchObject({ code: 'invalid_request' });
            const results = await Promise.allSettled([
                store.update(owner, a.id, {
                    expectedVersion: 2,
                    title: 'First',
                }),
                store.update(owner, a.id, {
                    expectedVersion: 2,
                    title: 'Second',
                }),
            ]);
            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                results.filter((result) => result.status === 'rejected'),
            ).toHaveLength(1);
        });
        it('requires confirmation for shared additions and removes only workbook-derived access', async () => {
            const id = await note();
            const workbook = await store.create(owner, {
                id: randomUUID(),
                title: 'A',
            });
            const share = await store.issueShare(owner, workbook.id, 1);
            await expect(
                store.setNotes(owner, workbook.id, {
                    expectedVersion: 1,
                    noteIds: [id],
                    acknowledgeSharedAddition: false,
                }),
            ).rejects.toMatchObject({ code: 'invalid_request' });
            await store.setNotes(owner, workbook.id, {
                expectedVersion: 1,
                noteIds: [id],
                acknowledgeSharedAddition: true,
            });
            await db.transaction(async (tx) =>
                expect(
                    (await readWorkbookSharedNote(tx, crypto, id, share)).id,
                ).toBe(id),
            );
            await store.setNotes(owner, workbook.id, {
                expectedVersion: 2,
                noteIds: [],
                acknowledgeSharedAddition: false,
            });
            await expect(
                db.transaction((tx) =>
                    readWorkbookSharedNote(tx, crypto, id, share),
                ),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(
                await db
                    .select()
                    .from(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, id)),
            ).toHaveLength(1);
        });
        it('rotates revoked links and dissolves without deleting notes or resurrecting create retries', async () => {
            const id = await note();
            const workbook = await store.create(owner, {
                id: randomUUID(),
                title: 'A',
            });
            await store.setNotes(owner, workbook.id, {
                expectedVersion: 1,
                noteIds: [id],
                acknowledgeSharedAddition: false,
            });
            const old = await store.issueShare(owner, workbook.id, 2);
            await store.revokeShare(owner, workbook.id, 2);
            const fresh = await store.issueShare(owner, workbook.id, 2);
            expect(fresh.locator).not.toBe(old.locator);
            await expect(
                store.readShared(old.locator, old.key),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            await store.delete(owner, workbook.id, 2);
            await expect(
                store.readShared(fresh.locator, fresh.key),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(
                await db
                    .select()
                    .from(knowledgeNotesTable)
                    .where(eq(knowledgeNotesTable.id, id)),
            ).toHaveLength(1);
            await expect(
                store.create(owner, { id: workbook.id, title: 'A' }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('copies an ordered workbook independently with fresh exercise identities', async () => {
            const id = await note('saved', owner, true);
            const workbook = await store.create(owner, {
                id: randomUUID(),
                title: 'Original',
            });
            await store.setNotes(owner, workbook.id, {
                expectedVersion: 1,
                noteIds: [id],
                acknowledgeSharedAddition: false,
            });
            const share = await store.issueShare(owner, workbook.id, 2);
            const copy = await store.copyShared(
                reader,
                share.locator,
                share.key,
                { id: randomUUID(), title: 'Copy' },
            );
            expect(copy.notes).toHaveLength(1);
            expect(copy.notes[0]?.id).not.toBe(id);
            const [original] = await db
                .select()
                .from(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, id));
            const [copied] = await db
                .select()
                .from(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, copy.notes[0]!.id));
            expect(
                copied?.body.document.content?.[0]?.attrs?.block?.id,
            ).not.toBe(original?.body.document.content?.[0]?.attrs?.block?.id);
            await store.revokeShare(owner, workbook.id, 2);
            await db
                .delete(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, id));
            expect((await store.get(reader, copy.id)).notes).toHaveLength(1);
        });
        it('erases workbook groups and tombstones with owner knowledge', async () => {
            const workbook = await store.create(owner, {
                id: randomUUID(),
                title: 'Erase',
            });
            await store.delete(owner, workbook.id, 1);
            expect(
                await db.transaction((tx) => hasOwnerKnowledge(tx, owner)),
            ).toBe(true);
            await db.transaction((tx) => eraseOwnerKnowledge(tx, owner));
            expect(
                await db.transaction((tx) => hasOwnerKnowledge(tx, owner)),
            ).toBe(false);
        });
    },
);
