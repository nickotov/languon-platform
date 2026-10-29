import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { CopyKnowledgeBlocksRequest } from '@languon/contracts';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { createFixtureAudio } from '../../../../speech/domain/audio-integrity';
import { verifyKnowledgeAudio } from '../../media-audio-validation';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleKnowledgeMediaStore } from './media-store';
import { DrizzleKnowledgeBlockCopyStore } from './block-copy-store';
import { knowledgeMediaAssetsTable } from './media-schema';
import type { KnowledgeDatabase } from './knowledge-transaction';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Atomic partial learning-block copy',
    () => {
        let client: PostgresClient,
            db: KnowledgeDatabase,
            notes: DrizzleKnowledgeStore,
            media: DrizzleKnowledgeMediaStore,
            copy: DrizzleKnowledgeBlockCopyStore,
            owner: string,
            reader: string;
        const crypto = new KnowledgeShareCrypto(
            'knowledge-block-copy-test-secret',
        );
        const content = {
            title: 'Study',
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
                                { type: 'text' as const, text: 'Study.' },
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
            notes = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            media = new DrizzleKnowledgeMediaStore(db, crypto);
            copy = new DrizzleKnowledgeBlockCopyStore(db, crypto);
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
        it('previews dependency closure and copies hints/audio with fresh identities and independent lifetime', async () => {
            const source = await notes.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const audio = verifyKnowledgeAudio(
                createFixtureAudio().bytes,
                'audio/wav',
            );
            const asset = await media.upload(owner, source.id, audio);
            const audioId = randomUUID(),
                segmentId = randomUUID(),
                exerciseId = randomUUID();
            const saved = await notes.update(owner, source.id, {
                operationId: randomUUID(),
                expectedVersion: source.version,
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
                                            id: audioId,
                                            type: 'audio',
                                            assetId: asset.id,
                                            transcript: {
                                                language: 'en',
                                                segments: [
                                                    {
                                                        id: segmentId,
                                                        text: 'A train arrives.',
                                                    },
                                                ],
                                            },
                                        },
                                    },
                                },
                                {
                                    type: 'learningBlock',
                                    attrs: {
                                        block: {
                                            id: exerciseId,
                                            type: 'exercise',
                                            format: 'free-text',
                                            question: 'What arrives?',
                                            referenceAnswer: 'A train.',
                                            explanation:
                                                'The passage says a train arrives.',
                                            source: {
                                                blockId: audioId,
                                                segmentIds: [segmentId],
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            });
            const share = await notes.issueShare(owner, saved.id);
            const destination = await notes.create(reader, {
                operationId: randomUUID(),
                content,
            });
            const branch = (await notes.getWorkspace(reader, destination.id))
                .branches[0]!;
            const input: CopyKnowledgeBlocksRequest = {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedBranchVersion: branch.version,
                preview: true,
                source: {
                    kind: 'saved',
                    noteId: saved.id,
                    expectedVersion: saved.version,
                    access: { kind: 'note', ...share },
                },
                blockIds: [exerciseId],
            };
            expect(
                await copy.copy(reader, destination.id, input),
            ).toMatchObject({
                branch: null,
                selectedCount: 1,
                blockCount: 2,
                dependencyCount: 1,
                mediaCount: 1,
            });
            expect(
                await db.select().from(knowledgeMediaAssetsTable),
            ).toHaveLength(1);
            const applied = await copy.copy(reader, destination.id, {
                ...input,
                preview: false,
            });
            const copied =
                applied.branch!.content.body.document.content!.flatMap(
                    (node) => (node.attrs?.block ? [node.attrs.block] : []),
                );
            const copiedAudio = copied.find((block) => block.type === 'audio');
            const copiedExercise = copied.find(
                (block) => block.type === 'exercise',
            );
            if (
                copiedAudio?.type !== 'audio' ||
                copiedExercise?.type !== 'exercise'
            )
                throw new Error('Missing copied content');
            expect(copiedAudio.id).not.toBe(audioId);
            expect(copiedAudio.assetId).not.toBe(asset.id);
            expect(copiedExercise.source).toEqual({
                blockId: copiedAudio.id,
                segmentIds: [copiedAudio.transcript!.segments[0]!.id],
            });
            expect(
                (await notes.get(reader, destination.id)).body.schemaVersion,
            ).toBe(1);
            await notes.delete(owner, source.id, {
                operationId: randomUUID(),
                expectedVersion: saved.version,
            });
            expect(
                (
                    await media.read(destination.id, copiedAudio.assetId, {
                        ownerId: reader,
                    })
                ).bytes,
            ).toEqual(audio.bytes);
            expect(
                await copy.copy(reader, destination.id, {
                    ...input,
                    preview: false,
                }),
            ).toMatchObject({
                replayed: true,
                branch: { version: applied.branch!.version },
            });
            expect(
                await db.select().from(knowledgeMediaAssetsTable),
            ).toHaveLength(1);
        });
        it('rejects foreign working sources, missing blocks and stale destinations without changing the draft', async () => {
            const source = await notes.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const destination = await notes.create(reader, {
                operationId: randomUUID(),
                content,
            });
            const sourceBranch = (await notes.getWorkspace(owner, source.id))
                    .branches[0]!,
                branch = (await notes.getWorkspace(reader, destination.id))
                    .branches[0]!;
            const input: CopyKnowledgeBlocksRequest = {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedBranchVersion: branch.version,
                preview: false,
                source: {
                    kind: 'owned-working',
                    noteId: source.id,
                    branchId: sourceBranch.id,
                    expectedVersion: sourceBranch.version,
                },
                blockIds: [randomUUID()],
            };
            await expect(
                copy.copy(reader, destination.id, input),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            await expect(
                copy.copy(reader, destination.id, {
                    ...input,
                    source: {
                        kind: 'owned-working',
                        noteId: destination.id,
                        branchId: branch.id,
                        expectedVersion: branch.version,
                    },
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            await expect(
                copy.copy(reader, destination.id, {
                    ...input,
                    expectedBranchVersion: 99,
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            expect(
                (await notes.getWorkspace(reader, destination.id)).branches[0]!
                    .version,
            ).toBe(branch.version);
        });
    },
);
