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

        afterEach(() => vi.unstubAllGlobals());

        beforeEach(async () => {
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

        async function readyOperatorRoute() {
            const now = new Date();
            await db.insert(capabilityPolicyRevisionsTable).values({
                id: randomUUID(),
                capability: 'conversation',
                version: 1,
                funding: 'operator',
                createdAt: now,
                reason: 'Synthetic production context regression',
            });

            await seedTextAiRoutingFixture(db, {
                routeId: 'openrouter/openai/gpt-6-luna',
                replace: true,
                seedProbes: false,
                omittedTariffFlows: ['conversation'],
            });

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
        }

        it('atomically transfers nonempty pending source snapshots to a run while preserving proposal history and unrelated memory', async () => {
            await readyOperatorRoute();
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

        it.each([false, true])(
            'executes the retained French/Russian lesson through the real worker (pause and discard: %s)',
            async (pauseAndDiscard) => {
                const privatePlanMarker = `private-plan-${randomUUID()}`;
                await readyOperatorRoute();
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
                const readingExercises = ['R01', 'R04', 'R08'].map(
                    (activityId) =>
                        namedExerciseFixture({
                            activityId: activityId as 'R01' | 'R04' | 'R08',
                            sources: [reading],
                            language: 'fr',
                            explanationLanguage: 'fr',
                        }),
                );
                const grammarExercises = Array.from(
                    { length: 4 },
                    (_, index) => ({
                        ...namedExerciseFixture({
                            activityId: 'G02',
                            sources: [grammar],
                            language: 'fr',
                            explanationLanguage: 'fr',
                        }),
                        question: `Appliquez la règle du COD ou du COI dans le cas ${index + 1}.`,
                    }),
                );
                const authorResponses = [
                    [{ taskId: 'reading', blocks: [reading] }],
                    [{ taskId: 'reading-exercises', blocks: readingExercises }],
                    [{ taskId: 'grammar', blocks: [grammar] }],
                    [{ taskId: 'grammar-exercises', blocks: grammarExercises }],
                ];
                let requestCount = 0;
                const outgoing: Record<string, unknown>[] = [];
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
                            if (pauseAndDiscard && requestCount === 2) {
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
                                                              activityId: 'G02',
                                                              count: 4,
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
                                    completion_tokens: pauseAndDiscard
                                        ? requestCount === 1
                                            ? 300
                                            : 3900
                                        : 80,
                                    total_tokens: pauseAndDiscard
                                        ? requestCount === 1
                                            ? 350
                                            : 3950
                                        : 130,
                                    cost: 0.00001,
                                },
                            });
                        },
                    ),
                );

                const submitted = await store.submit({ ownerId }, chat.id, {
                    requestId: randomUUID(),
                    content:
                        'Create the retained French/Russian democracy lesson with three reading exercises, COD/COI grammar and four grammar exercises.',
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

                expect(
                    await worker.processNext(new AbortController().signal),
                ).toBe(true);

                const detail = await store.detail({ ownerId }, chat.id);
                expect(
                    detail.turns.find((turn) => turn.id === submitted.id),
                ).toMatchObject({ status: 'succeeded', failureCode: null });

                expect(outgoing).toHaveLength(pauseAndDiscard ? 3 : 5);
                const runs = await store.listGenerationRuns(
                    { ownerId },
                    chat.id,
                );

                if (pauseAndDiscard) {
                    const run = runs.runs[0]!;
                    expect(run).toMatchObject({
                        state: 'paused',
                        pauseReason: 'budget',
                        completedTaskCount: 2,
                        totalTaskCount: 4,
                    });

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

                    await store.discardGenerationRun(
                        { ownerId },
                        chat.id,
                        run.id,
                        {
                            requestId: randomUUID(),
                            expectedRevision: run.revision,
                        },
                    );

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
            await readyOperatorRoute();
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
                await readyOperatorRoute();
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
            await readyOperatorRoute();
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
