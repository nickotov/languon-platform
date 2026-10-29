import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import {
    KnowledgeNoteContentSchema,
    type LearningBlock,
    type KnowledgeNoteContent,
} from '@languon/contracts';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleWorkbookStore } from './workbook-store';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { pinKnowledgeLearningSource } from './learning-source-binding';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import type { KnowledgeDatabase } from './knowledge-transaction';

const secret = 'synthetic-source-financial-fence-secret';
describe.runIf(isDatabaseIntegrationEnabled())(
    'Knowledge learning source SQL authority',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let knowledge: DrizzleKnowledgeStore;
        let workbooks: DrizzleWorkbookStore;
        let owner: string, reader: string;
        let text: Extract<LearningBlock, { type: 'bilingual-text' }>;
        let vocabulary: Extract<LearningBlock, { type: 'vocabulary' }>;
        const crypto = new KnowledgeShareCrypto(secret);
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            knowledge = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                crypto,
            );
            workbooks = new DrizzleWorkbookStore(db, crypto);
        }, 120_000);
        beforeEach(async () => {
            owner = randomUUID();
            reader = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
            text = {
                id: randomUUID(),
                type: 'bilingual-text',
                language: 'en',
                segments: [{ id: randomUUID(), text: 'The cat sleeps.' }],
                translations: [],
            };
            vocabulary = {
                id: randomUUID(),
                type: 'vocabulary',
                language: 'en',
                translationLanguage: 'ru',
                entries: [
                    { id: randomUUID(), term: 'cat', translation: 'кот' },
                ],
            };
        });
        afterAll(async () => client?.end());
        async function create() {
            const content = KnowledgeNoteContentSchema.parse({
                title: 'Saved source',
                summary: '',
                categories: [],
                studiedLanguage: 'en',
                explanationLanguage: 'ru',
                body: {
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: [
                            { type: 'learningBlock', attrs: { block: text } },
                            {
                                type: 'learningBlock',
                                attrs: { block: vocabulary },
                            },
                        ],
                    },
                },
            });
            const note = await knowledge.create(owner, {
                operationId: randomUUID(),
                content,
            });
            return { note, content };
        }
        async function pin(
            noteId: string,
            blockId: string,
            actor = owner,
            access?: LearnerSourceAccess,
        ) {
            return (
                await db.transaction((tx) =>
                    pinKnowledgeLearningSource(
                        tx,
                        crypto,
                        actor,
                        noteId,
                        blockId,
                        access,
                    ),
                )
            ).binding;
        }
        const assert = (
            binding: KnowledgeLearningSourceBinding,
            actor = binding.actorId,
        ) =>
            client`select languon_assert_knowledge_learning_binding(${JSON.stringify(binding)}::jsonb,${actor}::uuid)`;
        async function save(
            noteId: string,
            version: number,
            content: KnowledgeNoteContent,
        ) {
            return knowledge.update(owner, noteId, {
                operationId: randomUUID(),
                expectedVersion: version,
                content: KnowledgeNoteContentSchema.parse({
                    ...content,
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'learningBlock',
                                    attrs: { block: text },
                                },
                                {
                                    type: 'learningBlock',
                                    attrs: { block: vocabulary },
                                },
                            ],
                        },
                    },
                }),
            });
        }
        it('accepts owned saved material and rejects forged actor or source snapshots', async () => {
            const { note } = await create();
            const binding = await pin(note.id, text.id);
            await assert(binding);
            await expect(assert(binding, reader)).rejects.toThrow();
            await expect(
                assert({ ...binding, actorId: reader }, reader),
            ).rejects.toThrow();
            await expect(
                assert({
                    ...binding,
                    sourceSnapshot: {
                        type: 'bilingual-text',
                        language: 'en',
                        segments: [
                            {
                                id: text.segments[0]!.id,
                                text: 'Unrelated raw prompt',
                            },
                        ],
                    },
                }),
            ).rejects.toThrow();
        });
        it('preserves translation authority through prepared-translation edits and rejects changed original wording', async () => {
            const { note, content } = await create();
            const binding = await pin(note.id, text.id);
            text.translations = [
                {
                    language: 'ru',
                    segments: [
                        {
                            sourceSegmentId: text.segments[0]!.id,
                            text: 'Кот спит.',
                        },
                    ],
                },
            ];
            let current = await save(note.id, note.version, content);
            await assert(binding);
            text.segments[0]!.text = 'The dog sleeps.';
            current = await save(note.id, current.version, content);
            expect(current.version).toBe(3);
            await expect(assert(binding)).rejects.toThrow('material changed');
        });
        it('requires the exact live note grant and source-owner status', async () => {
            const { note } = await create();
            const share = await knowledge.issueShare(owner, note.id);
            const binding = await pin(note.id, text.id, reader, {
                kind: 'note',
                ...share,
            });
            await assert(binding);
            await knowledge.revokeShare(owner, note.id);
            await expect(assert(binding)).rejects.toThrow(
                'grant is unavailable',
            );
            const ownerBinding = await pin(note.id, text.id);
            await client`update users set status='disabled' where id=${owner}::uuid`;
            await expect(assert(ownerBinding)).rejects.toThrow();
        });
        it('ends workbook-derived authority when a member is removed without invalidating a separate note link', async () => {
            const { note } = await create();
            const workbook = await workbooks.create(owner, {
                id: randomUUID(),
                title: 'Ordered source',
            });
            const grouped = await workbooks.setNotes(owner, workbook.id, {
                expectedVersion: workbook.version,
                noteIds: [note.id],
                acknowledgeSharedAddition: false,
            });
            const share = await workbooks.issueShare(
                owner,
                workbook.id,
                grouped.version,
            );
            const workbookBinding = await pin(note.id, text.id, reader, {
                kind: 'workbook',
                ...share,
            });
            const noteShare = await knowledge.issueShare(owner, note.id);
            const noteBinding = await pin(note.id, text.id, reader, {
                kind: 'note',
                ...noteShare,
            });
            await assert(workbookBinding);
            await assert(noteBinding);
            await workbooks.setNotes(owner, workbook.id, {
                expectedVersion: grouped.version,
                noteIds: [],
                acknowledgeSharedAddition: false,
            });
            await expect(assert(workbookBinding)).rejects.toThrow(
                'membership is unavailable',
            );
            await assert(noteBinding);
        });
        it('rejects vocabulary ABA restoration and incomplete or duplicated entry epochs', async () => {
            const { note, content } = await create();
            const binding = await pin(note.id, vocabulary.id);
            await assert(binding);
            await expect(
                assert({ ...binding, learningVersions: [] }),
            ).rejects.toThrow();
            await expect(
                assert({
                    ...binding,
                    learningVersions: [
                        binding.learningVersions![0]!,
                        binding.learningVersions![0]!,
                    ],
                }),
            ).rejects.toThrow();
            vocabulary.entries[0]!.term = 'dog';
            let changed = await save(note.id, note.version, content);
            vocabulary.entries[0]!.term = 'cat';
            changed = await save(note.id, changed.version, content);
            expect(changed.version).toBe(3);
            await expect(assert(binding)).rejects.toThrow('epoch changed');
            await assert(await pin(note.id, vocabulary.id));
        });
    },
);
