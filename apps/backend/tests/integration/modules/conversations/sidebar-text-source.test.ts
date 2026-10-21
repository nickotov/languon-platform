import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import {
    textFoldersTable,
    textsTable,
    textSharesTable,
} from '../../../../src/modules/texts/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const digest = `hmac-sha256:v1:${'a'.repeat(43)}`;

run('Sidebar independent text conversation sources', () => {
    let client: PostgresClient;
    let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
    let resolver: ConversationSourceResolver;
    let owner: string;
    let reader: string;

    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        resolver = new ConversationSourceResolver({
            verifyDictionaryShare: () => false,
            verifyTextShare: (key, value) => key === value,
            readNote: async () => {
                throw new Error('Knowledge is outside this test');
            },
        });
    });
    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        owner = randomUUID();
        reader = randomUUID();
        await db.insert(usersTable).values([
            { id: owner, status: 'active' },
            { id: reader, status: 'active' },
        ]);
    }, 120_000);
    afterAll(async () => client?.end());

    const resolve = (
        actor: string,
        id: string,
        share?: { locator: string; kind: 'text' | 'folder' },
    ) =>
        db.transaction((tx) =>
            resolver.resolve(
                tx,
                actor,
                {
                    kind: 'text',
                    id,
                    ...(share
                        ? { shareLocator: share.locator, shareKind: share.kind }
                        : {}),
                },
                share ? { key: digest } : {},
            ),
        );

    it('resolves owner independent drafts and saved texts while enforcing direct and folder capabilities after a move', async () => {
        const savedId = randomUUID();
        const draftId = randomUUID();
        await db.insert(textsTable).values([
            {
                id: savedId,
                ownerId: owner,
                folderId: null,
                title: 'Independent saved',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                sourceText: 'Saved source.',
                alignment: { source: [], translation: [], editedPairIds: [] },
                status: 'translated',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: draftId,
                ownerId: owner,
                folderId: null,
                title: 'Independent draft',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                sourceText: 'Draft source.',
                status: 'draft',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]);

        await expect(resolve(owner, savedId)).resolves.toMatchObject({
            snapshot: { title: 'Independent saved', provenance: 'saved' },
        });
        await expect(resolve(owner, draftId)).resolves.toMatchObject({
            snapshot: { title: 'Independent draft', provenance: 'saved' },
        });
        await expect(resolve(reader, savedId)).rejects.toMatchObject({
            code: 'conversation_not_found',
        });

        const directLocator = 'independent_direct';
        await db.insert(textSharesTable).values({
            id: randomUUID(),
            ownerId: owner,
            kind: 'text',
            resourceId: savedId,
            locator: directLocator,
            keyDigest: digest,
            version: 1,
            createdAt: new Date(),
        });
        await expect(
            resolve(reader, savedId, { locator: directLocator, kind: 'text' }),
        ).resolves.toMatchObject({ authority: { sourceOwnerId: owner } });

        const folderId = randomUUID();
        const folderLocator = 'moved_folder';
        await db.insert(textFoldersTable).values({
            id: folderId,
            ownerId: owner,
            name: 'Moved source',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await db.insert(textSharesTable).values({
            id: randomUUID(),
            ownerId: owner,
            kind: 'folder',
            resourceId: folderId,
            locator: folderLocator,
            keyDigest: digest,
            version: 1,
            createdAt: new Date(),
        });
        await db
            .update(textsTable)
            .set({ folderId })
            .where(eq(textsTable.id, savedId));
        expect(
            await db
                .select({ folderId: textsTable.folderId })
                .from(textsTable)
                .where(eq(textsTable.id, savedId)),
        ).toEqual([{ folderId }]);
        expect(
            await db
                .select({ resourceId: textSharesTable.resourceId })
                .from(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.kind, 'folder'),
                        eq(textSharesTable.locator, folderLocator),
                    ),
                ),
        ).toEqual([{ resourceId: folderId }]);
        await expect(
            resolve(reader, savedId, { locator: folderLocator, kind: 'folder' }),
        ).resolves.toMatchObject({ authority: { sourceOwnerId: owner } });

        await db
            .update(textsTable)
            .set({ folderId: null })
            .where(eq(textsTable.id, savedId));
        await expect(
            resolve(reader, savedId, { locator: folderLocator, kind: 'folder' }),
        ).rejects.toMatchObject({ code: 'conversation_not_found' });
        await expect(
            resolve(reader, savedId, { locator: directLocator, kind: 'text' }),
        ).resolves.toMatchObject({ authority: { sourceOwnerId: owner } });
    });
});
