import { randomBytes, randomUUID } from 'node:crypto';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleTextContentStore } from '../../../../../src/modules/texts/infrastructure/persistence/drizzle/drizzle-text-content-store';
import { createTextsCryptography } from '../../../../../src/modules/texts/infrastructure/texts-composition';
import {
    textFoldersTable,
    textsTable,
    textRevisionsTable,
    textSharesTable,
    textIdempotencyTable,
} from '../../../../../src/modules/texts/infrastructure/persistence/drizzle/schema';
import {
    resolveTextSource,
    assertTextSourceAuthority,
} from '../../../../../src/modules/texts/infrastructure/persistence/drizzle/text-source-resolver';
import {
    segmentText,
    validateTranslation,
} from '../../../../../src/modules/texts/domain/text';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';
const run = describe.runIf(isDatabaseIntegrationEnabled());
const now = new Date('2026-10-15T12:00:00.000Z');
run('Texts content persistence', () => {
    let client: PostgresClient;
    let db: PostgresJsDatabase<typeof databaseSchema>;
    let store: DrizzleTextContentStore;
    let owner: string;
    let reader: string;
    const crypto = createTextsCryptography(
        'synthetic-text-content-secret-at-least-32-bytes',
        { randomBytes },
    );
    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        store = new DrizzleTextContentStore(
            db,
            { generate: randomUUID },
            { now: () => now },
            crypto,
            async (_tx, input) => {
                const sourceText = 'Hello world.\nGood morning!';
                const source = segmentText(sourceText, 'en', randomUUID);
                return {
                    id: input.jobId,
                    sourceText,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                    alignment: validateTranslation(
                        source,
                        source.map((p) => ({
                            pairId: p.pairId,
                            text: p.text.includes('Hello')
                                ? 'Hola mundo.\n'
                                : '¡Buenos días!',
                        })),
                    ),
                };
            },
        );
    }, 120000);
    beforeEach(async () => {
        await db.delete(textIdempotencyTable);
        await db.delete(textSharesTable);
        await db.delete(textRevisionsTable);
        await db.delete(textsTable);
        await db.delete(textFoldersTable);
        await db.delete(usersTable);
        owner = randomUUID();
        reader = randomUUID();
        await db.insert(usersTable).values(
            [owner, reader].map((id) => ({
                id,
                status: 'active' as const,
                createdAt: now,
                updatedAt: now,
            })),
        );
    });
    afterAll(async () => client.end(), 120000);
    async function fixture() {
        const folder = await store.createFolder(owner, {
            name: 'Stories',
            description: null,
        });
        const draft = await store.createText(owner, {
            folderId: folder.id,
            sourceLanguage: 'en',
            targetLanguage: 'es',
            sourceText: 'Hello world.\nGood morning!',
        });
        return { folder, draft };
    }
    async function translated() {
        const fixtureData = await fixture();
        const text = await store.saveText(owner, fixtureData.draft.id, {
            kind: 'proposal',
            expectedVersion: 1,
            jobId: randomUUID(),
        });
        return { ...fixtureData, text };
    }
    it('keeps exact source, immutable identity, revisions and cumulative edit provenance', async () => {
        const { text } = await translated();
        expect(text.status).toBe('translated');
        expect(text.sourceText).toBe('Hello world.\nGood morning!');
        const pairs = text.alignment!.source.map((p, i) => ({
            pairId: p.pairId,
            source: p.text,
            translation:
                i === 0
                    ? 'Hola planeta.\n'
                    : text.alignment!.translation[i]!.text,
        }));
        const edited = await store.saveText(owner, text.id, {
            kind: 'edits',
            expectedVersion: 2,
            pairs,
        });
        expect(edited.id).toBe(text.id);
        expect(edited.status).toBe('edited');
        expect(edited.alignment!.editedPairIds).toEqual([pairs[0]!.pairId]);
        expect(
            await db
                .select()
                .from(textRevisionsTable)
                .where(eq(textRevisionsTable.textId, text.id)),
        ).toHaveLength(3);
        await expect(
            store.saveText(owner, text.id, {
                kind: 'metadata',
                expectedVersion: 2,
                title: 'Stale',
            }),
        ).rejects.toMatchObject({ code: 'version_conflict' });
    });
    it('isolates ownership and enforces same-owner folder relation in PostgreSQL', async () => {
        const { folder, draft } = await fixture();
        await expect(store.getText(reader, draft.id)).rejects.toMatchObject({
            code: 'text_not_found',
        });
        await expect(
            store.createText(reader, {
                folderId: folder.id,
                sourceLanguage: 'en',
                targetLanguage: 'es',
                sourceText: 'No',
            }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
        await expect(
            db.insert(textsTable).values({
                id: randomUUID(),
                ownerId: reader,
                folderId: folder.id,
                title: 'No',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                sourceText: 'No',
                createdAt: now,
                updatedAt: now,
            }),
        ).rejects.toThrow();
    });
    it('returns live translated folder content and invalidates all child capabilities on archive/restore', async () => {
        const { folder, text } = await translated();
        await store.createText(owner, {
            folderId: folder.id,
            sourceLanguage: 'en',
            targetLanguage: 'es',
            sourceText: 'Private draft',
        });
        const shared = await store.issueShare(owner, 'folder', folder.id, 1);
        const individual = await store.issueShare(owner, 'text', text.id, 2);
        const access = { kind: 'folder' as const, ...shared };
        expect(
            (await store.readShared(access, { limit: 25 })).texts.map(
                (x) => x.id,
            ),
        ).toEqual([text.id]);
        const renamed = await store.saveText(owner, text.id, {
            kind: 'metadata',
            expectedVersion: 2,
            title: 'Live title',
        });
        expect(
            (await store.readShared(access, { limit: 25 })).texts[0]!.title,
        ).toBe(renamed.title);
        await store.folderLifecycle(owner, folder.id, 1, 'archived');
        await expect(
            store.readShared(access, { limit: 25 }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
        await store.folderLifecycle(owner, folder.id, 2, 'active');
        await expect(
            store.readShared({ kind: 'text', ...individual }, { limit: 25 }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
    });
    it('rotates keys and rechecks retained occurrence authority against revocation and edits', async () => {
        const { text } = await translated();
        const shared = await store.issueShare(owner, 'text', text.id, 2);
        const access = { kind: 'text' as const, ...shared };
        const resolved = await db.transaction((tx) =>
            resolveTextSource(
                tx,
                { actorId: reader, textId: text.id, version: 2, share: access },
                (key, digest) => crypto.verifyShare(key, digest),
            ),
        );
        await db.transaction((tx) =>
            assertTextSourceAuthority(tx, resolved.authority),
        );
        await store.issueShare(owner, 'text', text.id, 2);
        await expect(
            db.transaction((tx) =>
                assertTextSourceAuthority(tx, resolved.authority),
            ),
        ).rejects.toMatchObject({ code: 'text_not_found' });
        await expect(
            store.readShared(access, { limit: 25 }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
        const owned = await db.transaction((tx) =>
            resolveTextSource(
                tx,
                { actorId: owner, textId: text.id, version: 2 },
                (key, digest) => crypto.verifyShare(key, digest),
            ),
        );
        await store.saveText(owner, text.id, {
            kind: 'metadata',
            expectedVersion: 2,
            title: 'New',
        });
        await expect(
            db.transaction((tx) =>
                assertTextSourceAuthority(tx, owned.authority),
            ),
        ).rejects.toMatchObject({ code: 'version_conflict' });
    });
    it('serializes concurrent saves and does not publish two versions from one expected version', async () => {
        const { text } = await translated();
        const results = await Promise.allSettled(
            ['One', 'Two'].map((title) =>
                store.saveText(owner, text.id, {
                    kind: 'metadata',
                    expectedVersion: 2,
                    title,
                }),
            ),
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
        expect((await store.getText(owner, text.id)).version).toBe(3);
    });
    it('copies into private independent identities exactly once under concurrent retries', async () => {
        const { folder, text } = await translated();
        const shared = await store.issueShare(owner, 'folder', folder.id, 1);
        const access = { kind: 'folder' as const, ...shared };
        const operation = { idempotencyKey: randomUUID() };
        const [first, second] = await Promise.all([
            store.copyShared(reader, access, operation),
            store.copyShared(reader, access, operation),
        ]);
        expect(first).toEqual(second);
        const copies = await store.listTexts(reader, first.id, { limit: 25 });
        expect(copies.items).toHaveLength(1);
        expect(copies.items[0]!.id).not.toBe(text.id);
        expect(copies.items[0]!.alignment!.source[0]!.pairId).not.toBe(
            text.alignment!.source[0]!.pairId,
        );
        await store.folderLifecycle(owner, folder.id, 1, 'archived');
        expect(
            (await store.getText(reader, copies.items[0]!.id)).sourceText,
        ).toBe(text.sourceText);
        expect(
            await db
                .select()
                .from(textSharesTable)
                .where(eq(textSharesTable.ownerId, reader)),
        ).toHaveLength(0);
        await expect(
            store.copyShared(
                reader,
                { ...access, key: 'A'.repeat(43) },
                operation,
            ),
        ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    });
    it('rejects stale copy versions and preserves drafts as private after replacing translations', async () => {
        const { text } = await translated();
        const destination = await store.createFolder(reader, {
            name: 'Mine',
            description: null,
        });
        const share = await store.issueShare(owner, 'text', text.id, 2);
        await expect(
            store.copyShared(
                reader,
                { kind: 'text', ...share },
                {
                    destinationFolderId: destination.id,
                    idempotencyKey: randomUUID(),
                    expectedVersion: 1,
                },
            ),
        ).rejects.toMatchObject({ code: 'version_conflict' });
        await store.saveText(owner, text.id, {
            kind: 'draft',
            expectedVersion: 2,
            sourceLanguage: 'en',
            targetLanguage: 'fr',
            sourceText: 'Changed source',
        });
        await expect(
            store.readShared({ kind: 'text', ...share }, { limit: 25 }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
        expect((await store.getText(owner, text.id)).alignment).toBeNull();
        expect(
            await db
                .select()
                .from(textsTable)
                .where(
                    and(
                        eq(textsTable.ownerId, reader),
                        eq(textsTable.folderId, destination.id),
                    ),
                ),
        ).toHaveLength(0);
    });
    it('copies a selected child through a folder capability and rejects unrelated children', async () => {
        const { folder, text } = await translated();
        const other = await fixture();
        const destination = await store.createFolder(reader, {
            name: 'Saved',
            description: null,
        });
        const share = await store.issueShare(owner, 'folder', folder.id, 1);
        const access = { kind: 'folder' as const, ...share };
        const result = await store.copyShared(reader, access, {
            sourceTextId: text.id,
            destinationFolderId: destination.id,
            expectedVersion: 2,
            idempotencyKey: randomUUID(),
        });
        expect((await store.getText(reader, result.id)).folderId).toBe(
            destination.id,
        );
        await expect(
            store.copyShared(reader, access, {
                sourceTextId: other.draft.id,
                destinationFolderId: destination.id,
                expectedVersion: 1,
                idempotencyKey: randomUUID(),
            }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
    });
    it.each(['text', 'folder'] as const)(
        'hides foreign versions until %s capability authority is established',
        async (kind) => {
            const { folder, text } = await translated();
            const share = await store.issueShare(
                owner,
                kind,
                kind === 'text' ? text.id : folder.id,
                kind === 'text' ? text.version : folder.version,
            );
            const access = { kind, ...share };
            const resolve = (
                actorId: string,
                version: number,
                capability?: typeof access,
            ) =>
                db.transaction((tx) =>
                    resolveTextSource(
                        tx,
                        {
                            actorId,
                            textId: text.id,
                            version,
                            ...(capability ? { share: capability } : {}),
                        },
                        (key, digest) => crypto.verifyShare(key, digest),
                    ),
                );
            for (const version of [1, text.version]) {
                await expect(resolve(reader, version)).rejects.toMatchObject({
                    code: 'text_not_found',
                });
                await expect(
                    resolve(reader, version, {
                        ...access,
                        key: 'A'.repeat(43),
                    }),
                ).rejects.toMatchObject({ code: 'text_not_found' });
                await expect(
                    db.transaction((tx) =>
                        assertTextSourceAuthority(tx, {
                            actorId: reader,
                            textId: text.id,
                            version,
                        }),
                    ),
                ).rejects.toMatchObject({ code: 'text_not_found' });
            }
            await expect(resolve(owner, 1)).rejects.toMatchObject({
                code: 'version_conflict',
            });
            await expect(resolve(reader, 1, access)).rejects.toMatchObject({
                code: 'version_conflict',
            });
            const retained = await resolve(reader, text.version, access);
            await store.saveText(owner, text.id, {
                kind: 'metadata',
                expectedVersion: text.version,
                title: 'Changed',
            });
            await expect(
                db.transaction((tx) =>
                    assertTextSourceAuthority(tx, retained.authority),
                ),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            await store.revokeShare(
                owner,
                kind,
                kind === 'text' ? text.id : folder.id,
                kind === 'text' ? text.version + 1 : folder.version,
            );
            for (const version of [1, text.version + 1]) {
                await expect(
                    resolve(reader, version, access),
                ).rejects.toMatchObject({ code: 'text_not_found' });
            }
            await expect(
                db.transaction((tx) =>
                    assertTextSourceAuthority(tx, retained.authority),
                ),
            ).rejects.toMatchObject({ code: 'text_not_found' });
        },
    );
    it('fences publication and new content after account deletion has been requested', async () => {
        const { text } = await translated();
        const share = await store.issueShare(owner, 'text', text.id, 2);
        const access = { kind: 'text' as const, ...share };
        const result = await db.transaction((tx) =>
            resolveTextSource(
                tx,
                { actorId: reader, textId: text.id, version: 2, share: access },
                (key, digest) => crypto.verifyShare(key, digest),
            ),
        );
        expect(result.sourceOwnerId).toBe(owner);
        await db
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, owner));
        await expect(
            db.transaction((tx) =>
                assertTextSourceAuthority(tx, result.authority),
            ),
        ).rejects.toMatchObject({ code: 'text_not_found' });
        await expect(
            store.readShared(access, { limit: 25 }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
        await expect(
            store.createFolder(owner, { name: 'Too late', description: null }),
        ).rejects.toMatchObject({ code: 'text_not_found' });
    });
});
