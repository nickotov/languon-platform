import { randomUUID } from 'node:crypto';

// @user-flow-revision user-ai-model-preferences-backend sha256:73f31c71e6640ceb
import {
    AuthenticationSuccessResponseSchema,
    DictionaryCardResponseSchema,
    DictionaryResponseSchema,
    SignUpResponseSchema,
    TextAiErrorResponseSchema,
    TextAiModelsResponseSchema,
    TextAiPreferenceResponseSchema,
} from '@languon/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../../src/app';
import { loadEnvironment } from '../../../../src/config/environment';
import {
    createAuthenticationComposition,
    type AuthenticationComposition,
} from '../../../../src/modules/authentication/infrastructure/authentication-composition';
import { createTextAiModule } from '../../../../src/modules/text-ai/infrastructure/text-ai-composition';
import { createDictionaryComposition } from '../../../../src/modules/dictionaries/infrastructure/dictionary-composition';
import { dictionaryGenerationFormat } from '../../../../src/modules/dictionaries/domain/generation';
import { DrizzleDictionaryGenerationStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { dictionaryGenerationJobsTable } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    redisIntegrationEnabled,
    uniqueAuthRedisNamespace,
} from '../../support/test-redis';

import { seedDictionaryAccountingFixture } from '../../../support/dictionary-accounting-fixture';
import { seedTextAiRoutingFixture } from '../../../support/text-ai-routing-fixture';
import { publishTextAiWorkerObservations } from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-worker-observations';

const run = describe.runIf(
    isDatabaseIntegrationEnabled() && redisIntegrationEnabled,
);
const origin = 'http://localhost:3333';
const namespace = uniqueAuthRedisNamespace('text-ai-preferences-journey');
const journeyTimeoutMs = 30_000;
const dictionaryHmacSecret =
    'text-ai-preference-dictionary-secret-forty-bytes-cccc';

run('real composed text-AI preference HTTP journey', () => {
    let app: ReturnType<typeof createApp>;
    let authentication: AuthenticationComposition;
    const priorEnvironment = {
        deepseek: process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED,
        deepseekKey: process.env.DEEPSEEK_API_KEY,
        kie: process.env.DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED,
        routing: process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED,
    };

    beforeAll(async () => {
        // The catalog's readiness source is process configuration. These synthetic
        // booleans only make the deterministic, database-backed catalog eligible;
        // no provider client or external call is created by this journey.
        process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED = 'true';
        process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED = 'true';
        process.env.DEEPSEEK_API_KEY = 'synthetic-test-key';
        process.env.DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED = 'true';

        const redis = createTestRedisClient();
        await redis.connect();
        await redis.quit();
        const database = createTestPostgresClient();
        await resetTestDatabase(database);
        await migrateTestDatabase(database);
        await database.end();

        authentication = await createAuthenticationComposition(
            loadEnvironment({
                APP_ENV: 'test',
                NODE_ENV: 'test',
                AUTH_ALLOWED_ORIGINS: origin,
                AUTH_CODE_HMAC_SECRET:
                    'text-ai-preference-code-secret-forty-bytes-aaaaaa',
                AUTH_JWT_SECRET:
                    'text-ai-preference-jwt-secret-forty-bytes-bbbbbbb',
                DICTIONARY_HMAC_SECRET: dictionaryHmacSecret,
                AUTH_WEBAUTHN_RP_ID: 'localhost',
                AUTH_REDIS_NAMESPACE: namespace,
                DATABASE_URL: getTestDatabaseUrl(),
                REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
            }),
        );
        app = createApp({
            authentication: authentication.options,
            dictionaries: createDictionaryComposition({
                ...authentication.productDependencies,
                dictionaryHmacSecret,
                generation: {
                    acceptableFormats: [dictionaryGenerationFormat],
                    cancellableFormats: [dictionaryGenerationFormat],
                    discardableFormats: [dictionaryGenerationFormat],
                    enqueuedFormats: [dictionaryGenerationFormat],
                    readableFormats: [dictionaryGenerationFormat],
                },
                policy: authentication.options.policy,
            }).routes,
            textAi: createTextAiModule({
                ...authentication.productDependencies,
                policy: authentication.options.policy,
            }).routes,
        });
    });

    afterAll(async () => {
        await authentication?.close();
        const redis = createTestRedisClient();
        await redis.connect();
        await deleteNamespacedKeys(redis, namespace);
        await redis.quit();
        restoreEnvironment(
            'DICTIONARY_AI_MANAGED_ROUTING_ENABLED',
            priorEnvironment.routing,
        );
        restoreEnvironment(
            'DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED',
            priorEnvironment.deepseek,
        );
        restoreEnvironment('DEEPSEEK_API_KEY', priorEnvironment.deepseekKey);
        restoreEnvironment(
            'DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED',
            priorEnvironment.kie,
        );
    });

    async function request(
        path: string,
        options: {
            body?: unknown;
            idempotencyKey?: string;
            method?: string;
            token?: string;
        } = {},
    ) {
        return app.request(path, {
            method: options.method ?? 'GET',
            ...(options.body === undefined
                ? {}
                : { body: JSON.stringify(options.body) }),
            headers: {
                'Content-Type': 'application/json',
                Origin: origin,
                ...(options.token
                    ? { Authorization: `Bearer ${options.token}` }
                    : {}),
                ...(options.idempotencyKey
                    ? { 'Idempotency-Key': options.idempotencyKey }
                    : {}),
            },
        });
    }

    async function signup(label: string) {
        const email = `${label}-${randomUUID()}@example.test`;
        const signup = await request('/auth/sign-up', {
            method: 'POST',
            body: { email, password: 'A safe text preference password 47!' },
        });
        expect(signup.status).toBe(202);
        const flowId = SignUpResponseSchema.parse(await signup.json())
            .verification.flowId;
        const verification = await request('/auth/email-verification/verify', {
            method: 'POST',
            body: { code: '0000', flowId },
        });
        expect(verification.status).toBe(200);
        const token = AuthenticationSuccessResponseSchema.parse(
            await verification.json(),
        ).accessToken;
        const claims =
            await authentication.productDependencies.accessTokens.verify(token);
        return { token, userId: claims.userId };
    }

    async function dictionary(token: string) {
        const created = await request('/dictionaries', {
            method: 'POST',
            token,
            idempotencyKey: randomUUID(),
            body: {
                name: `Preference journey ${randomUUID()}`,
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        expect(created.status).toBe(201);
        const current = DictionaryResponseSchema.parse(
            await created.json(),
        ).dictionary;
        const card = await request(`/dictionaries/${current.id}/cards`, {
            method: 'POST',
            token,
            body: {
                expectedDictionaryVersion: current.version,
                expectedSettingsVersion: current.settings.version,
                values: { source: 'book', translation: 'livre' },
            },
        });
        expect(card.status).toBe(201);
        const result = DictionaryCardResponseSchema.parse(await card.json());
        return {
            cardId: result.card.id,
            cardVersion: result.card.version,
            dictionaryId: current.id,
            dictionaryVersion: result.dictionaryVersion,
            settingsVersion: current.settings.version,
        };
    }

    async function enqueue(
        token: string,
        current: Awaited<ReturnType<typeof dictionary>>,
        idempotencyKey: string,
    ) {
        return request(
            `/dictionaries/${current.dictionaryId}/cards/${current.cardId}/generations`,
            {
                method: 'POST',
                token,
                idempotencyKey,
                body: {
                    expectedCardVersion: current.cardVersion,
                    expectedDictionaryVersion: current.dictionaryVersion,
                    expectedSettingsVersion: current.settingsVersion,
                    instruction: null,
                },
            },
        ).then((response) => response);
    }

    // @user-flow user-ai-model-preferences-backend/learner-preference-pins-dictionary-execution
    it(
        'hides model identities, persists exact budgets, rejects selection and pins server-owned execution through real auth and PostgreSQL',
        async () => {
            const learner = await signup('text-ai-learner');
            const db = authentication.productDependencies.database;
            await seedDictionaryAccountingFixture(db);
            const routing = await seedTextAiRoutingFixture(db);
            await publishTextAiWorkerObservations({
                database: db,
                workerId: 'text-ai-journey-worker',
                now: new Date(),
                ttlMs: 60000,
                readinessTimeoutMs: 1000,
                supportedFormats: [dictionaryGenerationFormat],
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
                fetchProvider: async () => new Response('{}', { status: 200 }),
            });
            const models = await request('/text-ai/models', {
                token: learner.token,
            });
            expect(models.status).toBe(200);
            const catalog = TextAiModelsResponseSchema.parse(
                await models.json(),
            );
            expect(catalog).toEqual({ defaultModelId: null, models: [] });
            expect(JSON.stringify(catalog)).not.toMatch(
                /credential|endpoint|api[_-]?key/i,
            );

            const initial = await request('/users/me/ai-model-preference', {
                token: learner.token,
            });
            expect(initial.status).toBe(200);
            expect(
                TextAiPreferenceResponseSchema.parse(await initial.json()),
            ).toMatchObject({
                mode: 'auto',
                modelId: null,
                selectedModel: null,
                version: 1,
            });

            const saved = await request('/users/me/ai-model-preference', {
                method: 'PUT',
                token: learner.token,
                body: {
                    expectedVersion: 1,
                    mode: 'auto',
                    maxCreditsPerAction: '20.125',
                },
            });
            expect(saved.status).toBe(200);
            expect(
                TextAiPreferenceResponseSchema.parse(await saved.json()),
            ).toMatchObject({
                mode: 'auto',
                modelId: null,
                selectedModel: null,
                version: 2,
                maxCreditsPerAction: '20.125',
            });
            const reloaded = await request('/users/me/ai-model-preference', {
                token: learner.token,
            });
            expect(
                TextAiPreferenceResponseSchema.parse(await reloaded.json()),
            ).toMatchObject({
                mode: 'auto',
                modelId: null,
                version: 2,
                maxCreditsPerAction: '20.125',
            });

            const stale = await request('/users/me/ai-model-preference', {
                method: 'PUT',
                token: learner.token,
                body: { expectedVersion: 0, mode: 'auto' },
            });
            expect(stale.status).toBe(409);
            expect(
                TextAiErrorResponseSchema.parse(await stale.json()),
            ).toMatchObject({
                error: { code: 'conflict' },
            });

            const denied = await request('/users/me/ai-model-preference', {
                method: 'PUT',
                token: learner.token,
                body: {
                    expectedVersion: 2,
                    mode: 'explicit',
                    modelId: 'gemini-2.5-pro',
                },
            });
            expect(denied.status).toBe(409);
            expect(
                TextAiErrorResponseSchema.parse(await denied.json()),
            ).toMatchObject({ error: { code: 'model_unavailable' } });
            const retained = await request('/users/me/ai-model-preference', {
                token: learner.token,
            });
            expect(
                TextAiPreferenceResponseSchema.parse(await retained.json()),
            ).toMatchObject({
                mode: 'auto',
                modelId: null,
                selectedModel: null,
                version: 2,
                maxCreditsPerAction: '20.125',
            });
            const generatedFor = await dictionary(learner.token);
            const replayKey = randomUUID();
            const selected = await enqueue(
                learner.token,
                generatedFor,
                replayKey,
            );
            expect(selected.status).toBe(202);
            const selectedBody = (await selected.json()) as {
                job: { id: string };
            };
            const replay = await enqueue(
                learner.token,
                generatedFor,
                replayKey,
            );
            expect(replay.status).toBe(202);
            expect((await replay.json()) as { job: { id: string } }).toEqual(
                selectedBody,
            );
            const [kieJob] = await authentication.productDependencies.database
                .select({
                    id: dictionaryGenerationJobsTable.id,
                    selectedExecutionSnapshot:
                        dictionaryGenerationJobsTable.selectedExecutionSnapshot,
                    selectedExecutionVersion:
                        dictionaryGenerationJobsTable.selectedExecutionVersion,
                })
                .from(dictionaryGenerationJobsTable)
                .where(
                    eq(dictionaryGenerationJobsTable.id, selectedBody.job.id),
                );
            expect(kieJob).toMatchObject({
                id: selectedBody.job.id,
                selectedExecutionSnapshot: { modelId: 'deepseek-flash' },
                selectedExecutionVersion: 1,
            });
            expect(kieJob?.id).toBe(selectedBody.job.id);

            const auto = await request('/users/me/ai-model-preference', {
                method: 'PUT',
                token: learner.token,
                body: {
                    expectedVersion: 2,
                    mode: 'auto',
                    maxCreditsPerAction: '30.125',
                },
            });
            expect(auto.status).toBe(200);
            expect(
                TextAiPreferenceResponseSchema.parse(await auto.json()),
            ).toMatchObject({
                mode: 'auto',
                version: 3,
                maxCreditsPerAction: '30.125',
            });

            const generationStore = new DrizzleDictionaryGenerationStore(
                authentication.productDependencies.database,
                { generate: randomUUID },
            );
            const incompatibleClaim = await generationStore.claim({
                context: {
                    now: new Date(),
                    signal: new AbortController().signal,
                },
                creditSettlementRevision: 1,
                globalConcurrency: 4,
                leaseDurationMs: 60_000,
                managedRoutingRevision: 1,
                ownerConcurrency: 4,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'old-worker-without-selection-capability',
            });
            expect(incompatibleClaim).toBeNull();
            const claim = await generationStore.claim({
                context: {
                    now: new Date(),
                    signal: new AbortController().signal,
                },
                creditSettlementRevision: 1,
                globalConcurrency: 4,
                leaseDurationMs: 60_000,
                managedRoutingRevision: 1,
                ownerConcurrency: 4,
                supportedFormats: [dictionaryGenerationFormat],
                textAiSelectionRevision: 1,
                workerId: 'selection-capable-journey-worker',
            });
            expect(claim).toMatchObject({
                id: selectedBody.job.id,
                providerExecution: { modelId: 'deepseek-flash' },
            });
            const defaulted = await enqueue(
                learner.token,
                generatedFor,
                randomUUID(),
            );
            expect(defaulted.status).toBe(202);
            const defaultedBody = (await defaulted.json()) as {
                job: { id: string };
            };
            const [deepSeekJob] =
                await authentication.productDependencies.database
                    .select({
                        executionRevisionId:
                            dictionaryGenerationJobsTable.executionRevisionId,
                        selectedExecutionSnapshot:
                            dictionaryGenerationJobsTable.selectedExecutionSnapshot,
                    })
                    .from(dictionaryGenerationJobsTable)
                    .where(
                        eq(
                            dictionaryGenerationJobsTable.id,
                            defaultedBody.job.id,
                        ),
                    );
            expect(deepSeekJob).toMatchObject({
                executionRevisionId: routing.id,
                selectedExecutionSnapshot: { modelId: 'deepseek-flash' },
            });

            const replayAfterBudget = await enqueue(
                learner.token,
                generatedFor,
                replayKey,
            );
            expect(replayAfterBudget.status).toBe(202);
            expect(await replayAfterBudget.json()).toEqual(selectedBody);
            const jobCount = await db
                .select({ id: dictionaryGenerationJobsTable.id })
                .from(dictionaryGenerationJobsTable);
            expect(jobCount).toHaveLength(2);
            await authentication.productDependencies.database
                .update(usersTable)
                .set({ status: 'disabled' })
                .where(eq(usersTable.id, learner.userId));
            const inactive = await request('/users/me/ai-model-preference', {
                method: 'PUT',
                token: learner.token,
                body: { expectedVersion: 3, mode: 'auto' },
            });
            expect(inactive.status).toBe(401);
            expect(
                TextAiErrorResponseSchema.parse(await inactive.json()),
            ).toMatchObject({ error: { code: 'authentication_required' } });
        },
        journeyTimeoutMs,
    );
});

function restoreEnvironment(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
