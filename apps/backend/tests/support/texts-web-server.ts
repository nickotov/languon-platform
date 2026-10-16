import { randomUUID } from 'node:crypto';
import {
    AuthenticationSuccessResponseSchema,
    SignUpResponseSchema,
} from '@languon/contracts';
import { max } from 'drizzle-orm';
import { serve } from '@hono/node-server';
import { setTimeout as delay } from 'node:timers/promises';
import { DrizzleAiCreditTransactionParticipant } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { createDictionaryComposition } from '../../src/modules/dictionaries/infrastructure/dictionary-composition';
import { UserProfileService } from '../../src/modules/users/application/user-profile-service';
import { DrizzleUsersUnitOfWork } from '../../src/modules/users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work';
import { createApp } from '../../src/app';
import { loadEnvironment } from '../../src/config/environment';
import {
    createAuthenticationComposition,
    type AuthenticationComposition,
} from '../../src/modules/authentication/infrastructure/authentication-composition';
import { createTextsContentComposition } from '../../src/modules/texts/infrastructure/texts-composition';
import {
    createTextsAiComposition,
    createTextsWorkerComposition,
} from '../../src/modules/texts/infrastructure/texts-ai-composition';
import {
    loadTextTranslationProposal,
    resolveTextTranslationProposal,
} from '../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-support';
import { createTextsJobRoutes } from '../../src/modules/texts/interface/http/texts-job.routes';
import { createTextSelectionModule } from '../../src/modules/dictionaries/infrastructure/text-selection-composition';
import { createTextSelectionRoutes } from '../../src/modules/dictionaries/interface/http/text-selection.routes';
import { BoundedDictionaryRateLimiter } from '../../src/modules/dictionaries/infrastructure/rate-limit/bounded-dictionary-rate-limiter';
import { DrizzleTextAiAdmissionParticipant } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    defaultTextAiProviderBudgetPolicy,
    textAiModelCatalog,
} from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textsExecutionObservationId } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    getTestDatabaseUrl,
    createTestPostgresClient,
    migrateTestDatabase,
} from '../integration/support/test-database';
import {
    uniqueAuthRedisNamespace,
    createTestRedisClient,
    deleteNamespacedKeys,
} from '../integration/support/test-redis';

if (process.env.TEXTS_WEB_FIXTURE !== 'true' || process.env.APP_ENV !== 'test')
    throw new Error('Explicit test-only Texts web fixture opt-in required');
const target = new URL(getTestDatabaseUrl());
if (
    target.pathname !== '/languon_auth_texts_ui_web_test' ||
    target.port !== '55443'
)
    throw new Error(
        'Texts web fixture requires exclusive disposable UI web database',
    );
const redisTarget = new URL(process.env.AUTH_TEST_REDIS_URL!);
if (
    !['127.0.0.1', 'localhost'].includes(redisTarget.hostname) ||
    redisTarget.port !== '56443' ||
    redisTarget.pathname !== '/1' ||
    process.env.ALLOW_DISPOSABLE_REDIS_TESTS !== 'true' ||
    process.env.AUTH_TEST_REDIS_CONFIRM !==
        `${redisTarget.hostname}:${redisTarget.port}/1`
)
    throw new Error(
        'Texts web fixture requires confirmed exclusive local Redis DB1',
    );
const origin = process.env.TEXTS_WEB_ORIGIN ?? 'http://localhost:3335';
const secret = 'synthetic-texts-web-dictionary-secret-at-least-40-bytes';
const namespace = uniqueAuthRedisNamespace('texts-web');
const controller = new AbortController();
const signal = controller.signal;
const selectionPolicy = {
    routingEnabled: true,
    credentialConfigured: () => true,
    pricingAdmissionEnabled: true,
};
let authentication!: AuthenticationComposition;
let app: ReturnType<typeof createApp>;
let content: ReturnType<typeof createTextsContentComposition>;
let ai: ReturnType<typeof createTextsAiComposition>;
let worker!: ReturnType<typeof createTextsWorkerComposition>['worker'];
let selection!: ReturnType<typeof createTextSelectionModule>;
async function start() {
    // Migrate only this explicitly dedicated journey target.
    const database = createTestPostgresClient();
    // Dedicated confirmed web fixture database: migrations only, never reset.
    await migrateTestDatabase(database);
    await database.end();
    authentication = await createAuthenticationComposition(
        loadEnvironment({
            APP_ENV: 'test',
            NODE_ENV: 'test',
            AUTH_ALLOWED_ORIGINS: origin,
            AUTH_WEBAUTHN_RP_ID: 'localhost',
            AUTH_CODE_HMAC_SECRET:
                'synthetic-texts-code-secret-at-least-forty-bytes',
            AUTH_JWT_SECRET: 'synthetic-texts-jwt-secret-at-least-forty-bytes',
            DICTIONARY_HMAC_SECRET: secret,
            AUTH_REDIS_NAMESPACE: namespace,
            DATABASE_URL: getTestDatabaseUrl(),
            REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
        }),
    );
    const d = authentication.productDependencies;
    const authenticate = async (token: string) => {
        const claims = await d.accessTokens.verify(token);
        await d.authentication.requireActiveSession(claims);
        return { userId: claims.userId, sessionId: claims.sessionId };
    };
    content = createTextsContentComposition({
        ...d,
        dictionaryHmacSecret: secret,
        policy: authentication.options.policy,
        loadProposal: loadTextTranslationProposal,
    });
    ai = createTextsAiComposition({
        database: d.database,
        enabled: true,
        fingerprintSecret: secret,
        authenticate,
        clock: d.clock,
        budget: defaultTextAiProviderBudgetPolicy,
        admissionParticipant: (tx) =>
            new DrizzleTextAiAdmissionParticipant(tx, selectionPolicy),
    });
    const execution = createTextsWorkerComposition({
        database: d.database,
        clock: d.clock,
        workerId: 'texts-journey',
        leaseMs: 30000,
        heartbeatMs: 10000,
        timeoutMs: 20000,
        globalConcurrency: 10,
        userConcurrency: 2,
        maxAttempts: 2,
        retryDelayMs: 1,
        supportedFormats: [
            'text-detection:v1',
            'text-translation:v1',
            'text-translation:v2',
        ],
        provider: {
            async run({ input, execution }) {
                if (
                    input.kind === 'text-translation' &&
                    (execution.modelId !== 'deepseek-flash' ||
                        execution.supportedFormats.length !== 1 ||
                        execution.supportedFormats[0] !==
                            'text-translation:v2' ||
                        execution.perCallMaxInputTokens !== 128000 ||
                        execution.perCallMaxOutputTokens !== 32768)
                )
                    throw new Error(
                        'Texts translation must use the admitted Flash v2 execution profile',
                    );
                return {
                    draft:
                        input.kind === 'text-detection'
                            ? { language: 'en', confidence: 'high' }
                            : {
                                  translation: input.segments.map((p) => ({
                                      pairId: p.pairId,
                                      text:
                                          (input.targetLanguage === 'ru'
                                              ? 'Река спокойно течёт по долине.'
                                              : ((
                                                    {
                                                        'The river flows quietly.':
                                                            'El río fluye tranquilamente.',
                                                        'We rested on the bank.':
                                                            'Descansamos en la orilla.',
                                                        'Birds sang nearby.':
                                                            'Los pájaros cantaban cerca.',
                                                    } as Record<string, string>
                                                )[p.text.trim()] ??
                                                'Hola mundo.')) +
                                          (p.text.match(/\s*$/u)?.[0] ?? ''),
                                  })),
                              },
                    usage: { inputTokens: 20, outputTokens: 10 },
                };
            },
        },
    });
    worker = execution.worker;
    selection = createTextSelectionModule({
        database: d.database,
        authentication: { authenticate },
        admissionsEnabled: true,
        selectionPolicy,
        globalConcurrency: 10,
        ownerConcurrency: 2,
        leaseMs: 30000,
        verifyShare: (key, digest) =>
            content.cryptography.verifyShare(key, digest),
        proposal: resolveTextTranslationProposal,
        generator: {
            async generate({ input }) {
                const bank = input.source === 'bank';
                if (
                    bank &&
                    (!input.occurrenceContext?.sentence.includes(
                        'We rested on the bank.',
                    ) ||
                        !input.occurrenceContext.previousSentence?.includes(
                            'The river flows slowly.',
                        ))
                )
                    throw new Error(
                        'Bank selection must carry its containing sentence and edited river neighbor',
                    );
                return {
                    delta: {
                        suggestions: [
                            {
                                field: 'translation',
                                value: bank ? 'orilla' : 'hola',
                            },
                            {
                                field: 'definition',
                                value: bank
                                    ? 'The land alongside a river.'
                                    : 'A greeting',
                            },
                            {
                                field: 'example',
                                value: bank
                                    ? 'We sat on the river bank.'
                                    : 'Hello, friend.',
                            },
                            {
                                field: 'exampleTranslation',
                                value: bank
                                    ? 'Nos sentamos en la orilla del río.'
                                    : 'Hola, amigo.',
                            },
                        ],
                    },
                    usage: { inputTokens: 15, outputTokens: 8 },
                };
            },
        },
    });
    app = createApp({
        authentication: authentication.options,
        texts: content.routes,
        dictionaries: createDictionaryComposition({
            ...d,
            dictionaryHmacSecret: secret,
            policy: authentication.options.policy,
        }).routes,
        userProfiles: {
            accessTokens: d.accessTokens,
            authentication: d.authentication,
            policy: authentication.options.policy,
            profiles: new UserProfileService(
                new DrizzleUsersUnitOfWork(d.database),
            ),
        },
        textsAi: createTextsJobRoutes({
            service: ai.service,
            policy: authentication.options.policy,
        }),
        textSelections: createTextSelectionRoutes({
            service: selection.service,
            policy: authentication.options.policy,
            rateLimiter: {
                consume: async (input) => {
                    return new BoundedDictionaryRateLimiter(
                        d.rateLimiter,
                    ).consume(input);
                },
            },
        }),
    });
    const administrator = await signup();
    const creator = await d.accessTokens.verify(administrator);
    const model = textAiModelCatalog.find(
        (model) => model.id === 'deepseek-flash',
    )!;
    const revisionId = randomUUID();
    const now = new Date();
    const [latestRevision] = await d.database
        .select({
            latest: max(dictionaryAiConfigurationRevisionsTable.version),
        })
        .from(dictionaryAiConfigurationRevisionsTable);
    const nextRevision = (latestRevision?.latest ?? 0) + 1;
    await d.database.insert(dictionaryAiConfigurationRevisionsTable).values({
        id: revisionId,
        version: nextRevision,
        createdByUserId: creator.userId,
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
            id: textsExecutionObservationId(
                'texts-journey',
                model.providerId,
                model.id,
            ),
            workerId: 'texts-journey',
            providerId: model.providerId,
            modelId: model.id,
            adapterRevision: model.adapterRevision,
            status: 'available',
            message: 'Deterministic Texts journey provider',
            checkedAt: now,
            expiresAt: new Date(now.getTime() + 3600000),
            textAiSelectionRevision: 1,
            textAiCapacityRevision: 1,
            textsCapacityRevision: 1,
            textsExecutionRevision: 1,
            creditSettlementRevision: 1,
            textAiSupportedFormats: [...model.supportedFormats],
        })
        .onConflictDoNothing();
}
async function request(
    path: string,
    token?: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    key?: string,
) {
    return app.request(path, {
        method,
        headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(key ? { 'x-languon-share-key': key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
async function signup() {
    const response = await request('/auth/sign-up', undefined, {
        email: `texts-${randomUUID()}@example.test`,
        password: 'Synthetic safe journey password 47!',
    });
    if (response.status !== 202) throw new Error(await response.text());
    const { verification } = SignUpResponseSchema.parse(await response.json());
    const verified = await request(
        '/auth/email-verification/verify',
        undefined,
        { flowId: verification.flowId, code: '0000' },
    );
    if (verified.status !== 200) throw new Error(await verified.text());
    const token = AuthenticationSuccessResponseSchema.parse(
        await verified.json(),
    ).accessToken;
    const claims =
        await authentication.productDependencies.accessTokens.verify(token);
    await authentication.productDependencies.database.transaction((tx) =>
        new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
            ownerId: claims.userId,
            amount: 1000000000n,
            createdAt: new Date(),
            expiresAt: null,
            source: 'admin',
            sourceReference: randomUUID(),
        }),
    );
    return token;
}

await start();
const credited = new Set<string>();
const server = serve({
    port: 4005,
    hostname: '127.0.0.1',
    fetch: async (request) => {
        const response = await app.fetch(request);
        if (
            new URL(request.url).pathname ===
                '/auth/email-verification/verify' &&
            response.status === 200
        ) {
            const payload = AuthenticationSuccessResponseSchema.parse(
                await response.clone().json(),
            );
            const claims =
                await authentication.productDependencies.accessTokens.verify(
                    payload.accessToken,
                );
            if (!credited.has(claims.userId)) {
                await authentication.productDependencies.database.transaction(
                    (tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).issueGrant({
                            ownerId: claims.userId,
                            amount: 1000000000n,
                            createdAt: new Date(),
                            expiresAt: null,
                            source: 'admin',
                            sourceReference: randomUUID(),
                        }),
                );
                credited.add(claims.userId);
            }
        }
        return response;
    },
});
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
console.log('Texts web fixture ready at http://127.0.0.1:4005');
try {
    while (!signal.aborted) {
        await worker.processNext(signal);
        await selection.worker.processNext(signal);
        await delay(50);
    }
} finally {
    server.close();
    await authentication.close();
    const redis = createTestRedisClient();
    await redis.connect();
    await deleteNamespacedKeys(redis, namespace);
    await redis.quit();
}
