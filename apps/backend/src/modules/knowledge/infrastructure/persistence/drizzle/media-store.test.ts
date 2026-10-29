import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { createFixtureAudio } from '../../../../speech/domain/audio-integrity';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { verifyKnowledgeAudio } from '../../media-audio-validation';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleKnowledgeMediaStore } from './media-store';
import {
    knowledgeMediaAssetsTable,
    knowledgeMediaBlobsTable,
} from './media-schema';
import type { KnowledgeDatabase } from './knowledge-transaction';
import { sql } from 'drizzle-orm';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Knowledge media ownership and independent copies',
    () => {
        let client: PostgresClient,
            db: KnowledgeDatabase,
            store: DrizzleKnowledgeStore,
            media: DrizzleKnowledgeMediaStore,
            owner: string,
            reader: string;
        const content = {
            title: 'Listening',
            summary: '',
            categories: [],
            studiedLanguage: null,
            explanationLanguage: null,
            body: {
                schemaVersion: 1 as const,
                document: {
                    type: 'doc' as const,
                    content: [
                        {
                            type: 'paragraph' as const,
                            content: [
                                {
                                    type: 'text' as const,
                                    text: 'Listen carefully.',
                                },
                            ],
                        },
                    ],
                },
            },
        };
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const crypto = new KnowledgeShareCrypto(
                'knowledge-media-test-secret-only',
            );
            store = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            media = new DrizzleKnowledgeMediaStore(db, crypto);
        }, 120000);
        beforeEach(async () => {
            await db.execute(
                sql`truncate knowledge_notes,knowledge_media_blobs,knowledge_operation_receipts cascade`,
            );
            owner = randomUUID();
            reader = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
        });
        afterAll(async () => client?.end());
        const upload = () =>
            verifyKnowledgeAudio(createFixtureAudio().bytes, 'audio/wav');
        it('isolates drafts and foreign IDs, publishes only saved media, revokes playback live', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const asset = await media.upload(owner, note.id, upload());
            await expect(
                media.upload(reader, note.id, upload()),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            const share = await store.issueShare(owner, note.id);
            const access = { kind: 'note' as const, ...share };
            await expect(
                media.read(note.id, asset.id, { access }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(
                (await media.read(note.id, asset.id, { ownerId: owner })).bytes
                    .length,
            ).toBeGreaterThan(0);
            const body = {
                schemaVersion: 2 as const,
                document: {
                    type: 'doc' as const,
                    content: [
                        {
                            type: 'learningBlock' as const,
                            attrs: {
                                block: {
                                    id: randomUUID(),
                                    type: 'audio' as const,
                                    assetId: asset.id,
                                },
                            },
                        },
                    ],
                },
            };
            const published = await store.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: note.version,
                content: { ...content, body },
            });
            expect(
                (await media.read(note.id, asset.id, { access })).mimeType,
            ).toBe('audio/wav');
            const other = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            await expect(
                store.update(owner, other.id, {
                    operationId: randomUUID(),
                    expectedVersion: other.version,
                    content: { ...content, body },
                }),
            ).rejects.toMatchObject({ code: 'invalid_request' });
            await store.revokeShare(owner, note.id);
            await expect(
                media.read(note.id, asset.id, { access }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(published.body.schemaVersion).toBe(2);
        });
        it('grants copied media independent ownership and deletes bytes only after the last copy disappears', async () => {
            const note = await store.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const asset = await media.upload(owner, note.id, upload());
            const saved = await store.update(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: note.version,
                content: {
                    ...content,
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'learningBlock',
                                    attrs: {
                                        block: {
                                            id: randomUUID(),
                                            type: 'audio',
                                            assetId: asset.id,
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            });
            const share = await store.issueShare(owner, note.id);
            const copy = await store.copyShared(
                reader,
                share.locator,
                share.key,
                { operationId: randomUUID(), expectedVersion: saved.version },
            );
            const copiedBlock = copy.body.document.content?.[0]?.attrs?.block;
            if (copiedBlock?.type !== 'audio')
                throw new Error('Missing copied audio');
            expect(copiedBlock.assetId).not.toBe(asset.id);
            await store.delete(owner, note.id, {
                operationId: randomUUID(),
                expectedVersion: saved.version,
            });
            expect(
                (
                    await media.read(copy.id, copiedBlock.assetId, {
                        ownerId: reader,
                    })
                ).bytes,
            ).toEqual(upload().bytes);
            expect(
                await db.select().from(knowledgeMediaAssetsTable),
            ).toHaveLength(1);
            expect(
                await db.select().from(knowledgeMediaBlobsTable),
            ).toHaveLength(1);
            await store.delete(reader, copy.id, {
                operationId: randomUUID(),
                expectedVersion: copy.version,
            });
            expect(
                await db.select().from(knowledgeMediaBlobsTable),
            ).toHaveLength(0);
        });
    },
);
