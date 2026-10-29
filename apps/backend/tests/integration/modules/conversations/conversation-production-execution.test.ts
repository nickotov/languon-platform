import { createHash, randomUUID } from 'node:crypto';
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
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { createConversationWorkerComposition } from '../../../../src/modules/conversations/infrastructure/conversation-worker-composition';
import {
    conversationAdmission,
    settleInterruptedConversationCalls,
} from '../../../../src/modules/conversations/infrastructure/conversation-accounting';
import { DrizzleConversationStore } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { conversationTurnsTable as turns } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { DrizzleKnowledgeTransactionParticipant } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiProviderPriceRevisionsTable as providerPrices } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { capabilityPolicyRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { dictionaryAiWorkerObservationsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { conversationExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
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
        schemaVersion: 1 as const,
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
        it.each([
            { funding: 'operator', outcome: 'success' },
            { funding: 'customer', outcome: 'success' },
            { funding: 'operator', outcome: 'failure' },
            { funding: 'customer', outcome: 'failure' },
        ] as const)(
            '$funding $outcome survives admission through the default worker and SDK without widening its budget',
            async ({ funding, outcome }) => {
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
                    ...(funding === 'operator'
                        ? { omittedTariffFlows: ['conversation'] }
                        : {}),
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
                if (funding === 'customer')
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
                const submitted = await store.submit({ ownerId }, chat.id, {
                    requestId: randomUUID(),
                    content:
                        'Propose a French to English vocabulary block for travail.',
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
                const [admitted] = await db
                    .select()
                    .from(turns)
                    .where(eq(turns.id, submitted.id));
                const execution = admitted!.execution as {
                    budget: {
                        maxCostMicrosPerAttempt: number;
                        inputCostMicrosPerMillionTokens: number;
                        outputCostMicrosPerMillionTokens: number;
                    };
                    snapshot: {
                        aggregateBudget: { maxCostMicrosPerAttempt: number };
                        routingAuthority: { tariffPublished: boolean };
                    };
                };
                expect(execution.budget.maxCostMicrosPerAttempt).toBeLessThan(
                    model.aggregateBudget.maxCostMicrosPerAttempt,
                );
                expect(execution.snapshot.aggregateBudget).toEqual(
                    execution.budget,
                );
                expect(execution.budget).toMatchObject({
                    inputCostMicrosPerMillionTokens: 125000,
                    outputCostMicrosPerMillionTokens: 500000,
                });

                if (funding === 'operator')
                    expect(
                        execution.snapshot.routingAuthority.tariffPublished,
                    ).toBe(false);
                let ordinal = 0;
                const outgoing: Record<string, unknown>[] = [];
                const blocks = [
                    {
                        id: randomUUID(),
                        type: 'vocabulary',
                        language: 'fr',
                        translationLanguage: 'en',
                        entries: [
                            {
                                id: randomUUID(),
                                term: 'travail',
                                translation: 'work',
                            },
                        ],
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
                        if (outcome === 'failure')
                            return Response.json(
                                {
                                    error: {
                                        message: 'Synthetic rejection',
                                        type: 'invalid_request_error',
                                    },
                                },
                                { status: 400 },
                            );
                        ordinal++;
                        const tool = ordinal === 1;
                        const delta = tool
                            ? {
                                  tool_calls: [
                                      {
                                          index: 0,
                                          id: 'synthetic-vocabulary-tool',
                                          type: 'function',
                                          function: {
                                              name: 'propose_learning_blocks',
                                              arguments: JSON.stringify({
                                                  blocks,
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
                expect(outgoing.length).toBe(outcome === 'success' ? 2 : 1);
                expect(result.status).toBe(
                    outcome === 'success' ? 'succeeded' : 'failed',
                );
                if (outcome === 'success') {
                    expect(
                        detail.messages.some(
                            (item) =>
                                item.role === 'assistant' &&
                                item.content.includes(
                                    'Review the vocabulary proposal',
                                ),
                        ),
                    ).toBe(true);
                    const proposals = await store.listBlockProposals(
                        { ownerId },
                        chat.id,
                    );
                    expect(proposals.proposals).toHaveLength(1);
                    expect(proposals.proposals[0]?.blocks[0]).toMatchObject({
                        type: 'vocabulary',
                        entries: [{ term: 'travail', translation: 'work' }],
                    });
                    expect(
                        (await knowledge.get(ownerId, note.id)).body
                            .schemaVersion,
                    ).toBe(1);
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
                        (await store.listBlockProposals({ ownerId }, chat.id))
                            .proposals,
                    ).toHaveLength(0);
                }
                const [action] = await db.execute(
                    sql`select state, held_milli, charged_milli, funding from ai_credit_actions where id=${submitted.id}::uuid`,
                );
                expect(action?.state).toBe('settled');
                expect(action?.funding).toBe(funding);
                if (funding === 'operator' || outcome === 'failure')
                    expect(String(action?.charged_milli)).toBe('0');
                else
                    expect(
                        BigInt(String(action?.charged_milli)),
                    ).toBeGreaterThan(0n);
                if (funding === 'operator')
                    expect(String(action?.held_milli)).toBe('0');
                const expenses = await db.execute(
                    sql`select measurement,amount_usd_micros,provider_id,model_id from ai_provider_expense_records where action_id=${submitted.id}::uuid`,
                );
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
            },
        );
    },
);
