import { seedInterviewAccountingFixture } from './ai-accounting-fixture';
import type { CapabilityPolicy } from '@languon/contracts';
import { capabilityPolicyRevisionsTable } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { eq, max } from 'drizzle-orm';
import {
    AuthenticationSuccessResponseSchema,
    SignUpResponseSchema,
    KnowledgeNoteContentSchema,
} from '@languon/contracts';
import { createApp } from '../../src/app';
import { loadEnvironment } from '../../src/config/environment';
import { createAuthenticationComposition } from '../../src/modules/authentication/infrastructure/authentication-composition';
import { createDictionaryComposition } from '../../src/modules/dictionaries/infrastructure/dictionary-composition';
import { createTextsContentComposition } from '../../src/modules/texts/infrastructure/texts-composition';
import { loadTextTranslationProposal } from '../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-support';
import { createConversationsComposition } from '../../src/modules/conversations/infrastructure/conversations-composition';
import {
    conversationAdmission,
    createConversationAccounting,
    settleInterruptedConversationCalls,
} from '../../src/modules/conversations/infrastructure/conversation-accounting';
import { createContextualTutorRunner } from '../../src/modules/conversations/infrastructure/ai/contextual-tutor-runner';
import type { TutorProviderModel } from '../../src/modules/conversations/infrastructure/ai/accounted-tutor-model';
import { createKnowledgeService } from '../../src/modules/knowledge/infrastructure/knowledge-composition';
import { createKnowledgeRoutes } from '../../src/modules/knowledge/interface/http/knowledge.routes';
import { createNavigationService } from '../../src/modules/navigation/infrastructure/navigation-composition';
import { createNavigationRoutes } from '../../src/modules/navigation/interface/http/navigation.routes';
import { eraseConversationSource } from '../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import { createTextAiModule } from '../../src/modules/text-ai/infrastructure/text-ai-composition';
import { createLearnerPortraitModule } from '../../src/modules/learner-portraits/infrastructure/learner-portrait-composition';
import { createLearnerPortraitRoutes } from '../../src/modules/learner-portraits/interface/http/learner-portrait.routes';
import { InterviewWorkerService } from '../../src/modules/learner-portraits/application/interview-worker-service';
import { createLearnerInterviewerRunner } from '../../src/modules/learner-portraits/infrastructure/ai/learner-interviewer';
import {
    readInterviewInputTokenLimit,
    readInterviewOutputTokenLimit,
} from '../../src/modules/learner-portraits/infrastructure/ai/interview-request';
import { createInterviewAccounting } from '../../src/modules/learner-portraits/infrastructure/interview-accounting';
import { readApprovedPortraitForConversation } from '../../src/modules/learner-portraits/infrastructure/persistence/drizzle/drizzle-portrait-store';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import type { TextAiAdmissionExecution } from '../../src/modules/text-ai/application/text-ai-admission-participant';
import {
    conversationExecutionObservationId,
    portraitInterviewExecutionObservationId,
} from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { DrizzleAiCreditTransactionParticipant } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { UserProfileService } from '../../src/modules/users/application/user-profile-service';
import { DrizzleUsersUnitOfWork } from '../../src/modules/users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    migrateTestDatabase,
} from '../integration/support/test-database';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    uniqueAuthRedisNamespace,
} from '../integration/support/test-redis';

export const proposedContent = KnowledgeNoteContentSchema.parse({
    title: 'River bank usage',
    summary: 'Distinguish a river bank from a financial bank.',
    categories: ['vocabulary', 'usage'],
    studiedLanguage: 'en',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'A river bank is the land beside a river.',
                        },
                    ],
                },
            ],
        },
    },
});

function assertFixtureTarget() {
    if (
        process.env.LEARNER_PORTRAIT_WEB_FIXTURE !== 'true' ||
        process.env.APP_ENV !== 'test'
    )
        throw new Error(
            'Explicit learner portrait web test-only composition opt-in required.',
        );
    const database = new URL(getTestDatabaseUrl());
    const redis = new URL(process.env.AUTH_TEST_REDIS_URL ?? 'invalid:');
    const namedTarget =
        (database.port === '55481' &&
            database.pathname === '/languon_auth_portrait_test' &&
            redis.port === '56381') ||
        (database.port === '55444' &&
            database.pathname === '/languon_auth_assistant_web_test' &&
            redis.port === '56444');
    if (
        !namedTarget ||
        redis.protocol !== 'redis:' ||
        !['localhost', '127.0.0.1'].includes(redis.hostname) ||
        redis.pathname !== '/1' ||
        process.env.ALLOW_DISPOSABLE_REDIS_TESTS !== 'true' ||
        process.env.AUTH_TEST_REDIS_CONFIRM !==
            `${redis.hostname}:${redis.port}/1`
    )
        throw new Error(
            'Fixture requires the confirmed portrait55481/56381 or assistant55444/56444 named disposable target pair.',
        );
}

/** Real SDK/tools/memory/accounting; replace only the paid external model boundary. */
function deterministicModel(
    question: string,
    fail: boolean,
): TutorProviderModel {
    let dispatched = 0;
    return {
        specificationVersion: 'v2',
        provider: 'deterministic-local',
        modelId: 'deepseek-flash',
        supportedUrls: {},
        doGenerate: async () => {
            throw new Error('Unexpected generate dispatch in browser fixture.');
        },
        async doStream(options) {
            if (question.includes('two copied cards')) {
                const prompt = JSON.stringify(options.prompt);
                for (const field of [
                    'شاطئ',
                    'بنك',
                    'أرض بجانب النهر',
                    'مؤسسة مالية',
                    'We sat on the river bank.',
                    'The bank is closed today.',
                ])
                    if (!prompt.includes(field))
                        throw new Error(
                            'The real tutor prompt must receive every selected copied card field.',
                        );
            }
            const ordinal = dispatched++;
            const draft = /draft|save|revise/iu.test(question) && ordinal === 0;
            const progressive = /progressively/iu.test(question);
            let text =
                'A river bank is the land beside a river. This explanation uses your saved learning context.';
            if (fail) text = 'Partial explanation before interruption.';
            else if (question.includes('Markdown grammar mapping fixture'))
                text =
                    '# Времена во французском\n\nФранцузская система: **время** и *вид*.\n\n## Настоящее\n\n- Je parle\n- Tu parles\n\n| Temps | Exemple |\n| --- | --- |\n| Présent | Je parle |';
            else if (question.includes('Unsupported Markdown grammar fixture'))
                text = '```text\nJe parle français.\n```';
            return {
                stream: new ReadableStream({
                    async start(controller) {
                        try {
                            controller.enqueue({
                                type: 'stream-start',
                                warnings: [],
                            });
                            if (draft) {
                                controller.enqueue({
                                    type: 'tool-call',
                                    toolCallId: randomUUID(),
                                    toolName: 'propose_knowledge_note',
                                    input: JSON.stringify(proposedContent),
                                });
                                controller.enqueue({
                                    type: 'finish',
                                    finishReason: 'tool-calls',
                                    usage: {
                                        inputTokens: 50,
                                        outputTokens: 30,
                                        totalTokens: 80,
                                    },
                                });
                            } else {
                                controller.enqueue({
                                    type: 'text-start',
                                    id: 'answer',
                                });
                                if (progressive) {
                                    // Delays/chunks live only at the external model boundary:
                                    // Mastra, tools, durable writes, SSE and UI run unchanged.
                                    await delay(900, undefined, {
                                        signal:
                                            options.abortSignal ?? undefined,
                                    });
                                    for (
                                        let offset = 0;
                                        offset < text.length;
                                        offset += 4
                                    ) {
                                        controller.enqueue({
                                            type: 'text-delta',
                                            id: 'answer',
                                            delta: text.slice(
                                                offset,
                                                offset + 4,
                                            ),
                                        });
                                        await delay(
                                            offset === 40 ? 1_100 : 140,
                                            undefined,
                                            {
                                                signal:
                                                    options.abortSignal ??
                                                    undefined,
                                            },
                                        );
                                    }
                                } else {
                                    controller.enqueue({
                                        type: 'text-delta',
                                        id: 'answer',
                                        delta: text.slice(0, 20),
                                    });
                                    await delay(
                                        /slow/iu.test(question) ? 8_000 : 350,
                                        undefined,
                                        {
                                            signal:
                                                options.abortSignal ??
                                                undefined,
                                        },
                                    );
                                    if (fail)
                                        throw new Error(
                                            'Deterministic interrupted provider response.',
                                        );
                                    controller.enqueue({
                                        type: 'text-delta',
                                        id: 'answer',
                                        delta: text.slice(20),
                                    });
                                }
                                controller.enqueue({
                                    type: 'text-end',
                                    id: 'answer',
                                });
                                controller.enqueue({
                                    type: 'finish',
                                    finishReason: 'stop',
                                    usage: {
                                        inputTokens: 50,
                                        outputTokens: 30,
                                        totalTokens: 80,
                                    },
                                });
                            }
                            controller.close();
                        } catch (error) {
                            controller.error(error);
                        }
                    },
                }),
            };
        },
    };
}

/** The interview still uses Mastra, durable accounting and its real worker. */
function deterministicInterviewerModel(
    mode: 'normal' | 'slow' | 'invalid' = 'normal',
): TutorProviderModel {
    const response = JSON.stringify({
        message:
            'I can use short French examples and Russian clarification when useful. Review this proposal before saving it.',
        locale: 'en',
        topic: 'goals',
        options: [
            { id: 'travel', label: 'Travel' },
            { id: 'conversation', label: 'Everyday conversation' },
        ],
        multiSelect: true,
        answerSummary:
            'Prefers French travel examples with Russian clarification.',
        proposedItems: {
            languages: [
                {
                    language: 'French',
                    level: 'basic',
                    learning: true,
                    clarification: 'Je lis mieux que je ne parle.',
                },
                { language: 'Russian', level: 'native', learning: false },
            ],
            explanationLanguages: ['Russian', 'French'],
            mixedLanguage: true,
            goals: ['Travel', 'Everyday conversation'],
            tone: 'friendly',
            detail: 'concise',
            wording: 'simple',
            approach: 'examples-first',
            accommodations: ['Short steps and reminders'],
            hobbies: [],
        },
    });
    const invalid = JSON.parse(response) as Record<string, unknown>;
    invalid.proposedItems = {
        ...(invalid.proposedItems as Record<string, unknown>),
        languages: [{ language: 'French', level: 'A1' }],
    };
    const invalidResponse = JSON.stringify(invalid);
    return {
        specificationVersion: 'v2',
        provider: 'deterministic-portrait-web',
        modelId: 'deepseek-flash',
        supportedUrls: {},
        async doGenerate(options) {
            if (mode === 'slow')
                await delay(3_000, undefined, {
                    signal: options.abortSignal ?? undefined,
                });
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: mode === 'invalid' ? invalidResponse : response,
                    },
                ],
                finishReason: 'stop' as const,
                usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
                warnings: [],
            };
        },
        async doStream() {
            throw new Error('Interview fixture expects generate, not stream.');
        },
    };
}

function admittedPortraitExecution(
    value: Record<string, unknown>,
): TextAiAdmissionExecution & {
    chargingPolicy: CapabilityPolicy;
} {
    const snapshot = value.snapshot;
    const budget = value.budget;
    if (
        !snapshot ||
        typeof snapshot !== 'object' ||
        typeof (snapshot as Record<string, unknown>).modelId !== 'string' ||
        typeof (snapshot as Record<string, unknown>).perCallMaxInputTokens !==
            'number' ||
        typeof (snapshot as Record<string, unknown>).perCallMaxOutputTokens !==
            'number' ||
        !budget ||
        typeof budget !== 'object' ||
        typeof value.chargingPolicy !== 'object'
    )
        throw new Error(
            'Portrait fixture operation lacks the admitted execution snapshot.',
        );
    return value as unknown as TextAiAdmissionExecution & {
        chargingPolicy: CapabilityPolicy;
    };
}

export async function createLearnerPortraitWebFixture(
    origin = 'http://localhost:3337',
) {
    assertFixtureTarget();
    const operatorFunded = process.env.LEARNER_PORTRAIT_TEST_PAID !== 'true';
    const migration = createTestPostgresClient();
    // Never reset an existing schema; append project migrations to the exclusive target.
    try {
        await migrateTestDatabase(migration);
    } finally {
        await migration.end();
    }
    const namespace = uniqueAuthRedisNamespace('learner-portrait-web');
    const secret = 'synthetic-assistant-dictionary-secret-at-least-forty-bytes';
    const authentication = await createAuthenticationComposition(
        loadEnvironment({
            APP_ENV: 'test',
            NODE_ENV: 'test',
            AUTH_ALLOWED_ORIGINS: origin,
            AUTH_WEBAUTHN_RP_ID: 'localhost',
            AUTH_CODE_HMAC_SECRET:
                'synthetic-assistant-code-secret-at-least-forty-bytes',
            AUTH_JWT_SECRET:
                'synthetic-assistant-jwt-secret-at-least-forty-bytes',
            DICTIONARY_HMAC_SECRET: secret,
            AUTH_REDIS_NAMESPACE: namespace,
            DATABASE_URL: getTestDatabaseUrl(),
            REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
        }),
    );
    async function close() {
        await authentication.close();
        const redis = createTestRedisClient();
        try {
            await redis.connect();
            await deleteNamespacedKeys(redis, namespace);
        } finally {
            await redis.quit();
        }
    }
    try {
        const d = authentication.productDependencies;
        const consumeRateLimit = d.rateLimiter.consume.bind(d.rateLimiter);
        // The one guarded browser server shares a loopback client address across
        // its synthetic learners. Keep the real Redis limiter, while giving
        // test-only shared-address buckets enough capacity for five browser
        // journeys plus two admission regressions; per-account and cooldown
        // limits remain unchanged.
        d.rateLimiter.consume = async (request) =>
            consumeRateLimit({
                ...request,
                ...(request.scope === 'verification.email_send.client'
                    ? { limit: Math.max(request.limit, 64) }
                    : request.scope === 'learner-portrait-address'
                      ? { limit: request.limit * 7 }
                      : {}),
            });
        const authenticate = async (token: string) => {
            const claims = await d.accessTokens.verify(token);
            await d.authentication.requireActiveSession(claims);
            return { userId: claims.userId };
        };
        const failedConversations = new Set<string>();
        const conversations = createConversationsComposition({
            ...d,
            policy: authentication.options.policy,
            dictionaryHmacSecret: secret,
            admitTurn: conversationAdmission({
                routingEnabled: true,
                credentialConfigured: () => true,
                pricingAdmissionEnabled: true,
            }),
            readPortrait: readApprovedPortraitForConversation,
            settleInterrupted: settleInterruptedConversationCalls,
            createRunner: (store, turn) => {
                const execution =
                    turn.execution as unknown as TextAiAdmissionExecution;
                const snapshot = execution.snapshot as TextAiExecutionSnapshot;
                const fail =
                    /fail once/iu.test(turn.message.content) &&
                    !failedConversations.has(turn.conversationId);
                if (fail) failedConversations.add(turn.conversationId);
                const runner = createContextualTutorRunner({
                    model: deterministicModel(turn.message.content, fail),
                    maxInputTokens: snapshot.perCallMaxInputTokens,
                    accounting: createConversationAccounting({
                        database: d.database,
                        ownerId: turn.ownerId,
                        turnId: turn.id,
                        leaseToken: turn.leaseToken,
                        execution,
                        withOperation: (work) =>
                            store.withOperation(turn, work),
                    }),
                });
                return {
                    async run(input) {
                        try {
                            return await runner.run(input);
                        } catch (error) {
                            console.error(
                                'Deterministic assistant fixture failure:',
                                error instanceof Error
                                    ? error.message
                                    : 'unknown',
                            );
                            throw error;
                        }
                    },
                };
            },
        });
        await seedInterviewAccountingFixture(d.database);
        const existingPolicies = await d.database
            .select()
            .from(capabilityPolicyRevisionsTable)
            .where(
                eq(
                    capabilityPolicyRevisionsTable.capability,
                    'portrait-interview',
                ),
            );
        await d.database.insert(capabilityPolicyRevisionsTable).values({
            id: randomUUID(),
            capability: 'portrait-interview',
            funding: operatorFunded ? 'operator' : 'customer',
            version: Math.max(0, ...existingPolicies.map((p) => p.version)) + 1,
            createdAt: new Date(),
            reason: 'Deterministic interview browser fixture policy',
        });
        const learnerPortraits = createLearnerPortraitModule({
            database: d.database,
            selectionPolicy: {
                routingEnabled: true,
                credentialConfigured: () => true,
                pricingAdmissionEnabled: true,
            },
        });
        const portraitWorker = new InterviewWorkerService({
            store: learnerPortraits.store,
            createRunner(operation) {
                const execution = admittedPortraitExecution(
                    operation.execution,
                );
                const snapshot = execution.snapshot;
                if (!snapshot)
                    throw new Error(
                        'Portrait fixture operation lacks a model snapshot.',
                    );
                const submission = JSON.stringify(operation.input);
                const mode = submission.includes('[portrait-invalid]')
                    ? 'invalid'
                    : submission.includes('[portrait-slow]')
                      ? 'slow'
                      : 'normal';
                return createLearnerInterviewerRunner({
                    model: deterministicInterviewerModel(mode),
                    accounting: createInterviewAccounting({
                        database: d.database,
                        ownerId: operation.ownerId,
                        operationId: operation.id,
                        leaseToken: operation.leaseToken,
                        execution,
                        withOperation: (work) =>
                            learnerPortraits.store.withOperation(
                                operation,
                                work,
                            ),
                    }),
                    maxInputTokens: readInterviewInputTokenLimit(execution),
                    maxOutputTokens: readInterviewOutputTokenLimit(execution),
                });
            },
        });
        const knowledge = createKnowledgeService({
            database: d.database,
            shareSecret: secret,
            limits: { referenceChars: 40_000, editorChars: 40_000 },
            authenticate,
            rateLimiter: d.rateLimiter,
            lifecycle: {
                beforeNoteDeletion: (tx, input) =>
                    eraseConversationSource(
                        tx,
                        'knowledge',
                        input.noteId,
                        input.now,
                    ),
            },
        });
        const app = createApp({
            authentication: authentication.options,
            navigation: createNavigationRoutes({
                service: createNavigationService({
                    database: d.database,
                    authenticate,
                    rateLimiter: d.rateLimiter,
                }),
                policy: authentication.options.policy,
            }),
            learnerPortraits: createLearnerPortraitRoutes({
                portraits: learnerPortraits.portraits,
                interviews: learnerPortraits.interviews,
                readChargingPolicy: learnerPortraits.readChargingPolicy,
                authenticate,
                rateLimiter: d.rateLimiter,
                policy: authentication.options.policy,
            }),
            dictionaries: createDictionaryComposition({
                ...d,
                dictionaryHmacSecret: secret,
                policy: authentication.options.policy,
            }).routes,
            texts: createTextsContentComposition({
                ...d,
                dictionaryHmacSecret: secret,
                policy: authentication.options.policy,
                loadProposal: loadTextTranslationProposal,
            }).routes,
            conversations: conversations.routes,
            knowledge: createKnowledgeRoutes({
                service: knowledge,
                policy: authentication.options.policy,
            }),
            textAi: createTextAiModule({
                ...d,
                policy: authentication.options.policy,
            }).routes,
            userProfiles: {
                ...d,
                policy: authentication.options.policy,
                profiles: new UserProfileService(
                    new DrizzleUsersUnitOfWork(d.database),
                ),
            },
        });
        const credited = new Set<string>();
        async function credit(token: string, verifiedEmail?: string) {
            const { userId } = await authenticate(token);
            if (credited.has(userId)) return;
            // Only identities returned by real synthetic email verification can
            // select these bounded balances; ordinary fixture accounts keep20k.
            const balance =
                /^portrait-balance-(100|15608)-\d+-\d+@example\.test$/u.exec(
                    verifiedEmail ?? '',
                )?.[1];
            const amount = balance ? BigInt(balance) : 20_000n;
            await d.database.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: userId,
                    amount,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
            credited.add(userId);
        }
        async function request(
            path: string,
            token?: string,
            body?: unknown,
            method = body === undefined ? 'GET' : 'POST',
            shareKey?: string,
        ) {
            return app.request(path, {
                method,
                headers: {
                    Origin: origin,
                    'Content-Type': 'application/json',
                    ...(path === '/dictionaries' && method === 'POST'
                        ? { 'Idempotency-Key': `portrait-web-${randomUUID()}` }
                        : {}),
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(shareKey ? { 'X-Languon-Share-Key': shareKey } : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        }
        async function signup() {
            const registered = await request('/auth/sign-up', undefined, {
                email: `portrait-web-${randomUUID()}@example.test`,
                password: 'Synthetic assistant password 47!',
            });
            if (registered.status !== 202)
                throw new Error(await registered.text());
            const { verification } = SignUpResponseSchema.parse(
                await registered.json(),
            );
            const verified = await request(
                '/auth/email-verification/verify',
                undefined,
                { flowId: verification.flowId, code: '0000' },
            );
            if (verified.status !== 200) throw new Error(await verified.text());
            const { accessToken } = AuthenticationSuccessResponseSchema.parse(
                await verified.json(),
            );
            await credit(accessToken);
            return accessToken;
        }
        const administrator = await authenticate(await signup());
        const model = textAiModelCatalog.find(
            (model) => model.id === 'deepseek-flash',
        )!;
        const revisionId = randomUUID(),
            now = new Date();
        const [latest] = await d.database
            .select({
                version: max(dictionaryAiConfigurationRevisionsTable.version),
            })
            .from(dictionaryAiConfigurationRevisionsTable);
        await d.database
            .insert(dictionaryAiConfigurationRevisionsTable)
            .values({
                id: revisionId,
                version: (latest?.version ?? 0) + 1,
                createdByUserId: administrator.userId,
                createdAt: now,
                catalogSnapshot: {
                    adapterRevision: model.adapterRevision,
                    aggregateBudget: model.aggregateBudget,
                    credentialReference: model.credentialReference,
                    creditPricing: model.creditPricing,
                    enabledModelIds: [model.id],
                    modelId: model.id,
                    perCallMaxInputTokens: model.perCallMaxInputTokens,
                    perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                    providerId: model.providerId,
                    supportedFormats: [...model.supportedFormats],
                },
            });
        await d.database
            .insert(dictionaryAiConfigurationTable)
            .values({
                id: 'global',
                activeRevisionId: revisionId,
                version: 1,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: dictionaryAiConfigurationTable.id,
                set: { activeRevisionId: revisionId, updatedAt: now },
            });
        await d.database
            .insert(dictionaryAiWorkerObservationsTable)
            .values({
                id: conversationExecutionObservationId(
                    'learner-portrait-web',
                    model.providerId,
                    model.id,
                ),
                workerId: 'learner-portrait-web',
                providerId: model.providerId,
                modelId: model.id,
                adapterRevision: model.adapterRevision,
                status: 'available',
                message: 'Deterministic local assistant provider',
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 3_600_000),
                textAiSelectionRevision: 1,
                textAiCapacityRevision: 1,
                textsCapacityRevision: 1,
                conversationCapacityRevision: 1,
                conversationExecutionRevision: 1,
                creditSettlementRevision: 1,
                textAiSupportedFormats: [...model.supportedFormats],
            })
            .onConflictDoUpdate({
                target: dictionaryAiWorkerObservationsTable.id,
                set: {
                    checkedAt: now,
                    expiresAt: new Date(now.getTime() + 3_600_000),
                },
            });
        await d.database
            .insert(dictionaryAiWorkerObservationsTable)
            .values({
                id: portraitInterviewExecutionObservationId(
                    'learner-portrait-web',
                    model.providerId,
                    model.id,
                ),
                workerId: 'learner-portrait-web',
                providerId: model.providerId,
                modelId: model.id,
                adapterRevision: model.adapterRevision,
                status: 'available',
                message: 'Deterministic local learner portrait provider',
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 3_600_000),
                textAiSelectionRevision: 1,
                textAiCapacityRevision: 1,
                textsCapacityRevision: 1,
                conversationCapacityRevision: 1,
                conversationExecutionRevision: 1,
                creditSettlementRevision: 1,
                textAiSupportedFormats: ['portrait-interview:v1'],
            })
            .onConflictDoUpdate({
                target: dictionaryAiWorkerObservationsTable.id,
                set: {
                    checkedAt: now,
                    expiresAt: new Date(now.getTime() + 3_600_000),
                },
            });
        return {
            app,
            request,
            signup,
            credit,
            conversations,
            portraitWorker,
            database: d.database,
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
