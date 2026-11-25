import {
    nativeGeminiFixture,
    seedNativeGeminiPrice,
} from '../../../support/native-provider-price-fixture';
import { readTutorPlannerState } from '../../../../src/modules/conversations/application/tutor-planner-prompt';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    onTestFinished,
    vi,
} from 'vitest';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
    GenerationPlanSchema,
    parseCreditMilli,
    SubmitConversationTurnRequestSchema,
    type KnowledgeBody,
    type LearningBlock,
} from '@languon/contracts';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { createConversationWorkerComposition } from '../../../../src/modules/conversations/infrastructure/conversation-worker-composition';
import {
    conversationAdmission,
    settleInterruptedConversationCalls,
} from '../../../../src/modules/conversations/infrastructure/conversation-accounting';
import { DrizzleConversationStore } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import {
    conversationMessagesTable as persistedMessages,
    conversationTurnsTable as turns,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { knowledgeBodyPlainText } from '../../../../src/modules/knowledge/domain/knowledge';
import { DrizzleKnowledgeTransactionParticipant } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiProviderPriceRevisionsTable as providerPrices } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { capabilityPolicyRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { dictionaryAiWorkerObservationsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { conversationExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { textAiPreferencesTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import { textAiProbesTable as probes } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/probe-schema';
import { pinProviderPrice } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import {
    firstReadingReplies,
    frenchLessonRecoveryProvider,
} from '../../../support/first-reading-replies';
import { namedExerciseFixture } from '../../../support/named-exercise-fixture';
import {
    fixtureRouteFingerprint,
    seedTextAiRoutingFixture,
    textAiFixtureCredentials,
} from '../../../support/text-ai-routing-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const secret = 'synthetic-conversation-production-regression-secret';
const model = textAiModelCatalog.find(
    (item) =>
        item.providerId === 'openrouter' && item.id === 'openai/gpt-6-luna',
)!;
const content = {
    title: 'French vocabulary',
    summary: '',
    categories: [],
    studiedLanguage: 'fr',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 2 as const,
        document: {
            type: 'doc' as const,
            content: [
                {
                    type: 'paragraph' as const,
                    content: [
                        { type: 'text' as const, text: 'French vocabulary.' },
                    ],
                },
            ],
        },
    },
};

function proposalBlocks(body: unknown): LearningBlock[] {
    const content =
        body && typeof body === 'object' && 'document' in body
            ? (body as { document?: { content?: unknown[] } }).document?.content
            : undefined;

    return (content ?? []).flatMap((node) => {
        if (
            node &&
            typeof node === 'object' &&
            (node as { type?: unknown }).type === 'learningBlock'
        ) {
            const block = (node as { attrs?: { block?: unknown } }).attrs
                ?.block;

            return block ? [block as LearningBlock] : [];
        }

        return [];
    });
}

function contentBody(blocks: LearningBlock[]): KnowledgeBody {
    return {
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: blocks.map((block) => ({
                type: 'learningBlock',
                attrs: { block },
            })),
        },
    };
}

async function listContentProposalsWithBlocks(
    store: DrizzleConversationStore,
    ...args: Parameters<DrizzleConversationStore['listContentProposals']>
) {
    const result = await store.listContentProposals(...args);

    return {
        proposals: result.proposals.map((proposal) => ({
            ...proposal,
            blocks: proposalBlocks(proposal.body),
        })),
    };
}

async function applyContentProposal(
    store: DrizzleConversationStore,
    ...args: Parameters<DrizzleConversationStore['applyContentProposal']>
) {
    return store.applyContentProposal(...args);
}

async function drainLessonStages(
    worker: ReturnType<typeof createConversationWorkerComposition>,
) {
    for (let stage = 0; stage < 8; stage++) {
        if (!(await worker.processNext(new AbortController().signal))) {
            break;
        }
    }
}

/** Keep real admission, the production worker, Mastra SDK and settlement; replace only external HTTP. */
describe.runIf(isDatabaseIntegrationEnabled())(
    'production conversation execution after reduced admission',
    { timeout: 30_000 },
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let ownerId: string;
        let store: DrizzleConversationStore;
        let knowledge: DrizzleKnowledgeStore;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 120_000);

        afterAll(async () => {
            await client?.end();
        });

        afterEach(() => {
            vi.unstubAllGlobals();
            vi.unstubAllEnvs();
        });

        beforeEach(async () => {
            vi.stubEnv('DICTIONARY_AI_MANAGED_ROUTING_ENABLED', 'true');
            for (const [key, value] of Object.entries(
                textAiFixtureCredentials,
            )) {
                vi.stubEnv(key, value);
            }

            await client`truncate dictionary_ai_worker_observations, users, ai_capability_policy_revisions, ai_accounting_settings_revisions, ai_provider_price_revisions, text_ai_routing_revisions cascade`;
            await seedLegacyActionFixture(db, '1000');
            // The shared legacy fixture includes checks for its default route.
            // Start this disposable execution regression with no diagnostic history.
            await client`truncate text_ai_probes, text_ai_route_health_events cascade`;
            const [previous] = await db
                .select()
                .from(providerPrices)
                .where(
                    and(
                        eq(providerPrices.providerId, model.providerId),
                        eq(providerPrices.modelId, model.id),
                    ),
                )
                .orderBy(desc(providerPrices.version))
                .limit(1);
            const pricedAt = new Date();
            await db.insert(providerPrices).values({
                id: randomUUID(),
                providerId: model.providerId,
                modelId: model.id,
                meter: 'text-tokens',
                version: previous!.version + 1,
                effectiveAt: pricedAt,
                createdAt: pricedAt,
                data: {
                    ...previous!.data,
                    inputUsdPerMillionTokens: '0.125',
                    outputUsdPerMillionTokens: '0.5',
                    cacheReadUsdPerMillionTokens: '0.125',
                    cacheWriteUsdPerMillionTokens: '0.125',
                    effectiveAt: pricedAt.toISOString(),
                    reason: 'Synthetic reviewed rates differ from model catalog defaults',
                },
            });

            ownerId = randomUUID();
            await client`insert into users(id,status) values(${ownerId},'active')`;
            const crypto = new KnowledgeShareCrypto(secret);
            knowledge = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => undefined },
                crypto,
            );

            store = new DrizzleConversationStore({
                database: db,
                sources: new ConversationSourceResolver({
                    verifyDictionaryShare: () => false,
                    verifyTextShare: () => false,
                    verifyKnowledgeShare: (key, digest) =>
                        crypto.verify(key, digest),
                    readNote: (tx, actor, id) =>
                        new DrizzleKnowledgeTransactionParticipant(
                            tx,
                        ).getForSource(actor, id),
                }),
                admitTurn: conversationAdmission({
                    routingEnabled: true,
                    credentialConfigured: () => true,
                    routeFingerprint: fixtureRouteFingerprint,
                }),
                settleInterrupted: settleInterruptedConversationCalls,
                publishNote: (tx, actor, value) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).publish(
                        actor,
                        value,
                        new Date(),
                    ),
            });
        });

        async function readyLessonRoute(
            funding: 'operator' | 'customer' = 'operator',
            expensivePlanner = false,
            routeModel = model,
        ) {
            const now = new Date();
            await db.insert(capabilityPolicyRevisionsTable).values({
                id: randomUUID(),
                capability: 'conversation',
                version: 1,
                funding,
                createdAt: now,
                reason: 'Synthetic production context regression',
            });

            await seedTextAiRoutingFixture(db, {
                routeId: `${routeModel.providerId}/${routeModel.id}`,
                replace: true,
                seedProbes: false,
                ...(funding === 'operator'
                    ? { omittedTariffFlows: ['conversation'] }
                    : {
                          tariff: {
                              inputCreditsPerMillionTokens: 1000,
                              outputCreditsPerMillionTokens: 500,
                              cachedInputCreditsPerMillionTokens: 1000,
                          },
                      }),
            });

            if (funding === 'customer') {
                await db.insert(textAiPreferencesTable).values({
                    userId: ownerId,
                    mode: 'auto',
                    maxCreditsPerAction: '500',
                    version: 1,
                });

                await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                        ownerId,
                        amount: 1_000_000n,
                        createdAt: now,
                        expiresAt: null,
                        source: 'admin',
                        sourceReference: randomUUID(),
                    }),
                );
            }

            if (expensivePlanner) {
                // The provider limit permits a viable partial stage, independently of ample customer credit.
                const [price] = await db
                    .select()
                    .from(providerPrices)
                    .where(
                        and(
                            eq(
                                providerPrices.providerId,
                                routeModel.providerId,
                            ),
                            eq(providerPrices.modelId, routeModel.id),
                        ),
                    )
                    .orderBy(desc(providerPrices.version))
                    .limit(1);

                await db.insert(providerPrices).values({
                    ...price!,
                    id: randomUUID(),
                    version: price!.version + 1,
                    effectiveAt: now,
                    createdAt: now,
                    data: {
                        ...price!.data,
                        inputUsdPerMillionTokens: '9',
                        outputUsdPerMillionTokens: '3.5',
                        effectiveAt: now.toISOString(),
                    },
                });
            }

            await db.insert(dictionaryAiWorkerObservationsTable).values({
                id: conversationExecutionObservationId(
                    'production-conversation-regression',
                    routeModel.providerId,
                    routeModel.id,
                ),
                workerId: 'production-conversation-regression',
                providerId: routeModel.providerId,
                modelId: routeModel.id,
                adapterRevision: routeModel.adapterRevision,
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 120_000),
                status: 'available',
                message: 'Synthetic production composition readiness',
                textAiSelectionRevision: 1,
                textAiSupportedFormats: ['conversation:v1'],
                textAiCapacityRevision: 1,
                textsCapacityRevision: 1,
                conversationCapacityRevision: 1,
                conversationExecutionRevision: 1,
                creditSettlementRevision: 1,
            });
        }

        it('quotes zero-credit operator-funded continuation before admitting a new action', async () => {
            await readyLessonRoute();
            const note = await knowledge.create(ownerId, {
                operationId: randomUUID(),
                content,
            });
            const workspace = await knowledge.getWorkspace(ownerId, note.id);
            const branch = workspace.branches.find(
                (item) => item.id === workspace.preferredBranchId,
            )!;
            const chat = await store.create(
                { ownerId },
                { source: { kind: 'knowledge', id: note.id } },
            );

            await store.submit(
                { ownerId },
                chat.id,
                SubmitConversationTurnRequestSchema.parse({
                    requestId: randomUUID(),
                    content: 'Prepare a French lesson.',
                    editorContext: {
                        content: '',
                        editorTarget: {
                            from: 0,
                            to: 0,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update('')
                                .digest('hex'),
                        },
                        workingBranch: {
                            id: branch.id,
                            version: branch.version,
                        },
                    },
                }),
            );

            const first = (await store.claim())!;
            const run = await store.startGeneration(
                first,
                GenerationPlanSchema.parse({
                    schemaVersion: 1,
                    replyLanguage: 'en',
                    sources: [],
                    tasks: [
                        {
                            id: 'intro',
                            kind: 'prose',
                            instruction: 'Introduce French grammar.',
                            language: 'fr',
                            inputs: [],
                        },
                        {
                            id: 'grammar',
                            kind: 'grammar',
                            instruction: 'Explain COD and COI.',
                            language: 'fr',
                            explanationLanguage: 'fr',
                            inputs: [],
                        },
                    ],
                    outputOrder: ['intro', 'grammar'],
                }),
                [],
            );

            await store.stop({ ownerId }, chat.id, first.id);
            await store.finish(first, 'cancelled');
            const request = { requestId: randomUUID(), expectedRevision: 1 };
            let quoteId = '';
            await expect(
                store.continueGenerationRun(
                    { ownerId },
                    chat.id,
                    run.runId,
                    request,
                ),
            ).rejects.toSatisfy(
                (error: {
                    code: string;
                    quote: { id: string; maximumCredits: string };
                }) => {
                    expect(error.code).toBe('action_confirmation_required');
                    expect(error.quote.maximumCredits).toBe('0');
                    quoteId = error.quote.id;

                    return true;
                },
            );

            const [offered] =
                await client`select held_milli, output_allowance from ai_credit_action_quotes where id=${quoteId}::uuid`;

            expect(offered?.held_milli).toBe('0');
            expect(offered?.output_allowance).toBeGreaterThan(0);
            const [before] =
                await client`select count(*)::integer as count from conversation_turns where conversation_id=${chat.id}::uuid`;

            expect(before?.count).toBe(1);
            const resumed = await store.continueGenerationRun(
                { ownerId },
                chat.id,
                run.runId,
                { ...request, confirmedQuoteId: quoteId },
            );

            expect(resumed.status).toBe('queued');
            const [action] =
                await client`select funding, held_milli from ai_credit_actions where id=${resumed.id}::uuid`;

            expect(action).toMatchObject({
                funding: 'operator',
                held_milli: '0',
            });

            await store.stop({ ownerId }, chat.id, resumed.id);
            await expect(
                client`insert into ai_credit_action_quotes(id,owner_id,conversation_id,request_id,fingerprint,authorization_fingerprint,held_milli,output_allowance,expires_at) values (${randomUUID()},${ownerId},${chat.id},${randomUUID()},'negative','negative',-1,100,now())`,
            ).rejects.toMatchObject({ code: '23514' });
        });

        it('atomically transfers nonempty pending source snapshots to a run while preserving proposal history and unrelated memory', async () => {
            await readyLessonRoute();
            const sourceSentinel = `private-source-${randomUUID()}`;
            const grammar = {
                id: randomUUID(),
                type: 'grammar' as const,
                language: 'fr',
                rule: sourceSentinel,
            };
            const note = await knowledge.create(ownerId, {
                operationId: randomUUID(),
                content: { ...content, body: contentBody([grammar]) },
            });
            const workspace = await knowledge.getWorkspace(ownerId, note.id);
            const branch = workspace.branches.find(
                (item) => item.id === workspace.preferredBranchId,
            )!;
            const chat = await store.create(
                { ownerId },
                { source: { kind: 'knowledge', id: note.id } },
            );

            await store.submit(
                { ownerId },
                chat.id,
                SubmitConversationTurnRequestSchema.parse({
                    requestId: randomUUID(),
                    content: 'Practice this grammar.',
                    editorContext: {
                        content: '',
                        editorTarget: {
                            from: 0,
                            to: 0,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update('')
                                .digest('hex'),
                        },
                        workingBranch: {
                            id: branch.id,
                            version: branch.version,
                        },
                    },
                }),
            );

            const turn = (await store.claim())!;
            const priorProposal = {
                id: randomUUID(),
                summary: 'Previously proposed vocabulary.',
                kinds: ['vocabulary'],
                ordinal: 1,
            };
            const pendingProposalId = randomUUID();
            const pending = {
                pending: {
                    tasks: [
                        {
                            id: 'practice',
                            kind: 'exercises',
                            instruction: 'Practice the captured source.',
                            language: 'fr',
                            explanationLanguage: 'fr',
                            source: { kind: 'editor' },
                            count: 1,
                            activities: [{ activityId: 'G02', count: 1 }],
                        },
                    ],
                    outputOrder: ['practice'],
                },
                replyLanguage: 'en',
                proposals: [priorProposal],
                pendingProposalIds: [pendingProposalId],
                pendingSources: {
                    blocks: [grammar],
                    tasks: [{ taskId: 'practice', blockIds: [grammar.id] }],
                },
            };

            await store.memory(turn).writeState({
                'learning-request:v1': pending,
                'independent-state': { marker: 'retain-this-memory' },
            });

            const readMemory = async () => {
                const rows =
                    await client`select key,value from conversation_memory where conversation_id=${chat.id}::uuid`;

                return Object.fromEntries(
                    rows.map((row) => [row.key, row.value]),
                );
            };

            expect((await readMemory())['learning-request:v1']).toEqual(
                pending,
            );

            const plan = GenerationPlanSchema.parse({
                schemaVersion: 1,
                replyLanguage: 'en',
                sources: [
                    {
                        id: 'rule',
                        kind: 'grammar',
                        reference: { kind: 'block', blockId: grammar.id },
                    },
                ],
                tasks: [
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction: 'Practice the captured source.',
                        language: 'fr',
                        explanationLanguage: 'fr',
                        inputs: [{ kind: 'source', sourceId: 'rule' }],
                        activities: [{ activityId: 'G02', count: 1 }],
                    },
                ],
                outputOrder: ['practice'],
            });
            const run = await store.startGeneration(turn, plan, [
                { sourceId: 'rule', blocks: [grammar] },
            ]);
            const transferred = await readMemory();
            expect(transferred).toMatchObject({
                'learning-request:v1': {
                    pending: null,
                    proposals: [priorProposal],
                    replyLanguage: 'en',
                },
                'independent-state': { marker: 'retain-this-memory' },
            });

            expect(
                transferred['learning-request:v1'].pendingSources,
            ).toBeUndefined();

            expect(
                transferred['learning-request:v1'].pendingProposalIds,
            ).toBeUndefined();

            expect(JSON.stringify(transferred)).not.toContain(sourceSentinel);
            expect(JSON.stringify(transferred)).not.toContain(
                pendingProposalId,
            );

            expect(
                (await store.generationContext(turn))?.sources[0]?.blocks,
            ).toEqual([grammar]);

            await store.stop({ ownerId }, chat.id, turn.id);
            await store.finish(turn, 'cancelled');
            await store.discardGenerationRun({ ownerId }, chat.id, run.runId, {
                requestId: randomUUID(),
                expectedRevision: 1,
            });

            expect(await readMemory()).toEqual(transferred);
        });

        it.each([
            { finish: 'stop', repair: 'valid', native: false },
            { finish: 'stop', repair: 'valid', native: true },
            { finish: 'stop', repair: 'invalid', native: false },
            { finish: 'tool_calls', repair: 'valid', native: false },
            { finish: 'content_filter', repair: 'filtered', native: false },
        ] as const)(
            'bounds repair of the first measured prose response and grounds its dependent exercise ($finish, repair $repair, native $native)',
            async ({ finish, repair, native }) => {
                const routeModel = native ? nativeGeminiFixture : model;
                if (native) {
                    await seedNativeGeminiPrice(db);
                }

                await readyLessonRoute('operator', false, routeModel);
                const note = await knowledge.create(ownerId, {
                    operationId: randomUUID(),
                    content,
                });
                const workspace = await knowledge.getWorkspace(
                    ownerId,
                    note.id,
                );
                const branch = workspace.branches.find(
                    (item) => item.id === workspace.preferredBranchId,
                )!;
                const chat = await store.create(
                    { ownerId },
                    { source: { kind: 'knowledge', id: note.id } },
                );
                const fullLesson = finish === 'stop' && repair === 'valid';
                const { passage, replies } = firstReadingReplies(
                    fullLesson,
                    repair === 'invalid',
                );
                const requests: string[] = [];
                vi.stubGlobal(
                    'fetch',
                    vi.fn(async (_url: unknown, request: RequestInit) => {
                        const index = requests.length;
                        requests.push(String(request.body));
                        if (index >= replies.length) {
                            throw new Error('Unplanned provider dispatch.');
                        }

                        return Response.json({
                            id: `reading-${index}`,
                            object: 'chat.completion',
                            created: 1,
                            model: routeModel.id,
                            provider: native ? 'Google' : 'OpenAI',
                            choices: [
                                {
                                    index: 0,
                                    message: {
                                        role: 'assistant',
                                        content:
                                            repair === 'invalid' && index === 3
                                                ? 'invalid compact fallback'
                                                : replies[index],
                                    },
                                    finish_reason:
                                        index === 1 ? finish : 'stop',
                                },
                            ],
                            usage: {
                                prompt_tokens: 50,
                                completion_tokens: index === 1 ? 1045 : 80,
                                total_tokens: index === 1 ? 1095 : 130,
                                cost: 0.00001,
                            },
                        });
                    }),
                );

                const submitted = await store.submit({ ownerId }, chat.id, {
                    requestId: randomUUID(),
                    content: fullLesson
                        ? 'Create a French lesson with a reading about democracy, three different comprehension exercises, a COD and COI grammar block covering the passive voice, and five grammar exercises.'
                        : 'Write a French reading and a comprehension exercise based on it.',
                    attachments: [],
                    editorContext: {
                        content: 'French vocabulary.',
                        editorTarget: {
                            from: 18,
                            to: 18,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update('French vocabulary.')
                                .digest('hex'),
                        },
                        workingBranch: {
                            id: branch.id,
                            version: branch.version,
                        },
                    },
                });
                const worker = createConversationWorkerComposition({
                    database: db,
                    dictionaryHmacSecret: secret,
                    credentials: textAiFixtureCredentials,
                });

                await drainLessonStages(worker);
                const {
                    runs: [run],
                } = await store.listGenerationRuns({ ownerId }, chat.id);

                expect(run).toBeDefined();
                const receipts = await client`
                    select v.accepted, a.output_tokens from ai_credit_action_attempts a
                    join ai_credit_structured_call_validations v on v.attempt_id=a.id
                    join conversation_generation_run_actions g on g.turn_id=a.action_id
                    where g.run_id=${run!.id}::uuid order by g.created_at, a.ordinal`;

                expect(receipts.map((row) => row.accepted)).toEqual(
                    repair === 'valid'
                        ? [
                              true,
                              false,
                              ...Array<boolean>(fullLesson ? 10 : 2).fill(true),
                          ]
                        : repair === 'filtered'
                          ? [true, false]
                          : [true, false, false, false],
                );

                expect(receipts[1]?.output_tokens).toBe(1045);
                expect(requests).toHaveLength(receipts.length);
                expect(run!.chargedCredits).toBe('0.000');
                const [action] =
                    await client`select state,held_milli,charged_milli from ai_credit_actions where id=${submitted.id}::uuid`;

                expect(action).toMatchObject({
                    state: 'settled',
                    held_milli: '0',
                    charged_milli: '0',
                });

                if (native) {
                    const nativeCalls = await client`
                        select c.input_limit, a.input_limit as admitted_input, c.observed_at
                        from ai_credit_native_call_dispatches c
                        join ai_credit_action_attempts a on a.id=c.attempt_id
                        where a.action_id=${submitted.id}::uuid`;

                    expect(nativeCalls.length).toBeGreaterThan(0);
                    for (const call of nativeCalls) {
                        expect(call.input_limit).toBeLessThanOrEqual(
                            call.admitted_input,
                        );

                        expect(call.observed_at).toBeTruthy();
                    }
                }

                if (repair === 'valid') {
                    expect(run).toMatchObject({
                        state: 'completed',
                        completedTaskCount: fullLesson ? 4 : 2,
                        proposalId: expect.any(String),
                    });

                    expect(requests[3]).toContain(passage);
                    const { proposals } = await store.listContentProposals(
                        { ownerId },
                        chat.id,
                    );

                    expect(proposals).toHaveLength(1);
                    expect(
                        knowledgeBodyPlainText(proposals[0]!.body),
                    ).toContain(passage);

                    if (fullLesson) {
                        const blocks = proposalBlocks(proposals[0]!.body);
                        expect(blocks.map((block) => block.type)).toEqual([
                            'exercise',
                            'exercise',
                            'exercise',
                            'grammar',
                            'exercise',
                            'exercise',
                            'exercise',
                            'exercise',
                            'exercise',
                        ]);
                    }
                } else {
                    expect(run).toMatchObject({
                        state: 'paused',
                        pauseReason: 'technical-failure',
                        completedTaskCount: 0,
                        proposalId: null,
                        failure:
                            repair === 'filtered'
                                ? {
                                      code: 'provider-rejected',
                                      phase: 'decode',
                                      finishReason: 'content-filter',
                                  }
                                : { code: 'schema-invalid', taskId: 'reading' },
                    });

                    expect(run!.uncertainTurnId).toBeUndefined();
                }

                if (repair === 'invalid') {
                    expect(run!.failure).toMatchObject({
                        recoveryExhausted: true,
                    });

                    expect(requests[3]).toContain(
                        'Independent compact authoring strategy',
                    );

                    expect(
                        await worker.processNext(new AbortController().signal),
                    ).toBe(false);
                }
            },
        );

        it.each([
            'fallback',
            'exhausted',
            'customer-quote',
            'customer-funded',
            'stop-recovery',
        ] as const)(
            'handles a mixed 3+5 lesson across worker lifetimes with R04 format failures (%s)',
            async (mode) => {
                await readyLessonRoute(
                    mode.startsWith('customer') ? 'customer' : 'operator',
                    mode === 'customer-quote',
                );

                const note = await knowledge.create(ownerId, {
                    operationId: randomUUID(),
                    content,
                });
                const workspace = await knowledge.getWorkspace(
                    ownerId,
                    note.id,
                );
                const branch = workspace.branches.find(
                    (item) => item.id === workspace.preferredBranchId,
                )!;
                const chat = await store.create(
                    { ownerId },
                    { source: { kind: 'knowledge', id: note.id } },
                );
                const provider = frenchLessonRecoveryProvider(
                    mode === 'exhausted',
                );

                vi.stubGlobal(
                    'fetch',
                    vi.fn(async (_url: unknown, request: RequestInit) => {
                        const reply = provider.respond(
                            JSON.parse(String(request.body)),
                        );

                        return Response.json({
                            id: `lesson-${provider.requests.length}`,
                            object: 'chat.completion',
                            created: 1,
                            model: model.id,
                            provider: 'OpenAI',
                            choices: [
                                {
                                    index: 0,
                                    message: {
                                        role: 'assistant',
                                        content: reply,
                                    },
                                    finish_reason: 'stop',
                                },
                            ],
                            usage: {
                                prompt_tokens: 50,
                                completion_tokens: 80,
                                total_tokens: 130,
                                cost: 0.00001,
                            },
                        });
                    }),
                );

                const continueCommand = vi.spyOn(
                    store,
                    'continueGenerationRun',
                );

                onTestFinished(() => continueCommand.mockRestore());
                const input = {
                    requestId: randomUUID(),
                    content:
                        'Create a French reading on democracy, three different comprehension exercises, a COD and COI grammar block covering the passive voice, and five grammar exercises.',
                    attachments: [],
                    editorContext: {
                        content: '',
                        editorTarget: {
                            from: 0,
                            to: 0,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update('')
                                .digest('hex'),
                        },
                        workingBranch: {
                            id: branch.id,
                            version: branch.version,
                        },
                    },
                };
                let quoteMaximum: bigint | undefined;
                let confirmedQuoteId: string | undefined;
                if (mode === 'customer-quote') {
                    await expect(
                        store.submit({ ownerId }, chat.id, input),
                    ).rejects.toSatisfy(
                        (error: {
                            code: string;
                            quote: {
                                id: string;
                                maximumCredits: string;
                                scope: string;
                            };
                        }) => {
                            expect(error.code).toBe(
                                'action_confirmation_required',
                            );

                            expect(error.quote.scope).toBe('lesson-if-planned');
                            confirmedQuoteId = error.quote.id;
                            quoteMaximum = parseCreditMilli(
                                error.quote.maximumCredits,
                            );

                            return true;
                        },
                    );
                }

                const turn = await store.submit({ ownerId }, chat.id, {
                    ...input,
                    ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                });

                if (quoteMaximum !== undefined) {
                    const [admitted] =
                        await client`select a.held_milli,t.execution from ai_credit_actions a join conversation_turns t on t.id=a.id where a.id=${turn.id}::uuid`;

                    expect(BigInt(admitted!.held_milli)).toBeLessThan(
                        quoteMaximum,
                    );

                    expect(
                        admitted!.execution.generationMaximumCreditsMilli,
                    ).toBe(quoteMaximum.toString());
                }

                const processStage = () =>
                    createConversationWorkerComposition({
                        database: db,
                        dictionaryHmacSecret: secret,
                        credentials: textAiFixtureCredentials,
                    }).processNext(new AbortController().signal);
                const { runs: initial } = await store.listGenerationRuns(
                    { ownerId },
                    chat.id,
                );

                expect(initial).toHaveLength(0);
                expect(await processStage()).toBe(true);
                const {
                    runs: [run],
                } = await store.listGenerationRuns({ ownerId }, chat.id);

                if (mode === 'customer-quote') {
                    expect(run).toBeUndefined();
                    expect(
                        provider.requests.map((call) => call.taskId),
                    ).toEqual(['plan']);

                    const detail = await store.detail({ ownerId }, chat.id);
                    expect(detail.turns).toMatchObject([
                        { status: 'succeeded', failureCode: null },
                    ]);

                    expect(detail.messages.at(-1)?.content).toMatch(
                        /allowance|capacity|smaller|fewer|reduce|budget/i,
                    );

                    expect(await processStage()).toBe(false);
                    expect(continueCommand).not.toHaveBeenCalled();

                    return;
                }

                expect(run).toBeDefined();

                const checkpoints = () =>
                    client`select id,artifact->>'contentHash' as hash from conversation_generation_run_artifacts where run_id=${run!.id}::uuid order by id`;
                const saved = await checkpoints();
                if (mode === 'stop-recovery') {
                    expect(provider.requests.at(-1)).toMatchObject({
                        taskId: 'practice',
                        ordinal: 3,
                        strategy: 'initial',
                    });

                    expect(run).toMatchObject({
                        state: 'paused',
                        automation: { enabled: true },
                    });

                    const calls = provider.requests.length;
                    const stopped = await store.stopGenerationRun(
                        { ownerId },
                        chat.id,
                        run!.id,
                        { requestId: randomUUID(), expectedRevision: 1 },
                    );

                    expect(stopped.run).toMatchObject({
                        state: 'paused',
                        pauseReason: 'stopped',
                    });

                    expect(await processStage()).toBe(false);
                    expect(provider.requests).toHaveLength(calls);
                    expect(await checkpoints()).toEqual(saved);
                    expect(continueCommand).not.toHaveBeenCalled();

                    return;
                }

                // Every step starts a new worker, with an idle browser reading progress between stages.
                for (let stage = 0; stage < 16; stage++) {
                    await store.getGenerationRun({ ownerId }, chat.id, run!.id);
                    if (!(await processStage())) {
                        break;
                    }
                }

                const { run: finished } = await store.getGenerationRun(
                    { ownerId },
                    chat.id,
                    run!.id,
                );
                const { proposals } = await store.listContentProposals(
                    { ownerId },
                    chat.id,
                );

                expect(continueCommand).not.toHaveBeenCalled();
                expect(await checkpoints()).toEqual(
                    expect.arrayContaining(saved),
                );

                expect(
                    provider.requests
                        .filter(
                            (call) =>
                                call.taskId === 'practice' &&
                                call.ordinal === 3,
                        )
                        .map((call) => call.strategy),
                ).toEqual(['initial', 'repair', 'fallback']);

                expect(provider.requests.every((call) => call.grounded)).toBe(
                    true,
                );

                const history =
                    await client`select unit->>'strategy' as strategy, unit->>'outcome' as outcome, unit->>'turnId' as turn_id,unit->>'validationId' as validation_id
                    from conversation_generation_plan_revisions r, jsonb_array_elements(r.unit_attempts) unit
                    where r.run_id=${run!.id}::uuid and unit->>'taskId'='practice' and unit->>'unitOrdinal'='3'`;

                expect(
                    history.map((row) => [row.strategy, row.outcome]),
                ).toEqual([
                    ['initial', 'rejected'],
                    ['repair', 'rejected'],
                    [
                        'fallback',
                        mode === 'exhausted' ? 'rejected' : 'accepted',
                    ],
                ]);

                expect(
                    new Set(history.map((row) => row.validation_id)).size,
                ).toBe(3);

                const attempts =
                    await client`select a.id,v.accepted from ai_credit_action_attempts a
                    join ai_credit_structured_call_validations v on v.attempt_id=a.id
                    join conversation_generation_run_actions g on g.turn_id=a.action_id where g.run_id=${run!.id}::uuid`;

                expect(attempts).toHaveLength(provider.requests.length);
                expect(new Set(attempts.map((row) => row.id)).size).toBe(
                    attempts.length,
                );

                expect(attempts.filter((row) => !row.accepted)).toHaveLength(
                    mode === 'exhausted' ? 3 : 2,
                );

                const unsettled =
                    await client`select a.id from ai_credit_actions a join conversation_generation_run_actions g on a.id=g.turn_id where g.run_id=${run!.id}::uuid and (a.state<>'settled' or (a.funding='operator' and (a.held_milli<>0 or a.charged_milli<>0)))`;

                expect(unsettled).toHaveLength(0);
                if (mode === 'exhausted') {
                    expect(finished).toMatchObject({
                        state: 'paused',
                        pauseReason: 'technical-failure',
                        failure: {
                            recoveryExhausted: true,
                            taskId: 'practice',
                        },
                    });

                    expect(proposals).toHaveLength(0);
                    expect(await processStage()).toBe(false);
                    await expect(
                        store.continueGenerationRun(
                            { ownerId },
                            chat.id,
                            run!.id,
                            { requestId: randomUUID(), expectedRevision: 1 },
                        ),
                    ).rejects.toMatchObject({ code: 'version_conflict' });

                    expect(await processStage()).toBe(false);

                    return;
                }

                expect(finished).toMatchObject({
                    state: 'completed',
                    completedTaskCount: 4,
                    proposalId: expect.any(String),
                });

                expect(provider.requests).toHaveLength(13);
                expect(proposals).toHaveLength(1);
                if (mode === 'customer-funded') {
                    // Each of the 11 accepted calls costs 90 milli-credits at the fixture tariff.
                    expect(parseCreditMilli(finished.chargedCredits)).toBe(
                        990n,
                    );

                    expect(
                        await client`select id from ai_credit_action_quotes where conversation_id=${chat.id}::uuid`,
                    ).toHaveLength(0);
                }

                const blocks = proposalBlocks(proposals[0]!.body);
                for (const block of blocks.slice(0, 3)) {
                    expect(block).toMatchObject({
                        type: 'exercise',
                        semantics: {
                            sources: [
                                {
                                    kind: 'generated-text',
                                    origin: {
                                        runId: run!.id,
                                        revision: 1,
                                        taskId: 'reading',
                                    },
                                },
                            ],
                        },
                    });
                }

                const grammarBlock = blocks[3]!;
                for (const block of blocks.slice(4)) {
                    expect(block).toMatchObject({
                        type: 'exercise',
                        semantics: {
                            sources: [
                                {
                                    kind: 'grammar',
                                    origin: { blockId: grammarBlock.id },
                                },
                            ],
                        },
                    });
                }

                expect(
                    blocks.map((block) =>
                        block.type === 'exercise'
                            ? block.semantics?.activity.id
                            : block.type,
                    ),
                ).toEqual([
                    'R01',
                    'R08',
                    'R04',
                    'grammar',
                    'G01',
                    'G01',
                    'G02',
                    'G02',
                    'G03',
                ]);
            },
        );

        it.each(['operator', 'customer'] as const)(
            'resumes a pre-upgrade R04 with a confirmed allowance and preserves the two saved exercises (%s)',
            async (funding) => {
                await readyLessonRoute(funding);
                // A zero input rate makes the synthetic token cohort independent of each unit's prompt width.
                const [price] = await db
                    .select()
                    .from(providerPrices)
                    .where(
                        and(
                            eq(providerPrices.modelId, model.id),
                            eq(providerPrices.providerId, model.providerId),
                        ),
                    )
                    .orderBy(desc(providerPrices.version))
                    .limit(1);
                const now = new Date();
                await db.insert(providerPrices).values({
                    ...price!,
                    id: randomUUID(),
                    version: price!.version + 1,
                    effectiveAt: now,
                    createdAt: now,
                    data: {
                        ...price!.data,
                        inputUsdPerMillionTokens: '0',
                        cacheReadUsdPerMillionTokens: '0',
                        cacheWriteUsdPerMillionTokens: '0',
                        effectiveAt: now.toISOString(),
                    },
                });

                const note = await knowledge.create(ownerId, {
                    operationId: randomUUID(),
                    content,
                });
                const workspace = await knowledge.getWorkspace(
                    ownerId,
                    note.id,
                );
                const branch = workspace.branches.find(
                    (item) => item.id === workspace.preferredBranchId,
                )!;
                const chat = await store.create(
                    { ownerId },
                    { source: { kind: 'knowledge', id: note.id } },
                );
                const { replies } = firstReadingReplies(true, false);
                const [plan, , ...remaining] = replies;
                const outputs = [plan, ...remaining];
                const realNow = Date.now.bind(Date);
                let elapsedStageMs = 0;
                const clock = vi
                    .spyOn(Date, 'now')
                    .mockImplementation(() => realNow() + elapsedStageMs);

                onTestFinished(() => clock.mockRestore());
                let dispatched = 0;
                vi.stubGlobal(
                    'fetch',
                    vi.fn(async () => {
                        if (dispatched >= outputs.length) {
                            throw Error('Unexpected extra dispatch.');
                        }

                        const completion = outputs[dispatched++];
                        if (dispatched === 4) {
                            elapsedStageMs = 80_000;
                        }

                        return Response.json({
                            id: `stage-${dispatched}`,
                            object: 'chat.completion',
                            created: 1,
                            model: model.id,
                            provider: 'OpenAI',
                            choices: [
                                {
                                    index: 0,
                                    message: {
                                        role: 'assistant',
                                        content: completion,
                                    },
                                    finish_reason: 'stop',
                                },
                            ],
                            usage: {
                                prompt_tokens: 50,
                                completion_tokens: 80,
                                total_tokens: 130,
                                cost: 0.00001,
                            },
                        });
                    }),
                );

                const turn = await store.submit({ ownerId }, chat.id, {
                    requestId: randomUUID(),
                    content:
                        'Create a French reading with three exercises, then grammar and five exercises.',
                    attachments: [],
                    editorContext: {
                        content: '',
                        editorTarget: {
                            from: 0,
                            to: 0,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update('')
                                .digest('hex'),
                        },
                        workingBranch: {
                            id: branch.id,
                            version: branch.version,
                        },
                    },
                });
                const worker = createConversationWorkerComposition({
                    database: db,
                    dictionaryHmacSecret: secret,
                    credentials: textAiFixtureCredentials,
                });

                // Advance through the reading and two comprehension exercises with the real
                // worker, then reproduce the exact persisted authorization state of an old run.
                for (let stage = 0; stage < 4 && dispatched < 4; stage++) {
                    expect(
                        await worker.processNext(new AbortController().signal),
                    ).toBe(true);
                }

                elapsedStageMs = 0;
                const {
                    runs: [run],
                } = await store.listGenerationRuns({ ownerId }, chat.id);

                expect(run).toMatchObject({
                    state: 'paused',
                    completedTaskCount: 1,
                    activeTurnId: null,
                });

                expect(run!.tasks[1]).toMatchObject({
                    completedUnitCount: 2,
                    totalUnitCount: 3,
                });

                expect(dispatched).toBe(4);
                await client.begin(async (tx) => {
                    await tx`update conversation_generation_runs set automation=null,
                    pause_reason='technical-failure',failure=jsonb_build_object('code','schema-invalid','taskId','practice','unitOrdinal',3,'referenceId',${turn.id}::text)
                    where id=${run!.id}::uuid`;

                    await tx`update conversation_generation_plan_revisions set unit_attempts='[]'::jsonb where run_id=${run!.id}::uuid`;
                });

                expect(
                    await worker.processNext(new AbortController().signal),
                ).toBe(false);

                const saved =
                    await client`select id,artifact->>'contentHash' as hash from conversation_generation_run_artifacts where run_id=${run!.id}::uuid order by id`;

                expect(saved).toHaveLength(3);
                const archiveId = randomUUID();
                // Seed 24h usage via the same archival projection trigger used after a completed action is removed.
                await client`insert into dictionary_generation_provider_usage_archive
                (id,owner_id,settled_at,actual_cost_micros,actual_input_tokens,actual_output_tokens,input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens,max_cost_micros_per_attempt,max_input_tokens_per_attempt,max_output_tokens_per_attempt)
                select ${archiveId}::uuid,${ownerId}::uuid,now(),0,0,83044,
                (budget->>'inputCostMicrosPerMillionTokens')::integer,(budget->>'outputCostMicrosPerMillionTokens')::integer,
                (budget->>'maxCostMicrosPerAttempt')::integer,(budget->>'maxInputTokensPerAttempt')::integer,(budget->>'maxOutputTokensPerAttempt')::integer
                from ai_credit_action_attempts where action_id=${turn.id}::uuid order by ordinal limit 1`;

                onTestFinished(async () => {
                    await client`delete from dictionary_generation_provider_usage_archive where id=${archiveId}::uuid`;
                });

                const intent = { requestId: randomUUID(), expectedRevision: 1 };
                const resume = (confirmedQuoteId?: string) =>
                    store.continueGenerationRun({ ownerId }, chat.id, run!.id, {
                        ...intent,
                        confirmedQuoteId,
                    });
                const before =
                    await client`select turn_id from conversation_generation_run_actions where run_id=${run!.id}::uuid order by turn_id`;

                // Too little room even for 10k must reject without offering a quote or running a tool.
                await client`update dictionary_generation_provider_usage_archive set actual_output_tokens=120000 where id=${archiveId}::uuid`;
                // The worker checks the actual dispatch again while it holds the admission lock.
                const [dispatchCapacity] = await client`
                select languon_text_dispatch_capacity_allows(${ownerId}::uuid, budget, 0, 0, 256) as small,
                       languon_text_dispatch_capacity_allows(${ownerId}::uuid, budget, 0, 0, 4096) as large
                from ai_credit_action_attempts where action_id=${turn.id}::uuid order by ordinal limit 1`;

                expect(dispatchCapacity).toEqual({ small: true, large: false });
                await expect(resume()).rejects.toMatchObject({
                    code: 'provider_capacity_exhausted',
                });

                expect(
                    await client`select id from ai_credit_action_quotes where request_id=${intent.requestId}::uuid`,
                ).toHaveLength(0);

                await client`update dictionary_generation_provider_usage_archive set actual_output_tokens=83044 where id=${archiveId}::uuid`;
                let quoteId = '';
                let remainingMaximum = 0n;
                await expect(resume()).rejects.toSatisfy(
                    (error: {
                        code: string;
                        quote: {
                            id: string;
                            scope: string;
                            maximumCredits: string;
                        };
                    }) => {
                        expect(error.code).toBe('action_confirmation_required');
                        expect(error.quote.scope).toBe('lesson-if-planned');
                        remainingMaximum = parseCreditMilli(
                            error.quote.maximumCredits,
                        );

                        quoteId = error.quote.id;

                        return true;
                    },
                );

                // Another job can spend the remaining capacity after the quote was returned.
                await client`update dictionary_generation_provider_usage_archive set actual_output_tokens=120000 where id=${archiveId}::uuid`;
                await expect(resume(quoteId)).rejects.toMatchObject({
                    code: 'provider_capacity_exhausted',
                });

                expect(dispatched).toBe(4);
                expect(
                    await client`select turn_id from conversation_generation_run_actions where run_id=${run!.id}::uuid order by turn_id`,
                ).toEqual(before);

                await client`update dictionary_generation_provider_usage_archive set actual_output_tokens=83044 where id=${archiveId}::uuid`;
                const resumed = await resume(quoteId);
                expect((await resume(quoteId)).id).toBe(resumed.id);
                if (funding === 'customer') {
                    const [admitted] =
                        await client`select a.held_milli,t.execution from ai_credit_actions a join conversation_turns t on t.id=a.id where a.id=${resumed.id}::uuid`;

                    expect(BigInt(admitted!.held_milli)).toBeLessThan(
                        remainingMaximum,
                    );

                    expect(
                        admitted!.execution.generationMaximumCreditsMilli,
                    ).toBe(remainingMaximum.toString());
                }

                await drainLessonStages(worker);
                const { run: complete } = await store.getGenerationRun(
                    { ownerId },
                    chat.id,
                    run!.id,
                );

                expect(complete).toMatchObject({
                    state: 'completed',
                    completedTaskCount: 4,
                    proposalId: expect.any(String),
                    chargedCredits: funding === 'operator' ? '0.000' : '0.990',
                });

                const { proposals } = await store.listContentProposals(
                    { ownerId },
                    chat.id,
                );

                expect(proposals).toHaveLength(1);
                expect(
                    proposalBlocks(proposals[0]!.body).filter(
                        (block) => block.type === 'exercise',
                    ),
                ).toHaveLength(8);

                if (funding === 'customer') {
                    // Exclude charges for the prefix that was already saved before this consent.
                    const [newSpend] =
                        await client`select sum(a.charged_milli)::text as amount from ai_credit_actions a join conversation_generation_run_actions g on g.turn_id=a.id where g.run_id=${run!.id}::uuid and a.id<>${turn.id}::uuid`;

                    expect(BigInt(newSpend!.amount)).toBeLessThanOrEqual(
                        remainingMaximum,
                    );
                }

                expect(dispatched).toBe(outputs.length);
                expect(
                    await client`select id,artifact->>'contentHash' as hash from conversation_generation_run_artifacts where run_id=${run!.id}::uuid order by id`,
                ).toEqual(expect.arrayContaining(saved));
            },
        );

        it.each([
            'complete',
            'slow-checkpoint',
            'slow-planning',
            'large-history',
            'admission-retry',
            'isolate-damaged-run',
            'stop',
            'technical',
            'lease-before-dispatch',
            'lease-during-dispatch',
            'acknowledge-dispatch',
            'provider-rate-limited',
            'expired-authorization',
            'stage-limit',
            'provider-ceiling',
            'fingerprint-change',
            'source-revoked',
            'stop-race',
        ] as const)(
            'executes the retained French/Russian lesson through durable exercise checkpoints (%s)',
            async (mode) => {
                const stopAfterFirstStage = mode === 'stop';
                const failAfterFirstStage = [
                    'technical',
                    'acknowledge-dispatch',
                    'provider-rate-limited',
                ].includes(mode);
                const expiredAuthorization = mode === 'expired-authorization';
                const stageLimit = mode === 'stage-limit';
                const providerCeiling = mode === 'provider-ceiling';
                const fingerprintChanged = mode === 'fingerprint-change';
                const sourceRevoked = mode === 'source-revoked';
                const stopRace = mode === 'stop-race';
                const privatePlanMarker = `private-plan-${randomUUID()}`;
                await readyLessonRoute();
                const note = await knowledge.create(ownerId, {
                    operationId: randomUUID(),
                    content,
                });
                const workspace = await knowledge.getWorkspace(
                    ownerId,
                    note.id,
                );
                const branch = workspace.branches.find(
                    (item) => item.id === workspace.preferredBranchId,
                )!;
                const chat = await store.create(
                    { ownerId },
                    { source: { kind: 'knowledge', id: note.id } },
                );
                const reading = {
                    id: randomUUID(),
                    type: 'bilingual-text' as const,
                    language: 'fr',
                    segments: [
                        {
                            id: randomUUID(),
                            text: 'Les habitants débattent de la démocratie locale.',
                        },
                    ],
                    translations: [
                        {
                            language: 'ru',
                            segments: [
                                {
                                    sourceSegmentId: '',
                                    text: 'Жители обсуждают местную демократию.',
                                },
                            ],
                        },
                    ],
                };

                reading.translations[0]!.segments[0]!.sourceSegmentId =
                    reading.segments[0]!.id;

                const grammar = {
                    id: randomUUID(),
                    type: 'grammar' as const,
                    language: 'fr',
                    rule: 'Le COD devient sujet à la voix passive, alors que le COI ne le devient pas.',
                };
                const historicalMarker = 'Historical reading explanation.';
                const readingExercises = ['R01', 'R04', 'R08'].map(
                    (activityId) =>
                        namedExerciseFixture({
                            activityId: activityId as 'R01' | 'R04' | 'R08',
                            sources: [reading],
                        }),
                );

                if (mode === 'large-history') {
                    for (const block of readingExercises) {
                        block.explanation = historicalMarker.repeat(240);
                        block.question += ' Clarifiez cette idée.'.repeat(200);
                    }
                }

                const grammarExercises = ['G06', 'G02', 'G02', 'G03'].map(
                    (activityId, index) => ({
                        ...namedExerciseFixture({
                            activityId: activityId as 'G06' | 'G02' | 'G03',
                            sources: [grammar],
                        }),
                        question: `Appliquez la règle du COD ou du COI dans le cas ${index + 1}.`,
                    }),
                );
                const authorResponses = [
                    [{ taskId: 'reading', blocks: [reading] }],
                    ...readingExercises.map((block) => [
                        { taskId: 'reading-exercises', blocks: [block] },
                    ]),
                    [{ taskId: 'grammar', blocks: [grammar] }],
                    ...grammarExercises.map((block) => [
                        { taskId: 'grammar-exercises', blocks: [block] },
                    ]),
                ];
                // Simulate elapsed provider time without sleeping or changing database timestamps.
                const realNow = Date.now.bind(Date);
                let elapsedStageMs = 0;
                const clock = vi
                    .spyOn(Date, 'now')
                    .mockImplementation(() => realNow() + elapsedStageMs);

                onTestFinished(() => clock?.mockRestore());
                let requestCount = 0;
                const outgoing: Record<string, unknown>[] = [];
                let releaseAutomaticProvider: (() => void) | undefined;
                let automaticProviderStarted: (() => void) | undefined;
                const automaticProviderBarrier = new Promise<void>(
                    (resolve) => {
                        automaticProviderStarted = resolve;
                    },
                );

                vi.stubGlobal(
                    'fetch',
                    vi.fn(
                        async (
                            _url: string | URL | Request,
                            request?: RequestInit,
                        ) => {
                            const body = JSON.parse(
                                String(request?.body),
                            ) as Record<string, unknown>;

                            outgoing.push(body);
                            requestCount += 1;
                            if (
                                (stopRace ||
                                    mode === 'lease-during-dispatch') &&
                                requestCount === 6
                            ) {
                                automaticProviderStarted?.();
                                await new Promise<void>((resolve) => {
                                    releaseAutomaticProvider = resolve;
                                });
                            }

                            if (
                                ![
                                    'complete',
                                    'slow-checkpoint',
                                    'slow-planning',
                                    'large-history',
                                    'isolate-damaged-run',
                                ].includes(mode) &&
                                requestCount === 2
                            ) {
                                const [startedMemory] =
                                    await client`select value from conversation_memory where conversation_id=${chat.id}::uuid and key='learning-request:v1'`;

                                expect(startedMemory?.value).toMatchObject({
                                    pending: null,
                                });

                                expect(
                                    startedMemory?.value.pendingSources,
                                ).toBeUndefined();

                                expect(
                                    JSON.stringify(startedMemory?.value),
                                ).not.toContain(privatePlanMarker);
                            }

                            const value =
                                requestCount === 1
                                    ? {
                                          kind: 'generate',
                                          replyLanguage: 'en',
                                          brief: {
                                              tasks: [
                                                  {
                                                      id: 'reading',
                                                      kind: 'bilingual-text',
                                                      language: 'fr',
                                                      translationLanguage: 'ru',
                                                      instruction:
                                                          'Write a French reading on democracy in France.',
                                                  },
                                                  {
                                                      id: 'reading-exercises',
                                                      kind: 'exercises',
                                                      language: 'fr',
                                                      explanationLanguage: 'fr',
                                                      instruction:
                                                          'Check comprehension.',
                                                      source: {
                                                          kind: 'task',
                                                          taskId: 'reading',
                                                      },
                                                      count: 3,
                                                      activities: [
                                                          {
                                                              activityId: 'R01',
                                                              count: 1,
                                                          },
                                                          {
                                                              activityId: 'R04',
                                                              count: 1,
                                                          },
                                                          {
                                                              activityId: 'R08',
                                                              count: 1,
                                                          },
                                                      ],
                                                  },
                                                  {
                                                      id: 'grammar',
                                                      kind: 'grammar',
                                                      language: 'fr',
                                                      explanationLanguage: 'fr',
                                                      instruction: `${privatePlanMarker}: Explain COD, COI and passive voice.`,
                                                  },
                                                  {
                                                      id: 'grammar-exercises',
                                                      kind: 'exercises',
                                                      language: 'fr',
                                                      explanationLanguage: 'fr',
                                                      instruction:
                                                          'Check grammar.',
                                                      source: {
                                                          kind: 'task',
                                                          taskId: 'grammar',
                                                      },
                                                      count: 4,
                                                      activities: [
                                                          {
                                                              activityId: 'G06',
                                                              count: 1,
                                                          },
                                                          {
                                                              activityId: 'G02',
                                                              count: 2,
                                                          },
                                                          {
                                                              activityId: 'G03',
                                                              count: 1,
                                                          },
                                                      ],
                                                  },
                                              ],
                                              outputOrder: [
                                                  'reading',
                                                  'reading-exercises',
                                                  'grammar',
                                                  'grammar-exercises',
                                              ],
                                          },
                                      }
                                    : {
                                          tasks:
                                              authorResponses[
                                                  requestCount - 2
                                              ] ?? [],
                                      };

                            if (
                                (mode === 'slow-checkpoint' &&
                                    requestCount === 2) ||
                                (mode === 'slow-planning' &&
                                    requestCount === 1) ||
                                (![
                                    'complete',
                                    'slow-checkpoint',
                                    'slow-planning',
                                    'large-history',
                                ].includes(mode) &&
                                    requestCount === 4)
                            ) {
                                elapsedStageMs = 80_000;
                            }

                            return Response.json({
                                id: `lesson-${requestCount}`,
                                object: 'chat.completion',
                                created: 1,
                                model: model.id,
                                provider: 'OpenAI',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: JSON.stringify(value),
                                        },
                                        finish_reason: 'stop',
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 50,
                                    completion_tokens: 80,
                                    total_tokens: 130,
                                    cost: 0.00001,
                                },
                            });
                        },
                    ),
                );

                const editorContext = {
                    content: 'French vocabulary.',
                    editorTarget: {
                        from: 18,
                        to: 18,
                        originalText: '',
                        documentHash: createHash('sha256')
                            .update('French vocabulary.')
                            .digest('hex'),
                    },
                    workingBranch: {
                        id: branch.id,
                        version: branch.version,
                    },
                };
                const submitLesson = (conversationId: string) =>
                    store.submit({ ownerId }, conversationId, {
                        requestId: randomUUID(),
                        content:
                            'Create the retained French/Russian democracy lesson with three reading exercises, COD/COI grammar and four grammar exercises.',
                        attachments: [],
                        editorContext,
                    });
                const submitted = await submitLesson(chat.id);
                const worker = createConversationWorkerComposition({
                    database: db,
                    dictionaryHmacSecret: secret,
                    credentials: textAiFixtureCredentials,
                });
                const [initialExecution] =
                    await client`select execution from conversation_turns where id=${submitted.id}::uuid`;

                expect(initialExecution?.execution).toMatchObject({
                    generationAuthorizationFingerprint: expect.any(String),
                    generationMaximumCreditsMilli: expect.any(String),
                    generationMaximumProviderCostMicros: expect.any(Number),
                });

                expect(
                    (
                        initialExecution?.execution as {
                            generationMaximumProviderCostMicros?: number;
                        }
                    ).generationMaximumProviderCostMicros,
                ).toBeGreaterThan(0);

                const processed = [
                    await worker.processNext(new AbortController().signal),
                ];

                elapsedStageMs = 0;
                if (
                    [
                        'slow-checkpoint',
                        'slow-planning',
                        'large-history',
                    ].includes(mode)
                ) {
                    elapsedStageMs = 0;
                    const first = (
                        await store.listGenerationRuns({ ownerId }, chat.id)
                    ).runs[0]!;

                    if (
                        mode === 'slow-checkpoint' ||
                        mode === 'slow-planning'
                    ) {
                        expect(first).toMatchObject({
                            state: 'paused',
                            completedTaskCount:
                                mode === 'slow-planning' ? 0 : 1,
                            automation: { enabled: true },
                        });

                        expect(outgoing).toHaveLength(
                            mode === 'slow-planning' ? 1 : 2,
                        );
                    }

                    const checkpoints = () =>
                        client`select id, artifact->>'contentHash' as hash from conversation_generation_run_artifacts where run_id=${first.id}::uuid order by id`;
                    const saved = await checkpoints();
                    await drainLessonStages(worker);

                    const last = await store.getGenerationRun(
                        { ownerId },
                        chat.id,
                        first.id,
                    );

                    expect(last.run).toMatchObject({
                        state: 'completed',
                        completedTaskCount: 4,
                    });

                    expect(outgoing).toHaveLength(10);
                    expect(await checkpoints()).toEqual(
                        expect.arrayContaining(saved),
                    );

                    const { proposals } = await listContentProposalsWithBlocks(
                        store,
                        { ownerId },
                        chat.id,
                    );

                    expect(proposals).toHaveLength(1);
                    expect(
                        proposals[0]!.blocks
                            .filter((block) => block.type === 'exercise')
                            .map((block) => block.semantics?.activity.id),
                    ).toEqual([
                        'R01',
                        'R04',
                        'R08',
                        'G06',
                        'G02',
                        'G02',
                        'G03',
                    ]);

                    if (mode === 'large-history') {
                        const [history] =
                            await client`select sum(length(artifact::text))::integer as size from conversation_generation_run_artifacts where run_id=${first.id}::uuid and task_id='reading-exercises'`;

                        expect(history!.size).toBeGreaterThan(64_000);
                        expect(JSON.stringify(outgoing.at(-1))).not.toContain(
                            historicalMarker,
                        );
                    }

                    return;
                }

                if (mode === 'complete') {
                    const automatic = await Promise.all([
                        worker.processNext(new AbortController().signal),
                        worker.processNext(new AbortController().signal),
                    ]);

                    processed.push(...automatic);
                    expect(automatic.filter(Boolean)).toHaveLength(1);
                    processed.push(
                        await worker.processNext(new AbortController().signal),
                    );
                }

                expect(processed[0]).toBe(true);

                const detail = await store.detail({ ownerId }, chat.id);
                expect(
                    detail.turns.find((turn) => turn.id === submitted.id),
                ).toMatchObject({ status: 'succeeded', failureCode: null });

                // The synthetic clock ends this stage after its second reading exercise,
                // leaving a real committed prefix for stop, capacity and lease races.
                expect(outgoing).toHaveLength(mode === 'complete' ? 10 : 4);
                const runs = await store.listGenerationRuns(
                    { ownerId },
                    chat.id,
                );

                if (mode !== 'complete') {
                    const run = runs.runs[0]!;
                    expect(run.automation?.enabled).toBe(true);
                    expect(run).toMatchObject({
                        state: 'paused',
                        pauseReason: 'budget',
                        completedTaskCount: 1,
                        totalTaskCount: 4,
                    });

                    expect(
                        run.tasks.find(
                            (task) => task.id === 'reading-exercises',
                        ),
                    ).toMatchObject({
                        status: 'pending',
                        completedUnitCount: 2,
                        totalUnitCount: 3,
                    });

                    const [authorizationWindow] =
                        await client`select run.automation, action.deadline_at from conversation_generation_runs run join ai_credit_actions action on action.id=(run.automation->>'rootActionId')::uuid where run.id=${run.id}::uuid`;
                    const expiresAt = (
                        authorizationWindow?.automation as {
                            expiresAt?: string;
                        }
                    ).expiresAt;

                    expect(expiresAt).toEqual(expect.any(String));
                    expect(new Date(expiresAt!).getTime()).toBeLessThanOrEqual(
                        new Date(authorizationWindow!.deadline_at).getTime(),
                    );

                    const readPlannerState = async () => {
                        const [row] =
                            await client`select value from conversation_memory where conversation_id=${chat.id}::uuid and key='learning-request:v1'`;

                        return row?.value as {
                            pending: unknown;
                            pendingSources?: unknown;
                            proposals: unknown[];
                        };
                    };
                    const pausedMemory = await readPlannerState();
                    expect(pausedMemory.pending).toBeNull();
                    expect(pausedMemory.pendingSources).toBeUndefined();
                    expect(JSON.stringify(pausedMemory)).not.toContain(
                        privatePlanMarker,
                    );

                    expect(
                        await store.listContentProposals({ ownerId }, chat.id),
                    ).toMatchObject({ proposals: [] });

                    const preview = await store.getGenerationRunPreview(
                        { ownerId },
                        chat.id,
                        run.id,
                    );

                    expect(preview.parts).toHaveLength(2);
                    expect(preview.parts.map((part) => part.taskId)).toEqual([
                        'reading',
                        'reading-exercises',
                    ]);

                    expect(preview.parts[1]).toMatchObject({
                        completedUnitCount: 2,
                        totalUnitCount: 3,
                        complete: false,
                    });

                    await expect(
                        store.getGenerationRunPreview(
                            { ownerId: randomUUID() },
                            chat.id,
                            run.id,
                        ),
                    ).rejects.toMatchObject({ code: 'conversation_not_found' });

                    if (mode === 'isolate-damaged-run') {
                        // Hold the first candidate while a second lesson reaches the same budget checkpoint.
                        await client`update conversation_generation_runs set automation=jsonb_set(automation,'{ready}','false') where id=${run.id}::uuid`;
                        const newConversation = () =>
                            store.create(
                                { ownerId },
                                { source: { kind: 'knowledge', id: note.id } },
                            );
                        const otherChat = await newConversation();
                        await submitLesson(otherChat.id);
                        requestCount = 0;
                        expect(
                            await worker.processNext(
                                new AbortController().signal,
                            ),
                        ).toBe(true);

                        const otherRun = (
                            await store.listGenerationRuns(
                                { ownerId },
                                otherChat.id,
                            )
                        ).runs[0]!;

                        expect(otherRun).toMatchObject({
                            state: 'paused',
                            automation: { enabled: true },
                        });

                        const ordinaryChat = await newConversation();
                        const ordinary = await store.submit(
                            { ownerId },
                            ordinaryChat.id,
                            {
                                requestId: randomUUID(),
                                content: 'Explain the material.',
                                attachments: [],
                                editorContext,
                            },
                        );

                        // An invalid persisted UUID raises a PostgreSQL error during admission, then
                        // again during event projection. Both transactions must release their locks.
                        await client`update conversation_generation_plan_revisions set artifact_ids='["synthetic-invalid-uuid"]'::jsonb where run_id=${run.id}::uuid`;
                        await client`update conversation_generation_runs set automation=jsonb_set(automation,'{ready}','true'), updated_at=now()-interval '1 minute' where id=${run.id}::uuid`;
                        const claimedOrdinary = await store.claim();
                        expect(claimedOrdinary?.id).toBe(ordinary.id);
                        const [damaged] =
                            await client`select state, pause_reason, failure, automation from conversation_generation_runs where id=${run.id}::uuid`;

                        expect(damaged).toMatchObject({
                            state: 'paused',
                            pause_reason: 'technical-failure',
                            failure: {
                                code: 'admission-blocked',
                                admissionReason: 'unknown',
                            },
                            automation: null,
                        });

                        const [links] =
                            await client`select count(*)::integer as count from conversation_generation_run_actions where run_id=${run.id}::uuid`;

                        expect(links?.count).toBe(1);
                        const admitted = (
                            await store.getGenerationRun(
                                { ownerId },
                                otherChat.id,
                                otherRun.id,
                            )
                        ).run;

                        expect(admitted).toMatchObject({
                            state: 'running',
                            activeTurnId: expect.any(String),
                        });

                        // The per-owner worker fence releases after the previously queued job finishes.
                        await store.stop(
                            { ownerId },
                            ordinaryChat.id,
                            ordinary.id,
                        );

                        await store.finish(claimedOrdinary!, 'cancelled');
                        expect((await store.claim())?.id).toBe(
                            admitted.activeTurnId,
                        );

                        expect(outgoing).toHaveLength(8);

                        return;
                    }

                    if (mode === 'admission-retry') {
                        const blocker = await store.submit(
                            { ownerId },
                            chat.id,
                            {
                                requestId: randomUUID(),
                                content: 'Explain the reading.',
                                editorContext,
                                attachments: [],
                            },
                        );
                        const claimed = (await store.claimForTurn(
                            blocker.id,
                            ownerId,
                        ))!;

                        expect(claimed.id).toBe(blocker.id);
                        expect(await store.claim()).toBeNull();

                        const retry = (
                            await store.getGenerationRun(
                                { ownerId },
                                chat.id,
                                run.id,
                            )
                        ).run;

                        expect(retry).toMatchObject({
                            state: 'paused',
                            pauseReason: 'budget',
                            failure: {
                                code: 'admission-blocked',
                                admissionReason: 'response-active',
                                referenceId: expect.any(String),
                            },
                            automation: {
                                enabled: true,
                                retryAt: expect.any(String),
                            },
                        });

                        await store.stop({ ownerId }, chat.id, blocker.id);
                        await store.finish(claimed, 'cancelled');
                        expect(await store.claim()).toBeNull();
                        expect(outgoing).toHaveLength(4);
                        await client`update conversation_generation_runs set automation=jsonb_set(automation, '{admissionRetry,retryAt}'::text[], to_jsonb(${new Date(0).toISOString()}::text)) where id=${run.id}::uuid`;

                        await drainLessonStages(worker);

                        expect(
                            (
                                await store.getGenerationRun(
                                    { ownerId },
                                    chat.id,
                                    run.id,
                                )
                            ).run,
                        ).toMatchObject({ state: 'completed' });

                        expect(outgoing).toHaveLength(10);

                        return;
                    }

                    if (
                        mode === 'lease-before-dispatch' ||
                        mode === 'lease-during-dispatch'
                    ) {
                        const executing =
                            mode === 'lease-during-dispatch'
                                ? worker.processNext(
                                      new AbortController().signal,
                                  )
                                : undefined;

                        if (executing) {
                            await automaticProviderBarrier;
                        } else {
                            await store.claim();
                        }

                        const [active] =
                            await client`select active_turn_id as id from conversation_generation_runs where id=${run.id}::uuid`;

                        expect(active?.id).toBeTruthy();
                        try {
                            await client`update conversation_turns set lease_until=now()-interval '1 second' where id=${active!.id}::uuid`;
                            expect(await store.claim()).toBeNull();
                        } finally {
                            releaseAutomaticProvider?.();
                            await executing;
                        }

                        const paused = (
                            await store.getGenerationRun(
                                { ownerId },
                                chat.id,
                                run.id,
                            )
                        ).run;

                        expect(paused.state).toBe('paused');
                        if (executing) {
                            expect(paused.automation?.enabled).not.toBe(true);
                        } else {
                            expect(paused.automation?.enabled).toBe(true);
                        }

                        expect(paused.failure?.code).toEqual(
                            executing ? 'provider-outcome-unknown' : undefined,
                        );

                        expect(paused.uncertainTurnId).toEqual(
                            executing ? active!.id : undefined,
                        );

                        const [settled] = await client`
                            select a.state, a.held_milli, a.charged_milli, s.series_id,
                                   (select count(*)::integer from ai_credit_action_attempts attempt where attempt.action_id=a.id) as attempts
                              from ai_credit_actions a
                              join ai_credit_action_series s on s.action_id=a.id
                             where a.id=${active!.id}::uuid`;

                        expect(settled).toMatchObject({
                            state: 'settled',
                            held_milli: '0',
                            charged_milli: '0',
                            series_id: run.id,
                            attempts: executing ? 2 : 0,
                        });

                        expect(outgoing).toHaveLength(executing ? 6 : 4);
                        if (!executing) {
                            await drainLessonStages(worker);
                            expect(
                                (
                                    await store.getGenerationRun(
                                        { ownerId },
                                        chat.id,
                                        run.id,
                                    )
                                ).run.state,
                            ).toBe('completed');

                            expect(outgoing).toHaveLength(10);
                        }

                        return;
                    }

                    if (stopRace) {
                        const automatic = worker.processNext(
                            new AbortController().signal,
                        );

                        await automaticProviderBarrier;
                        const stopped = await store.stopGenerationRun(
                            { ownerId },
                            chat.id,
                            run.id,
                            {
                                requestId: randomUUID(),
                                expectedRevision: run.revision,
                            },
                        );

                        releaseAutomaticProvider?.();
                        await automatic;

                        expect(stopped.run.automation?.enabled).not.toBe(true);
                        expect(
                            await store.getGenerationRun(
                                { ownerId },
                                chat.id,
                                run.id,
                            ),
                        ).toMatchObject({
                            run: { state: 'paused', pauseReason: 'stopped' },
                        });

                        expect(
                            (
                                await store.listGenerationRuns(
                                    { ownerId },
                                    chat.id,
                                )
                            ).runs[0]!.automation?.enabled,
                        ).not.toBe(true);

                        expect(
                            await listContentProposalsWithBlocks(
                                store,
                                { ownerId },
                                chat.id,
                            ),
                        ).toMatchObject({ proposals: [] });

                        const [activeTurns] =
                            await client`select count(*)::integer as count from conversation_turns where conversation_id=${chat.id}::uuid and status in ('queued','running')`;

                        expect(activeTurns?.count).toBe(0);
                        expect(
                            await worker.processNext(
                                new AbortController().signal,
                            ),
                        ).toBe(false);

                        return;
                    }

                    if (sourceRevoked) {
                        await knowledge.delete(ownerId, note.id, {
                            operationId: randomUUID(),
                            expectedVersion: note.version,
                        });

                        await expect(
                            store.getGenerationRunPreview(
                                { ownerId },
                                chat.id,
                                run.id,
                            ),
                        ).rejects.toMatchObject({
                            code: 'knowledge_not_found',
                        });

                        expect(
                            await worker.processNext(
                                new AbortController().signal,
                            ),
                        ).toBe(false);

                        expect(outgoing).toHaveLength(4);

                        return;
                    }

                    if (
                        expiredAuthorization ||
                        stageLimit ||
                        providerCeiling ||
                        fingerprintChanged
                    ) {
                        if (expiredAuthorization) {
                            await client`update conversation_generation_runs set automation=jsonb_set(automation, '{expiresAt}'::text[], to_jsonb(${new Date(0).toISOString()}::text), true) where id=${run.id}::uuid`;
                        } else if (stageLimit) {
                            await client`update conversation_generation_runs set automation=jsonb_set(automation, '{stageCount}'::text[], to_jsonb(8), true) where id=${run.id}::uuid`;
                        } else if (fingerprintChanged) {
                            await client`update conversation_generation_runs set automation=jsonb_set(automation, '{authorizationFingerprint}'::text[], to_jsonb('stale-authorization-fingerprint'::text), true) where id=${run.id}::uuid`;
                        } else {
                            await client`update conversation_generation_runs set automation=jsonb_set(automation, '{maximumProviderCostMicros}'::text[], to_jsonb(0), true) where id=${run.id}::uuid`;
                        }

                        expect(
                            await worker.processNext(
                                new AbortController().signal,
                            ),
                        ).toBe(false);

                        const fencedRun = (
                            await store.listGenerationRuns({ ownerId }, chat.id)
                        ).runs[0]!;

                        expect(fencedRun).toMatchObject({
                            state: 'paused',
                            pauseReason: 'technical-failure',
                            failure: {
                                code: 'admission-blocked',
                                admissionReason: expiredAuthorization
                                    ? 'authority-expired'
                                    : stageLimit
                                      ? 'stage-limit'
                                      : fingerprintChanged
                                        ? 'configuration'
                                        : 'allowance-required',
                                referenceId: expect.any(String),
                            },
                        });

                        expect(fencedRun.automation?.enabled).not.toBe(true);
                    } else if (failAfterFirstStage) {
                        const healthyTransport = fetch;
                        vi.stubGlobal(
                            'fetch',
                            vi.fn(async () => {
                                if (mode === 'provider-rate-limited') {
                                    return Response.json(
                                        {
                                            error: {
                                                message: 'Rate limit',
                                                code: 429,
                                            },
                                        },
                                        {
                                            status: 429,
                                            headers: { 'Retry-After': '60' },
                                        },
                                    );
                                }

                                throw new Error(
                                    'Synthetic provider transport failure.',
                                );
                            }),
                        );

                        expect(
                            await worker.processNext(
                                new AbortController().signal,
                            ),
                        ).toBe(true);

                        const failedRun = (
                            await store.listGenerationRuns({ ownerId }, chat.id)
                        ).runs[0]!;

                        expect(failedRun).toMatchObject({
                            state: 'paused',
                            pauseReason: 'technical-failure',
                            failure: {
                                code:
                                    mode === 'provider-rate-limited'
                                        ? 'rate-limited'
                                        : 'provider-outcome-unknown',
                                referenceId: expect.any(String),
                            },
                        });

                        expect(failedRun.automation?.enabled).not.toBe(true);
                        if (mode === 'acknowledge-dispatch') {
                            const request = {
                                requestId: randomUUID(),
                                expectedRevision: run.revision,
                            };

                            await expect(
                                store.continueGenerationRun(
                                    { ownerId },
                                    chat.id,
                                    run.id,
                                    request,
                                ),
                            ).rejects.toMatchObject({
                                code: 'generation_acknowledgement_required',
                            });

                            expect(failedRun.uncertainTurnId).toBe(
                                failedRun.failure!.referenceId,
                            );

                            const stopped = await store.stopGenerationRun(
                                { ownerId },
                                chat.id,
                                run.id,
                                { ...request, requestId: randomUUID() },
                            );

                            expect(stopped.run.uncertainTurnId).toBe(
                                failedRun.uncertainTurnId,
                            );

                            await expect(
                                store.reviseGenerationRun(
                                    { ownerId },
                                    chat.id,
                                    run.id,
                                    {
                                        ...request,
                                        requestId: randomUUID(),
                                        instruction:
                                            'Change the last exercise.',
                                    },
                                ),
                            ).rejects.toMatchObject({
                                code: 'generation_acknowledgement_required',
                            });

                            await expect(
                                store.continueGenerationRun(
                                    { ownerId },
                                    chat.id,
                                    run.id,
                                    request,
                                ),
                            ).rejects.toMatchObject({
                                code: 'generation_acknowledgement_required',
                            });

                            const [counts] =
                                await client`select count(*)::integer as count from conversation_generation_run_actions where run_id=${run.id}::uuid`;

                            expect(counts?.count).toBe(2);
                            // The append-only health observation gates both admission and SQL dispatch.
                            // Waiting for the production cooldown keeps their clocks consistent.
                            const health =
                                await client`select id from text_ai_route_health_events where reason='provider_unavailable'`;

                            expect(health).toHaveLength(1);
                            await delay(60_100);
                            vi.stubGlobal('fetch', healthyTransport);
                            const acknowledged = {
                                ...request,
                                acknowledgedUncertainTurnId:
                                    failedRun.failure!.referenceId!,
                            };
                            let quoteId = '';
                            await expect(
                                store.continueGenerationRun(
                                    { ownerId },
                                    chat.id,
                                    run.id,
                                    acknowledged,
                                ),
                            ).rejects.toSatisfy(
                                (error: {
                                    code: string;
                                    quote: { id: string };
                                }) => {
                                    expect(error.code).toBe(
                                        'action_confirmation_required',
                                    );

                                    quoteId = error.quote.id;

                                    return true;
                                },
                            );

                            const admitted = await store.continueGenerationRun(
                                { ownerId },
                                chat.id,
                                run.id,
                                { ...acknowledged, confirmedQuoteId: quoteId },
                            );

                            expect(admitted.status).toBe('queued');
                            expect(
                                (
                                    await store.continueGenerationRun(
                                        { ownerId },
                                        chat.id,
                                        run.id,
                                        {
                                            ...acknowledged,
                                            confirmedQuoteId: quoteId,
                                        },
                                    )
                                ).id,
                            ).toBe(admitted.id);

                            await drainLessonStages(worker);

                            expect(
                                (
                                    await store.getGenerationRun(
                                        { ownerId },
                                        chat.id,
                                        run.id,
                                    )
                                ).run,
                            ).toMatchObject({
                                state: 'completed',
                                completedTaskCount: 4,
                                lastCommandRequestId: request.requestId,
                            });

                            const [settled] =
                                await client`select state, held_milli, charged_milli from ai_credit_actions where id=${admitted.id}::uuid`;

                            expect(settled).toMatchObject({
                                state: 'settled',
                                held_milli: '0',
                                charged_milli: '0',
                            });

                            expect(outgoing).toHaveLength(10);

                            return;
                        }
                    } else if (stopAfterFirstStage) {
                        await store.stopGenerationRun(
                            { ownerId },
                            chat.id,
                            run.id,
                            {
                                requestId: randomUUID(),
                                expectedRevision: run.revision,
                            },
                        );
                    }

                    expect(
                        await worker.processNext(new AbortController().signal),
                    ).toBe(false);

                    expect(outgoing).toHaveLength(4);

                    await store.discardGenerationRun(
                        { ownerId },
                        chat.id,
                        run.id,
                        {
                            requestId: randomUUID(),
                            expectedRevision: run.revision,
                        },
                    );

                    await expect(
                        store.getGenerationRunPreview(
                            { ownerId },
                            chat.id,
                            run.id,
                        ),
                    ).rejects.toMatchObject({ code: 'conversation_not_found' });

                    const discardedMemory = await readPlannerState();
                    expect(discardedMemory).toEqual(pausedMemory);
                    expect(discardedMemory.pending).toBeNull();
                    expect(
                        readTutorPlannerState(discardedMemory),
                    ).toMatchObject({ pending: null, proposals: [] });

                    expect(discardedMemory.pendingSources).toBeUndefined();
                    expect(JSON.stringify(discardedMemory)).not.toContain(
                        privatePlanMarker,
                    );

                    const [privateRows] =
                        await client`select (select count(*)::integer from conversation_generation_plan_revisions where run_id=${run.id}::uuid) as revisions, (select count(*)::integer from conversation_generation_run_artifacts where run_id=${run.id}::uuid) as artifacts`;

                    expect(privateRows).toEqual({ revisions: 0, artifacts: 0 });

                    return;
                }

                expect(runs.runs[0]).toMatchObject({
                    state: 'completed',
                    completedTaskCount: 4,
                    totalTaskCount: 4,
                });

                expect(
                    runs.runs[0]!.tasks.find(
                        (task) => task.id === 'grammar-exercises',
                    ),
                ).toMatchObject({
                    status: 'completed',
                    completedUnitCount: 4,
                    totalUnitCount: 4,
                });

                const [automaticAccounting] =
                    await client`select count(distinct action.id)::integer as stages, count(attempt.id)::integer as attempts, max(attempt.output_limit)::integer as maximum_output_limit from conversation_generation_run_actions action_link join ai_credit_actions action on action.id=action_link.turn_id left join ai_credit_action_attempts attempt on attempt.action_id=action.id where action_link.run_id=${runs.runs[0]!.id}::uuid and action_link.kind='generation'`;

                expect(automaticAccounting).toEqual({
                    stages: 2,
                    attempts: 10,
                    maximum_output_limit: 4_096,
                });

                const [stageWindow] = await client`
                    select bool_and(stage.deadline_at <= root.deadline_at) as within_root_deadline
                    from conversation_generation_run_actions link
                    join ai_credit_actions stage on stage.id = link.turn_id
                    join ai_credit_actions root on root.id = ${submitted.id}::uuid
                    where link.run_id = ${runs.runs[0]!.id}::uuid and stage.id <> root.id
                `;

                expect(stageWindow?.within_root_deadline).toBe(true);

                const actionUsage =
                    await client`select attempt.action_id, count(*)::integer as attempts, sum(attempt.output_tokens)::integer as output_tokens from conversation_generation_run_actions action_link join ai_credit_action_attempts attempt on attempt.action_id=action_link.turn_id where action_link.run_id=${runs.runs[0]!.id}::uuid and action_link.kind='generation' group by attempt.action_id`;

                expect(actionUsage).toHaveLength(2);
                expect(
                    actionUsage
                        .map((action) => action.attempts)
                        .sort((left, right) => left - right),
                ).toEqual([5, 5]);

                for (const action of actionUsage) {
                    expect(action.attempts).toBeLessThanOrEqual(5);
                    expect(action.output_tokens).toBeLessThanOrEqual(10_000);
                }

                const proposals = await listContentProposalsWithBlocks(
                    store,
                    { ownerId },
                    chat.id,
                );

                expect(proposals.proposals).toHaveLength(1);
                expect(
                    proposals.proposals[0]!.blocks.filter(
                        (block) => block.type === 'exercise',
                    ),
                ).toHaveLength(7);
            },
            // The uncertain-dispatch case verifies the real 60-second database circuit.
            105_000,
        );

        it.each([
            {
                funding: 'operator',
                outcome: 'success',
                operation: 'append',
                diagnostic: 'missing',
            },
            {
                funding: 'customer',
                outcome: 'success',
                operation: 'append',
                diagnostic: 'missing',
            },
            {
                funding: 'operator',
                outcome: 'failure',
                operation: 'append',
                diagnostic: 'missing',
            },
            {
                funding: 'customer',
                outcome: 'failure',
                operation: 'append',
                diagnostic: 'missing',
            },
            {
                funding: 'operator',
                outcome: 'success',
                operation: 'update',
                diagnostic: 'missing',
            },
            {
                funding: 'customer',
                outcome: 'success',
                operation: 'update',
                diagnostic: 'missing',
            },
            {
                funding: 'operator',
                outcome: 'success',
                operation: 'multi-update',
                diagnostic: 'missing',
            },
            {
                funding: 'customer',
                outcome: 'success',
                operation: 'multi-update',
                diagnostic: 'missing',
            },
            {
                funding: 'operator',
                outcome: 'success',
                operation: 'append',
                diagnostic: 'changed-fingerprint',
            },
            {
                funding: 'customer',
                outcome: 'success',
                operation: 'append',
                diagnostic: 'failed',
            },
            {
                funding: 'customer',
                outcome: 'recover',
                operation: 'append',
                diagnostic: 'missing',
            },
        ] as const)(
            '$funding $outcome $operation with $diagnostic diagnostics survives admission through the default worker and SDK without widening its budget',
            async ({ funding, outcome, operation, diagnostic }) => {
                const now = new Date();
                await db.insert(capabilityPolicyRevisionsTable).values({
                    id: randomUUID(),
                    capability: 'conversation',
                    version: 1,
                    funding,
                    createdAt: now,
                    reason: 'Synthetic conversation execution regression',
                });

                await seedTextAiRoutingFixture(db, {
                    routeId: 'openrouter/openai/gpt-6-luna',
                    replace: true,
                    seedProbes: false,
                    ...(funding === 'operator'
                        ? { omittedTariffFlows: ['conversation'] }
                        : {
                              tariff: {
                                  inputCreditsPerMillionTokens: 1000,
                                  outputCreditsPerMillionTokens: 500,
                                  cachedInputCreditsPerMillionTokens: 1000,
                              },
                          }),
                });

                const routeId = `${model.providerId}/${model.id}`;
                if (diagnostic !== 'missing') {
                    const price = await db.transaction((tx) =>
                        pinProviderPrice(tx, {
                            providerId: model.providerId,
                            modelId: model.id,
                            meter: 'text-tokens',
                            at: now,
                        }),
                    );

                    if (!price) {
                        throw new Error('Synthetic provider price is missing.');
                    }

                    await db.insert(probes).values({
                        id: randomUUID(),
                        actorId: ownerId,
                        routeId,
                        providerId: model.providerId,
                        modelId: model.id,
                        kind: 'flow',
                        flowId: 'conversation',
                        fingerprint:
                            diagnostic === 'changed-fingerprint'
                                ? createHash('sha256')
                                      .update('previous-conversation-prompt')
                                      .digest('hex')
                                : fixtureRouteFingerprint(
                                      routeId,
                                      'conversation',
                                  )!,
                        state: diagnostic === 'failed' ? 'failed' : 'passed',
                        failure:
                            diagnostic === 'failed'
                                ? 'authorization_failed'
                                : null,
                        evidenceHours: 24,
                        day: now.toISOString().slice(0, 10),
                        maximumMicros: 10000n,
                        costMicros: 1n,
                        price,
                        inputTokens: 1,
                        outputTokens: 1,
                        measurement: 'measured',
                        elapsedMs: 1,
                        startedAt: now,
                        completedAt: now,
                        evidenceExpiresAt: new Date(now.getTime() + 86400000),
                    });
                }

                const diagnosticHistory = await db
                    .select()
                    .from(probes)
                    .where(eq(probes.routeId, routeId));

                expect(diagnosticHistory).toHaveLength(
                    diagnostic === 'missing' ? 0 : 1,
                );

                if (diagnostic === 'changed-fingerprint') {
                    expect(diagnosticHistory[0]!.fingerprint).not.toBe(
                        fixtureRouteFingerprint(routeId, 'conversation'),
                    );
                }

                if (funding === 'customer') {
                    await db.insert(textAiPreferencesTable).values({
                        userId: ownerId,
                        mode: 'auto',
                        maxCreditsPerAction:
                            operation === 'multi-update' ? '65' : '60',
                        version: 1,
                    });
                }

                await db.insert(dictionaryAiWorkerObservationsTable).values({
                    id: conversationExecutionObservationId(
                        'production-conversation-regression',
                        model.providerId,
                        model.id,
                    ),
                    workerId: 'production-conversation-regression',
                    providerId: model.providerId,
                    modelId: model.id,
                    adapterRevision: model.adapterRevision,
                    checkedAt: now,
                    expiresAt: new Date(now.getTime() + 120_000),
                    status: 'available',
                    message: 'Synthetic production composition readiness',
                    textAiSelectionRevision: 1,
                    textAiSupportedFormats: ['conversation:v1'],
                    textAiCapacityRevision: 1,
                    textsCapacityRevision: 1,
                    conversationCapacityRevision: 1,
                    conversationExecutionRevision: 1,
                    creditSettlementRevision: 1,
                });

                if (funding === 'customer') {
                    await db.transaction((tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).issueGrant({
                            ownerId,
                            amount: 1_000_000n,
                            createdAt: now,
                            expiresAt: null,
                            source: 'admin',
                            sourceReference: randomUUID(),
                        }),
                    );
                }

                const targetBlockId = randomUUID();
                const secondTargetBlockId = randomUUID();
                const initialBlock = {
                    id: targetBlockId,
                    type: 'vocabulary' as const,
                    language: 'fr',
                    translationLanguage: 'ru',
                    entries: [
                        {
                            id: randomUUID(),
                            term: 'travail',
                            translation: 'работа',
                        },
                    ],
                };
                const noteContent =
                    operation !== 'append'
                        ? {
                              ...content,
                              body: {
                                  schemaVersion: 2 as const,
                                  document: {
                                      type: 'doc' as const,
                                      content: [
                                          ...content.body.document.content,
                                          {
                                              type: 'learningBlock' as const,
                                              attrs: { block: initialBlock },
                                          },
                                          ...(operation === 'multi-update'
                                              ? [
                                                    {
                                                        type: 'learningBlock' as const,
                                                        attrs: {
                                                            block: {
                                                                ...initialBlock,
                                                                id: secondTargetBlockId,
                                                            },
                                                        },
                                                    },
                                                ]
                                              : []),
                                      ],
                                  },
                              },
                          }
                        : content;
                const note = await knowledge.create(ownerId, {
                    operationId: randomUUID(),
                    content: noteContent,
                });
                const workspace = await knowledge.getWorkspace(
                    ownerId,
                    note.id,
                );
                const branch = workspace.branches.find(
                    (item) => item.id === workspace.preferredBranchId,
                )!;
                const chat = await store.create(
                    { ownerId },
                    { source: { kind: 'knowledge', id: note.id } },
                );
                const submissionInput = {
                    requestId: randomUUID(),
                    ...(operation !== 'append'
                        ? {
                              promptMentions: [
                                  {
                                      kind: 'block' as const,
                                      blockId: targetBlockId,
                                      start: 0,
                                      end: 7,
                                  },
                              ],
                          }
                        : {}),
                    content:
                        'Propose a French to Russian vocabulary block for work, joy, cleaning, tile, fish and animal feed, with definitions and example translations.',
                    attachments: [],
                    ...(operation !== 'append'
                        ? {
                              blockReferences:
                                  operation === 'multi-update'
                                      ? [targetBlockId, secondTargetBlockId]
                                      : [targetBlockId],
                          }
                        : {}),
                    editorContext: {
                        content: 'French vocabulary.',
                        editorTarget: {
                            from: 18,
                            to: 18,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update('French vocabulary.')
                                .digest('hex'),
                        },
                        workingBranch: {
                            id: branch.id,
                            version: branch.version,
                        },
                    },
                };
                const submitted = await store.submit(
                    { ownerId },
                    chat.id,
                    submissionInput,
                );
                const [admitted] = await db
                    .select()
                    .from(turns)
                    .where(eq(turns.id, submitted.id));
                const execution = admitted!.execution as {
                    admittedMaxInputTokens: number;
                    budget: {
                        maxCostMicrosPerAttempt: number;
                        maxInputTokensPerAttempt: number;
                        maxOutputTokensPerAttempt: number;
                        inputCostMicrosPerMillionTokens: number;
                        outputCostMicrosPerMillionTokens: number;
                    };
                    snapshot: {
                        aggregateBudget: { maxCostMicrosPerAttempt: number };
                        perCallMaxInputTokens: number;
                        routingAuthority: { tariffPublished: boolean };
                    };
                };

                expect(execution.budget.maxCostMicrosPerAttempt).toBeLessThan(
                    model.aggregateBudget.maxCostMicrosPerAttempt,
                );

                expect(execution.snapshot.aggregateBudget).toEqual(
                    execution.budget,
                );

                expect(execution.admittedMaxInputTokens).toBeLessThanOrEqual(
                    execution.snapshot.perCallMaxInputTokens,
                );

                if (funding === 'operator') {
                    expect(execution.admittedMaxInputTokens).toBe(
                        model.perCallMaxInputTokens,
                    );
                } else {
                    // A 60-credit single-target ceiling admits 55k input.
                    // Two complete updates use 65 credits to admit 60k,
                    // still below the model's 64k input cap.
                    expect(execution.admittedMaxInputTokens).toBe(
                        operation === 'multi-update' ? 60_000 : 55_000,
                    );
                }

                expect(execution.budget).toMatchObject({
                    inputCostMicrosPerMillionTokens: 125000,
                    outputCostMicrosPerMillionTokens: 500000,
                });

                expect(execution.budget.maxInputTokensPerAttempt).toBe(
                    model.aggregateBudget.maxInputTokensPerAttempt,
                );

                expect(execution.budget.maxOutputTokensPerAttempt).toBe(
                    model.aggregateBudget.maxOutputTokensPerAttempt,
                );

                if (funding === 'operator') {
                    expect(
                        execution.snapshot.routingAuthority.tariffPublished,
                    ).toBe(false);
                }

                let ordinal = 0;
                const outgoing: Record<string, unknown>[] = [];
                const blocks = [
                    {
                        id: randomUUID(),
                        type: 'vocabulary',
                        language: 'fr',
                        translationLanguage: 'ru',
                        entries: [
                            [
                                'travail',
                                'работа',
                                'Je vais au travail chaque matin.',
                                'Я каждое утро иду на работу.',
                            ],
                            [
                                'joie',
                                'радость',
                                'Cette nouvelle me donne beaucoup de joie.',
                                'Эта новость приносит мне много радости.',
                            ],
                            [
                                'ménage',
                                'уборка',
                                'Nous faisons le ménage dans la maison.',
                                'Мы делаем уборку в доме.',
                            ],
                            [
                                'carrelage',
                                'плитка',
                                'Le carrelage de la cuisine est bleu.',
                                'Плитка на кухне синяя.',
                            ],
                            [
                                'poisson',
                                'рыба',
                                'Le poisson nage dans la rivière.',
                                'Рыба плавает в реке.',
                            ],
                            [
                                'nourriture',
                                'корм',
                                'Cette nourriture est destinée aux animaux.',
                                'Этот корм предназначен для животных.',
                            ],
                        ].map(
                            ([
                                term,
                                translation,
                                example,
                                exampleTranslation,
                            ]) => ({
                                id: randomUUID(),
                                term,
                                translation,
                                pronunciation: '/synthetic pronunciation/',
                                definition: `French vocabulary: ${term}. The meaning depends on its sentence context.`,
                                example,
                                exampleTranslation,
                            }),
                        ),
                    },
                ];
                const transport = vi.fn(
                    async (
                        url: string | URL | Request,
                        request?: RequestInit,
                    ) => {
                        expect(String(url)).toBe(
                            'https://openrouter.ai/api/v1/chat/completions',
                        );

                        const body = JSON.parse(
                            String(request?.body),
                        ) as Record<string, unknown>;

                        outgoing.push(body);
                        expect(body.model).toBe(model.id);
                        expect(Number(body.max_tokens)).toBeLessThanOrEqual(
                            4096,
                        );

                        if (
                            outcome === 'failure' ||
                            (outcome === 'recover' && outgoing.length === 1)
                        ) {
                            return Response.json(
                                {
                                    error: {
                                        message: 'Synthetic rejection',
                                        type: 'invalid_request_error',
                                    },
                                },
                                { status: outcome === 'recover' ? 401 : 400 },
                            );
                        }

                        if (body.stream !== true) {
                            const planning = JSON.stringify(
                                body.messages,
                            ).includes('Resolve the learner');
                            const revisionTargets =
                                operation === 'multi-update'
                                    ? [targetBlockId, secondTargetBlockId]
                                    : [targetBlockId];
                            const value = planning
                                ? operation !== 'append'
                                    ? {
                                          kind: 'revise-blocks',
                                          sourceBlockIds: revisionTargets,
                                          instruction:
                                              'Revise these vocabulary blocks while preserving their identities.',
                                          replyLanguage: 'ru',
                                      }
                                    : {
                                          kind: 'generate',
                                          replyLanguage: 'ru',
                                          brief: {
                                              tasks: [
                                                  {
                                                      id: 'vocabulary',
                                                      kind: 'vocabulary',
                                                      language: 'fr',
                                                      translationLanguage: 'ru',
                                                      instruction:
                                                          'Create the six requested words',
                                                      words: blocks[0]!.entries.map(
                                                          (entry) => entry.term,
                                                      ),
                                                  },
                                              ],
                                          },
                                      }
                                : operation === 'append'
                                  ? {
                                        tasks: [
                                            {
                                                taskId: 'vocabulary',
                                                blocks,
                                            },
                                        ],
                                    }
                                  : {
                                        proposals: revisionTargets.map(
                                            (targetBlockId) => ({
                                                targetBlockId,
                                                blocks: [
                                                    {
                                                        ...initialBlock,
                                                        id: targetBlockId,
                                                    },
                                                ],
                                            }),
                                        ),
                                    };

                            return Response.json({
                                id: `synthetic-object-${outgoing.length}`,
                                object: 'chat.completion',
                                created: 1,
                                model: model.id,
                                provider: 'OpenAI',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: JSON.stringify(value),
                                        },
                                        finish_reason: 'stop',
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 50,
                                    completion_tokens: 8,
                                    total_tokens: 58,
                                    cost: 0.00001025,
                                },
                            });
                        }

                        ordinal++;
                        const tool = ordinal === 1;
                        const delta = tool
                            ? {
                                  tool_calls: [
                                      ...(operation === 'multi-update'
                                          ? [
                                                {
                                                    index: 0,
                                                    id: 'synthetic-second-target-tool',
                                                    type: 'function',
                                                    function: {
                                                        name: 'propose_learning_content',
                                                        arguments:
                                                            JSON.stringify({
                                                                body: contentBody(
                                                                    blocks as LearningBlock[],
                                                                ),
                                                                targetBlockId:
                                                                    secondTargetBlockId,
                                                            }),
                                                    },
                                                },
                                            ]
                                          : []),
                                      {
                                          index:
                                              operation === 'multi-update'
                                                  ? 1
                                                  : 0,
                                          id: 'synthetic-vocabulary-tool',
                                          type: 'function',
                                          function: {
                                              name: 'propose_learning_content',
                                              arguments: JSON.stringify({
                                                  body: contentBody(
                                                      blocks as LearningBlock[],
                                                  ),
                                                  ...(operation !== 'append'
                                                      ? { targetBlockId }
                                                      : {}),
                                              }),
                                          },
                                      },
                                  ],
                              }
                            : {
                                  content:
                                      'Review the vocabulary proposal before applying it.',
                              };
                        const chunks = [
                            {
                                id: `synthetic-${ordinal}`,
                                object: 'chat.completion.chunk',
                                created: 1,
                                model: model.id,
                                provider: 'OpenAI',
                                choices: [
                                    {
                                        index: 0,
                                        delta: { role: 'assistant', ...delta },
                                        finish_reason: null,
                                    },
                                ],
                            },
                            {
                                id: `synthetic-${ordinal}`,
                                object: 'chat.completion.chunk',
                                created: 1,
                                model: model.id,
                                provider: 'OpenAI',
                                choices: [
                                    {
                                        index: 0,
                                        delta: {},
                                        finish_reason: tool
                                            ? 'tool_calls'
                                            : 'stop',
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 50,
                                    completion_tokens: 8,
                                    total_tokens: 58,
                                    cost: 0.00001025,
                                },
                            },
                        ];

                        return new Response(
                            chunks
                                .map(
                                    (chunk) =>
                                        `data: ${JSON.stringify(chunk)}\n\n`,
                                )
                                .join('') + 'data: [DONE]\n\n',
                            {
                                headers: {
                                    'content-type': 'text/event-stream',
                                },
                            },
                        );
                    },
                );

                vi.stubGlobal('fetch', transport);
                const worker = createConversationWorkerComposition({
                    database: db,
                    dictionaryHmacSecret: secret,
                    credentials: textAiFixtureCredentials,
                });

                expect(
                    await worker.processNext(new AbortController().signal),
                ).toBe(true);

                const detail = await store.detail({ ownerId }, chat.id);
                const result = detail.turns.find(
                    (item) => item.id === submitted.id,
                )!;

                // This is the incident regression: before the fix no HTTP request occurs and the turn fails here.
                expect(
                    outgoing.length,
                    JSON.stringify({
                        status: result.status,
                        failureCode: result.failureCode,
                        outputLimitReached: result.outputLimitReached,
                        admittedInput: execution.admittedMaxInputTokens,
                        requestBytes: outgoing.map((request) =>
                            Buffer.byteLength(JSON.stringify(request), 'utf8'),
                        ),
                    }),
                ).toBe(outcome === 'success' ? 2 : 1);

                expect(result.status).toBe(
                    outcome === 'success' ? 'succeeded' : 'failed',
                );

                if (outcome === 'success') {
                    expect(
                        detail.messages.some(
                            (item) =>
                                item.role === 'assistant' &&
                                item.responseMetadata?.kind ===
                                    (operation === 'append'
                                        ? 'generation'
                                        : 'revision') &&
                                item.content.length > 0,
                        ),
                    ).toBe(true);

                    const proposals = await listContentProposalsWithBlocks(
                        store,
                        { ownerId },
                        chat.id,
                    );

                    expect(proposals.proposals).toHaveLength(
                        operation === 'multi-update' ? 2 : 1,
                    );

                    expect(proposals.proposals[0]?.blocks[0]).toMatchObject(
                        operation === 'append'
                            ? {
                                  type: 'vocabulary',
                                  entries: blocks[0]!.entries.map((entry) => ({
                                      ...entry,
                                      id: expect.any(String),
                                  })),
                              }
                            : {
                                  ...initialBlock,
                                  id: proposals.proposals[0]?.target?.blockId,
                              },
                    );

                    expect(
                        (await knowledge.get(ownerId, note.id)).body
                            .schemaVersion,
                    ).toBe(2);

                    if (operation === 'multi-update') {
                        expect(
                            proposals.proposals
                                .map((proposal) => proposal.target?.blockId)
                                .sort(),
                        ).toEqual([targetBlockId, secondTargetBlockId].sort());

                        for (const proposal of proposals.proposals) {
                            expect(proposal.blocks[0]).toMatchObject({
                                ...initialBlock,
                                id: proposal.target?.blockId,
                            });
                        }

                        let version = branch.version;
                        for (const proposal of proposals.proposals) {
                            const applied = await applyContentProposal(
                                store,
                                { ownerId },
                                chat.id,
                                proposal.id,
                                version,
                            );

                            version = applied.branch.version;
                        }

                        expect(
                            (
                                await listContentProposalsWithBlocks(
                                    store,
                                    { ownerId },
                                    chat.id,
                                )
                            ).proposals.every((proposal) => proposal.appliedAt),
                        ).toBe(true);
                    } else if (operation !== 'append') {
                        expect(proposals.proposals[0]?.target).toMatchObject({
                            blockId: targetBlockId,
                        });

                        const accepted = await applyContentProposal(
                            store,
                            { ownerId },
                            chat.id,
                            proposals.proposals[0]!.id,
                            branch.version,
                        );

                        expect(
                            accepted.branch.content.body.document.content,
                        ).toHaveLength(2);

                        expect(
                            accepted.branch.content.body.document.content?.[1]
                                ?.attrs?.block,
                        ).toMatchObject({
                            id: targetBlockId,
                            type: 'vocabulary',
                            entries: expect.any(Array),
                        });

                        expect(
                            (await knowledge.get(ownerId, note.id)).body
                                .document.content?.[1]?.attrs?.block,
                        ).toEqual(initialBlock);
                    }
                } else {
                    expect(
                        detail.messages.some(
                            (item) =>
                                item.role === 'assistant' &&
                                item.content.length > 0,
                        ),
                    ).toBe(false);

                    expect(result.usage.chargedCredits).toBe('0');
                    expect(
                        (
                            await listContentProposalsWithBlocks(
                                store,
                                { ownerId },
                                chat.id,
                            )
                        ).proposals,
                    ).toHaveLength(0);
                }

                const [action] = await db.execute(
                    sql`select state, held_milli, charged_milli, funding from ai_credit_actions where id=${submitted.id}::uuid`,
                );

                expect(action?.state).toBe('settled');
                expect(action?.funding).toBe(funding);
                if (funding === 'operator' || outcome !== 'success') {
                    expect(String(action?.charged_milli)).toBe('0');
                } else {
                    expect(
                        BigInt(String(action?.charged_milli)),
                    ).toBeGreaterThan(0n);
                }

                if (funding === 'operator') {
                    expect(String(action?.held_milli)).toBe('0');
                }

                const expenses = await db.execute(
                    sql`select measurement,amount_usd_micros,provider_id,model_id from ai_provider_expense_records where action_id=${submitted.id}::uuid`,
                );
                const attempts = await db.execute(
                    sql`select input_limit,output_limit,budget from ai_credit_action_attempts where action_id=${submitted.id}::uuid order by ordinal`,
                );

                expect(attempts).toHaveLength(outcome === 'success' ? 2 : 1);

                for (const attempt of attempts) {
                    expect(Number(attempt.input_limit)).toBeLessThanOrEqual(
                        execution.admittedMaxInputTokens,
                    );

                    expect(Number(attempt.output_limit)).toBeLessThanOrEqual(
                        4096,
                    );

                    expect(attempt.budget).toEqual(execution.budget);
                }

                expect(expenses).toHaveLength(outcome === 'success' ? 2 : 1);

                for (const expense of expenses) {
                    expect(expense.provider_id).toBe(model.providerId);
                    expect(expense.model_id).toBe(model.id);
                    if (outcome === 'success') {
                        expect(expense.measurement).toBe('measured');
                        expect(
                            BigInt(String(expense.amount_usd_micros)),
                        ).toBeGreaterThan(0n);
                    } else {
                        expect(expense.measurement).toBe('unknown');
                        expect(expense.amount_usd_micros).toBeNull();
                    }
                }

                const [persisted] = await db
                    .select()
                    .from(turns)
                    .where(eq(turns.id, submitted.id));

                expect(persisted?.execution).toEqual(admitted?.execution);

                expect(
                    await db
                        .select()
                        .from(probes)
                        .where(eq(probes.routeId, routeId)),
                ).toEqual(diagnosticHistory);

                if (outcome === 'recover') {
                    const health = await db.execute(
                        sql`select reason from text_ai_route_health_events where route_id=${routeId}`,
                    );

                    expect(health).toEqual([
                        expect.objectContaining({
                            reason: 'authorization_failed',
                        }),
                    ]);

                    await expect(
                        store.submit({ ownerId }, chat.id, {
                            ...submissionInput,
                            requestId: randomUUID(),
                        }),
                    ).rejects.toMatchObject({ code: 'model_unavailable' });

                    expect(outgoing).toHaveLength(1);

                    // Fenced financial dispatch reads PostgreSQL clock_timestamp().
                    // Wait through the real production cooldown; changing JS time would
                    // bypass admission only and would not prove worker recovery.
                    await delay(61_000);
                    // A fresh conversation isolates route recovery from the separate
                    // reduced per-action input ceiling on accumulated chat history.
                    const recoveredChat = await store.create(
                        { ownerId },
                        { source: { kind: 'knowledge', id: note.id } },
                    );
                    const recovered = await store.submit(
                        { ownerId },
                        recoveredChat.id,
                        {
                            ...submissionInput,
                            requestId: randomUUID(),
                        },
                    );

                    expect(
                        await worker.processNext(new AbortController().signal),
                    ).toBe(true);

                    const recoveredDetail = await store.detail(
                        { ownerId },
                        recoveredChat.id,
                    );

                    expect(
                        recoveredDetail.turns.find(
                            (item) => item.id === recovered.id,
                        )?.status,
                    ).toBe('succeeded');

                    expect(
                        (
                            await listContentProposalsWithBlocks(
                                store,
                                { ownerId },
                                recoveredChat.id,
                            )
                        ).proposals,
                    ).toHaveLength(1);

                    const [recoveredAction] = await db.execute(
                        sql`select state,held_milli,charged_milli from ai_credit_actions where id=${recovered.id}::uuid`,
                    );

                    expect(recoveredAction?.state).toBe('settled');
                    expect(
                        BigInt(String(recoveredAction?.charged_milli)),
                    ).toBeLessThanOrEqual(
                        BigInt(String(recoveredAction?.held_milli)),
                    );

                    expect(
                        BigInt(String(recoveredAction?.charged_milli)),
                    ).toBeGreaterThan(0n);

                    const recoveredExpenses = await db.execute(
                        sql`select provider_id,model_id,measurement from ai_provider_expense_records where action_id=${recovered.id}::uuid`,
                    );

                    expect(recoveredExpenses).toHaveLength(2);
                    expect(
                        recoveredExpenses.every(
                            (expense) =>
                                expense.provider_id === model.providerId &&
                                expense.model_id === model.id &&
                                expense.measurement === 'measured',
                        ),
                    ).toBe(true);

                    expect(
                        await db
                            .select()
                            .from(probes)
                            .where(eq(probes.routeId, routeId)),
                    ).toEqual(diagnosticHistory);
                }
            },
            // One recovery case intentionally crosses the production 60-second cooldown.
            90_000,
        );

        it('admits a 50-entry applied vocabulary draft and a following 10-entry request at the production 64k boundary', async () => {
            await readyLessonRoute();
            const note = await knowledge.create(ownerId, {
                operationId: randomUUID(),
                content,
            });
            const workspace = await knowledge.getWorkspace(ownerId, note.id);
            const branch = workspace.branches.find(
                (item) => item.id === workspace.preferredBranchId,
            )!;
            const chat = await store.create(
                { ownerId },
                { source: { kind: 'knowledge', id: note.id } },
            );
            const vocabulary = (count: number) => ({
                id: randomUUID(),
                type: 'vocabulary',
                title: `${count} shopping terms`,
                language: 'fr',
                translationLanguage: 'ru',
                entries: Array.from({ length: count }, (_, index) => ({
                    id: randomUUID(),
                    term: `mot-${index + 1}`,
                    translation: `слово-${index + 1}`,
                    definition: `A shopping term number ${index + 1}. ${'Useful contextual detail. '.repeat(10)}`,
                    example: `J'utilise mot-${index + 1} au magasin.`,
                    exampleTranslation: `Я использую слово-${index + 1} в магазине.`,
                })),
            });
            const first = vocabulary(50);
            const second = vocabulary(10);
            const outgoing: Record<string, unknown>[] = [];
            let authoringCalls = 0;
            vi.stubGlobal(
                'fetch',
                vi.fn(
                    async (
                        _url: string | URL | Request,
                        request?: RequestInit,
                    ) => {
                        const body = JSON.parse(
                            String(request?.body),
                        ) as Record<string, unknown>;

                        outgoing.push(body);
                        const messages = body.messages as Array<{
                            content:
                                string | Array<{ type: string; text?: string }>;
                        }>;
                        const texts = messages.flatMap((message) =>
                            typeof message.content === 'string'
                                ? [message.content]
                                : message.content.flatMap((part) =>
                                      part.type === 'text' && part.text
                                          ? [part.text]
                                          : [],
                                  ),
                        );
                        const prompt = texts.join('\n');
                        const planning = prompt.includes('Resolve the learner');
                        const currentQuestion = planning
                            ? String(
                                  (
                                      JSON.parse(
                                          texts.find((text) =>
                                              text.startsWith(
                                                  '{"hostExecutionPolicy"',
                                              ),
                                          )!,
                                      ) as {
                                          currentMessage: {
                                              parts: Array<{ text: string }>;
                                          };
                                      }
                                  ).currentMessage.parts[0]!.text,
                              )
                            : '';
                        const value = planning
                            ? {
                                  kind: 'generate',
                                  replyLanguage: 'ru',
                                  brief: {
                                      tasks: [
                                          {
                                              id: 'vocabulary',
                                              kind: 'vocabulary',
                                              language: 'fr',
                                              translationLanguage: 'ru',
                                              instruction:
                                                  currentQuestion.includes(
                                                      'top 50',
                                                  )
                                                      ? 'Create the requested top 50 shopping terms.'
                                                      : 'Create ten additional shopping terms.',
                                              count: currentQuestion.includes(
                                                  'top 50',
                                              )
                                                  ? 50
                                                  : 10,
                                          },
                                      ],
                                  },
                              }
                            : (() => {
                                  const brief = JSON.parse(
                                      prompt
                                          .split(
                                              'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
                                          )[1]!
                                          .split('\n')[0]!,
                                  ) as {
                                      tasks: Array<{
                                          id: string;
                                          count?: number;
                                          language?: string;
                                          translationLanguage?: string;
                                      }>;
                                  };
                                  const progress = JSON.parse(
                                      prompt
                                          .split(
                                              'Vocabulary batch progress (host-controlled data): ',
                                          )[1]!
                                          .split('\n')[0]!,
                                  ) as { offset: number } | null;
                                  const offset = progress?.offset ?? 0;
                                  const task = brief.tasks[0]!;
                                  const vocabularyBlock =
                                      authoringCalls < 2 ? first : second;

                                  authoringCalls++;

                                  return {
                                      tasks: [
                                          {
                                              taskId: task.id,
                                              blocks: [
                                                  {
                                                      ...vocabularyBlock,
                                                      id: randomUUID(),
                                                      language:
                                                          task.language ?? 'fr',
                                                      translationLanguage:
                                                          task.translationLanguage ??
                                                          'ru',
                                                      entries:
                                                          vocabularyBlock.entries.slice(
                                                              offset,
                                                              offset +
                                                                  (task.count ??
                                                                      0),
                                                          ),
                                                  },
                                              ],
                                          },
                                      ],
                                  };
                              })();

                        return Response.json({
                            id: `synthetic-object-${outgoing.length}`,
                            object: 'chat.completion',
                            created: 1,
                            model: model.id,
                            provider: 'OpenAI',
                            choices: [
                                {
                                    index: 0,
                                    message: {
                                        role: 'assistant',
                                        content: JSON.stringify(value),
                                    },
                                    finish_reason: 'stop',
                                },
                            ],
                            usage: {
                                prompt_tokens: 50,
                                completion_tokens: 8,
                                total_tokens: 58,
                                cost: 0.00001025,
                            },
                        });
                    },
                ),
            );

            const worker = createConversationWorkerComposition({
                database: db,
                dictionaryHmacSecret: secret,
                credentials: textAiFixtureCredentials,
            });
            const submit = async (
                requestId: string,
                question: string,
                editor: string,
                version: number,
            ) =>
                store.submit({ ownerId }, chat.id, {
                    requestId,
                    content: question,
                    attachments: [],
                    blockReferences: [],
                    editorContext: {
                        content: editor,
                        editorTarget: {
                            from: editor.length,
                            to: editor.length,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update(editor)
                                .digest('hex'),
                        },
                        workingBranch: { id: branch.id, version },
                    },
                });
            const firstTurn = await submit(
                randomUUID(),
                'Generate vocabulary with top 50 words used for shopping.',
                'French vocabulary.',
                branch.version,
            );

            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );

            const firstDetail = await store.detail({ ownerId }, chat.id);
            expect(
                firstDetail.turns.find((turn) => turn.id === firstTurn.id),
            ).toMatchObject({
                status: 'succeeded',
                failureCode: null,
            });

            const firstProposal = (
                await listContentProposalsWithBlocks(
                    store,
                    { ownerId },
                    chat.id,
                )
            ).proposals[0];

            expect(firstProposal).toBeDefined();
            if (!firstProposal) {
                throw new Error(
                    'The complete first proposal must exist before applying it.',
                );
            }

            const applied = await applyContentProposal(
                store,
                { ownerId },
                chat.id,
                firstProposal.id,
                branch.version,
            );
            const populatedEditor = knowledgeBodyPlainText(
                applied.branch.content.body,
            );

            expect(Buffer.byteLength(populatedEditor, 'utf8')).toBeGreaterThan(
                16_000,
            );

            const nextTurn = await submit(
                randomUUID(),
                'Generate 10 more shopping words.',
                populatedEditor,
                applied.branch.version,
            );

            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );

            const detail = await store.detail({ ownerId }, chat.id);
            expect(
                detail.turns.find((turn) => turn.id === firstTurn.id)?.status,
            ).toBe('succeeded');

            expect(
                detail.turns.find((turn) => turn.id === nextTurn.id)?.status,
                JSON.stringify({
                    turn: detail.turns.find((turn) => turn.id === nextTurn.id),
                    calls: outgoing.map((request) => ({
                        stream: request.stream,
                        bytes: Buffer.byteLength(JSON.stringify(request)),
                    })),
                    authoringCalls,
                }),
            ).toBe('succeeded');

            const proposals = await listContentProposalsWithBlocks(
                store,
                { ownerId },
                chat.id,
            );

            expect(proposals.proposals).toHaveLength(2);
            const nextVocabulary = proposals.proposals
                .find((proposal) => proposal.turnId === nextTurn.id)
                ?.blocks.find((block) => block.type === 'vocabulary');

            expect(nextVocabulary).toMatchObject({
                type: 'vocabulary',
                entries: expect.arrayContaining([
                    expect.objectContaining({ term: 'mot-10' }),
                ]),
            });

            expect(nextVocabulary?.entries).toHaveLength(10);
            expect(outgoing).toHaveLength(5);
        });

        it.each(['\\'.repeat(13_000), '"'.repeat(13_000), '\0'.repeat(6_500)])(
            'rejects an irreducibly escaped editor before holding or queueing work',
            async (editor) => {
                await readyLessonRoute();
                const note = await knowledge.create(ownerId, {
                    operationId: randomUUID(),
                    content,
                });
                const workspace = await knowledge.getWorkspace(
                    ownerId,
                    note.id,
                );
                const branch = workspace.branches.find(
                    (item) => item.id === workspace.preferredBranchId,
                )!;
                const chat = await store.create(
                    { ownerId },
                    { source: { kind: 'knowledge', id: note.id } },
                );

                await expect(
                    store.submit({ ownerId }, chat.id, {
                        requestId: randomUUID(),
                        content: 'Explain this escaped material.',
                        attachments: [],
                        blockReferences: [],
                        editorContext: {
                            content: editor,
                            editorTarget: {
                                from: editor.length,
                                to: editor.length,
                                originalText: '',
                                documentHash: createHash('sha256')
                                    .update(editor)
                                    .digest('hex'),
                            },
                            workingBranch: {
                                id: branch.id,
                                version: branch.version,
                            },
                        },
                    }),
                ).rejects.toMatchObject({ code: 'context_too_large' });

                const [counts] = await client`select
                (select count(*) from conversation_turns where conversation_id=${chat.id})::integer as turns,
                (select count(*) from ai_credit_actions where owner_id=${ownerId})::integer as actions`;

                expect(counts).toMatchObject({ turns: 0, actions: 0 });
            },
        );

        it('runs one observational-memory preparation before planner and a source-read answer without rewriting persisted history', async () => {
            await readyLessonRoute();
            const note = await knowledge.create(ownerId, {
                operationId: randomUUID(),
                content,
            });
            const workspace = await knowledge.getWorkspace(ownerId, note.id);
            const branch = workspace.branches.find(
                (item) => item.id === workspace.preferredBranchId,
            )!;
            const chat = await store.create(
                { ownerId },
                { source: { kind: 'knowledge', id: note.id } },
            );
            const { TokenCounter, parseObserverOutput } =
                await import('@mastra/memory/processors');
            const counter = new TokenCounter();
            const observationsAtLeast = (prefix: string, minimum: number) => {
                const lines: string[] = [];
                while (counter.countObservations(lines.join('\n')) < minimum) {
                    const index = lines.length;
                    const marker = createHash('sha256')
                        .update(`${prefix}-${index}`)
                        .digest('hex')
                        .slice(0, 24);

                    lines.push(
                        `- ${prefix} lesson ${index}: learner reviewed distinct example ${marker}.`,
                    );
                }

                return lines.join('\n');
            };
            const priorObservations = observationsAtLeast('Prior', 1_500);
            const newObservations = observationsAtLeast('Recent', 1_500);
            const observerOutput = `<observations>\n${newObservations}\n</observations>`;
            const reflectionOutput =
                '<observations>\n- Remember the earlier answer and the reviewed French vocabulary examples.\n</observations>';
            const observerTokens = counter.countObservations(newObservations);
            expect(observerTokens).toBeLessThanOrEqual(2_048);
            // The pinned SDK rejects repetitive output and requires XML closing
            // tags on separate lines. Verify the synthetic response is usable.
            expect(parseObserverOutput(observerOutput).observations).toBe(
                newObservations,
            );

            const calls: Record<string, unknown>[] = [];
            let ordinal = 0;
            vi.stubGlobal(
                'fetch',
                vi.fn(
                    async (
                        _url: string | URL | Request,
                        request?: RequestInit,
                    ) => {
                        const body = JSON.parse(
                            String(request?.body),
                        ) as Record<string, unknown>;

                        calls.push(body);
                        ordinal++;
                        const stream = body.stream === true;
                        const text =
                            ordinal === 1
                                ? JSON.stringify({
                                      kind: 'answer',
                                      purpose: 'learning-explanation',
                                      replyLanguage: 'en',
                                      documentUse: false,
                                  })
                                : ordinal === 2
                                  ? 'Historical answer. '.repeat(1_600)
                                  : ordinal === 3
                                    ? observerOutput
                                    : ordinal === 4
                                      ? reflectionOutput
                                      : ordinal === 5
                                        ? JSON.stringify({
                                              kind: 'answer',
                                              purpose: 'learning-explanation',
                                              replyLanguage: 'en',
                                              documentUse: false,
                                          })
                                        : ordinal === 7
                                          ? 'The authorized source says French vocabulary.'
                                          : '';

                        if (!stream) {
                            const completionTokens =
                                ordinal === 3 ? observerTokens : 8;

                            return Response.json({
                                id: `object-${ordinal}`,
                                object: 'chat.completion',
                                created: 1,
                                model: model.id,
                                provider: 'OpenAI',
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: 'assistant',
                                            content: text,
                                        },
                                        finish_reason: 'stop',
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 50,
                                    completion_tokens: completionTokens,
                                    total_tokens: 50 + completionTokens,
                                    cost: 0.00001025,
                                },
                            });
                        }

                        const delta =
                            ordinal === 6
                                ? {
                                      tool_calls: [
                                          {
                                              index: 0,
                                              id: 'source-read',
                                              type: 'function',
                                              function: {
                                                  name: 'read_source_context',
                                                  arguments: JSON.stringify({
                                                      query: 'French vocabulary',
                                                      limit: 1,
                                                  }),
                                              },
                                          },
                                      ],
                                  }
                                : { content: text };
                        const chunks = [
                            {
                                id: `stream-${ordinal}`,
                                object: 'chat.completion.chunk',
                                created: 1,
                                model: model.id,
                                provider: 'OpenAI',
                                choices: [
                                    {
                                        index: 0,
                                        delta: { role: 'assistant', ...delta },
                                        finish_reason: null,
                                    },
                                ],
                            },
                            {
                                id: `stream-${ordinal}`,
                                object: 'chat.completion.chunk',
                                created: 1,
                                model: model.id,
                                provider: 'OpenAI',
                                choices: [
                                    {
                                        index: 0,
                                        delta: {},
                                        finish_reason:
                                            ordinal === 6
                                                ? 'tool_calls'
                                                : 'stop',
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 50,
                                    completion_tokens: 8,
                                    total_tokens: 58,
                                    cost: 0.00001025,
                                },
                            },
                        ];

                        return new Response(
                            chunks
                                .map(
                                    (chunk) =>
                                        `data: ${JSON.stringify(chunk)}\n\n`,
                                )
                                .join('') + 'data: [DONE]\n\n',
                            {
                                headers: {
                                    'content-type': 'text/event-stream',
                                },
                            },
                        );
                    },
                ),
            );

            const worker = createConversationWorkerComposition({
                database: db,
                dictionaryHmacSecret: secret,
                credentials: textAiFixtureCredentials,
            });
            const submit = (question: string) =>
                store.submit({ ownerId }, chat.id, {
                    requestId: randomUUID(),
                    content: question,
                    attachments: [],
                    blockReferences: [],
                    editorContext: {
                        content: 'French vocabulary.',
                        editorTarget: {
                            from: 18,
                            to: 18,
                            originalText: '',
                            documentHash: createHash('sha256')
                                .update('French vocabulary.')
                                .digest('hex'),
                        },
                        workingBranch: {
                            id: branch.id,
                            version: branch.version,
                        },
                    },
                });

            await submit('Explain the document.');
            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );

            const historyBefore = await db
                .select({
                    id: persistedMessages.id,
                    content: persistedMessages.content,
                    modelContent: persistedMessages.modelContent,
                })
                .from(persistedMessages)
                .where(eq(persistedMessages.conversationId, chat.id))
                .orderBy(persistedMessages.createdAt);
            const { ConversationMemoryStorage } =
                await import('../../../../src/modules/conversations/infrastructure/ai/conversation-memory-storage');
            const { conversationMemoryTable: memoryRows } =
                await import('../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema');
            // Seed legitimate prior observations through the production SDK
            // storage API. Each new observation fits its output allowance;
            // accumulated memory, rather than an oversized response, triggers reflection.
            const storage = new ConversationMemoryStorage({
                conversationId: chat.id,
                ownerId,
                createdAt: chat.createdAt,
                port: {
                    listMessages: async () => ({ messages: [], total: 0 }),
                    saveMessages: async () => {
                        throw new Error(
                            'Observation setup cannot rewrite chat history.',
                        );
                    },
                    readState: async (key) => {
                        const [row] = await db
                            .select({ value: memoryRows.value })
                            .from(memoryRows)
                            .where(
                                and(
                                    eq(memoryRows.conversationId, chat.id),
                                    eq(memoryRows.key, key),
                                ),
                            );

                        return (
                            (row?.value as Record<string, unknown> | null) ??
                            null
                        );
                    },
                    writeState: async (entries) => {
                        await db.transaction(async (tx) => {
                            for (const [key, value] of Object.entries(
                                entries,
                            )) {
                                await tx
                                    .insert(memoryRows)
                                    .values({
                                        conversationId: chat.id,
                                        key,
                                        value,
                                        updatedAt: new Date(),
                                    })
                                    .onConflictDoUpdate({
                                        target: [
                                            memoryRows.conversationId,
                                            memoryRows.key,
                                        ],
                                        set: { value, updatedAt: new Date() },
                                    });
                            }
                        });
                    },
                },
            });
            const beforeRecord = await storage.getObservationalMemory(
                chat.id,
                ownerId,
            );

            expect(beforeRecord).not.toBeNull();
            await storage.updateActiveObservations({
                id: beforeRecord!.id,
                observations: priorObservations,
                tokenCount: counter.countObservations(priorObservations),
                lastObservedAt: new Date(Date.parse(chat.createdAt) - 1),
                observedMessageIds: [],
            });

            const current = await submit(
                'Explain the source and use the source tool.',
            );

            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );

            const historyAfter = await db
                .select({
                    id: persistedMessages.id,
                    content: persistedMessages.content,
                    modelContent: persistedMessages.modelContent,
                })
                .from(persistedMessages)
                .where(eq(persistedMessages.conversationId, chat.id))
                .orderBy(persistedMessages.createdAt);

            expect(historyAfter.slice(0, historyBefore.length)).toEqual(
                historyBefore,
            );

            expect(calls).toHaveLength(7);
            expect(calls.slice(2)).toHaveLength(5);
            const attempts =
                await client`select purpose,state from ai_credit_action_attempts where action_id=${current.id} order by ordinal`;

            expect(attempts.map((attempt) => attempt.purpose)).toEqual([
                'observation',
                'reflection',
                'answer',
                'answer',
                'answer',
            ]);

            expect(
                attempts.every((attempt) => attempt.state === 'settled'),
            ).toBe(true);

            const reflected = await storage.getObservationalMemory(
                chat.id,
                ownerId,
            );

            expect(reflected?.generationCount).toBe(1);
            expect(reflected?.activeObservations).toContain(
                'Remember the earlier answer',
            );

            const reflectionThreshold = Number(
                (
                    reflected?.config?.reflection as
                        { observationTokens?: number } | undefined
                )?.observationTokens,
            );

            expect(counter.countObservations(priorObservations)).toBeLessThan(
                reflectionThreshold,
            );

            expect(
                counter.countObservations(
                    `${priorObservations}\n${newObservations}`,
                ),
            ).toBeGreaterThanOrEqual(reflectionThreshold);

            expect(JSON.stringify(calls[3])).toContain('Prior lesson');
            expect(JSON.stringify(calls[3])).toContain('Recent lesson');
            expect(JSON.stringify(calls[4])).toContain(
                'Remember the earlier answer',
            );

            expect(JSON.stringify(calls[5])).toContain('read_source_context');
            const detail = await store.detail({ ownerId }, chat.id);
            expect(
                detail.turns.find((turn) => turn.id === current.id)?.status,
            ).toBe('succeeded');
        });
    },
);
