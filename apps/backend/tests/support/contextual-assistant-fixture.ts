import { contextualFixtureBlock } from './contextual-fixture-block';
import { createKnowledgeSentenceComposition } from '../../src/modules/knowledge/infrastructure/knowledge-sentence-composition';
import { eraseKnowledgeSentenceJobs } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-sentence-cleanup';
import { createKnowledgeSpeechBrowserFixture } from './knowledge-speech-browser-fixture';
import { createKnowledgePrivateTranslationFixture } from './knowledge-private-translation-fixture';
import { eraseKnowledgeTranslationJobs } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/private-translation-lifecycle';
import { VocabularyPracticeService } from '../../src/modules/knowledge/application/vocabulary-practice-service';
import { DrizzleVocabularyPracticeStore } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/vocabulary-practice-store';
import { createVocabularyPracticeRoutes } from '../../src/modules/knowledge/interface/http/vocabulary-practice-routes';
import { WorkbookService } from '../../src/modules/knowledge/application/workbook-service';
import { DrizzleWorkbookStore } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/workbook-store';
import { createWorkbookRoutes } from '../../src/modules/knowledge/interface/http/workbook.routes';
import { KnowledgeShareCrypto } from '../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { LearnerService } from '../../src/modules/knowledge/application/learner-service';
import { DrizzleLearnerStore } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/learner-store';
import { createLearnerRoutes } from '../../src/modules/knowledge/interface/http/learner-routes';
import { createKnowledgeTranscriptionService } from '../../src/modules/knowledge/infrastructure/transcription-job-composition';
import { createKnowledgeTranscriptionJobRoutes } from '../../src/modules/knowledge/interface/http/transcription-job-routes';
import { KnowledgeMediaService } from '../../src/modules/knowledge/application/media-service';
import { DrizzleKnowledgeMediaStore } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/media-store';
import { verifyKnowledgeAudio } from '../../src/modules/knowledge/infrastructure/media-audio-validation';
import { createKnowledgeMediaRoutes } from '../../src/modules/knowledge/interface/http/media.routes';
import { createKnowledgeLibraryCopyComposition } from '../../src/modules/knowledge/infrastructure/library-copy-composition';
import { fixtureRouteFingerprint } from './text-ai-routing-fixture';
import { createLearnerAiCreditBalanceModule } from '../../src/modules/ai-credits/infrastructure/learner-ai-credit-balance-composition';
import { createLearnerPortraitModule } from '../../src/modules/learner-portraits/infrastructure/learner-portrait-composition';
import { createLearnerPortraitRoutes } from '../../src/modules/learner-portraits/interface/http/learner-portrait.routes';
import { seedLegacyActionFixture } from './legacy-action-fixture';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { max } from 'drizzle-orm';
import {
    AuthenticationSuccessResponseSchema,
    SignUpResponseSchema,
    KnowledgeNoteContentSchema,
} from '@languon/contracts';
import { createApp } from '../../src/app';
import { createNavigationService } from '../../src/modules/navigation/infrastructure/navigation-composition';
import { createNavigationRoutes } from '../../src/modules/navigation/interface/http/navigation.routes';
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
import { eraseConversationSource } from '../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import { createTextAiModule } from '../../src/modules/text-ai/infrastructure/text-ai-composition';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import type { TextAiAdmissionExecution } from '../../src/modules/text-ai/application/text-ai-admission-participant';
import { conversationExecutionObservationId } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
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
        process.env.CONTEXTUAL_ASSISTANT_FIXTURE !== 'true' ||
        process.env.APP_ENV !== 'test'
    )
        throw new Error(
            'Explicit contextual assistant test-only composition opt-in required.',
        );
    const database = new URL(getTestDatabaseUrl());
    const redis = new URL(process.env.AUTH_TEST_REDIS_URL ?? 'invalid:');
    if (
        !['55444', '55488'].includes(database.port) ||
        database.pathname !== '/languon_auth_assistant_web_test' ||
        redis.protocol !== 'redis:' ||
        !['localhost', '127.0.0.1'].includes(redis.hostname) ||
        redis.port !== (database.port === '55488' ? '56488' : '56444') ||
        redis.pathname !== '/1' ||
        process.env.ALLOW_DISPOSABLE_REDIS_TESTS !== 'true' ||
        process.env.AUTH_TEST_REDIS_CONFIRM !==
            `${redis.hostname}:${redis.port}/1`
    )
        throw new Error(
            'Fixture requires its exclusive confirmed disposable PostgreSQL/Redis pair 55444/56444 or critical 55488/56488 with Redis DB1.',
        );
}

function vocabularyProposal(prompt: unknown, updating: boolean) {
    if (updating) {
        const original = contextualFixtureBlock(prompt, 'vocabulary');
        if (!original || original.type !== 'vocabulary')
            throw new Error(
                'Update fixture requires the actual authorized vocabulary tool result.',
            );
        return {
            targetBlockId: original.id,
            blocks: [
                {
                    ...original,
                    title: 'Six French words updated',
                    entries: original.entries.map((entry, index) =>
                        index === 0
                            ? { ...entry, translation: 'работа / труд' }
                            : entry,
                    ),
                },
            ],
        };
    }
    return {
        blocks: [
            {
                id: randomUUID(),
                type: 'vocabulary',
                title: 'Six French words',
                language: 'fr',
                translationLanguage: 'ru',
                entries: [
                    ['travail', 'работа'],
                    ['joie', 'радость'],
                    ['ménage', 'уборка'],
                    ['carrelage', 'плитка'],
                    ['poisson', 'рыба'],
                    ['nourriture', 'корм'],
                ].map(([term, translation]) => ({
                    id: randomUUID(),
                    term,
                    translation,
                })),
            },
        ],
    };
}

function preparedAudioProposal(prompt: unknown) {
    const original = contextualFixtureBlock(
        prompt,
        'audio',
        (block) => block.type === 'audio' && !!block.assetId,
    );
    if (!original || original.type !== 'audio' || !original.assetId)
        throw new Error(
            'Audio fixture requires an authorized prepared recording from the context tool.',
        );
    return {
        blocks: [
            { ...original, id: randomUUID(), title: 'Prepared audio proposal' },
        ],
    };
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
            const updating = question.startsWith(
                'Update French vocabulary block fixture',
            );
            const audioProposal = question.startsWith(
                'Copy prepared audio block fixture',
            );
            const readUpdate = (updating || audioProposal) && ordinal === 0;
            const draft = /draft|save|revise/iu.test(question) && ordinal === 0;
            const blockProposal =
                (question.includes('French vocabulary block fixture') ||
                    audioProposal) &&
                ordinal === (updating || audioProposal ? 1 : 0);
            const progressive = /progressively/iu.test(question);
            let text =
                'A river bank is the land beside a river. This explanation uses your saved learning context.';
            if (question.includes('French vocabulary block fixture'))
                text =
                    'I prepared the six French words. Review the vocabulary block and apply it when ready.';
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
                            if (draft || blockProposal || readUpdate) {
                                controller.enqueue({
                                    type: 'tool-call',
                                    toolCallId: randomUUID(),
                                    toolName: readUpdate
                                        ? 'read_source_context'
                                        : blockProposal
                                          ? 'propose_learning_blocks'
                                          : 'propose_knowledge_note',
                                    input: JSON.stringify(
                                        readUpdate
                                            ? {
                                                  query: audioProposal
                                                      ? 'Prepare recording later'
                                                      : 'travail',
                                                  limit: 5,
                                              }
                                            : blockProposal
                                              ? audioProposal
                                                  ? preparedAudioProposal(
                                                        options.prompt,
                                                    )
                                                  : vocabularyProposal(
                                                        options.prompt,
                                                        updating,
                                                    )
                                              : proposedContent,
                                    ),
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
                                    finishReason: question.includes(
                                        'output limit fixture',
                                    )
                                        ? 'length'
                                        : 'stop',
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

export async function createContextualAssistantFixture(
    origin = 'http://localhost:3336',
) {
    assertFixtureTarget();
    const migration = createTestPostgresClient();
    // Never reset an existing schema; append project migrations to the exclusive target.
    try {
        await migrateTestDatabase(migration);
    } finally {
        await migration.end();
    }
    const namespace = uniqueAuthRedisNamespace('contextual-assistant');
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
    let privateTranslation:
        ReturnType<typeof createKnowledgePrivateTranslationFixture> | undefined;
    let speech:
        ReturnType<typeof createKnowledgeSpeechBrowserFixture> | undefined;
    async function close() {
        await speech?.close();
        await privateTranslation?.close();
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
        await seedLegacyActionFixture(d.database);
        const consumeRateLimit = d.rateLimiter.consume.bind(d.rateLimiter);
        // The one guarded browser server shares a loopback client address across
        // its six synthetic journeys (and the share recipient). Keep the real
        // Redis limiter, while giving only that test-only client bucket enough
        // capacity; account and cooldown limits still apply unchanged.
        d.rateLimiter.consume = async (request) =>
            consumeRateLimit({
                ...request,
                ...(request.scope === 'verification.email_send.client'
                    ? { limit: Math.max(request.limit, 64) }
                    : {}),
            });
        const authenticate = async (token: string) => {
            const claims = await d.accessTokens.verify(token);
            await d.authentication.requireActiveSession(claims);
            return { userId: claims.userId };
        };
        privateTranslation = createKnowledgePrivateTranslationFixture({
            database: d.database,
            rateLimiter: d.rateLimiter,
            secret,
            authenticate,
            policy: authentication.options.policy,
            clock: d.clock,
        });
        speech = createKnowledgeSpeechBrowserFixture({
            database: d.database,
            rateLimiter: d.rateLimiter,
            secret,
            authenticate,
            policy: authentication.options.policy,
            clock: d.clock,
        });
        const failedConversations = new Set<string>();
        const conversations = createConversationsComposition({
            ...d,
            policy: authentication.options.policy,
            dictionaryHmacSecret: secret,
            admitTurn: conversationAdmission({
                routingEnabled: true,
                credentialConfigured: () => true,
                routeFingerprint: fixtureRouteFingerprint,
                pricingAdmissionEnabled: true,
            }),
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
        const knowledge = createKnowledgeService({
            database: d.database,
            shareSecret: secret,
            limits: { referenceChars: 40_000, editorChars: 40_000 },
            authenticate,
            rateLimiter: d.rateLimiter,
            lifecycle: {
                async beforeNoteDeletion(tx, input) {
                    await eraseConversationSource(
                        tx,
                        'knowledge',
                        input.noteId,
                        input.now,
                    );
                    await eraseKnowledgeTranslationJobs(
                        tx,
                        input.noteId,
                        input.now,
                    );
                    await eraseKnowledgeSentenceJobs(
                        tx,
                        input.noteId,
                        input.now,
                    );
                },
            },
        });
        const learnerPortraits = createLearnerPortraitModule({
            database: d.database,
        });
        const app = createApp({
            speech: speech.speechRoutes,
            knowledgePrivateTranslations: privateTranslation.routes,
            knowledgeBlockFields: privateTranslation.fieldRoutes,
            knowledgeExerciseEvaluations: privateTranslation.evaluationRoutes,
            workbooks: createWorkbookRoutes({
                service: new WorkbookService({
                    store: new DrizzleWorkbookStore(
                        d.database,
                        new KnowledgeShareCrypto(secret),
                    ),
                    authenticate,
                    rateLimiter: d.rateLimiter,
                }),
                policy: authentication.options.policy,
            }),
            knowledgeSentences: createKnowledgeSentenceComposition({
                database: d.database,
                secret,
                enabled: true,
                generationFormat: 'sentence-generation:v2',
                authenticate,
                rateLimiter: d.rateLimiter,
                policy: authentication.options.policy,
            }).routes,
            knowledgeVocabulary: createVocabularyPracticeRoutes({
                service: new VocabularyPracticeService({
                    store: new DrizzleVocabularyPracticeStore(
                        d.database,
                        new KnowledgeShareCrypto(secret),
                    ),
                    authenticate,
                    rateLimiter: d.rateLimiter,
                    enabled: true,
                }),
                policy: authentication.options.policy,
            }),
            workbookLearning: createLearnerRoutes({
                service: new LearnerService({
                    store: new DrizzleLearnerStore(
                        d.database,
                        new KnowledgeShareCrypto(secret),
                    ),
                    authenticate,
                    rateLimiter: d.rateLimiter,
                }),
                policy: authentication.options.policy,
            }),
            knowledgeTranscription: createKnowledgeTranscriptionJobRoutes({
                service: createKnowledgeTranscriptionService({
                    database: d.database,
                    authenticate,
                    rateLimiter: d.rateLimiter,
                    executionReady: false,
                }),
                policy: authentication.options.policy,
            }),
            knowledgeMedia: createKnowledgeMediaRoutes({
                service: new KnowledgeMediaService({
                    store: new DrizzleKnowledgeMediaStore(
                        d.database,
                        new KnowledgeShareCrypto(secret),
                    ),
                    authenticate,
                    rateLimiter: d.rateLimiter,
                    verify: verifyKnowledgeAudio,
                    readSpeech: speech.readSpeech,
                }),
                policy: authentication.options.policy,
            }),
            knowledgeLibrary: createKnowledgeLibraryCopyComposition({
                ...d,
                dictionaryHmacSecret: secret,
                shareSecret: secret,
                authenticate,
                policy: authentication.options.policy,
            }).routes,

            learnerPortraits: createLearnerPortraitRoutes({
                portraits: learnerPortraits.portraits,
                interviews: learnerPortraits.interviews,
                readChargingPolicy: learnerPortraits.readChargingPolicy,
                authenticate,
                rateLimiter: d.rateLimiter,
                policy: authentication.options.policy,
            }),
            navigation: createNavigationRoutes({
                service: createNavigationService({
                    database: d.database,
                    authenticate,
                    rateLimiter: d.rateLimiter,
                }),
                policy: authentication.options.policy,
            }),
            authentication: authentication.options,
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
            learnerAiCredits: createLearnerAiCreditBalanceModule({
                ...d,
                policy: authentication.options.policy,
            }).routes,
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
        async function credit(token: string) {
            const { userId } = await authenticate(token);
            if (credited.has(userId)) return;
            await d.database.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: userId,
                    amount: 1_000_000_000n,
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
                        ? { 'Idempotency-Key': `assistant-${randomUUID()}` }
                        : {}),
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(shareKey ? { 'X-Languon-Share-Key': shareKey } : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        }
        async function signup() {
            const registered = await request('/auth/sign-up', undefined, {
                email: `assistant-${randomUUID()}@example.test`,
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
        await speech.start(administrator.userId);
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
                    'assistant-journey',
                    model.providerId,
                    model.id,
                ),
                workerId: 'assistant-journey',
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
        await privateTranslation.start();
        return {
            app,
            request,
            signup,
            credit,
            conversations,
            database: d.database,
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
