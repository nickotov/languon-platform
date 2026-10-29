import { DrizzleWorkbookStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/workbook-store';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import {
    ChatPreferencesSchema,
    ConversationDetailSchema,
    ConversationEventSchema,
    SubmitConversationTurnRequestSchema,
    type KnowledgeNoteContent,
} from '@languon/contracts';
import {
    beforeAll,
    afterAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    DrizzleConversationStore,
    type ConversationPersistenceDependencies,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { DrizzleKnowledgeTransactionParticipant } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { HmacDictionaryCryptography } from '../../../../src/modules/dictionaries/infrastructure/crypto/dictionary-cryptography';
import { ConversationWorkerService } from '../../../../src/modules/conversations/application/conversation-worker-service';
import { DrizzleAccountDeletionStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-deletion-store';
import { DrizzleAccountPurgeStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import { lockTextAiCapacity } from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import { eraseConversationContent } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
    getTestDatabaseUrl,
} from '../../support/test-database';

const content: KnowledgeNoteContent = {
    title: 'Ser and estar',
    summary: 'Two ways to express being.',
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
                    content: [
                        { type: 'text', text: 'Ser describes identity.' },
                    ],
                },
            ],
        },
    },
};
const cryptography = new HmacDictionaryCryptography({
    secret: 'disposable-fixture-secret-32-characters',
    entropy: { randomBytes: (length) => new Uint8Array(length) },
});
const workspaceContext = (
    content: string,
    from = content.length,
    to = from,
) => ({
    content,
    editorTarget: {
        from,
        to,
        originalText: content.slice(from, to),
        documentHash: createHash('sha256').update(content).digest('hex'),
    },
});
function latch() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}
async function completes<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new Error(
                                'An unrelated operation was blocked by an authorized read.',
                            ),
                        ),
                    5000,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
describe.runIf(isDatabaseIntegrationEnabled())(
    'durable conversation store',
    { timeout: 30_000 },
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let store: DrizzleConversationStore;
        let dependencies: ConversationPersistenceDependencies;
        let sources: ConversationSourceResolver;
        let portraitPolicy: { enabled: boolean; portrait: unknown | null };
        let owner: string,
            learner: string,
            dictionary: string,
            card: string,
            clock: Date;
        const admitted = vi.fn(async () => ({
            snapshot: { modelId: 'deepseek-flash' },
        }));
        const interrupted = vi.fn(async () => {});
        let beforePublish: (() => Promise<void>) | undefined;
        const access = () => ({ ownerId: owner });
        const submit = (text = 'Explain ser') =>
            SubmitConversationTurnRequestSchema.parse({
                requestId: randomUUID(),
                content: text,
            });
        const create = () =>
            store.create(access(), {
                source: { kind: 'dictionary', id: dictionary },
            });
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 120_000);
        afterAll(async () => {
            await client?.end();
        }, 30_000);
        beforeEach(async () => {
            await client`truncate conversation_provider_calls, dictionary_generation_provider_usage_archive, conversation_chats, dictionaries, text_folders, knowledge_notes, knowledge_operation_receipts, conversation_settings, text_ai_capacity_jobs, text_ai_capacity_queue_totals, text_ai_capacity_provider_usage, text_ai_capacity_active_totals, text_ai_capacity_settled_buckets cascade`;
            owner = randomUUID();
            learner = randomUUID();
            dictionary = randomUUID();
            card = randomUUID();
            clock = new Date();
            admitted.mockClear();
            interrupted.mockClear();
            beforePublish = undefined;
            portraitPolicy = { enabled: false, portrait: null };
            await client`insert into users(id,status) values (${owner},'active'),(${learner},'active')`;
            await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag,created_at,updated_at) values (${dictionary},${owner},'Spanish verbs','es','en',${clock.toISOString()},${clock.toISOString()})`;
            await client`insert into dictionary_settings(dictionary_id,definition_enabled,transcription_enabled) values (${dictionary},true,false)`;
            await client`insert into dictionary_cards(id,dictionary_id,authorship,source,normalized_source,translation,definition,transcription,example,example_translation,translation_context,sort_key) values (${card},${dictionary},'human','ser','ser','to be','identity','PRIVATE HIDDEN','Soy médico.','I am a doctor.','PRIVATE AUTHORING',1)`;
            sources = new ConversationSourceResolver({
                verifyDictionaryShare: (key, digest) =>
                    cryptography.verifyShare(key, digest),
                verifyTextShare: (key, digest) =>
                    cryptography.verifyShare(key, digest),
                verifyKnowledgeShare: (key, digest) =>
                    new KnowledgeShareCrypto(
                        'conversation-knowledge-test-secret-47',
                    ).verify(key, digest),
                readNote: (tx, actor, id) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).getForSource(
                        actor,
                        id,
                    ),
            });
            dependencies = {
                database: db,
                readPortrait: async () => portraitPolicy,
                now: () => clock,
                admitTurn: admitted,
                settleInterrupted: interrupted,
                sources,
                nameUntitledNote: (tx, actor, noteId, title) =>
                    new DrizzleKnowledgeTransactionParticipant(
                        tx,
                    ).nameUntitledFromFirstMessage(actor, noteId, title),
                publishNote: async (tx, actor, input) => {
                    await beforePublish?.();
                    return new DrizzleKnowledgeTransactionParticipant(
                        tx,
                    ).publish(actor, input, clock);
                },
            };
            store = new DrizzleConversationStore(dependencies);
        }, 120_000);
        it.each(['knowledge', 'workbook'] as const)(
            'uses saved shared %s content with private read-only AI and live revocation',
            async (shareKind) => {
                const crypto = new KnowledgeShareCrypto(
                    'conversation-knowledge-test-secret-47',
                );
                const knowledge = new DrizzleKnowledgeStore(
                    db,
                    { beforeNoteDeletion: async () => undefined },
                    crypto,
                );
                const note = await knowledge.create(owner, {
                    operationId: randomUUID(),
                    content,
                });
                const workbooks = new DrizzleWorkbookStore(db, crypto);
                const workbook = await workbooks.create(owner, {
                    id: randomUUID(),
                    title: 'Shared workbook',
                });
                await workbooks.setNotes(owner, workbook.id, {
                    expectedVersion: 1,
                    noteIds: [note.id],
                    acknowledgeSharedAddition: false,
                });
                const proof =
                    shareKind === 'knowledge'
                        ? await knowledge.issueShare(owner, note.id)
                        : await workbooks.issueShare(owner, workbook.id, 2);
                const readerAccess = { ownerId: learner, shareKey: proof.key };
                const chat = await store.create(readerAccess, {
                    source: {
                        kind: 'knowledge',
                        id: note.id,
                        shareKind,
                        shareLocator: proof.locator,
                    },
                });
                await expect(
                    store.detail(access(), chat.id),
                ).rejects.toMatchObject({ code: 'conversation_not_found' });
                await expect(
                    store.submit(readerAccess, chat.id, {
                        ...submit(),
                        editorContext: workspaceContext('Forged owner draft'),
                    }),
                ).rejects.toMatchObject({ code: 'invalid_editor_context' });
                await expect(
                    store.submit(readerAccess, chat.id, {
                        ...submit(),
                        draftContext: { content: 'Forged source' },
                    }),
                ).rejects.toThrow();
                await store.submit(
                    readerAccess,
                    chat.id,
                    submit('Explain this shared rule'),
                );
                const turn = (await store.claim())!;
                expect(turn.ownerId).toBe(learner);
                expect(turn.authority.share?.id).toBe(
                    `${shareKind}:${shareKind === 'knowledge' ? note.id : workbook.id}`,
                );
                expect(JSON.stringify(turn.sourceSnapshot)).toContain(
                    'Ser describes identity',
                );
                expect(JSON.stringify(turn.authority)).not.toContain(proof.key);
                await expect(
                    store.propose(turn, content, {
                        noteId: note.id,
                        version: note.version,
                    }),
                ).rejects.toThrow('Shared conversations cannot propose');
                const worker = new ConversationWorkerService({
                    store,
                    createRunner: () => ({
                        run: async (input) => {
                            expect(input.readOnlySource).toBe(true);
                            await expect(
                                input.onDraft(content),
                            ).rejects.toThrow(
                                'Shared conversations cannot propose',
                            );
                            await input.onDelta({
                                messageId: 'ignored',
                                text: 'Explanation only.',
                            });
                            return { text: 'Explanation only.' };
                        },
                    }),
                });
                // Existing claim is already fenced; finish it before the worker claims a new turn.
                await store.finish(turn, 'succeeded');
                await store.submit(
                    readerAccess,
                    chat.id,
                    submit('Another explanation'),
                );
                expect(
                    await worker.processNext(new AbortController().signal),
                ).toBe(true);
                const detail = await store.detail(readerAccess, chat.id);
                expect(detail.drafts).toHaveLength(0);
                await store.submit(
                    readerAccess,
                    chat.id,
                    submit('Queued before revocation'),
                );
                const queued = (await store.claim())!;
                if (shareKind === 'knowledge')
                    await knowledge.revokeShare(owner, note.id);
                else await workbooks.revokeShare(owner, workbook.id, 2);
                await expect(
                    store.append(queued, 'Must not publish'),
                ).rejects.toMatchObject({ code: 'conversation_not_found' });
                await expect(
                    store.detail(readerAccess, chat.id),
                ).rejects.toMatchObject({ code: 'conversation_not_found' });
            },
        );
        it('keeps saved owner practice separate from editing chats and denies authoring', async () => {
            const knowledge = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => undefined },
                new KnowledgeShareCrypto(
                    'conversation-knowledge-test-secret-47',
                ),
            );
            const note = await knowledge.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const editing = await store.create(access(), {
                source: { kind: 'knowledge', id: note.id },
            });
            const savedSource = {
                kind: 'knowledge' as const,
                id: note.id,
                view: 'saved' as const,
            };
            const practice = await store.create(access(), {
                source: savedSource,
            });
            expect(
                (await store.list(access(), savedSource)).map(
                    (chat) => chat.id,
                ),
            ).toEqual([practice.id]);
            expect(
                (
                    await store.list(access(), {
                        kind: 'knowledge',
                        id: note.id,
                    })
                ).map((chat) => chat.id),
            ).toEqual([editing.id]);
            await store.submit(access(), practice.id, submit());
            const turn = (await store.claim())!;
            await expect(store.propose(turn, content)).rejects.toThrow(
                'Shared conversations cannot propose',
            );
            await expect(
                store.proposeBlocks(turn, {
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'grammar',
                            language: 'es',
                            rule: 'Rule.',
                        },
                    ],
                }),
            ).rejects.toThrow('authorized block proposal target');
            await store.finish(turn, 'succeeded');
        });
        it('retains typed proposals separately and applies only to the frozen owner working branch without publishing', async () => {
            const knowledge = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => undefined },
                new KnowledgeShareCrypto(
                    'conversation-knowledge-test-secret-47',
                ),
            );
            const note = await knowledge.create(owner, {
                operationId: randomUUID(),
                content,
            });
            const workspace = await knowledge.getWorkspace(owner, note.id);
            const branch = workspace.branches.find(
                (item) => item.id === workspace.preferredBranchId,
            )!;
            const chat = await store.create(access(), {
                source: { kind: 'knowledge', id: note.id },
            });
            await store.submit(access(), chat.id, {
                ...submit('Add a grammar block'),
                editorContext: {
                    ...workspaceContext('Ser describes identity.'),
                    workingBranch: { id: branch.id, version: branch.version },
                },
            });
            const turn = (await store.claim())!;
            const originalId = randomUUID();
            const role = `knowledge_proposal_worker_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`create role ${role} nologin`);
            const roleSql = await readFile(
                new URL(
                    '../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );
            await client.unsafe(
                roleSql
                    .split('\n')
                    .filter((line) => !line.startsWith('\\'))
                    .join('\n')
                    .replaceAll(':"dictionary_worker_role"', role),
            );
            const workerUrl = new URL(getTestDatabaseUrl());
            workerUrl.searchParams.set('options', `-c role=${role}`);
            const workerClient = createPostgresClient({
                databaseUrl: workerUrl.toString(),
                maxConnections: 2,
            });
            let proposal: { id: string };
            try {
                expect(
                    (await workerClient`select current_user as role`)[0]!.role,
                ).toBe(role);
                await expect(
                    workerClient`select content from knowledge_working_branches`,
                ).rejects.toMatchObject({ code: '42501' });
                await expect(
                    workerClient`select * from knowledge_working_branches`,
                ).rejects.toMatchObject({ code: '42501' });
                await expect(
                    workerClient`select * from knowledge_speech_recordings`,
                ).rejects.toMatchObject({ code: '42501' });
                await expect(
                    workerClient`select * from conversation_block_proposals`,
                ).rejects.toMatchObject({ code: '42501' });
                const validBlocks = JSON.stringify([
                    {
                        id: randomUUID(),
                        type: 'grammar',
                        language: 'es',
                        rule: 'Una regla.',
                    },
                ]);
                await expect(
                    workerClient`select public.languon_propose_learning_blocks(${turn.id}::uuid,${randomUUID()}::uuid,${validBlocks}::jsonb)`,
                ).rejects.toMatchObject({ code: '23514' });
                await expect(
                    workerClient`insert into knowledge_speech_recordings(note_id,recording_id) values(${note.id}::uuid,${randomUUID()}::uuid)`,
                ).rejects.toMatchObject({ code: '42501' });
                const workerStore = new DrizzleConversationStore({
                    ...dependencies,
                    database: createDrizzleDatabase(
                        workerClient,
                        databaseSchema,
                    ),
                });
                proposal = await workerStore.proposeBlocks(turn, {
                    blocks: [
                        {
                            id: originalId,
                            type: 'grammar',
                            language: 'es',
                            rule: 'Use ser for identity.',
                        },
                    ],
                });
            } finally {
                await workerClient.end();
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
            await expect(
                store.proposeBlocks(turn, {
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'grammar',
                            language: 'es',
                            rule: 'Another.',
                        },
                    ],
                }),
            ).rejects.toThrow('already generated');
            await store.finish(turn, 'succeeded');
            const listed = await store.listBlockProposals(access(), chat.id);
            expect(listed.proposals[0]?.id).toBe(proposal.id);
            expect(listed.proposals[0]?.blocks[0]?.id).not.toBe(originalId);
            expect(
                (await knowledge.get(owner, note.id)).body.schemaVersion,
            ).toBe(1);
            const applied = await store.applyBlockProposal(
                access(),
                chat.id,
                proposal.id,
                branch.version,
            );
            expect(applied.branch.version).toBe(branch.version + 1);
            expect(applied.branch.content.body.document.content).toHaveLength(
                2,
            );
            expect(
                (await knowledge.get(owner, note.id)).body.schemaVersion,
            ).toBe(1);
            const replay = await store.applyBlockProposal(
                access(),
                chat.id,
                proposal.id,
                branch.version,
            );
            expect(replay.branch.content.body.document.content).toHaveLength(2);
            await expect(
                store.listBlockProposals({ ownerId: learner }, chat.id),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
            await store.submit(access(), chat.id, {
                ...submit('More grammar'),
                editorContext: {
                    ...workspaceContext(
                        'Ser describes identity. Use ser for identity.',
                    ),
                    workingBranch: {
                        id: branch.id,
                        version: applied.branch.version,
                    },
                },
            });
            const next = (await store.claim())!;
            expect(
                JSON.stringify(next.sourceSnapshot.blockTarget?.material),
            ).toContain('Use ser for identity.');
            const stale = await store.proposeBlocks(next, {
                blocks: [
                    {
                        id: randomUUID(),
                        type: 'grammar',
                        language: 'es',
                        rule: 'Next rule.',
                    },
                ],
            });
            await store.finish(next, 'succeeded');
            await knowledge.updateWorking(owner, note.id, {
                operationId: randomUUID(),
                branchId: branch.id,
                expectedVersion: applied.branch.version,
                content: {
                    ...applied.branch.content,
                    title: 'New private title',
                    body: {
                        ...applied.branch.content.body,
                        document: {
                            ...applied.branch.content.body.document,
                            content:
                                applied.branch.content.body.document.content?.map(
                                    (node) =>
                                        node.type === 'learningBlock' &&
                                        node.attrs?.block?.type === 'grammar'
                                            ? {
                                                  ...node,
                                                  attrs: {
                                                      block: {
                                                          ...node.attrs.block,
                                                          rule: 'Changed rule after admission.',
                                                      },
                                                  },
                                              }
                                            : node,
                                ),
                        },
                    },
                },
            });
            expect(
                JSON.stringify(next.sourceSnapshot.blockTarget?.material),
            ).not.toContain('Changed rule after admission.');
            await expect(
                store.applyBlockProposal(
                    access(),
                    chat.id,
                    stale.id,
                    applied.branch.version,
                ),
            ).rejects.toThrow('working document changed');
        });
        it('freezes approved portrait at admission, applies next-message changes and removes terminal snapshots', async () => {
            portraitPolicy = {
                enabled: true,
                portrait: {
                    locale: 'en',
                    updatedAt: clock.toISOString(),
                    summary: 'Display summary',
                    items: {
                        explanationLanguages: ['es'],
                        tone: 'friendly',
                        goals: ['PORTRAIT_SNAPSHOT'],
                    },
                },
            };
            const chat = await create();
            expect(chat.effectivePreferences?.replyLanguage).toBe('es');
            expect(chat.preferenceOrigins?.tone).toBe('portrait');
            await store.submit(access(), chat.id, submit());
            portraitPolicy.enabled = false;
            await expect(
                client`update conversation_turns set portrait_context=null where conversation_id=${chat.id} and status='queued'`,
            ).rejects.toMatchObject({ code: '23514' });
            const claimed = (await store.claim())!;
            expect(claimed.preferences.replyLanguage).toBe('es');
            expect(JSON.stringify(claimed.portraitContext)).toContain(
                'PORTRAIT_SNAPSHOT',
            );
            expect(
                JSON.stringify(
                    (await store.detail(access(), chat.id)).messages,
                ),
            ).not.toContain('PORTRAIT_SNAPSHOT');
            await store.finish(claimed, 'succeeded');
            const [terminal] =
                await client`select portrait_context from conversation_turns where id=${claimed.id}`;
            expect(terminal!.portrait_context).toBeNull();
            await store.submit(access(), chat.id, submit());
            const next = (await store.claim())!;
            expect(next.portraitContext).toBeUndefined();
            expect(next.preferences.replyLanguage).toBe('auto');
            await store.finish(next, 'succeeded');
            portraitPolicy = {
                enabled: true,
                portrait: {
                    locale: 'en',
                    updatedAt: clock.toISOString(),
                    summary: '',
                    items: {
                        explanationLanguages: ['de'],
                        goals: ['UPDATED_PORTRAIT'],
                    },
                },
            };
            await store.submit(access(), chat.id, submit());
            const updated = (await store.claim())!;
            expect(updated.preferences.replyLanguage).toBe('de');
            expect(JSON.stringify(updated.portraitContext)).toContain(
                'UPDATED_PORTRAIT',
            );
            expect(JSON.stringify(updated.portraitContext)).not.toContain(
                'PORTRAIT_SNAPSHOT',
            );
            await store.finish(updated, 'succeeded');
        });
        it('keeps legacy chats manual until explicit adoption and honors per-chat exclusion', async () => {
            portraitPolicy = {
                enabled: true,
                portrait: {
                    locale: 'en',
                    updatedAt: clock.toISOString(),
                    summary: '',
                    items: { explanationLanguages: ['es'], tone: 'friendly' },
                },
            };
            const chat = await create();
            const legacy = ChatPreferencesSchema.parse({
                replyLanguage: 'en',
                tone: 'academic',
            });
            await client`update conversation_chats set preferences=${JSON.stringify(legacy)}::jsonb where id=${chat.id}`;
            expect(
                (await store.detail(access(), chat.id)).conversation
                    .effectivePreferences,
            ).toEqual(legacy);
            await store.update(access(), chat.id, {
                preferences: {
                    ...legacy,
                    portrait: {
                        enabled: true,
                        inheritedFields: ['replyLanguage'],
                    },
                },
            });
            const adopted = (await store.detail(access(), chat.id))
                .conversation;
            expect(adopted.effectivePreferences?.replyLanguage).toBe('es');
            expect(adopted.effectivePreferences?.tone).toBe('academic');
            await store.update(access(), chat.id, {
                preferences: {
                    ...legacy,
                    portrait: {
                        enabled: false,
                        inheritedFields: ['replyLanguage'],
                    },
                },
            });
            await store.submit(access(), chat.id, submit());
            const next = (await store.claim())!;
            expect(next.portraitContext).toBeUndefined();
            expect(next.preferences.replyLanguage).toBe('en');
            await store.finish(next, 'succeeded');
        });
        it('persists independent owner defaults and reopened modes while freezing admitted turn preferences', async () => {
            expect((await store.settings(owner)).mode).toBe('auto');
            const original = await create();
            await store.settings(
                owner,
                ChatPreferencesSchema.parse({ mode: 'explain' }),
            );
            const inherited = await create();
            expect(inherited.preferences.mode).toBe('explain');
            expect(
                (await store.detail(access(), original.id)).conversation
                    .preferences.mode,
            ).toBe('auto');
            expect((await store.settings(learner)).mode).toBe('auto');
            await store.update(access(), inherited.id, {
                preferences: ChatPreferencesSchema.parse({ mode: 'correct' }),
            });
            expect(
                (await store.detail(access(), inherited.id)).conversation
                    .preferences.mode,
            ).toBe('correct');
            await store.submit(access(), inherited.id, submit());
            await store.update(access(), inherited.id, {
                preferences: ChatPreferencesSchema.parse({ mode: 'practice' }),
            });
            const claimed = (await store.claim())!;
            expect(claimed.preferences.mode).toBe('correct');
            expect(
                (await store.detail(access(), inherited.id)).conversation
                    .preferences.mode,
            ).toBe('practice');
            expect((await store.settings(owner)).mode).toBe('explain');
            await expect(
                store.update({ ownerId: learner }, inherited.id, {
                    preferences: ChatPreferencesSchema.parse({ mode: 'auto' }),
                }),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
            expect(
                (await store.detail(access(), inherited.id)).conversation
                    .preferences.mode,
            ).toBe('practice');
        });
        it('normalizes missing modes in stored defaults, conversations and immutable turn snapshots without rewriting history', async () => {
            const initial = await create();
            const stored = {
                replyLanguage: 'auto',
                tone: 'neutral',
                explanationLevel: 'auto',
            };
            await client`insert into conversation_settings(owner_id,preferences,updated_at) values (${owner},${JSON.stringify(stored)}::jsonb,now())`;
            await client`update conversation_chats set preferences=${JSON.stringify(stored)}::jsonb where id=${initial.id}`;
            expect((await store.settings(owner)).mode).toBe('auto');
            expect((await create()).preferences.mode).toBe('auto');
            expect(
                (await store.detail(access(), initial.id)).conversation
                    .preferences.mode,
            ).toBe('auto');
            await store.submit(access(), initial.id, submit());
            const originalTurn = (await store.claim())!;
            await store.finish(originalTurn, 'succeeded');
            // Seed a historical admission directly; the immutable-admission trigger
            // intentionally prohibits rewriting preferences on an existing turn.
            const historicalId = randomUUID();
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.execute(sql`insert into conversation_turns(id,conversation_id,owner_id,request_id,request_fingerprint,status,authority,source_snapshot,preferences,execution,usage,created_at,updated_at)
                    select ${historicalId},conversation_id,owner_id,${randomUUID()},request_fingerprint,'queued',authority,source_snapshot,${JSON.stringify(stored)}::jsonb,execution,usage,created_at,updated_at from conversation_turns where id=${originalTurn.id}`);
            });
            await client`insert into conversation_messages(id,conversation_id,turn_id,role,content,attachments,status,source_version,source_provenance,created_at)
                select ${randomUUID()},conversation_id,${historicalId},role,content,attachments,status,source_version,source_provenance,created_at from conversation_messages where turn_id=${originalTurn.id} and role='user'`;
            expect((await store.claim())!.preferences.mode).toBe('auto');
            const [persisted] =
                await client`select preferences from conversation_turns where id=${historicalId}`;
            expect(persisted!.preferences).not.toHaveProperty('mode');
        });
        it('serializes concurrent admission and request replays without duplicate learner messages or accounting', async () => {
            const chat = await create(),
                input = submit();
            const [first, replay] = await Promise.all([
                store.submit(access(), chat.id, input),
                store.submit(access(), chat.id, input),
            ]);
            expect(first.id).toBe(replay.id);
            expect(admitted).toHaveBeenCalledTimes(1);
            expect(first.modelId).toBeNull();
            const [storedExecution] =
                await client`select execution from conversation_turns where id=${first.id}`;
            expect(storedExecution!.execution.snapshot.modelId).toBe(
                'deepseek-flash',
            );
            await expect(
                store.submit(access(), chat.id, {
                    ...input,
                    content: 'Different question',
                }),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
            await expect(
                store.submit(access(), chat.id, submit()),
            ).rejects.toMatchObject({ code: 'response_active' });
            const detail = ConversationDetailSchema.parse(
                await store.detail(access(), chat.id),
            );
            expect(detail.messages).toHaveLength(2);
            expect(
                detail.messages.filter((message) => message.role === 'user'),
            ).toHaveLength(1);
            expect((await store.stop(access(), chat.id, first.id)).status).toBe(
                'cancelled',
            );
            expect(
                (await store.submit(access(), chat.id, submit())).status,
            ).toBe('queued');
        });
        it('rejects oversized Unicode and aggregate copies before queueing or invoking credit admission', async () => {
            const chat = await create();
            const copies = [
                [
                    {
                        id: randomUUID(),
                        label: 'Unicode passage',
                        content: '例'.repeat(3000),
                    },
                ],
                Array.from({ length: 4 }, () => ({
                    id: randomUUID(),
                    label: 'Copied passage',
                    content: '👋'.repeat(600),
                })),
            ];
            for (const attachments of copies) {
                const input = SubmitConversationTurnRequestSchema.parse({
                    requestId: randomUUID(),
                    content: 'Explain these copies.',
                    attachments,
                });
                await expect(
                    store.submit(access(), chat.id, input),
                ).rejects.toMatchObject({ code: 'context_too_large' });
            }
            await expect(
                store.submit(access(), chat.id, submit('A'.repeat(20_000))),
            ).rejects.toMatchObject({ code: 'context_too_large' });
            expect(admitted).not.toHaveBeenCalled();
            const [counts] = await client`select
                (select count(*) from conversation_turns where conversation_id=${chat.id})::int as turns,
                (select count(*) from conversation_messages where conversation_id=${chat.id})::int as messages,
                (select count(*) from conversation_provider_calls where turn_id in (select id from conversation_turns where conversation_id=${chat.id}))::int as calls,
                (select count(*) from ai_credit_reservations where owner_id=${owner})::int as reservations`;
            expect(counts).toMatchObject({
                turns: 0,
                messages: 0,
                calls: 0,
                reservations: 0,
            });
            expect(
                (await store.detail(access(), chat.id)).messages,
            ).toHaveLength(0);
        });
        it('checks resolved retry content while preserving prior idempotent results and original history', async () => {
            const chat = await create();
            const input = submit();
            const original = await store.submit(access(), chat.id, input);
            await store.stop(access(), chat.id, original.id);
            // Simulate an already-retained legacy question that exceeds the new
            // admission budget. A retry placeholder cannot bypass its true size.
            const legacyContent = '例'.repeat(3000);
            await client`update conversation_messages set content=${legacyContent} where turn_id=${original.id} and role='user'`;
            admitted.mockClear();
            const replay = await store.submit(access(), chat.id, input);
            expect(replay.id).toBe(original.id);
            await expect(
                store.submit(access(), chat.id, {
                    ...submit('Retry'),
                    retryOf: original.id,
                }),
            ).rejects.toMatchObject({ code: 'context_too_large' });
            expect(admitted).not.toHaveBeenCalled();
            const detail = await store.detail(access(), chat.id);
            expect(detail.turns).toHaveLength(1);
            expect(
                detail.messages.find((message) => message.role === 'user')
                    ?.content,
            ).toBe(legacyContent);
            expect(detail.turns[0]?.status).toBe('cancelled');
        });
        it('copies only active learner-visible fields, freezes admitted content, and refreshes the next turn', async () => {
            const chat = await create();
            const copied = await store.context(access(), chat.id, 'ser');
            expect(copied.material).toHaveLength(1);
            expect(copied.material[0]?.content).toContain('Soy médico.');
            expect(copied.material[0]?.content).not.toContain('PRIVATE');
            const first = await store.submit(access(), chat.id, {
                ...submit(),
                attachments: copied.material,
            });
            const claimed = (await store.claim())!;
            expect(JSON.stringify(claimed.message.modelContent)).toContain(
                'Application source provenance',
            );
            expect(JSON.stringify(claimed.message.modelContent)).toContain(
                claimed.sourceSnapshot.version,
            );
            await store.append(claimed, 'First answer');
            await client`update dictionary_cards set source='estar',normalized_source='estar',example='Estoy aquí.',version=version+1 where id=${card}`;
            // Content edits do not invalidate live authority of the admitted turn.
            await store.heartbeat(claimed);
            expect(claimed.sourceSnapshot.material[0]?.content).toContain(
                'Soy médico.',
            );
            await store.finish(claimed, 'succeeded');
            const second = await store.submit(
                access(),
                chat.id,
                submit('Explain estar'),
            );
            const next = (await store.claim())!;
            expect(next.sourceSnapshot.material[0]?.content).toContain(
                'Estoy aquí.',
            );
            expect(next.sourceSnapshot.version).not.toBe(
                claimed.sourceSnapshot.version,
            );
            const detail = await store.detail(access(), chat.id);
            expect(
                detail.messages.find(
                    (message) =>
                        message.turnId === first.id && message.role === 'user',
                )?.content,
            ).toBe('Explain ser');
            expect(JSON.stringify(detail)).not.toContain(
                'Application source provenance',
            );
            expect(
                detail.messages.find(
                    (message) =>
                        message.turnId === first.id && message.role === 'user',
                )?.attachments[0]?.content,
            ).toContain('Soy médico.');
            expect(
                detail.messages.find((message) => message.turnId === second.id)
                    ?.sourceVersion,
            ).toBe(next.sourceSnapshot.version);
        });
        it('freezes the full Knowledge editor snapshot, copies owned Text references, and names the first conversation turn', async () => {
            const note = await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    { operationId: randomUUID(), content },
                    clock,
                ),
            );
            const chat = await store.create(access(), {
                source: { kind: 'knowledge', id: note.id },
            });
            const folder = randomUUID();
            const textId = randomUUID();
            const date = clock.toISOString();
            await client`insert into text_folders(id,owner_id,name,created_at,updated_at) values (${folder},${owner},'Reading',${date},${date})`;
            await client`insert into texts(id,owner_id,folder_id,title,source_language,target_language,source_text,status,created_at,updated_at) values (${textId},${owner},${folder},'Selected text','es','en','Reference body','draft',${date},${date})`;
            expect(
                (await store.textReferences(access(), chat.id, 'Selected'))
                    .references,
            ).toEqual([
                {
                    id: textId,
                    title: 'Selected text',
                    sourceLanguage: 'es',
                    translationLanguage: null,
                    hasTranslation: false,
                },
            ]);
            const reference = (
                await store.textReference(access(), chat.id, textId)
            ).reference;
            await expect(
                store.textReference({ ownerId: learner }, chat.id, textId),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
            const editor =
                'First paragraph.\nSecond paragraph after unsaved edits.';
            const turn = await store.submit(access(), chat.id, {
                ...submit('Explain this phrase'),
                editorContext: {
                    ...workspaceContext(editor),
                    selectedText: 'Second paragraph',
                },
                attachments: [
                    {
                        id: randomUUID(),
                        kind: 'text-reference',
                        label: reference.title,
                        content: reference.content,
                        sourceLanguage: reference.sourceLanguage,
                    },
                ],
            });
            const claimed = (await store.claim())!;
            expect(claimed.sourceSnapshot.scope).toBe('workspace');
            expect(claimed.sourceSnapshot.material).toEqual([]);
            expect(
                (
                    claimed.message.modelContent as {
                        parts: { text: string }[];
                    }
                ).parts
                    .map((part) => part.text)
                    .join('\n'),
            ).toContain(editor);
            expect(JSON.stringify(claimed.message.modelContent)).toContain(
                reference.content,
            );
            expect(claimed.message.editorTarget).toEqual(
                workspaceContext(editor).editorTarget,
            );
            expect(
                (await store.detail(access(), chat.id)).messages.find(
                    (message) =>
                        message.turnId === turn.id &&
                        message.role === 'assistant',
                )?.editorTarget,
            ).toEqual(workspaceContext(editor).editorTarget);
            expect(
                (await store.detail(access(), chat.id)).conversation.title,
            ).toBe('Explain this phrase');
            await store.stop(access(), chat.id, turn.id);
        });
        it('keeps the frozen proposal target and editor snapshot on retry', async () => {
            const note = await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    { operationId: randomUUID(), content },
                    clock,
                ),
            );
            const chat = await store.create(access(), {
                source: { kind: 'knowledge', id: note.id },
            });
            const originalContent = 'Original first line.\nTarget paragraph.';
            const from = originalContent.indexOf('Target');
            const originalContext = workspaceContext(
                originalContent,
                from,
                originalContent.length,
            );
            const first = await store.submit(access(), chat.id, {
                ...submit('Improve this paragraph'),
                editorContext: {
                    ...originalContext,
                    proposalTarget: {
                        ...originalContext.editorTarget,
                        mode: 'replace',
                    },
                },
            });
            const claimed = (await store.claim())!;
            const originalModelContent = claimed.message.modelContent;
            await store.stop(access(), chat.id, first.id);
            await store.finish(claimed, 'cancelled');
            const retry = await store.submit(access(), chat.id, {
                ...submit('Ignored retry placeholder'),
                retryOf: first.id,
                editorContext: workspaceContext('Newer unsaved edit.'),
            });
            const retryClaim = (await store.claim())!;
            expect(retryClaim.message.modelContent).toEqual(
                originalModelContent,
            );
            expect(retryClaim.message.editorTarget).toEqual({
                ...originalContext.editorTarget,
                proposalMode: 'replace',
            });
            expect(
                (await store.detail(access(), chat.id)).messages.find(
                    (message) =>
                        message.turnId === retry.id &&
                        message.role === 'assistant',
                )?.editorTarget,
            ).toEqual(retryClaim.message.editorTarget);
        });
        it('starts an empty Knowledge draft conversation and names the draft from its first question', async () => {
            const knowledge = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => undefined },
                new KnowledgeShareCrypto(
                    'conversation-knowledge-test-secret-47',
                ),
            );
            const workspace = await knowledge.createDraft(owner, {
                operationId: randomUUID(),
            });
            const chat = await store.create(access(), {
                source: { kind: 'knowledge', id: workspace.noteId },
            });
            await store.submit(access(), chat.id, {
                ...submit('Why does this work?'),
                editorContext: {
                    ...workspaceContext(''),
                    workingBranch: {
                        id: workspace.preferredBranchId,
                        version: workspace.branches[0]!.version,
                    },
                },
            });
            const reopened = await knowledge.getWorkspace(
                owner,
                workspace.noteId,
            );
            expect(
                reopened.branches.find(
                    (branch) => branch.id === reopened.preferredBranchId,
                )?.content.title,
            ).toBe('Why does this');
            expect(
                (await store.detail(access(), chat.id)).conversation.title,
            ).toBe('Why does this');
            const claimed = (await store.claim())!;
            expect(claimed.sourceSnapshot.blockTarget?.version).toBe(
                reopened.branches[0]?.version,
            );
            await expect(
                store.proposeBlocks(claimed, {
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'grammar',
                            language: 'es',
                            rule: 'A first rule.',
                        },
                    ],
                }),
            ).resolves.toHaveProperty('id');
            expect(claimed.sourceSnapshot.scope).toBe('workspace');
            expect(claimed.sourceSnapshot.studiedLanguage).toBeNull();
            expect(JSON.stringify(claimed.message.modelContent)).toContain(
                '\\"studiedLanguage\\":null',
            );
        });
        it('separates current shared authority from frozen material, suspends on archive/revocation and restores through a new share', async () => {
            await expect(
                store.create(
                    { ownerId: learner },
                    { source: { kind: 'dictionary', id: dictionary } },
                ),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
            const locator = randomUUID();
            const digest = cryptography.shareDigest('key', 1);
            await client`update dictionaries set visibility='unlisted',share_locator=${locator},share_key_digest=${digest},share_key_version=1,share_key_rotated_at=${clock.toISOString()} where id=${dictionary}`;
            const shared = { ownerId: learner, shareKey: 'key' };
            const chat = await store.create(shared, {
                source: {
                    kind: 'dictionary',
                    id: dictionary,
                    shareLocator: locator,
                },
            });
            await expect(store.detail(access(), chat.id)).rejects.toMatchObject(
                { code: 'conversation_not_found' },
            );
            await store.submit(shared, chat.id, submit());
            const turn = (await store.claim())!;
            await client`update dictionaries set lifecycle='archived',archived_at=${clock.toISOString()},visibility='private',share_locator=null,share_key_digest=null,share_key_version=null,share_key_rotated_at=null where id=${dictionary}`;
            await expect(store.detail(shared, chat.id)).rejects.toMatchObject({
                code: 'conversation_not_found',
            });
            await expect(
                store.append(turn, 'Late private write'),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
            await client`update dictionaries set lifecycle='active',archived_at=null,visibility='unlisted',share_locator=${locator},share_key_digest=${digest},share_key_version=1,share_key_rotated_at=${clock.toISOString()} where id=${dictionary}`;
            expect((await store.detail(shared, chat.id)).messages).toHaveLength(
                2,
            );
            const nextLocator = randomUUID();
            await client`update dictionaries set share_locator=${nextLocator},share_key_digest=${cryptography.shareDigest('next', 2)},share_key_version=2 where id=${dictionary}`;
            await expect(store.detail(shared, chat.id)).rejects.toMatchObject({
                code: 'conversation_not_found',
            });
            const restored = { ownerId: learner, shareKey: 'next' };
            expect(
                await store.list(restored, {
                    kind: 'dictionary',
                    id: dictionary,
                    shareLocator: nextLocator,
                }),
            ).toHaveLength(1);
            expect(
                (await store.detail(restored, chat.id)).conversation.id,
            ).toBe(chat.id);
            await expect(
                store.append(turn, 'Old admitted authority'),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
            clock = new Date(clock.getTime() + 60_001);
            expect(await store.claim()).toBeNull();
            expect(interrupted).toHaveBeenCalledTimes(1);
            expect(
                (await store.detail(restored, chat.id)).turns[0]?.status,
            ).toBe('failed');
        });
        it('fences stopped/expired workers and retries explicitly with the original frozen question and copied content', async () => {
            const chat = await create(),
                initial = await store.submit(access(), chat.id, submit());
            const claimed = (await store.claim())!;
            await store.append(claimed, 'Partial');
            await store.recordTool(claimed, {
                id: 'read-1',
                name: 'read_source_context',
                state: 'running',
            });
            await store.stop(access(), chat.id, initial.id);
            await expect(store.append(claimed, 'late')).rejects.toMatchObject({
                code: 'operation_interrupted',
            });
            await store.finish(claimed, 'cancelled');
            const stopped = await store.detail(access(), chat.id);
            expect(stopped.messages[1]).toMatchObject({
                content: 'Partial',
                status: 'incomplete',
                toolCalls: [
                    {
                        id: 'read-1',
                        name: 'read_source_context',
                        state: 'failed',
                    },
                ],
            });
            await client`update dictionary_cards set source='estar',normalized_source='estar',version=version+1 where id=${card}`;
            const retry = await store.submit(access(), chat.id, {
                ...submit('Ignored replacement'),
                retryOf: initial.id,
            });
            const retryClaim = (await store.claim())!;
            expect(retryClaim.message.content).toBe('Explain ser');
            expect(retryClaim.sourceSnapshot.material[0]?.label).toBe('ser');
            clock = new Date(clock.getTime() + 60_001);
            expect(await store.claim()).toBeNull();
            expect(interrupted).toHaveBeenCalledTimes(1);
            await expect(
                store.append(retryClaim, 'Late after recovery'),
            ).rejects.toMatchObject({ code: 'operation_interrupted' });
            const detail = await store.detail(access(), chat.id);
            expect(
                detail.turns.find((turn) => turn.id === retry.id),
            ).toMatchObject({
                status: 'failed',
                failureCode: 'worker_interrupted',
            });
            expect(await store.claim()).toBeNull(); // Recovery never redispatches an ambiguous provider call.
        });
        it('replays durable events and snapshots stale cursors after the 24 hour replay window', async () => {
            const chat = await create();
            await store.submit(access(), chat.id, submit());
            const [snapshot] = await store.events(access(), chat.id, 0);
            expect(snapshot?.type).toBe('snapshot');
            const claimed = (await store.claim())!;
            await store.recordTool(claimed, {
                id: 'read-1',
                name: 'read_source_context',
                state: 'running',
            });
            await store.recordMaterial(
                claimed,
                claimed.sourceSnapshot.material,
            );
            await store.recordTool(claimed, {
                id: 'read-1',
                name: 'read_source_context',
                state: 'succeeded',
            });
            await store.append(claimed, 'Answer');
            await store.finish(claimed, 'succeeded');
            const replay = await store.events(access(), chat.id, snapshot!.id);
            expect(
                replay.some(
                    (event) =>
                        event.type === 'message' &&
                        event.data.content === 'Answer',
                ),
            ).toBe(true);
            replay.forEach((event) => ConversationEventSchema.parse(event));
            const last = replay.at(-1)!;
            expect(await store.events(access(), chat.id, last.id)).toEqual([]);
            clock = new Date(clock.getTime() + 86_400_001);
            const stale = await store.events(access(), chat.id, snapshot!.id);
            expect(stale[0]?.type).toBe('snapshot');
            expect(stale[0]?.id).toBe(last.id);
            expect(
                (await store.events(access(), chat.id, last.id + 100))[0]?.type,
            ).toBe('snapshot');
            expect(
                (await store.detail(access(), chat.id)).messages[1]?.content,
            ).toBe('Answer');
            expect(await store.claim()).toBeNull();
            expect(
                await client`select id from conversation_events where conversation_id=${chat.id}`,
            ).toHaveLength(0);
            expect(
                (await store.events(access(), chat.id, last.id))[0]?.type,
            ).toBe('snapshot');
            expect(
                (await store.detail(access(), chat.id)).messages[1]?.content,
            ).toBe('Answer');
        });
        it.each(['dictionary', 'knowledge'] as const)(
            'publishes a %s-source draft while an authorized stream read waits without a lock upgrade deadlock',
            async (kind) => {
                const note = await db.transaction((tx) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).publish(
                        owner,
                        { operationId: randomUUID(), content },
                        clock,
                    ),
                );
                const chat =
                    kind === 'dictionary'
                        ? await create()
                        : await store.create(access(), {
                              source: { kind: 'knowledge', id: note.id },
                          });
                await store.submit(
                    access(),
                    chat.id,
                    kind === 'knowledge'
                        ? {
                              ...submit(),
                              editorContext: workspaceContext(
                                  'Current full note body.',
                              ),
                          }
                        : submit(),
                );
                const turn = (await store.claim())!;
                const draft = await store.propose(turn, content, {
                    noteId: note.id,
                    version: note.version,
                });
                const reached = latch(),
                    resume = latch();
                beforePublish = async () => {
                    reached.release();
                    await resume.promise;
                };
                const publishing = store.publishDraft(
                    access(),
                    chat.id,
                    draft.id,
                    {
                        operationId: randomUUID(),
                        expectedVersion: draft.version,
                        mode: 'update',
                        expectedNoteVersion: note.version,
                    },
                );
                // Register rejection handlers before either connection can fail.
                const publicationResult = Promise.allSettled([publishing]);
                await completes(reached.promise);
                const polling = store.events(access(), chat.id, 0);
                const pollingResult = Promise.allSettled([polling]);
                try {
                    await completes(
                        (async () => {
                            // Observe the second connection's real lock wait, rather than guessing timing.
                            while (true) {
                                const [state] =
                                    await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%for share%') as waiting`;
                                if (state?.waiting) return;
                            }
                        })(),
                    );
                } finally {
                    resume.release();
                    await Promise.all([publicationResult, pollingResult]);
                }
                const [publication] = await publicationResult;
                const [poll] = await pollingResult;
                if (publication!.status === 'rejected')
                    throw publication!.reason;
                if (poll!.status === 'rejected') throw poll!.reason;
                expect(publication!.value.version).toBe(2);
                expect(poll!.value.length).toBeGreaterThan(0);
                expect(
                    (await store.detail(access(), chat.id)).drafts,
                ).toHaveLength(0);
                const [saved] =
                    await client`select version,summary from knowledge_notes where id=${note.id}`;
                expect(saved).toMatchObject({
                    version: 2,
                    summary: content.summary,
                });
            },
        );
        it('fences operation callbacks before source and conversation locks when a stream reader overlaps Knowledge access', async () => {
            const note = await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    { operationId: randomUUID(), content },
                    clock,
                ),
            );
            const chat = await store.create(access(), {
                source: { kind: 'knowledge', id: note.id },
            });
            await store.submit(access(), chat.id, {
                ...submit(),
                editorContext: workspaceContext('Current full note body.'),
            });
            const turn = (await store.claim())!;
            const reached = latch(),
                resume = latch();
            const operation = store.withOperation(turn, async (tx) => {
                reached.release();
                await resume.promise;
                return new DrizzleKnowledgeTransactionParticipant(tx).get(
                    owner,
                    note.id,
                );
            });
            const operationResult = Promise.allSettled([operation]);
            await completes(reached.promise);
            const polling = store.events(access(), chat.id, 0);
            const pollingResult = Promise.allSettled([polling]);
            try {
                await completes(
                    (async () => {
                        while (true) {
                            const [state] =
                                await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%for share%') as waiting`;
                            if (state?.waiting) return;
                        }
                    })(),
                );
            } finally {
                resume.release();
                await Promise.all([operationResult, pollingResult]);
            }
            const [result] = await operationResult;
            const [poll] = await pollingResult;
            if (result!.status === 'rejected') throw result!.reason;
            if (poll!.status === 'rejected') throw poll!.reason;
            expect(result!.value.id).toBe(note.id);
            expect(poll!.value.length).toBeGreaterThan(0);
            await store.finish(turn, 'succeeded');
            expect(
                (await store.detail(access(), chat.id)).turns[0]?.status,
            ).toBe('succeeded');
        });
        it('rejects prose proposals and old draft publication against interactive targets', async () => {
            const note = await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    { operationId: randomUUID(), content },
                    clock,
                ),
            );
            const chat = await create();
            await store.submit(access(), chat.id, submit());
            const turn = (await store.claim())!;
            const draft = await store.propose(turn, content, {
                noteId: note.id,
                version: note.version,
            });
            const interactive: KnowledgeNoteContent = {
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
                                        type: 'grammar',
                                        language: 'es',
                                        rule: 'Interactive grammar rule.',
                                    },
                                },
                            },
                        ],
                    },
                },
            };
            const current = await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    {
                        operationId: randomUUID(),
                        noteId: note.id,
                        expectedVersion: note.version,
                        content: interactive,
                    },
                    clock,
                ),
            );
            await expect(
                store.propose(turn, content, {
                    noteId: current.id,
                    version: current.version,
                }),
            ).rejects.toMatchObject({
                code: 'version_conflict',
                message: expect.stringContaining('interactive blocks'),
            });
            await expect(
                store.publishDraft(access(), chat.id, draft.id, {
                    operationId: randomUUID(),
                    expectedVersion: draft.version,
                    mode: 'update',
                    expectedNoteVersion: note.version,
                }),
            ).rejects.toMatchObject({
                code: 'version_conflict',
                message: expect.stringContaining('interactive blocks'),
            });
            const [retained] =
                await client`select body from knowledge_notes where id=${note.id}`;
            expect(retained?.body).toEqual(interactive.body);
            const copy = await store.publishDraft(access(), chat.id, draft.id, {
                operationId: randomUUID(),
                expectedVersion: draft.version,
                mode: 'new',
            });
            expect(copy.id).not.toBe(note.id);
            expect(copy.body.schemaVersion).toBe(1);
        });
        it('publishes drafts once, retains stale revisions, and cannot resurrect a deleted saved target', async () => {
            const chat = await create();
            await store.submit(access(), chat.id, submit());
            const turn = (await store.claim())!;
            const draft = await store.propose(turn, content);
            const operationId = randomUUID();
            const input = {
                operationId,
                expectedVersion: draft.version,
                mode: 'new' as const,
            };
            const [saved, replay] = await Promise.all([
                store.publishDraft(access(), chat.id, draft.id, input),
                store.publishDraft(access(), chat.id, draft.id, input),
            ]);
            expect(replay.id).toBe(saved.id);
            expect(await client`select id from knowledge_notes`).toHaveLength(
                1,
            );
            const revision = await store.propose(
                turn,
                { ...content, summary: 'A proposed revision.' },
                { noteId: saved.id, version: saved.version },
            );
            await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    {
                        operationId: randomUUID(),
                        noteId: saved.id,
                        expectedVersion: saved.version,
                        content: { ...content, summary: 'Manual edit.' },
                    },
                    clock,
                ),
            );
            await expect(
                store.publishDraft(access(), chat.id, revision.id, {
                    operationId: randomUUID(),
                    expectedVersion: revision.version,
                    mode: 'update',
                    expectedNoteVersion: saved.version,
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });
            expect(
                (await store.detail(access(), chat.id)).drafts.map(
                    (item) => item.id,
                ),
            ).toContain(revision.id);
            await client`delete from knowledge_notes where id=${saved.id}`;
            await expect(
                store.publishDraft(access(), chat.id, revision.id, {
                    operationId: randomUUID(),
                    expectedVersion: revision.version,
                    mode: 'update',
                    expectedNoteVersion: saved.version,
                }),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            await expect(
                store.publishDraft(access(), chat.id, draft.id, input),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            expect(await client`select id from knowledge_notes`).toHaveLength(
                0,
            );
            const independent = await store.publishDraft(
                access(),
                chat.id,
                revision.id,
                {
                    operationId: randomUUID(),
                    expectedVersion: revision.version,
                    mode: 'new',
                },
            );
            await store.finish(turn, 'succeeded');
            await store.delete(access(), chat.id);
            expect(
                await client`select id from knowledge_notes where id=${independent.id}`,
            ).toHaveLength(1);
        });
        it.each([false, true])(
            'rejects an inactive dictionary source owner even when the active actor differs (%s)',
            async (shared) => {
                const locator = randomUUID();
                await client`update dictionaries set visibility='unlisted',share_locator=${locator},share_key_digest=${cryptography.shareDigest('key', 1)},share_key_version=1,share_key_rotated_at=${clock.toISOString()} where id=${dictionary}`;
                const actor = shared
                    ? { ownerId: learner, shareKey: 'key' }
                    : access();
                const chat = await store.create(actor, {
                    source: {
                        kind: 'dictionary',
                        id: dictionary,
                        ...(shared ? { shareLocator: locator } : {}),
                    },
                });
                await client`update users set status='deletion_pending' where id=${owner}`;
                await expect(
                    store.detail(actor, chat.id),
                ).rejects.toMatchObject({ code: 'conversation_not_found' });
                await expect(
                    store.submit(actor, chat.id, submit()),
                ).rejects.toMatchObject({ code: 'conversation_not_found' });
                if (shared)
                    expect(
                        (
                            await client`select status from users where id=${learner}`
                        )[0]?.status,
                    ).toBe('active');
            },
        );
        it('respects text folder shares, saved translation changes and active owner status', async () => {
            const folder = randomUUID(),
                text = randomUUID(),
                share = randomUUID(),
                locator = randomUUID();
            const date = clock.toISOString();
            const pairId = randomUUID();
            const alignment = (source: string, translation: string) =>
                JSON.stringify({
                    source: [
                        {
                            pairId,
                            text: source,
                            startOffset: 0,
                            endOffset: source.length,
                            paragraphIndex: 0,
                        },
                    ],
                    translation: [{ pairId, text: translation }],
                    editedPairIds: [],
                });
            await client`insert into text_folders(id,owner_id,name,created_at,updated_at) values (${folder},${owner},'Reading',${date},${date})`;
            await client`insert into texts(id,owner_id,folder_id,title,source_language,target_language,source_text,alignment,status,created_at,updated_at) values (${text},${owner},${folder},'A text','es','en','Hola.',${alignment('Hola.', 'Hello.')}::jsonb,'translated',${date},${date})`;
            await client`insert into text_shares(id,owner_id,kind,resource_id,locator,key_digest,version,created_at) values (${share},${owner},'folder',${folder},${locator},${cryptography.shareDigest('key', 1)},1,${date})`;
            const actor = { ownerId: learner, shareKey: 'key' };
            const source = {
                kind: 'text' as const,
                id: text,
                shareKind: 'folder' as const,
                shareLocator: locator,
            };
            const chat = await store.create(actor, { source });
            await store.submit(actor, chat.id, submit());
            const turn = (await store.claim())!;
            expect(turn.sourceSnapshot.material[0]?.content).toContain('Hola.');
            await client`update texts set source_text='Adiós.',alignment=${alignment('Adiós.', 'Goodbye.')}::jsonb,version=version+1 where id=${text}`;
            await store.heartbeat(turn);
            await store.finish(turn, 'succeeded');
            await store.submit(actor, chat.id, submit());
            expect(
                (await store.claim())?.sourceSnapshot.material[0]?.content,
            ).toContain('Adiós.');
            await client`update text_folders set lifecycle='archived' where id=${folder}`;
            await expect(store.detail(actor, chat.id)).rejects.toMatchObject({
                code: 'conversation_not_found',
            });
            await client`update text_folders set lifecycle='active' where id=${folder}`;
            const ownedChat = await store.create(access(), {
                source: { kind: 'text', id: text },
            });
            await client`update users set status='deletion_pending' where id=${owner}`;
            await expect(store.detail(actor, chat.id)).rejects.toMatchObject({
                code: 'conversation_not_found',
            });
            await expect(
                store.detail(access(), ownedChat.id),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
        });
        it('freezes a long saved translation as complete ordered passages and runs bounded initial and surrounding retrieval context', async () => {
            const folder = randomUUID(),
                text = randomUUID(),
                pairId = randomUUID();
            const translation = Array.from({ length: 50 }, (_, index) =>
                `${index === 24 ? 'TARGET_NEEDLE' : index === 23 ? 'LEFT_NEIGHBOR' : index === 25 ? 'RIGHT_NEIGHBOR' : `passage-${index}`} `.padEnd(
                    1500,
                    'x',
                ),
            ).join('');
            const alignment = JSON.stringify({
                source: [
                    {
                        pairId,
                        text: 'Hola.',
                        startOffset: 0,
                        endOffset: 5,
                        paragraphIndex: 0,
                    },
                ],
                translation: [{ pairId, text: translation }],
                editedPairIds: [],
            });
            await client`insert into text_folders(id,owner_id,name,created_at,updated_at) values (${folder},${owner},'Long reading',${clock.toISOString()},${clock.toISOString()})`;
            await client`insert into texts(id,owner_id,folder_id,title,source_language,target_language,source_text,alignment,status,created_at,updated_at) values (${text},${owner},${folder},'Long translated text','es','en','Hola.',${alignment}::jsonb,'translated',${clock.toISOString()},${clock.toISOString()})`;
            const chat = await store.create(access(), {
                source: { kind: 'text', id: text },
            });
            const turn = await store.submit(
                access(),
                chat.id,
                submit('Explain TARGET_NEEDLE with the surrounding passage.'),
            );
            const [persisted] =
                await client`select source_snapshot from conversation_turns where id=${turn.id}`;
            const frozen = persisted!.source_snapshot as {
                scope: string;
                material: { id: string; content: string }[];
            };
            expect(frozen.scope).toBe('complete');
            expect(frozen.material.length).toBeGreaterThan(20);
            expect(
                frozen.material
                    .map(
                        (item) =>
                            (
                                JSON.parse(item.content) as {
                                    translationText: string;
                                }
                            ).translationText,
                    )
                    .join(''),
            ).toBe(translation);
            let observedContext: Record<string, unknown> | undefined;
            let retrieved:
                | {
                      material: {
                          id: string;
                          label: string;
                          content: string;
                      }[];
                      total: number;
                  }
                | undefined;
            const worker = new ConversationWorkerService({
                store,
                createRunner: () => ({
                    run: async (input) => {
                        observedContext = input.sourceContext;
                        retrieved = await input.readContext({
                            query: 'TARGET_NEEDLE',
                            limit: 3,
                        });
                        await input.onDelta({
                            messageId: randomUUID(),
                            text: 'This explanation uses selected passages.',
                        });
                        return {
                            text: 'This explanation uses selected passages.',
                        };
                    },
                }),
            });
            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );
            expect(observedContext).toBeDefined();
            expect(
                Buffer.byteLength(JSON.stringify(observedContext), 'utf8'),
            ).toBeLessThanOrEqual(12_000);
            expect(observedContext?.scope).toBe('partial');
            expect(retrieved).toBeDefined();
            expect(retrieved?.total).toBe(frozen.material.length);
            expect(retrieved?.material.length).toBeGreaterThanOrEqual(3);
            const selected = JSON.stringify(retrieved?.material);
            expect(selected).toContain('TARGET_NEEDLE');
            expect(selected).toContain('LEFT_NEIGHBOR');
            expect(selected).toContain('RIGHT_NEIGHBOR');
            expect(
                Buffer.byteLength(JSON.stringify(retrieved), 'utf8'),
            ).toBeLessThanOrEqual(24_000);
            expect(
                (await store.detail(access(), chat.id)).turns[0]?.status,
            ).toBe('succeeded');
        });
        it('hides retained example translations whenever their effective parent example is disabled for owner and shared readers', async () => {
            const locator = randomUUID();
            await client`update dictionaries set visibility='unlisted',share_locator=${locator},share_key_digest=${cryptography.shareDigest('key', 1)},share_key_version=1,share_key_rotated_at=${clock.toISOString()} where id=${dictionary}`;
            await client`update dictionary_settings set example_enabled=false,example_translation_enabled=true,transcription_enabled=true,transcription_notation='ipa',custom_notation_label='DORMANT CUSTOM LABEL' where dictionary_id=${dictionary}`;
            await client`update dictionary_cards set example_translation='RETAINED PRIVATE TRANSLATION',example_translation_enabled_override='enabled' where id=${card}`;
            const ownerChat = await create();
            const sharedAccess = { ownerId: learner, shareKey: 'key' };
            const sharedChat = await store.create(sharedAccess, {
                source: {
                    kind: 'dictionary',
                    id: dictionary,
                    shareLocator: locator,
                },
            });
            for (const [actor, chat] of [
                [access(), ownerChat],
                [sharedAccess, sharedChat],
            ] as const) {
                const material = await store.context(actor, chat.id, 'ser');
                expect(JSON.stringify(material)).not.toContain(
                    'RETAINED PRIVATE TRANSLATION',
                );
                expect(JSON.stringify(material)).not.toContain(
                    'DORMANT CUSTOM LABEL',
                );
                expect(material.material[0]).toMatchObject({
                    kind: 'dictionary-card',
                    card: { source: 'ser' },
                });
                await store.submit(actor, chat.id, submit());
                const turn = (await store.claim())!;
                expect(JSON.stringify(turn.sourceSnapshot)).not.toContain(
                    'RETAINED PRIVATE TRANSLATION',
                );
                expect(JSON.stringify(turn.sourceSnapshot)).not.toContain(
                    'DORMANT CUSTOM LABEL',
                );
                await store.finish(turn, 'succeeded');
            }
            await client`update dictionary_settings set example_enabled=true where dictionary_id=${dictionary}`;
            await client`update dictionary_cards set example_enabled_override='disabled' where id=${card}`;
            expect(
                JSON.stringify(
                    await store.context(sharedAccess, sharedChat.id, 'ser'),
                ),
            ).not.toContain('RETAINED PRIVATE TRANSLATION');
            await client`update dictionary_cards set example_enabled_override='enabled' where id=${card}`;
            expect(
                JSON.stringify(
                    await store.context(sharedAccess, sharedChat.id, 'ser'),
                ),
            ).toContain('RETAINED PRIVATE TRANSLATION');
            await client`update dictionary_settings set transcription_notation='custom' where dictionary_id=${dictionary}`;
            expect(
                JSON.stringify(
                    await store.context(sharedAccess, sharedChat.id, 'ser'),
                ),
            ).toContain('DORMANT CUSTOM LABEL');
        });
        it.each(['events', 'detail'] as const)(
            'revalidates a shared dictionary %s read during actual owner account deletion without owner/resource inversion',
            async (read) => {
                const locator = 'S'.repeat(22),
                    key = 'shared-key';
                await client`update dictionaries set visibility='unlisted',share_locator=${locator},share_key_digest=${cryptography.shareDigest(key, 1)},share_key_version=1,share_key_rotated_at=now(),created_at=now()-interval '1 hour',updated_at=now() where id=${dictionary}`;
                const sharedAccess = { ownerId: learner, shareKey: key };
                const chat = await store.create(sharedAccess, {
                    source: {
                        kind: 'dictionary',
                        id: dictionary,
                        shareLocator: locator,
                    },
                });
                const sessionId = randomUUID();
                await client`insert into auth_sessions(id,user_id,family_id,refresh_token_digest,authentication_method,authenticated_at,absolute_expires_at) values (${sessionId},${owner},${randomUUID()},${randomUUID().replaceAll('-', '') + 'A'.repeat(11)},'password',now(),now()+interval '1 day')`;
                const reached = latch(),
                    resume = latch();
                const deleting = new DrizzleAccountDeletionStore(db).schedule({
                    userId: owner,
                    sessionId,
                    now: new Date(),
                    purgeAt: new Date(Date.now() + 30 * 86_400_000),
                    beforeCommit: async () => {
                        reached.release();
                        await resume.promise;
                    },
                });
                const deletionResult = Promise.allSettled([deleting]);
                await completes(reached.promise);
                const polling =
                    read === 'events'
                        ? store.events(sharedAccess, chat.id, 0)
                        : store.detail(sharedAccess, chat.id);
                const pollingResult = Promise.allSettled([polling]);
                try {
                    await completes(
                        (async () => {
                            while (true) {
                                const [state] =
                                    await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%from "users"%' and query ilike '%for share%') as waiting`;
                                if (state?.waiting) return;
                            }
                        })(),
                    );
                } finally {
                    resume.release();
                    await Promise.all([deletionResult, pollingResult]);
                }
                const [deletion] = await deletionResult,
                    [poll] = await pollingResult;
                if (deletion!.status === 'rejected') throw deletion!.reason;
                expect(poll).toMatchObject({
                    status: 'rejected',
                    reason: { code: 'conversation_not_found' },
                });
                const [state] =
                    await client`select u.status,d.visibility,d.share_locator from users u join dictionaries d on d.owner_id=u.id where d.id=${dictionary}`;
                expect(state).toMatchObject({
                    status: 'deletion_pending',
                    visibility: 'private',
                    share_locator: null,
                });
            },
        );
        it('rejects stale shared reads during actual account purge without retaining a dictionary lock ahead of its owner', async () => {
            const locator = 'P'.repeat(22),
                key = 'stale-key';
            await client`update dictionaries set visibility='unlisted',share_locator=${locator},share_key_digest=${cryptography.shareDigest(key, 1)},share_key_version=1,share_key_rotated_at=now(),created_at=now()-interval '1 hour',updated_at=now() where id=${dictionary}`;
            const sharedAccess = { ownerId: learner, shareKey: key };
            const chat = await store.create(sharedAccess, {
                source: {
                    kind: 'dictionary',
                    id: dictionary,
                    shareLocator: locator,
                },
            });
            await client`update users set status='deletion_pending' where id=${owner}`;
            await client`insert into account_deletion_requests(user_id,scheduled_at,purge_at,next_attempt_at,updated_at) values (${owner},now()-interval '31 days',now()-interval '1 hour',now()-interval '1 hour',now())`;
            const purge = new DrizzleAccountPurgeStore(db),
                now = new Date(),
                workerId = 'conversation-lock-order-test';
            const claimed = (await purge.claimDue({ now, workerId }))!;
            expect(claimed.userId).toBe(owner);
            const held = latch(),
                resume = latch();
            const holding = db.transaction(async (tx) => {
                await tx.execute(
                    sql`select id from dictionaries where id=${dictionary} for share`,
                );
                held.release();
                await resume.promise;
            });
            await completes(held.promise);
            const deleting = purge.finish({ ...claimed, now, workerId });
            const deletionResult = Promise.allSettled([deleting]);
            let pollingResult:
                | Promise<
                      PromiseSettledResult<
                          Awaited<ReturnType<typeof store.events>>
                      >[]
                  >
                | undefined;
            try {
                await completes(
                    (async () => {
                        while (true) {
                            const [state] =
                                await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%delete from "dictionaries"%') as waiting`;
                            if (state?.waiting) return;
                        }
                    })(),
                );
                pollingResult = Promise.allSettled([
                    store.events(sharedAccess, chat.id, 0),
                ]);
                await completes(
                    (async () => {
                        while (true) {
                            const [state] =
                                await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%from "users"%' and query ilike '%for share%') as waiting`;
                            if (state?.waiting) return;
                        }
                    })(),
                );
            } finally {
                resume.release();
                await holding;
                await Promise.all([deletionResult, pollingResult]);
            }
            const [deletion] = await deletionResult;
            if (deletion!.status === 'rejected') throw deletion!.reason;
            expect(deletion!.value).toBe(true);
            expect((await pollingResult)![0]).toMatchObject({
                status: 'rejected',
                reason: { code: 'conversation_not_found' },
            });
            expect(
                await client`select id from dictionaries where id=${dictionary}`,
            ).toHaveLength(0);
            expect(
                (await client`select status from users where id=${owner}`)[0]
                    ?.status,
            ).toBe('purged');
        });
        it.each(['owner', 'archive', 'digest', 'version'] as const)(
            'rejects a dictionary %s change after unlocked owner discovery without changing frozen turn material',
            async (change) => {
                const replacementOwner = randomUUID();
                await client`insert into users(id,status) values (${replacementOwner},'active')`;
                const locator = 'R'.repeat(22),
                    key = 'race-key';
                await client`update dictionaries set visibility='unlisted',share_locator=${locator},share_key_digest=${cryptography.shareDigest(key, 1)},share_key_version=1,share_key_rotated_at=${clock.toISOString()} where id=${dictionary}`;
                const sharedAccess = { ownerId: learner, shareKey: key };
                const chat = await store.create(sharedAccess, {
                    source: {
                        kind: 'dictionary',
                        id: dictionary,
                        shareLocator: locator,
                    },
                });
                await store.submit(sharedAccess, chat.id, submit());
                const turn = (await store.claim())!;
                const held = latch(),
                    mutate = latch();
                const changing = db.transaction(async (tx) => {
                    await tx.execute(
                        sql`select id from users where id=${owner} for update`,
                    );
                    held.release();
                    await mutate.promise;
                    if (change === 'owner')
                        await tx.execute(
                            sql`update dictionaries set owner_id=${replacementOwner} where id=${dictionary}`,
                        );
                    if (change === 'archive')
                        await tx.execute(
                            sql`update dictionaries set lifecycle='archived',archived_at=${clock.toISOString()},visibility='private',share_locator=null,share_key_digest=null,share_key_version=null,share_key_rotated_at=null where id=${dictionary}`,
                        );
                    if (change === 'digest')
                        await tx.execute(
                            sql`update dictionaries set share_key_digest=${cryptography.shareDigest('replacement', 1)} where id=${dictionary}`,
                        );
                    if (change === 'version')
                        await tx.execute(
                            sql`update dictionaries set share_key_version=2 where id=${dictionary}`,
                        );
                });
                const changeResult = Promise.allSettled([changing]);
                await completes(held.promise);
                const writingResult = Promise.allSettled([
                    store.append(turn, 'Must not be persisted'),
                ]);
                try {
                    await completes(
                        (async () => {
                            while (true) {
                                const [state] =
                                    await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%from "users"%' and query ilike '%for share%') as waiting`;
                                if (state?.waiting) return;
                            }
                        })(),
                    );
                } finally {
                    mutate.release();
                    await Promise.all([changeResult, writingResult]);
                }
                const [changed] = await changeResult;
                if (changed!.status === 'rejected') throw changed!.reason;
                expect((await writingResult)[0]).toMatchObject({
                    status: 'rejected',
                    reason: { code: 'conversation_not_found' },
                });
                const [frozen] =
                    await client`select source_snapshot from conversation_turns where id=${turn.id}`;
                expect(frozen?.source_snapshot).toEqual(turn.sourceSnapshot);
                expect(
                    await client`select id from conversation_messages where turn_id=${turn.id} and content like '%Must not be persisted%'`,
                ).toHaveLength(0);
            },
        );
        it('persists text and renews its lease without entering unrelated capacity admission', async () => {
            const chat = await create();
            await store.submit(access(), chat.id, submit());
            const turn = (await store.claim())!;
            const acquired = latch(),
                release = latch();
            const holding = db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                acquired.release();
                await release.promise;
            });
            await acquired.promise;
            try {
                await completes(
                    (async () => {
                        await store.append(turn, 'Still streaming');
                        await store.heartbeat(turn);
                        expect(
                            (
                                await store.stop(
                                    access(),
                                    turn.conversationId,
                                    turn.id,
                                )
                            ).status,
                        ).toBe('running');
                    })(),
                );
            } finally {
                release.release();
                await holding;
            }
            const detail = await store.detail(access(), chat.id);
            expect(detail.messages[1]?.content).toBe('Still streaming');
            await expect(store.heartbeat(turn)).rejects.toMatchObject({
                code: 'operation_interrupted',
            });
            await expect(store.append(turn, 'Late')).rejects.toMatchObject({
                code: 'operation_interrupted',
            });
        });
        it('keeps queued claim and Stop in actor-before-turn lock order', async () => {
            const chat = await create();
            await store.submit(access(), chat.id, submit());
            const actorLocked = latch();
            const releaseClaim = latch();
            const original = sources.assertActiveActor.bind(sources);
            let paused = false;
            const actorFence = vi
                .spyOn(sources, 'assertActiveActor')
                .mockImplementation(async (tx, actor, lock) => {
                    if (actor === owner && lock === 'update' && !paused) {
                        paused = true;
                        actorLocked.release();
                        await releaseClaim.promise;
                    }
                    await original(tx, actor, lock);
                });
            try {
                const claim = store.claim();
                await actorLocked.promise;
                const stopping = store.stop(
                    access(),
                    chat.id,
                    (
                        await client`
                    select id from conversation_turns where conversation_id=${chat.id} and status='queued'
                `
                    )[0]!.id,
                );
                const stoppedBeforeClaimContinues = await completes(stopping);
                releaseClaim.release();
                const claimed = await completes(claim);
                const stopped = stoppedBeforeClaimContinues;
                const [finalTurn] = await client`
                    select status, cancel_requested from conversation_turns
                    where conversation_id=${chat.id}
                `;
                expect(claimed).toBeNull();
                expect(stopped.status).toBe('cancelled');
                expect(finalTurn?.status).toBe('cancelled');
                expect(finalTurn?.cancel_requested).toBe(true);
            } finally {
                releaseClaim.release();
                actorFence.mockRestore();
            }
        });
        it('avoids crossed actor upgrades while streaming from shared sources', async () => {
            const otherDictionary = randomUUID();
            const firstLocator = randomUUID(),
                secondLocator = randomUUID();
            const digest = cryptography.shareDigest('crossed-key', 1);
            await client`update dictionaries set visibility='unlisted',share_locator=${firstLocator},share_key_digest=${digest},share_key_version=1,share_key_rotated_at=${clock.toISOString()} where id=${dictionary}`;
            await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag,visibility,share_locator,share_key_digest,share_key_version,share_key_rotated_at,created_at,updated_at) values (${otherDictionary},${learner},'Other shared','es','en','unlisted',${secondLocator},${digest},1,${clock.toISOString()},${clock.toISOString()},${clock.toISOString()})`;
            const firstChat = await store.create(
                { ownerId: owner, shareKey: 'crossed-key' },
                {
                    source: {
                        kind: 'dictionary',
                        id: otherDictionary,
                        shareLocator: secondLocator,
                    },
                },
            );
            const secondChat = await store.create(
                { ownerId: learner, shareKey: 'crossed-key' },
                {
                    source: {
                        kind: 'dictionary',
                        id: dictionary,
                        shareLocator: firstLocator,
                    },
                },
            );
            await store.submit(
                { ownerId: owner, shareKey: 'crossed-key' },
                firstChat.id,
                submit(),
            );
            const firstTurn = (await store.claim())!;
            await store.submit(
                { ownerId: learner, shareKey: 'crossed-key' },
                secondChat.id,
                submit(),
            );
            const secondTurn = (await store.claim())!;
            const acquired = latch(),
                release = latch();
            const original = sources.assertActiveActor.bind(sources);
            const actorFence = vi
                .spyOn(sources, 'assertActiveActor')
                .mockImplementation(async (tx, actor, lock) => {
                    await original(tx, actor, lock);
                    if (actor === learner && lock === 'update') {
                        acquired.release();
                        await release.promise;
                    }
                });
            const mutation = Promise.allSettled([
                store.withOperation(secondTurn, async () => undefined),
            ]);
            await acquired.promise;
            const progress = Promise.allSettled([
                store.append(firstTurn, 'Crossed sources stay safe'),
            ]);
            try {
                await completes(
                    (async () => {
                        while (true) {
                            const [state] =
                                await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%from "users"%' and query ilike '%for share%') as waiting`;
                            if (state?.waiting) break;
                            await new Promise((resolve) =>
                                setTimeout(resolve, 10),
                            );
                        }
                    })(),
                );
            } finally {
                release.release();
                actorFence.mockRestore();
            }
            const results = await completes(Promise.all([mutation, progress]));
            for (const [result] of results) {
                if (result?.status === 'rejected') throw result.reason;
                expect(result?.status).toBe('fulfilled');
            }
        });
        it('runs common authorized reads without the global capacity lock or exclusive knowledge-source locks', async () => {
            const chat = await create();
            const note = await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    { operationId: randomUUID(), content },
                    clock,
                ),
            );
            const noteChat = await store.create(access(), {
                source: { kind: 'knowledge', id: note.id },
            });
            const acquired = latch(),
                release = latch();
            const holding = db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.execute(
                    sql`select id from users where id=${owner} for share`,
                );
                await tx.execute(
                    sql`select id from knowledge_notes where id=${note.id} for share`,
                );
                acquired.release();
                await release.promise;
            });
            await acquired.promise;
            try {
                await completes(
                    Promise.all([
                        store.events(access(), chat.id, 0),
                        store.detail(access(), chat.id),
                        store.context(access(), chat.id, 'ser'),
                        store.list(access(), {
                            kind: 'dictionary',
                            id: dictionary,
                        }),
                        store.settings(owner),
                        store.events(access(), noteChat.id, 0),
                        store.detail(access(), noteChat.id),
                    ]),
                );
            } finally {
                release.release();
                await holding;
            }
        });
        it('allows unrelated admission and terminal settlement while a live event read waits for its own conversation row', async () => {
            const chat = await create(),
                otherDictionary = randomUUID();
            await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values (${otherDictionary},${learner},'Other source','es','en')`;
            const other = await store.create(
                { ownerId: learner },
                { source: { kind: 'dictionary', id: otherDictionary } },
            );
            const acquired = latch(),
                release = latch();
            const holding = db.transaction(async (tx) => {
                await tx.execute(
                    sql`select id from conversation_chats where id=${chat.id} for update`,
                );
                acquired.release();
                await release.promise;
            });
            await acquired.promise;
            const polling = store.events(access(), chat.id, 0);
            try {
                await completes(
                    (async () => {
                        while (true) {
                            const [state] =
                                await client`select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%from "conversation_chats"%' and query ilike '%for %') as waiting`;
                            if (state?.waiting) break;
                            await new Promise((resolve) =>
                                setTimeout(resolve, 10),
                            );
                        }
                    })(),
                );
                await completes(
                    (async () => {
                        await store.submit(
                            { ownerId: learner },
                            other.id,
                            submit(),
                        );
                        const claimed = (await store.claim())!;
                        await store.finish(claimed, 'succeeded');
                    })(),
                );
            } finally {
                release.release();
                await holding;
                await polling;
            }
        });
        it('holds one running conversation per actor across conversations', async () => {
            const first = await create(),
                second = await create();
            await store.submit(access(), first.id, submit());
            await store.submit(access(), second.id, submit());
            const [left, right] = await Promise.all([
                store.claim(),
                store.claim(),
            ]);
            expect([left, right].filter(Boolean)).toHaveLength(1);
            await store.finish((left ?? right)!, 'succeeded');
            expect(await store.claim()).not.toBeNull();
        });
        it('keeps explicitly authorized copied attachments when their originating source is permanently erased', async () => {
            const originating = await create();
            const copied = await store.context(access(), originating.id, 'ser');
            const hostSource = randomUUID();
            await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values (${hostSource},${owner},'Other learning','es','en')`;
            const host = await store.create(access(), {
                source: { kind: 'dictionary', id: hostSource },
            });
            const turn = await store.submit(access(), host.id, {
                ...submit('Explain this copied card.'),
                attachments: copied.material,
            });
            await store.stop(access(), host.id, turn.id);
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await eraseConversationContent(
                    tx,
                    { sourceKind: 'dictionary', sourceIds: [dictionary] },
                    clock,
                );
                await tx.execute(
                    sql`delete from dictionaries where id=${dictionary}`,
                );
            });
            await expect(
                store.detail(access(), originating.id),
            ).rejects.toMatchObject({ code: 'conversation_not_found' });
            const detail = await store.detail(access(), host.id);
            expect(detail.messages[0]?.attachments).toEqual(copied.material);
            expect(detail.messages[0]?.attachments[0]?.content).toContain(
                'Soy médico.',
            );
        });
        it('bounds physical replay cleanup and preserves events for conversations with active work', async () => {
            const terminal = await create();
            const stopped = await store.submit(access(), terminal.id, submit());
            await store.stop(access(), terminal.id, stopped.id);
            const active = await create();
            await store.submit(access(), active.id, submit());
            const expired = new Date(
                clock.getTime() - 86_400_001,
            ).toISOString();
            await client`insert into conversation_events(conversation_id,type,data,created_at) select ${terminal.id},'turn','{}',${expired} from generate_series(1,1005)`;
            await client`insert into conversation_events(conversation_id,type,data,created_at) values (${active.id},'turn','{}',${expired})`;
            expect(await store.claim()).not.toBeNull();
            expect(
                await client`select id from conversation_events where conversation_id=${terminal.id} and created_at=${expired}`,
            ).toHaveLength(5);
            expect(
                await client`select id from conversation_events where conversation_id=${active.id} and created_at=${expired}`,
            ).toHaveLength(1);
            expect(await store.claim()).toBeNull();
            expect(
                await client`select id from conversation_events where conversation_id=${terminal.id} and created_at=${expired}`,
            ).toHaveLength(0);
            expect(
                await client`select id from conversation_events where conversation_id=${active.id} and created_at=${expired}`,
            ).toHaveLength(1);
        });
        it('enforces the shared global running limit across different actors', async () => {
            const locator = randomUUID();
            await client`update dictionaries set visibility='unlisted',share_locator=${locator},share_key_digest=${cryptography.shareDigest('key', 1)},share_key_version=1,share_key_rotated_at=${clock.toISOString()} where id=${dictionary}`;
            for (let index = 0; index < 11; index++) {
                const actor = randomUUID();
                await client`insert into users(id,status) values (${actor},'active')`;
                const actorAccess = { ownerId: actor, shareKey: 'key' };
                const chat = await store.create(actorAccess, {
                    source: {
                        kind: 'dictionary',
                        id: dictionary,
                        shareLocator: locator,
                    },
                });
                await store.submit(actorAccess, chat.id, submit());
            }
            const claims = await Promise.all(
                Array.from({ length: 11 }, () => store.claim()),
            );
            expect(claims.filter(Boolean)).toHaveLength(10);
            expect(await store.claim()).toBeNull();
            await store.finish(claims.find(Boolean)!, 'succeeded');
            expect(await store.claim()).not.toBeNull();
        });
        it('runs a bounded worker against the real persistence fence and pins explicit note drafts', async () => {
            const note = await db.transaction((tx) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    { operationId: randomUUID(), content },
                    clock,
                ),
            );
            await expect(
                store.create(
                    { ownerId: learner },
                    { source: { kind: 'knowledge', id: note.id } },
                ),
            ).rejects.toMatchObject({ code: 'knowledge_not_found' });
            const chat = await store.create(access(), {
                source: { kind: 'knowledge', id: note.id },
            });
            await store.submit(access(), chat.id, {
                ...submit(),
                editorContext: workspaceContext('Unsaved learner explanation.'),
            });
            const worker = new ConversationWorkerService({
                store,
                createRunner: () => ({
                    run: async (input) => {
                        expect(input.sourceContext.provenance).toBe('draft');
                        await input.onTool?.({
                            id: 'proposal-1',
                            name: 'propose_knowledge_note',
                            state: 'running',
                        });
                        await input.onDraft({
                            ...content,
                            summary: 'A suggested revision.',
                        });
                        await input.onTool?.({
                            id: 'proposal-1',
                            name: 'propose_knowledge_note',
                            state: 'succeeded',
                        });
                        await input.onDelta({
                            messageId: randomUUID(),
                            text: 'Review this draft.',
                        });
                        return { text: 'Review this draft.' };
                    },
                }),
            });
            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );
            expect(await worker.processNext(new AbortController().signal)).toBe(
                false,
            );
            const detail = ConversationDetailSchema.parse(
                await store.detail(access(), chat.id),
            );
            expect(detail.turns[0]?.status).toBe('succeeded');
            expect(detail.messages[1]).toMatchObject({
                content: 'Review this draft.',
                sourceProvenance: 'draft',
                toolCalls: [
                    {
                        id: 'proposal-1',
                        name: 'propose_knowledge_note',
                        state: 'succeeded',
                    },
                ],
            });
            expect(detail.drafts[0]).toMatchObject({
                targetNoteId: note.id,
                expectedNoteVersion: note.version,
            });
            expect(
                (
                    await db.transaction((tx) =>
                        new DrizzleKnowledgeTransactionParticipant(tx).get(
                            owner,
                            note.id,
                        ),
                    )
                ).summary,
            ).toBe(content.summary);
        });
    },
);
