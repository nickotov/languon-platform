import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    textsTable,
    textFoldersTable,
} from '../../../../texts/infrastructure/persistence/drizzle/schema';
import {
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable,
} from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import { createDictionaryNavigationReader } from '../../../../dictionaries/infrastructure/navigation-reader';
import { createTextNavigationReader } from '../../../../texts/infrastructure/navigation-reader';
import { createKnowledgeNavigationReader } from '../../../../knowledge/infrastructure/navigation-reader';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    resetTestDatabase,
    migrateTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import {
    DrizzleNavigationMetadataStore,
    type NavigationDatabase,
} from './drizzle-navigation-metadata-store';
import { navigationResourcesTable } from './schema';
import { eraseNavigationOwnedMetadata } from './navigation-deletion-participant';
describe.runIf(isDatabaseIntegrationEnabled())(
    'Navigation PostgreSQL live reads and metadata',
    () => {
        let client: PostgresClient;
        let db: NavigationDatabase;
        let store: DrizzleNavigationMetadataStore;
        let owner: string;
        let other: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            store = new DrizzleNavigationMetadataStore(db);
        }, 120000);
        beforeEach(async () => {
            await db.delete(knowledgeNotesTable);
            await db.delete(textsTable);
            await db.delete(textFoldersTable);
            await db.delete(dictionariesTable);
            await db.delete(usersTable);
            owner = randomUUID();
            other = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: other, status: 'active' },
            ]);
        });
        afterAll(async () => {
            await client?.end();
        });
        async function dictionary(
            name: string,
            ownerId = owner,
            lifecycle: 'active' | 'archived' = 'active',
        ) {
            const id = randomUUID();
            await db.insert(dictionariesTable).values({
                id,
                name,
                ownerId,
                lifecycle,
                archivedAt: lifecycle === 'archived' ? new Date() : null,
                createdAt: new Date(Date.now() - 1000),
                sourceLanguageTag: 'es',
                targetLanguageTag: 'en',
            });
            return id;
        }
        it('searches whole library titles literally, hides other owners/archived and never fabricates recents', async () => {
            const id = await dictionary('MY 100%_Words');
            await dictionary('100 other');
            await dictionary('MY 100%_Words', other);
            await dictionary('MY 100%_Words', owner, 'archived');
            const reader = createDictionaryNavigationReader(db);
            expect(await reader.count(owner)).toBe(2);
            expect(await reader.count(other)).toBe(1);
            expect(await reader.read(owner, { limit: 8 })).toEqual([]);
            const found = await reader.read(owner, { q: '100%_', limit: 8 });
            expect(found.map((r) => r.id)).toEqual([id]);
            expect(found[0]).toMatchObject({
                title: 'MY 100%_Words',
                pinned: false,
                lastOpenedAt: null,
            });
            expect(await reader.read(other, { id, limit: 1 })).toEqual([]);
            expect(
                (await reader.read(owner, { q: 'my', limit: 1 })).length,
            ).toBe(1);
        });
        it('fills five section shortcuts from existing activity without fabricating global open history', async () => {
            const ids: string[] = [];
            for (let n = 0; n < 7; n++) {
                const id = await dictionary(`Existing ${n}`);
                ids.push(id);
                await db
                    .update(dictionariesTable)
                    .set({
                        createdAt: new Date('2026-10-01T00:00:00Z'),
                        updatedAt: new Date(
                            `2026-10-${String(10 + n).padStart(2, '0')}T00:00:00Z`,
                        ),
                    })
                    .where(eq(dictionariesTable.id, id));
            }
            const reader = createDictionaryNavigationReader(db);
            const existing = await reader.read(owner, {
                kind: 'dictionary',
                limit: 5,
            });
            expect(existing.map((r) => r.id)).toEqual(ids.slice(2).reverse());
            expect(existing.every((r) => r.lastOpenedAt === null)).toBe(true);
            expect(
                await reader.read(owner, { recentOnly: true, limit: 5 }),
            ).toEqual([]);
            expect(await db.select().from(navigationResourcesTable)).toEqual(
                [],
            );
            await store.record(owner, 'dictionary', ids[0]!, {
                openedAt: new Date('2026-10-01T00:00:00Z'),
            });
            await store.record(owner, 'dictionary', ids[1]!, { pinned: true });
            const result = await reader.read(owner, {
                kind: 'dictionary',
                limit: 5,
            });
            expect(result.map((r) => r.id)).toEqual([
                ids[1],
                ids[0],
                ids[6],
                ids[5],
                ids[4],
            ]);
            expect(
                (await reader.read(owner, { recentOnly: true, limit: 5 })).map(
                    (r) => r.id,
                ),
            ).toEqual([ids[0]]);
        });
        it('upserts one metadata row, preserves independent fields under concurrency and filters stale source refs', async () => {
            const id = await dictionary('First');
            const reader = createDictionaryNavigationReader(db);
            await Promise.all([
                store.record(owner, 'dictionary', id, {
                    openedAt: new Date('2026-10-20T00:00:00Z'),
                }),
                store.record(owner, 'dictionary', id, { pinned: true }),
            ]);
            const [entry] = await reader.read(owner, { limit: 8 });
            expect(entry).toMatchObject({
                pinned: true,
                lastOpenedAt: '2026-10-20T00:00:00.000Z',
            });
            await store.record(owner, 'dictionary', id, {
                openedAt: new Date('2026-10-19T00:00:00Z'),
            });
            expect(
                (await reader.read(owner, { limit: 8 }))[0]!.lastOpenedAt,
            ).toBe('2026-10-20T00:00:00.000Z');
            await db
                .update(dictionariesTable)
                .set({ name: 'Renamed' })
                .where(eq(dictionariesTable.id, id));
            expect((await reader.read(owner, { limit: 8 }))[0]!.title).toBe(
                'Renamed',
            );
            await store.record(owner, 'dictionary', id, { pinned: false });
            expect((await reader.read(owner, { limit: 8 }))[0]!.pinned).toBe(
                false,
            );
            expect(
                (await db.select().from(navigationResourcesTable)).length,
            ).toBe(1);
            await db
                .update(dictionariesTable)
                .set({ lifecycle: 'archived', archivedAt: new Date() })
                .where(eq(dictionariesTable.id, id));
            expect(await reader.read(owner, { limit: 8 })).toEqual([]);
            await db
                .update(dictionariesTable)
                .set({ lifecycle: 'active', archivedAt: null })
                .where(eq(dictionariesTable.id, id));
            expect(
                (await reader.read(owner, { recentOnly: true, limit: 5 }))
                    .length,
            ).toBe(1);
            await db
                .delete(dictionariesTable)
                .where(eq(dictionariesTable.id, id));
            expect(await reader.read(owner, { limit: 8 })).toEqual([]);
        });
        it('includes independent texts and active folder metadata, hides texts in archived folders', async () => {
            const now = new Date();
            const folderId = randomUUID();
            await db.insert(textFoldersTable).values({
                id: folderId,
                ownerId: owner,
                name: 'Folder',
                createdAt: now,
                updatedAt: now,
            });
            const independent = randomUUID(),
                nested = randomUUID();
            await db.insert(textsTable).values([
                {
                    id: independent,
                    ownerId: owner,
                    folderId: null,
                    title: 'Independent',
                    sourceLanguage: 'es',
                    targetLanguage: 'en',
                    sourceText: 'Hola',
                    createdAt: now,
                    updatedAt: now,
                },
                {
                    id: nested,
                    ownerId: owner,
                    folderId,
                    title: 'Nested',
                    sourceLanguage: 'es',
                    targetLanguage: 'en',
                    sourceText: 'Hola',
                    createdAt: now,
                    updatedAt: now,
                },
            ]);
            const reader = createTextNavigationReader(db);
            expect(await reader.count(owner)).toBe(2);
            expect(await reader.count(other)).toBe(0);
            expect(
                (await reader.read(owner, { q: 'independent', limit: 8 }))[0],
            ).toMatchObject({ id: independent, href: `/texts/${independent}` });
            expect(
                (await reader.read(owner, { q: 'nested', limit: 8 }))[0],
            ).toMatchObject({ description: 'Folder' });
            await db
                .update(textFoldersTable)
                .set({ lifecycle: 'archived' })
                .where(eq(textFoldersTable.id, folderId));
            expect(await reader.read(owner, { q: 'nested', limit: 8 })).toEqual(
                [],
            );
        });
        it('includes private knowledge drafts using current preferred working titles', async () => {
            const id = randomUUID(),
                branchId = randomUUID(),
                now = new Date();
            const body = {
                schemaVersion: 1 as const,
                document: {
                    type: 'doc' as const,
                    content: [{ type: 'paragraph' as const }],
                },
            };
            await db.insert(knowledgeNotesTable).values({
                id,
                ownerId: owner,
                title: 'Old',
                summary: '',
                body,
                categories: [],
                plainText: '',
                status: 'draft',
                version: 0,
                preferredBranchId: branchId,
                createdAt: now,
                updatedAt: now,
            });
            await db.insert(knowledgeWorkingBranchesTable).values({
                id: branchId,
                noteId: id,
                version: 1,
                basePublishedVersion: 0,
                content: {
                    title: 'Private working title',
                    summary: '',
                    body,
                    categories: [],
                    studiedLanguage: null,
                    explanationLanguage: null,
                },
                updatedAt: now,
            });
            const reader = createKnowledgeNavigationReader(db);
            expect(await reader.count(owner)).toBe(1);
            expect(await reader.count(other)).toBe(0);
            expect(
                (await reader.read(owner, { q: 'working', limit: 8 }))[0],
            ).toMatchObject({ id, title: 'Private working title' });
            expect(
                await reader.read(other, { q: 'working', limit: 8 }),
            ).toEqual([]);
        });
        it('erases all owner metadata while retaining the purged user tombstone and foreign history', async () => {
            const id = await dictionary('Owner');
            const foreignId = await dictionary('Foreign', other);
            await store.record(owner, 'dictionary', id, { pinned: true });
            await store.record(owner, 'text', randomUUID(), {
                openedAt: new Date(),
            });
            await store.record(owner, 'knowledge', randomUUID(), {
                pinned: true,
            });
            await store.record(other, 'dictionary', foreignId, {
                openedAt: new Date(),
            });
            await db.transaction(async (tx) => {
                await tx
                    .update(usersTable)
                    .set({ status: 'purged' })
                    .where(eq(usersTable.id, owner));
                await eraseNavigationOwnedMetadata(tx, owner);
            });
            expect(
                (
                    await db
                        .select()
                        .from(usersTable)
                        .where(eq(usersTable.id, owner))
                )[0]?.status,
            ).toBe('purged');
            const remaining = await db.select().from(navigationResourcesTable);
            expect(remaining).toHaveLength(1);
            expect(remaining[0]).toMatchObject({
                ownerId: other,
                resourceId: foreignId,
            });
            await expect(
                store.record(owner, 'dictionary', id, { pinned: true }),
            ).rejects.toMatchObject({ code: 'resource_not_found' });
        });
        it('rejects metadata writes for inactive owners and cascades metadata during account deletion', async () => {
            const id = await dictionary('Account');
            await store.record(owner, 'dictionary', id, { pinned: true });
            await db
                .update(usersTable)
                .set({ status: 'deletion_pending' })
                .where(eq(usersTable.id, owner));
            await expect(
                store.record(owner, 'dictionary', id, { pinned: false }),
            ).rejects.toMatchObject({ code: 'resource_not_found' });
            expect(
                await createDictionaryNavigationReader(db).read(owner, {
                    q: 'Account',
                    limit: 8,
                }),
            ).toEqual([]);
            await db.delete(usersTable).where(eq(usersTable.id, owner));
            expect(await db.select().from(navigationResourcesTable)).toEqual(
                [],
            );
        });
    },
);
