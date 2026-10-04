import { randomUUID } from 'node:crypto';

// @user-flow-revision sentence-practice-backend sha256:e8f1292e67d5caea

import {
    AuthenticationSuccessResponseSchema,
    DictionaryResponseSchema,
    SentenceJobSchema,
    SentenceNextResponseSchema,
    SignUpResponseSchema,
} from '@languon/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../../src/app';
import { loadEnvironment } from '../../../../src/config/environment';
import {
    createAuthenticationComposition,
    type AuthenticationComposition,
} from '../../../../src/modules/authentication/infrastructure/authentication-composition';
import { createDictionaryComposition } from '../../../../src/modules/dictionaries/infrastructure/dictionary-composition';
import {
    createSentenceComposition,
    createSentenceWorkerComposition,
} from '../../../../src/modules/learning/infrastructure/sentence-composition';
import { DeterministicSentenceAiProvider } from '../../../../src/modules/learning/infrastructure/ai/sentence-ai-provider';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { sentenceExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    aiCreditAccountsTable,
    aiCreditGrantsTable,
    aiCreditHistoryTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
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

const run = describe.runIf(
    isDatabaseIntegrationEnabled() && redisIntegrationEnabled,
);
const origin = 'http://localhost:3333';
const namespace = uniqueAuthRedisNamespace('sentence-practice-journey');
const secret = 'sentence-practice-journey-dictionary-secret-forty-bytes';

run('real composed sentence practice HTTP and worker journey', () => {
    let app: ReturnType<typeof createApp>;
    let authentication: AuthenticationComposition;
    let providerCalls = 0;

    beforeAll(async () => {
        process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED = 'true';
        process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED = 'true';
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
                    'sentence-practice-journey-code-secret-forty-bytes',
                AUTH_JWT_SECRET:
                    'sentence-practice-journey-jwt-secret-forty-bytes',
                DICTIONARY_HMAC_SECRET: secret,
                AUTH_WEBAUTHN_RP_ID: 'localhost',
                AUTH_REDIS_NAMESPACE: namespace,
                DATABASE_URL: getTestDatabaseUrl(),
                REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
            }),
        );
        const dependencies = {
            ...authentication.productDependencies,
            dictionaryHmacSecret: secret,
            policy: authentication.options.policy,
        };
        app = createApp({
            authentication: authentication.options,
            dictionaries: createDictionaryComposition(dependencies).routes,
            sentenceLearning: createSentenceComposition({
                ...dependencies,
                enabled: true,
            }).routes,
        });
    });
    afterAll(async () => {
        await authentication?.close();
        const redis = createTestRedisClient();
        await redis.connect();
        await deleteNamespacedKeys(redis, namespace);
        await redis.quit();
    });

    const request = (
        path: string,
        options: {
            method?: string;
            body?: unknown;
            token?: string;
            shareKey?: string;
            idempotency?: boolean;
        } = {},
    ) =>
        app.request(path, {
            method: options.method ?? 'GET',
            ...(options.body === undefined
                ? {}
                : { body: JSON.stringify(options.body) }),
            headers: {
                Origin: origin,
                'Content-Type': 'application/json',
                ...(options.token
                    ? { Authorization: `Bearer ${options.token}` }
                    : {}),
                ...(options.shareKey
                    ? { 'X-Languon-Share-Key': options.shareKey }
                    : {}),
                ...(options.idempotency
                    ? { 'Idempotency-Key': randomUUID() }
                    : {}),
            },
        });
    async function signup(label: string) {
        const response = await request('/auth/sign-up', {
            method: 'POST',
            body: {
                email: `${label}-${randomUUID()}@example.test`,
                password: 'A safe sentence journey password 47!',
            },
        });
        expect(response.status).toBe(202);
        const flowId = SignUpResponseSchema.parse(await response.json())
            .verification.flowId;
        const verified = await request('/auth/email-verification/verify', {
            method: 'POST',
            body: { code: '0000', flowId },
        });
        expect(verified.status).toBe(200);
        const parsed = AuthenticationSuccessResponseSchema.parse(
            await verified.json(),
        );
        return { token: parsed.accessToken, userId: parsed.user.id };
    }
    async function configure(ownerId: string) {
        const model = textAiModelCatalog[0]!;
        const revision = randomUUID();
        const now = new Date();
        const db = authentication.productDependencies.database;
        await db.insert(dictionaryAiConfigurationRevisionsTable).values({
            id: revision,
            createdByUserId: ownerId,
            version: 1,
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
        await db
            .insert(dictionaryAiConfigurationTable)
            .values({ id: 'global', activeRevisionId: revision, version: 1 });
        await db.insert(dictionaryAiWorkerObservationsTable).values({
            id: sentenceExecutionObservationId(
                'sentence-journey-worker',
                model.providerId,
                model.id,
            ),
            workerId: 'sentence-journey-worker',
            providerId: model.providerId,
            modelId: model.id,
            adapterRevision: model.adapterRevision,
            checkedAt: now,
            expiresAt: new Date(now.getTime() + 60_000),
            message: 'deterministic sentence worker',
            status: 'available',
            textAiSelectionRevision: 1,
            textAiSupportedFormats: [
                'sentence-generation:v1',
                'sentence-check:v1',
            ],
            textAiCapacityRevision: 1,
            learningExecutionRevision: 1,
            creditSettlementRevision: 1,
        });
    }
    async function credit(userId: string) {
        const db = authentication.productDependencies.database;
        const now = new Date();
        await db.insert(aiCreditAccountsTable).values({
            userId,
            mode: 'limited',
            createdAt: now,
            updatedAt: now,
        });
        await db.insert(aiCreditGrantsTable).values({
            id: randomUUID(),
            ownerId: userId,
            amount: 10_000_000n,
            source: 'purchase',
            sourceReference: `sentence-${randomUUID()}`,
            createdAt: now,
        });
        await db.insert(aiCreditHistoryTable).values({
            id: randomUUID(),
            ownerId: userId,
            amount: 10_000_000n,
            kind: 'grant',
            grantSource: 'purchase',
            createdAt: now,
        });
    }

    // @user-flow sentence-practice-backend/generate-check-reuse-private-and-shared
    it('generates, checks, reuses, and records a free personal shared reference review', async () => {
        const owner = await signup('sentence-owner');
        const reader = await signup('sentence-reader');
        await configure(owner.userId);
        await credit(owner.userId);
        const created = await request('/dictionaries', {
            method: 'POST',
            token: owner.token,
            idempotency: true,
            body: {
                name: 'Sentence journey',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        expect(created.status).toBe(201);
        const dictionary = DictionaryResponseSchema.parse(
            await created.json(),
        ).dictionary;
        const card = await request(`/dictionaries/${dictionary.id}/cards`, {
            method: 'POST',
            token: owner.token,
            body: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                values: { source: 'book', translation: 'livre' },
            },
        });
        const cardText = await card.text();
        expect(card.status, cardText).toBe(201);
        const cardPayload = JSON.parse(cardText) as {
            dictionaryVersion: number;
        };
        const shared = await request(
            `/dictionaries/${dictionary.id}/share-key/rotate`,
            {
                method: 'POST',
                token: owner.token,
                body: {
                    expectedDictionaryVersion: cardPayload.dictionaryVersion,
                },
            },
        );
        expect(shared.status).toBe(200);
        const capability = (
            (await shared.json()) as {
                capability: { shareId: string; shareKey: string };
            }
        ).capability;
        const base = `/learning/dictionaries/${dictionary.id}/sentences`;
        const operationId = randomUUID();
        const sessionId = randomUUID();
        const next = await request(`${base}/next`, {
            method: 'POST',
            token: owner.token,
            body: {
                operationId,
                sessionId,
                direction: 'source-to-target',
                mode: 'new-only',
                scope: { type: 'all' },
                visitedExerciseIds: [],
            },
        });
        expect(next.status).toBe(202);
        const admitted = SentenceNextResponseSchema.parse(await next.json());
        expect(admitted.kind).toBe('job');
        if (admitted.kind !== 'job') throw new Error('Expected generation job');
        const provider = new DeterministicSentenceAiProvider({
            generate(input) {
                providerCalls += 1;
                const target = input.candidates.find(
                    (v) => v.entryId === input.priorityEntryId,
                )!;
                return {
                    sourceText: `${target.sourceText} is useful.`,
                    referenceTranslation: `${target.targetText} est utile.`,
                    segments: [
                        { text: target.sourceText, entryId: target.entryId },
                        { text: ' is useful.', entryId: null },
                    ],
                    targets: [
                        {
                            entryId: target.entryId,
                            normalizedHint: target.targetText,
                            hintForm: 'lemma',
                        },
                    ],
                };
            },
            check(input) {
                providerCalls += 1;
                return {
                    proposedPercentage: 100,
                    meaning: 'correct',
                    grammar: 'correct',
                    targets: input.targets.map((target) => ({
                        entryId: target.entryId,
                        status: 'used' as const,
                        explanation: 'Used.',
                    })),
                    issues: [],
                    improvedTranslation: input.answer,
                    explanation: 'Correct.',
                };
            },
        });
        const worker = createSentenceWorkerComposition({
            database: authentication.productDependencies.database,
            provider,
            clock: authentication.productDependencies.clock,
            workerId: 'sentence-journey-worker',
            leaseMs: 10_000,
            heartbeatMs: 100,
            timeoutMs: 5_000,
            globalConcurrency: 2,
            learnerConcurrency: 1,
            maxAttempts: 1,
            retryDelayMs: 1,
        });
        expect(
            await worker.worker.processNext(new AbortController().signal),
        ).toBe(true);
        const completed = await request(`${base}/jobs/${admitted.job.id}`, {
            token: owner.token,
        });
        expect(completed.status).toBe(200);
        const generation = SentenceJobSchema.parse(await completed.json());
        expect(generation.result?.kind).toBe('exercise');
        if (generation.result?.kind !== 'exercise')
            throw new Error('Expected exercise');
        const exercise = generation.result.exercise;
        expect(JSON.stringify(exercise)).not.toContain('referenceTranslation');
        const replay = await request(`${base}/next`, {
            method: 'POST',
            token: owner.token,
            body: {
                operationId,
                sessionId,
                direction: 'source-to-target',
                mode: 'new-only',
                scope: { type: 'all' },
                visitedExerciseIds: [],
            },
        });
        expect(replay.status).toBe(202);
        expect(
            (
                SentenceNextResponseSchema.parse(await replay.json()) as {
                    job: { id: string };
                }
            ).job.id,
        ).toBe(admitted.job.id);
        const check = await request(`${base}/exercises/${exercise.id}/checks`, {
            method: 'POST',
            token: owner.token,
            body: {
                operationId: randomUUID(),
                sessionId,
                answer: 'Livre est utile.',
                explanationLanguage: 'en',
                revealedHintIds: [exercise.hints[0]!.id],
            },
        });
        expect(check.status).toBe(202);
        const checkJob = SentenceJobSchema.parse(await check.json());
        expect(
            await worker.worker.processNext(new AbortController().signal),
        ).toBe(true);
        const checked = await request(`${base}/jobs/${checkJob.id}`, {
            token: owner.token,
        });
        const checkedJob = SentenceJobSchema.parse(await checked.json());
        expect(checkedJob.result?.kind).toBe('attempt');
        expect(
            checkedJob.result?.kind === 'attempt' &&
                checkedJob.result.attempt.feedback.rating,
        ).toBe('perfect');
        expect(
            checkedJob.result?.kind === 'attempt' &&
                checkedJob.result.attempt.referenceRevealed,
        ).toBe(false);
        const sharedBase = `/learning/shared-dictionaries/${capability.shareId}/sentences`;
        const counts = async () => {
            const database = createTestPostgresClient();
            try {
                const [row] = await database<
                    [{ jobs: number; reservations: number }]
                >`
            select
                (select count(*)::int from sentence_ai_jobs) as jobs,
                (select count(*)::int from ai_credit_reservations) as reservations
        `;
                return row!;
            } finally {
                await database.end();
            }
        };
        const beforeReveal = await counts();
        process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED = 'false';
        const revealBody = {
            operationId: randomUUID(),
            sessionId: randomUUID(),
        };
        const reveal = await request(
            `${sharedBase}/exercises/${exercise.id}/reference-answer`,
            {
                method: 'POST',
                token: reader.token,
                shareKey: capability.shareKey,
                body: revealBody,
            },
        );
        expect(reveal.status).toBe(200);
        const review = (await reveal.json()) as {
            review: { id: string; referenceTranslation: string };
        };
        expect(review.review.referenceTranslation).toBe('livre est utile.');
        const revealReplay = await request(
            `${sharedBase}/exercises/${exercise.id}/reference-answer`,
            {
                method: 'POST',
                token: reader.token,
                shareKey: capability.shareKey,
                body: revealBody,
            },
        );
        expect(revealReplay.status).toBe(200);
        expect(
            ((await revealReplay.json()) as { review: { id: string } }).review
                .id,
        ).toBe(review.review.id);
        expect(providerCalls).toBe(2);
        expect(await counts()).toEqual(beforeReveal);
        process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED = 'true';
        const ownerReviews = await request(`${base}/reviews`, {
            token: owner.token,
        });
        const readerReviews = await request(`${sharedBase}/reviews`, {
            token: reader.token,
            shareKey: capability.shareKey,
        });
        expect(
            ((await ownerReviews.json()) as { reviews: unknown[] }).reviews,
        ).toHaveLength(0);
        expect(
            ((await readerReviews.json()) as { reviews: unknown[] }).reviews,
        ).toHaveLength(1);
        const readerPrepared = await request(`${sharedBase}/prepare`, {
            method: 'POST',
            token: reader.token,
            shareKey: capability.shareKey,
            body: {
                direction: 'source-to-target',
                mode: 'saved-first',
                scope: { type: 'all' },
            },
        });
        expect(readerPrepared.status).toBe(200);
        expect(
            ((await readerPrepared.json()) as { savedUncheckedCount: number })
                .savedUncheckedCount,
        ).toBe(0);
        const readerProgress = await request(
            `${sharedBase}/progress?direction=source-to-target`,
            { token: reader.token, shareKey: capability.shareKey },
        );
        expect(readerProgress.status).toBe(200);
        expect(
            (await readerProgress.json()) as {
                manualReviewCount: number;
                completedCheckCount: number;
                usedCount: number;
            },
        ).toMatchObject({
            manualReviewCount: 1,
            completedCheckCount: 0,
            usedCount: 1,
        });
    }, 60_000);
});
