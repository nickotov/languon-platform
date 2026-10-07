import { randomUUID } from 'node:crypto';

// @user-flow-revision sentence-practice-backend sha256:bf3394d7a0503c39

import {
    AuthenticationSuccessResponseSchema,
    DictionaryResponseSchema,
    SentenceJobSchema,
    type SentenceExercise,
    SentenceNextResponseSchema,
    SignUpResponseSchema,
    SentencePreparationResponseSchema,
    SentencePreparationBatchesResponseSchema,
    SentenceLibraryListResponseSchema,
    SentenceLibraryDetailSchema,
} from '@languon/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../../src/app';
import {
    sentenceLanguageMatches,
    sentenceLanguageScript,
    sentenceLetterSqlRange,
} from '../../../../src/modules/learning/domain/sentence-language';
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
    let sentences: ReturnType<typeof createSentenceComposition>;

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
        const environment = loadEnvironment({
            APP_ENV: 'test',
            NODE_ENV: 'test',
            AUTH_ALLOWED_ORIGINS: origin,
            AUTH_CODE_HMAC_SECRET:
                'sentence-practice-journey-code-secret-forty-bytes',
            AUTH_JWT_SECRET: 'sentence-practice-journey-jwt-secret-forty-bytes',
            DICTIONARY_HMAC_SECRET: secret,
            AUTH_WEBAUTHN_RP_ID: 'localhost',
            AUTH_REDIS_NAMESPACE: namespace,
            DATABASE_URL: getTestDatabaseUrl(),
            REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
        });
        authentication = await createAuthenticationComposition(environment);
        const dependencies = {
            ...authentication.productDependencies,
            dictionaryHmacSecret: secret,
            policy: authentication.options.policy,
        };
        sentences = createSentenceComposition({
            ...dependencies,
            enabled: environment.LEARNING_SENTENCES_ENABLED,
            admission: { generationFormat: 'sentence-generation:v2' },
        });
        app = createApp({
            authentication: authentication.options,
            dictionaries: createDictionaryComposition(dependencies).routes,
            sentenceLearning: sentences.routes,
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
                'sentence-generation:v2',
                'sentence-check:v1',
                'sentence-preparation:v1',
                'sentence-preparation:v2',
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
        const parityDatabase = createTestPostgresClient();
        try {
            for (const [text, language, otherLanguage] of [
                ['Hello ١٢٣٤٥٦', 'ar', 'en'],
                ['مرحبا ١٢٣٤٥٦', 'ar', 'en'],
                ['Āẞ ẮḀ', 'fr', 'ru'],
                ['Сегодня много работы.', 'ru', 'fr'],
                ['Hello १२३४५६', 'hi', 'en'],
                ['नमस्ते १२३४५६', 'hi', 'en'],
                ['Hello ְֱֲֳִֵֶַָ', 'he', 'en'],
                ['שלום ְֱֲֳִֵֶַָ', 'he', 'en'],
                ['Ἀλφα', 'el', 'ru'],
                ['家族', 'zh', 'ru'],
                ['こんにちは', 'ja', 'ru'],
                ['안녕하세요', 'ko', 'ru'],
                ['١٢٣४५६ 😀', 'ar', 'en'],
                ['วันนี้ฉันอ่านหนังสือ', 'th', 'en'],
                ['I read a book today.', 'th', 'en'],
                ['Ես այսօր գիրք եմ կարդում', 'hy', 'en'],
                ['I read a book today.', 'hy', 'en'],
            ] as const) {
                const expected = sentenceLanguageScript(language!)!;
                const other = sentenceLanguageScript(otherLanguage!)!;
                const [row] = await parityDatabase`
                    select ${text} COLLATE "C" !~ ${`[${sentenceLetterSqlRange()}]`}
                        or (char_length(regexp_replace(${text} COLLATE "C", ${`[^${expected.sqlRange}]`}, '', 'g')) > 0
                            and char_length(regexp_replace(${text} COLLATE "C", ${`[^${expected.sqlRange}]`}, '', 'g')) >=
                                char_length(regexp_replace(${text} COLLATE "C", ${`[^${other.sqlRange}]`}, '', 'g'))) as matches
                `;
                expect(
                    row!.matches,
                    `${language}/${otherLanguage} SQL/runtime parity`,
                ).toBe(
                    sentenceLanguageMatches(text!, language!, otherLanguage!),
                );
            }
        } finally {
            await parityDatabase.end();
        }
        const capabilities = await request('/learning/sentences/capabilities');
        expect(capabilities.status).toBe(200);
        expect(await capabilities.json()).toEqual({ sentencesEnabled: true });
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
        let reverseNextGeneration = false;
        const provider = new DeterministicSentenceAiProvider({
            generate(input) {
                providerCalls += 1;
                const target = input.candidates.find(
                    (v) => v.entryId === input.priorityEntryId,
                )!;
                const suffix =
                    input.sourceLanguage === 'ru'
                        ? ' сегодня пригодится.'
                        : ' is useful.';
                if (reverseNextGeneration) {
                    reverseNextGeneration = false;
                    return {
                        sourceText: `${target.targetText} est utile.`,
                        referenceTranslation: `${target.sourceText} сегодня пригодится.`,
                        segments: [
                            {
                                text: target.targetText,
                                entryId: target.entryId,
                                contextualHint: null,
                            },
                            {
                                text: ' est utile.',
                                entryId: null,
                                contextualHint: null,
                            },
                        ],
                        targets: [
                            {
                                entryId: target.entryId,
                                normalizedHint: target.targetText,
                                hintForm: 'lemma',
                            },
                        ],
                    };
                }
                return {
                    sourceText: `${target.sourceText}${suffix}`,
                    referenceTranslation: `${target.targetText} est utile.`,
                    segments: [
                        {
                            text: target.sourceText,
                            entryId: target.entryId,
                            contextualHint: null,
                        },
                        {
                            text: suffix,
                            entryId: null,
                            contextualHint: {
                                normalizedHint: 'utile',
                                hintForm: 'lemma',
                            },
                        },
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
            // Measured synthetic usage keeps multi-example rounds inside the real daily budget.
            provider: {
                async generate(call) {
                    return {
                        ...(await provider.generate(call)),
                        usage: { inputTokens: 10, outputTokens: 20 },
                    };
                },
                async check(call) {
                    return {
                        ...(await provider.check(call)),
                        usage: { inputTokens: 10, outputTokens: 20 },
                    };
                },
            },
            clock: authentication.productDependencies.clock,
            workerId: 'sentence-journey-worker',
            leaseMs: 10_000,
            heartbeatMs: 100,
            timeoutMs: 5_000,
            globalConcurrency: 2,
            learnerConcurrency: 1,
            maxAttempts: 3,
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
        expect(exercise.generationPolicyVersion).toBe(2);
        const contextualHint = exercise.hints.find(
            (hint) => hint.kind === 'contextual',
        );
        expect(contextualHint).toMatchObject({
            text: 'utile',
            kind: 'contextual',
        });
        expect(
            exercise.segments.some(
                (segment) =>
                    segment.contextualHintId === contextualHint!.id &&
                    segment.target === null,
            ),
        ).toBe(true);
        const publicationDatabase = createTestPostgresClient();
        try {
            const [stored] =
                await publicationDatabase`select generation_policy_version from sentence_exercises where id = ${exercise.id}`;
            expect(stored!.generation_policy_version).toBe(2);
            const targets =
                await publicationDatabase`select entry_id from sentence_exercise_entries where exercise_id = ${exercise.id}`;
            expect(targets).toHaveLength(1);
        } finally {
            await publicationDatabase.end();
        }

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
                revealedHintIds: exercise.hints.map((hint) => hint.id),
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
        const unavailableGeneration = await request(`${base}/next`, {
            method: 'POST',
            token: owner.token,
            body: {
                operationId: randomUUID(),
                sessionId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                scope: { type: 'all' },
                visitedExerciseIds: [],
            },
        });
        expect(unavailableGeneration.status).toBe(503);
        expect(await unavailableGeneration.json()).toMatchObject({
            error: { code: 'model_unavailable' },
        });
        expect(await counts()).toEqual(beforeReveal);
        expect(providerCalls).toBe(2);
        const exactReplaySetup = {
            direction: 'source-to-target',
            mode: 'review-only',
            scope: { type: 'all' },
            replayExerciseIds: [exercise.id],
        };
        const exactPrepared = await request(`${sharedBase}/prepare`, {
            method: 'POST',
            token: reader.token,
            shareKey: capability.shareKey,
            body: exactReplaySetup,
        });
        expect(exactPrepared.status).toBe(200);
        const invalidSequence = await request(`${sharedBase}/prepare`, {
            method: 'POST',
            token: reader.token,
            shareKey: capability.shareKey,
            body: {
                ...exactReplaySetup,
                replayExerciseIds: [exercise.id, randomUUID()],
            },
        });
        expect(invalidSequence.status).toBe(409);
        expect(await invalidSequence.json()).toMatchObject({
            error: { code: 'stale_content' },
        });
        const exactOperation = randomUUID();
        const exactReplayBody = {
            direction: 'source-to-target',
            mode: 'review-only',
            scope: { type: 'all' },
            operationId: exactOperation,
            sessionId: randomUUID(),
            visitedExerciseIds: [],
            replayExerciseId: exercise.id,
        };
        const exactReplayed = await request(`${sharedBase}/next`, {
            method: 'POST',
            token: reader.token,
            shareKey: capability.shareKey,
            body: exactReplayBody,
        });
        expect(exactReplayed.status).toBe(200);
        const exactContent = SentenceNextResponseSchema.parse(
            await exactReplayed.json(),
        );
        expect(
            exactContent.kind === 'exercise' && exactContent.exercise.id,
        ).toBe(exercise.id);
        expect(JSON.stringify(exactContent)).not.toContain(
            'referenceTranslation',
        );
        const conflictingReplay = await request(`${sharedBase}/next`, {
            method: 'POST',
            token: reader.token,
            shareKey: capability.shareKey,
            body: { ...exactReplayBody, replayExerciseId: randomUUID() },
        });
        expect(conflictingReplay.status).toBe(409);
        expect(await conflictingReplay.json()).toMatchObject({
            error: { code: 'idempotency_conflict' },
        });
        const paidModeReplay = await request(`${sharedBase}/next`, {
            method: 'POST',
            token: reader.token,
            shareKey: capability.shareKey,
            body: {
                ...exactReplayBody,
                operationId: randomUUID(),
                mode: 'new-only',
            },
        });
        expect(paidModeReplay.status).toBe(400);
        expect(await counts()).toEqual(beforeReveal);
        expect(providerCalls).toBe(2);
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
        expect(await readerPrepared.json()).toMatchObject({
            savedUncheckedCount: 0,
            savedReviewCount: 1,
        });
        const beforeReuse = await counts();
        for (const [reuseBase, learner, shareKey] of [
            [base, owner, undefined],
            [sharedBase, reader, capability.shareKey],
        ] as const) {
            const reused = await request(`${reuseBase}/next`, {
                method: 'POST',
                token: learner.token,
                ...(shareKey ? { shareKey } : {}),
                body: {
                    operationId: randomUUID(),
                    sessionId: randomUUID(),
                    direction: 'source-to-target',
                    mode: 'saved-first',
                    scope: { type: 'all' },
                    visitedExerciseIds: [],
                },
            });
            expect(reused.status).toBe(200);
            const reuse = SentenceNextResponseSchema.parse(await reused.json());
            expect(reuse.kind).toBe('exercise');
            if (reuse.kind !== 'exercise')
                throw new Error('Expected saved completed exercise');
            expect(reuse.exercise.id).toBe(exercise.id);
            expect(reuse.exercise.hints).toEqual(exercise.hints);
        }
        expect(await counts()).toEqual(beforeReuse);
        expect(providerCalls).toBe(2);
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

        // A five-word round is bounded by appearances, not lifetime checks/reviews.
        const roundCreated = await request('/dictionaries', {
            method: 'POST',
            token: owner.token,
            idempotency: true,
            body: {
                name: 'Five word Russian to French round',
                sourceLanguage: 'ru',
                targetLanguage: 'fr',
            },
        });
        expect(roundCreated.status).toBe(201);
        const roundDictionary = DictionaryResponseSchema.parse(
            await roundCreated.json(),
        ).dictionary;
        let dictionaryVersion = roundDictionary.version;
        for (const [source, translation] of [
            ['книга', 'livre'],
            ['работа', 'travail'],
            ['дом', 'maison'],
            ['вода', 'eau'],
            ['друг', 'ami'],
        ]) {
            const added = await request(
                `/dictionaries/${roundDictionary.id}/cards`,
                {
                    method: 'POST',
                    token: owner.token,
                    body: {
                        expectedDictionaryVersion: dictionaryVersion,
                        expectedSettingsVersion:
                            roundDictionary.settings.version,
                        values: { source, translation },
                    },
                },
            );
            expect(added.status).toBe(201);
            dictionaryVersion = (
                (await added.json()) as { dictionaryVersion: number }
            ).dictionaryVersion;
        }
        const roundBase = `/learning/dictionaries/${roundDictionary.id}/sentences`;
        const roundSession = randomUUID();
        const visitedExerciseIds: string[] = [];
        const roundExercises: SentenceExercise[] = [];
        const nextRound = async (
            mode: 'saved-first' | 'new-only',
            sessionId: string,
            visited: string[],
        ) => {
            const response = await request(`${roundBase}/next`, {
                method: 'POST',
                token: owner.token,
                body: {
                    operationId: randomUUID(),
                    sessionId,
                    direction: 'source-to-target',
                    mode,
                    scope: { type: 'all' },
                    visitedExerciseIds: visited,
                },
            });
            expect([200, 202]).toContain(response.status);
            return SentenceNextResponseSchema.parse(await response.json());
        };
        const finishGeneration = async (jobId: string) => {
            expect(
                await worker.worker.processNext(new AbortController().signal),
            ).toBe(true);
            const response = await request(`${roundBase}/jobs/${jobId}`, {
                token: owner.token,
            });
            expect(response.status).toBe(200);
            return SentenceJobSchema.parse(await response.json());
        };
        reverseNextGeneration = true;
        for (let index = 0; index < 5; index += 1) {
            const next = await nextRound(
                'new-only',
                roundSession,
                visitedExerciseIds,
            );
            expect(next.kind).toBe('job');
            if (next.kind !== 'job')
                throw new Error('Expected uncovered word generation');
            let completedRound = await finishGeneration(next.job.id);
            if (index === 0) {
                expect(completedRound.state).toBe('queued');
                expect(completedRound.attemptCount).toBe(1);
                expect(completedRound.result).toBeNull();
                // Retry retains the admitted job, with exactly one separately accounted provider attempt.
                const retryCounts = await counts();
                await new Promise((resolve) => setTimeout(resolve, 5));
                completedRound = await finishGeneration(next.job.id);
                expect(await counts()).toEqual({
                    jobs: retryCounts.jobs,
                    reservations: retryCounts.reservations + 1,
                });
            }
            expect(completedRound.result?.kind).toBe('exercise');
            if (completedRound.result?.kind !== 'exercise')
                throw new Error('Expected valid Russian exercise');
            const roundExercise = completedRound.result.exercise;
            expect(roundExercise.sourceLanguage).toBe('ru');
            expect(roundExercise.targetLanguage).toBe('fr');
            expect(roundExercise.sourceText).toMatch(/\p{Script=Cyrillic}/u);
            visitedExerciseIds.push(roundExercise.id);
            roundExercises.push(roundExercise);
        }
        expect(
            new Set(
                roundExercises.flatMap((value) =>
                    value.segments.flatMap((segment) =>
                        segment.target ? [segment.target.entryId] : [],
                    ),
                ),
            ).size,
        ).toBe(5);
        const completedCounts = await counts();
        expect(
            await nextRound('new-only', roundSession, visitedExerciseIds),
        ).toEqual({ kind: 'empty', reason: 'review-exhausted' });
        expect(await counts()).toEqual(completedCounts);
        const reusedRoundIds: string[] = [];
        const reusedSession = randomUUID();
        for (let index = 0; index < 5; index += 1) {
            const saved = await nextRound(
                'saved-first',
                reusedSession,
                reusedRoundIds,
            );
            expect(saved.kind).toBe('exercise');
            if (saved.kind !== 'exercise')
                throw new Error('Expected existing saved example');
            expect(visitedExerciseIds).toContain(saved.exercise.id);
            reusedRoundIds.push(saved.exercise.id);
        }
        expect(
            await nextRound('saved-first', reusedSession, reusedRoundIds),
        ).toEqual({ kind: 'empty', reason: 'review-exhausted' });
        expect(await counts()).toEqual(completedCounts);
        // Large dictionaries use bounded 100-word rounds while lifetime progress stays complete.
        // Invented exercise identities cannot fabricate coverage of selected vocabulary.
        const largeFixtureDatabase = createTestPostgresClient();
        let largeFixtureEntryIds: string[];
        try {
            const seeded = await largeFixtureDatabase`
                insert into dictionary_cards (id, dictionary_id, authorship, normalized_source, sort_key, source, translation)
                select gen_random_uuid(), ${roundDictionary.id}::uuid, 'human', 'слово' || n::text, (select max(sort_key) from dictionary_cards where dictionary_id = ${roundDictionary.id}::uuid) + n, 'слово' || n::text, 'mot' || n::text
                from generate_series(1, 1001) as n
                returning id
            `;
            largeFixtureEntryIds = seeded.map((row) => row.id as string);
        } finally {
            await largeFixtureDatabase.end();
        }
        const largeScopeEntryIds = [
            ...new Set(
                roundExercises.flatMap((value) =>
                    value.segments.flatMap((segment) =>
                        segment.target ? [segment.target.entryId] : [],
                    ),
                ),
            ),
            ...largeFixtureEntryIds.slice(0, 95),
        ];
        expect(largeScopeEntryIds).toHaveLength(100);
        const unrelatedVisitedIds = Array.from({ length: 95 }, () =>
            randomUUID(),
        );
        const largeShared = await request(
            `/dictionaries/${roundDictionary.id}/share-key/rotate`,
            {
                method: 'POST',
                token: owner.token,
                body: { expectedDictionaryVersion: dictionaryVersion },
            },
        );
        expect(largeShared.status).toBe(200);
        const largeCapability = (
            (await largeShared.json()) as {
                capability: { shareId: string; shareKey: string };
            }
        ).capability;
        const largeSharedBase = `/learning/shared-dictionaries/${largeCapability.shareId}/sentences`;
        const largeSession = randomUUID();
        const largePayload = {
            operationId: randomUUID(),
            sessionId: largeSession,
            direction: 'source-to-target',
            mode: 'review-only',
            scope: { type: 'manual', entryIds: largeScopeEntryIds },
            visitedExerciseIds: unrelatedVisitedIds,
        };
        expect(Buffer.byteLength(JSON.stringify(largePayload))).toBeLessThan(
            32_000,
        );
        const largeUncovered = await request(`${largeSharedBase}/next`, {
            method: 'POST',
            token: reader.token,
            shareKey: largeCapability.shareKey,
            body: largePayload,
        });
        expect(largeUncovered.status).toBe(200);
        const largeSaved = SentenceNextResponseSchema.parse(
            await largeUncovered.json(),
        );
        expect(largeSaved.kind).toBe('exercise');
        if (largeSaved.kind !== 'exercise')
            throw new Error(
                'Unrelated visited IDs must not fabricate completed coverage',
            );
        expect(visitedExerciseIds).toContain(largeSaved.exercise.id);
        const largeCompleted = await request(`${largeSharedBase}/next`, {
            method: 'POST',
            token: reader.token,
            shareKey: largeCapability.shareKey,
            body: {
                ...largePayload,
                operationId: randomUUID(),
                visitedExerciseIds: [
                    ...unrelatedVisitedIds,
                    ...visitedExerciseIds,
                ],
            },
        });
        expect(largeCompleted.status).toBe(200);
        expect(
            SentenceNextResponseSchema.parse(await largeCompleted.json()),
        ).toEqual({ kind: 'empty', reason: 'review-exhausted' });
        expect(await counts()).toEqual(completedCounts);
        const cappedPrepare = await request(`${roundBase}/prepare`, {
            method: 'POST',
            token: owner.token,
            body: {
                direction: 'source-to-target',
                mode: 'saved-first',
                scope: { type: 'all' },
            },
        });
        expect(cappedPrepare.status).toBe(200);
        expect(await cappedPrepare.json()).toMatchObject({
            eligibleCount: 100,
            skippedCount: 0,
            savedReviewCount: 5,
        });
        const lifetimeProgress = await request(
            `${roundBase}/progress?direction=source-to-target`,
            { token: owner.token },
        );
        expect(lifetimeProgress.status).toBe(200);
        expect(await lifetimeProgress.json()).toMatchObject({
            eligibleCount: 1006,
            usedCount: 5,
            remainingCount: 1001,
        });
        const outsideEntryId = largeFixtureEntryIds.at(-1)!;
        const outsidePrepare = await request(`${largeSharedBase}/prepare`, {
            method: 'POST',
            token: reader.token,
            shareKey: largeCapability.shareKey,
            body: {
                direction: 'source-to-target',
                mode: 'review-only',
                scope: { type: 'manual', entryIds: [outsideEntryId] },
            },
        });
        expect(outsidePrepare.status).toBe(200);
        expect(await outsidePrepare.json()).toMatchObject({
            eligibleCount: 1,
            skippedCount: 0,
            savedReviewCount: 0,
        });
        for (const oversized of [
            {
                ...largePayload,
                operationId: randomUUID(),
                scope: {
                    type: 'manual',
                    entryIds: [...largeScopeEntryIds, outsideEntryId],
                },
            },
            {
                ...largePayload,
                operationId: randomUUID(),
                visitedExerciseIds: Array.from({ length: 101 }, () =>
                    randomUUID(),
                ),
            },
        ]) {
            const rejected = await request(`${largeSharedBase}/next`, {
                method: 'POST',
                token: reader.token,
                shareKey: largeCapability.shareKey,
                body: oversized,
            });
            expect(rejected.status).toBe(400);
            expect(await rejected.json()).toMatchObject({
                error: { code: 'invalid_request' },
            });
        }
        expect(await counts()).toEqual(completedCounts);
        const fresh = await nextRound('new-only', randomUUID(), []);
        expect(fresh.kind).toBe('job');
        if (fresh.kind !== 'job')
            throw new Error('Expected explicitly requested fresh generation');
        const freshCompleted = await finishGeneration(fresh.job.id);
        if (freshCompleted.result?.kind !== 'exercise')
            throw new Error('Expected fresh exercise');
        expect(visitedExerciseIds).not.toContain(
            freshCompleted.result.exercise.id,
        );

        // Keep corrupt historical rows, but never offer their reversed source text.
        const corruptId = freshCompleted.result.exercise.id;
        const database = createTestPostgresClient();
        try {
            await database`update sentence_exercises set public_content = jsonb_set(public_content, '{sourceText}', to_jsonb('Bonjour, ceci est français.'::text)) where id = ${corruptId}`;
            const prepared = await request(`${roundBase}/prepare`, {
                method: 'POST',
                token: owner.token,
                body: {
                    direction: 'source-to-target',
                    mode: 'saved-first',
                    scope: { type: 'all' },
                },
            });
            expect(prepared.status).toBe(200);
            expect(
                ((await prepared.json()) as { savedUncheckedCount: number })
                    .savedUncheckedCount,
            ).toBe(5);
            const validSaved = await nextRound('saved-first', randomUUID(), []);
            expect(validSaved.kind).toBe('exercise');
            if (validSaved.kind !== 'exercise')
                throw new Error('Expected uncorrupted saved example');
            expect(validSaved.exercise.id).not.toBe(corruptId);
            const retained =
                await database`select id from sentence_exercises where id = ${corruptId}`;
            expect(retained).toHaveLength(1);
            const movedExercise = roundExercises[0]!;
            const movedEntry = movedExercise.segments.find(
                (segment) => segment.target,
            )!.target!.entryId;
            await database`update dictionary_cards set sort_key = (select max(sort_key) + 1 from dictionary_cards where dictionary_id = ${roundDictionary.id}) where id = ${movedEntry}`;
            const replayCounts = await counts();
            const movedPrepared = await request(`${largeSharedBase}/prepare`, {
                method: 'POST',
                token: reader.token,
                shareKey: largeCapability.shareKey,
                body: {
                    direction: 'source-to-target',
                    mode: 'review-only',
                    scope: { type: 'all' },
                    replayExerciseIds: [movedExercise.id],
                },
            });
            expect(movedPrepared.status).toBe(200);
            expect(await movedPrepared.json()).toMatchObject({
                eligibleCount: 100,
                savedReviewCount: 4,
            });
            const movedReplay = await request(`${largeSharedBase}/next`, {
                method: 'POST',
                token: reader.token,
                shareKey: largeCapability.shareKey,
                body: {
                    operationId: randomUUID(),
                    sessionId: randomUUID(),
                    direction: 'source-to-target',
                    mode: 'review-only',
                    scope: { type: 'all' },
                    visitedExerciseIds: [],
                    replayExerciseId: movedExercise.id,
                },
            });
            expect(movedReplay.status).toBe(200);
            const movedResult = SentenceNextResponseSchema.parse(
                await movedReplay.json(),
            );
            expect(
                movedResult.kind === 'exercise' && movedResult.exercise.id,
            ).toBe(movedExercise.id);
            expect(await counts()).toEqual(replayCounts);
        } finally {
            await database.end();
        }
    }, 60_000);

    // @user-flow sentence-practice-backend/manage-saved-library-and-partial-preparation
    it('prepares without exposure, previews and personally archives saved content, then practices a frozen partial batch', async () => {
        // This runner owns its confirmed disposable schema; isolate this journey from exhausted wallets above.
        const database = createTestPostgresClient();
        await resetTestDatabase(database);
        await migrateTestDatabase(database);
        await database.end();
        const owner = await signup('library-owner');
        const reader = await signup('library-reader');
        await configure(owner.userId);
        await credit(owner.userId);
        const created = await request('/dictionaries', {
            method: 'POST',
            token: owner.token,
            idempotency: true,
            body: {
                name: 'Prepared library journey',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        expect(created.status).toBe(201);
        const dictionary = DictionaryResponseSchema.parse(
            await created.json(),
        ).dictionary;
        let dictionaryVersion = dictionary.version;
        for (const [source, translation] of [
            ['book', 'livre'],
            ['cat', 'chat'],
        ]) {
            const response = await request(
                `/dictionaries/${dictionary.id}/cards`,
                {
                    method: 'POST',
                    token: owner.token,
                    body: {
                        expectedDictionaryVersion: dictionaryVersion,
                        expectedSettingsVersion: dictionary.settings.version,
                        values: { source, translation },
                    },
                },
            );
            expect(response.status).toBe(201);
            dictionaryVersion = (
                (await response.json()) as { dictionaryVersion: number }
            ).dictionaryVersion;
        }
        const shared = await request(
            `/dictionaries/${dictionary.id}/share-key/rotate`,
            {
                method: 'POST',
                token: owner.token,
                body: { expectedDictionaryVersion: dictionaryVersion },
            },
        );
        expect(shared.status).toBe(200);
        const capability = (
            (await shared.json()) as {
                capability: { shareId: string; shareKey: string };
                dictionaryVersion: number;
            }
        ).capability;
        const base = `/learning/dictionaries/${dictionary.id}/sentences`;
        const sharedBase = `/learning/shared-dictionaries/${capability.shareId}/sentences`;
        const startBody = {
            operationId: randomUUID(),
            direction: 'source-to-target',
            mode: 'new-only',
            initialRoundScope: { type: 'all' },
        };
        const started = await request(`${base}/preparations`, {
            method: 'POST',
            token: owner.token,
            body: startBody,
        });
        expect(started.status).toBe(200);
        const preparationId = SentencePreparationResponseSchema.parse(
            await started.json(),
        ).preparation.id;
        const replay = await request(`${base}/preparations`, {
            method: 'POST',
            token: owner.token,
            body: startBody,
        });
        expect(
            SentencePreparationResponseSchema.parse(await replay.json())
                .preparation.id,
        ).toBe(preparationId);
        const listedBatches = await request(
            `${base}/preparations/${preparationId}/batches?offset=0&limit=1`,
            { token: owner.token },
        );
        expect(listedBatches.status).toBe(200);
        const batchPage = SentencePreparationBatchesResponseSchema.parse(
            await listedBatches.json(),
        );
        expect(batchPage.items).toHaveLength(1);
        expect(batchPage.nextOffset).toBeNull();
        expect(
            (
                await request(
                    `${base}/preparations/${preparationId}/batches?limit=26`,
                    { token: owner.token },
                )
            ).status,
        ).toBe(400);
        const tick = () =>
            sentences.preparation.tick({
                now: new Date(),
                signal: new AbortController().signal,
            });
        expect(await tick()).toBe(true);
        let calls = 0;
        const fixture = new DeterministicSentenceAiProvider({
            check() {
                throw new Error('Preparation must not submit AI checks');
            },
            generate(input) {
                calls += 1;
                const target = input.candidates.find(
                    (item) => item.entryId === input.priorityEntryId,
                )!;
                return {
                    sourceText: `${target.sourceText} is useful.`,
                    referenceTranslation: `${target.targetText} est utile.`,
                    segments: [
                        {
                            text: target.sourceText,
                            entryId: target.entryId,
                            contextualHint: null,
                        },
                        {
                            text: ' is useful.',
                            entryId: null,
                            contextualHint: {
                                normalizedHint: 'utile',
                                hintForm: 'lemma',
                            },
                        },
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
        });
        const worker = createSentenceWorkerComposition({
            database: authentication.productDependencies.database,
            provider: {
                async generate(input) {
                    return {
                        ...(await fixture.generate(input)),
                        usage: { inputTokens: 10, outputTokens: 20 },
                    };
                },
                check: (input) => fixture.check(input),
            },
            supportedFormats: [
                'sentence-preparation:v1',
                'sentence-preparation:v2',
            ],
            clock: authentication.productDependencies.clock,
            workerId: 'sentence-journey-worker',
            leaseMs: 10_000,
            heartbeatMs: 100,
            timeoutMs: 5_000,
            globalConcurrency: 2,
            learnerConcurrency: 1,
            maxAttempts: 3,
            retryDelayMs: 1,
        });
        expect(
            await worker.worker.processNext(new AbortController().signal),
        ).toBe(true);
        expect(await tick()).toBe(true);
        const paused = await request(
            `${base}/preparations/${preparationId}/commands`,
            {
                method: 'POST',
                token: owner.token,
                body: { operationId: randomUUID(), action: 'stop' },
            },
        );
        expect(paused.status).toBe(200);
        const preparation = SentencePreparationResponseSchema.parse(
            await paused.json(),
        ).preparation;
        expect(preparation).toMatchObject({
            state: 'paused',
            preparedCount: 1,
            eligibleCount: 2,
        });
        expect(preparation.initialBatch?.state).toBe('partial');
        const progress = async () =>
            (await (
                await request(`${base}/progress?direction=source-to-target`, {
                    token: owner.token,
                })
            ).json()) as {
                usedCount: number;
                completedCheckCount: number;
                manualReviewCount: number;
            };
        expect(await progress()).toMatchObject({
            usedCount: 0,
            completedCheckCount: 0,
            manualReviewCount: 0,
        });
        const library = SentenceLibraryListResponseSchema.parse(
            await (
                await request(`${base}/library`, { token: owner.token })
            ).json(),
        );
        expect(library.items).toHaveLength(1);
        const item = library.items[0]!;
        const detail = SentenceLibraryDetailSchema.parse(
            await (
                await request(`${base}/library/${item.exerciseId}`, {
                    token: owner.token,
                })
            ).json(),
        );
        expect(detail.referenceTranslation).toContain('est utile');
        expect(await progress()).toMatchObject({
            usedCount: 0,
            completedCheckCount: 0,
            manualReviewCount: 0,
        });
        const archived = await request(`${base}/library/mutations`, {
            method: 'POST',
            token: owner.token,
            body: {
                operationId: randomUUID(),
                operation: 'archive',
                selection: {
                    type: 'selected',
                    items: [
                        {
                            exerciseId: item.exerciseId,
                            expectedVersion: item.version,
                        },
                    ],
                },
            },
        });
        expect(archived.status).toBe(200);
        expect(
            SentenceLibraryListResponseSchema.parse(
                await (
                    await request(`${base}/library`, { token: owner.token })
                ).json(),
            ).items,
        ).toHaveLength(0);
        const readerLibrary = await request(`${sharedBase}/library`, {
            token: reader.token,
            shareKey: capability.shareKey,
        });
        expect(readerLibrary.status).toBe(200);
        expect(
            SentenceLibraryListResponseSchema.parse(await readerLibrary.json())
                .items,
        ).toHaveLength(1);
        const archivedLibrary = SentenceLibraryListResponseSchema.parse(
            await (
                await request(`${base}/library?personalArchive=archived`, {
                    token: owner.token,
                })
            ).json(),
        );
        const restored = await request(`${base}/library/mutations`, {
            method: 'POST',
            token: owner.token,
            body: {
                operationId: randomUUID(),
                operation: 'restore',
                selection: {
                    type: 'selected',
                    items: [
                        {
                            exerciseId: item.exerciseId,
                            expectedVersion: archivedLibrary.items[0]!.version,
                        },
                    ],
                },
            },
        });
        expect(restored.status).toBe(200);
        const practice = await request(`${base}/next`, {
            method: 'POST',
            token: owner.token,
            body: {
                operationId: randomUUID(),
                sessionId: randomUUID(),
                direction: 'source-to-target',
                mode: 'new-only',
                scope: { type: 'all' },
                preparedBatchId: preparation.initialBatch!.id,
                visitedExerciseIds: [],
            },
        });
        expect(practice.status).toBe(200);
        expect(
            SentenceNextResponseSchema.parse(await practice.json()),
        ).toMatchObject({
            kind: 'exercise',
            exercise: { id: item.exerciseId },
        });
        expect(calls).toBe(1);
        expect((await progress()).usedCount).toBe(1);
        const readerPreparation = await request(`${sharedBase}/preparations`, {
            method: 'POST',
            token: reader.token,
            shareKey: capability.shareKey,
            body: {
                operationId: randomUUID(),
                direction: 'source-to-target',
                mode: 'review-only',
                initialRoundScope: { type: 'all' },
            },
        });
        expect(readerPreparation.status).toBe(200);
        const readerPreparationId = SentencePreparationResponseSchema.parse(
            await readerPreparation.json(),
        ).preparation.id;
        const dictionaryNow = DictionaryResponseSchema.parse(
            await (
                await request(`/dictionaries/${dictionary.id}`, {
                    token: owner.token,
                })
            ).json(),
        ).dictionary;
        expect(
            (
                await request(
                    `/dictionaries/${dictionary.id}/share-key/rotate`,
                    {
                        method: 'POST',
                        token: owner.token,
                        body: {
                            expectedDictionaryVersion: dictionaryNow.version,
                        },
                    },
                )
            ).status,
        ).toBe(200);
        expect(
            (
                await request(`${sharedBase}/library/${item.exerciseId}`, {
                    token: reader.token,
                    shareKey: capability.shareKey,
                })
            ).status,
        ).toBe(404);
        expect(
            (
                await request(
                    `${sharedBase}/preparations/${readerPreparationId}`,
                    { token: reader.token, shareKey: capability.shareKey },
                )
            ).status,
        ).toBe(404);
    }, 60_000);
});
