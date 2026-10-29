import { AuthHttpPolicy } from '../../../../authentication/interface/http/auth-http-policy';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import {
    CopyKnowledgeTextRequestSchema,
    CopyKnowledgeVocabularyRequestSchema,
    KnowledgeNoteContentSchema,
    type LearningBlock,
} from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionaryCardRevisionsTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    textsTable,
    textRevisionsTable,
} from '../../../../texts/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { DrizzleKnowledgeStore } from './drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { createKnowledgeLibraryCopyComposition } from '../../library-copy-composition';
import type { KnowledgeLibraryCopyStore } from '../../../application/library-copy-store';
import type { KnowledgeDatabase } from './knowledge-transaction';
import { knowledgeNotesTable } from './schema';
import { createPreparedDictionaryLibraryPublication } from '../../../../dictionaries/infrastructure/prepared-library-publication';
import { readLibraryCopyBlock } from './library-copy-source';
import { vocabularyLibraryRows } from './library-copy-vocabulary';

const secret = 'knowledge-workbook-library-test-secret059';
const entryId = randomUUID();
const segmentId = randomUUID();
const vocabulary: LearningBlock = {
    id: randomUUID(),
    type: 'vocabulary',
    language: 'en',
    translationLanguage: 'ru',
    entries: [
        {
            id: entryId,
            term: 'cat',
            translation: 'кот',
            pronunciation: 'kæt',
            definition: 'A small animal.',
            example: 'A cat sleeps.',
            exampleTranslation: 'Кот спит.',
        },
    ],
};
const bilingual: LearningBlock = {
    id: randomUUID(),
    type: 'bilingual-text',
    language: 'en',
    segments: [{ id: segmentId, text: 'A cat sleeps.' }],
    translations: [
        {
            language: 'ru',
            segments: [{ sourceSegmentId: segmentId, text: 'Кот спит.' }],
        },
    ],
};
const signal = () => new AbortController().signal;

describe.runIf(isDatabaseIntegrationEnabled())(
    'Knowledge library atomic PostgreSQL publication',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let knowledge: DrizzleKnowledgeStore;
        let library: KnowledgeLibraryCopyStore;
        let owner: string;
        let reader: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            knowledge = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => {} },
                new KnowledgeShareCrypto(secret),
            );
            library = createKnowledgeLibraryCopyComposition({
                database: db,
                ids: { generate: randomUUID },
                clock: { now: () => new Date() },
                entropy: { randomBytes },
                dictionaryHmacSecret: secret,
                shareSecret: secret,
                authenticate: async () => ({ userId: owner }),
                rateLimiter: {
                    linkSubject: async () => {},
                    consume: async () => ({
                        allowed: true,
                        limit: 60,
                        remaining: 59,
                        retryAfterSeconds: 0,
                    }),
                },
                policy: new AuthHttpPolicy({
                    allowedOrigins: ['http://localhost:3000'],
                    appEnvironment: 'test',
                    refreshTokenTtlSeconds: 3600,
                }),
            }).store;
        }, 120_000);
        beforeEach(async () => {
            owner = randomUUID();
            reader = randomUUID();
            await db.insert(usersTable).values([
                { id: owner, status: 'active' },
                { id: reader, status: 'active' },
            ]);
        });
        afterAll(async () => client?.end(), 120_000);
        async function note(block: LearningBlock) {
            return knowledge.create(owner, {
                operationId: randomUUID(),
                content: KnowledgeNoteContentSchema.parse({
                    title: 'Library material',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'en',
                    explanationLanguage: 'ru',
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
        }
        const vocabRequest = (noteId: string, noteVersion: number) =>
            CopyKnowledgeVocabularyRequestSchema.parse({
                operationId: randomUUID(),
                noteId,
                noteVersion,
                blockId: vocabulary.id,
                entryIds: [entryId],
                destination: {
                    kind: 'new',
                    name: 'Copied words',
                    sourceLanguage: 'en',
                    targetLanguage: 'ru',
                },
            });
        const textRequest = (noteId: string, noteVersion: number) =>
            CopyKnowledgeTextRequestSchema.parse({
                operationId: randomUUID(),
                noteId,
                noteVersion,
                blockId: bilingual.id,
                translationLanguage: 'ru',
                destination: { kind: 'new', title: 'Copied text' },
            });
        async function working(block: LearningBlock) {
            const workspace = await knowledge.createDraft(owner, {
                operationId: randomUUID(),
            });
            const branch = workspace.branches[0]!;
            const content = {
                ...branch.content,
                title: 'Working library material',
                body: {
                    schemaVersion: 2 as const,
                    document: {
                        type: 'doc' as const,
                        content: [
                            {
                                type: 'learningBlock' as const,
                                attrs: { block },
                            },
                        ],
                    },
                },
            };
            const updated = await knowledge.updateWorking(
                owner,
                workspace.noteId,
                {
                    operationId: randomUUID(),
                    branchId: branch.id,
                    expectedVersion: branch.version,
                    content,
                },
            );
            return {
                noteId: workspace.noteId,
                branch: updated.branch,
                workingSource: {
                    branchId: branch.id,
                    expectedVersion: updated.branch.version,
                },
            };
        }
        it('copies prepared vocabulary from an unpublished owned working branch without publishing it', async () => {
            const draft = await working(vocabulary);
            const request = CopyKnowledgeVocabularyRequestSchema.parse({
                ...vocabRequest(draft.noteId, 1),
                noteVersion: undefined,
                workingSource: draft.workingSource,
            });
            expect(
                (await library.previewVocabulary(owner, request, signal()))
                    .entries[0]?.pronunciation,
            ).toBe('kæt');
            const copied = await library.copyVocabulary(
                owner,
                request,
                signal(),
            );
            const [noteRow] = await db
                .select()
                .from(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, draft.noteId));
            expect(noteRow?.status).toBe('draft');
            expect(noteRow?.version).toBe(0);
            expect(JSON.stringify(noteRow?.body)).not.toContain('cat');
            const [card] = await db
                .select()
                .from(dictionaryCardsTable)
                .where(
                    eq(dictionaryCardsTable.dictionaryId, copied.dictionary.id),
                );
            expect(card).toMatchObject({
                source: 'cat',
                translation: 'кот',
                definition: 'A small animal.',
                transcription: 'kæt',
            });
            await db
                .delete(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, draft.noteId));
            expect(
                (await library.copyVocabulary(owner, request, signal()))
                    .dictionary.id,
            ).toBe(copied.dictionary.id);
        });
        it('previews and creates or appends aligned Text from an unpublished working text block', async () => {
            const draft = await working(bilingual);
            const request = CopyKnowledgeTextRequestSchema.parse({
                ...textRequest(draft.noteId, 1),
                noteVersion: undefined,
                workingSource: draft.workingSource,
            });
            const preview = await library.previewText(owner, request, signal());
            expect(preview.text.sourceText).toBe('A cat sleeps.');
            expect(preview.text.alignment?.translation[0]?.text).toBe(
                'Кот спит.',
            );
            const created = await library.copyText(owner, request, signal());
            const append = {
                ...request,
                operationId: randomUUID(),
                destination: {
                    kind: 'existing' as const,
                    textId: created.id,
                    expectedVersion: created.version,
                },
            };
            expect(
                (await library.previewText(owner, append, signal())).text
                    .sourceText,
            ).toBe('A cat sleeps.\n\nA cat sleeps.');
            const copied = await library.copyText(owner, append, signal());
            expect(copied.sourceText).toBe('A cat sleeps.\n\nA cat sleeps.');
            expect(copied.alignment?.source).toHaveLength(2);
            const [noteRow] = await db
                .select()
                .from(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, draft.noteId));
            expect(noteRow?.status).toBe('draft');
            expect(noteRow?.version).toBe(0);
        });
        it('rejects stale and foreign working snapshots atomically while retaining completed independent copies', async () => {
            const draft = await working(vocabulary);
            const request = CopyKnowledgeVocabularyRequestSchema.parse({
                ...vocabRequest(draft.noteId, 1),
                noteVersion: undefined,
                workingSource: draft.workingSource,
            });
            await library.previewVocabulary(owner, request, signal());
            await expect(
                library.copyVocabulary(reader, request, signal()),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            await expect(
                library.copyVocabulary(owner, request, signal(), {
                    kind: 'note',
                    locator: 'a'.repeat(32),
                    key: 'b'.repeat(43),
                }),
            ).rejects.toMatchObject({ code: 'invalid_request' });
            await knowledge.updateWorking(owner, draft.noteId, {
                operationId: randomUUID(),
                branchId: draft.branch.id,
                expectedVersion: draft.branch.version,
                content: {
                    ...draft.branch.content,
                    title: 'A later private edit',
                },
            });
            await expect(
                library.copyVocabulary(owner, request, signal()),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            expect(
                await db
                    .select()
                    .from(dictionariesTable)
                    .where(eq(dictionariesTable.ownerId, owner)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(textsTable)
                    .where(eq(textsTable.ownerId, owner)),
            ).toHaveLength(0);
        });
        it('atomically retains prepared fields, revision and independent replay after original deletion', async () => {
            const source = await note(vocabulary);
            const request = vocabRequest(source.id, source.version);
            const preview = await library.previewVocabulary(
                owner,
                request,
                signal(),
            );
            expect(preview.entries[0]?.pronunciation).toBe('kæt');
            expect(preview.entries[0]?.definition).toBe('A small animal.');
            const result = await library.copyVocabulary(
                owner,
                request,
                signal(),
            );
            const [card] = await db
                .select()
                .from(dictionaryCardsTable)
                .where(
                    eq(dictionaryCardsTable.dictionaryId, result.dictionary.id),
                );
            expect(card).toMatchObject({
                source: 'cat',
                translation: 'кот',
                transcription: 'kæt',
                definition: 'A small animal.',
                example: 'A cat sleeps.',
                exampleTranslation: 'Кот спит.',
            });
            const revisions = await db
                .select()
                .from(dictionaryCardRevisionsTable)
                .where(
                    eq(
                        dictionaryCardRevisionsTable.dictionaryId,
                        result.dictionary.id,
                    ),
                );
            expect(revisions).toHaveLength(1);
            await db
                .delete(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, source.id));
            const replay = await library.copyVocabulary(
                owner,
                request,
                signal(),
            );
            expect(replay.dictionary.id).toBe(result.dictionary.id);
            expect(
                await db
                    .select()
                    .from(dictionaryCardsTable)
                    .where(
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            result.dictionary.id,
                        ),
                    ),
            ).toHaveLength(1);
        });
        it('rolls back new dictionaries/settings on language or stale source conflicts', async () => {
            const source = await note(vocabulary);
            const request = vocabRequest(source.id, source.version);
            await expect(
                library.copyVocabulary(
                    owner,
                    { ...request, noteVersion: source.version + 1 },
                    signal(),
                ),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            if (request.destination.kind !== 'new') throw new Error('fixture');
            await expect(
                library.copyVocabulary(
                    owner,
                    {
                        ...request,
                        destination: {
                            ...request.destination,
                            sourceLanguage: 'es',
                        },
                    },
                    signal(),
                ),
            ).rejects.toThrow();
            expect(
                await db
                    .select()
                    .from(dictionariesTable)
                    .where(eq(dictionariesTable.ownerId, owner)),
            ).toHaveLength(0);
        });
        it('rechecks shared source access before collection but retains completed copies', async () => {
            const source = await note(vocabulary);
            const share = await knowledge.issueShare(owner, source.id);
            const proof = {
                kind: 'note' as const,
                locator: share.locator,
                key: share.key,
            };
            const request = vocabRequest(source.id, source.version);
            const copied = await library.copyVocabulary(
                reader,
                request,
                signal(),
                proof,
            );
            await knowledge.revokeShare(owner, source.id);
            expect(
                (await library.copyVocabulary(reader, request, signal(), proof))
                    .dictionary.id,
            ).toBe(copied.dictionary.id);
            await expect(
                library.copyVocabulary(
                    reader,
                    { ...request, operationId: randomUUID() },
                    signal(),
                    proof,
                ),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(
                await db
                    .select()
                    .from(dictionariesTable)
                    .where(eq(dictionariesTable.ownerId, reader)),
            ).toHaveLength(1);
        });
        it('holds the source lock through destination publication so revocation cannot interleave', async () => {
            const source = await note(vocabulary);
            const share = await knowledge.issueShare(owner, source.id);
            const request = vocabRequest(source.id, source.version);
            const proof = {
                kind: 'note' as const,
                locator: share.locator,
                key: share.key,
            };
            const publication = createPreparedDictionaryLibraryPublication({
                database: db,
                ids: { generate: randomUUID },
                dictionaryHmacSecret: secret,
                entropy: { randomBytes },
            });
            let locked!: () => void;
            let release!: () => void;
            const held = new Promise<void>((resolve) => {
                locked = resolve;
            });
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            const pending = publication.publish(
                {
                    context: { now: new Date(), signal: signal() },
                    ownerId: reader,
                    idempotencyKey: request.operationId,
                    fingerprint: 'source-lock-test',
                    target: request.destination,
                },
                async (tx) => {
                    const block = await readLibraryCopyBlock(
                        tx,
                        new KnowledgeShareCrypto(secret),
                        reader,
                        request,
                        proof,
                    );
                    const prepared = vocabularyLibraryRows(
                        block,
                        request.entryIds,
                    );
                    locked();
                    await gate;
                    return prepared;
                },
            );
            await Promise.race([
                held,
                pending.then(() => {
                    throw new Error(
                        'Publication completed before the source lock observation.',
                    );
                }),
            ]);
            try {
                await expect(
                    db.execute(
                        sql`select id from knowledge_notes where id = ${source.id} for update nowait`,
                    ),
                ).rejects.toThrow();
            } finally {
                release();
            }
            const copied = await pending;
            await knowledge.revokeShare(owner, source.id);
            expect(
                await db
                    .select()
                    .from(dictionaryCardsTable)
                    .where(
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            copied.dictionary.id,
                        ),
                    ),
            ).toHaveLength(1);
        });
        it('copies bilingual text with new identities and atomically appends while preserving manual pairs', async () => {
            if (bilingual.type !== 'bilingual-text') throw new Error('fixture');
            const secondId = randomUUID();
            const source = await note({
                ...bilingual,
                segments: [
                    ...bilingual.segments,
                    { id: secondId, text: 'A dog runs.' },
                ],
                translations: [
                    {
                        language: 'ru',
                        segments: [
                            ...bilingual.translations[0]!.segments,
                            {
                                sourceSegmentId: secondId,
                                text: 'Собака бежит.',
                            },
                        ],
                    },
                ],
            });
            const request = textRequest(source.id, source.version);
            const created = await library.copyText(owner, request, signal());
            expect(created.sourceText).toBe('A cat sleeps.\n\nA dog runs.');
            expect(
                created.alignment?.translation
                    .map((pair) => pair.text)
                    .join(''),
            ).toBe('Кот спит.\n\nСобака бежит.');
            expect(created.alignment?.source[1]).toMatchObject({
                startOffset: 13,
                endOffset: 26,
                paragraphIndex: 1,
            });
            expect(created.alignment?.source[0]?.pairId).not.toBe(segmentId);
            const oldPair = created.alignment!.source[0]!;
            const appendedRequest = CopyKnowledgeTextRequestSchema.parse({
                ...request,
                operationId: randomUUID(),
                destination: {
                    kind: 'existing',
                    textId: created.id,
                    expectedVersion: created.version,
                },
            });
            const preview = await library.previewText(
                owner,
                appendedRequest,
                signal(),
            );
            expect(preview.text.sourceText).toBe(
                'A cat sleeps.\n\nA dog runs.\n\nA cat sleeps.\n\nA dog runs.',
            );
            const appended = await library.copyText(
                owner,
                appendedRequest,
                signal(),
            );
            expect(appended.alignment?.source).toHaveLength(4);
            expect(appended.alignment?.source[0]).toEqual(oldPair);
            expect(appended.alignment?.source[2]?.pairId).not.toBe(
                oldPair.pairId,
            );
            expect(appended.alignment?.translation[0]?.text).toBe('Кот спит.');
            expect(
                (await library.copyText(owner, appendedRequest, signal()))
                    .version,
            ).toBe(appended.version);
            await expect(
                library.copyText(
                    owner,
                    { ...appendedRequest, operationId: randomUUID() },
                    signal(),
                ),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            const [persisted] = await db
                .select()
                .from(textsTable)
                .where(eq(textsTable.id, created.id));
            expect(persisted?.version).toBe(appended.version);
            expect(persisted?.alignment?.source).toHaveLength(4);
            expect(
                await db
                    .select()
                    .from(textRevisionsTable)
                    .where(eq(textRevisionsTable.textId, created.id)),
            ).toHaveLength(2);
        });
        it('copies and appends untranslated source as drafts without inventing translations', async () => {
            if (bilingual.type !== 'bilingual-text') throw new Error('fixture');
            const source = await note({ ...bilingual, translations: [] });
            const request = textRequest(source.id, source.version);
            const preview = await library.previewText(owner, request, signal());
            expect(preview.text.alignment).toBeNull();
            expect(preview.text.sourceText).toBe('A cat sleeps.');
            const copied = await library.copyText(owner, request, signal());
            expect(copied.status).toBe('draft');
            expect(copied.alignment).toBeNull();
            const appended = await library.copyText(
                owner,
                {
                    ...request,
                    operationId: randomUUID(),
                    destination: {
                        kind: 'existing',
                        textId: copied.id,
                        expectedVersion: copied.version,
                    },
                },
                signal(),
            );
            expect(appended.sourceText).toBe('A cat sleeps.\n\nA cat sleeps.');
            expect(appended.status).toBe('draft');
            expect(appended.alignment).toBeNull();
        });
        it('refuses another learner destination and idempotency key substitution', async () => {
            const source = await note(bilingual);
            const request = textRequest(source.id, source.version);
            const target = await library.copyText(owner, request, signal());
            const shared = await knowledge.issueShare(owner, source.id);
            await expect(
                library.copyText(
                    reader,
                    {
                        ...request,
                        operationId: randomUUID(),
                        destination: {
                            kind: 'existing',
                            textId: target.id,
                            expectedVersion: target.version,
                        },
                    },
                    signal(),
                    { kind: 'note', locator: shared.locator, key: shared.key },
                ),
            ).rejects.toThrow();
            await expect(
                library.copyText(
                    owner,
                    {
                        ...request,
                        destination: { kind: 'new', title: 'Different' },
                    },
                    signal(),
                ),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
            expect(
                await db
                    .select()
                    .from(textsTable)
                    .where(
                        and(
                            eq(textsTable.ownerId, owner),
                            eq(textsTable.id, target.id),
                        ),
                    ),
            ).toHaveLength(1);
        });
    },
);
