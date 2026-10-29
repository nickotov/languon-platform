import { knowledgeNotesTable } from './schema';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import {
    KnowledgeNoteContentSchema,
    type LearningBlock,
} from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
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
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { DrizzleKnowledgePrivateTranslationStore } from './private-translation-store';
import { knowledgePrivateTranslationsTable as overlays } from './private-translation-schema';
import {
    knowledgeLearningSourceFingerprint,
    knowledgeLearningSourceSnapshot,
    pinKnowledgeLearningSource,
    readPinnedKnowledgeLearningSource,
} from './learning-source-binding';
import type { KnowledgeDatabase } from './knowledge-transaction';
import { createTextLibraryPublisher } from './library-copy-text';
import { createTextLibraryPublication } from '../../../../texts/infrastructure/text-library-publication';
import { textsTable } from '../../../../texts/infrastructure/persistence/drizzle/schema';
import { eraseOwnerKnowledge } from './knowledge-deletion-participant';

const signal = () => new AbortController().signal;
describe.runIf(isDatabaseIntegrationEnabled())(
    'Private translation source/actor PostgreSQL isolation',
    () => {
        let client: PostgresClient,
            db: KnowledgeDatabase,
            notes: DrizzleKnowledgeStore,
            store: DrizzleKnowledgePrivateTranslationStore;
        let author: string,
            reader: string,
            other: string,
            noteId: string,
            block: Extract<LearningBlock, { type: 'bilingual-text' }>;
        const crypto = new KnowledgeShareCrypto(
            'synthetic-private-translation-secret',
        );
        const jobs = {
            enqueueKnowledgeTranslation: vi.fn(),
            get: vi.fn(),
            cancel: vi.fn(),
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
            store = new DrizzleKnowledgePrivateTranslationStore({
                database: db,
                crypto,
                jobs,
                enabled: true,
            });
        }, 120_000);
        beforeEach(async () => {
            author = randomUUID();
            reader = randomUUID();
            other = randomUUID();
            await db.insert(usersTable).values(
                [author, reader, other].map((id) => ({
                    id,
                    status: 'active' as const,
                })),
            );
            block = {
                id: randomUUID(),
                type: 'bilingual-text',
                language: 'en',
                segments: [{ id: randomUUID(), text: 'Hello world.' }],
                translations: [],
            };
            const note = await notes.create(author, {
                operationId: randomUUID(),
                content: KnowledgeNoteContentSchema.parse({
                    title: 'Private translation material',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'en',
                    explanationLanguage: 'fr',
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                { type: 'learningBlock', attrs: { block } },
                            ],
                        },
                    },
                }),
            });
            noteId = note.id;
            jobs.enqueueKnowledgeTranslation.mockReset();
        });
        afterAll(async () => client?.end());
        async function shared() {
            return {
                kind: 'note' as const,
                ...(await notes.issueShare(author, noteId)),
            };
        }
        async function overlay(actorId = reader) {
            const row = {
                actorId,
                noteId,
                blockId: block.id,
                sourceFingerprint: knowledgeLearningSourceFingerprint(
                    knowledgeLearningSourceSnapshot(block),
                ),
                targetLanguage: 'fr',
                segments: [
                    {
                        sourceSegmentId: block.segments[0]!.id,
                        text: 'Bonjour le monde.',
                    },
                ],
                updatedAt: new Date(),
            };
            await db.insert(overlays).values(row);
            return row;
        }
        it('preserves rendered passage boundaries in admitted source and contiguous model segment offsets', async () => {
            block = {
                ...block,
                segments: [
                    ...block.segments,
                    { id: randomUUID(), text: 'Second paragraph.' },
                ],
            };
            await db
                .update(knowledgeNotesTable)
                .set({
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                { type: 'learningBlock', attrs: { block } },
                            ],
                        },
                    },
                })
                .where(eq(knowledgeNotesTable.id, noteId));
            jobs.enqueueKnowledgeTranslation.mockResolvedValue({
                id: randomUUID(),
            });
            const beforeAdmission = vi.fn(async () => {});
            await store.request(
                { actorId: author, noteId, blockId: block.id },
                { operationId: randomUUID(), targetLanguage: 'fr' },
                signal(),
                beforeAdmission,
            );
            const [, input, segments, binding] =
                jobs.enqueueKnowledgeTranslation.mock.calls[0]!;
            expect(input.sourceText).toBe('Hello world.\n\nSecond paragraph.');
            expect(segments).toEqual([
                {
                    pairId: block.segments[0]!.id,
                    text: 'Hello world.',
                    startOffset: 0,
                    endOffset: 12,
                    paragraphIndex: 0,
                },
                {
                    pairId: block.segments[1]!.id,
                    text: '\n\nSecond paragraph.',
                    startOffset: 12,
                    endOffset: 31,
                    paragraphIndex: 1,
                },
            ]);
            expect(binding.sourceSnapshot.segments).toEqual(block.segments);
            expect(beforeAdmission).toHaveBeenCalledOnce();
        });
        it('rejects an author-prepared target before consuming burst admission or creating a paid job', async () => {
            block = {
                ...block,
                translations: [
                    {
                        language: 'fr',
                        segments: [
                            {
                                sourceSegmentId: block.segments[0]!.id,
                                text: 'Bonjour.',
                            },
                        ],
                    },
                ],
            };
            await db
                .update(knowledgeNotesTable)
                .set({
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                { type: 'learningBlock', attrs: { block } },
                            ],
                        },
                    },
                })
                .where(eq(knowledgeNotesTable.id, noteId));
            const beforeAdmission = vi.fn(async () => {});
            await expect(
                store.request(
                    { actorId: author, noteId, blockId: block.id },
                    { operationId: randomUUID(), targetLanguage: 'fr' },
                    signal(),
                    beforeAdmission,
                ),
            ).rejects.toMatchObject({ code: 'invalid_request' });
            expect(beforeAdmission).not.toHaveBeenCalled();
            expect(jobs.enqueueKnowledgeTranslation).not.toHaveBeenCalled();
        });
        it('isolates actor overlays, hides stale source fingerprints, and denies revoked grants', async () => {
            const access = await shared();
            await overlay();
            const source = {
                actorId: reader,
                noteId,
                blockId: block.id,
                access,
            };
            expect((await store.list(source)).translations).toHaveLength(1);
            expect(
                (await store.list({ ...source, actorId: other })).translations,
            ).toEqual([]);
            expect(
                (
                    await store.list({
                        actorId: author,
                        noteId,
                        blockId: block.id,
                    })
                ).translations,
            ).toEqual([]);
            await db
                .update(overlays)
                .set({ sourceFingerprint: '0'.repeat(64) })
                .where(eq(overlays.noteId, noteId));
            expect((await store.list(source)).translations).toEqual([]);
            await notes.revokeShare(author, noteId);
            await expect(store.list(source)).rejects.toMatchObject({
                code: 'knowledge_not_found',
            });
        });
        it('pins verified source text/segment identity and bills the requester without accepting authored substitutions', async () => {
            const access = await shared();
            jobs.enqueueKnowledgeTranslation.mockResolvedValue({
                id: randomUUID(),
            });
            await store.request(
                { actorId: reader, noteId, blockId: block.id, access },
                { operationId: randomUUID(), targetLanguage: 'fr' },
                signal(),
            );
            const [actor, input, segments, binding] =
                jobs.enqueueKnowledgeTranslation.mock.calls[0]!;
            expect(actor).toBe(reader);
            expect(input).toMatchObject({
                sourceText: 'Hello world.',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
                folderId: null,
            });
            expect(segments[0].pairId).toBe(block.segments[0]!.id);
            expect(binding).toMatchObject({
                actorId: reader,
                noteOwnerId: author,
                noteId,
                blockId: block.id,
            });
            expect(JSON.stringify(binding)).not.toContain(access.key);
            await notes.revokeShare(author, noteId);
            await expect(
                db.transaction((tx) =>
                    readPinnedKnowledgeLearningSource(tx, binding),
                ),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
        });
        it('rejects disabled generation and changed source before contacting the job engine', async () => {
            const disabled = new DrizzleKnowledgePrivateTranslationStore({
                database: db,
                crypto,
                jobs,
            });
            await expect(
                disabled.request(
                    { actorId: author, noteId, blockId: block.id },
                    { operationId: randomUUID(), targetLanguage: 'fr' },
                    signal(),
                ),
            ).rejects.toMatchObject({ code: 'service_unavailable' });
            const pinned = await db.transaction((tx) =>
                pinKnowledgeLearningSource(
                    tx,
                    crypto,
                    author,
                    noteId,
                    block.id,
                ),
            );
            const wrong = {
                ...pinned.binding,
                sourceFingerprint: '0'.repeat(64),
            };
            await expect(
                db.transaction((tx) =>
                    readPinnedKnowledgeLearningSource(tx, wrong),
                ),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            expect(jobs.enqueueKnowledgeTranslation).not.toHaveBeenCalled();
        });
        it('pins the selected private translation through preview/publication and keeps the saved Text independent', async () => {
            const access = await shared();
            const row = await overlay();
            const publication = createTextLibraryPublisher(
                createTextLibraryPublication({
                    database: db,
                    ids: { generate: randomUUID },
                    clock: { now: () => new Date() },
                    dictionaryHmacSecret: 'synthetic-private-library-secret',
                    entropy: { randomBytes },
                }),
                crypto,
            );
            const request = {
                operationId: randomUUID(),
                noteId,
                noteVersion: 1,
                blockId: block.id,
                translationLanguage: 'fr' as const,
                privateTranslation: {
                    sourceFingerprint: row.sourceFingerprint,
                    updatedAt: row.updatedAt.toISOString(),
                },
                destination: {
                    kind: 'new' as const,
                    title: 'Independent private copy',
                },
            };
            const preview = await publication.preview(
                reader,
                request,
                signal(),
                access,
            );
            expect(preview.text.alignment?.translation[0]?.text).toBe(
                'Bonjour le monde.',
            );
            await db
                .update(overlays)
                .set({
                    updatedAt: new Date(row.updatedAt.getTime() + 1000),
                    segments: [
                        {
                            sourceSegmentId: block.segments[0]!.id,
                            text: 'Changed',
                        },
                    ],
                })
                .where(eq(overlays.noteId, noteId));
            await expect(
                publication.copy(reader, request, signal(), access),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            expect(
                await db
                    .select()
                    .from(textsTable)
                    .where(eq(textsTable.ownerId, reader)),
            ).toHaveLength(0);
            await db
                .update(overlays)
                .set({ updatedAt: row.updatedAt, segments: row.segments })
                .where(eq(overlays.noteId, noteId));
            const copied = await publication.copy(
                reader,
                request,
                signal(),
                access,
            );
            await db.transaction((tx) => eraseOwnerKnowledge(tx, author));
            expect(
                await db
                    .select()
                    .from(overlays)
                    .where(eq(overlays.noteId, noteId)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(textsTable)
                    .where(
                        and(
                            eq(textsTable.id, copied.id),
                            eq(textsTable.ownerId, reader),
                        ),
                    ),
            ).toHaveLength(1);
        });
        it('erases an actor private overlays on another owner source without deleting its content', async () => {
            await overlay();
            await overlay(other);
            await db.transaction((tx) => eraseOwnerKnowledge(tx, reader));
            expect(
                await db
                    .select()
                    .from(overlays)
                    .where(eq(overlays.actorId, reader)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(overlays)
                    .where(eq(overlays.actorId, other)),
            ).toHaveLength(1);
            expect((await notes.get(author, noteId)).id).toBe(noteId);
        });
    },
);
